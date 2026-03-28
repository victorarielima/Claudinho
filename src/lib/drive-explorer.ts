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

export interface IndiceCompleto {
  pastas: PastaDrive[];
  videos: VideoDrive[];
  totalVideos: number;
  carregadoEm: string;
}

// ---------------------------------------------------------------------------
// Drive client helper
// ---------------------------------------------------------------------------

function getDrive() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}

const SHARED_DRIVE_PARAMS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
} as const;

// ---------------------------------------------------------------------------
// Cache — single index of everything (pastas + all videos)
// ---------------------------------------------------------------------------

let cacheIndice: { data: IndiceCompleto; timestamp: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Main: carregarIndiceCompleto
// Loads folder tree (2 levels) + ALL videos in one shot. Cached for 10min.
// ---------------------------------------------------------------------------

export async function carregarIndiceCompleto(): Promise<IndiceCompleto> {
  if (cacheIndice && Date.now() - cacheIndice.timestamp < CACHE_TTL_MS) {
    return cacheIndice.data;
  }

  const raiz = process.env.DRIVE_PASTA_VIDEOS;
  if (!raiz) {
    throw new Error("DRIVE_PASTA_VIDEOS não configurada.");
  }

  const drive = getDrive();
  const mapaNomes = new Map<string, string>();

  // Step 1: collect ALL folder IDs recursively (2 levels for tree, unlimited for video search)
  const pastas = await buscarPastasRecursivo(drive, raiz, 0, 2, mapaNomes);

  // Step 2: collect ALL folder IDs (unlimited depth) for video search
  const todosIds = coletarTodosIds(pastas);
  todosIds.push(raiz);

  // Step 3: fetch ALL videos across all folders in parallel batches
  const videos = await buscarTodosVideos(drive, todosIds, mapaNomes);

  // Sort by date desc
  videos.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());

  const indice: IndiceCompleto = {
    pastas,
    videos,
    totalVideos: videos.length,
    carregadoEm: new Date().toISOString(),
  };

  cacheIndice = { data: indice, timestamp: Date.now() };

  return indice;
}

/** Invalidate the cache (e.g. when user wants fresh data) */
export function invalidarCache(): void {
  cacheIndice = null;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function buscarPastasRecursivo(
  drive: ReturnType<typeof getDrive>,
  folderId: string,
  depth: number,
  maxDepth: number,
  mapaNomes: Map<string, string>,
): Promise<PastaDrive[]> {
  if (depth >= maxDepth) return [];

  const pastas: PastaDrive[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name, modifiedTime)",
      orderBy: "name desc",
      pageSize: 100,
      pageToken,
      ...SHARED_DRIVE_PARAMS,
    });

    const files = res.data.files ?? [];

    const promises = files.map(async (f) => {
      mapaNomes.set(f.id!, f.name!);
      const filhos = await buscarPastasRecursivo(drive, f.id!, depth + 1, maxDepth, mapaNomes);
      return { id: f.id!, nome: f.name!, modifiedTime: f.modifiedTime!, filhos };
    });

    pastas.push(...(await Promise.all(promises)));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return pastas;
}

function coletarTodosIds(pastas: PastaDrive[]): string[] {
  const ids: string[] = [];
  for (const p of pastas) {
    ids.push(p.id);
    ids.push(...coletarTodosIds(p.filhos));
  }
  return ids;
}

function detectarFormato(w: number | null, h: number | null): FormatoVideo {
  if (w == null || h == null) return "unknown";
  const ratio = w / h;
  if (ratio < 0.9) return "portrait";
  if (ratio > 1.1) return "landscape";
  return "square";
}

async function buscarTodosVideos(
  drive: ReturnType<typeof getDrive>,
  folderIds: string[],
  mapaNomes: Map<string, string>,
): Promise<VideoDrive[]> {
  const allVideos: VideoDrive[] = [];

  // Process folders in parallel batches of 10 to avoid API rate limits
  const BATCH_SIZE = 10;
  for (let i = 0; i < folderIds.length; i += BATCH_SIZE) {
    const batch = folderIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((fid) => buscarVideosDePasta(drive, fid, mapaNomes)),
    );
    for (const videos of batchResults) {
      allVideos.push(...videos);
    }
  }

  return allVideos;
}

async function buscarVideosDePasta(
  drive: ReturnType<typeof getDrive>,
  folderId: string,
  mapaNomes: Map<string, string>,
): Promise<VideoDrive[]> {
  const videos: VideoDrive[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, videoMediaMetadata)",
      orderBy: "modifiedTime desc",
      pageSize: 100,
      pageToken,
      ...SHARED_DRIVE_PARAMS,
    });

    for (const f of res.data.files ?? []) {
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

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return videos;
}
