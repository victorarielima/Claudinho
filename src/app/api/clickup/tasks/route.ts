import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { carregarIndiceClickUp } from "@/lib/clickup";

export async function GET(request: NextRequest) {
  try {
    await auth();
    const dias = Number(request.nextUrl.searchParams.get("dias") ?? "7");
    const indice = await carregarIndiceClickUp(dias);
    return NextResponse.json(indice);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
