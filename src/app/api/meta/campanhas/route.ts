import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const META_API_BASE = "https://graph.facebook.com/v23.0";

export async function GET(request: NextRequest) {
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

    const filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
    ]);

    const url = `${META_API_BASE}/${accountId}/campaigns?fields=id,name,status,objective&filtering=${encodeURIComponent(filtering)}&limit=100&access_token=${accessToken}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
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

    return NextResponse.json({ campanhas });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
