import {
  extrairImageAssets,
  normalizarPlacementImagem,
  rotuloPlacementImagem,
} from "./ad-media";
import { VALID_CTA_VALUES } from "./constants";

export interface AssetImagemValidavel {
  placement: string;
  url: string;
}

export interface AnuncioValidavel {
  tipo: "video" | "image";
  adSetId?: string | null;
  adName?: string | null;
  linkVideo?: string | null;
  linkAnuncio?: string | null;
  imageAssets?: AssetImagemValidavel[];
  texto_principal?: string | null;
  titulo?: string | null;
  descricao?: string | null;
  cta?: string | null;
}

export interface AvisoAnuncio {
  nivel: "erro" | "aviso";
  codigo: string;
  mensagem: string;
}

export interface DiagnosticoAnuncio {
  prontoParaSubir: boolean;
  bloqueios: AvisoAnuncio[];
  avisos: AvisoAnuncio[];
  imageAssetsNormalizados: AssetImagemValidavel[];
}

const CHARS_PROIBIDOS_INICIO = new Set(["\\", "/", "!", ".", "?", "-", "*", "(", ")", ",", ";", ":"]);

function validarTextoMeta(texto: string, campo: string): AvisoAnuncio[] {
  const avisos: AvisoAnuncio[] = [];

  // 1. Primeiro caractere proibido (ignora emojis — charAt(0) pode ser metade de surrogate)
  const primeiro = [...texto][0] ?? "";
  if (primeiro.length === 1 && CHARS_PROIBIDOS_INICIO.has(primeiro)) {
    avisos.push({
      nivel: "aviso",
      codigo: `${campo}_char_proibido`,
      mensagem: `'${campo}' começa com caractere proibido (${primeiro})`,
    });
  }

  // 2. Pontuação ASCII consecutiva (exceto ...)
  // Usa classe explícita de pontuação ASCII — emojis e acentos NÃO contam.
  const matchesPontuacao = texto.match(/[!?.,;:*#@&%$^~(){}\[\]<>\\/"'-]{3,}/g);
  if (matchesPontuacao) {
    const temProblematica = matchesPontuacao.some((m) => m !== "...");
    if (temProblematica) {
      avisos.push({
        nivel: "aviso",
        codigo: `${campo}_pontuacao_consecutiva`,
        mensagem: `'${campo}' contém pontuação consecutiva`,
      });
    }
  }

  // 3. Palavra com mais de 30 caracteres
  const palavras = texto.split(/\s+/).filter(Boolean);
  if (palavras.some((p) => p.length > 30)) {
    avisos.push({
      nivel: "aviso",
      codigo: `${campo}_palavra_longa`,
      mensagem: `'${campo}' contém palavra com mais de 30 caracteres`,
    });
  }

  // 4. Muitas palavras de 1 caractere
  const palavrasCurtas = palavras.filter((p) => p.length === 1);
  if (palavrasCurtas.length > 3) {
    avisos.push({
      nivel: "aviso",
      codigo: `${campo}_palavras_curtas`,
      mensagem: `'${campo}' contém muitas palavras de um caractere (${palavrasCurtas.length})`,
    });
  }

  return avisos;
}

function ehUrlHttp(valor: string | null | undefined): boolean {
  return /^https?:\/\//i.test((valor ?? "").trim());
}

function obterImageAssets(input: AnuncioValidavel): AssetImagemValidavel[] {
  const assetsOriginais = input.imageAssets?.length
    ? input.imageAssets
    : extrairImageAssets(input.linkVideo ?? "");

  return assetsOriginais
    .filter((asset) => ehUrlHttp(asset.url))
    .map((asset) => ({
      placement: normalizarPlacementImagem(asset.placement, asset.url),
      url: asset.url.trim(),
    }));
}

export function analisarProntidaoAnuncio(input: AnuncioValidavel): DiagnosticoAnuncio {
  const bloqueios: AvisoAnuncio[] = [];
  const avisos: AvisoAnuncio[] = [];

  if (!input.adName?.trim()) {
    bloqueios.push({
      nivel: "erro",
      codigo: "ad_name_missing",
      mensagem: "Sem nome do anúncio.",
    });
  }

  if (!input.adSetId?.trim()) {
    bloqueios.push({
      nivel: "erro",
      codigo: "ad_set_id_missing",
      mensagem: "Sem Ad Set ID. O anúncio pode ser salvo, mas não sobe para a Meta.",
    });
  }

  if (!input.linkAnuncio?.trim()) {
    avisos.push({
      nivel: "aviso",
      codigo: "link_missing",
      mensagem: "Sem link da campanha/UTM. O criativo pode falhar na Meta dependendo do objetivo.",
    });
  }

  if (input.tipo === "video") {
    if (!ehUrlHttp(input.linkVideo)) {
      bloqueios.push({
        nivel: "erro",
        codigo: "video_missing",
        mensagem: "Sem URL válida de vídeo.",
      });
    } else if (input.linkVideo && !input.linkVideo.includes("drive.google.com")) {
      avisos.push({
        nivel: "aviso",
        codigo: "video_url_nao_drive",
        mensagem: "URL do vídeo não parece ser do Google Drive. O upload pode falhar.",
      });
    }
  }

  const imageAssetsNormalizados = input.tipo === "image" ? obterImageAssets(input) : [];

  if (input.tipo === "image") {
    if (imageAssetsNormalizados.length === 0) {
      bloqueios.push({
        nivel: "erro",
        codigo: "image_missing",
        mensagem: "Sem imagens válidas para o criativo estático.",
      });
    }

    const contagemPorPlacement = new Map<string, number>();
    for (const asset of imageAssetsNormalizados) {
      contagemPorPlacement.set(
        asset.placement,
        (contagemPorPlacement.get(asset.placement) ?? 0) + 1
      );
    }

    const duplicados = Array.from(contagemPorPlacement.entries()).filter(([, total]) => total > 1);
    if (duplicados.length > 0) {
      bloqueios.push({
        nivel: "erro",
        codigo: "duplicate_placements",
        mensagem: `Há cortes duplicados: ${duplicados
          .map(([placement]) => rotuloPlacementImagem(placement))
          .join(", ")}.`,
      });
    }

    const obrigatorios = ["feed", "stories", "horizontal"];
    const faltantes = obrigatorios.filter((placement) => !contagemPorPlacement.has(placement));

    if (faltantes.length > 0 && imageAssetsNormalizados.length > 0) {
      avisos.push({
        nivel: "aviso",
        codigo: "missing_crops",
        mensagem: `Faltam cortes recomendados: ${faltantes
          .map((placement) => rotuloPlacementImagem(placement))
          .join(", ")}.`,
      });
    }
  }

  // ── QW-6: Missing copy warnings ──────────────────────────────
  if (!input.texto_principal?.trim()) {
    avisos.push({
      nivel: "aviso",
      codigo: "texto_principal_vazio",
      mensagem: "Texto principal esta vazio",
    });
  }

  if (!input.titulo?.trim()) {
    avisos.push({
      nivel: "aviso",
      codigo: "titulo_vazio",
      mensagem: "Titulo esta vazio",
    });
  }

  if (!input.descricao?.trim()) {
    avisos.push({
      nivel: "aviso",
      codigo: "descricao_vazia",
      mensagem: "Descricao esta vazia",
    });
  }

  // ── QW-5: Text length warnings ─────────────────────────────
  if (input.texto_principal && input.texto_principal.trim().length > 125) {
    avisos.push({
      nivel: "aviso",
      codigo: "texto_principal_longo",
      mensagem: "Texto principal excede 125 caracteres (recomendado pelo Meta)",
    });
  }

  if (input.titulo && input.titulo.trim().length > 50) {
    avisos.push({
      nivel: "aviso",
      codigo: "titulo_longo",
      mensagem: "Titulo excede 50 caracteres (recomendado pelo Meta)",
    });
  }

  if (input.descricao && input.descricao.trim().length > 30) {
    avisos.push({
      nivel: "aviso",
      codigo: "descricao_longa",
      mensagem: "Descricao excede 30 caracteres (recomendado pelo Meta)",
    });
  }

  // ── Meta text validation rules ─────────────────────────────
  if (input.texto_principal?.trim()) {
    avisos.push(...validarTextoMeta(input.texto_principal.trim(), "texto_principal"));
  }
  if (input.titulo?.trim()) {
    avisos.push(...validarTextoMeta(input.titulo.trim(), "titulo"));
  }
  if (input.descricao?.trim()) {
    avisos.push(...validarTextoMeta(input.descricao.trim(), "descricao"));
  }

  // ── Hard limit blockers ────────────────────────────────────
  if (input.texto_principal && input.texto_principal.length > 2200) {
    bloqueios.push({
      nivel: "erro",
      codigo: "texto_principal_hard_limit",
      mensagem: "Texto principal excede o limite absoluto de 2200 caracteres do Meta",
    });
  }
  if (input.titulo && input.titulo.length > 255) {
    bloqueios.push({
      nivel: "erro",
      codigo: "titulo_hard_limit",
      mensagem: "Titulo excede o limite absoluto de 255 caracteres do Meta",
    });
  }
  if (input.descricao && input.descricao.length > 255) {
    bloqueios.push({
      nivel: "erro",
      codigo: "descricao_hard_limit",
      mensagem: "Descricao excede o limite absoluto de 255 caracteres do Meta",
    });
  }

  // ── QW-7: CTA validation ───────────────────────────────────
  if (input.cta && input.cta.trim() && !VALID_CTA_VALUES.includes(input.cta.trim())) {
    bloqueios.push({
      nivel: "erro",
      codigo: "cta_invalido",
      mensagem: `CTA invalido: '${input.cta.trim()}'. Valores aceitos: SHOP_NOW, LEARN_MORE, etc.`,
    });
  }

  return {
    prontoParaSubir: bloqueios.length === 0,
    bloqueios,
    avisos,
    imageAssetsNormalizados,
  };
}
