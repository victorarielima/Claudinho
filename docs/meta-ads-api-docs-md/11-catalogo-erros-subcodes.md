# 11. Catálogo de erros & subcodes

## Páginas oficiais

- Error reference: https://developers.facebook.com/docs/marketing-api/error-reference/
- Handle errors: https://developers.facebook.com/docs/graph-api/guides/error-handling/
- Rate limiting: https://developers.facebook.com/docs/graph-api/overview/rate-limiting/

## Anatomia de um erro do Meta

Response body em JSON:

```jsonc
{
  "error": {
    "message": "descrição técnica",
    "type": "OAuthException",
    "code": 100,
    "error_subcode": 1772103,
    "error_user_title": "Título amigável",
    "error_user_msg": "Mensagem amigável",
    "fbtrace_id": "AbCdEfGhIjK"
  }
}
```

- `code` — categoria (OAuth 190, generic validation 100, rate limit 17/32, etc).
- `error_subcode` — distingue variações dentro do mesmo `code`.
- `error_user_msg` — sempre prefira essa mensagem na UI quando
  existir (é a que a Meta aprovou para usuário final).
- `fbtrace_id` — guarde nos logs; é como o suporte da Meta rastreia.

O Claudinho extrai via `extrairErroMeta()` em
`src/lib/meta-criar.ts` e classifica via `interpretarErroMeta()`
em `src/lib/erros-meta.ts`.

## Códigos gerais (HTTP-like)

| Code | Significado | Ação |
|---|---|---|
| **4** | App-level rate limit | Backoff exponencial; reduzir concorrência |
| **17** | User-level rate limit (`API_EC_USER_TOO_MANY_CALLS`) | Backoff; revisar throttling por usuário |
| **32** | Page request limit | Backoff; reduzir chamadas sequenciais |
| **100** | Invalid parameter (classe guarda-chuva) | Ver `error_subcode`; validar versão da API |
| **190** | Invalid OAuth token (`OAuthException`) | Gerar token novo; checar expiração |
| **200** | Permissão insuficiente | Conferir escopos; refazer revisão de app |
| **341** | Application request limit | Como 4/17; esperar janela |
| **368** | Temporarily blocked for policies violations | Revisar políticas; aguardar ou apelar |
| **429** (HTTP) | Too Many Requests | Backoff; respeitar `Retry-After` |
| **500** (HTTP) | Erro interno do Meta | Retry |
| **613** | Rate limit ad-account (`#80004` também) | Backoff específico da conta |
| **803** | "Some aliases you requested do not exist" | Objeto foi deletado — tratar como sucesso em DELETE |
| **80004** | Ad-account rate limit | Backoff específico da conta |

Retry do Claudinho (`src/lib/meta-retry.ts`) considera retryable:
`17, 32, 4, 100, 613, 80004` + HTTP 429.

## Subcodes relevantes encontrados em produção

| Subcode | Mensagem típica | Causa | Correção |
|---|---|---|---|
| **1772103** | *"Select an Instagram account or a Facebook Page to represent your business on Instagram."* | Creative sem `instagram_user_id` para placements IG | Resolver via page (`instagram_business_account` / `connected_instagram_account`). Ver `14-instagram-identity.md` |
| **1487742** | *"There have been too many calls from this ad-account"* | Rate limit da conta | Backoff e reduzir concorrência |
| **2446811** | *"Advantage+ Shopping Campaigns have a maximum of 150 ads"* | Campanha Advantage+ atingiu o teto | Pausar/deletar ads antigos antes de subir. O Claudinho chama `deletarAdMeta()` antes do retry |
| **2446455** | *"applink_treatment is required in ad's creative"* | AdSet cross-channel mas creative sem `applink_treatment` | Adicionar `applink_treatment=deeplink_with_web_fallback` no form level. Ver `10-cross-channel-omnichannel.md` |
| **2446461** | *"omnichannel_link_spec needs to be within your asset_feed_spec"* | Posição errada do spec em creatives multi-placement | Mover para `asset_feed_spec.link_urls[0].omnichannel_link_spec` |
| **1359187** | *"Object store URLs are required for cross-channel"* | `object_store_urls` ausente no creative | Adicionar dentro de `call_to_action.value` (vídeo/imagem simples) ou `link_urls[0]` (imagem multi) |
| **1487006** | Restrição de política (álcool, farmacêutico, etc) | Categoria do produto / copy inadequado | Revisar copy, target, ajustar categoria especial |
| **1487390** | *"The Adcreative Create Failed for the following reason: Something went wrong. Please try again later"* (`[code 100]`, `is_transient=false`) | **Default rule no `asset_customization_rules` sem `customization_spec`.** Em ~27/05/2026 a Meta endureceu a validação: catch-all rules precisam da chave `customization_spec` presente (mesmo `{}`); antes a chave podia ser omitida e funcionava. O subcode é genérico e mascara a causa específica — só bissecção via `execution_options=[validate_only]` isola. War story 2026-05-27 abaixo. | Fix em `criarCreativeImagem()` (commit pós-`e4f2294`): default rule envia `customization_spec: {}`. Classificado em `erros-meta.ts` como "Default rule no asset_customization_rules sem customization_spec". |
| **1487748** | *"The ad creative is not eligible for this placement"* | Asset incompatível (aspect ratio, tamanho) | Reenviar asset no formato correto |
| **1885876** | *"Estamos com problemas para adicionar mais posicionamentos a esse anúncio."* | Bug do editor do Ads Manager com `asset_feed_spec` em campanha Advantage+ (ASC). Dois gatilhos: **(a)** `asset_customization_rules` não cobre todos os placements implícitos do ASC (Audience Network, Messenger, Threads); **(b)** cross-channel ghost link — Deep Link vazio na UI e operador cola manual. | **(a)** Default rule com `customization_spec: {}` em `asset_customization_rules` — commit `e4f2294` + ajuste pós-27/05/2026 (ver §1487390). **(b)** `omnichannel_link_spec` form-level + `link_urls[0]` — commit `6ba3c85`. **Ads pré-fix**: precisam ser recriados. |

