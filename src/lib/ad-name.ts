// ---------------------------------------------------------------------------
// Nomenclatura de anúncios (padrão do time de Growth):
//
//   {TIPO}-{CARACTERÍSTICA}-{CONTEÚDO}-{DESTINO}-W{SEMANA}-{ANO}
//   ex.: VID-0-4Italianos93MaisPontos-PDP-W45-2026
//
//   TIPO          VID (vídeo) · EST (estático) · CAT (catálogo)
//   CARACTERÍSTICA vídeo:    0 (vídeo interno / de pessoa) · Motion (estático animado)
//                  estático: Gen (genérico) · Prod (KV produzido) · FP (fotografia produzida)
//   CONTEÚDO      categoria / vinho / kit + preço/cupom, em CamelCase
//   DESTINO       PDP (página de produto) · CAT (categoria/campanha)
//   SEMANA/ANO    semana ISO 8601
// ---------------------------------------------------------------------------

export type TipoAnuncio = "VID" | "EST" | "CAT";
export type CaracteristicaVideo = "0" | "Motion";
export type CaracteristicaEstatico = "Gen" | "Prod" | "FP";
export type Caracteristica = CaracteristicaVideo | CaracteristicaEstatico;
export type DestinoAnuncio = "PDP" | "CAT";

export const CARACTERISTICAS_VIDEO: { valor: CaracteristicaVideo; rotulo: string }[] = [
  { valor: "0", rotulo: "0 — vídeo interno / de pessoa" },
  { valor: "Motion", rotulo: "Motion — estático animado" },
];

export const CARACTERISTICAS_ESTATICO: { valor: CaracteristicaEstatico; rotulo: string }[] = [
  { valor: "Gen", rotulo: "Gen — genérico" },
  { valor: "Prod", rotulo: "Prod — KV produzido" },
  { valor: "FP", rotulo: "FP — fotografia produzida" },
];

/** Semana ISO 8601 + ano ISO no formato W{NN}-{AAAA}. */
export function semanaAno(data: Date = new Date()): string {
  const d = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
  // Quinta-feira da mesma semana decide o ano ISO.
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return `W${String(semana).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

// Tokens que não são "conteúdo": já fazem parte da nomenclatura, são
// metadados de arquivo (corte, data) ou tags de marca.
const TOKENS_IGNORADOS = new Set([
  "VID", "EST", "CAT", "MOTION", "GEN", "PROD", "FP", "PDP",
  "EV", "GC", "EVINO", "GRANDCRU", "UNTITLED", "FINAL", "COPY", "COPIA",
  "FEED", "STORIES", "STORY", "REELS", "VERTICAL", "HORIZONTAL", "QUADRADO", "SQUARE",
]);

/**
 * Transforma o nome do arquivo/card no CONTEÚDO em CamelCase:
 * "4 italianos 93+ pontos.mp4" → "4Italianos93MaisPontos".
 * Remove extensão, cortes (1080x1920), datas, semana/ano e tokens da própria
 * nomenclatura — um nome que já segue o padrão não é duplicado.
 */
export function conteudoCamelCase(nome: string): string {
  const palavras = nome
    // Cards do ClickUp: "Face | Nome do KV | 3 formatos"
    .replace(/^(face|display|display e face)\s*\|\s*/i, "")
    .replace(/\s*\|\s*\d+\s*formatos?\s*$/i, "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\+/g, " mais ")
    .replace(/R\$/gi, " ")
    .replace(/%/g, "")
    .replace(/\b\d{3,4}\s*x\s*\d{3,4}\b/gi, " ") // cortes 1080x1920
    .replace(/\b\d{4}[-_.]\d{1,2}[-_.]\d{1,2}\b/g, " ") // datas 2026_10_09
    .replace(/\bW\d{1,2}\b/gi, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .split(/[^a-zA-Z0-9]+/)
    .filter((p) => p && !TOKENS_IGNORADOS.has(p.toUpperCase()));

  // O "0" do vídeo interno só é token quando vem logo depois do VID.
  if (palavras[0] === "0") palavras.shift();

  return palavras
    .map((p) => {
      // Palavra toda em caixa alta (comum no ClickUp) vira Capitalizada;
      // mista (ex.: "LupoMeraviglia") é preservada.
      const base = p === p.toUpperCase() ? p.toLowerCase() : p;
      return base.charAt(0).toUpperCase() + base.slice(1);
    })
    .join("")
    .slice(0, 60);
}

/**
 * Destino a partir do link do anúncio: página de produto/kit → PDP;
 * qualquer outro link do site → CAT. Sem link → null (usuário escolhe).
 */
export function destinoPorLink(link: string | null | undefined): DestinoAnuncio | null {
  const url = (link ?? "").trim().toLowerCase();
  if (!url) return null;
  if (/\/(produtos?|product|combos?|kits?|p)\/[^/?#]+/.test(url)) return "PDP";
  return "CAT";
}

export interface ParamsAdName {
  tipo: TipoAnuncio;
  caracteristica: Caracteristica;
  /** Nome do arquivo/card — vira o CONTEÚDO. */
  nomeOrigem: string;
  destino: DestinoAnuncio | null;
  data?: Date;
}

/** Monta o nome no padrão; sem destino definido, o segmento fica de fora. */
export function montarAdName(p: ParamsAdName): string {
  return [
    p.tipo,
    p.caracteristica,
    conteudoCamelCase(p.nomeOrigem) || "Anuncio",
    p.destino,
    semanaAno(p.data),
  ]
    .filter(Boolean)
    .join("-");
}
