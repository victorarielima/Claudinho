import { NextRequest, NextResponse } from "next/server";
import { listarAuditLog } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const filtros: {
    entity_id?: string;
    entity_type?: string;
    user_id?: string;
    limit?: number;
    offset?: number;
  } = {};

  if (searchParams.get("entity_id")) filtros.entity_id = searchParams.get("entity_id")!;
  if (searchParams.get("entity_type")) filtros.entity_type = searchParams.get("entity_type")!;
  if (searchParams.get("user_id")) filtros.user_id = searchParams.get("user_id")!;
  if (searchParams.get("limit")) filtros.limit = parseInt(searchParams.get("limit")!);
  if (searchParams.get("offset")) filtros.offset = parseInt(searchParams.get("offset")!);

  try {
    const { entries, total } = await listarAuditLog(filtros);
    return NextResponse.json({ data: entries, total });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
