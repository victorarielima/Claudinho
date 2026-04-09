import { normalizarPlacementImagem } from "./ad-media";
import { META_API_BASE } from "./meta-config";
import { logger } from "./logger";
import { metaFetchWithRetry, safeResponseJson } from "./meta-retry";

function getAccessToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN não configurado");
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

// ─── Video Upload ───────────────────────────────────────────

// Threshold for chunked upload (50 MB)
const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024;
// Chunk size for transfer phase (4 MB — Meta recommends between 1–50 MB)
const CHUNK_SIZE = 4 * 1024 * 1024;

export async function uploadVideo(
  accountId: string,
  videoBuffer: Buffer,
  fileName: string,
  mimeType: string = "video/mp4"
): Promise<string> {
  logger.info("Uploading video to Meta", {
    fn: "uploadVideo",
    accountId,
    fileName,
    sizeBytes: videoBuffer.byteLength,
  });
  const startMs = Date.now();

  const videoId = videoBuffer.byteLength >= CHUNKED_UPLOAD_THRESHOLD
    ? await uploadVideoChunked(accountId, videoBuffer, fileName, mimeType)
    : await uploadVideoSimples(accountId, videoBuffer, fileName, mimeType);

  const elapsedMs = Date.now() - startMs;
  logger.info("Video uploaded successfully", {
    fn: "uploadVideo",
    accountId,
    fileName,
    videoId,
    elapsedMs,
  });

  // Aguardar o Meta processar o vídeo antes de prosseguir
  await aguardarProcessamentoVideo(videoId);

  return videoId;
}

async function uploadVideoSimples(
  accountId: string,
  videoBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${accountId}/advideos`;

  const formData = new FormData();
  const arrayBuffer = videoBuffer.buffer.slice(
    videoBuffer.byteOffset,
    videoBuffer.byteOffset + videoBuffer.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: mimeType });
  formData.append("source", blob, fileName);
  formData.append("title", fileName);
  formData.append("access_token", token);

  const res = await metaFetchWithRetry(url, {
    method: "POST",
    body: formData,
  });

  const json = await safeResponseJson(res);
  if (!res.ok || json.error) {
    logger.error("Video upload failed", {
      fn: "uploadVideoSimples",
      accountId,
      fileName,
      error: extrairErroMeta(json),
    });
    throw new Error(`Erro ao fazer upload do vídeo: ${extrairErroMeta(json)}`);
  }

  return json.id;
}

/**
 * Chunked upload using Meta's 3-phase protocol:
 * 1. Start — declares file size, gets upload_session_id
 * 2. Transfer — sends chunks sequentially
 * 3. Finish — finalises upload, returns video_id
 */
async function uploadVideoChunked(
  accountId: string,
  videoBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${accountId}/advideos`;
  const fileSize = videoBuffer.byteLength;

  logger.info("Using chunked upload", {
    fn: "uploadVideoChunked",
    accountId,
    fileName,
    fileSize,
    chunkSize: CHUNK_SIZE,
    chunks: Math.ceil(fileSize / CHUNK_SIZE),
  });

  // Phase 1: Start
  const startParams = new URLSearchParams({
    upload_phase: "start",
    file_size: String(fileSize),
    access_token: token,
  });

  const startRes = await metaFetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: startParams.toString(),
  });
  const startJson = await safeResponseJson(startRes);
  if (!startRes.ok || startJson.error) {
    throw new Error(`Erro ao iniciar upload chunked: ${extrairErroMeta(startJson)}`);
  }

  const sessionId = startJson.upload_session_id as string;
  const videoId = startJson.video_id as string;
  if (!sessionId) {
    throw new Error("Meta não retornou upload_session_id na fase start");
  }
  if (!videoId) {
    throw new Error("Meta não retornou video_id na fase start");
  }

  // Phase 2: Transfer chunks
  let offset = 0;
  let chunkIndex = 0;
  while (offset < fileSize) {
    const end = Math.min(offset + CHUNK_SIZE, fileSize);
    const chunk = videoBuffer.subarray(offset, end);

    const formData = new FormData();
    formData.append("upload_phase", "transfer");
    formData.append("upload_session_id", sessionId);
    formData.append("start_offset", String(offset));
    formData.append("video_file_chunk", new Blob([new Uint8Array(chunk)], { type: mimeType }), fileName);
    formData.append("access_token", token);

    const chunkRes = await metaFetchWithRetry(url, {
      method: "POST",
      body: formData,
    });
    const chunkJson = await safeResponseJson(chunkRes);
    if (!chunkRes.ok || chunkJson.error) {
      throw new Error(`Erro no chunk ${chunkIndex} do upload: ${extrairErroMeta(chunkJson)}`);
    }

    // Meta returns the start_offset for the next chunk
    offset = Number(chunkJson.start_offset ?? end);
    chunkIndex++;

    logger.debug("Chunk uploaded", {
      fn: "uploadVideoChunked",
      sessionId,
      chunkIndex,
      offset,
      fileSize,
    });
  }

  // Phase 3: Finish
  const finishParams = new URLSearchParams({
    upload_phase: "finish",
    upload_session_id: sessionId,
    title: fileName,
    access_token: token,
  });

  const finishRes = await metaFetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: finishParams.toString(),
  });
  const finishJson = await safeResponseJson(finishRes);
  if (!finishRes.ok || finishJson.error) {
    throw new Error(`Erro ao finalizar upload chunked: ${extrairErroMeta(finishJson)}`);
  }

  return videoId;
}

