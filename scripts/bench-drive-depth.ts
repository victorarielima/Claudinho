#!/usr/bin/env npx tsx
/**
 * Benchmark do explorador de vídeos do Drive em diferentes profundidades.
 *
 * Uso:
 *   npx tsx scripts/bench-drive-depth.ts            # testa profundidades 1..6
 *   npx tsx scripts/bench-drive-depth.ts 2 4 6      # testa profundidades específicas
 */

import "dotenv/config";
import { google } from "googleapis";
import { getGoogleAuth } from "../src/lib/google-auth";

const SHARED_DRIVE_PARAMS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
} as const;

interface PastaNode {
  id: string;
  nome: string;
  filhos: PastaNode[];
}

interface Stats {
  pastas: number;
  videos: number;
  apiCallsPastas: number;
  apiCallsVideos: number;
  msPastas: number;
  msVideos: number;
  msTotal: number;
}

function getDrive() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}

async function buscarPastas(
  drive: ReturnType<typeof getDrive>,
  folderId: string,
  depth: number,
  maxDepth: number,
  counters: { calls: number },
): Promise<PastaNode[]> {
  if (depth >= maxDepth) return [];

  const pastas: PastaNode[] = [];
  let pageToken: string | undefined;

  do {
    counters.calls++;
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      orderBy: "name desc",
      pageSize: 100,
      pageToken,
      ...SHARED_DRIVE_PARAMS,
    });

    const files = res.data.files ?? [];
    const filhos = await Promise.all(
      files.map(async (f) => {
        const sub = await buscarPastas(drive, f.id!, depth + 1, maxDepth, counters);
        return { id: f.id!, nome: f.name!, filhos: sub };
      }),
    );
    pastas.push(...filhos);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return pastas;
}

function coletarIds(pastas: PastaNode[]): string[] {
  const ids: string[] = [];
  for (const p of pastas) {
    ids.push(p.id);
    ids.push(...coletarIds(p.filhos));
  }
  return ids;
}

async function buscarVideosDePasta(
  drive: ReturnType<typeof getDrive>,
  folderId: string,
  counters: { calls: number },
): Promise<number> {
  let total = 0;
  let pageToken: string | undefined;
  do {
    counters.calls++;
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, videoMediaMetadata)",
      orderBy: "modifiedTime desc",
      pageSize: 100,
      pageToken,
      ...SHARED_DRIVE_PARAMS,
    });
    total += (res.data.files ?? []).length;
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return total;
}

async function buscarTodosVideos(
  drive: ReturnType<typeof getDrive>,
  ids: string[],
  counters: { calls: number },
): Promise<number> {
  let total = 0;
  const BATCH = 10;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const r = await Promise.all(batch.map((id) => buscarVideosDePasta(drive, id, counters)));
    total += r.reduce((a, b) => a + b, 0);
  }
  return total;
}

async function rodar(maxDepth: number): Promise<Stats> {
  const raiz = process.env.DRIVE_PASTA_VIDEOS;
  if (!raiz) throw new Error("DRIVE_PASTA_VIDEOS não configurada");

  const drive = getDrive();
  const counterPastas = { calls: 0 };
  const counterVideos = { calls: 0 };

  const t0 = Date.now();
  const pastas = await buscarPastas(drive, raiz, 0, maxDepth, counterPastas);
  const t1 = Date.now();

  const ids = coletarIds(pastas);
  ids.push(raiz);
  const totalVideos = await buscarTodosVideos(drive, ids, counterVideos);
  const t2 = Date.now();

  return {
    pastas: ids.length,
    videos: totalVideos,
    apiCallsPastas: counterPastas.calls,
    apiCallsVideos: counterVideos.calls,
    msPastas: t1 - t0,
    msVideos: t2 - t1,
    msTotal: t2 - t0,
  };
}

async function main() {
  const args = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
  const depths = args.length > 0 ? args : [1, 2, 3, 4, 5, 6];

  console.log(`\nBenchmark Drive — raiz=${process.env.DRIVE_PASTA_VIDEOS}\n`);
  console.log(
    "depth | pastas | videos | calls_p | calls_v | ms_pastas | ms_videos | ms_total",
  );
  console.log("------|--------|--------|---------|---------|-----------|-----------|---------");

  for (const d of depths) {
    try {
      const s = await rodar(d);
      console.log(
        `  ${String(d).padStart(2)}  | ${String(s.pastas).padStart(6)} | ${String(s.videos).padStart(6)} | ${String(s.apiCallsPastas).padStart(7)} | ${String(s.apiCallsVideos).padStart(7)} | ${String(s.msPastas).padStart(9)} | ${String(s.msVideos).padStart(9)} | ${String(s.msTotal).padStart(7)}`,
      );
    } catch (err) {
      console.log(`  ${d}  | ERRO: ${(err as Error).message}`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
