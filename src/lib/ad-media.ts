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

/**
 * Lê largura/altura direto do cabeçalho do arquivo (PNG, JPEG, WebP, GIF),
 * sem dependência. Retorna null se o formato não for reconhecido.
 */
export function lerDimensoesImagem(buf: Buffer): { largura: number; altura: number } | null {
  if (buf.length < 30) return null;

  // PNG: assinatura + IHDR (largura/altura big-endian nos bytes 16-23)
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
  }

  // GIF: "GIF8" + largura/altura little-endian nos bytes 6-9
  if (buf.toString("ascii", 0, 4) === "GIF8") {
    return { largura: buf.readUInt16LE(6), altura: buf.readUInt16LE(8) };
  }

  // WebP: "RIFF....WEBP" + chunk VP8 / VP8L / VP8X
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 ") {
      return { largura: buf.readUInt16LE(26) & 0x3fff, altura: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { largura: (b & 0x3fff) + 1, altura: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      return { largura: buf.readUIntLE(24, 3) + 1, altura: buf.readUIntLE(27, 3) + 1 };
    }
    return null;
  }

  // JPEG: percorre os segmentos até um SOFn (FFC0–FFCF, exceto C4/C8/CC)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marcador = buf[i + 1];
      if (marcador === 0xff) {
        i += 1;
        continue;
      }
      const tamanho = buf.readUInt16BE(i + 2);
      if (
        marcador >= 0xc0 &&
        marcador <= 0xcf &&
        marcador !== 0xc4 &&
        marcador !== 0xc8 &&
        marcador !== 0xcc
      ) {
        return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7) };
      }
      i += 2 + tamanho;
    }
  }

  return null;
}

/**
 * Placement pela proporção real da imagem — o sinal mais confiável (o nome
 * do arquivo no ClickUp costuma ser só data/“untitled”, sem o corte).
 *   9:16 (≈0.56) → stories · 1:1 e 4:5 → feed · 1.91:1 → horizontal
 */
export function placementPorDimensoes(largura: number, altura: number): string | null {
  if (!largura || !altura) return null;
  const proporcao = largura / altura;
  if (proporcao <= 0.7) return "stories";
  if (proporcao >= 1.4) return "horizontal";
  return "feed";
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
