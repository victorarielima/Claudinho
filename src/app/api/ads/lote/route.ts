import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { criarAd, buscarBrand, type CriarAdInput, type Ad } from "@/lib/db";
import { normalizarPlacementImagem } from "@/lib/ad-media";
import { appendAnunciosExportados, linhaExportacaoDeAd } from "@/lib/sheets";

interface AnuncioItem {
  adName: string;
  titulo: string;
  textoPrincipal?: string;
  linkCampanha?: string;
  linkAnuncioOverride?: string;
  // Video flow (backward compat)
  driveUrl?: string;
  videoId?: string;
  thumbnailLink?: string;
  nomeArquivo?: string;
  // Image flow
  assets?: { placement: string; url: string; type: "image" | "video" }[];
}

interface Destino {
  campaignName: string;
  campaignId: string;
  adSetName: string;
  adSetId: string;
}

interface LoteBody {
  brandId: string;
  campaignName: string;
  campaignId: string;
  adSetName: string;
  adSetId: string;
  textoPrincipal: string;
  descricao: string;
  cta: string;
  linkCampanha: string;
  type?: "video" | "image";
  anuncios: AnuncioItem[];
  /**
   * Multi-destino: cada anúncio é criado uma vez por destino (fan-out),
   * permitindo subir o mesmo criativo para campanhas/ad sets diferentes
   * numa única importação. Quando ausente, cai no destino único legado
   * (campos campaign/adSet no nível do body).
   */
  destinos?: Destino[];
}

/** Normaliza um destino aplicando o fallback nome←id. Retorna null se inválido. */
function normalizarDestino(d: Partial<Destino>): Destino | null {
  const campaignId = d.campaignId ?? "";
  const adSetId = d.adSetId ?? "";
  const campaignName = (d.campaignName || campaignId).trim();
  const adSetName = (d.adSetName || adSetId).trim();
  if (!campaignName || !adSetName) return null;
  return { campaignName, campaignId, adSetName, adSetId };
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    }

    const body: LoteBody = await request.json();
    const descricaoPadrao = body.descricao?.trim() || "Beba com Moderação!";
    const ctaPadrao = body.cta?.trim() || "SHOP_NOW";

    if (!body.brandId) {
      return NextResponse.json(
        { erro: "brandId é obrigatório" },
        { status: 400 }
      );
    }

    // Resolver destinos: multi-destino (fan-out) ou destino único legado.
    let destinos: Destino[];
    if (body.destinos && body.destinos.length > 0) {
      destinos = body.destinos.map(normalizarDestino).filter((d): d is Destino => d !== null);
      if (destinos.length === 0) {
        return NextResponse.json(
          { erro: "Cada destino precisa de campanha e ad set válidos" },
          { status: 400 }
        );
      }
    } else {
      const unico = normalizarDestino({
        campaignName: body.campaignName,
        campaignId: body.campaignId,
        adSetName: body.adSetName,
        adSetId: body.adSetId,
      });
      if (!unico) {
        return NextResponse.json(
          { erro: "campaignName/campaignId e adSetName/adSetId são obrigatórios" },
          { status: 400 }
        );
      }
      destinos = [unico];
    }

    if (!body.anuncios || body.anuncios.length === 0) {
      return NextResponse.json(
        { erro: "É necessário ao menos um anúncio" },
        { status: 400 }
      );
    }

    const adType = body.type ?? "video";

    // Fan-out: cada anúncio é criado uma vez por destino.
    type Tarefa = { adName: string; destino: Destino; promise: Promise<unknown> };
    const tarefas: Tarefa[] = [];

    for (const item of body.anuncios) {
      let assets: { placement: string; asset_url: string; asset_type: "image" | "video" }[];

      if (item.assets && item.assets.length > 0) {
        assets = item.assets.map((a) => ({
          placement: a.type === "image"
            ? normalizarPlacementImagem(a.placement, a.url)
            : a.placement,
          asset_url: a.url,
          asset_type: a.type,
        }));
      } else {
        assets = [
          {
            placement: "video_principal",
            asset_url: item.driveUrl ?? "",
            asset_type: "video" as const,
          },
        ];
      }

      for (const destino of destinos) {
        const input: CriarAdInput = {
          brand_id: body.brandId,
          type: adType,
          campaign_name: destino.campaignName,
          campaign_id: destino.campaignId,
          ad_set_name: destino.adSetName,
          ad_set_id: destino.adSetId,
          ad_name: item.adName,
          titulo: item.titulo,
          texto_principal: item.textoPrincipal || body.textoPrincipal,
          descricao: descricaoPadrao,
          cta: ctaPadrao,
          link_campanha: item.linkCampanha || body.linkCampanha,
          link_anuncio_override: item.linkAnuncioOverride,
          assets,
        };

        tarefas.push({ adName: item.adName, destino, promise: criarAd(input, userId) });
      }
    }

    const results = await Promise.allSettled(tarefas.map((t) => t.promise));

    const detalhes = results.map((result, i) => {
      const { adName, destino } = tarefas[i];
      if (result.status === "fulfilled") {
        return { ad_name: adName, ad_set_name: destino.adSetName, status: "criado" as const };
      }
      return {
        ad_name: adName,
        ad_set_name: destino.adSetName,
        status: "erro" as const,
        error: result.reason instanceof Error ? result.reason.message : "Erro desconhecido",
      };
    });

    const criados = detalhes.filter((d) => d.status === "criado").length;
    const erros = detalhes.filter((d) => d.status === "erro").length;

    // Exporta os anúncios criados para a planilha de acompanhamento.
    // Falha aqui não deve quebrar a criação — o anúncio já foi salvo.
    try {
      const adsCriados = results
        .filter((r): r is PromiseFulfilledResult<Ad> => r.status === "fulfilled")
        .map((r) => r.value);

      if (adsCriados.length > 0) {
        const brand = await buscarBrand(body.brandId);
        if (brand) {
          await appendAnunciosExportados(brand.name, adsCriados.map(linhaExportacaoDeAd));
        }
      }
    } catch (e) {
      console.error("Falha ao exportar anúncios para a planilha de acompanhamento:", e);
    }

    return NextResponse.json({ criados, erros, detalhes, destinos: destinos.length });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
