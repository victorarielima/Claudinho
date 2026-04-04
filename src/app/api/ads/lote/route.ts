import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { criarAd, type CriarAdInput } from "@/lib/db";

interface AnuncioItem {
  adName: string;
  titulo: string;
  textoPrincipal?: string;
  linkCampanha?: string;
  // Video flow (backward compat)
  driveUrl?: string;
  videoId?: string;
  thumbnailLink?: string;
  nomeArquivo?: string;
  // Image flow
  assets?: { placement: string; url: string; type: "image" | "video" }[];
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

    // Se não veio nome, buscar via ID na Meta API
    if (!body.campaignName && body.campaignId) {
      body.campaignName = body.campaignId;
    }
    if (!body.adSetName && body.adSetId) {
      body.adSetName = body.adSetId;
    }
    if (!body.campaignName || !body.adSetName) {
      return NextResponse.json(
        { erro: "campaignName/campaignId e adSetName/adSetId são obrigatórios" },
        { status: 400 }
      );
    }

    if (!body.anuncios || body.anuncios.length === 0) {
      return NextResponse.json(
        { erro: "É necessário ao menos um anúncio" },
        { status: 400 }
      );
    }

    const adType = body.type ?? "video";

    const promises = body.anuncios.map((item) => {
      let assets: { placement: string; asset_url: string; asset_type: "image" | "video" }[];

      if (item.assets && item.assets.length > 0) {
        assets = item.assets.map((a) => ({
          placement: a.placement,
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

      const input: CriarAdInput = {
        brand_id: body.brandId,
        type: adType,
        campaign_name: body.campaignName,
        campaign_id: body.campaignId,
        ad_set_name: body.adSetName,
        ad_set_id: body.adSetId,
        ad_name: item.adName,
        titulo: item.titulo,
        texto_principal: item.textoPrincipal || body.textoPrincipal,
        descricao: descricaoPadrao,
        cta: ctaPadrao,
        link_campanha: item.linkCampanha || body.linkCampanha,
        assets,
      };

      return criarAd(input, userId);
    });

    const results = await Promise.allSettled(promises);

    const detalhes = results.map((result, i) => {
      const adName = body.anuncios[i].adName;
      if (result.status === "fulfilled") {
        return { ad_name: adName, status: "criado" as const };
      }
      return {
        ad_name: adName,
        status: "erro" as const,
        error: result.reason instanceof Error ? result.reason.message : "Erro desconhecido",
      };
    });

    const criados = detalhes.filter((d) => d.status === "criado").length;
    const erros = detalhes.filter((d) => d.status === "erro").length;

    return NextResponse.json({ criados, erros, detalhes });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
