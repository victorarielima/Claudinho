import { NextRequest, NextResponse } from "next/server";
import { lerLinhasComDiagnostico, atualizarAccountId, ABAS, type ChaveAba } from "@/lib/sheets";
import { buscarAccountIdDoAdSet } from "@/lib/meta-criar";

export async function GET(request: NextRequest) {
  try {
    const aba = (request.nextUrl.searchParams.get("aba") ?? "evino") as ChaveAba;
    const nomeAba = ABAS[aba] ?? ABAS.evino;

    const { linhas, diagnostico } = await lerLinhasComDiagnostico(nomeAba);

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
          await atualizarAccountId(nomeAba, l.indiceLinha, numericId);
        } catch {
          // Não bloqueia o carregamento
        }
      })
    );

    return NextResponse.json({
      data: linhas,
      meta: {
        diagnosticoPlanilha: diagnostico,
      },
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
