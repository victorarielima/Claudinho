# 03. Criativos e bidding

## Criativos

### Páginas oficiais

- Creative (hub): https://developers.facebook.com/docs/marketing-api/creative
- Ad Creative reference: https://developers.facebook.com/docs/marketing-api/reference/ad-creative
- Advantage+ Creative: https://developers.facebook.com/docs/marketing-api/creative/advantage-creative/
- Asset Feed Spec: https://developers.facebook.com/docs/marketing-api/ad-creative/asset-feed-spec/
- Placement Asset Customization: https://developers.facebook.com/docs/marketing-api/dynamic-creative/placement-asset-customization/

### Conceitos centrais

Um **AdCreative** é o conteúdo renderizado como anúncio: texto,
título, descrição, mídia (imagem ou vídeo), call-to-action, link de
destino e identidade (Facebook Page + Instagram User).

Três formas de montar o creative, em ordem de complexidade:

| Forma | Quando | Campo principal |
|---|---|---|
| **`link_data`** (simples) | 1 imagem, 1 link, 1 formato | `object_story_spec.link_data` |
| **`video_data`** | Vídeo único | `object_story_spec.video_data` |
| **`asset_feed_spec`** | Variações (2+ imagens, 2+ placements, A/B de copy) | `asset_feed_spec` no form |

### Payload templates

**Ver [`13-adcreative-payloads.md`](./13-adcreative-payloads.md) para payloads completos
validados em produção** (vídeo, imagem simples, imagem multi-placement).

### Campos mais usados no `object_story_spec`

```jsonc
{
  "page_id": "PAGE_ID",             // obrigatório
  "instagram_user_id": "IG_USER_ID", // obrigatório p/ placements IG
  "link_data": { ... },             // se imagem simples
  "video_data": { ... }             // se vídeo
}
```

> `instagram_actor_id` foi **deprecado** — use `instagram_user_id`.
> Migração obrigatória desde 21/01/2026.
> Veja [`14-instagram-identity.md`](./14-instagram-identity.md).

### Advantage+ Creative (`degrees_of_freedom_spec`)

Desde a Marketing API **v22.0** (jan/2025), `standard_enhancements`
foi deprecado. Agora cada "enhancement" precisa ser opt-in/opt-out
individualmente via `creative_features_spec`:

```jsonc
{
  "creative_features_spec": {
    "standard_enhancements":      { "enroll_status": "OPT_OUT" },
    "image_enhancement":          { "enroll_status": "OPT_OUT" },
    "text_generation":            { "enroll_status": "OPT_OUT" },
    "image_touchups":             { "enroll_status": "OPT_OUT" },
    "inline_comment":             { "enroll_status": "OPT_OUT" },
    "profile_card":               { "enroll_status": "OPT_OUT" }
    // ...veja lista completa em src/lib/meta-criar.ts
  }
}
```

O Claudinho aplica **OPT_OUT em todos os features** para ads de
imagem multi-placement, para evitar que a Meta modifique os criativos
automaticamente.

### Quando consultar esta seção

- Ao criar anúncios programaticamente
- Ao reutilizar creatives em múltiplos anúncios (mesmo creative_id em
  múltiplos ads)
- Ao ajustar formatos ou ativos
- Ao depurar rejeições ou delivery issues no anúncio

---

## Bidding & Optimization Goals

### Páginas oficiais

- Bidding: https://developers.facebook.com/docs/marketing-api/bidding
- Optimization Goals: https://developers.facebook.com/docs/marketing-api/bidding/optimization
- Campaign objectives (outcome-based): https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/

### Objetivos de campanha (outcome-based, atual)

| Objective | Alvo |
|---|---|
| `OUTCOME_AWARENESS` | Alcance, reconhecimento de marca |
| `OUTCOME_TRAFFIC` | Link clicks, tráfego para site |
| `OUTCOME_ENGAGEMENT` | Engajamento, mensagens, video views |
| `OUTCOME_LEADS` | Formulários, pixel leads |
| `OUTCOME_SALES` | Conversões, catálogo de produto |
| `OUTCOME_APP_PROMOTION` | Instalação/uso de app |

Legacy (ainda funcional mas não criável): `CONVERSIONS`,
`LINK_CLICKS`, `VIDEO_VIEWS`, `LEAD_GENERATION`, `APP_INSTALLS`,
`POST_ENGAGEMENT`, `PAGE_LIKES`, `BRAND_AWARENESS`, `REACH`,
`MESSAGES`, `PRODUCT_CATALOG_SALES`, `STORE_VISITS`, `EVENT_RESPONSES`.

### Bid strategies

| Valor | Comportamento |
|---|---|
| `LOWEST_COST_WITHOUT_CAP` | Maximizar resultados ao menor custo possível (padrão) |
| `LOWEST_COST_WITH_BID_CAP` | Limite máximo por evento (`bid_cap`) |
| `COST_CAP` | Custo médio alvo |
| `LOWEST_COST_WITH_MIN_ROAS` | Otimizar para ROAS mínimo |

### Optimization goals (mais usados)

| `optimization_goal` | Onde se aplica |
|---|---|
| `OFFSITE_CONVERSIONS` | Sales / Conversions |
| `LINK_CLICKS` | Traffic |
| `LANDING_PAGE_VIEWS` | Traffic / Sales |
| `REACH` | Awareness |
| `IMPRESSIONS` | Awareness |
| `LEAD_GENERATION` / `QUALITY_LEAD` | Leads |
| `APP_INSTALLS` / `VALUE` | App Promotion |
| `THRUPLAY` | Video Views |
| `CONVERSATIONS` | Messages |

### Advantage+ Shopping Campaigns (ASC) — **descontinuação**

A partir da **v25.0** (fev/2026), Meta **deprecou** legacy ASC
(Advantage+ Shopping) e AAC (Advantage+ App Campaigns). Criação,
duplicação e updates desses tipos **não são mais permitidos** em
**nenhuma versão da API** (breaking change retroativo). A migração
é para a estrutura única **Advantage+ / outcome-based**.

Referência: https://developers.facebook.com/docs/marketing-api/marketing-api-changelog/version25.0

### Special ad categories

```
NONE, EMPLOYMENT, HOUSING, CREDIT,
ISSUES_ELECTIONS_POLITICS,
ONLINE_GAMBLING_AND_GAMING,
FINANCIAL_PRODUCTS_SERVICES
```

> Para álcool (vinho — Evino/GrandCru): a categoria é `NONE`. A Meta
> aplica automaticamente a idade 18+ no Brasil.

### Quando consultar esta seção

- Ao configurar novos conjuntos de anúncios
- Ao investigar subentrega ou gasto abaixo do esperado
- Ao comparar estratégias automáticas e controladas

## Observações

- Muitas configurações de criativo e bidding se amarram ao `Ad Set`.
- Se o comportamento esperado não aparecer, confira `07-referencia-api.md`
  e, em caso de erro, `11-catalogo-erros-subcodes.md`.
