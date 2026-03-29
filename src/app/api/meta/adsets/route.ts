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
    const campaignId = searchParams.get("campaignId");

    if (!campaignId) {
      return NextResponse.json(
        { erro: "campaignId é obrigatório" },
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

    logger.info("Fetching adsets", {
      fn: "GET /api/meta/adsets",
      campaignId,
    });

    const filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
    ]);

    const url = `${META_API_BASE}/${campaignId}/adsets?fields=id,name,status,daily_budget&filtering=${encodeURIComponent(filtering)}&limit=100&access_token=${accessToken}`;

    const response = await metaFetchWithRetry(url);
    const data = await response.json();

    if (data.error) {
      logger.error("Meta API error fetching adsets", {
        fn: "GET /api/meta/adsets",
        campaignId,
        error: data.error.message,
      });
      return NextResponse.json(
        { erro: data.error.message ?? "Erro na API do Meta" },
        { status: response.status }
      );
    }

    const adsets = (data.data ?? []).map(
      (a: {
        id: string;
        name: string;
        status: string;
        daily_budget: string;
      }) => ({
        id: a.id,
        nome: a.name,
        status: a.status,
        dailyBudget: a.daily_budget,
      })
    );

    const elapsedMs = Date.now() - startMs;
    logger.info("Adsets fetched successfully", {
      fn: "GET /api/meta/adsets",
      campaignId,
      count: adsets.length,
      elapsedMs,
    });

    return NextResponse.json({ adsets });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";
    logger.error("Unexpected error fetching adsets", {
      fn: "GET /api/meta/adsets",
      error: mensagem,
      elapsedMs: Date.now() - startMs,
    });
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
