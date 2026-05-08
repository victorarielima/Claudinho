function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function detectarTipoCriativo(
  tipoBruto: string | null | undefined,
  assetUrl: string | null | undefined
): "video" | "image" {
  const tipo = normalizarTexto(tipoBruto ?? "");

  if (
    tipo.includes("estatico") ||
    tipo.includes("imagem") ||
    tipo.includes("image") ||
    tipo.includes("static")
  ) {
    return "image";
  }

  if (tipo.includes("video")) {
    return "video";
  }

  if ((assetUrl ?? "").includes("cloudinary.com")) {
    return "image";
  }

  return "video";
}

export function extrairUrlsDeAssets(valor: string): string[] {
  return valor
    .split(/\r?\n|(?<=\S)\s*[;,]\s*(?=https?:\/\/)/)
    .map((url) => url.trim())
    .filter((url) => url.startsWith("http"));
}

export function classificarPlacementImagem(url: string, indice = 0): string {
  // 1. Dimensoes em pixel sao o sinal mais preciso quando aparecem.
  if (url.includes("1080x1080")) return "feed";
  if (url.includes("1080x1920")) return "stories";
  if (url.includes("1200x628")) return "horizontal";

  // 2. Convencao do time de design da Evino/GrandCru: o nome do arquivo
  //    indica o corte ("kit_horizontal.jpg", "vertical-xyz.png",
  //    "EST-quadrado.png"). Sem essa deteccao, o readiness reportava
  //    "Faltam cortes recomendados" mesmo com 3 imagens corretamente
  //    nomeadas, e fotos de referencia entravam misturadas com o
  //    placement "formato_X" — o operador via "ele nao sabia qual subir".
  const normalizado = normalizarTexto(url);
  if (normalizado.includes("horizontal") || normalizado.includes("landscape")) {
    return "horizontal";
  }
  if (normalizado.includes("vertical") || normalizado.includes("stories")) {
    return "stories";
  }
  if (normalizado.includes("quadrado") || normalizado.includes("square")) {
    return "feed";
  }

  return `formato_${indice + 1}`;
}

export function normalizarPlacementImagem(
  placement: string | null | undefined,
  assetUrl?: string | null
): string {
  const valor = normalizarTexto(placement ?? "");

  if (valor === "feed" || valor === "quadrado" || valor === "square") {
    return "feed";
  }

  if (valor === "stories" || valor === "story" || valor === "vertical") {
    return "stories";
  }

  if (valor === "horizontal" || valor === "landscape") {
    return "horizontal";
  }

  if (valor === "reels" || valor === "reel") {
    if ((assetUrl ?? "").includes("1200x628")) return "horizontal";
    return "stories";
  }

  return placement?.trim() || "";
}

export function extrairImageAssets(linkVideo: string): { placement: string; url: string }[] {
  return extrairUrlsDeAssets(linkVideo).map((url, indice) => ({
    placement: classificarPlacementImagem(url, indice),
    url,
  }));
}

export function rotuloPlacementImagem(
  placement: string | null | undefined,
  assetUrl?: string | null
): string {
  const normalizado = normalizarPlacementImagem(placement, assetUrl);

  if (normalizado === "feed") return "Quadrado";
  if (normalizado === "stories") return "Vertical";
  if (normalizado === "horizontal") return "Horizontal";
  return placement?.trim() || "Formato";
}
