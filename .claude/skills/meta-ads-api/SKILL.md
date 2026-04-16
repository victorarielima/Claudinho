---
name: meta-ads-api
description: |
  Deep, project-specific reference for the Meta/Facebook Marketing API as
  integrated in the Claudinho codebase. Encapsulates all validated payload
  structures, gotchas, error classifications, and the hard-won patterns
  from a long series of production fixes.

  **INVOKE this skill whenever** the task involves:
  - meta ads, facebook ads, marketing api, graph api (any context)
  - creative, adcreative, ad creation, creative payload
  - campaign, ad set, adset, placement, ad group
  - upload video, upload image, advideos, adimages, chunked upload
  - cross-channel, omnichannel, applink_treatment, deeplink
  - asset_feed_spec, object_story_spec, link_data, video_data
  - instagram identity, instagram_user_id, instagram_actor_id
  - issues_info, effective_status, WITH_ISSUES, delivery error
  - rate limit, fbtrace_id, meta error code
  - src/lib/meta-criar.ts, src/lib/meta.ts, src/lib/erros-meta.ts
  - src/app/api/meta/** routes
---

# Meta Ads API — Skill Entry Point (Claudinho)

> **Mission**: give any Claude working in this repo the same patterns,
> caveats, and debugging moves that took the team dozens of iterations
> to learn. Before editing any Meta integration code, read the relevant
> section(s) here.

---

## 📋 Índice

| Seção | Quando abrir |
|---|---|
| [0. TL;DR](#0-tldr-never-change-without-reading) | Sempre |
| [1. Arquitetura](#1-arquitetura) | Sempre no 1º dia |
| [2. Arquivos-chave](#2-arquivos-chave-do-projeto) | Quando localizar o ponto certo de edição |
| [3. Decision trees](#3-decision-trees) | Ao criar/editar creative |
| [4. Referências profundas](#4-referências-profundas-references) | Quando precisar de payload completo |
| [5. Debugging playbook](#5-debugging-playbook) | Quando algo quebra |
| [6. Regras de ouro](#6-regras-de-ouro-não-negociáveis) | Revisar antes de commit |
| [7. Fontes oficiais](#7-fontes-oficiais) | Links diretos |

---

## 0. TL;DR (never change without reading)

1. **API version**: `v23.0` (`src/lib/meta-config.ts`). Meta mais
   recente é v25.0 (18/02/2026). Upgrade é projeto, não tarefa — ver
   `docs/meta-ads-api-docs-md/08-versao-e-changelog.md`.
2. **Account ID**: sempre com prefixo `act_`. O Supabase guarda com
   prefixo, algumas responses omitem.
3. **Todo ad novo sobe em `status=PAUSED`**. Ativação é manual pela
   operação.
4. **Creative quebra por posição de campo cross-channel** — é O
   bug-maior do histórico. Ver matriz em [references/cross-channel.md](./references/cross-channel.md).
5. **Sempre poll `issues_info` depois de criar ad**. Delivery error
   é assíncrono.
6. **Antes de retry** em ad com erro: `deletarAdMeta()` no antigo
   para liberar slot da campanha (Advantage+ tem limite de 150).
7. **IG identity**: `instagram_user_id` (não `instagram_actor_id`,
   deprecado desde 21/01/2026). Resolver via page fields ou env.
8. **Advantage+ creative enhancements**: OPT_OUT individual em
   `degrees_of_freedom_spec.creative_features_spec` (não
   `standard_enhancements` agregado — deprecado desde v22).

---

## 1. Arquitetura

```
UI (React)
  ├── POST /api/ads               → cria ad pendente no Supabase
  ├── POST /api/meta/criar-anuncio → inicia pipeline, retorna imediato
  │     └── POST /api/meta/processar (polling do cliente):
  │           Step A: download Drive → upload vídeo/imagem
  │           Step B: poll status do vídeo (video-only)
  │           Step C: criar AdCreative
  │           Step D: criar Ad + verificar issues_info
  ├── GET  /api/meta/campanhas       → lista campanhas (ACTIVE+PAUSED)
  ├── GET  /api/meta/adsets          → lista ad sets por campaign
  ├── GET  /api/meta/anuncios        → ads com insights
  └── POST /api/meta/sync-status     → sync effective_status
```

**Dois fluxos vivos**: o novo (Supabase-driven, steps A-D)  **é o
preferido**. O legado (planilha-driven) ainda existe em
`processarFluxoLegado` para transição.

---

## 2. Arquivos-chave do projeto

| Propósito | Arquivo |
|---|---|
| Config de versão e base URL | `src/lib/meta-config.ts` |
| Fetch com retry + rate limit | `src/lib/meta-retry.ts` |
| Lógica de criação (tudo) | `src/lib/meta-criar.ts` |
| Lógica de leitura (insights) | `src/lib/meta.ts` |
| Classificação de erros | `src/lib/erros-meta.ts` |
| Detecção de placement | `src/lib/ad-media.ts` |
| Readiness / validação pré-submit | `src/lib/ad-readiness.ts` |
| Pipeline orquestrador | `src/app/api/meta/processar/route.ts` |
| Entry do pipeline | `src/app/api/meta/criar-anuncio/route.ts` |
| Sync de status | `src/app/api/meta/sync-status/route.ts` |
| CTAs aceitos | `src/lib/constants.ts` (`VALID_CTA_VALUES`) |

Database (Supabase): tabelas `ads`, `ad_assets`, `brands`,
`audit_log`. Campos críticos:
- `ads.meta_ad_id`, `meta_creative_id`, `meta_account_id` (com
  `act_`), `meta_effective_status`, `error_message`, `status`.
- `ad_assets.meta_asset_id` (= video_id ou image_hash),
  `placement`, `asset_type`.

---

## 3. Decision trees

### 3.1 Preciso criar um creative. Que path usar?

```
Quantidade de mídias?
├── 1 vídeo                          → criarCreativeVideo()
├── 1 imagem (1 placement)           → criarCreativeImagemSimples()
└── 2+ imagens (placements diferentes) → criarCreativeImagem() [asset_feed_spec]
```

### 3.2 O adset é cross-channel?

```
buscarCrossChannelInfo(adSetId)
  → cc = { objectStoreUrls: [], applicationId: null }

Caso 1: objectStoreUrls vazio           → NÃO é cross-channel. Pule tudo.
Caso 2: objectStoreUrls preenchido,
        applicationId = null            → DO NOT activate cross-channel
                                          (erro #100). Criativo normal.
Caso 3: objectStoreUrls + applicationId → isCrossChannelValido = true
                                          → ativar cross-channel
```

### 3.3 Como aplicar cross-channel no payload?

| Creative | applink_treatment | omnichannel_link_spec | object_store_urls |
|---|---|---|---|
| **Vídeo** | Form level | Form level | Em `video_data.call_to_action.value` |
| **Imagem simples** | Form level | Form level | Em `link_data.call_to_action.value` |
| **Imagem multi-placement** | **Form level** | **`asset_feed_spec.link_urls[0]`** | **`asset_feed_spec.link_urls[0]`** |

**Regra trincada**: posição errada no multi-placement é subcode
**2446461** (delivery error) ou erro #100. Não invente — copie da
matriz. Detalhes em [references/cross-channel.md](./references/cross-channel.md).

### 3.4 Ad novo, subir de vez ou dar retry?

```
ad.status == "erro" e tem meta_ad_id?
  → deletarAdMeta(meta_ad_id)    # libera slot e evita zumbi
  → clear meta_ad_id, meta_creative_id, error_message
  → marcar "processando"
  → start pipeline
```

### 3.5 Rate limit?

Códigos retryable: `4, 17, 32, 100, 613, 80004`, HTTP `429`.
O `metaFetchWithRetry()` já faz backoff exponencial.

**Se continuar batendo**: reduzir concorrência (já está em 5 no
sync), rever ETL, ou verificar `x-business-use-case-usage`.

---

## 4. Referências profundas (`references/`)

Arquivos deste skill para consulta direcionada:

| Arquivo | Conteúdo |
|---|---|
| [`references/cross-channel.md`](./references/cross-channel.md) | Matriz de posições de campo, war stories, payloads |
| [`references/creatives.md`](./references/creatives.md) | Payloads completos validados (vídeo, imagem simples, multi) |
| [`references/video-upload.md`](./references/video-upload.md) | Upload simples vs. chunked, polling de status |
| [`references/instagram-identity.md`](./references/instagram-identity.md) | Resolução de `instagram_user_id` |
| [`references/errors-subcodes.md`](./references/errors-subcodes.md) | Tabela de codes/subcodes encontrados em prod |
| [`references/insights.md`](./references/insights.md) | Metrics, presets, breakdowns, pagination |
| [`references/pipeline.md`](./references/pipeline.md) | Como o Step A→D se encaixa com o Supabase |
| [`references/debugging-playbook.md`](./references/debugging-playbook.md) | Como reproduzir e debugar na API real |

**Documentação humana detalhada** (mais longa, com contexto):
`docs/meta-ads-api-docs-md/` — especialmente o `10-cross-channel-omnichannel.md`.

---

## 5. Debugging playbook

Quando um erro do Meta aparece:

1. **Copiar `fbtrace_id`** dos logs.
2. Extrair `code` + `error_subcode` da response.
3. Conferir `references/errors-subcodes.md` (ou
   `docs/.../11-catalogo-erros-subcodes.md`).
4. Se WITH_ISSUES: `GET /{adId}?fields=effective_status,issues_info`
   — a mensagem real está em `issues_info[0].error_summary`.
5. Reproduzir no Graph API Explorer com o mesmo payload.
6. Se for novo: adicionar regra em `src/lib/erros-meta.ts`.

Receitas específicas em [`references/debugging-playbook.md`](./references/debugging-playbook.md).

---

## 6. Regras de ouro (não negociáveis)

1. **NUNCA** criar ad em `status=ACTIVE` via automação. Sempre
   `PAUSED`.
2. **NUNCA** combinar `object_story_spec.link_data`/`video_data`
   com `asset_feed_spec` no mesmo creative. É um ou outro.
3. **NUNCA** omitir `instagram_user_id` em creatives com placements
   do Instagram. Use env override se o token não enxerga a conexão.
4. **NUNCA** enviar `applink_treatment` sem
   `omnichannel_link_spec` (erro #100). E vice-versa quando
   cross-channel.
5. **NUNCA** reusar `meta_creative_id` antigo em retry. Limpar no
   banco antes (`atualizarStatusAd(... { meta_creative_id: null })`).
6. **SEMPRE** `verificarIssuesAd()` depois de criar o ad.
7. **SEMPRE** deletar ad antigo (`deletarAdMeta`) antes de retry em
   campanha Advantage+ (limite 150).
8. **SEMPRE** usar `metaFetchWithRetry()` — não `fetch()` cru.
9. **SEMPRE** extrair `error_user_msg` > `message`. O
   `extrairErroMeta()` já faz.
10. **SEMPRE** armazenar `meta_account_id` com prefixo `act_`.
11. **SEMPRE** ler a atual versão da API (`META_API_VERSION`)
    antes de citar campos ou usar endpoints.

---

## 7. Fontes oficiais

- Hub: https://developers.facebook.com/docs/marketing-api/
- Reference v25: https://developers.facebook.com/docs/marketing-api/reference/v25
- Changelog: https://developers.facebook.com/docs/marketing-api/marketing-api-changelog
- Error reference: https://developers.facebook.com/docs/marketing-api/error-reference/
- Graph API Explorer: https://developers.facebook.com/tools/explorer/
- Token debugger: https://developers.facebook.com/tools/debug/accesstoken/

## When this skill applies

Invoke whenever working on:

- Ad creation pipelines or any `src/lib/meta-*` file
- Debugging Meta errors (start with `references/errors-subcodes.md`)
- New placement types or creative formats
- Cross-channel / omnichannel features
- Video/image upload flows
- Sync or status checking logic
- New CTA types or creative fields
- Insights/reporting features
- Bidding/optimization settings
- Campaign objectives or targeting
- Migrating API version

**Source of truth = the code**. This skill describes validated
patterns; the final check is always `src/lib/meta-criar.ts`.
