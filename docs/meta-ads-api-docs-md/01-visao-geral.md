# 01. Visão geral

## O que é

A **Meta Marketing API** (também conhecida como Meta Ads API ou
Facebook Ads API) faz parte do ecossistema da Graph API e permite
criar, configurar, automatizar e medir anúncios nas superfícies da
Meta: Facebook, Instagram, Messenger, Audience Network e formatos
associados (Reels, Stories, Feed, etc.).

É uma API REST sobre HTTPS, com versionamento explícito. Toda chamada
passa por `https://graph.facebook.com/v{N.0}/...` com um
`access_token` válido.

## Páginas oficiais

- Hub: https://developers.facebook.com/docs/marketing-api/
- Visão geral: https://developers.facebook.com/docs/marketing-api/overview

## Hierarquia de objetos

Em termos práticos, a hierarquia central costuma girar em torno
destes objetos:

```
Business Manager (BM)
└── Ad Account (act_<id>)
    ├── Campaign                       (objetivo, categoria especial, special_ad_categories)
    │   └── Ad Set / Ad Group          (orçamento, público, placements, optimization_goal, bid_strategy)
    │       └── Ad                     (relaciona creative ↔ adset, status)
    │           └── Ad Creative        (conteúdo: vídeo/imagem, copy, CTA, link, Instagram identity)
    │               ├── AdVideo        (upload de vídeo — /{accountId}/advideos)
    │               └── AdImage        (upload de imagem — /{accountId}/adimages)
    └── Insights                       (edge que retorna métricas em qualquer nível acima)
```

**Terminologia**: no console web do Meta, a nomenclatura é
"Campanha / Conjunto de anúncios / Anúncio". Na API, alguns endpoints
usam `adgroup` como alias de `adset` (legado). Um `ad creative` pode
ser reaproveitado em múltiplos ads; um `ad` aponta para exatamente um
creative.

### No código do Claudinho

- `brands` na tabela do Supabase mapeia para Business Manager / conta
  de anúncio.
- `campaigns` e `adsets` **não** são armazenados localmente — são
  sempre lidos via
  `GET /{accountId}/campaigns` e `GET /{campaignId}/adsets` nas rotas
  `src/app/api/meta/{campanhas,adsets}/route.ts`.
- `ads` (tabela Supabase) ↔ cada registro gera **1 AdCreative + 1 Ad**
  no Meta.
- `ad_assets` (tabela Supabase) armazena as URLs dos vídeos/imagens e
  o `meta_asset_id` retornado após upload.

## Quando usar a API (vs. Ads Manager web)

Use a Marketing API quando precisa:

- Criar campanhas **em escala** ou de forma programática
- Gerenciar anúncios via automação / planilha / ferramenta interna
- Atualizar orçamentos, status e segmentação sem entrar no Ads Manager
- Ler performance por conta, campanha, conjunto e anúncio para BI/CRM
- Aplicar regras operacionais automatizadas
- Importar criativos com pipelines específicos (deep linking,
  cross-channel, omnichannel)

## Pontos de atenção permanentes

1. **Versão da API**: a Meta versiona explicitamente. Uma chamada com
   versão deprecada pode continuar funcionando por um tempo mas
   retorna comportamento inconsistente. Sempre fixe a versão —
   veja `08-versao-e-changelog.md`.
2. **Permissões**: grande parte dos problemas reais vem de **token
   sem a permissão certa** (ver `02-primeiros-passos.md`).
3. **Rate limits**: a Meta aplica limites por usuário, por app e por
   conta de anúncio. O Claudinho usa `metaFetchWithRetry()` em
   `src/lib/meta-retry.ts` com backoff exponencial para códigos 4,
   17, 32, 100, 429, 613 e 80004.
4. **Nem todo recurso está disponível para toda conta**: por tipo de
   negócio, por categoria especial (crédito, política, emprego,
   habitação), por país, por versão do App.
5. **Validação assíncrona**: criar um Ad retorna imediatamente, mas o
   Meta valida em background. Um ad pode ficar `IN_PROCESS` →
   `PENDING_REVIEW` → `WITH_ISSUES`/`ACTIVE`/`PAUSED`/`DISAPPROVED`.
   Sempre verifique `effective_status` + `issues_info`.

## Leitura recomendada em sequência

1. `02-primeiros-passos.md` — tokens, permissões, setup do app.
2. `07-referencia-api.md` — mapa dos objetos centrais.
3. `12-upload-midia.md` + `13-adcreative-payloads.md` — se o objetivo
   é criar ads.
4. `05-insights-e-relatorios.md` — se o objetivo é ler performance.
5. `10-cross-channel-omnichannel.md` — **obrigatório** antes de mexer
   em qualquer fluxo cross-channel.
