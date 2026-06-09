import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { carregarIndiceClickUp } from "@/lib/clickup";
import { buscarBrand } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    await auth();
    const brandId = request.nextUrl.searchParams.get("brandId");
    if (!brandId) {
      return NextResponse.json({ erro: "Parâmetro brandId é obrigatório." }, { status: 400 });
    }

    const brand = await buscarBrand(brandId);
    if (!brand) {
      return NextResponse.json({ erro: "Marca não encontrada." }, { status: 404 });
    }
    if (!brand.clickup_list_id) {
      return NextResponse.json(
        { erro: `Marca "${brand.name}" não tem lista do ClickUp configurada.` },
        { status: 400 }
      );
    }

    const dias = Number(request.nextUrl.searchParams.get("dias") ?? "7");
    const indice = await carregarIndiceClickUp(brand.clickup_list_id, dias);
    return NextResponse.json(indice);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
