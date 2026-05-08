# 10. Cross-channel & Omnichannel

> **Este é o arquivo mais importante deste pacote.** Mais de metade
> dos commits `fix(meta)` do projeto resolveram problemas de
> cross-channel. Leia inteiro antes de mexer em qualquer creative.

## Página oficial

- Cross-Channel Conversion Optimization: https://developers.facebook.com/docs/ccco
- Ad Asset Feed Spec Link URL: https://developers.facebook.com/docs/marketing-api/reference/ad-asset-feed-spec-link-url
- Omnichannel / App Link Treatment: https://developers.facebook.com/docs/marketing-api/creative (procurar `applink_treatment`)

## O que é

**Cross-channel / omnichannel** é quando o mesmo ad otimiza entregas
tanto para **web** (landing page) quanto para **app** (deep link),
deixando o Meta escolher o destino certo por superfície/contexto.

No Claudinho, isso aparece porque a Evino e a GrandCru têm apps
iOS/Android. Ads "cross-channel" levam para o site quando o usuário
não tem o app, e para o deeplink quando tem.

## Como saber se um AdSet é cross-channel

```
GET /{adsetId}?fields=promoted_object{application_id,omnichannel_object{app{application_id,object_store_urls}}}&access_token=...

Retorno quando é cross-channel:
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

Se `omnichannel_object` não existir, **não é** cross-channel.

> **⚠️ Field expansion explícita é obrigatória.** Sem o
> `{application_id,omnichannel_object{app{application_id,object_store_urls}}}`,
> o Graph API às vezes devolve `apps[0]` sem `application_id`, e aí o
> creative sai sem `applink_treatment`/`omnichannel_link_spec`. O ad
> aparece no Ads Manager com "URL do site (Destino de Backup)"
> preenchida mas "Deep link (Destino padrão)" vazio. Quando o operador
> cola manualmente e tenta publicar, dispara erros **#100**
> ("application_id is required") e **#1885876** ("recreate the ad").

### Fallback de `application_id`

`buscarCrossChannelInfo()` tenta em ordem:

1. `promoted_object.omnichannel_object.app[0].application_id` (canônico)
2. `promoted_object.application_id` (top-level, presente em campanhas
   app-install que viram cross-channel)

Se nenhum dos dois resolver mas `objectStoreUrls.length > 0`, loga
`warn` com um snippet do `promoted_object` recebido — esse log é o
ponto de partida pra decidir uma derivação alternativa baseada no
que a API de fato devolve, em vez de chutar.

O Claudinho implementa em `buscarCrossChannelInfo()` em
`src/lib/meta-criar.ts`:

```ts
interface CrossChannelInfo {
  objectStoreUrls: string[];
  applicationId: string | null;
}
```

### Regra de ouro

```
cross-channel ativo  ⇔  objectStoreUrls.length > 0  AND  applicationId != null
```

Se tiver `objectStoreUrls` mas `applicationId` for null, **não**
ative cross-channel no creative — senão dá erro #100 ("Unexpected
key" ou campo obrigatório faltando).

No código: `isCrossChannelValido()` garante essa checagem.

## Campos envolvidos

| Campo | O que é | Onde vai (depende do tipo de creative) |
|---|---|---|
| `applink_treatment` | Deep link behavior: `"deeplink_with_web_fallback"` | **Sempre no form level** (além do object_story_spec) |
| `omnichannel_link_spec` | Especifica web + app + platform_specs | **Posição varia** (ver matriz abaixo) |
| `object_store_urls` | Array com URLs do Play Store e App Store | Dentro de `call_to_action.value` (video/imagem simples) ou `link_urls[0]` (imagem multi) |
| `deeplink_url` | Deep link explícito da marca | `link_urls[0]` (imagem multi) |

## `omnichannel_link_spec` (estrutura)

```jsonc
{
  "web": { "url": "https://www.evino.com.br/produtos/..." },
  "app": {
    "application_id": "123456789",
    "platform_specs": {
      "android": { "url": "https://www.evino.com.br/produtos/..." },
      "ios":     { "url": "https://www.evino.com.br/produtos/..." }
    }
  }
}
```

**Nota importante** (commit `aba1d95`): `platform_specs.android.url`
e `platform_specs.ios.url` recebem a **mesma URL universal** do site
(não as URLs das app stores). As app stores vão em `object_store_urls`
separadamente, como fallback para quem não tem o app instalado.

Helper correspondente no projeto: `construirOmnichannelSpec()` em
`src/lib/meta-criar.ts`.

## ⚠️ Matriz de posições corretas (decorar)

Esta é a tabela mais cara deste repositório: várias posições foram
testadas empiricamente contra a API real (veja commits `5f0a6bd`,
`79570a5`, `0789592`, `5b5e5e2`). O que funciona:

### Creative de VÍDEO (usa `video_data` dentro de `object_story_spec`)

| Campo | Posição correta |
|---|---|
| `object_store_urls` | Dentro de `video_data.call_to_action.value` |
| `applink_treatment` | **Form level** |
| `omnichannel_link_spec` | **Form level** |

### Creative de IMAGEM SIMPLES (1 placement, usa `link_data`)

| Campo | Posição correta |
|---|---|
| `object_store_urls` | Dentro de `link_data.call_to_action.value` |
| `applink_treatment` | **Form level** |
| `omnichannel_link_spec` | **Form level** |

### Creative de IMAGEM MULTI-PLACEMENT (usa `asset_feed_spec`)

Essa é a combinação que mais deu problema. Posição correta:

| Campo | Posição correta |
|---|---|
| `object_store_urls` | **Dentro de `asset_feed_spec.link_urls[0]`** |
| `deeplink_url` | **Dentro de `asset_feed_spec.link_urls[0]`** |
| `website_url` | **Dentro de `asset_feed_spec.link_urls[0]`** |
| `omnichannel_link_spec` | **Dentro de `asset_feed_spec.link_urls[0]`** |
| `applink_treatment` | **Form level** |

### Posições ERRADAS (confirmadas em prod)

| Tentativa | O que quebra |
|---|---|
| `omnichannel_link_spec` no form level (multi-placement) | Delivery error subcode **2446461**: *"omnichannel_link_spec needs to be within your asset_feed_spec"* |
| `omnichannel_link_spec` na raiz do `asset_feed_spec` | Erro **#100** *"Unexpected key"* |
| `omnichannel_link_spec` dentro de `object_story_spec` (multi-placement) | Silenciosamente ignorado |
| `applink_treatment` omitido quando cross-channel | Subcode **2446455**: *"applink_treatment is required in ad's creative"* |
| `platform_specs.android/ios` com URL da app store | Deep link quebrado em runtime |
| `applink_treatment` adicionado **sem** `omnichannel_link_spec` | Erro **#100** |
| `applink_treatment` adicionado quando `applicationId` é null | Erro **#100** |
| `object_store_urls` ausente em creative cross-channel multi-placement | Erro **#1359187** ao criar o ad |

## Árvore de decisão (o que fazer no código)

```
1. crossChannel = GET /{adsetId}?fields=promoted_object
2. Se NÃO tem omnichannel_object:
     criativo normal — sem applink_treatment, sem omnichannel_link_spec.
     Pare aqui.

