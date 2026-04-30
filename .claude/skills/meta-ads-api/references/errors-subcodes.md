# references/errors-subcodes.md — Catálogo de erros & subcodes

## Estrutura do error body do Meta

```jsonc
{
  "error": {
    "message": "descrição técnica",
    "type": "OAuthException",
    "code": 100,
    "error_subcode": 1772103,
    "error_user_title": "Título amigável",
    "error_user_msg": "Mensagem amigável",    // ← preferir essa na UI
    "fbtrace_id": "AbCdEfGhIjK"
  }
}
```

No projeto: `extrairErroMeta()` em `src/lib/meta-criar.ts`;
classificação em `interpretarErroMeta()` em `src/lib/erros-meta.ts`.

## Códigos gerais (nível 1)

| Code | Significado | Retryable? |
|---|---|---|
| **4** | App-level rate limit | ✅ |
| **17** | User-level rate limit | ✅ |
| **32** | Page request limit | ✅ |
| **100** | Invalid parameter (categoria ampla) | ✅ (alguns casos) |
| **190** | OAuth token inválido | ❌ — renovar token |
| **200** | Permissão insuficiente | ❌ — rever scopes/roles |
| **341** | Application request limit | ✅ |
| **368** | Blocked por policy violations | ❌ — revisar políticas |
| **429** (HTTP) | Too Many Requests | ✅ |
| **500** (HTTP) | Erro interno Meta | ✅ |
| **613** | Ad-account rate limit | ✅ |
| **803** | Objeto não existe | ❌ — tratar como success em DELETE |
| **80004** | Ad-account rate limit | ✅ |

Retry do Claudinho: 4, 17, 32, 100, 613, 80004, HTTP 429.

## Subcodes encontrados em produção

| Subcode | Mensagem | Causa | Correção |
|---|---|---|---|
| **1772103** | "Select an Instagram account..." | Falta `instagram_user_id` | Resolver via page fields ou env |
| **1487742** | "too many calls from this ad-account" | Rate limit da conta | Backoff, reduzir concorrência |
| **2446811** | "max of 150 ads" | Campanha Advantage+ cheia | `deletarAdMeta()` antes do retry |
| **2446455** | "applink_treatment is required" | Cross-channel sem applink | Adicionar `applink_treatment` form-level |
| **2446461** | "omnichannel_link_spec needs to be within your asset_feed_spec" | Posição errada em multi-placement | Mover p/ `asset_feed_spec.link_urls[0]` |
| **1359187** | "Object store URLs are required" | `object_store_urls` ausente | Adicionar no local correto |
| **1487006** | Política (álcool/farmacêutico/etc) | Categoria/copy | Rever copy, targeting |
| **1487748** | "not eligible for this placement" | Asset formato errado | Reenviar no formato correto |
| **1363024** | "format that isn't supported" (acompanha `[code 352]`) | **Filename sem extensão `.mp4`/`.mov`/`.m4v`**. Meta usa a extensão pra inferir o container e, sem ela, rejeita com mensagem genérica de formato. Bytes podem estar perfeitamente válidos. | `uploadVideo()` em `src/lib/meta-criar.ts` sanitiza via `ensureVideoExtension()` — adiciona `.mp4` se faltar. Se ainda aparecer, é mesmo um codec/container não-H.264. |

### War story 2026-04-30 — isolamento da causa de 1363024

Ad `VID-0-IlMondoItalia-W18-2026`, brand GrandCru. Vídeo H.264 Main 1080×1920 60fps, 31.8 Mbps, AAC LC, faststart OK — todas as specs publicadas do Meta atendidas. Mesmo assim recebia 352/1363024.

Matriz de testes feita upando o mesmo arquivo de bytes com filenames diferentes:

| Filename | Extensão? | Espaço? | Acento? | Resultado |
|---|---|---|---|---|
| `30_ABR_GC_MOTION IL MONDO ITÁLIA ` (original) | ❌ | ✅ | ✅ | ❌ 352/1363024 |
| `MONDO_ITALIA` | ❌ | ❌ | ❌ | ❌ 352/1363024 |
| `MONDO_ITALIA.mp4` | ✅ | ❌ | ❌ | ✅ |
| `MONDO ITALIA.mp4` | ✅ | ✅ | ❌ | ✅ |
| `MONDO ITÁLIA.mp4` | ✅ | ✅ | ✅ | ✅ |
| `MONDO_ITÁLIA.mp4` | ✅ | ❌ | ✅ | ✅ |

**Conclusão:** a única variável que importa é a extensão do arquivo. Espaços e acentos são irrelevantes. Hipóteses iniciais de bitrate alto e codec não suportado eram falsas — vídeos a 37 Mbps subiam normal na conta de Evino.

A correção (`ensureVideoExtension` em `meta-criar.ts`) detecta filenames sem `.mp4`/`.mov`/`.m4v` e adiciona a extensão correta com base no `mimeType` (default `.mp4`).

## Mapeamento erro → regra em `erros-meta.ts`

| Subcode/texto | Regra (`interpretarErroMeta`) |
|---|---|
| `1772103` / "Select an Instagram account" | "Identidade do Instagram" |
| `2446811` / "maximum of 150 ads" | "Limite de ads da campanha" |
| `2446455` / "applink_treatment is required" | "Cross-channel sem applink" |
| `2446461` / "omnichannel_link_spec needs to be within" | "omnichannel_link_spec mal posicionado" |
| regex `video.*processing` / `video_status` | "Vídeo ainda processando" |
| `1363024` / `[code 352]` / "format that isn't supported" | "Formato de vídeo não suportado" |
| "não conseguiu processar o vídeo" | "Vídeo rejeitado pelo Meta" |
| "Falha ao baixar video do Drive" | "Vídeo sem acesso no Drive" |
| `OAuthException` / `(#190)` | "Token Meta inválido" |
| "Page ID nao encontrado" | "Page ID não configurado" |
| "Erro ao buscar account do adset" | "Ad Set inválido" |
| "Erro ao baixar imagem" | "Imagem não encontrada" |
| "Nenhuma imagem valida" | "Nenhuma imagem válida" |

Se um erro novo aparecer, adicionar em `REGRAS[]` em
`src/lib/erros-meta.ts` com marcador estável (string ou regex).

## Headers úteis para diagnóstico

- `x-business-use-case-usage` — uso atual do budget da BM (JSON)
- `x-ad-account-usage` — uso atual do ad-account (JSON)
- `Retry-After` (em HTTP 429) — segundos a esperar

## Playbook quando bater rate limit

1. Parar chamadas novas por 5 minutos mínimo.
2. Conferir logs recentes — foi burst (paralelismo) ou sustained (volume)?
3. Se burst: reduzir concorrência no chamador (sync-status usa 5).
4. Se sustained: revisar ETL / batch job.
5. `x-business-use-case-usage` mostra % — se > 95%, agendar para
   rodar em horário off-peak.

## Playbook para #190 (token expirado)

```
GET /debug_token?input_token={TOKEN}&access_token={APP_ID}|{APP_SECRET}
```

- `is_valid=false` → gerar novo.
- `expires_at=0` (System User) vs. número (user token long-lived).
- `scopes` lista escopos ativos — confirmar `ads_management`,
  `ads_read`, `instagram_basic`, `pages_read_engagement`.

Preferir migrar para System User (ver ST-9 do audit unificado).
