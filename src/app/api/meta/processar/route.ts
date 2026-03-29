import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { baixarArquivoDrive } from "@/lib/drive";
import {
  uploadImage,
  criarCreativeVideo,
  criarCreativeImagem,
  criarAnuncio,
  buscarAccountIdDoAdSet,
  type ImagemPlacement,
} from "@/lib/meta-criar";
import {
  buscarAd,
  buscarBrand,
  atualizarStatusAd,
  atualizarMetaAssetId,
  type Ad,
  type AdAsset,
} from "@/lib/db";
import { normalizarPlacementImagem } from "@/lib/ad-media";
import { getSupabase } from "@/lib/supabase";

// --- Meta API helpers (video upload without polling, status check) ---

const META_API_BASE = "https://graph.facebook.com/v23.0";

function getAccessToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN nao configurado");
  return token;
}

function extrairErroMeta(json: Record<string, unknown>): string {
  const err = json.error as
    | {
        message?: string;
        error_user_msg?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        fbtrace_id?: string;
      }
    | undefined;
  if (!err) return JSON.stringify(json);

  const parts: string[] = [];
  if (err.error_user_msg) parts.push(err.error_user_msg);
  else if (err.message) parts.push(err.message);
  if (err.code) parts.push(`[code ${err.code}]`);
  if (err.error_subcode) parts.push(`[subcode ${err.error_subcode}]`);
  if (err.fbtrace_id) parts.push(`[trace ${err.fbtrace_id}]`);

  return parts.join(" ") || "Erro desconhecido";
}

/**
 * Upload video to Meta WITHOUT waiting for processing.
 * Returns the video ID immediately after upload completes.
 */
async function uploadVideoSemAguardar(
  accountId: string,
  videoBuffer: Buffer,
  fileName: string
): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${accountId}/advideos`;

  const formData = new FormData();
  const arrayBuffer = videoBuffer.buffer.slice(
    videoBuffer.byteOffset,
    videoBuffer.byteOffset + videoBuffer.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: "video/mp4" });
  formData.append("source", blob, fileName);
  formData.append("title", fileName);
  formData.append("access_token", token);

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Erro ao fazer upload do video: ${extrairErroMeta(json)}`);
  }

  return json.id;
}

/**
 * Check video processing status on Meta (single check, no polling).
 * Returns { ready: boolean, status: string }
 */
