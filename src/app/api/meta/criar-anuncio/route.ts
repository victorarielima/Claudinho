import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { baixarArquivoDrive } from "@/lib/drive";
import {
  uploadVideo,
  uploadImage,
  criarCreativeVideo,
  criarCreativeImagem,
  criarAnuncio,
  buscarAccountIdDoAdSet,
  type ImagemPlacement,
} from "@/lib/meta-criar";
import { buscarAd, buscarBrand, atualizarStatusAd, atualizarMetaAssetId } from "@/lib/db";
import {
  detectarTipoCriativo,
  extrairImageAssets,
  normalizarPlacementImagem,
} from "@/lib/ad-media";
import { analisarProntidaoAnuncio } from "@/lib/ad-readiness";

// Fallback para compatibilidade: se o ad veio da planilha e ainda não tem brand no banco
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

// ─── Novo fluxo: via Supabase (adId) ───────────────────────

interface CorpoNovoFluxo {
  adId: string;
}

// ─── Fluxo legado: via planilha (indiceLinha) ───────────────

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

// ─── Fluxo novo: lê do banco, suporta video + image ────────

async function processarFluxoNovo(body: CorpoNovoFluxo) {
  const { userId } = await auth();

  try {
    const ad = await buscarAd(body.adId);
    if (!ad) {
      return NextResponse.json({ erro: "Ad não encontrado" }, { status: 404 });
    }

    if (ad.status !== "pendente" && ad.status !== "erro") {
      return NextResponse.json(
        { erro: "Este anúncio já está sendo processado ou já foi criado." },
        { status: 409 }
      );
    }

    // Marcar como processando
    await atualizarStatusAd(ad.id, "processando", undefined, userId ?? "system");

    // Buscar brand para page_id
    const brand = await buscarBrand(ad.brand_id);
    if (!brand) {
      throw new Error("Brand não encontrado");
    }

    if (!ad.ad_set_id) {
      throw new Error("Ad Set ID é obrigatório para subir na Meta");
    }

    // Descobrir account ID a partir do adset
    const accountId = await buscarAccountIdDoAdSet(ad.ad_set_id);

    const pageId = resolverPageId(brand.meta_page_id, accountId);
    if (!pageId) {
      throw new Error("Page ID não encontrado. Configure na brand ou no .env");
    }

    const assets = ad.ad_assets ?? [];
    let creativeId: string;
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

    if (ad.type === "video") {
      // ── Fluxo vídeo ──
      const videoAsset = assets.find((a) => a.asset_type === "video");
      if (!videoAsset) throw new Error("Asset de vídeo não encontrado");

      const arquivo = await baixarArquivoDrive(videoAsset.asset_url);
      const videoId = await uploadVideo(accountId, arquivo.buffer, arquivo.fileName);

      await atualizarMetaAssetId(videoAsset.id, videoId);

      creativeId = await criarCreativeVideo(accountId, {
        pageId,
        videoId,
        message: ad.texto_principal || "",
        title: ad.titulo || "",
        linkDescription: ad.descricao || "",
        ctaType: ad.cta || "SHOP_NOW",
        link: ad.link_anuncio || "",
        name: `Creative - ${ad.ad_name}`,
      });
    } else {
      // ── Fluxo imagem (multi-placement) ──
      const imageAssets = assets.filter((a) => a.asset_type === "image");
      if (imageAssets.length === 0) throw new Error("Nenhum asset de imagem encontrado");

      // Upload de todas as imagens em paralelo
      const imagensComHash: ImagemPlacement[] = await Promise.all(
        imageAssets.map(async (asset) => {
          const hash = await uploadImage(accountId, asset.asset_url);
          await atualizarMetaAssetId(asset.id, hash);
          return {
            imageHash: hash,
            placement: normalizarPlacementImagem(asset.placement, asset.asset_url),
          };
        })
      );

      creativeId = await criarCreativeImagem(accountId, {
        pageId,
        imagens: imagensComHash,
        message: ad.texto_principal || "",
        title: ad.titulo || "",
        linkDescription: ad.descricao || "",
        ctaType: ad.cta || "SHOP_NOW",
        link: ad.link_anuncio || "",
        name: `Creative - ${ad.ad_name}`,
      });
    }

    // Criar anúncio (PAUSED)
    const metaAdId = await criarAnuncio(accountId, ad.ad_set_id, ad.ad_name, creativeId);

    // Atualizar banco com sucesso
    await atualizarStatusAd(
      ad.id,
      "concluido",
      {
        meta_ad_id: metaAdId,
        meta_creative_id: creativeId,
        meta_account_id: accountId.replace("act_", ""),
      },
      userId ?? "system"
    );

    return NextResponse.json({
      sucesso: true,
      adId: metaAdId,
      creativeId,
      accountId: accountId.replace("act_", ""),
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";

    try {
      await atualizarStatusAd(
        body.adId,
        "erro",
        { error_message: mensagem.slice(0, 200) },
        userId ?? "system"
      );
    } catch {
      // Ignora erro ao marcar no banco
    }

    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}

// ─── Fluxo legado: lê da planilha (mantido para transição) ──

async function processarFluxoLegado(body: CorpoLegado) {
  let indiceLinha: number | undefined;
  let nomeAba: string = ABAS.evino;

  try {
    indiceLinha = body.indiceLinha;
    nomeAba = ABAS[body.aba] ?? ABAS.evino;

    if (!body.adSetId || !body.adName || !body.linkVideo) {
      return NextResponse.json(
        { erro: "Campos obrigatórios: adSetId, adName, linkVideo" },
        { status: 400 }
      );
    }

    if (indiceLinha) {
      const reservou = await reservarLinha(nomeAba, indiceLinha);
      if (!reservou) {
        return NextResponse.json(
          { erro: "Este anúncio já está sendo processado ou já foi criado." },
          { status: 409 }
        );
      }
    }

    const accountId = await buscarAccountIdDoAdSet(body.adSetId);

    const pageId = resolverPageId(body.pageId, accountId);
    if (!pageId) {
      return NextResponse.json(
        { erro: "Page ID não encontrado. Preencha na planilha ou configure META_PAGE_ID_EVINO/GRANDCRU no .env" },
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

    if (tipoCriativo === "image") {
      const imageAssets = (body.imageAssets?.length ? body.imageAssets : extrairImageAssets(body.linkVideo))
        .map((asset) => ({
          ...asset,
          placement: normalizarPlacementImagem(asset.placement, asset.url),
        }))
        .filter((asset) => Boolean(asset.url));

      if (imageAssets.length === 0) {
        throw new Error("Nenhuma imagem válida encontrada para o anúncio estático");
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
      });
    } else {
      const arquivo = await baixarArquivoDrive(body.linkVideo);
      const videoId = await uploadVideo(
        accountId,
        arquivo.buffer,
        arquivo.fileName
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

    if (indiceLinha) {
      try {
        await marcarErro(nomeAba, indiceLinha, mensagem);
      } catch {
        // Ignora erro ao marcar na planilha
      }
    }

    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
