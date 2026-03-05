import { NextRequest, NextResponse } from "next/server";
import { baixarArquivoDrive } from "@/lib/drive";
import {
  uploadVideo,
  criarCreative,
  criarAnuncio,
  buscarAccountIdDoAdSet,
} from "@/lib/meta-criar";
import { atualizarLinha, marcarErro, reservarLinha } from "@/lib/sheets";

const PAGE_IDS_POR_CONTA: Record<string, string | undefined> = {
  [process.env.META_AD_ACCOUNT_EVINO ?? ""]: process.env.META_PAGE_ID_EVINO,
  [process.env.META_AD_ACCOUNT_GRANDCRU ?? ""]: process.env.META_PAGE_ID_GRANDCRU,
};

function resolverPageId(pageIdPlanilha: string, accountId: string): string | null {
  if (pageIdPlanilha && pageIdPlanilha.trim()) {
    return pageIdPlanilha.trim();
  }
  return PAGE_IDS_POR_CONTA[accountId] ?? null;
}

interface CorpoRequisicao {
  indiceLinha: number;
  adSetId: string;
  adName: string;
  textoPrincipal: string;
  titulo: string;
  descricao: string;
  cta: string;
  linkAnuncio: string;
  linkVideo: string;
  pageId: string;
}

export async function POST(request: NextRequest) {
  let indiceLinha: number | undefined;

  try {
    const body: CorpoRequisicao = await request.json();
    indiceLinha = body.indiceLinha;

    // Validações básicas
    if (!body.adSetId || !body.adName || !body.linkVideo) {
      return NextResponse.json(
        { erro: "Campos obrigatórios: adSetId, adName, linkVideo" },
        { status: 400 }
      );
    }

    // 0. Reservar linha na planilha (check real-time + marcar "Processando")
    if (indiceLinha) {
      const reservou = await reservarLinha(indiceLinha);
      if (!reservou) {
        return NextResponse.json(
          { erro: "Este anúncio já está sendo processado ou já foi criado." },
          { status: 409 }
        );
      }
    }

    // 1. Descobrir account ID a partir do adset
    const accountId = await buscarAccountIdDoAdSet(body.adSetId);

    // Resolver Page ID: planilha → fallback .env por conta
    const pageId = resolverPageId(body.pageId, accountId);
    if (!pageId) {
      return NextResponse.json(
        { erro: "Page ID não encontrado. Preencha na planilha ou configure META_PAGE_ID_EVINO/GRANDCRU no .env" },
        { status: 400 }
      );
    }

    // 2. Baixar vídeo do Google Drive
    const arquivo = await baixarArquivoDrive(body.linkVideo);

    // 3. Upload do vídeo para o Meta (ad account)
    const videoId = await uploadVideo(
      accountId,
      arquivo.buffer,
      arquivo.fileName
    );

    // 4. Criar o Ad Creative (User Token via FormData — testado e confirmado)
    const creativeId = await criarCreative(accountId, {
      pageId,
      videoId,
      message: body.textoPrincipal,
      title: body.titulo,
      linkDescription: body.descricao,
      ctaType: body.cta || "SHOP_NOW",
      link: body.linkAnuncio,
      name: `Creative - ${body.adName}`,
    });

    // 5. Criar o Anúncio (PAUSED)
    const adId = await criarAnuncio(
      accountId,
      body.adSetId,
      body.adName,
      creativeId
    );

    // 6. Atualizar a planilha com o Ad ID e status "Concluído"
    if (indiceLinha) {
      await atualizarLinha(indiceLinha, adId, accountId.replace("act_", ""));
    }

    return NextResponse.json({
      sucesso: true,
      adId,
      creativeId,
      videoId,
      accountId: accountId.replace("act_", ""),
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";

    // Marcar erro na planilha se possível
    if (indiceLinha) {
      try {
        await marcarErro(indiceLinha, mensagem);
      } catch {
        // Ignora erro ao marcar na planilha
      }
    }

    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
