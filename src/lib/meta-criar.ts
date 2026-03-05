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

/**
 * Faz polling no status do vídeo até que o Meta finalize o processamento.
 * O vídeo precisa estar com status "ready" para ser usado em um Creative.
 * Tenta por até 5 minutos com intervalos crescentes.
 */
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

/**
 * Busca a URL do thumbnail preferido do vídeo no Meta.
 */
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

  // Tentar pegar o thumbnail preferido
  const preferido = json.thumbnails?.data?.find(
    (t: { is_preferred?: boolean }) => t.is_preferred
  );
  if (preferido?.uri) return preferido.uri;

  // Fallback: primeiro thumbnail disponível
  if (json.thumbnails?.data?.[0]?.uri) return json.thumbnails.data[0].uri;

  // Fallback: picture (menor resolução)
  if (json.picture) return json.picture;

  throw new Error("Não foi possível obter thumbnail do vídeo.");
}

export interface ParamsCriativo {
  pageId: string;
  videoId: string;
  message: string;
  title: string;
  linkDescription: string;
  ctaType: string;
  link: string;
  name: string;
}

export async function criarCreative(
  accountId: string,
  params: ParamsCriativo
): Promise<string> {
  const token = getAccessToken();
  const url = `${META_API_BASE}/${accountId}/adcreatives`;

  // Buscar thumbnail gerado automaticamente pelo Meta
  const imageUrl = await buscarThumbnailVideo(params.videoId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoData: Record<string, any> = {
    video_id: params.videoId,
    message: params.message,
    title: params.title,
    link_description: params.linkDescription,
    image_url: imageUrl,
  };

  // Só incluir CTA se houver link
  if (params.link && params.link.trim()) {
    videoData.call_to_action = {
      type: params.ctaType || "SHOP_NOW",
      value: {
        link: params.link,
      },
    };
  }

  const objectStorySpec = {
    page_id: params.pageId,
    video_data: videoData,
  };

  // Meta exige multipart form-data para /adcreatives (JSON não funciona)
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
    throw new Error(`Erro ao criar creative: ${extrairErroMeta(json)}`);
  }

  return json.id;
}

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

/**
 * Descobre o account ID a partir do adset_id, buscando na API do Meta.
 */
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
