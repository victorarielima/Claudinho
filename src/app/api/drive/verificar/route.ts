import { NextRequest, NextResponse } from "next/server";
import { verificarAcessoArquivo, getServiceAccountEmail } from "@/lib/drive";

interface ItemVerificacao {
  indiceLinha: number;
  linkVideo: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: { itens: ItemVerificacao[] } = await request.json();

    if (!body.itens || body.itens.length === 0) {
      return NextResponse.json(
        { erro: "Nenhum item para verificar" },
        { status: 400 }
      );
    }

    const resultados = await Promise.all(
      body.itens.map(async (item) => {
        const resultado = await verificarAcessoArquivo(item.linkVideo);
        return {
          indiceLinha: item.indiceLinha,
          ...resultado,
        };
      })
    );

    return NextResponse.json({
      resultados,
      serviceAccountEmail: getServiceAccountEmail(),
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
