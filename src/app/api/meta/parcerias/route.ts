import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { buscarBrand } from "@/lib/db";
import { logger } from "@/lib/logger";
import { buscarParceriasAprovadas } from "@/lib/meta-criar";

/** Fallback de página por conta, igual ao usado no pipeline de criação. */
const PAGE_IDS_POR_CONTA: Record<string, string | undefined> = {
  [process.env.META_AD_ACCOUNT_EVINO ?? ""]: process.env.META_PAGE_ID_EVINO,
  [process.env.META_AD_ACCOUNT_GRANDCRU ?? ""]: process.env.META_PAGE_ID_GRANDCRU,
};

/**
 * Lista as parcerias (criadores) aprovadas para a marca — usado pelo seletor
 * de "vídeo de influencer" na criação em lote.
 *
 * GET /api/meta/parcerias?brandId=<uuid>
 */
export async function GET(request: NextRequest) {
  const startMs = Date.now();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    }

    const brandId = request.nextUrl.searchParams.get("brandId");
    if (!brandId) {
      return NextResponse.json({ erro: "brandId é obrigatório" }, { status: 400 });
    }

    const brand = await buscarBrand(brandId);
    if (!brand) {
      return NextResponse.json({ erro: `Marca '${brandId}' não encontrada` }, { status: 404 });
    }

    const pageId =
      brand.meta_page_id?.trim() || PAGE_IDS_POR_CONTA[brand.meta_account_id] || null;
    if (!pageId) {
      return NextResponse.json(
        { erro: `Page ID não configurado para a marca ${brand.name}` },
        { status: 400 }
      );
    }

    const parcerias = await buscarParceriasAprovadas(pageId);

    logger.info("Parcerias listadas", {
      fn: "GET /api/meta/parcerias",
      brandId,
      pageId,
      count: parcerias.length,
      elapsedMs: Date.now() - startMs,
    });

    return NextResponse.json({ parcerias });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    logger.error("Erro ao listar parcerias", {
      fn: "GET /api/meta/parcerias",
      error: mensagem,
      elapsedMs: Date.now() - startMs,
    });
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
