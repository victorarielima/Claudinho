# references/cross-channel.md — Cross-channel & Omnichannel

> Essa é a referência mais importante deste skill. Mais da metade
> dos commits `fix(meta)` do projeto resolveram problemas dessa área.

## Quando este arquivo se aplica

Invocar quando a tarefa envolver:

- Qualquer creative que precise levar para **web + app** (deep link)
- Campanhas Advantage+ (geralmente cross-channel na Evino/GrandCru)
- Erros com subcodes `2446455`, `2446461`, `1359187`
- Qualquer edição em `criarCreativeVideo()`,
  `criarCreativeImagem()`, `criarCreativeImagemSimples()` ou
  `construirOmnichannelSpec()`

## O que é cross-channel

Um ad **cross-channel** otimiza delivery tanto para web (site) quanto
para app (deep link). A Meta decide o destino por superfície e
contexto (ex.: usuário tem o app → deeplink; não tem → web fallback).

Marcado no **AdSet**, não no creative — via `promoted_object.omnichannel_object`.

## Como detectar (no AdSet)

```http
GET /{adsetId}?fields=promoted_object{application_id,omnichannel_object{app{application_id,object_store_urls}}}&access_token=<token>
```

⚠️ **Field expansion explícita é obrigatória.** Sem o `{application_id,
omnichannel_object{app{application_id,object_store_urls}}}`, o Graph
API ocasionalmente omite `application_id` aninhado mesmo quando o
adset é cross-channel — o resultado é um ad com "URL do site" mas
"Deep link" vazio, e #100/#1885876 quando o operador edita manualmente.

Response quando é cross-channel:

```jsonc
{
  "promoted_object": {
    "omnichannel_object": {
      "app": [{
        "object_store_urls": [
          "https://play.google.com/store/apps/details?id=...",
          "https://apps.apple.com/app/..."
        ],
        "application_id": "APP_ID"
      }]
    }
  }
}
```

### Fallbacks de `application_id` (no projeto)

`buscarCrossChannelInfo(adsetId)` tenta em ordem:

1. `promoted_object.omnichannel_object.app[0].application_id` (canônico)
2. `promoted_object.application_id` (top-level)

Se ambos vierem null e `objectStoreUrls` existir, loga `warn` com
snippet do `promoted_object`. Não há derivação adicional codificada —
intencionalmente. A próxima derivação deve ser baseada no JSON
observado no log, não em chute.

## Regra de ativação (no projeto)

```ts
isCrossChannelValido(cc) =
  cc?.objectStoreUrls.length > 0  &&  cc.applicationId != null
```

**Se `applicationId` for null, NÃO ative cross-channel.**
Isso causa erro #100 porque `applink_treatment` sem
`omnichannel_link_spec` é inválido.

## ⚠️ MATRIZ DE POSIÇÕES (decorar)

| Campo | VÍDEO (`video_data`) | IMAGEM SIMPLES (`link_data`) | IMAGEM MULTI (`asset_feed_spec`) |
|---|---|---|---|
| `applink_treatment` | **Form level** | **Form level** | **Form level** |
| `omnichannel_link_spec` | **Form level** | **Form level** | **`asset_feed_spec.link_urls[0]`** |
| `object_store_urls` | `video_data.call_to_action.value.object_store_urls` | `link_data.call_to_action.value.object_store_urls` | **`asset_feed_spec.link_urls[0].object_store_urls`** |
| `deeplink_url` | N/A | N/A | **`asset_feed_spec.link_urls[0].deeplink_url`** |
| `website_url` | N/A (`link`) | N/A (`link`) | **`asset_feed_spec.link_urls[0].website_url`** |

## Estrutura do `omnichannel_link_spec`

```jsonc
{
  "web": { "url": "https://www.evino.com.br/produtos/..." },
  "app": {
    "application_id": "APP_ID_NUMBER",
    "platform_specs": {
      "android": { "url": "https://www.evino.com.br/produtos/..." },
      "ios":     { "url": "https://www.evino.com.br/produtos/..." }
    }
  }
}
```

**Crítico**: `platform_specs.android/ios.url` recebe a **mesma URL
do site** (universal link), **NÃO** as URLs das app stores. As
app stores vão em `object_store_urls` separadamente, como fallback
de instalação quando o usuário não tem o app.

Corresponding helper: `construirOmnichannelSpec()` em
`src/lib/meta-criar.ts`.

## Posições ERRADAS conhecidas (já tentadas e quebraram)

| Tentativa | Resultado |
|---|---|
| `omnichannel_link_spec` no form level (multi-placement) | Delivery error subcode **2446461** ("needs to be within asset_feed_spec") |
| `omnichannel_link_spec` na raiz do `asset_feed_spec` | Erro **#100** ("Unexpected key") |
| `omnichannel_link_spec` dentro de `object_story_spec` (multi) | Silenciosamente ignorado |
| `applink_treatment` ausente quando cross-channel | Subcode **2446455** |
| `platform_specs` com URLs de app store | Deep link quebra em runtime |
| `applink_treatment` sem `omnichannel_link_spec` | Erro **#100** |
| `applink_treatment` com `applicationId=null` | Erro **#100** |
| `object_store_urls` ausente em multi cross-channel | Erro **#1359187** |

## Payload template — imagem multi-placement cross-channel

Ver [creatives.md § 3](./creatives.md) para o payload completo.

## Checklist antes de editar qualquer creative path

- [ ] Estou em qual dos 3 paths? (video / image-simple / image-multi)
- [ ] Estou seguindo a matriz de posições?
- [ ] `isCrossChannelValido()` cobre `applicationId` null?
- [ ] `omnichannel_link_spec.platform_specs` usa URL do site
      (não das stores)?
- [ ] `verificarIssuesAd()` está sendo chamado depois de
      `criarAnuncio()`?
- [ ] Se erro surgir, o subcode é `2446455`/`2446461`/`1359187`?
      → este arquivo cobre.

## Commits-chave (história do aprendizado)

| SHA | Lição |
|---|---|
| `eeaaefe` | `reels` → `facebook_reels`; opt-out individual; IG identity |
| `0f63a52` | Multi-placement sem `applink_treatment` (2446455) |
| `3fa68f2` | Faltava `object_store_urls` em `link_urls[0]` |
| `7d7dc7b` | Faltava `deeplink_url` em `link_urls[0]` |
| `5b5e5e2` | `omnichannel_link_spec` → `link_urls[0]` (2446461) |
| `0789592` | Tentativa errada: mover para form level |
| `79570a5` | Tentativa errada: colocar no root do asset_feed_spec |
| `5f0a6bd` | Revert: `link_urls[0]` é canônico |
| `135c4b3` | `isCrossChannelValido()` + URLs corretas |
| `aba1d95` | URL universal do site para iOS/Android |
| `aacfe13` | `verificarIssuesAd()` + `deletarAdMeta()` |
