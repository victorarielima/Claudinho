import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PastaDrive {
  id: string;
  nome: string;
  modifiedTime: string;
  filhos: PastaDrive[];
}

export type FormatoVideo = "portrait" | "landscape" | "square" | "unknown";

export interface VideoDrive {
  id: string;
  nome: string;
  mimeType: string;
  tamanho: number;
  duracao: number | null;
  largura: number | null;
  altura: number | null;
  formato: FormatoVideo;
  modifiedTime: string;
  thumbnailLink: string | null;
  pastaOrigem: string;
  pastaId: string;
  driveUrl: string;
}

export type StreamEvento =
  | { tipo: "raiz"; raizId: string }
  | { tipo: "pastas"; parentId: string; filhos: PastaDrive[] }
  | { tipo: "videos"; videos: VideoDrive[] }
  | { tipo: "fim" }
  | { tipo: "erro"; mensagem: string };

export type EmitFn = (ev: StreamEvento) => void;

// ---------------------------------------------------------------------------
// Drive client + constants
// ---------------------------------------------------------------------------

function getDrive() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}

const SHARED_DRIVE_PARAMS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
} as const;

const MAX_DEPTH = 8;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CONCURRENCIA = 20;
const FOLDER_MIME = "application/vnd.google-apps.folder";

// ---------------------------------------------------------------------------
// Cache (full result, populated after a complete walk)
// ---------------------------------------------------------------------------

interface CacheCompleto {
  pastas: PastaDrive[];
  raizId: string;
  videos: VideoDrive[];
  timestamp: number;
}

let cacheCompleto: CacheCompleto | null = null;

export function invalidarCacheDrive() {
  cacheCompleto = null;
}

// ---------------------------------------------------------------------------
// Public: explorar(emit)
// Walks the Drive tree level by level, sorted by modifiedTime desc within
// each level, processing folders concurrently with a worker pool. Calls
// `emit` with each event as it's discovered.
// ---------------------------------------------------------------------------

export async function explorar(emit: EmitFn): Promise<void> {
  const raiz = process.env.DRIVE_PASTA_VIDEOS;
  if (!raiz) {
    emit({ tipo: "erro", mensagem: "DRIVE_PASTA_VIDEOS não configurada." });
    return;
  }

  // Cache hit → emit everything from memory
  if (cacheCompleto && Date.now() - cacheCompleto.timestamp < CACHE_TTL_MS) {
    emit({ tipo: "raiz", raizId: cacheCompleto.raizId });
    emitirArvoreDoCache(emit, cacheCompleto.pastas, cacheCompleto.raizId);
    if (cacheCompleto.videos.length > 0) {
      emit({ tipo: "videos", videos: cacheCompleto.videos });
    }
    emit({ tipo: "fim" });
    return;
  }

  emit({ tipo: "raiz", raizId: raiz });

  const drive = getDrive();
  const mapaNomes = new Map<string, string>();
  const todosVideos: VideoDrive[] = [];
  const filhosPorParent = new Map<string, PastaDrive[]>();

  type Item = { id: string; modifiedTime: string; depth: number };
  let nivelAtual: Item[] = [
    { id: raiz, modifiedTime: new Date().toISOString(), depth: 0 },
  ];

  try {
    while (nivelAtual.length > 0) {
      // Sort: most recent first → events emit in recency order
      nivelAtual.sort(
        (a, b) =>
          new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime(),
      );

      const proximoNivel: Item[] = [];

      // Worker pool: CONCURRENCIA workers pulling from a shared index
      let nextIdx = 0;
      const items = nivelAtual;

      async function worker() {
        while (true) {
          const i = nextIdx++;
          if (i >= items.length) return;
          const item = items[i];
          if (item.depth >= MAX_DEPTH) continue;

          const { subpastas, videos } = await listarConteudoPasta(
            drive,
            item.id,
            mapaNomes,
          );

          if (subpastas.length > 0) {
            filhosPorParent.set(item.id, subpastas);
            emit({ tipo: "pastas", parentId: item.id, filhos: subpastas });
            for (const sf of subpastas) {
              proximoNivel.push({
                id: sf.id,
                modifiedTime: sf.modifiedTime,
                depth: item.depth + 1,
              });
            }
          }
          if (videos.length > 0) {
            todosVideos.push(...videos);
            emit({ tipo: "videos", videos });
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCIA, items.length) }, () => worker()),
      );

      nivelAtual = proximoNivel;
    }

    todosVideos.sort(
      (a, b) =>
        new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime(),
    );
    cacheCompleto = {
      pastas: construirArvore(raiz, filhosPorParent),
      raizId: raiz,
      videos: todosVideos,
      timestamp: Date.now(),
    };

    emit({ tipo: "fim" });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
    emit({ tipo: "erro", mensagem });
  }
}

