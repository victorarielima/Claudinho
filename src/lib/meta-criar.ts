const META_API_BASE = "https://graph.facebook.com/v23.0";

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

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Erro ao fazer upload do vídeo: ${extrairErroMeta(json)}`);
  }

  const videoId = json.id;

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
    const res = await fetch(url);
    const json = await res.json();

    if (json.error) {
      throw new Error(
        `Erro ao verificar status do vídeo: ${extrairErroMeta(json)}`
      );
    }

    const status = json.status?.video_status;

    if (status === "ready") {
      return;
    }

    if (status === "error") {
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

  throw new Error(
    "Timeout: o vídeo não ficou pronto após 5 minutos. Tente novamente mais tarde."
  );
}

async function buscarThumbnailVideo(videoId: string): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${videoId}?fields=picture,thumbnails&access_token=${token}`;

  const res = await fetch(url);
  const json = await res.json();

  if (json.error) {
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

  const res = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || json.error) {
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

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Erro ao criar creative de vídeo: ${extrairErroMeta(json)}`);
  }

  return json.id;
}

// Manter export legado para compatibilidade durante migração
export const criarCreative = criarCreativeVideo;
export type ParamsCriativo = ParamsCriativoVideo;

// ─── Image Creative (multi-placement) ──────────────────────

export interface ImagemPlacement {
  imageHash: string;
  placement: string; // 'feed', 'stories', 'reels'
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

// Mapa de placement genérico → customization_spec do Meta
const PLACEMENT_RULES: Record<string, object> = {
  feed: {
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["feed"],
    instagram_positions: ["stream"],
  },
  stories: {
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["story"],
    instagram_positions: ["story"],
  },
  reels: {
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["reels"],
    instagram_positions: ["reels"],
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

  // Usar a imagem de feed (ou a primeira) como default no object_story_spec
  const defaultImage =
    params.imagens.find((img) => img.placement === "feed") ?? params.imagens[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkData: Record<string, any> = {
    message: params.message,
    link: params.link,
    name: params.title,
    description: params.linkDescription,
    image_hash: defaultImage.imageHash,
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

  // asset_customization_rules: cada regra mapeia 1 imagem → placements específicos
  const assetCustomizationRules = params.imagens
    .map((img) => {
      const spec = PLACEMENT_RULES[img.placement];
      if (!spec) return null;
      return {
        customization_spec: spec,
        image_hash: img.imageHash,
      };
    })
    .filter(Boolean);

  const formData = new FormData();
  formData.append("name", params.name);
  formData.append("object_story_spec", JSON.stringify(objectStorySpec));
  formData.append("asset_customization_rules", JSON.stringify(assetCustomizationRules));
  formData.append("access_token", token);

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Erro ao criar creative de imagem: ${extrairErroMeta(json)}`);
  }

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

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Erro ao criar creative de imagem: ${extrairErroMeta(json)}`);
  }

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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Erro ao criar anúncio: ${extrairErroMeta(json)}`);
  }

  return json.id;
}

// ─── Utilitários ────────────────────────────────────────────

export async function buscarAccountIdDoAdSet(
  adsetId: string
): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${adsetId}?fields=account_id&access_token=${token}`;

  const res = await fetch(url);
  const json = await res.json();

  if (!res.ok || json.error) {
    throw new Error(
      `Erro ao buscar account do adset: ${extrairErroMeta(json)}`
    );
  }

  return `act_${json.account_id}`;
}
