// Helpers client-side para a geração de legenda com IA.

export interface GerarLegendaPayload {
  tipo: "video" | "imagem";
  imagemUrl?: string | null;
  nomeArquivo?: string | null;
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

/** Deduz a marca a partir de nomes/tags (_EV_/EVINO, _GC_/GRAND CRU). */
export function detectarMarca(
  ...textos: (string | null | undefined)[]
): string | null {
  const t = textos.filter(Boolean).join(" ").toUpperCase();
  if (t.includes("_EV_") || t.includes("EVINO")) return "Evino";
  if (t.includes("_GC_") || t.includes("GRAND CRU") || t.includes("GRANDCRU"))
    return "Grand Cru";
  return null;
}