// ---------------------------------------------------------------------------
// Cache emission
// ---------------------------------------------------------------------------

function emitirArvoreDoCache(
  emit: EmitFn,
  pastas: PastaDrive[],
  parentId: string,
) {
  if (pastas.length > 0) {
    emit({
      tipo: "pastas",
      parentId,
      filhos: pastas.map((p) => ({
        id: p.id,
        nome: p.nome,
        modifiedTime: p.modifiedTime,
        filhos: [],
      })),
    });
  }
  for (const p of pastas) {
    emitirArvoreDoCache(emit, p.filhos, p.id);
  }
}

function construirArvore(
  rootId: string,
  filhosPorParent: Map<string, PastaDrive[]>,
): PastaDrive[] {
  const filhos = filhosPorParent.get(rootId) ?? [];
  return filhos.map((c) => ({
    id: c.id,
    nome: c.nome,
    modifiedTime: c.modifiedTime,
    filhos: construirArvore(c.id, filhosPorParent),
  }));
}

// ---------------------------------------------------------------------------
// Drive listing — combined query (folders + videos in one call)
// ---------------------------------------------------------------------------

function detectarFormato(w: number | null, h: number | null): FormatoVideo {
  if (w == null || h == null) return "unknown";
  const ratio = w / h;
  if (ratio < 0.9) return "portrait";
  if (ratio > 1.1) return "landscape";
  return "square";
}

async function listarConteudoPasta(
  drive: ReturnType<typeof getDrive>,
  folderId: string,
  mapaNomes: Map<string, string>,
): Promise<{ subpastas: PastaDrive[]; videos: VideoDrive[] }> {
  const subpastas: PastaDrive[] = [];
  const videos: VideoDrive[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and (mimeType = '${FOLDER_MIME}' or mimeType contains 'video/') and trashed = false`,
      fields:
        "nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, videoMediaMetadata)",
      pageSize: 1000,
      pageToken,
      ...SHARED_DRIVE_PARAMS,
    });

    for (const f of res.data.files ?? []) {
      if (f.mimeType === FOLDER_MIME) {
        mapaNomes.set(f.id!, f.name!);
        subpastas.push({
          id: f.id!,
          nome: f.name!,
          modifiedTime: f.modifiedTime ?? new Date(0).toISOString(),
          filhos: [],
        });
      } else {
        const w = f.videoMediaMetadata?.width ? Number(f.videoMediaMetadata.width) : null;
        const h = f.videoMediaMetadata?.height ? Number(f.videoMediaMetadata.height) : null;
        videos.push({
          id: f.id!,
          nome: f.name ?? "",
          mimeType: f.mimeType ?? "video/mp4",
          tamanho: Number(f.size ?? 0),
          duracao: f.videoMediaMetadata?.durationMillis
            ? Math.round(Number(f.videoMediaMetadata.durationMillis) / 1000)
            : null,
          largura: w,
          altura: h,
          formato: detectarFormato(w, h),
          modifiedTime: f.modifiedTime ?? "",
          thumbnailLink: f.thumbnailLink ?? null,
          pastaOrigem: mapaNomes.get(folderId) ?? folderId,
          pastaId: folderId,
          driveUrl: `https://drive.google.com/file/d/${f.id}/view`,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return { subpastas, videos };
}
