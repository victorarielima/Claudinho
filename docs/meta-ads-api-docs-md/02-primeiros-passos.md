# 02. Primeiros passos

## Páginas oficiais

- Get started: https://developers.facebook.com/docs/marketing-api/get-started
- Graph API (fundação): https://developers.facebook.com/docs/graph-api
- Tokens de acesso: https://developers.facebook.com/docs/facebook-login/guides/access-tokens
- Graph API Explorer: https://developers.facebook.com/tools/explorer/

## Pré-requisitos para começar

| Item | Descrição |
|---|---|
| Conta Meta for Developers | Acesso a https://developers.facebook.com/ |
| App configurado | Tipo "Business" com produto "Marketing API" adicionado |
| Business Manager | A conta de anúncios precisa estar vinculada a um BM |
| Conta de anúncios | `act_<id>`, ativa, com método de pagamento válido |
| Usuário / System User | Com role adequado (Admin, Advertiser, Analyst…) |
| Token de acesso | Com os escopos corretos (ver abaixo) |

## Tipos de token

| Tipo | Onde usar | Duração | Obs. |
|---|---|---|---|
| **User access token** | Dev manual e testes rápidos | 1-2h | Renovar para long-lived (60 dias) |
| **Long-lived user token** | Integração com usuário fixo | ~60 dias | Precisa renovar via fluxo OAuth |
| **System User token** | Produção 🏆 | Indefinido (até revogar) | **Recomendado**: imune a logout, sem expiração automática |
| **Page access token** | Ações que exigem contexto de Page | Varia | Obtido via `GET /{pageId}?fields=access_token` |

> O Claudinho usa hoje um `META_ACCESS_TOKEN` único no `.env`. O
> audit em `docs/audit/2026-03-29-claudinho-unified-audit.md`
> recomenda migrar para System User por brand — veja ST-9.

## Permissões (scopes) essenciais

Para **criar anúncios** via Marketing API:

| Scope | Quando |
|---|---|
| `ads_management` | Criar/editar Campaign/AdSet/Ad/Creative |
| `ads_read` | Ler ads e insights |
| `business_management` | Operar em BM (System User, ativos) |
| `pages_show_list` | Listar páginas do usuário |
| `pages_read_engagement` | Ler fields de Page |
| `instagram_basic` | Ler conta IG conectada à Page |
| `pages_manage_ads` | Criar ads vinculados à Page |

> **Gotcha**: sem `instagram_basic` + `pages_show_list`, a leitura de
> `instagram_business_account` / `connected_instagram_account` retorna
> vazio, quebrando criativos com placements do Instagram com subcode
> 1772103 ("Select an Instagram account"). Ver
> `14-instagram-identity.md`.

## Fluxo recomendado

1. Criar/configurar um app **Business** no Meta for Developers.
2. Adicionar o produto "Marketing API" ao app.
3. Associar a conta de anúncios ao Business Manager.
4. Criar um System User no BM e dar acesso à Ad Account.
5. Gerar token do System User com os escopos necessários.
6. Validar lendo dados básicos (`GET /{accountId}`, `/{accountId}/campaigns`).
7. Validar escrita em **ambiente controlado** (campanha de teste
   pausada, status=PAUSED sempre).
8. Conferir limites, erros e requisitos de permissão antes de escalar.

## Checklist de debug quando a API começa a falhar

Em ordem:

1. **Token válido?** `GET /debug_token?input_token={token}&access_token={appId}|{appSecret}`
2. **Versão da API correta?** Fixa em `src/lib/meta-config.ts`. Ver
   mudanças em `08-versao-e-changelog.md`.
3. **Permissões do token cobrem o endpoint?** Olhe a seção
   "Permissions" na página oficial do objeto.
4. **Account ID com prefixo `act_`?** `act_123` ≠ `123`. Alguns
   endpoints aceitam só com prefixo.
5. **Token tem acesso ao objeto?** BM → Configurações → Ativos →
   Contas de anúncios → confirmar atribuição de System User.
6. **Rate limit?** Header `x-business-use-case-usage` mostra uso
   atual. Códigos 17/32/613/80004 indicam throttle.
7. **Log `fbtrace_id`** e, se necessário, abra ticket no suporte da
   Meta com esse ID.

## Dicas práticas

- Comece lendo dados de `ad account` e campanhas **antes** de
  automatizar criação.
- Mantenha logs de request, response e `fbtrace_id`. O Claudinho
  centraliza em `src/lib/logger.ts`.
- Nunca passe o access_token pelo client. O Claudinho isola tudo em
  rotas `src/app/api/meta/**`.
- Antes de subir para produção, valide mudanças com versão fixa da API
  e ads em `status=PAUSED`.
- Para debug pontual: Graph API Explorer + copie o `fbtrace_id` se
  algo falhar.

## Variáveis de ambiente usadas pelo Claudinho

Ver `.env.example`. Principais:

| Env | Descrição |
|---|---|
| `META_APP_ID` / `META_APP_SECRET` | Do app Business |
| `META_ACCESS_TOKEN` | Token do System User (ou long-lived user) |
| `META_AD_ACCOUNT_EVINO` / `META_AD_ACCOUNT_GRANDCRU` | `act_<id>` por brand |
| `META_PAGE_ID_EVINO` / `META_PAGE_ID_GRANDCRU` | Page ID por brand |
| `META_INSTAGRAM_ACTOR_ID_EVINO` / `META_INSTAGRAM_ACTOR_ID_GRANDCRU` | Override do IG identity (usado quando o token não enxerga a conexão) |
| `META_INSTAGRAM_ACTOR_ID_<PAGE_ID>` | Override por page id específico |

## Links oficiais úteis

- Get Started: https://developers.facebook.com/docs/marketing-api/get-started
- Graph API: https://developers.facebook.com/docs/graph-api
- Graph API Explorer: https://developers.facebook.com/tools/explorer/
- Debug Token: https://developers.facebook.com/tools/debug/accesstoken/
- Rate Limiting: https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
- Permissions Reference: https://developers.facebook.com/docs/permissions/reference
