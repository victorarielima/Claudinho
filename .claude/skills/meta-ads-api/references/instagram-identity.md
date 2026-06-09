# references/instagram-identity.md — Identidade do Instagram

## Por que isso existe

Creatives com placements do Instagram precisam de uma identidade IG
explícita no `object_story_spec`. Sem isso:

```
(#100) Select an Instagram account or a Facebook Page to represent
your business on Instagram. [subcode 1772103]
```

## Campo correto (atual)

```jsonc
"object_story_spec": {
  "page_id": "PAGE_ID",
  "instagram_user_id": "IG_USER_ID",   // ✅ aceita o IG Business Account ID
  ...
}
```

**Deprecado**: `instagram_actor_id` — prazo final **21/01/2026**
(passado). Se ver no código, é bug.

## 3 fontes em ordem (no projeto)

Função: `buscarInstagramActorId()` em `src/lib/meta-criar.ts`.

### 1. Env override (mais confiável em prod)

```
META_INSTAGRAM_ACTOR_ID_EVINO=123456789
META_INSTAGRAM_ACTOR_ID_GRANDCRU=987654321

# Ou por page id específico:
META_INSTAGRAM_ACTOR_ID_<PAGE_ID>=111222333
```

Necessário quando o token não tem permissão para ler a conexão IG
da page. Testar com System User sempre evita precisar disso.

### 2. Page fields modernos

```
GET /{pageId}?fields=instagram_business_account,connected_instagram_account
  &access_token=<token>

Response: {
  "instagram_business_account": { "id": "..." },
  "connected_instagram_account": { "id": "..." }
}
```

Preferir `instagram_business_account`; fallback
`connected_instagram_account` (este último cobre pages conectadas
via Accounts Center).

Funciona com **user token** (desde que tenha `instagram_basic` +
`pages_read_engagement`).

### 3. Endpoint legado (fallback)

```
GET /{pageId}/instagram_accounts?fields=id&access_token=<token>

Response: { "data": [ { "id": "..." } ] }
```

Antigamente exigia page access token (retornava #190 com user
token). Hoje é fallback final.

## Erro histórico

O código **antes do commit `0f63a52`** engolia exceção e retornava
`null` silenciosamente. Resultado: creative criado sem
`instagram_user_id` → ad falhava no runtime com subcode 1772103.

**Hoje**: se não consegue resolver, `criarCreativeVideo()` /
`criarCreativeImagem()` **lançam erro explícito** antes de sequer
chamar a Meta.

## Permissions necessárias no token

- `instagram_basic`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_ads` (para criar ads vinculados à Page)

## Contas pessoais vs. business

Só IG **Business/Creator** serve para ads. Contas pessoais não
retornam em `instagram_business_account`. Se não puder mudar o
tipo, o ad não vai rodar em placements IG.

## Checklist de diagnóstico

1. Token tem `instagram_basic` + `pages_show_list` +
   `pages_read_engagement`?
2. `GET /{pageId}?fields=instagram_business_account,name` retorna
   o IG id?
3. Page tem IG conectado no Business Suite → Configurações →
   Contas conectadas?
4. IG é Business/Creator (não pessoal)?
5. Se tudo falhar: `META_INSTAGRAM_ACTOR_ID_<BRAND>` configurado?

## Onde olhar no código

- `buscarInstagramActorId()` — `src/lib/meta-criar.ts:1024-1119`
- Uso no creative — `criarCreativeVideo()`,
  `criarCreativeImagem()`, `criarCreativeImagemSimples()`
- Erro propagado — `processarFluxoNovo()` e `processarFluxoLegado()`
  em `src/app/api/meta/criar-anuncio/route.ts`
