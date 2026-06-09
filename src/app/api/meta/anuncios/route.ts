import { NextRequest, NextResponse } from "next/server";
import {
  buscarPaginaAnunciosDoPeriodo,
  buscarResumoDoPeriodo,
  CONTAS_META,
  type PresetPeriodo,
  type AnuncioMeta,
  type ResumoMeta,
} from "@/lib/meta";
import { logger } from "@/lib/logger";

const resumoCache = new Map<string, { data: ResumoMeta; timestamp: number }>();
const paginaCache = new Map<string, { data: { items: AnuncioMeta[]; nextCursor: string | null; hasNextPage: boolean }; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

type Canal = "todos" | "ecommerce" | "clube";

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get("accountId");
  const datePreset = (searchParams.get("datePreset") ?? "last_30d") as PresetPeriodo;
  const canal = (searchParams.get("canal") ?? "todos") as Canal;
  const forcarAtualizacao = searchParams.get("fresh") === "1";
  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") ?? "25", 10) || 25, 1),
    100
  );
  const after = searchParams.get("after");

  logger.info("Request received for anuncios", {
    fn: "GET /api/meta/anuncios",
    accountId,
    datePreset,
    canal,
    limit,
    after,
    fresh: forcarAtualizacao,
  });

  if (!accountId) {
    return NextResponse.json(
      { erro: "accountId é obrigatório" },
      { status: 400 }
    );
  }

  const contaValida = CONTAS_META.some((c) => c.id === accountId);
  if (!contaValida) {
    return NextResponse.json(
      { erro: "accountId inválido" },
      { status: 400 }
    );
  }

  const resumoCacheKey = `${accountId}:${datePreset}:${canal}:summary`;
  const paginaCacheKey = `${accountId}:${datePreset}:${canal}:${limit}:${after ?? ""}`;

  let resumo: ResumoMeta;
  let anuncios: AnuncioMeta[];
  let nextCursor: string | null;
  let hasNextPage: boolean;
  let fromCache = false;
  let timestamp = Date.now();

  const resumoCached = !forcarAtualizacao ? resumoCache.get(resumoCacheKey) : undefined;
  const paginaCached = !forcarAtualizacao ? paginaCache.get(paginaCacheKey) : undefined;
  const resumoValido = Boolean(resumoCached && Date.now() - resumoCached.timestamp < CACHE_TTL_MS);
  const paginaValida = Boolean(paginaCached && Date.now() - paginaCached.timestamp < CACHE_TTL_MS);

  if (resumoValido && paginaValida) {
    resumo = resumoCached!.data;
    anuncios = paginaCached!.data.items;
    nextCursor = paginaCached!.data.nextCursor;
    hasNextPage = paginaCached!.data.hasNextPage;
    fromCache = true;
    timestamp = Math.max(resumoCached!.timestamp, paginaCached!.timestamp);
  } else {
    const [resumoResp, paginaResp] = await Promise.all([
      buscarResumoComCache(accountId, datePreset, canal, resumoCacheKey, forcarAtualizacao),
      buscarPaginaComCache(accountId, datePreset, canal, limit, after, paginaCacheKey, forcarAtualizacao),
    ]);
    resumo = resumoResp.data;
    anuncios = paginaResp.data.items;
    nextCursor = paginaResp.data.nextCursor;
    hasNextPage = paginaResp.data.hasNextPage;
    timestamp = Math.max(resumoResp.timestamp, paginaResp.timestamp);
  }

  const elapsedMs = Date.now() - startMs;
  logger.info("Anuncios response ready", {
    fn: "GET /api/meta/anuncios",
    accountId,
    datePreset,
    canal,
    totalResult: anuncios.length,
    hasNextPage,
    fromCache,
    elapsedMs,
  });

  return NextResponse.json({
    data: anuncios,
    total: anuncios.length,
    resumo,
    canal,
    cache: fromCache,
    nextCursor,
    hasNextPage,
    limit,
    atualizadoEm: new Date(timestamp).toISOString(),
  });
}

async function buscarResumoComCache(
  accountId: string,
  datePreset: PresetPeriodo,
  canal: Canal,
  cacheKey: string,
  forcarAtualizacao: boolean
): Promise<{ data: ResumoMeta; timestamp: number }> {
  try {
    const cached = !forcarAtualizacao ? resumoCache.get(cacheKey) : undefined;
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached;

    let resumo: ResumoMeta;
    if (canal === "todos") {
      resumo = await buscarResumoDoPeriodo(accountId, datePreset);
    } else {
      resumo = await buscarResumoFiltrado(accountId, datePreset, canal);
      resumo.ctr = resumo.impressoes > 0 ? (resumo.cliques / resumo.impressoes) * 100 : 0;
      resumo.cpc = resumo.cliques > 0 ? resumo.investimento / resumo.cliques : 0;
    }

    const payload = { data: resumo, timestamp: Date.now() };
    resumoCache.set(cacheKey, payload);
    return payload;
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    logger.error("Failed to fetch resumo for cache", {
      fn: "buscarResumoComCache",
      accountId,
      datePreset,
      canal,
      error: mensagem,
    });
    throw new Error(mensagem);
  }
}

async function buscarResumoFiltrado(
  accountId: string,
  datePreset: PresetPeriodo,
  canal: Exclude<Canal, "todos">
): Promise<ResumoMeta> {
  const resumo: ResumoMeta = {
    investimento: 0,
    impressoes: 0,
    cliques: 0,
    alcance: 0,
    ctr: 0,
    cpc: 0,
  };

  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const pagina = await buscarPaginaAnunciosDoPeriodo(accountId, datePreset, {
      canal,
      limit: 100,
      after,
    });

    for (const anuncio of pagina.data) {
      const insight = anuncio.insights?.data?.[0];
      resumo.investimento += Number.parseFloat(insight?.spend ?? "0");
      resumo.impressoes += Number.parseInt(insight?.impressions ?? "0", 10);
      resumo.cliques += Number.parseInt(insight?.clicks ?? "0", 10);
      resumo.alcance += Number.parseInt(insight?.reach ?? "0", 10);
    }

    after = pagina.nextCursor;
    hasNextPage = pagina.hasNextPage && Boolean(after);
  }

  return resumo;
}

async function buscarPaginaComCache(
  accountId: string,
  datePreset: PresetPeriodo,
  canal: Canal,
  limit: number,
  after: string | null,
  cacheKey: string,
  forcarAtualizacao: boolean
): Promise<{ data: { items: AnuncioMeta[]; nextCursor: string | null; hasNextPage: boolean }; timestamp: number }> {
  try {
    const cached = !forcarAtualizacao ? paginaCache.get(cacheKey) : undefined;
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached;

    const pagina = await buscarPaginaAnunciosDoPeriodo(accountId, datePreset, {
      canal,
      limit,
      after,
    });

    const payload = {
      data: {
        items: pagina.data,
        nextCursor: pagina.nextCursor,
        hasNextPage: pagina.hasNextPage,
      },
      timestamp: Date.now(),
    };
    paginaCache.set(cacheKey, payload);
    return payload;
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    logger.error("Failed to fetch pagina for cache", {
      fn: "buscarPaginaComCache",
      accountId,
      datePreset,
      canal,
      limit,
      after,
      error: mensagem,
    });
    throw new Error(mensagem);
  }
}
