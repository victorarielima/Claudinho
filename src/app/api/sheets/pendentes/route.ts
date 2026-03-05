import { NextResponse } from "next/server";
import { lerLinhas } from "@/lib/sheets";

export async function GET() {
  try {
    const linhas = await lerLinhas();
    return NextResponse.json({ data: linhas });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
