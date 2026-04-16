# 12. Upload de mídia: vídeo & imagem

## Páginas oficiais

- Ad Videos (edge): https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/
- Ad Images (edge): https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages/
- Video Ads guide: https://developers.facebook.com/docs/marketing-api/guides/videoads/
- Resumable Upload API: https://developers.facebook.com/docs/graph-api/guides/upload/

---

## Upload de vídeo

### Dois modos: simples vs. chunked

Ponto de corte: **50 MB** (threshold usado pelo Claudinho em
`src/lib/meta-criar.ts`).

| Modo | Endpoint | Quando |
|---|---|---|
| **Simples** (multipart) | `POST /{accountId}/advideos` | Vídeos < 50 MB |
| **Chunked** (3 fases) | `POST /{accountId}/advideos` | Vídeos ≥ 50 MB |

### Modo simples

```
POST https://graph.facebook.com/v23.0/act_{id}/advideos
Content-Type: multipart/form-data

source: <Blob> (arquivo de vídeo)
title: <string>  (nome do arquivo)
access_token: <string>

Response:
{ "id": "video_id" }
```

### Modo chunked (3 fases)

#### Fase 1 — START

```
POST /{accountId}/advideos
Content-Type: application/x-www-form-urlencoded

upload_phase=start
file_size=<totalBytes>
access_token=<token>

Response:
{
  "upload_session_id": "session",
  "video_id": "id_final",
  "start_offset": "0",
  "end_offset": "<chunkSize>"
}
```

#### Fase 2 — TRANSFER (repetir até cobrir todo o arquivo)

```
POST /{accountId}/advideos
Content-Type: multipart/form-data

upload_phase=transfer
upload_session_id=<session>
start_offset=<current_offset>
video_file_chunk=<Blob de até 4 MB>
access_token=<token>

Response:
{
  "start_offset": "<next_offset>",
  "end_offset": "<next_end>"
}
```

> **Gotcha crítico**: use o `start_offset` da **resposta** para o
> próximo chunk, não o valor calculado localmente. O Meta pode
> reagrupar chunks.

#### Fase 3 — FINISH

```
POST /{accountId}/advideos
Content-Type: application/x-www-form-urlencoded

upload_phase=finish
upload_session_id=<session>
title=<string>
access_token=<token>

Response:
{ "success": true }
```

O `video_id` retornado em Fase 1 é o id final — use ele no creative.

### Polling de processamento

Meta processa o vídeo de forma assíncrona. Antes de criar o creative,
aguardar `status.video_status == "ready"`:

```
GET /{videoId}?fields=status&access_token=...

Response: { "status": { "video_status": "ready" | "processing" | "error" } }
```

No Claudinho: `aguardarProcessamentoVideo()` faz até 30 tentativas
com intervalos crescentes de 5–15s (timeout total ~5min).

> **Gotcha**: criar o creative com vídeo `processing` gera ad
> `WITH_ISSUES`. Sempre aguardar `ready`.

### Especificação do vídeo

| Spec | Feed | Stories/Reels | In-Stream |
|---|---|---|---|
| Aspect ratio | 1:1 ou 4:5 | 9:16 | 16:9 |
| Duração | 1s – 241min | 1–120s | 5–15s |
| Resolução recomendada | 1080×1080+ | 1080×1920 | 1920×1080 |

- Formatos: MP4, MOV (preferir MP4).
- Codecs: H.264 (video), AAC (audio) 128 kbps+.
- Tamanho max: 4 GB (chunked).
- Thumbnail: auto-gerado ou passado em `image_url` dentro de `video_data`.

### Thumbnail

```
GET /{videoId}?fields=picture,thumbnails&access_token=...

Response: {
  "picture": "https://...",
  "thumbnails": { "data": [
    { "uri": "...", "is_preferred": true },
    ...
  ]}
}
```

O Claudinho prefere `thumbnails.data[0]` com `is_preferred=true`,
cai para `picture` como fallback (`buscarThumbnailVideo()`).

### Idempotência

Antes de reenviar: se `ad_assets.meta_asset_id` já existe, pular o
upload. Se não, fazer upload e gravar o id.

---

## Upload de imagem

### Endpoint

```
POST /{accountId}/adimages
Content-Type: multipart/form-data

filename: <Blob>  (nome do arquivo vira o key no response)
access_token: <string>

Response:
{
  "images": {
    "<filename>": {
      "hash": "<image_hash>",
      "url": "https://..."
    }
  }
}
```

> **O que retorna é um HASH**, não um ID. O hash é o que vai em
> `image_hash` dentro de `link_data` ou `asset_feed_spec.images[i].hash`.

### Multipart vs. URL field

A API aceita também `?url=https://...` com o file já público, mas
**esse método exige permissões avançadas do app**. Multipart funciona
com app em modo desenvolvimento. O Claudinho usa multipart.

### Especificação de imagem

| Placement | Aspect | Recomendado | Min |
|---|---|---|---|
| Feed (FB+IG) | 1:1 | 1080×1080 | 600×600 |
| Stories/Reels | 9:16 | 1080×1920 | 600×1067 |
| Right Column / Horizontal | 1.91:1 | 1200×628 | 600×314 |
| Carousel | 1:1 | 1080×1080 | 600×600 |

- Formatos: JPG, PNG.
- Max file size: 30 MB.
- Min width: 600px.

### Detecção de placement (no Claudinho)

Heurística por URL/dimensão em `classificarPlacementImagem()`:

| Token na URL | Placement |
|---|---|
| `1080x1080` | `feed` |
| `1080x1920` | `stories` |
| `1200x628` | `horizontal` |
| `feed`, `square`, `quadrado` | `feed` |
| `stories`, `story`, `vertical`, `reels` | `stories` (exceção: se URL tiver `1200x628`, vai para `horizontal`) |
| `horizontal`, `landscape` | `horizontal` |

### Validações pré-upload (Claudinho)

`src/lib/ad-readiness.ts`:

- Pelo menos 1 imagem válida (URL começa com `http`).
- Sem placements duplicados.
- Warning se falta `feed`/`stories`/`horizontal`.
- Warnings de copy (125 chars, 40 chars, 30 chars) + hard limits
  (2200/255/255) + primeiro char proibido + pontuação consecutiva.

---

## Checklist de debug de upload

1. **Vídeo fica "processando"** > 5min: verificar status direto na
   API; se `error`, olhar formato/codec/resolução.
2. **Chunked falha no meio**: conferir que `start_offset` do Meta
   está sendo usado; retry do chunk específico com o offset retornado.
3. **Imagem retorna erro 400**: confirmar que o Blob tem Content-Type
   correto (use `new Blob([buffer])` sem tipo explícito é ok no
   Meta; com tipo errado retorna `invalid_content_type`).
4. **Erro #200 em upload**: app não tem escopo `ads_management` para
   a conta, ou o System User não foi associado à ad account.
5. **Hash da imagem vem `null`**: checar se o arquivo foi baixado
   com sucesso antes de enviar (problema comum quando a URL original
   retorna 403/404).
