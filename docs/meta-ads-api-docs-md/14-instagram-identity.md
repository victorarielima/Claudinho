# 14. Identidade do Instagram no AdCreative

## Página oficial

- AdCreative object_story_spec: https://developers.facebook.com/docs/marketing-api/reference/ad-creative
- Deprecation note (IG fields): https://developers.facebook.com/blog/post/2025/08/11/instagram-marketing-api-update/

## Resumo

Creatives que rodam em placements do Instagram **precisam** ter
uma identidade IG explícita no payload. Sem isso, a Meta responde
com:

```
(#100) Select an Instagram account or a Facebook Page to represent
your business on Instagram.
[subcode 1772103]
```

Campo correto (atual):

```jsonc
"object_story_spec": {
  "page_id": "PAGE_ID",
  "instagram_user_id": "IG_USER_ID",   // ✅ canônico desde v22
  ...
}
```

## Deprecation

- `instagram_actor_id` → **deprecado**. Prazo final: **21/01/2026**
  (já passado).
- Agora só funciona `instagram_user_id`, que aceita o **Instagram
  Business Account ID** (não o username, não o ID do app).

## Como resolver o IG user ID

A função `buscarInstagramActorId()` em `src/lib/meta-criar.ts` tenta
3 fontes em sequência:

### 1. Override por env (mais confiável em prod)

```
META_INSTAGRAM_ACTOR_ID_EVINO=123456789
META_INSTAGRAM_ACTOR_ID_GRANDCRU=987654321

# ou por page ID específico:
META_INSTAGRAM_ACTOR_ID_<PAGE_ID>=111222333
```

Útil quando o token não tem permissão de ler a conexão IG da page
(ex.: long-lived user token sem `instagram_basic` nem
`pages_read_engagement`).

### 2. Campos modernos na Page

```
GET /{pageId}?fields=instagram_business_account,connected_instagram_account
  &access_token=<token>

Response:
{
  "instagram_business_account": { "id": "..." },
  "connected_instagram_account": { "id": "..." }
}
```

Preferir `instagram_business_account`; se não existir, usar
`connected_instagram_account`. Funciona com **user token** (não
requer page access token).

### 3. Endpoint legado (fallback)

```
GET /{pageId}/instagram_accounts?fields=id&access_token=<token>

Response: { "data": [ { "id": "..." } ] }
```

Esse endpoint antigamente **exigia page access token**; falhava com
user token retornando `(#190)`. O código legado engolia o erro e
retornava null — isso foi um bug que o commit `0f63a52` corrigiu.

## Gotchas

1. **Token sem permissão**: se você usa um user token (não System
   User), precisa ter `instagram_basic` + `pages_show_list` +
   `pages_read_engagement`.
2. **Page sem IG conectado**: nem toda Page tem um IG Business
   Account vinculado. Confirmar em Meta Business Suite →
   Configurações → Contas conectadas.
3. **Contas Pessoais vs. Business**: só IG **Business/Creator**
   serve para ads. Contas pessoais não retornam no
   `instagram_business_account`.
4. **IG Identity via Accounts Center**: algumas pages se conectam
   ao IG via Accounts Center em vez do fluxo legado; aparece em
   `connected_instagram_account`, não em
   `instagram_business_account`. Por isso o código usa fallback.

## Erro silencioso

Se `buscarInstagramActorId()` retorna `null` e o creative é criado
sem `instagram_user_id`, o Meta **não reclama no momento da criação**
(se o adset não tiver placements IG). Mas no runtime, quando o ad
é delivered para o IG, retorna subcode 1772103. Por isso hoje o
código **lança erro explícito** quando o actor id não puder ser
resolvido, em vez de criar um creative quebrado silenciosamente.

## Receita manual (quando precisar debugar)

```
# Verificar a conexão
GET /{pageId}?fields=instagram_business_account,connected_instagram_account,name
  &access_token=<token>

# Se retornar vazio, tentar legacy
GET /{pageId}/instagram_accounts?fields=id,username
  &access_token=<token>

# Se tudo falhar e você tem acesso pelo Business Suite:
# 1. Abrir Business Suite → Configurações → Contas conectadas
# 2. Ver o IG vinculado à Page
# 3. No IG, Perfil → Configurações → Sobre esta conta → Número da conta
# 4. Colocar esse número em META_INSTAGRAM_ACTOR_ID_<PAGEID>
```

## Checklist

- [ ] Token com `instagram_basic` + `pages_show_list` +
      `pages_read_engagement`?
- [ ] IG Business Account conectado à Page via Business Suite?
- [ ] `META_INSTAGRAM_ACTOR_ID_<BRAND>` configurado como fallback?
- [ ] Creative tem `instagram_user_id` no `object_story_spec`?
- [ ] Sem referência a `instagram_actor_id` no código?
