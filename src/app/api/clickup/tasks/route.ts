import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { carregarIndiceClickUp } from "@/lib/clickup";

export async function GET() {
  try {
    await auth();
    const indice = await carregarIndiceClickUp();
    return NextResponse.json(indice);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
