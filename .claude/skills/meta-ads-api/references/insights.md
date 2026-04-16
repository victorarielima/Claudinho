# references/insights.md — Insights & Reporting

## Endpoints

```
GET /{accountId}/insights
GET /{campaignId}/insights
GET /{adsetId}/insights
GET /{adId}/insights
```

No projeto: `buscarResumoDoPeriodo()` e
`buscarPaginaAnunciosDoPeriodo()` em `src/lib/meta.ts`;
`/api/meta/anuncios` em `src/app/api/meta/anuncios/route.ts`.

## Estrutura da chamada

```
GET /{accountId}/insights
  ?fields=impressions,clicks,spend,ctr,cpc,cpm,reach,actions,cost_per_action_type
  &level=ad                                             // account | campaign | adset | ad
  &date_preset=last_30d
  &filtering=[{"field":"ad.effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]
  &breakdowns=age,gender
  &sort[0]=spend_descending
  &limit=200
  &access_token=...
```

## Fields mais usados

| Field | Descrição |
|---|---|
| `impressions` | Exibições |
| `reach` | Pessoas únicas |
| `frequency` | impressions / reach |
| `clicks` | Todos os cliques |
| `unique_clicks` | Pessoas únicas que clicaram |
| `inline_link_clicks` | Só cliques no link |
| `outbound_clicks` | Saídas de FB/IG |
| `spend` | Investimento |
| `ctr` | % |
| `cpc` | Custo / clique |
| `cpm` | Custo / 1000 impressões |
| `actions` | `[{action_type, value}]` |
| `cost_per_action_type` | `[{action_type, value}]` com custo |
| `purchase_roas` | ROAS — array por atribuição |
| `video_p25/50/75/100_watched_actions` | % do vídeo assistido |
| `video_avg_time_watched_actions` | Tempo médio |

## Action types comuns (dentro de `actions[]`)

```
link_click, outbound_click, landing_page_view,
post_reaction, comment, post,
video_view,
omni_purchase,
offsite_conversion.fb_pixel_purchase,
offsite_conversion.fb_pixel_lead,
offsite_conversion.fb_pixel_add_to_cart,
offsite_conversion.fb_pixel_view_content,
onsite_conversion.messaging_conversation_started_7d,
lead, page_engagement
```

## Date presets

```
today, yesterday,
last_3d, last_7d, last_14d, last_28d, last_30d, last_90d,
this_week_mon_today, this_week_sun_today,
last_week_mon_sun, last_week_sun_sat,
this_month, last_month,
this_quarter, last_quarter,
this_year, last_year,
maximum, lifetime, data_maximum
```

Alternativamente: `time_range={"since":"2026-01-01","until":"2026-01-31"}`.

## Breakdowns

```
age, gender,
country, region, dma,
impression_device, platform_position,
publisher_platform, device_platform,
product_id, place_page_id,
hourly_stats_aggregated_by_advertiser_time_zone
```

> Breakdowns multiplicam o tamanho da resposta; usar só o necessário.

## Attribution windows

```
1d_click, 7d_click, 28d_click, 1d_view, 7d_view, 28d_view
```

Default: `7d_click, 1d_view`.

## Paginação

A Meta retorna `paging.next` (URL completa) e/ou
`paging.cursors.{before,after}`. O Claudinho usa cursor `after` em
`buscarPaginaAnunciosDoPeriodo()`.

## Async Insights (volumes grandes)

```
POST /{accountId}/insights       → retorna report_run_id
GET  /{reportRunId}              → polling (async_status)
GET  /{reportRunId}/insights     → buscar quando Completed
```

Em v25.0: em caso de falha, retornam `error_user_msg` e `error_code` (int).

## Boas práticas

1. Fixar timezone e window para evitar diferença vs. Ads Manager.
2. Versionar consultas críticas.
3. Tratar paginação sempre.
4. Agregação pode ter atraso de até 48h — não alarmar cedo.
5. Para dashboards persistentes: ETL diário (MT-6 no audit)
   gravando em `daily_ad_performance`.

## Onde no projeto

- Summary: `buscarResumoDoPeriodo()` — `src/lib/meta.ts`
- Paginated: `buscarPaginaAnunciosDoPeriodo()` — `src/lib/meta.ts`
- Cached UI: `/api/meta/anuncios` — 5 min de cache in-memory