async function aguardarProcessamentoVideo(videoId: string): Promise<void> {
  const token = getAccessToken();
  const maxTentativas = 30;
  const intervaloBaseMs = 5_000;
  const intervaloMaxMs = 15_000;

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    const url = `${META_API_BASE}/${videoId}?fields=status&access_token=${token}`;
    // Polling uses plain fetch — it has its own retry logic
    const res = await fetch(url);
    const json = await safeResponseJson(res);

    if (json.error) {
      logger.error("Error checking video processing status", {
        fn: "aguardarProcessamentoVideo",
        videoId,
        attempt: tentativa + 1,
        error: extrairErroMeta(json),
      });
      throw new Error(
        `Erro ao verificar status do vídeo: ${extrairErroMeta(json)}`
      );
    }

    const status = json.status?.video_status;

    logger.debug("Video processing poll", {
      fn: "aguardarProcessamentoVideo",
      videoId,
      attempt: tentativa + 1,
      maxAttempts: maxTentativas,
      status,
    });

    if (status === "ready") {
      logger.info("Video processing complete", {
        fn: "aguardarProcessamentoVideo",
        videoId,
        attempts: tentativa + 1,
      });
      return;
    }

    if (status === "error") {
      logger.error("Video processing failed on Meta side", {
        fn: "aguardarProcessamentoVideo",
        videoId,
        attempt: tentativa + 1,
      });
      throw new Error(
        "O Meta não conseguiu processar o vídeo. Verifique o formato e tente novamente."
      );
    }

    const espera = Math.min(
      intervaloBaseMs + tentativa * 2_000,
      intervaloMaxMs
    );
    await new Promise((resolve) => setTimeout(resolve, espera));
  }

  logger.error("Video processing timeout", {
    fn: "aguardarProcessamentoVideo",
    videoId,
    maxAttempts: maxTentativas,
  });
  throw new Error(
    "Timeout: o vídeo não ficou pronto após 5 minutos. Tente novamente mais tarde."
  );
}