3. Se tem omnichannel_object mas NÃO tem applicationId:
     isCrossChannelValido = false
     → NÃO adicione applink_treatment nem omnichannel_link_spec
     → Criativo "normal", só com link

4. Se tem applicationId e objectStoreUrls:
     isCrossChannelValido = true
     Tipo do creative:
       - VÍDEO ou IMAGEM SIMPLES:
           form: applink_treatment = "deeplink_with_web_fallback"
           form: omnichannel_link_spec = { web, app{application_id, platform_specs} }
           call_to_action.value.object_store_urls = [...]
       - IMAGEM MULTI-PLACEMENT (asset_feed_spec):
           form: applink_treatment = "deeplink_with_web_fallback"
           asset_feed_spec.link_urls[0] = {
             website_url,
             deeplink_url,
             object_store_urls,
             omnichannel_link_spec
           }
```

## Exemplo completo — imagem multi-placement cross-channel

```
POST https://graph.facebook.com/v23.0/act_123/adcreatives
Content-Type: application/x-www-form-urlencoded

name=Creative - EST-Prod-3CabernetsSauvignons
applink_treatment=deeplink_with_web_fallback

object_story_spec={
  "page_id": "PAGE_ID",
  "instagram_user_id": "IG_USER_ID"
}

asset_feed_spec={
  "ad_formats": ["AUTOMATIC_FORMAT"],
  "optimization_type": "PLACEMENT",
  "images": [
    { "hash": "h1", "adlabels": [{"name": "IMAGE_FEED"}] },
    { "hash": "h2", "adlabels": [{"name": "IMAGE_VERTICAL"}] },
    { "hash": "h3", "adlabels": [{"name": "IMAGE_HORIZONTAL"}] }
  ],
  "bodies":       [{ "text": "Combo com 3 Cabernets..." }],
  "titles":       [{ "text": "Top Cabernets" }],
  "descriptions": [{ "text": "Frete grátis." }],
  "call_to_action_types": ["SHOP_NOW"],
  "link_urls": [{
    "website_url": "https://www.evino.com.br/combos/3-cabernets",
    "deeplink_url": "https://www.evino.com.br/combos/3-cabernets",
    "object_store_urls": [
      "https://play.google.com/store/apps/details?id=br.com.evino.app",
      "https://apps.apple.com/br/app/evino/id1234567890"
    ],
    "omnichannel_link_spec": {
      "web": { "url": "https://www.evino.com.br/combos/3-cabernets" },
      "app": {
        "application_id": "987654321",
        "platform_specs": {
          "android": { "url": "https://www.evino.com.br/combos/3-cabernets" },
          "ios":     { "url": "https://www.evino.com.br/combos/3-cabernets" }
        }
      }
    }
  }],
  "asset_customization_rules": [
    { "customization_spec": {
        "publisher_platforms": ["facebook", "instagram"],
        "facebook_positions": ["feed","marketplace","search"],
        "instagram_positions": ["stream","explore","profile_feed"]
      }, "image_label": { "name": "IMAGE_FEED" } },
    { "customization_spec": {
        "publisher_platforms": ["facebook", "instagram"],
        "facebook_positions": ["story","facebook_reels"],
        "instagram_positions": ["story","reels"]
      }, "image_label": { "name": "IMAGE_VERTICAL" } },
    { "customization_spec": {
        "publisher_platforms": ["facebook"],
        "facebook_positions": ["instant_article","right_hand_column","suggested_video","video_feeds"]
      }, "image_label": { "name": "IMAGE_HORIZONTAL" } }
  ]
}

