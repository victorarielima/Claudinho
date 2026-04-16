# 07. Referência da API

## Página oficial principal

- Reference: https://developers.facebook.com/docs/marketing-api/reference
- Versão `v25`: https://developers.facebook.com/docs/marketing-api/reference/v25

## Objetos centrais

| Objeto | Uso | Link oficial |
|---|---|---|
| **Ad Account** (`act_<id>`) | Container raiz; tudo pertence a uma Ad Account | https://developers.facebook.com/docs/marketing-api/reference/ad-account |
| **Ad Account User** | Roles no Business Manager | https://developers.facebook.com/docs/marketing-api/reference/ad-account-user |
| **Ad Campaign (Group)** | Objetivo, categoria especial, budget global (CBO) | https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group |
| **Ad Set / Ad Group** | Público, placements, optimization goal, bid, budget, schedule | https://developers.facebook.com/docs/marketing-api/reference/adgroup |
| **Ad** | Relaciona adset ↔ creative, tem status/issues_info | https://developers.facebook.com/docs/marketing-api/reference/adgroup |
| **Ad Creative** | Conteúdo do anúncio: texto, mídia, link, CTA, identidade | https://developers.facebook.com/docs/marketing-api/reference/ad-creative |
| **Ad Video** (`advideos` edge) | Upload de vídeo | https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/ |
| **Ad Image** (`adimages` edge) | Upload de imagem | https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages/ |
| **Ad Insights** | Performance em qualquer nível | https://developers.facebook.com/docs/marketing-api/reference/ads-insights |
| **Custom Audience** | Audiências | https://developers.facebook.com/docs/marketing-api/audiences/reference/custom-audience |
| **Ad Rules Library** | Regras automatizadas | https://developers.facebook.com/docs/marketing-api/reference/ad-account/adrules_library |
| **Asset Feed Spec Link URL** | Struct dentro de creative com variações | https://developers.facebook.com/docs/marketing-api/reference/ad-asset-feed-spec-link-url |

## Como ler a referência oficial

Sempre que abrir a página de um objeto, procure:

1. **Fields** disponíveis — nem todo field é lido por default; listar
   explicitamente com `?fields=a,b,c`.
2. **Edges** relacionados — ex.: `/{adsetId}/ads`.
3. **Methods** suportados — GET/POST/DELETE.
4. **Permissions** exigidas para ler/escrever.
5. **Required parameters** em POST (se esquecer, erro #100).
6. **Restrictions** por tipo de conta, objetivo ou país.
7. **Deprecations** — badge rosa/amarelo, com data de remoção.

## Objetos mais usados no Claudinho

Lista das chamadas reais do projeto, ordem do fluxo de criação:

| Chamada | Onde |
|---|---|
| `GET /{accountId}/campaigns?fields=name,objective,status` | `src/app/api/meta/campanhas/route.ts` |
| `GET /{campaignId}/adsets?fields=name,status,daily_budget` | `src/app/api/meta/adsets/route.ts` |
| `GET /{adsetId}?fields=account_id` | `buscarAccountIdDoAdSet()` — `meta-criar.ts` |
| `GET /{adsetId}?fields=promoted_object` | `buscarCrossChannelInfo()` — `meta-criar.ts` |
| `GET /{pageId}?fields=instagram_business_account,connected_instagram_account` | `buscarInstagramActorId()` — `meta-criar.ts` |
| `POST /{accountId}/advideos` (simple + chunked) | `uploadVideo()` — `meta-criar.ts` |
| `GET /{videoId}?fields=status` | `aguardarProcessamentoVideo()` — `meta-criar.ts` |
| `GET /{videoId}?fields=picture,thumbnails` | `buscarThumbnailVideo()` — `meta-criar.ts` |
| `POST /{accountId}/adimages` | `uploadImage()` — `meta-criar.ts` |
| `POST /{accountId}/adcreatives` | `criarCreativeVideo()` / `criarCreativeImagem()` |
| `POST /{accountId}/ads` | `criarAnuncio()` — `meta-criar.ts` |
| `GET /{adId}?fields=effective_status,issues_info` | `verificarIssuesAd()` e sync-status route |
| `DELETE /{adId}` | `deletarAdMeta()` — `meta-criar.ts` |
| `GET /{accountId}/ads?fields=...&insights.date_preset(...)` | `src/app/api/meta/anuncios/route.ts` |
| `GET /{accountId}/insights?fields=...&level=account` | `buscarResumoDoPeriodo()` — `meta.ts` |
| `GET /{accountId}/insights?level=ad&fields=ad_id,ad_name,...` | `buscarPaginaAnunciosDoPeriodo()` — `meta.ts` |

## Sugestão de ordem de estudo

1. `Ad Account` — ponto de entrada
2. `Campaign` — objetivo e special_ad_categories
3. `Ad Group` / `Ad Set` — público, bidding, placements, targeting
4. `Ad Creative` — **onde está 80% dos bugs** do projeto
5. `Ad` — relação simples creative ↔ adset + status
6. `Insights` — leitura de performance

## Observação importante

A referência oficial da Meta é a **fonte definitiva** para detalhes
de request e response. Antes de implementar, confira a página do
objeto na **mesma versão** da API que a sua aplicação usa (hoje
`v23.0` no Claudinho; `v25.0` é a mais recente).
