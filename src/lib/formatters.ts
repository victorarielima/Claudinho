/**
 * Formats a number with pt-BR locale, using K/M suffixes for large values.
 * Accepts both string and number inputs for flexibility across components.
 */
export function formatarNumero(valor: string | number | undefined): string {
  if (valor === undefined || valor === null || valor === "") return "\u2014";
  const num = typeof valor === "string" ? parseFloat(valor) : valor;
  if (Number.isNaN(num)) return "\u2014";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("pt-BR").format(Math.round(num));
}

/**
 * Formats a number as BRL currency using pt-BR locale.
 * Accepts both string and number inputs for flexibility across components.
 */
export function formatarMoeda(valor: string | number | undefined): string {
  if (valor === undefined || valor === null || valor === "") return "\u2014";
  const num = typeof valor === "string" ? parseFloat(valor) : valor;
  if (Number.isNaN(num)) return "\u2014";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

/**
 * Extracts a Google Drive file ID from various Drive URL formats.
 * Supports /file/d/{id} and ?id={id} patterns.
 */
export function extrairDriveFileId(url: string): string | null {
  const matchFile = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile) return matchFile[1];

  const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId) return matchId[1];

  return null;
}
