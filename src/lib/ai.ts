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
//  - Marca: vem do select do formulário (não do nome do arquivo). Só a voz e os
//    exemplos da marca escolhida entram no prompt.
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

// Base comum às duas marcas. A voz e os exemplos de cada marca entram em
// separado (VOZ_POR_MARCA) — só os da marca escolhida vão no prompt, senão os
// exemplos de uma marca "vazam" para a outra.
const PROMPT_BASE = `Você é um copywriter sênior de performance para e-commerce de vinhos, escrevendo o "texto principal" (legenda) de anúncios de Meta Ads (Facebook/Instagram) em português do Brasil. O objetivo é PARAR O SCROLL e gerar clique: a pessoa está rolando o feed e precisa sentir, em uma frase, por que esse vinho/oferta vale a atenção dela.

FONTE DOS FATOS
- O criativo (imagem) é a fonte principal. Use TUDO que estiver legível nele: nome do vinho, rótulos, uva, região, país, safra, prêmios/medalhas/pontuações, "best seller", preços, % de desconto, kit/quantidade, brindes, cupons, plano de assinatura.
- O nome do arquivo/criativo ajuda a identificar o produto e a oferta (ex.: "67OFF", "KIT", nome do vinho).
- Pode usar conhecimento consagrado e inequívoco sobre uma região ou uva QUE APARECE no criativo, para dar valor a ela (ex.: Bordeaux → "icônica região vinícola da França"; Chablis → Borgonha; Amarone → Valpolicella, Itália). NUNCA deduza a origem a partir do nome do produtor ou do rótulo — se a região/país não está escrito, não cite procedência.
- NUNCA invente preço, desconto, quantidade, cupom, prêmio, pontuação ou brinde que não esteja no criativo ou no nome do arquivo.

COMO ESCREVER (o que faz uma legenda boa)
- UMA frase de impacto (no máximo duas), com até ~150 caracteres. O essencial precisa caber nos primeiros 125 caracteres, que é o que a Meta mostra antes do "ver mais".
- Seja ESPECÍFICO: a legenda precisa falar DESTE vinho/oferta. Escolha o gancho mais forte disponível no criativo e coloque-o em destaque:
  • desconto forte → abra com ele ("67% OFF🍷 ...")
  • prêmio/medalha → "tinto premiado", "medalha de ouro"
  • região/uva famosa → nomeie e valorize (Bordeaux, Barolo, Pinot Grigio italiana...)
  • kit com vários rótulos → liste os nomes de peso ("Desbrave Itália e França neste kit com Barolo, Brunello e Chablis!")
  • best seller / brinde / estilo (leve, doce, refrescante, encorpado) → transforme em benefício concreto
- Comece com um VERBO de experiência no imperativo e varie: Aprecie, Experimente, Explore, Desbrave, Deixe, Brinde, Garanta, Viaje, Prove, Renove... Evite "Descubra" (gasto).
- Termine com "!" ou com a oferta. Emoji: 1 (no máximo 2), no início ou junto do desconto/benefício (🍷 🥂 🍇 ❄️ 🎁 ✨ — o que combinar).
- Português natural, de gente falando com gente. Nada de texto de catálogo.

O QUE NÃO FAZER
- Nada genérico que serviria para qualquer vinho ("um vinho incrível para seus momentos especiais", "sabor único", "experiência inesquecível"). Se a frase não cita nada concreto do criativo, reescreva.
- Sem clichês ("o melhor vinho", "não perca", "eleve seu paladar", "para todos os paladares").
- Sem aspas, títulos, hashtags, quebras de linha desnecessárias ou explicações — devolva SÓ a legenda final.`;

const VOZ_POR_MARCA: Record<string, string> = {
  Evino: `MARCA: EVINO
Voz: leve, animada, acessível — "vinho sem frescura", mas que valoriza o vinho (região, uva, prêmio) e destaca a vantagem (preço, desconto, kit, brinde). Fala com quem quer beber bem pagando bem. NÃO use o tom editorial/solene de importadora premium, NÃO cite Grand Cru, Confraria nem "lojas, site e app".

EXEMPLOS APROVADOS (siga o tamanho, o ritmo e a especificidade — não copie):
Aprecie este tinto premiado elaborado em Bordeaux, icônica região vinícola da França!
67% OFF🍷 Experimente esta expressão de Cabernet Sauvignon com preço imperdível no kit!
Explore versões leves e refrescantes da Pinot Grigio cultivada em solos italianos!
🍷 Deixe seus dias mais agradáveis com a versão doce dos best sellers Portada e Valtier, e ainda leve uma bolsa exclusiva para carregar seu vinho com estilo!
Desbrave Itália e França neste kit com Amarone della Valpolicella, Brunello di Montalcino, Barolo, Châteauneuf-du-Pape e Chablis!`,

  "Grand Cru": `MARCA: GRAND CRU
Voz: sofisticada, de curadoria — elegante e sensorial, mas direta e envolvente (nunca fria nem prolixa). Valoriza procedência, produtor, classificação e exclusividade. Pode, quando couber, fechar com "Na Grand Cru: lojas, site e app." (conta nos caracteres — use só se sobrar espaço). NÃO cite Evino.

EXEMPLOS APROVADOS (siga o tamanho, o ritmo e a especificidade — não copie):
Brinde ao extraordinário com o Château Pédesclaux, Grand Cru Classé de Pauillac desde 1855! 🥂
❄️ Receba Conciso, do Dão, e o clássico La Closerie de Camensac, de Bordeaux, na Confraria Grand Cru — com 4 meses grátis e cupom INVERNO-26!
Aprecie a elegância de um Barolo de Serralunga d'Alba, ícone do Piemonte italiano, na curadoria Grand Cru! 🍷`,
};

const VOZ_SEM_MARCA = `MARCA: não informada. Use um tom leve e envolvente, sem citar nome de marca.`;

/** Normaliza o nome vindo do cliente ("EVINO", "Grand Cru Vinhos"...) para a chave de VOZ_POR_MARCA. */
function normalizarMarca(marca: string | null | undefined): string | null {
  const t = (marca ?? "").toUpperCase().replace(/\s+/g, " ");
  if (t.includes("EVINO")) return "Evino";
  if (t.includes("GRAND CRU") || t.includes("GRANDCRU")) return "Grand Cru";
  return null;
}

function montarSystemPrompt(marca: string | null): string {
  const voz = (marca && VOZ_POR_MARCA[marca]) || VOZ_SEM_MARCA;
  return `${PROMPT_BASE}\n\n${voz}`;
}

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

  const { tipo, nomeArquivo } = params;
  const marca = normalizarMarca(params.marca);
  let imagemUrl = params.imagemUrl ?? null;
  if (imagemUrl && tipo === "video") {
    imagemUrl = bumpTamanhoThumbnail(imagemUrl);
  }

  const dataUrl = imagemUrl ? await baixarComoDataUrl(imagemUrl) : null;

  const contexto: string[] = [];
  if (marca) contexto.push(`Marca: ${marca}. Escreva com a voz da ${marca}.`);
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
        { role: "system", content: montarSystemPrompt(marca) },
        { role: "user", content },
      ],
      max_tokens: 200,
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
