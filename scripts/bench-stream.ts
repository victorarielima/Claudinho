#!/usr/bin/env npx tsx
/**
 * Testa o explorar() medindo o tempo até cada evento.
 */

import "dotenv/config";
import { explorar, type StreamEvento } from "../src/lib/drive-explorer";

async function main() {
  const t0 = Date.now();
  let primeiroVideo: number | null = null;
  let totalVideos = 0;
  let totalPastas = 0;
  let pastasEvents = 0;
  let videosEvents = 0;

  console.log(`\n[0ms] iniciando`);

  await explorar((ev: StreamEvento) => {
    const dt = Date.now() - t0;
    switch (ev.tipo) {
      case "raiz":
        console.log(`[${dt}ms] raiz: ${ev.raizId}`);
        break;
      case "pastas":
        pastasEvents++;
        totalPastas += ev.filhos.length;
        if (pastasEvents <= 3 || pastasEvents % 30 === 0) {
          console.log(
            `[${dt}ms] pastas #${pastasEvents}: parent=${ev.parentId.slice(0, 8)} +${ev.filhos.length} (acum ${totalPastas})`,
          );
        }
        break;
      case "videos":
        videosEvents++;
        totalVideos += ev.videos.length;
        if (primeiroVideo === null) primeiroVideo = dt;
        if (videosEvents <= 5 || videosEvents % 20 === 0) {
          console.log(
            `[${dt}ms] videos #${videosEvents}: +${ev.videos.length} (acum ${totalVideos})`,
          );
        }
        break;
      case "fim":
        console.log(`[${dt}ms] FIM`);
        break;
      case "erro":
        console.log(`[${dt}ms] ERRO: ${ev.mensagem}`);
        break;
    }
  });

  const total = Date.now() - t0;
  console.log(`\nResumo:`);
  console.log(`  primeiro vídeo:    ${primeiroVideo ?? "—"}ms`);
  console.log(`  total tempo:       ${total}ms`);
  console.log(`  total vídeos:      ${totalVideos}`);
  console.log(`  total pastas:      ${totalPastas}`);
  console.log(`  eventos pastas:    ${pastasEvents}`);
  console.log(`  eventos videos:    ${videosEvents}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