async function buscarThumbnailVideo(videoId: string): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${videoId}?fields=picture,thumbnails&access_token=${token}`;

  const res = await metaFetchWithRetry(url);
  const json = await safeResponseJson(res);

  if (json.error) {
    logger.error("Failed to fetch video thumbnail", {
      fn: "buscarThumbnailVideo",
      videoId,
      error: extrairErroMeta(json),
    });
    throw new Error(
      `Erro ao buscar thumbnail do vídeo: ${extrairErroMeta(json)}`
    );
  }

  const preferido = json.thumbnails?.data?.find(
    (t: { is_preferred?: boolean }) => t.is_preferred
  );
  if (preferido?.uri) return preferido.uri;
  if (json.thumbnails?.data?.[0]?.uri) return json.thumbnails.data[0].uri;
  if (json.picture) return json.picture;

  throw new Error("Não foi possível obter thumbnail do vídeo.");
}

// ─── Image Upload ───────────────────────────────────────────

/**
 * Faz upload de uma imagem para o Meta a partir de uma URL pública (Cloudinary).
 * Baixa a imagem e envia como multipart/form-data (o método `url` requer permissões
 * avançadas do app; multipart funciona com qualquer app em modo desenvolvimento).
 * Retorna o image_hash necessário para criar o creative.
 */
export async function uploadImage(
  accountId: string,
  imageUrl: string
): Promise<string> {
  const token = getAccessToken();
  const endpoint = `${META_API_BASE}/${accountId}/adimages`;

  // Baixar a imagem da URL pública
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Erro ao baixar imagem de ${imageUrl}: ${imgRes.status}`);
  }
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const filename = imageUrl.split("/").pop()?.split("?")[0] || "image.jpg";

  // Montar multipart/form-data
  const formData = new FormData();
  formData.append("filename", new Blob([imgBuffer]), filename);
  formData.append("access_token", token);

  logger.info("Uploading image to Meta", {
    fn: "uploadImage",
    accountId,
    filename,
    sizeBytes: imgBuffer.byteLength,
  });

  const res = await metaFetchWithRetry(endpoint, {
    method: "POST",
    body: formData,
  });

  const json = await safeResponseJson(res);
  if (!res.ok || json.error) {
    logger.error("Image upload failed", {
      fn: "uploadImage",
      accountId,
      filename,
      error: extrairErroMeta(json),
    });
    throw new Error(`Erro ao fazer upload da imagem: ${extrairErroMeta(json)}`);
  }

  // A resposta tem formato: { images: { "filename": { hash: "..." } } }
  const images = json.images;
  if (!images) {
    throw new Error("Resposta inesperada do Meta ao fazer upload da imagem");
  }

  const firstKey = Object.keys(images)[0];
  const hash = images[firstKey]?.hash;
  if (!hash) {
    throw new Error("Image hash não encontrado na resposta do Meta");
  }

  logger.info("Image uploaded successfully", {
    fn: "uploadImage",
    accountId,
    filename,
    imageHash: hash,
  });

  return hash;
}

// ─── Video Creative ─────────────────────────────────────────

export interface ParamsCriativoVideo {
  pageId: string;
  videoId: string;
  message: string;
  title: string;
  linkDescription: string;
  ctaType: string;
  link: string;
  name: string;
  crossChannel?: CrossChannelInfo;
  instagramActorId?: string | null;
}

