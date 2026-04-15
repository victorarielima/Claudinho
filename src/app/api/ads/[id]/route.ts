import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { buscarAd, atualizarAd, atualizarStatusAd, excluirAd } from "@/lib/db";
import { deletarAdMeta } from "@/lib/meta-criar";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const ad = await buscarAd(id);
    if (!ad) {
      return NextResponse.json({ erro: "Ad não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ data: ad });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const recriar = body._recriar === true;
    const excluirMeta = body._excluirMeta === true;
    delete body._recriar;
    delete body._excluirMeta;

    // Excluir do Meta: deletar ad no Meta e resetar para pendente
    if (excluirMeta) {
      const ad = await buscarAd(id);
      if (!ad) throw new Error("Ad não encontrado");
      if (ad.meta_ad_id) {
        try { await deletarAdMeta(ad.meta_ad_id); } catch { /* já não existe */ }
      }
      await atualizarStatusAd(
        id, "pendente",
        { meta_ad_id: null, meta_creative_id: null, meta_effective_status: null, error_message: null },
        userId
      );
      return NextResponse.json({ data: ad, excluido: true });
    }

    // Salvar campos editados
    const ad = await atualizarAd(id, body, userId);

    // Se for recriar, resetar status mas MANTER meta_ad_id — a deleção
    // do ad antigo acontece no momento do upload (processarFluxoNovo),
    // minimizando o tempo fora do ar.
    if (recriar) {
      await atualizarStatusAd(
        id,
        "pendente",
        {
          meta_creative_id: null,
          meta_effective_status: null,
          error_message: null,
        },
        userId
      );
    }

    return NextResponse.json({ data: ad, recriado: recriar });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    const status = mensagem.includes("não encontrado") ? 404 : 500;
    return NextResponse.json({ erro: mensagem }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await excluirAd(id, userId);
    return NextResponse.json({ sucesso: true });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    const status = mensagem.includes("não encontrado") ? 404
      : mensagem.includes("Não é possível") ? 409
      : 500;
    return NextResponse.json({ erro: mensagem }, { status });
  }
}
