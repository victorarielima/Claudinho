import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { META_API_BASE } from "@/lib/meta-config";
import { logger } from "@/lib/logger";
import { metaFetchWithRetry } from "@/lib/meta-retry";

export async function GET(request: NextRequest) {
  const startMs = Date.now();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json(
        { erro: "accountId é obrigatório" },
        { status: 400 }
      );
    }

    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { erro: "META_ACCESS_TOKEN não configurado" },
        { status: 500 }
      );
    }

    logger.info("Fetching campaigns", {
      fn: "GET /api/meta/campanhas",
      accountId,
    });

    const filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
    ]);

    const url = `${META_API_BASE}/${accountId}/campaigns?fields=id,name,status,objective&filtering=${encodeURIComponent(filtering)}&limit=100&access_token=${accessToken}`;

    const response = await metaFetchWithRetry(url);
    const data = await response.json();

    if (data.error) {
      logger.error("Meta API error fetching campaigns", {
        fn: "GET /api/meta/campanhas",
        accountId,
        error: data.error.message,
      });
      return NextResponse.json(
        { erro: data.error.message ?? "Erro na API do Meta" },
        { status: response.status }
      );
    }

    const campanhas = (data.data ?? []).map(
      (c: { id: string; name: string; status: string; objective: string }) => ({
        id: c.id,
        nome: c.name,
        status: c.status,
        objetivo: c.objective,
      })
    );

    const elapsedMs = Date.now() - startMs;
    logger.info("Campaigns fetched successfully", {
      fn: "GET /api/meta/campanhas",
      accountId,
      count: campanhas.length,
      elapsedMs,
    });

    return NextResponse.json({ campanhas });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";
    logger.error("Unexpected error fetching campaigns", {
      fn: "GET /api/meta/campanhas",
      error: mensagem,
      elapsedMs: Date.now() - startMs,
    });
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