degrees_of_freedom_spec={...opt-out em todos...}
access_token=...
```

## Verificação pós-criação

Sempre buscar `issues_info` logo após criar o ad:

```
GET /{adId}?fields=effective_status,issues_info
```

Se voltar `WITH_ISSUES` com mensagem como:

- *"omnichannel_link_spec needs to be within your asset_feed_spec"* →
  Está no lugar errado, ver matriz acima.
- *"applink_treatment is required"* → Cross-channel ativo mas
  campo ausente no creative.

O Claudinho faz isso em `verificarIssuesAd()` e marca o ad como
erro com a mensagem real do Meta.

## Como testar antes de subir um fix

1. Encontrar um AdSet cross-channel real (Evino Prod Advantage+ costuma ser).
2. Criar manualmente via Graph API Explorer o creative com o payload.
3. Criar um ad com `status=PAUSED` para não cobrar.
4. `GET /{adId}?fields=effective_status,issues_info` — aguardar 10-20s.
5. Repetir a chamada algumas vezes (validação é assíncrona).
6. **Limpar**: `DELETE /{adId}` depois do teste — Advantage+ tem
   limite de 150 ads por campanha.

## Commits que contam a história

| Commit | Aprendizado |
|---|---|
| `eeaaefe` | `reels` não é valor válido; usar `facebook_reels`; `instagram_actor_id` → `instagram_user_id` |
| `0f63a52` | Multi-placement não incluía `applink_treatment` |
| `3fa68f2` | Faltava `object_store_urls` dentro de `link_urls[0]` |
| `7d7dc7b` | Faltava `deeplink_url` dentro de `link_urls[0]` |
| `5b5e5e2` | `omnichannel_link_spec` tinha de ir para `link_urls[0]` (testado contra 3 outras posições) |
| `0789592` | (Reversão) alguém achou que era "silenciosamente ignorado", mas era |
| `79570a5` | (Tentativa) "colocar no root do asset_feed_spec" → Unexpected key |
| `5f0a6bd` | (Revert final) volta para `link_urls[0]` — é a posição canônica |
| `135c4b3` | `isCrossChannelValido` + URL do site em platform_specs |
| `aba1d95` | URL universal do site em iOS/Android deep links |
| `aacfe13` | Validação pós-criação + `deletarAdMeta` para limpar zumbis |