export async function criarCreativeVideo(
  accountId: string,
  params: ParamsCriativoVideo
): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${accountId}/adcreatives`;

  const imageUrl = await buscarThumbnailVideo(params.videoId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoData: Record<string, any> = {
    video_id: params.videoId,
    message: params.message,
    title: params.title,
    link_description: params.linkDescription,
    image_url: imageUrl,
  };

  const isCrossChannel = (params.crossChannel?.objectStoreUrls?.length ?? 0) > 0;

  if (params.link && params.link.trim()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctaValue: Record<string, any> = { link: params.link };
    if (isCrossChannel) {
      ctaValue.object_store_urls = params.crossChannel!.objectStoreUrls;
    }
    videoData.call_to_action = {
      type: params.ctaType || "SHOP_NOW",
      value: ctaValue,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objectStorySpec: Record<string, any> = {
    page_id: params.pageId,
    video_data: videoData,
  };
  if (params.instagramActorId) {
    // `instagram_actor_id` foi descontinuado pelo Meta — usar `instagram_user_id`
    // (aceita o IG Business Account id retornado por buscarInstagramActorId).
    objectStorySpec.instagram_user_id = params.instagramActorId;
  }

  const formData = new FormData();
  formData.append("name", params.name);
  formData.append("object_story_spec", JSON.stringify(objectStorySpec));
  if (isCrossChannel) {
    formData.append("applink_treatment", "deeplink_with_web_fallback");
    if (params.crossChannel!.applicationId) {
      formData.append("omnichannel_link_spec", JSON.stringify({
        web: { url: params.link },
        app: {
          application_id: params.crossChannel!.applicationId,
          platform_specs: {
            android: { url: params.link },
            ios: { url: params.link },
          },
        },
      }));
    }
  }
  formData.append("access_token", token);

  const res = await metaFetchWithRetry(url, {
    method: "POST",
    body: formData,
  });

  const json = await safeResponseJson(res);
  if (!res.ok || json.error) {
    logger.error("Failed to create video creative", {
      fn: "criarCreativeVideo",
      accountId,
      videoId: params.videoId,
      error: extrairErroMeta(json),
    });
    throw new Error(`Erro ao criar creative de vídeo: ${extrairErroMeta(json)}`);
  }

  logger.info("Video creative created", {
    fn: "criarCreativeVideo",
    accountId,
    creativeId: json.id,
  });

  return json.id;
}

// Manter export legado para compatibilidade durante migração
export const criarCreative = criarCreativeVideo;
export type ParamsCriativo = ParamsCriativoVideo;

// ─── Image Creative (multi-placement) ──────────────────────

export interface ImagemPlacement {
  imageHash: string;
  placement: string; // 'feed', 'stories', 'horizontal'
}

export interface ParamsCriativoImagem {
  pageId: string;
  imagens: ImagemPlacement[];
  message: string;
  title: string;
  linkDescription: string;
  ctaType: string;
  link: string;
  name: string;
  crossChannel?: CrossChannelInfo;
  instagramActorId?: string | null;
}

type PlacementImagemNormalizado = "feed" | "stories" | "horizontal";

function limparObjeto<T extends Record<string, unknown>>(objeto: T): T {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, valor]) => valor !== undefined && valor !== null && valor !== "")
  ) as T;
}

// Mapa de placement do asset → customization_spec do Meta
const PLACEMENT_RULES: Record<PlacementImagemNormalizado, Record<string, unknown>> = {
  feed: {
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["feed", "marketplace", "search"],
    instagram_positions: ["stream", "explore", "profile_feed"],
  },
  stories: {
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["story", "facebook_reels"],
    instagram_positions: ["story", "reels"],
  },
  horizontal: {
    publisher_platforms: ["facebook"],
    facebook_positions: ["instant_article", "right_hand_column", "suggested_video", "video_feeds"],
  },
};

export async function criarCreativeImagem(
  accountId: string,
  params: ParamsCriativoImagem
): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${accountId}/adcreatives`;

  // Se só tem 1 imagem, usar link_data simples
  if (params.imagens.length === 1) {
    return criarCreativeImagemSimples(accountId, params);
  }

  const imagensPorPlacement = new Map<PlacementImagemNormalizado, ImagemPlacement>();
  for (const imagem of params.imagens) {
    const placement = normalizarPlacementImagem(imagem.placement) as PlacementImagemNormalizado;
    if (!PLACEMENT_RULES[placement] || imagensPorPlacement.has(placement)) continue;
    imagensPorPlacement.set(placement, imagem);
  }

  if (imagensPorPlacement.size <= 1) {
    const primeiraImagemValida = Array.from(imagensPorPlacement.values())[0] ?? params.imagens[0];
    return criarCreativeImagemSimples(accountId, {
      ...params,
      imagens: [primeiraImagemValida],
    });
  }

  const labels: Record<PlacementImagemNormalizado, string> = {
    feed: "IMAGE_FEED",
    stories: "IMAGE_VERTICAL",
    horizontal: "IMAGE_HORIZONTAL",
  };

  const images = Array.from(imagensPorPlacement.entries()).map(([placement, imagem]) => ({
    hash: imagem.imageHash,
    adlabels: [{ name: labels[placement] }],
  }));

  const assetCustomizationRules = Array.from(imagensPorPlacement.entries()).map(([placement]) => ({
    customization_spec: PLACEMENT_RULES[placement],
    image_label: { name: labels[placement] },
  }));

  const isCrossChannel = (params.crossChannel?.objectStoreUrls?.length ?? 0) > 0;

  const assetFeedSpec = limparObjeto({
    ad_formats: ["SINGLE_IMAGE"],
    images,
    bodies: params.message ? [{ text: params.message }] : undefined,
    titles: params.title ? [{ text: params.title }] : undefined,
    descriptions: params.linkDescription ? [{ text: params.linkDescription }] : undefined,
    link_urls: params.link ? [{ website_url: params.link }] : undefined,
    call_to_action_types: params.ctaType ? [params.ctaType] : undefined,
    asset_customization_rules: assetCustomizationRules,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objectStorySpecMulti: Record<string, any> = { page_id: params.pageId };
  if (params.instagramActorId) {
    objectStorySpecMulti.instagram_user_id = params.instagramActorId;
  }

  const formData = new FormData();
  formData.append("name", params.name);
  formData.append("object_story_spec", JSON.stringify(objectStorySpecMulti));
  formData.append("asset_feed_spec", JSON.stringify(assetFeedSpec));
  if (params.link?.trim()) {
    formData.append("link_url", params.link);
  }
  // Cross-channel: applink_treatment + omnichannel_link_spec — sem isso o
  // criarAnuncio falha com "applink_treatment is required in ad's creative"
  // [code 100] [subcode 2446455] em adsets com cross-channel optimization.
  // O path simples (criarCreativeImagemSimples) já fazia isso; o multi-
  // placement não fazia, era um bug.
  if (isCrossChannel) {
    formData.append("applink_treatment", "deeplink_with_web_fallback");
    if (params.crossChannel!.applicationId) {
      formData.append(
        "omnichannel_link_spec",
        JSON.stringify({
          web: { url: params.link },
          app: {
            application_id: params.crossChannel!.applicationId,
            platform_specs: {
              android: { url: params.link },
              ios: { url: params.link },
            },
          },
        })
      );
    }
  }
  formData.append(
    "degrees_of_freedom_spec",
    JSON.stringify({
      creative_features_spec: {
        adapt_to_placement: { enroll_status: "OPT_OUT" },
        add_text_overlay: { enroll_status: "OPT_OUT" },
        creative_stickers: { enroll_status: "OPT_OUT" },
        description_automation: { enroll_status: "OPT_OUT" },
        enhance_cta: { enroll_status: "OPT_OUT" },
        image_background_gen: { enroll_status: "OPT_OUT" },
        image_brightness_and_contrast: { enroll_status: "OPT_OUT" },
        image_templates: { enroll_status: "OPT_OUT" },
        image_touchups: { enroll_status: "OPT_OUT" },
        image_uncrop: { enroll_status: "OPT_OUT" },
        inline_comment: { enroll_status: "OPT_OUT" },
        media_type_automation: { enroll_status: "OPT_OUT" },
        product_extensions: { enroll_status: "OPT_OUT" },
        text_optimizations: { enroll_status: "OPT_OUT" },
        text_translation: { enroll_status: "OPT_OUT" },
        video_auto_crop: { enroll_status: "OPT_OUT" },
      },
    })
  );
  formData.append("access_token", token);

  const res = await metaFetchWithRetry(url, {
    method: "POST",
    body: formData,
  });

  const json = await safeResponseJson(res);
  if (!res.ok || json.error) {
    logger.error("Failed to create image creative (multi-placement)", {
      fn: "criarCreativeImagem",
      accountId,
      placementCount: imagensPorPlacement.size,
      error: extrairErroMeta(json),
    });
    throw new Error(`Erro ao criar creative de imagem: ${extrairErroMeta(json)}`);
  }

  logger.info("Image creative created (multi-placement)", {
    fn: "criarCreativeImagem",
    accountId,
    creativeId: json.id,
    placementCount: imagensPorPlacement.size,
  });

  return json.id;
}

async function criarCreativeImagemSimples(
  accountId: string,
  params: ParamsCriativoImagem
): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${accountId}/adcreatives`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkData: Record<string, any> = {
    message: params.message,
    link: params.link,
    name: params.title,
    description: params.linkDescription,
    image_hash: params.imagens[0].imageHash,
  };

  const isCrossChannel = (params.crossChannel?.objectStoreUrls?.length ?? 0) > 0;

  if (params.ctaType) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctaValue: Record<string, any> = { link: params.link };
    if (isCrossChannel) {
      ctaValue.object_store_urls = params.crossChannel!.objectStoreUrls;
    }
    linkData.call_to_action = {
      type: params.ctaType || "SHOP_NOW",
      value: ctaValue,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objectStorySpec: Record<string, any> = {
    page_id: params.pageId,
    link_data: linkData,
  };
  if (params.instagramActorId) {
    // `instagram_actor_id` foi descontinuado pelo Meta — usar `instagram_user_id`
    // (aceita o IG Business Account id retornado por buscarInstagramActorId).
    objectStorySpec.instagram_user_id = params.instagramActorId;
  }

  const formData = new FormData();
  formData.append("name", params.name);
  formData.append("object_story_spec", JSON.stringify(objectStorySpec));
  if (isCrossChannel) {
    formData.append("applink_treatment", "deeplink_with_web_fallback");
    if (params.crossChannel!.applicationId) {
      formData.append("omnichannel_link_spec", JSON.stringify({
        web: { url: params.link },
        app: {
          application_id: params.crossChannel!.applicationId,
          platform_specs: {
            android: { url: params.link },
            ios: { url: params.link },
          },
        },
      }));
    }
  }
  formData.append("access_token", token);

  const res = await metaFetchWithRetry(url, {
    method: "POST",
    body: formData,
  });

  const json = await safeResponseJson(res);
  if (!res.ok || json.error) {
    logger.error("Failed to create image creative (simple)", {
      fn: "criarCreativeImagemSimples",
      accountId,
      error: extrairErroMeta(json),
    });
    throw new Error(`Erro ao criar creative de imagem: ${extrairErroMeta(json)}`);
  }

  logger.info("Image creative created (simple)", {
    fn: "criarCreativeImagemSimples",
    accountId,
    creativeId: json.id,
  });

  return json.id;
}

// ─── Criar Anúncio ──────────────────────────────────────────

export async function criarAnuncio(
  accountId: string,
  adsetId: string,
  name: string,
  creativeId: string
): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${accountId}/ads`;

  const params = new URLSearchParams({
    name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: "PAUSED",
    access_token: token,
  });

  const res = await metaFetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const json = await safeResponseJson(res);
  if (!res.ok || json.error) {
    logger.error("Failed to create ad", {
      fn: "criarAnuncio",
      accountId,
      adsetId,
      creativeId,
      error: extrairErroMeta(json),
    });
    throw new Error(`Erro ao criar anúncio: ${extrairErroMeta(json)}`);
  }

  logger.info("Ad created", {
    fn: "criarAnuncio",
    accountId,
    adsetId,
    adId: json.id,
    creativeId,
  });

  return json.id;
}

