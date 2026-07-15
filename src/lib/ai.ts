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

REGRA FUNDAMENTAL: escreva a legenda APENAS com base no que aparece no criativo do anúncio. A imagem é sua única fonte. Descreva o que está visível — o produto, o rótulo, os textos na tela, as cores, a atmosfera, os elementos da cena. NÃO recorra ao seu conhecimento externo sobre o vinho, o produtor ou a região. Se uma informação não está no criativo, ela não entra na legenda.

O QUE VOCÊ PODE USAR
- TUDO que estiver legível/visível no criativo: nome do vinho, tipo, uva, safra, região, produtor, plano/assinatura, preços, descontos, cupons, brindes e demais chamadas promocionais. Transcreva o que está escrito; não deduza nem complete com conhecimento de fora.
- Os elementos visuais da cena: cores, luz, taça, garrafa, ambientação, ocasião sugerida, clima (festivo, sofisticado, descontraído, aconchego de inverno etc.).
- O nome do arquivo/criativo apenas como apoio para identificar o produto — nunca como fonte de fatos que não estejam na imagem.

COMO ESCREVER
- Legenda atrativa e envolvente, com texto que desperta desejo. 2 a 4 linhas, nesta lógica:
  1) Gancho instigante inspirado no que se vê na cena e na ocasião (a luz, a taça, o clima, o momento). Nada de "Descubra o melhor vinho".
  2) Corpo que apresenta o produto/oferta usando o que está visível — nome do vinho ou plano, rótulos citados, região quando aparece, preço/cupom/brinde quando aparecem.
  3) Fechamento com uma chamada leve para a marca.
- USE EMOJIS: escolha emojis que combinem com o conteúdo e o clima (ex.: 🍷 para vinho, 🥂 para brinde, ❄️ para inverno, 🌌 para um rótulo de nome cósmico). Sem exageros — geralmente 1 a 2, com bom gosto. Ambas as marcas usam emoji.

O QUE NÃO FAZER
- NÃO invente nem deduza país, região, terroir, denominação de origem, nacionalidade, história do produtor, uva, estilo, safra ou harmonização que não estejam explícitos no criativo. Errar a procedência é o pior erro possível — o nome de um produtor NÃO indica a origem do vinho. (Se a região/origem estiver escrita no criativo, pode e deve usá-la.)
- Não invente preços, descontos, quantidades, cupons, notas, prêmios ou números que não estejam claros no criativo.
- Não use clichês batidos ("o melhor vinho", "não perca", "imperdível", "eleve seu paladar") nem exageros vazios.
- Não escreva aspas, títulos, hashtags nem explicações — devolva SÓ a legenda final.

VOZ POR MARCA
- Grand Cru: sofisticada, editorial, sensorial. Tom de curadoria e elegância — mas envolvente, não fria. Pode usar emoji com bom gosto (ex.: 🍷). Feche com "Descubra na Grand Cru: lojas, site e app." quando fizer sentido.
- Evino: leve, acessível e animada — tom de "vinho sem frescura", mas ainda informativa. Usa emoji (ex.: 🍷). Feche com um convite direto e caloroso à ação.

EXEMPLOS DE NÍVEL (siga o tom, o ritmo e o uso de emoji — não copie. Todos usam só o que estaria visível no criativo)
[Grand Cru]
O inverno combina com uma boa taça — e a Confraria Grand Cru leva essa experiência até a sua porta. ❄️
No Plano Grand Reserva, cada entrega revela grandes rótulos das melhores regiões do mundo: do Dão português (Conciso) ao clássico de Bordeaux (La Closerie de Camensac) e ao encorpado Pago de los Capellanes, da Ribera del Duero — por R$ 599,93/mês.
Assine com 4 meses grátis e presentes selecionados no 4º e no 10º mês. Cupom INVERNO-26. 🍷

[Grand Cru]
Alguns rótulos não se bebem: celebram-se. 🥂
O Plano Grand Sélection é a experiência mais exclusiva da Confraria — vinhos ícones da enologia mundial, como o Château Latour-Martillac (Pessac-Léognan) e o Château Pédesclaux, Grand Cru Classé de Pauillac desde 1855.
Uma seleção de alta gama para quem aprecia o extraordinário. Assine agora. 🍷

[Grand Cru]
Inverno é tempo de desacelerar — e de brindar aos bons momentos. ❄️
Entre para a Confraria Grand Cru e receba, todos os meses, uma curadoria de rótulos que transforma qualquer noite fria em experiência. Assine um dos planos anuais e ganhe 4 meses grátis, além de presentes selecionados no 4º e no 10º mês.
Use o cupom INVERNO-26 e comece agora. 🍷

[Evino]
Descubra o Sideral, nosso best seller que conquista paladares! 🌌
Aproveite 20% OFF na compra a partir de 4 garrafas e eleve suas noites com um vinho premiado.
Beba com moderação.`;

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
