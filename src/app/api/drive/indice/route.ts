import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { carregarIndiceCompleto } from "@/lib/drive-explorer";

export async function GET() {
  try {
    await auth();
    const indice = await carregarIndiceCompleto();
    return NextResponse.json(indice);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