async function verificarStatusVideo(
  videoId: string
): Promise<{ ready: boolean; status: string }> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${videoId}?fields=status&access_token=${token}`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.error) {
    throw new Error(
      `Erro ao verificar status do video: ${extrairErroMeta(json)}`
    );
  }

  const status = json.status?.video_status ?? "unknown";

  if (status === "error") {
    throw new Error(
      "O Meta nao conseguiu processar o video. Verifique o formato e tente novamente."
    );
  }

  return { ready: status === "ready", status };
}

// --- Page ID resolution ---

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

// --- Types ---

type ProcessarStep =
  | "uploaded"
  | "processing_video"
  | "creative_created"
  | "completed"
  | "error";

interface ProcessarResponse {
  step: ProcessarStep;
  status: string;
  adId: string;
  meta_ad_id?: string;
  progress?: string;
  message?: string;
}

// --- POST handler ---

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  const body = await request.json();
  const adId = body.adId as string | undefined;

  if (!adId) {
    return NextResponse.json({ erro: "adId e obrigatorio" }, { status: 400 });
  }

  try {
    const ad = await buscarAd(adId);
    if (!ad) {
      return NextResponse.json({ erro: "Ad nao encontrado" }, { status: 404 });
    }

    // Already completed
    if (ad.status === "concluido") {
      return NextResponse.json({
        step: "completed",
        status: "concluido",
        adId: ad.id,
        meta_ad_id: ad.meta_ad_id ?? undefined,
      } satisfies ProcessarResponse);
    }

    // Error state
    if (ad.status === "erro") {
      return NextResponse.json({
        step: "error",
        status: "erro",
        adId: ad.id,
        message: ad.error_message ?? "Erro desconhecido",
      } satisfies ProcessarResponse);
    }

    // Not in processando state - shouldn't be called
    if (ad.status !== "processando") {
      return NextResponse.json(
        { erro: "Ad nao esta em estado de processamento" },
        { status: 400 }
      );
    }

    // Resolve account ID - use stored one or fetch from adset
    const accountId = ad.meta_account_id
      ? (ad.meta_account_id.startsWith("act_") ? ad.meta_account_id : `act_${ad.meta_account_id}`)
      : await buscarAccountIdDoAdSet(ad.ad_set_id!);

    // Ensure meta_account_id is stored with act_ prefix (QW-13)
    if (!ad.meta_account_id || !ad.meta_account_id.startsWith("act_")) {
      await atualizarStatusAd(
        ad.id,
        "processando",
        { meta_account_id: accountId },
        userId ?? "system"
      );
    }

    const assets = ad.ad_assets ?? [];

    // --- Step determination based on current state ---

    // Step D: Has creative, needs ad creation
    if (ad.meta_creative_id && !ad.meta_ad_id) {
      return await stepCriarAnuncio(ad, accountId, userId);
    }

    // Step A/B/C: No creative yet
    if (!ad.meta_creative_id) {
      const allAssetsUploaded = checkAllAssetsUploaded(ad.type, assets);

      // Step A: Assets not uploaded yet - download and upload
      if (!allAssetsUploaded) {
        return await stepUploadAssets(ad, accountId, assets, userId);
      }

      // Step B: Video type - check if Meta finished processing
      if (ad.type === "video") {
        const videoAsset = assets.find((a) => a.asset_type === "video");
        if (videoAsset?.meta_asset_id) {
          const videoStatus = await verificarStatusVideo(videoAsset.meta_asset_id);
          if (!videoStatus.ready) {
            return NextResponse.json({
              step: "processing_video",
              status: "processando",
              adId: ad.id,
              progress: videoStatus.status,
            } satisfies ProcessarResponse);
          }
        }
      }

      // Step C: All assets uploaded (and video ready if applicable) - create creative
      return await stepCriarCreative(ad, accountId, assets, userId);
    }

    // Fallback - already completed
    return NextResponse.json({
      step: "completed",
      status: "concluido",
      adId: ad.id,
      meta_ad_id: ad.meta_ad_id ?? undefined,
    } satisfies ProcessarResponse);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";

    try {
      await atualizarStatusAd(
        adId,
        "erro",
        { error_message: mensagem },
        userId ?? "system"
      );
    } catch {
      // Ignora erro ao marcar no banco
    }

    return NextResponse.json(
      {
        step: "error",
        status: "erro",
        adId,
        message: mensagem,
      } satisfies ProcessarResponse,
      { status: 500 }
    );
  }
}

// --- Step A: Upload assets to Meta ---

async function stepUploadAssets(
  ad: Ad,
  accountId: string,
  assets: AdAsset[],
  userId: string | null
): Promise<NextResponse> {
  if (ad.type === "video") {
    const videoAsset = assets.find((a) => a.asset_type === "video");
    if (!videoAsset) throw new Error("Asset de video nao encontrado");

    // Idempotency: skip if already uploaded
    if (videoAsset.meta_asset_id) {
      return NextResponse.json({
        step: "uploaded",
        status: "processando",
        adId: ad.id,
      } satisfies ProcessarResponse);
    }

    const arquivo = await baixarArquivoDrive(videoAsset.asset_url);
    const videoId = await uploadVideoSemAguardar(accountId, arquivo.buffer, arquivo.fileName);
    await atualizarMetaAssetId(videoAsset.id, videoId);

    return NextResponse.json({
      step: "uploaded",
      status: "processando",
      adId: ad.id,
    } satisfies ProcessarResponse);
  } else {
    // Image flow: upload all images that don't have meta_asset_id yet
    const imageAssets = assets.filter((a) => a.asset_type === "image");
    if (imageAssets.length === 0) throw new Error("Nenhum asset de imagem encontrado");

    await Promise.all(
      imageAssets
        .filter((asset) => !asset.meta_asset_id) // Idempotency: skip already uploaded
        .map(async (asset) => {
          const hash = await uploadImage(accountId, asset.asset_url);
          await atualizarMetaAssetId(asset.id, hash);
        })
    );

    return NextResponse.json({
      step: "uploaded",
      status: "processando",
      adId: ad.id,
    } satisfies ProcessarResponse);
  }
}

// --- Step C: Create creative ---

async function stepCriarCreative(
  ad: Ad,
  accountId: string,
  assets: AdAsset[],
  userId: string | null
): Promise<NextResponse> {
  // Idempotency: skip if already created
  if (ad.meta_creative_id) {
    return NextResponse.json({
      step: "creative_created",
      status: "processando",
      adId: ad.id,
    } satisfies ProcessarResponse);
  }

  const brand = await buscarBrand(ad.brand_id);
  if (!brand) throw new Error("Brand nao encontrado");

  const pageId = resolverPageId(brand.meta_page_id, accountId);
  if (!pageId) throw new Error("Page ID nao encontrado. Configure na brand ou no .env");

  let creativeId: string;

  if (ad.type === "video") {
    const videoAsset = assets.find((a) => a.asset_type === "video");
    if (!videoAsset?.meta_asset_id) throw new Error("Video nao foi enviado para o Meta");

    creativeId = await criarCreativeVideo(accountId, {
      pageId,
      videoId: videoAsset.meta_asset_id,
      message: ad.texto_principal || "",
      title: ad.titulo || "",
      linkDescription: ad.descricao || "",
      ctaType: ad.cta || "SHOP_NOW",
      link: ad.link_anuncio || "",
      name: `Creative - ${ad.ad_name}`,
    });
  } else {
    const imageAssets = assets.filter((a) => a.asset_type === "image");
    // Re-fetch assets from DB to get updated meta_asset_id values
    const freshAssets = await fetchFreshAssets(ad.id);
    const freshImageAssets = freshAssets.filter((a) => a.asset_type === "image");

    const imagensComHash: ImagemPlacement[] = freshImageAssets
      .filter((asset) => asset.meta_asset_id)
      .map((asset) => ({
        imageHash: asset.meta_asset_id!,
        placement: normalizarPlacementImagem(asset.placement, asset.asset_url),
      }));

    if (imagensComHash.length === 0) {
      throw new Error("Nenhuma imagem com hash encontrada");
    }

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

  // Store creative ID on the ad
  await atualizarStatusAd(
    ad.id,
    "processando",
    { meta_creative_id: creativeId },
    userId ?? "system"
  );

  return NextResponse.json({
    step: "creative_created",
    status: "processando",
    adId: ad.id,
  } satisfies ProcessarResponse);
}

// --- Step D: Create ad on Meta ---

async function stepCriarAnuncio(
  ad: Ad,
  accountId: string,
  userId: string | null
): Promise<NextResponse> {
  // Idempotency: skip if already created
  if (ad.meta_ad_id) {
    return NextResponse.json({
      step: "completed",
      status: "concluido",
      adId: ad.id,
      meta_ad_id: ad.meta_ad_id,
    } satisfies ProcessarResponse);
  }

  if (!ad.meta_creative_id) {
    throw new Error("Creative ID nao encontrado");
  }

  if (!ad.ad_set_id) {
    throw new Error("Ad Set ID e obrigatorio");
  }

  const metaAdId = await criarAnuncio(accountId, ad.ad_set_id, ad.ad_name, ad.meta_creative_id);

  // Mark as completed with all meta IDs - keep act_ prefix (QW-13)
  await atualizarStatusAd(
    ad.id,
    "concluido",
    {
      meta_ad_id: metaAdId,
      meta_creative_id: ad.meta_creative_id,
      meta_account_id: accountId,
    },
    userId ?? "system"
  );

  return NextResponse.json({
    step: "completed",
    status: "concluido",
    adId: ad.id,
    meta_ad_id: metaAdId,
  } satisfies ProcessarResponse);
}

// --- Helpers ---

function checkAllAssetsUploaded(type: string, assets: AdAsset[]): boolean {
  if (type === "video") {
    const videoAsset = assets.find((a) => a.asset_type === "video");
    return Boolean(videoAsset?.meta_asset_id);
  }
  // Image: all image assets must have meta_asset_id
  const imageAssets = assets.filter((a) => a.asset_type === "image");
  return imageAssets.length > 0 && imageAssets.every((a) => a.meta_asset_id);
}

async function fetchFreshAssets(adId: string): Promise<AdAsset[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ad_assets")
    .select("*")
    .eq("ad_id", adId);

  if (error) throw new Error(`Erro ao buscar assets: ${error.message}`);
  return (data ?? []) as AdAsset[];
}
