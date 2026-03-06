import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { buscarAd, atualizarAd } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const ad = await buscarAd(id);
    if (!ad) {
      return NextResponse.json({ erro: "Ad não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ data: ad });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const ad = await atualizarAd(id, body, userId);
    return NextResponse.json({ data: ad });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    const status = mensagem.includes("não encontrado") ? 404 : 500;
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
