import { NextRequest, NextResponse } from "next/server";
import {
  buscarAnunciosAtivos,
  CONTAS_META,
  type PresetPeriodo,
} from "@/lib/meta";

// Cache em memória: chave = "accountId:datePreset", valor = { data, timestamp }
const cache = new Map<
  string,
  { data: unknown; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get("accountId");
  const datePreset = (searchParams.get("datePreset") ?? "last_30d") as PresetPeriodo;
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

  const cacheKey = `${accountId}:${datePreset}`;

  // Verificar cache
  if (!forcarAtualizacao) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        data: cached.data,
        cache: true,
        atualizadoEm: new Date(cached.timestamp).toISOString(),
      });
    }
  }

  try {
    const anuncios = await buscarAnunciosAtivos(accountId, datePreset);

    // Salvar no cache
    cache.set(cacheKey, { data: anuncios, timestamp: Date.now() });

    return NextResponse.json({
      data: anuncios,
      cache: false,
      atualizadoEm: new Date().toISOString(),
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