// ─── Utilitários ────────────────────────────────────────────

export async function buscarAccountIdDoAdSet(
  adsetId: string
): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${adsetId}?fields=account_id&access_token=${token}`;

  const res = await metaFetchWithRetry(url);
  const json = await safeResponseJson(res);

  if (!res.ok || json.error) {
    logger.error("Failed to fetch account ID from adset", {
      fn: "buscarAccountIdDoAdSet",
      adsetId,
      error: extrairErroMeta(json),
    });
    throw new Error(
      `Erro ao buscar account do adset: ${extrairErroMeta(json)}`
    );
  }

  return `act_${json.account_id}`;
}

export interface CrossChannelInfo {
  objectStoreUrls: string[];
  applicationId: string | null;
}

/**
 * Resolve o Instagram User ID a ser usado em `object_story_spec.instagram_user_id`.
 *
 * Sem essa identidade, criativos com placements do Instagram falham com:
 *   "Select an Instagram account or a Facebook Page to represent your business
 *    on Instagram." [code 100] [subcode 1772103]
 *
 * Estratégia (em ordem):
 *   1. Override por env (`META_INSTAGRAM_ACTOR_ID_EVINO/GRANDCRU` ou
 *      `META_INSTAGRAM_ACTOR_ID_<PAGEID>`) — útil quando o token não tem
 *      permissão para ler a conexão IG da página.
 *   2. `GET /{pageId}?fields=instagram_business_account,connected_instagram_account`
 *      Esse é o caminho moderno; cobre páginas conectadas via Meta Business
 *      Suite / Accounts Center.
 *   3. `GET /{pageId}/instagram_accounts` (endpoint legado, mantido como
 *      último recurso).
 *
 * Erros são logados em vez de engolidos silenciosamente — antes a função
 * retornava null em qualquer falha, escondendo a causa raiz quando o Meta
 * depois recusava o creative.
 */
export async function buscarInstagramActorId(
  pageId: string
): Promise<string | null> {
  // 1. Env overrides
  const envOverride =
    process.env[`META_INSTAGRAM_ACTOR_ID_${pageId}`] ||
    (pageId === process.env.META_PAGE_ID_EVINO
      ? process.env.META_INSTAGRAM_ACTOR_ID_EVINO
      : undefined) ||
    (pageId === process.env.META_PAGE_ID_GRANDCRU
      ? process.env.META_INSTAGRAM_ACTOR_ID_GRANDCRU
      : undefined);
  if (envOverride && envOverride.trim()) {
    logger.debug("Instagram actor id resolved from env override", {
      fn: "buscarInstagramActorId",
      pageId,
    });
    return envOverride.trim();
  }

  const token = getAccessToken();

  // 2. Modern fields on the page itself
  try {
    const url = `${META_API_BASE}/${pageId}?fields=instagram_business_account,connected_instagram_account&access_token=${token}`;
    const res = await metaFetchWithRetry(url);
    const json = await safeResponseJson(res);
    if (res.ok && !json.error) {
      const igb = (json.instagram_business_account as { id?: string } | undefined)?.id;
      const cig = (json.connected_instagram_account as { id?: string } | undefined)?.id;
      const resolved = igb ?? cig ?? null;
      if (resolved) {
        logger.debug("Instagram actor id resolved from page fields", {
          fn: "buscarInstagramActorId",
          pageId,
          source: igb ? "instagram_business_account" : "connected_instagram_account",
        });
        return resolved;
      }
      logger.warn("Page has no instagram_business_account/connected_instagram_account", {
        fn: "buscarInstagramActorId",
        pageId,
      });
    } else {
      logger.warn("Failed to read page IG fields", {
        fn: "buscarInstagramActorId",
        pageId,
        error: extrairErroMeta(json),
      });
    }
  } catch (err) {
    logger.warn("Exception reading page IG fields", {
      fn: "buscarInstagramActorId",
      pageId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Legacy endpoint
  try {
    const url = `${META_API_BASE}/${pageId}/instagram_accounts?fields=id&access_token=${token}`;
    const res = await metaFetchWithRetry(url);
    const json = await safeResponseJson(res);
    if (res.ok && !json.error) {
      const data = json.data as { id: string }[] | undefined;
      const resolved = data?.[0]?.id ?? null;
      if (resolved) {
        logger.debug("Instagram actor id resolved from legacy endpoint", {
          fn: "buscarInstagramActorId",
          pageId,
        });
        return resolved;
      }
    } else {
      logger.warn("Legacy /instagram_accounts call failed", {
        fn: "buscarInstagramActorId",
        pageId,
        error: extrairErroMeta(json),
      });
    }
  } catch (err) {
    logger.warn("Exception on legacy /instagram_accounts", {
      fn: "buscarInstagramActorId",
      pageId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.error("Could not resolve Instagram actor id — creative will likely be rejected for IG placements", {
    fn: "buscarInstagramActorId",
    pageId,
    hint: "Set META_INSTAGRAM_ACTOR_ID_EVINO/GRANDCRU as fallback, or grant the access token instagram_basic + pages_show_list permissions.",
  });
  return null;
}

export async function buscarCrossChannelInfo(
  adsetId: string
): Promise<CrossChannelInfo> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${adsetId}?fields=promoted_object&access_token=${token}`;

  const res = await metaFetchWithRetry(url);
  const json = await safeResponseJson(res);

  if (!res.ok || json.error) return { objectStoreUrls: [], applicationId: null };

  const apps = json.promoted_object?.omnichannel_object?.app;
  if (!Array.isArray(apps) || apps.length === 0) return { objectStoreUrls: [], applicationId: null };

  return {
    objectStoreUrls: apps[0].object_store_urls ?? [],
    applicationId: apps[0].application_id ?? null,
  };
}
