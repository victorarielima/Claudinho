// Helpers client-side para a geração de legenda com IA.

export interface GerarLegendaPayload {
  tipo: "video" | "imagem";
  imagemUrl?: string | null;
  nomeArquivo?: string | null;
  /** Descrição do card do ClickUp (preço, desconto, KV). */
  briefing?: string | null;
  marca?: string | null;
}

/** Chama a rota /api/ai/legenda e retorna a legenda gerada (ou lança erro). */
export async function gerarLegendaCliente(
  payload: GerarLegendaPayload
): Promise<string> {
  const res = await fetch("/api/ai/legenda", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.erro ?? "Erro ao gerar legenda");
  return json.legenda as string;
}

// "EV"/"GC" como token solto: "_EV_", "04_NOV_GC_..." e também pastas como
// "Conteúdos EV" / "Influs GC" (separadas por espaço).
const TAG_EV = /(^|[^A-Z0-9])EV([^A-Z0-9]|$)/;
const TAG_GC = /(^|[^A-Z0-9])GC([^A-Z0-9]|$)/;

/** Texto (nome de arquivo/pasta) marcado como Evino. */
export function temTagEvino(texto: string): boolean {
  const t = texto.toUpperCase();
  return TAG_EV.test(t) || t.includes("EVINO");
}

/** Texto (nome de arquivo/pasta) marcado como Grand Cru. */
export function temTagGrandCru(texto: string): boolean {
  const t = texto.toUpperCase();
  return TAG_GC.test(t) || t.includes("GRAND CRU") || t.includes("GRANDCRU");
}

/** Deduz a marca a partir de nomes/tags (EV/EVINO, GC/GRAND CRU). */
export function detectarMarca(
  ...textos: (string | null | undefined)[]
): string | null {
  const t = textos.filter(Boolean).join(" ");
  if (temTagEvino(t)) return "Evino";
  if (temTagGrandCru(t)) return "Grand Cru";
  return null;
}
