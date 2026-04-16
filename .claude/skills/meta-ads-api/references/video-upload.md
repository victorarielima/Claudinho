# references/video-upload.md — Upload de vídeo

## Threshold

- **< 50 MB** → Upload simples (multipart).
- **≥ 50 MB** → Upload chunked (3 fases).

Constante: `CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024` em
`src/lib/meta-criar.ts`. Chunk size: `4 MB`.

---

## Upload simples

```
POST /act_{ID}/advideos
Content-Type: multipart/form-data

source: <Blob> (vídeo)
title:  <string>
access_token: <string>

Response: { "id": "video_id" }
```

Uso: `uploadVideoSimples()` em `meta-criar.ts`.

---

## Upload chunked (3 fases)

### Fase 1 — START

```
POST /act_{ID}/advideos
Content-Type: application/x-www-form-urlencoded

upload_phase=start
file_size=<totalBytes>
access_token=<token>

Response: {
  "upload_session_id": "session",
  "video_id": "id_final",                // ← esse é o id a usar depois
  "start_offset": "0",
  "end_offset": "<chunkSize>"
}
```

### Fase 2 — TRANSFER (loop)

```
POST /act_{ID}/advideos
Content-Type: multipart/form-data

upload_phase=transfer
upload_session_id=<session>
start_offset=<current>
video_file_chunk=<Blob até 4MB>
access_token=<token>

Response: {
  "start_offset": "<next_offset>",
  "end_offset":   "<next_end>"
}
```

**⚠ CRÍTICO**: usar o `start_offset` da **resposta** para o próximo
chunk, não o valor calculado localmente. A Meta pode reagrupar.

### Fase 3 — FINISH

```
POST /act_{ID}/advideos
Content-Type: application/x-www-form-urlencoded

upload_phase=finish
upload_session_id=<session>
title=<string>
access_token=<token>

Response: { "success": true }
```

O `video_id` retornado na Fase 1 é o id final para usar no creative.

Uso: `uploadVideoChunked()` em `meta-criar.ts` (versão que espera
processamento), e `uploadVideoChunkedSemAguardar()` no pipeline de
processamento (não bloqueia para retornar imediatamente).

---

## Polling de processamento

```
GET /{videoId}?fields=status&access_token=<token>

Response: { "status": { "video_status": "ready" | "processing" | "error" } }
```

Config do Claudinho (`aguardarProcessamentoVideo()`):

- Máx 30 tentativas
- Intervalo: 5s + 2s × tentativa (cap em 15s)
- Timeout total ≈ 5 minutos

**⚠** Criar creative com vídeo ainda `processing` → ad fica
`WITH_ISSUES`. Sempre esperar `ready`.

No pipeline novo (`processar/route.ts`), o Step B faz polling **não
bloqueante**: `verificarStatusVideo()` é chamado uma vez por tick
do cliente; se não está ready, retorna `step=processing_video` e o
cliente polleia de novo em 5s.

---

## Thumbnail

```
GET /{videoId}?fields=picture,thumbnails&access_token=<token>

Response: {
  "picture": "https://...",
  "thumbnails": { "data": [
    { "uri": "...", "is_preferred": true },
    ...
  ]}
}
```

Preferência:
1. `thumbnails.data[i].is_preferred == true`
2. `thumbnails.data[0]`
3. `picture`

Uso: `buscarThumbnailVideo()` em `meta-criar.ts`.

---

## Specs de vídeo (para validação pré-upload)

| Spec | Feed | Stories/Reels | In-Stream |
|---|---|---|---|
| Aspect | 1:1 ou 4:5 | 9:16 | 16:9 |
| Duração | 1s – 241min | 1–120s | 5–15s |
| Resolução | 1080×1080+ | 1080×1920 | 1920×1080 |
| Formato | MP4 preferred | MP4 | MP4 |
| Codec video | H.264 | H.264 | H.264 |
| Codec audio | AAC 128k+ | AAC 128k+ | AAC 128k+ |
| Max file | 4 GB | 4 GB | 4 GB |

---

## Idempotência

```ts
// Skip re-upload se já tem id
if (videoAsset.meta_asset_id) return videoAsset.meta_asset_id
```

No pipeline: `stepUploadAssets()` checa antes de fazer upload.

---

## Gotchas comuns

1. **URL de Drive inacessível**: erro ao baixar do Drive antes de
   subir. Verificar se o arquivo foi compartilhado com a service
   account do Google.
2. **Video preso em `processing`**: geralmente formato/codec.
   Baixar e testar em `ffprobe`. Se o arquivo é OK, pode ser
   throttling temporário do Meta.
3. **Chunk size errado**: tentativa de chunks de 10+ MB pode
   falhar. Manter 4 MB.
4. **Thumbnail vazio**: se `picture` e `thumbnails.data` ambos
   vazios, o Meta ainda não gerou. Esperar `video_status=ready`
   primeiro.
