import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listarAdNamesAtivosNoAdSet } from "@/lib/db";

interface Body {
  brandId: string;
  campaignName: string;
  adSetName: string;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  try {
    const body: Body = await request.json();
    if (!body.brandId || !body.campaignName || !body.adSetName) {
      return NextResponse.json(
        { erro: "brandId, campaignName e adSetName são obrigatórios" },
        { status: 400 }
      );
    }

    const existentes = await listarAdNamesAtivosNoAdSet(
      body.brandId,
      body.campaignName,
      body.adSetName
    );

    return NextResponse.json({ existentes });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
