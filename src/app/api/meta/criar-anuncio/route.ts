import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  uploadVideo,
  uploadImage,
  criarCreativeVideo,
  criarCreativeImagem,
  criarAnuncio,
  buscarAccountIdDoAdSet,
  buscarCrossChannelInfo,
  type ImagemPlacement,
} from "@/lib/meta-criar";
import { buscarAd, buscarBrand, atualizarStatusAd } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  detectarTipoCriativo,
  extrairImageAssets,
  normalizarPlacementImagem,
} from "@/lib/ad-media";
import { analisarProntidaoAnuncio } from "@/lib/ad-readiness";
import { baixarArquivoDrive } from "@/lib/drive";
import { atualizarLinha, marcarErro, reservarLinha, ABAS, type ChaveAba } from "@/lib/sheets";

const PAGE_IDS_POR_CONTA: Record<string, string | undefined> = {
  [process.env.META_AD_ACCOUNT_EVINO ?? ""]: process.env.META_PAGE_ID_EVINO,
  [process.env.META_AD_ACCOUNT_GRANDCRU ?? ""]: process.env.META_PAGE_ID_GRANDCRU,
};

function resolverPageId(pageIdExplicito: string | null, accountId: string): string | null {
  if (pageIdExplicito && pageIdExplicito.trim()) {
    return pageIdExplicito.trim();
  }
  return PAGE_IDS_POR_CONTA[accountId] ?? null;
}

// --- Novo fluxo: via Supabase (adId) --------------------------

interface CorpoNovoFluxo {
  adId: string;
}

// --- Fluxo legado: via planilha (indiceLinha) ------------------

interface CorpoLegado {
  indiceLinha: number;
  aba: ChaveAba;
  adSetId: string;
  adName: string;
  textoPrincipal: string;
  titulo: string;
  descricao: string;
  cta: string;
  linkAnuncio: string;
  linkVideo: string;
  pageId: string;
  tipo?: "video" | "image";
  tipoPlanilha?: string;
  imageAssets?: { placement: string; url: string }[];
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Detectar qual fluxo usar
  if (body.adId) {
    return processarFluxoNovo(body as CorpoNovoFluxo);
  }
  return processarFluxoLegado(body as CorpoLegado);
}

// --- Fluxo novo: valida e inicia pipeline, retorna imediatamente ---

