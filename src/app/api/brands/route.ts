import { NextResponse } from "next/server";
import { listarBrands } from "@/lib/db";

export async function GET() {
  try {
    const brands = await listarBrands();
    return NextResponse.json({ data: brands });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
