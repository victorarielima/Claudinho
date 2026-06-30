import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  listarAds,
  criarAd,
  buscarBrand,
  type FiltrosAd,
  type StatusAd,
  type TipoAd,
  type CriarAdInput,
} from "@/lib/db";
import { normalizarPlacementImagem } from "@/lib/ad-media";
import { appendAnunciosExportados, linhaExportacaoDeAd } from "@/lib/sheets";

function ehUrlHttp(valor: unknown): valor is string {
  return typeof valor === "string" && /^https?:\/\//i.test(valor.trim());
}

type AssetNormalizado = {
  placement: string;
  asset_url: string;
  asset_type: "image" | "video";
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const filtros: FiltrosAd = {};
  if (searchParams.get("brand_id")) filtros.brand_id = searchParams.get("brand_id")!;
  if (searchParams.get("status")) filtros.status = searchParams.get("status") as StatusAd;
  if (searchParams.get("type")) filtros.type = searchParams.get("type") as TipoAd;
  if (searchParams.get("busca")) filtros.busca = searchParams.get("busca")!;
  if (searchParams.get("campaign_name")) filtros.campaign_name = searchParams.get("campaign_name")!;
  if (searchParams.get("limit")) filtros.limit = parseInt(searchParams.get("limit")!);
  if (searchParams.get("offset")) filtros.offset = parseInt(searchParams.get("offset")!);

  try {
    const { ads, total } = await listarAds(filtros);
    return NextResponse.json({ data: ads, total });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const assetsNormalizados: AssetNormalizado[] = Array.isArray(body.assets)
      ? body.assets
          .filter((asset: unknown): asset is Record<string, unknown> => Boolean(asset) && typeof asset === "object")
          .map((asset: Record<string, unknown>) => {
            const assetUrl = typeof asset.asset_url === "string" ? asset.asset_url.trim() : "";
            const placementBruto = typeof asset.placement === "string" ? asset.placement : "";

            return {
              placement:
                body.type === "image"
                  ? normalizarPlacementImagem(placementBruto, assetUrl)
                  : "video_principal",
              asset_url: assetUrl,
              asset_type: asset.asset_type === "image" ? "image" as const : "video" as const,
            };
          })
          .filter((asset: { asset_url: string }) => asset.asset_url.length > 0)
      : [];

    // Validacoes basicas
    if (!body.brand_id || !body.ad_name || !body.campaign_name || !body.ad_set_name || !body.type) {
      return NextResponse.json(
        { erro: "Campos obrigatórios: brand_id, type, campaign_name, ad_set_name, ad_name" },
        { status: 400 }
      );
    }

    if (assetsNormalizados.some((asset: AssetNormalizado) => !ehUrlHttp(asset.asset_url))) {
      return NextResponse.json(
        { erro: "Todos os assets precisam usar URLs públicas iniciando com http(s)." },
        { status: 400 }
      );
    }

    if (body.type === "video" && assetsNormalizados.length === 0) {
      return NextResponse.json(
        { erro: "Ads de vídeo precisam de pelo menos 1 asset (URL do vídeo)" },
        { status: 400 }
      );
    }

    if (body.type === "image" && assetsNormalizados.length < 1) {
      return NextResponse.json(
        { erro: "Ads de imagem precisam de pelo menos 1 asset (URL da imagem)" },
        { status: 400 }
      );
    }

    if (body.type === "video" && assetsNormalizados.some((asset: AssetNormalizado) => asset.asset_type !== "video")) {
      return NextResponse.json(
        { erro: "Ads de vídeo aceitam apenas assets de vídeo." },
        { status: 400 }
      );
    }

    if (body.type === "image" && assetsNormalizados.some((asset: AssetNormalizado) => asset.asset_type !== "image")) {
      return NextResponse.json(
        { erro: "Ads de imagem aceitam apenas assets de imagem." },
        { status: 400 }
      );
    }

    if (body.type === "image") {
      const placements = assetsNormalizados.map((asset: AssetNormalizado) => asset.placement);
      const duplicados = placements.filter((placement, index) => placements.indexOf(placement) !== index);
      if (duplicados.length > 0) {
        return NextResponse.json(
          { erro: `Há placements duplicados nas imagens: ${Array.from(new Set(duplicados)).join(", ")}.` },
          { status: 400 }
        );
      }
    }

    const input: CriarAdInput = {
      brand_id: body.brand_id,
      type: body.type,
      campaign_name: body.campaign_name?.trim(),
      campaign_id: body.campaign_id?.trim(),
      ad_set_name: body.ad_set_name?.trim(),
      ad_set_id: body.ad_set_id?.trim(),
      ad_name: body.ad_name?.trim(),
      texto_principal: body.texto_principal?.trim(),
      titulo: body.titulo?.trim(),
      descricao: body.descricao?.trim(),
      cta: body.cta,
      link_campanha: body.link_campanha?.trim(),
      link_aux: body.link_aux?.trim(),
      assets: assetsNormalizados,
    };

    const ad = await criarAd(input, userId);

    // Exporta o anúncio para a planilha de acompanhamento (aba por marca).
    // Falha aqui não deve quebrar a criação — o anúncio já foi salvo.
    try {
      const brand = await buscarBrand(ad.brand_id);
      if (brand) {
        await appendAnunciosExportados(brand.name, [linhaExportacaoDeAd(ad)]);
      }
    } catch (e) {
      console.error("Falha ao exportar anúncio para a planilha de acompanhamento:", e);
    }

    return NextResponse.json({ data: ad }, { status: 201 });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
