import { normalizarPlacementImagem } from "./ad-media";
import { META_API_BASE } from "./meta-config";
import { logger } from "./logger";
import { metaFetchWithRetry } from "./meta-retry";

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

export async function uploadVideo(
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

  logger.info("Uploading video to Meta", {
    fn: "uploadVideo",
    accountId,
    fileName,
    sizeBytes: videoBuffer.byteLength,
  });
  const startMs = Date.now();

  const res = await metaFetchWithRetry(url, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    logger.error("Video upload failed", {
      fn: "uploadVideo",
      accountId,
      fileName,
      error: extrairErroMeta(json),
    });
    throw new Error(`Erro ao fazer upload do vídeo: ${extrairErroMeta(json)}`);
  }

  const videoId = json.id;
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

async function aguardarProcessamentoVideo(videoId: string): Promise<void> {
  const token = getAccessToken();
  const maxTentativas = 30;
  const intervaloBaseMs = 5_000;
  const intervaloMaxMs = 15_000;

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    const url = `${META_API_BASE}/${videoId}?fields=status&access_token=${token}`;
    // Polling uses plain fetch — it has its own retry logic
    const res = await fetch(url);
    const json = await res.json();

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
  const json = await res.json();

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

  const json = await res.json();
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

  if (params.link && params.link.trim()) {
    videoData.call_to_action = {
      type: params.ctaType || "SHOP_NOW",
      value: { link: params.link },
    };
  }

  const objectStorySpec = {
    page_id: params.pageId,
    video_data: videoData,
  };

  const formData = new FormData();
  formData.append("name", params.name);
  formData.append("object_story_spec", JSON.stringify(objectStorySpec));
  formData.append("access_token", token);

  const res = await metaFetchWithRetry(url, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
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
    facebook_positions: ["story", "reels"],
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

  const formData = new FormData();
  formData.append("name", params.name);
  formData.append("object_story_spec", JSON.stringify({ page_id: params.pageId }));
  formData.append("asset_feed_spec", JSON.stringify(assetFeedSpec));
  if (params.link?.trim()) {
    formData.append("link_url", params.link);
  }
  formData.append(
    "degrees_of_freedom_spec",
    JSON.stringify({
      creative_features_spec: {
        standard_enhancements: {
          enroll_status: "OPT_OUT",
        },
      },
    })
  );
  formData.append("access_token", token);

  const res = await metaFetchWithRetry(url, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
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

  if (params.ctaType) {
    linkData.call_to_action = {
      type: params.ctaType || "SHOP_NOW",
      value: { link: params.link },
    };
  }

  const objectStorySpec = {
    page_id: params.pageId,
    link_data: linkData,
  };

  const formData = new FormData();
  formData.append("name", params.name);
  formData.append("object_story_spec", JSON.stringify(objectStorySpec));
  formData.append("access_token", token);

  const res = await metaFetchWithRetry(url, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
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
    creative: JSON.stringify({ creative_id: creativeId, applink_treatment: "web_only" }),
    status: "PAUSED",
    access_token: token,
  });

  const res = await metaFetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const json = await res.json();
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
  const json = await res.json();

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