### War story 2026-05-27 — bug do nosso próprio fix do #1885876

Dois ads Lupo Meraviglia W21-2026 (Evino) começaram a falhar com `code 100 / subcode 1487390` ("Adcreative Create Failed: Something went wrong"). 40 outros ads na mesma campanha ASCPremium concluíram normais — descartando Meta transitório e policy. Ads idênticos do mesmo produto W22-2026 (mesmos image hashes, mesmo texto, mesmo link) tinham passado em 22/05 — **antes do commit `e4f2294`**.

Bissecção via `execution_options=[validate_only]` no POST `/{accountId}/adcreatives` (não persiste — ideal pra rodar variações):

| Payload | Resultado |
|---|---|
| `asset_customization_rules` com default rule **sem** `customization_spec` (estado pós-`e4f2294`) | ❌ 1487390 |
| Mesmo payload **sem** default rule | ✅ OK |
| Default rule com `customization_spec: {}` | ✅ OK |
| Default rule com `customization_spec: { publisher_platforms: ["audience_network","messenger"] }` | ✅ OK |
| Apenas 1 rule (sem multi-placement) | ❌ 2446428 ("needs at least 2 target rules" — mensagem clara) |

**Conclusão:** entre 22/05 e 27/05 a Meta passou a exigir a chave `customization_spec` PRESENTE em toda rule do `asset_customization_rules` (mesmo `{}`). Omiti-la — recomendação válida até então — passou a disparar 1487390 com `is_transient=false`. O subcode é genérico: a validação real falha mas o Meta engole a mensagem.

**Fix:** default rule envia `customization_spec: {}` agora. Verificado com `validate_only` retornando `success: true` no payload exato do ad W21 que falhou.

**Lição:** ao ver 1487390 com `is_transient=false`, NÃO assumir transitório nem policy. Bisseccionar `asset_feed_spec` via `validate_only`.

## Matriz de erro → arquivo do projeto

Onde cada erro é tratado/classificado:

| Erro | Onde |
|---|---|
| Extração da mensagem | `extrairErroMeta()` em `src/lib/meta-criar.ts` |
| Classificação (UI-friendly) | `interpretarErroMeta()` em `src/lib/erros-meta.ts` |
| Retry p/ rate limit | `metaFetchWithRetry()` em `src/lib/meta-retry.ts` |
| Resposta vazia / HTML | `safeResponseJson()` em `src/lib/meta-retry.ts` |
| Validação pós-criação | `verificarIssuesAd()` em `src/lib/meta-criar.ts` |
| Sync periódico | `buscarStatusMeta()` em `src/app/api/meta/sync-status/route.ts` |

## Receitas de debug

### Erro #190 (token)

```
GET /debug_token?input_token={TOKEN}&access_token={APP_ID}|{APP_SECRET}
```

Retorna `is_valid`, `expires_at`, `scopes`, `user_id`. Se
`is_valid=false`, gerar token novo (System User recomendado).

### Erro #100 "Unexpected key"

1. Confirmar versão da API chamada (o field pode ter sido deprecado
   ou movido).
2. Reproduzir a mesma chamada no Graph API Explorer.
3. Consultar reference do objeto na versão correta:
   `/docs/marketing-api/reference/v25/{objeto}`.

### Erro de delivery após criação bem-sucedida

```
GET /{adId}?fields=effective_status,issues_info,recommendations
```

`issues_info[0]` tem `error_summary` + `error_message` + `error_code`.
Mensagem real está ali — não no erro original de `POST /ads`.

### Rate limit

Headers informativos:

- `x-business-use-case-usage` — JSON com % de uso do budget atual
  da BM.
- `x-ad-account-usage` — JSON com % de uso do ad-account.
- `Retry-After` (em 429) — segundos a esperar.

Se a mensagem contiver *"There have been too many calls"*, subcode
1487742 ou 80004:

1. Pausar imediatamente paralelismo novo.
2. Esperar pelo menos 5 minutos (a janela base).
3. Reduzir concorrência permanente.

## Checklist ao encontrar erro desconhecido

1. Copiar `fbtrace_id`.
2. Confirmar `code` + `error_subcode`.
3. Buscar `error_subcode` neste arquivo — se não estiver, adicionar
   uma regra em `src/lib/erros-meta.ts` com o marcador identificado
   (string estável ou regex).
4. Verificar se a mensagem aparece na tabela oficial:
   https://developers.facebook.com/docs/marketing-api/error-reference/
5. Reproduzir no Graph API Explorer.
6. Se persistente e importante: abrir ticket com Meta incluindo
   `fbtrace_id` + payload + timestamp.
