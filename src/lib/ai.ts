// ---------------------------------------------------------------------------
// Integração com OpenAI — geração de legenda ("texto principal") a partir do
// criativo. Analisa 1 frame do criativo (imagem estática ou thumbnail do
// vídeo) com um modelo de visão e escreve a legenda em PT-BR.
//
// Abordagem (validada com o usuário):
//  - Vídeo: usa o thumbnail do Drive (1 frame) — sem ffmpeg, barato e rápido.
//  - Imagem: usa a própria URL pública do criativo (ClickUp / colagem).
//  - Modelo: gpt-4o (visão + texto). Legenda de anúncio exige copy nuançada e
//    leitura de rótulo/região no criativo — gpt-4o-mini entregava texto genérico.
//
// Usa fetch direto na REST API da OpenAI — não requer o SDK como dependência.
// ---------------------------------------------------------------------------

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODELO = "gpt-4o";

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

const SYSTEM_PROMPT = `Você é um copywriter sênior de performance para e-commerce de vinhos, escrevendo o "texto principal" (legenda) de anúncios de Facebook/Instagram em português do Brasil. Escreve para a Evino e a Grand Cru — duas marcas com vozes distintas.

Objetivo: uma legenda que desperta desejo pelo vinho específico do criativo, com a densidade sensorial e o repertório de um sommelier. Nunca genérica.

COMO ESCREVER
- 2 a 4 linhas curtas, nesta lógica:
  1) Gancho de abertura sensorial ou instigante — um aroma, um terroir, uma ocasião, uma imagem forte. Nada de "Descubra o melhor vinho".
  2) Corpo com algo concreto e verdadeiro sobre o produto: uva, região, vinícola, estilo, safra, história ou harmonização. É o que faz o vinho parecer único.
  3) Fechamento com uma chamada leve para a marca.
- Use seu conhecimento de vinhos: quando o rótulo, o nome do arquivo ou a imagem indicam o produto (uva, região, produtor, safra, tipo), traga fatos verdadeiros e bem estabelecidos sobre eles. É isso que separa uma legenda boa de uma clichê.

O QUE NÃO FAZER
- Não invente preços, descontos, quantidades, notas, prêmios, safras ou números que não estejam claros no criativo.
- Não use clichês batidos ("o melhor vinho", "não perca", "imperdível", "eleve seu paladar") nem exageros vazios.
- Não escreva aspas, títulos, hashtags nem explicações — devolva SÓ a legenda final.

VOZ POR MARCA
- Grand Cru: sofisticada, editorial, sensorial. Foco em terroir, heritage e curadoria. Pouco ou nenhum emoji. Feche com "Descubra na Grand Cru: lojas, site e app."
- Evino: leve, acessível e animada — tom de "vinho sem frescura", mas ainda informativa. Pode usar 1 emoji (ex.: 🍷). Feche com um convite direto e caloroso à ação.

EXEMPLOS DE LEGENDAS BOAS (siga o nível, não copie)
[Grand Cru]
O frescor do Oceano Pacífico em cada taça.
Pioneira no Valle de Leyda, a vinícola Leyda traduz a pureza dos terroirs costeiros do Chile na sua linha Reserva — vinhos de identidade única, do frescor do Sauvignon Blanc à elegância do Pinot Noir.
Descubra na Grand Cru: lojas, site e app.

[Grand Cru]
Brinde em grande estilo com Pannier Sélection Brut, Antoine Janson Chablis e Hubert de Charenne, ícones de Champagne e Borgonha!
Descubra na Grand Cru: lojas, site e app.

[Grand Cru]
Deguste um autêntico Brunello di Montalcino, expressão máxima do Sangiovese toscano e de um dos terroirs mais celebrados da Itália.
Descubra na Grand Cru: lojas, site e app.

[Evino]
Descubra 3 versões reserva dos vinhos que conquistaram o coração dos clientes da Evino! 🍷 Leve para casa ainda uma bolsa exclusiva!`;

function bumpTamanhoThumbnail(url: string): string {
  // Thumbnails do Drive (googleusercontent) terminam em "=s220"; pedimos um
  // frame maior para a IA conseguir ler rótulo/região no criativo.
  return url.replace(/=s\d+(-c)?$/i, "=s1024");
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
  if (marca) contexto.push(`Marca: ${marca}. Use a voz desta marca conforme as instruções.`);
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
    content.push({ type: "image_url", image_url: { url: dataUrl, detail: "high" } });
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
      temperature: 0.8,
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
