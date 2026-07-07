// ---------------------------------------------------------------------------
// Integração com OpenAI — geração de legenda ("texto principal") a partir do
// criativo. Analisa 1 frame do criativo (imagem estática ou thumbnail do
// vídeo) com um modelo de visão e escreve a legenda em PT-BR.
//
// Abordagem (validada com o usuário):
//  - Vídeo: usa o thumbnail do Drive (1 frame) — sem ffmpeg, barato e rápido.
//  - Imagem: usa a própria URL pública do criativo (ClickUp / colagem).
//  - Modelo: gpt-4o-mini (visão + texto), detail "low" para custo mínimo.
//
// Usa fetch direto na REST API da OpenAI — não requer o SDK como dependência.
// ---------------------------------------------------------------------------

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODELO = "gpt-4o-mini";

export type TipoCriativo = "video" | "imagem";

export interface GerarLegendaParams {
  tipo: TipoCriativo;
  /** URL do visual a analisar: imagem do criativo ou thumbnail do vídeo. */
  imagemUrl?: string | null;
  /** Nome do arquivo/card — dá contexto do produto mesmo sem imagem. */
  nomeArquivo?: string | null;
  /** Marca (ex.: "Evino", "Grand Cru") para calibrar o tom. */
  marca?: string | null;
}

const SYSTEM_PROMPT = `Você é um copywriter sênior de performance para e-commerce de vinhos (marcas como Evino e Grand Cru), escrevendo em português do Brasil.

Sua tarefa: analisar o criativo do anúncio (imagem ou frame de vídeo) e escrever o "texto principal" (legenda) de um anúncio no Facebook/Instagram.

Regras:
- Escreva APENAS a legenda final, sem aspas, sem títulos, sem explicações.
- 2 a 4 linhas curtas. Comece com um gancho forte na primeira linha.
- Foque no benefício e no desejo; conecte com o que aparece no criativo.
- Tom brasileiro, natural e vendedor, sem exageros nem clichês batidos.
- No máximo 1 ou 2 emojis, só se fizer sentido.
- Para bebida alcoólica, encerre com "Beba com moderação." quando o produto for vinho/bebida.
- Não invente preços, descontos ou dados específicos que não estejam claramente no criativo.`;

function bumpTamanhoThumbnail(url: string): string {
  // Thumbnails do Drive (googleusercontent) terminam em "=s220"; pedimos um
  // frame maior para a análise ficar melhor.
  return url.replace(/=s\d+(-c)?$/i, "=s800");
}

async function baixarComoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Evita estourar limite de payload com imagens gigantes (~raro em thumb).
    if (buf.byteLength > 10 * 1024 * 1024) return null;
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Gera uma legenda ("texto principal") para o criativo usando a OpenAI.
 * Lança erro com mensagem clara em caso de falha (chave ausente, API off, etc).
 */
export async function gerarLegenda(params: GerarLegendaParams): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY não configurada. Adicione a chave no .env para gerar legendas com IA."
    );
  }

  const { tipo, nomeArquivo, marca } = params;
  let imagemUrl = params.imagemUrl ?? null;
  if (imagemUrl && tipo === "video") {
    imagemUrl = bumpTamanhoThumbnail(imagemUrl);
  }

  const dataUrl = imagemUrl ? await baixarComoDataUrl(imagemUrl) : null;

  const contexto: string[] = [];
  if (marca) contexto.push(`Marca: ${marca}.`);
  if (nomeArquivo) contexto.push(`Nome do arquivo/criativo: "${nomeArquivo}".`);
  contexto.push(
    dataUrl
      ? tipo === "video"
        ? "A imagem abaixo é um frame representativo do vídeo do anúncio."
        : "A imagem abaixo é o criativo estático do anúncio."
      : "Não há imagem disponível — use o nome do arquivo e o contexto da marca para escrever a legenda."
  );

  const userText = contexto.join(" ");

  const content: unknown[] = [{ type: "text", text: userText }];
  if (dataUrl) {
    content.push({ type: "image_url", image_url: { url: dataUrl, detail: "low" } });
  }

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELO,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    let detalhe = "";
    try {
      const erro = await res.json();
      detalhe = erro?.error?.message ?? "";
    } catch {
      // corpo não-JSON
    }
    throw new Error(
      `Falha na OpenAI (${res.status})${detalhe ? `: ${detalhe}` : ""}`
    );
  }

  const json = await res.json();
  const legenda: string | undefined = json?.choices?.[0]?.message?.content;
  if (!legenda || !legenda.trim()) {
    throw new Error("A IA não retornou nenhuma legenda.");
  }

  return legenda.trim();
}