async function processarFluxoNovo(body: CorpoNovoFluxo) {
  const { userId } = await auth();

  try {
    const ad = await buscarAd(body.adId);
    if (!ad) {
      return NextResponse.json({ erro: "Ad nao encontrado" }, { status: 404 });
    }

    if (ad.status === "concluido") {
      return NextResponse.json(
        { erro: "Este anuncio ja foi criado na Meta." },
        { status: 409 }
      );
    }

    // Se esta "processando" ha mais de 5 minutos, considerar como travado e permitir retry
    if (ad.status === "processando") {
      const atualizadoEm = new Date(ad.updated_at).getTime();
      const cincoMinutos = 5 * 60 * 1000;
      if (Date.now() - atualizadoEm < cincoMinutos) {
        return NextResponse.json(
          { erro: "Este anuncio esta sendo processado. Aguarde alguns minutos." },
          { status: 409 }
        );
      }
    }

    // Buscar brand para page_id
    const brand = await buscarBrand(ad.brand_id);
    if (!brand) {
      throw new Error("Brand nao encontrado");
    }

    if (!ad.ad_set_id) {
      throw new Error("Ad Set ID e obrigatorio para subir na Meta");
    }

    // Descobrir account ID a partir do adset
    const accountId = await buscarAccountIdDoAdSet(ad.ad_set_id);

    const pageId = resolverPageId(brand.meta_page_id, accountId);
    if (!pageId) {
      throw new Error("Page ID nao encontrado. Configure na brand ou no .env");
    }

    const assets = ad.ad_assets ?? [];
    const diagnostico = analisarProntidaoAnuncio({
      tipo: ad.type,
      adSetId: ad.ad_set_id,
      adName: ad.ad_name,
      linkVideo: assets.find((asset) => asset.asset_type === "video")?.asset_url,
      linkAnuncio: ad.link_anuncio,
      imageAssets: assets
        .filter((asset) => asset.asset_type === "image")
        .map((asset) => ({ placement: asset.placement, url: asset.asset_url })),
    });

    if (diagnostico.bloqueios.length > 0) {
      throw new Error(diagnostico.bloqueios.map((item) => item.mensagem).join(" "));
    }

    // Ao reprocessar após erro, limpar creative anterior para forçar recriação
    // (o creative pode ter sido criado com params desatualizados)
    const metaOverrides: Record<string, unknown> = { meta_account_id: accountId, error_message: null };
    if (ad.status === "erro" && ad.meta_creative_id) {
      metaOverrides.meta_creative_id = null;
    }

    // Marcar como processando - store account info for the processar route
    await atualizarStatusAd(
      ad.id,
      "processando",
      metaOverrides,
      userId ?? "system"
    );

    // Return immediately - client will poll /api/meta/processar
    return NextResponse.json({
      status: "processando",
      adId: ad.id,
      step: "uploading",
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";

    logger.error("Erro no fluxo novo de criar anuncio", {
      fn: "processarFluxoNovo",
      adId: body.adId,
      error: mensagem,
    });

    try {
      await atualizarStatusAd(
        body.adId,
        "erro",
        { error_message: mensagem },
        userId ?? "system"
      );
    } catch (dbError) {
      logger.error("Falha ao gravar erro no banco — ad pode ficar preso em 'processando'", {
        fn: "processarFluxoNovo",
        adId: body.adId,
        originalError: mensagem,
        dbError: dbError instanceof Error ? dbError.message : "Erro DB desconhecido",
      });
    }

    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}

// --- Fluxo legado: le da planilha (mantido para transicao) -----

async function processarFluxoLegado(body: CorpoLegado) {
  let indiceLinha: number | undefined;
  let nomeAba: string = ABAS.evino;

  try {
    indiceLinha = body.indiceLinha;
    nomeAba = ABAS[body.aba] ?? ABAS.evino;

    if (!body.adSetId || !body.adName || !body.linkVideo) {
      return NextResponse.json(
        { erro: "Campos obrigatorios: adSetId, adName, linkVideo" },
        { status: 400 }
      );
    }

    if (indiceLinha) {
      const reservou = await reservarLinha(nomeAba, indiceLinha);
      if (!reservou) {
        return NextResponse.json(
          { erro: "Este anuncio ja esta sendo processado ou ja foi criado." },
          { status: 409 }
        );
      }
    }

    const accountId = await buscarAccountIdDoAdSet(body.adSetId);

    const pageId = resolverPageId(body.pageId, accountId);
    if (!pageId) {
      return NextResponse.json(
        { erro: "Page ID nao encontrado. Preencha na planilha ou configure META_PAGE_ID_EVINO/GRANDCRU no .env" },
        { status: 400 }
      );
    }

    const tipoCriativo = body.tipo ?? detectarTipoCriativo(body.tipoPlanilha, body.linkVideo);
    const diagnostico = analisarProntidaoAnuncio({
      tipo: tipoCriativo,
      adSetId: body.adSetId,
      adName: body.adName,
      linkVideo: body.linkVideo,
      linkAnuncio: body.linkAnuncio,
      imageAssets: body.imageAssets,
    });

    if (diagnostico.bloqueios.length > 0) {
      throw new Error(diagnostico.bloqueios.map((item) => item.mensagem).join(" "));
    }

    let creativeId: string;

    // Buscar object_store_urls do ad set (necessário para campanhas cross-channel)
    const crossChannel = await buscarCrossChannelInfo(body.adSetId);

    if (tipoCriativo === "image") {
      const imageAssets = (body.imageAssets?.length ? body.imageAssets : extrairImageAssets(body.linkVideo))
        .map((asset) => ({
          ...asset,
          placement: normalizarPlacementImagem(asset.placement, asset.url),
        }))
        .filter((asset) => Boolean(asset.url));

      if (imageAssets.length === 0) {
        throw new Error("Nenhuma imagem valida encontrada para o anuncio estatico");
      }

      const imagensComHash: ImagemPlacement[] = await Promise.all(
        imageAssets.map(async (asset) => ({
          imageHash: await uploadImage(accountId, asset.url),
          placement: asset.placement,
        }))
      );

      creativeId = await criarCreativeImagem(accountId, {
        pageId,
        imagens: imagensComHash,
        message: body.textoPrincipal,
        title: body.titulo,
        linkDescription: body.descricao,
        ctaType: body.cta || "SHOP_NOW",
        link: body.linkAnuncio,
        name: `Creative - ${body.adName}`,
        crossChannel,
      });
    } else {
      const arquivo = await baixarArquivoDrive(body.linkVideo);
      const videoId = await uploadVideo(
        accountId,
        arquivo.buffer,
        arquivo.fileName,
        arquivo.mimeType
      );

      creativeId = await criarCreativeVideo(accountId, {
        pageId,
        videoId,
        message: body.textoPrincipal,
        title: body.titulo,
        linkDescription: body.descricao,
        ctaType: body.cta || "SHOP_NOW",
        link: body.linkAnuncio,
        name: `Creative - ${body.adName}`,
        crossChannel,
      });
    }

    const adId = await criarAnuncio(
      accountId,
      body.adSetId,
      body.adName,
      creativeId
    );

    if (indiceLinha) {
      await atualizarLinha(nomeAba, indiceLinha, adId, accountId.replace("act_", ""));
    }

    return NextResponse.json({
      sucesso: true,
      adId,
      creativeId,
      accountId: accountId.replace("act_", ""),
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido";

    logger.error("Erro no fluxo legado de criar anuncio", {
      fn: "processarFluxoLegado",
      indiceLinha,
      aba: nomeAba,
      error: mensagem,
    });

    if (indiceLinha) {
      try {
        await marcarErro(nomeAba, indiceLinha, mensagem);
      } catch (sheetError) {
        logger.error("Falha ao marcar erro na planilha", {
          fn: "processarFluxoLegado",
          indiceLinha,
          originalError: mensagem,
          sheetError: sheetError instanceof Error ? sheetError.message : "Erro desconhecido",
        });
      }
    }

    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
