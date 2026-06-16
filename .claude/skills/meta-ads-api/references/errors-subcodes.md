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
| **1487390** | "The Adcreative Create Failed for the following reason: Something went wrong. Please try again later" (`[code 100]`, `is_transient=false`) | **Default rule no `asset_customization_rules` sem `customization_spec`** — em ~27/05/2026 a Meta endureceu a validação: catch-all rules precisam da chave `customization_spec` presente (mesmo `{}`), antes a chave podia ser omitida. O subcode é genérico e mascara a causa real; só bissecção via `execution_options=[validate_only]` isola. | Fix em `criarCreativeImagem()` (commit pós-`e4f2294`): default rule envia `customization_spec: {}`. Se o erro reaparecer em ad novo, é regressão dessa linha — ver §3.3b do SKILL.md. |
| **1487748** | "not eligible for this placement" | Asset formato errado | Reenviar no formato correto |
| **1363024** | "format that isn't supported" (acompanha `[code 352]`) | **Filename sem extensão `.mp4`/`.mov`/`.m4v`**. Meta usa a extensão pra inferir o container e, sem ela, rejeita com mensagem genérica de formato. Bytes podem estar perfeitamente válidos. | `uploadVideo()` em `src/lib/meta-criar.ts` sanitiza via `ensureVideoExtension()` — adiciona `.mp4` se faltar. Se ainda aparecer, é mesmo um codec/container não-H.264. |
| **1363047** | "There was a problem uploading your video. Please try again." (acompanha `[code 2]`) | **Indisponibilidade transitória do `/advideos`** — arquivo, token e payload estão OK; o serviço de upload do Meta ficou intermitente. | `metaFetchWithRetry` em `src/lib/meta-retry.ts` retenta automaticamente (até 3x, backoff exponencial). Se chegar até a UI mesmo assim, esperar 1 min e clicar "Tentar de novo". |
| **1815614** | "To set link_description in video_data, you must specify call_to_action." (`[code 100]`) | **`link_description` enviado em `video_data` sem `call_to_action`** — o Meta exige que `link_description` só apareça quando há um CTA no mesmo objeto `video_data`. Ocorre quando o ad tem `linkDescription` preenchido mas `link` vazio/ausente. | Fix em `criarCreativeVideo()`: mover `link_description` para dentro do bloco `if (params.link)`, junto ao `call_to_action`. |
| **1885876** | "Estamos com problemas para adicionar mais posicionamentos a esse anúncio. Para incluir suas novas seleções de posicionamento, exclua o anúncio e crie-o novamente." | **Bug do editor do Ads Manager** com criativos `asset_feed_spec` em campanha Advantage+ (ASC). Aparece quando o operador edita QUALQUER campo (até 1 letra na legenda) direto no Ads Manager. Tem dois gatilhos: **(a)** `asset_customization_rules` não cobre todos os placements implícitos do ASC (Audience Network, Messenger, Threads, etc) — a UI tenta expandir e quebra; **(b)** ad com Deep Link vazio na UI por cross-channel incompleto e operador cola manual. | **(a)** Default rule com `customization_spec: {}` no `asset_customization_rules` (fallback feed) — `criarCreativeImagem()`, commit `e4f2294` + ajuste pós-27/05/2026 (ver §1487390). **(b)** Garantir `omnichannel_link_spec` form-level + `link_urls[0]` (commit `6ba3c85`). **Ads antigos** (pré-fix): recriar via Claudinho ou duplicar no Ads Manager — não dá pra patchear retroativamente. |

### War story 2026-05-27 — `code 100 / subcode 1487390` causado pelo nosso próprio fix do #1885876

Dois ads da Evino (`EST-Prod-LupoMeravigliaTreDiTre114Kit` e `EST-Prod-6LupoMeravigliaTreDiTre114`, ambos W21-2026) começaram a falhar com `code 100 / subcode 1487390` ("Adcreative Create Failed: Something went wrong. Please try again later", `is_transient=false`). 40 outros ads na mesma campanha Evino-Ecomm-Meta-Web_App-Purchase-ASCPremium concluíram normais — descarta Meta transitório e policy.

**Pista:** ads idênticos do mesmo produto (W22-2026, mesmos image hashes, mesmo texto, mesmo link) deram OK em 22/05 — antes do commit `e4f2294`. Tudo entre 22/05 e 27/05 começou a quebrar.

**Bissecção** via `execution_options=[validate_only]` no `/{accountId}/adcreatives` (POST que NÃO persiste, só valida) isolou:

| Payload | Resultado |
|---|---|
| `asset_customization_rules` com default rule sem `customization_spec` (estado pós-`e4f2294`) | ❌ 1487390 |
| Mesmo payload sem default rule | ✅ OK |
| Default rule com `customization_spec: {}` | ✅ OK |
| Default rule com `customization_spec: { publisher_platforms: ["audience_network","messenger"] }` | ✅ OK |

**Conclusão:** entre 22/05 e 27/05 a Meta passou a exigir a chave `customization_spec` presente (mesmo vazia) em toda rule do `asset_customization_rules`. O commit `e4f2294` (default rule sem `customization_spec`) era a recomendação oficial de catch-all até essa mudança e parou de funcionar.

**Fix:** default rule envia `customization_spec: {}` (commit pós-`e4f2294`). Verificado contra Meta com `validate_only` retornando `success: true` no payload exato do ad W21 que falhou.

**Lição reusável:** quando ver `subcode 1487390` com `is_transient=false`, NÃO assumir transitório. Reproduzir com `execution_options=[validate_only]` (não persiste, dá pra rodar quantas variações precisar) e bisseccionar campos do `asset_feed_spec` — a Meta tipicamente engole a mensagem específica nesse subcode.

### War story 2026-05-22 — confirmação ao vivo do gatilho do 1885876

Renato reportou no Slack às 19:26: editar 1 letra na legenda de qualquer ad publicado pelo Claudinho na campanha Evino ASCPremium quebrava com #1885876.

Diagnóstico feito via Graph API em tempo real (`scripts/diagnostico-meta-real.js`, `scripts/diagnostico-creative.js`):

- Ad `6934174404797` (creative `927204320375938`) — multi-imagem.
- Creative tinha `omnichannel_link_spec` form-level + `link_urls[0]` corretos (descarta gatilho (b)).
- `asset_customization_rules` cobria 14 posicionamentos FB/IG. **Adset `6873905054597` é ASC com Advantage+ Placements ativo** — cobre Audience Network, Messenger, Threads, IG Reels Overlay/Explore Home, FB Instream Video implicitamente. Gap de ~10 placements.
- Confirma gatilho (a). Fix do default rule (commit `e4f2294`) cobre o gap via catch-all.

Lição reusável: para diagnosticar #1885876 num ad específico, use `GET /{adId}?fields=creative{asset_feed_spec,object_type}` + `GET /{adsetId}?fields=targeting`. Se o creative usa `asset_feed_spec` e o adset não tem `publisher_platforms`/`facebook_positions` explícitos, **é gatilho (a)**.

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
| `1885876` / "adicionar mais posicionamentos" / "having trouble adding more placements" | "Edição manual quebrou o anúncio no Ads Manager" |
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
