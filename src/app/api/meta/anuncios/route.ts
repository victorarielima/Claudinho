import { NextRequest, NextResponse } from "next/server";
import {
  buscarAnunciosAtivos,
  CONTAS_META,
  type PresetPeriodo,
  type AnuncioMeta,
} from "@/lib/meta";

// Cache em memória: chave = "accountId:datePreset", valor = { data, timestamp }
const cache = new Map<
  string,
  { data: AnuncioMeta[]; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

type Canal = "todos" | "ecommerce" | "clube";

function filtrarPorCanal(anuncios: AnuncioMeta[], canal: Canal): AnuncioMeta[] {
  if (canal === "todos") return anuncios;

  return anuncios.filter((a) => {
    const nomeCampanha = a.campaign?.name?.toLowerCase() ?? "";
    const ehClube = nomeCampanha.includes("clube");
    return canal === "clube" ? ehClube : !ehClube;
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get("accountId");
  const datePreset = (searchParams.get("datePreset") ?? "last_30d") as PresetPeriodo;
  const canal = (searchParams.get("canal") ?? "todos") as Canal;
  const forcarAtualizacao = searchParams.get("fresh") === "1";

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

  // Cache key não inclui canal — cacheamos todos e filtramos depois
  const cacheKey = `${accountId}:${datePreset}`;

  let anuncios: AnuncioMeta[];
  let fromCache = false;
  let timestamp: number;

  if (!forcarAtualizacao) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      anuncios = cached.data;
      fromCache = true;
      timestamp = cached.timestamp;
    } else {
      anuncios = await buscarAnunciosAtivosComCache(accountId, datePreset, cacheKey);
      fromCache = false;
      timestamp = Date.now();
    }
  } else {
    anuncios = await buscarAnunciosAtivosComCache(accountId, datePreset, cacheKey);
    fromCache = false;
    timestamp = Date.now();
  }

  // Filtrar por canal
  const filtrados = filtrarPorCanal(anuncios, canal);

  return NextResponse.json({
    data: filtrados,
    total: filtrados.length,
    canal,
    cache: fromCache,
    atualizadoEm: new Date(timestamp).toISOString(),
  });
}

async function buscarAnunciosAtivosComCache(
  accountId: string,
  datePreset: PresetPeriodo,
  cacheKey: string
): Promise<AnuncioMeta[]> {
  try {
    const anuncios = await buscarAnunciosAtivos(accountId, datePreset);
    cache.set(cacheKey, { data: anuncios, timestamp: Date.now() });
    return anuncios;
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    throw new Error(mensagem);
  }
}
