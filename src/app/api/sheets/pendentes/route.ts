import { NextResponse } from "next/server";
import { lerLinhas, atualizarAccountId } from "@/lib/sheets";
import { buscarAccountIdDoAdSet } from "@/lib/meta-criar";

export async function GET() {
  try {
    const linhas = await lerLinhas();

    // Para itens concluídos sem accountId, resolver via adSetId e persistir na planilha
    const semAccount = linhas.filter(
      (l) => l.statusAutomacao === "Concluído" && l.adIdGerado && !l.accountId && l.adSetId
    );

    await Promise.allSettled(
      semAccount.map(async (l) => {
        try {
          const accountId = await buscarAccountIdDoAdSet(l.adSetId);
          const numericId = accountId.replace("act_", "");
          l.accountId = numericId;
          await atualizarAccountId(l.indiceLinha, numericId);
        } catch {
          // Não bloqueia o carregamento
        }
      })
    );

    return NextResponse.json({ data: linhas });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
