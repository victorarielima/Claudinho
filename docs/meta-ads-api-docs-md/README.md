# Meta Ads API — Documentação Organizada

Guia estruturado em Markdown sobre a **Meta Marketing API** (nome oficial
na Meta; coloquialmente "Meta Ads API" / "Facebook Ads API"), montado a
partir da documentação oficial da Meta e enriquecido com as lições
aprendidas no código do projeto **Claudinho** (`src/lib/meta-criar.ts`,
`src/lib/meta.ts`, `src/lib/erros-meta.ts` e companhia).

> Este material **não é** um espelho integral da documentação
> proprietária da Meta. É um guia curado, com links oficiais, payloads
> validados em produção, e um catálogo dos erros e gotchas que
> aparecem no dia-a-dia da operação.
>
> Para detalhes definitivos de request/response, **sempre consulte a
> página oficial correspondente** — os links estão em cada seção.

## Estado verificado

- Última revisão: **2026-04-16**
- Versão mais recente da Marketing API: **v25.0** (lançada em
  18/02/2026).
- Versão usada atualmente pelo Claudinho: **v23.0** (constante
  `META_API_VERSION` em `src/lib/meta-config.ts`).
- Prazo de migração IG `instagram_actor_id` → `instagram_user_id`:
  **21 de janeiro de 2026** — **já vencido**. O projeto já usa o
  campo novo.

## Índice (lista para estudo)

### Fundamentos

| Arquivo | Conteúdo |
|---|---|
| [`01-visao-geral.md`](./01-visao-geral.md) | O que é a Marketing API, hierarquia de objetos, quando usar |
| [`02-primeiros-passos.md`](./02-primeiros-passos.md) | App, tokens, permissões, fluxo mínimo, como evitar os 3 erros iniciais |
| [`07-referencia-api.md`](./07-referencia-api.md) | Índice dos objetos centrais (AdAccount, Campaign, AdSet, Ad, AdCreative, AdVideo, AdImage, Insights) |
| [`08-versao-e-changelog.md`](./08-versao-e-changelog.md) | Versionamento, breaking changes v22→v25, upgrade guide |
| [`09-links-oficiais.md`](./09-links-oficiais.md) | Links oficiais de cada seção e objeto |

### Criação de anúncios

| Arquivo | Conteúdo |
|---|---|
| [`03-criativos-e-bidding.md`](./03-criativos-e-bidding.md) | Criativos, bidding, objetivos, optimization goals |
| [`12-upload-midia.md`](./12-upload-midia.md) | Upload de vídeo (simples/chunked) + imagem, polling de processamento, idempotência |
| [`13-adcreative-payloads.md`](./13-adcreative-payloads.md) | Payloads validados: vídeo, imagem simples, imagem multi-placement (`asset_feed_spec`) |
| [`14-instagram-identity.md`](./14-instagram-identity.md) | `instagram_user_id` — como resolver a identidade do IG, fallback por env |

### Áreas críticas (alta taxa de bug)

| Arquivo | Conteúdo |
|---|---|
| [`10-cross-channel-omnichannel.md`](./10-cross-channel-omnichannel.md) | Anúncios cross-channel: `applink_treatment`, `omnichannel_link_spec`, `object_store_urls`, matriz de posições corretas por tipo de creative |
| [`11-catalogo-erros-subcodes.md`](./11-catalogo-erros-subcodes.md) | Tabela de códigos/subcodes do Meta encontrados em produção, com causa e correção |

### Operação

| Arquivo | Conteúdo |
|---|---|
| [`04-regras-audiencias-e-automacao.md`](./04-regras-audiencias-e-automacao.md) | Ad rules, audiências (custom, lookalike), automação |
| [`05-insights-e-relatorios.md`](./05-insights-e-relatorios.md) | Insights API: métricas, presets de data, breakdowns, paginação |
| [`06-brand-safety-boas-praticas-e-troubleshooting.md`](./06-brand-safety-boas-praticas-e-troubleshooting.md) | Brand safety, boas práticas, troubleshooting, checklist de diagnóstico |

### Aterrissagem no projeto

| Arquivo | Conteúdo |
|---|---|
| [`15-mapeamento-projeto.md`](./15-mapeamento-projeto.md) | Como cada seção mapeia nos arquivos do Claudinho (rotas, libs, schema Supabase) |

## Como usar

1. Comece por [`01-visao-geral.md`](./01-visao-geral.md) se nunca mexeu
   com a Marketing API.
2. Vá para [`02-primeiros-passos.md`](./02-primeiros-passos.md) para
   tokens e permissões.
3. Ao trabalhar no código do Claudinho: abra
   [`15-mapeamento-projeto.md`](./15-mapeamento-projeto.md) e o skill
   `.claude/skills/meta-ads-api/SKILL.md` **antes** de editar
   `src/lib/meta-criar.ts`.
4. Ao debugar erro do Meta: primeiro
   [`11-catalogo-erros-subcodes.md`](./11-catalogo-erros-subcodes.md),
   depois `src/lib/erros-meta.ts`.
5. Antes de subir de versão da API: revise
   [`08-versao-e-changelog.md`](./08-versao-e-changelog.md).

## Fontes oficiais principais

- Hub: https://developers.facebook.com/docs/marketing-api/
- Referência da API: https://developers.facebook.com/docs/marketing-api/reference
- Changelog: https://developers.facebook.com/docs/marketing-api/marketing-api-changelog
- Graph API Explorer (debug): https://developers.facebook.com/tools/explorer/
