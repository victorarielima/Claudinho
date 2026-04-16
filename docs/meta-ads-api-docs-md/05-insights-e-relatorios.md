# 05. Insights e relatórios

## Páginas oficiais

- Insights API: https://developers.facebook.com/docs/marketing-api/insights
- Insights reference: https://developers.facebook.com/docs/marketing-api/reference/ads-insights/
- Action types: https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats/
- Breakdowns: https://developers.facebook.com/docs/marketing-api/insights/breakdowns

## O que a API de Insights faz

É a interface principal para **leitura de métricas** dos anúncios.
Acessível como edge em qualquer nível da hierarquia:

```
GET /{accountId}/insights
GET /{campaignId}/insights
GET /{adsetId}/insights
GET /{adId}/insights
```

Casos de uso:

- Relatório por conta, campanha, conjunto ou anúncio
- Dashboards internos (Claudinho `src/components/painel-anuncios.tsx`)
- Exportação de dados para data warehouse
- Diagnóstico de queda de performance

## Estrutura mínima de uma chamada

```
GET /{accountId}/insights
  ?fields=impressions,clicks,spend,ctr,cpc,cpm,reach,actions,cost_per_action_type
  &level=ad                        // account | campaign | adset | ad
  &date_preset=last_30d            // ou time_range={since,until}
  &filtering=[{"field":"ad.effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]
  &breakdowns=age,gender           // opcional — aumenta tamanho
  &sort[0]=spend_descending
  &limit=200
  &access_token=...
```

## Fields mais usados

| Field | Descrição |
|---|---|
| `impressions` | Exibições |
| `reach` | Pessoas únicas alcançadas |
| `frequency` | `impressions / reach` |
| `clicks` | Todos os cliques (inclui reações, comentários, shares) |
| `unique_clicks` | Pessoas únicas que clicaram |
| `inline_link_clicks` | Só cliques no link (exclui reações) |
| `outbound_clicks` | Cliques que levam para fora do Facebook/Instagram |
| `spend` | Investimento |
| `ctr` | Click-through rate (%) |
| `cpc` | Custo por clique |
| `cpm` | Custo por 1000 impressões |
| `actions` | Array de `{action_type, value}` |
| `cost_per_action_type` | Array de `{action_type, value}` com custo |
| `purchase_roas` | ROAS — array por tipo de atribuição |
| `video_p25_watched_actions` / `p50` / `p75` / `p100` | % do vídeo assistido |
| `video_avg_time_watched_actions` | Tempo médio assistido |

## Action types (dentro de `actions[]`)

| `action_type` | Mede |
|---|---|
| `link_click` | Cliques no link |
| `outbound_click` | Saídas do Facebook/Instagram |
| `landing_page_view` | View de landing page (requer pixel) |
| `post_reaction` | Reações ao post |
| `comment` | Comentários |
| `post` | Compartilhamentos |
| `video_view` | Views de 3s+ |
| `omni_purchase` | Compras (todos os canais) |
| `offsite_conversion.fb_pixel_purchase` | Pixel purchase |
| `offsite_conversion.fb_pixel_lead` | Pixel lead |
| `offsite_conversion.fb_pixel_add_to_cart` | Pixel add-to-cart |
| `offsite_conversion.fb_pixel_view_content` | Pixel view content |
| `onsite_conversion.messaging_conversation_started_7d` | Mensagem iniciada |
| `lead` | Lead agregado |
| `page_engagement` | Engajamento total com a Page |

## Date presets aceitos

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

Alternativamente: `time_range={"since":"2026-01-01","until":"2026-01-31"}`

## Breakdowns (dimensões adicionais)

```
age, gender,
country, region, dma,
impression_device, platform_position,
publisher_platform, device_platform,
product_id, place_page_id,
hourly_stats_aggregated_by_advertiser_time_zone
```

> Breakdowns multiplicam o tamanho da resposta. Use apenas os que
> forem analisados.

## Attribution windows

```
1d_click, 7d_click, 28d_click, 1d_view, 7d_view, 28d_view
```

Default: `7d_click, 1d_view`

> Desde iOS 14.5, `28d_click` e `28d_view` ficaram limitados;
> verifique que os dados para campanhas app e iOS façam sentido.

## Paginação

Toda chamada de insights pode retornar `paging.next` com a URL
completa da próxima página. O padrão é seguir esse link até virar
`null`. O Claudinho usa cursor `paging.cursors.after` em
`buscarPaginaAnunciosDoPeriodo()` em `src/lib/meta.ts`.

## Async Insights (para volumes grandes)

Para relatórios grandes, use o modo assíncrono:

```
POST /{accountId}/insights       // cria o job
GET /{reportRunId}               // status: Job Running / Job Completed
GET /{reportRunId}/insights      // busca quando completed
```

Na **v25.0**, novos fields são retornados em caso de falha:
`error_user_msg` (string amigável) e `error_code` (agora tipo `int`).

## Boas práticas

- Fixe **timezone** e **janela de tempo** do relatório para evitar
  diferenças com o Ads Manager.
- Versione as consultas importantes.
- Trate paginação, limites e **atraso de agregação** (ads podem ter
  até 48h para fechar métricas finais).
- Documente o significado de cada métrica usada no negócio.
- Para tabelas persistentes (analytics): ETL diário (MT-6 no audit)
  gravando em `daily_ad_performance`.

## Complementos importantes

- `06-brand-safety-boas-praticas-e-troubleshooting.md`
- `08-versao-e-changelog.md`
- `11-catalogo-erros-subcodes.md` (erro 17/32/613/80004 aparecem
  muito em chamadas de insights em volume)
