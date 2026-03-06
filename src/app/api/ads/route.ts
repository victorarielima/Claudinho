import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  listarAds,
  criarAd,
  type FiltrosAd,
  type StatusAd,
  type TipoAd,
  type CriarAdInput,
} from "@/lib/db";

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

    // Validacoes basicas
    if (!body.brand_id || !body.ad_name || !body.campaign_name || !body.ad_set_name || !body.type) {
      return NextResponse.json(
        { erro: "Campos obrigatórios: brand_id, type, campaign_name, ad_set_name, ad_name" },
        { status: 400 }
      );
    }

    if (body.type === "video" && (!body.assets || body.assets.length === 0)) {
      return NextResponse.json(
        { erro: "Ads de vídeo precisam de pelo menos 1 asset (URL do vídeo)" },
        { status: 400 }
      );
    }

    if (body.type === "image" && (!body.assets || body.assets.length < 1)) {
      return NextResponse.json(
        { erro: "Ads de imagem precisam de pelo menos 1 asset (URL da imagem)" },
        { status: 400 }
      );
    }

    const input: CriarAdInput = {
      brand_id: body.brand_id,
      type: body.type,
      campaign_name: body.campaign_name,
      campaign_id: body.campaign_id,
      ad_set_name: body.ad_set_name,
      ad_set_id: body.ad_set_id,
      ad_name: body.ad_name,
      texto_principal: body.texto_principal,
      titulo: body.titulo,
      descricao: body.descricao,
      cta: body.cta,
      link_campanha: body.link_campanha,
      link_aux: body.link_aux,
      assets: body.assets ?? [],
    };

    const ad = await criarAd(input, userId);
    return NextResponse.json({ data: ad }, { status: 201 });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
