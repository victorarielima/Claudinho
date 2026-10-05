import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { buscarBrand } from "@/lib/db";
import { logger } from "@/lib/logger";
import { listarParcerias, solicitarPermissaoParceria } from "@/lib/meta-criar";

/** Fallback de página por conta, igual ao usado no pipeline de criação. */
const PAGE_IDS_POR_CONTA: Record<string, string | undefined> = {
  [process.env.META_AD_ACCOUNT_EVINO ?? ""]: process.env.META_PAGE_ID_EVINO,
  [process.env.META_AD_ACCOUNT_GRANDCRU ?? ""]: process.env.META_PAGE_ID_GRANDCRU,
};

/** Resolve a página da marca ou devolve a resposta de erro pronta. */
async function resolverPagina(
  brandId: string | null
): Promise<{ pageId: string } | { erro: NextResponse }> {
  if (!brandId) {
    return { erro: NextResponse.json({ erro: "brandId é obrigatório" }, { status: 400 }) };
  }
  const brand = await buscarBrand(brandId);
  if (!brand) {
    return {
      erro: NextResponse.json({ erro: `Marca '${brandId}' não encontrada` }, { status: 404 }),
    };
  }
  const pageId =
    brand.meta_page_id?.trim() || PAGE_IDS_POR_CONTA[brand.meta_account_id] || null;
  if (!pageId) {
    return {
      erro: NextResponse.json(
        { erro: `Page ID não configurado para a marca ${brand.name}` },
        { status: 400 }
      ),
    };
  }
  return { pageId };
}

/**
 * Lista os criadores para o seletor de "vídeo de influencer" — quem já fez
 * parceria com a marca + quem tem permissão de anúncio, com o status dela.
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
    const pagina = await resolverPagina(brandId);
    if ("erro" in pagina) return pagina.erro;

    const { parcerias, avisos } = await listarParcerias(pagina.pageId);

    logger.info("Parcerias listadas", {
      fn: "GET /api/meta/parcerias",
      brandId,
      pageId: pagina.pageId,
      count: parcerias.length,
      elapsedMs: Date.now() - startMs,
    });

    return NextResponse.json({ parcerias, avisos });
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

/**
 * Envia ao criador o pedido de permissão de anúncio de parceria. Ele aceita
 * no app do Instagram (uma vez; vale para os próximos anúncios).
 *
 * POST /api/meta/parcerias  { brandId, creatorId }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    }

    let body: { brandId?: string; creatorId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
    }
    const creatorId = body.creatorId?.trim();
    if (!creatorId || !/^\d+$/.test(creatorId)) {
      return NextResponse.json({ erro: "creatorId inválido" }, { status: 400 });
    }

    const pagina = await resolverPagina(body.brandId ?? null);
    if ("erro" in pagina) return pagina.erro;

    await solicitarPermissaoParceria(pagina.pageId, creatorId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    logger.error("Erro ao solicitar permissão de parceria", {
      fn: "POST /api/meta/parcerias",
      error: mensagem,
    });
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
