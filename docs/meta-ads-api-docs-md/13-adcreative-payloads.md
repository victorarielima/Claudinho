# 13. Payloads validados de AdCreative

> Todos os payloads abaixo já foram usados em produção no Claudinho
> contra a API real. Copy-paste seguro como ponto de partida. Para
> cross-channel, confirmar também [`10-cross-channel-omnichannel.md`](./10-cross-channel-omnichannel.md).

## Endpoint

```
POST https://graph.facebook.com/v23.0/act_{ID}/adcreatives
Content-Type: application/x-www-form-urlencoded  (ou multipart/form-data)
```

A resposta é sempre `{ "id": "<creative_id>" }`.

## Vocabulário rápido

| Termo | Significado |
|---|---|
| **Form level** | Chave de primeiro nível no `POST` (fora de qualquer JSON stringificado) |
| **`object_story_spec`** | JSON com `page_id`, `instagram_user_id`, e **um** de: `link_data` (imagem simples), `video_data` (vídeo), ou omitido (quando usando `asset_feed_spec`) |
| **`asset_feed_spec`** | JSON alternativo para variações (multi-placement, multi-copy, A/B). Não combinar com `link_data`/`video_data` |
| **`degrees_of_freedom_spec`** | Controla Advantage+ creative enhancements |

---

## 1. Creative de VÍDEO

```jsonc
// POST form fields:

name = "Creative - Ad Name"

object_story_spec = {
  "page_id": "PAGE_ID",
  "instagram_user_id": "IG_USER_ID",
  "video_data": {
    "video_id": "VIDEO_ID",             // retornado pelo upload
    "message": "Texto principal até 125-2200 chars",
    "title":   "Título até 40 chars",
    "link_description": "Descrição até 30 chars",
    "image_url": "https://thumbnail.url",
    "call_to_action": {
      "type": "SHOP_NOW",                // enum — ver CTA list abaixo
      "value": {
        "link": "https://landing-page.url",
        "object_store_urls": [           // ⚠ só se cross-channel
          "https://play.google.com/...",
          "https://apps.apple.com/..."
        ]
      }
    }
  }
}

// Só se cross-channel:
applink_treatment = "deeplink_with_web_fallback"
omnichannel_link_spec = {
  "web": { "url": "https://landing-page.url" },
  "app": {
    "application_id": "APP_ID",
    "platform_specs": {
      "android": { "url": "https://landing-page.url" },
      "ios":     { "url": "https://landing-page.url" }
    }
  }
}

access_token = "..."
```

Código correspondente: `criarCreativeVideo()` em
`src/lib/meta-criar.ts`.

---

## 2. Creative de IMAGEM SIMPLES (1 placement)

Usado quando só há 1 imagem (ex.: só o corte `feed`). Similar ao
vídeo: tudo em `object_story_spec.link_data`.

```jsonc
name = "Creative - Ad Name"

object_story_spec = {
  "page_id": "PAGE_ID",
  "instagram_user_id": "IG_USER_ID",
  "link_data": {
    "message": "Texto principal",
    "link": "https://landing-page.url",
    "name": "Título",                    // ← no link_data, "name" é o headline
    "description": "Descrição",
    "image_hash": "HASH_DA_IMAGEM",      // do POST /adimages
    "call_to_action": {
      "type": "SHOP_NOW",
      "value": {
        "link": "https://landing-page.url",
        "object_store_urls": [...]       // ⚠ só se cross-channel
      }
    }
  }
}

// Só se cross-channel:
applink_treatment = "deeplink_with_web_fallback"
omnichannel_link_spec = { ... mesmo shape do vídeo ... }

access_token = "..."
```

Código: `criarCreativeImagemSimples()` em `src/lib/meta-criar.ts`.

---

## 3. Creative de IMAGEM MULTI-PLACEMENT (`asset_feed_spec`)

Usado quando há 2+ imagens por placement (feed 1:1 + stories 9:16 +
horizontal 1.91:1). **O payload mais complexo do projeto.**

```jsonc
name = "Creative - Ad Name"

object_story_spec = {
  "page_id": "PAGE_ID",
  "instagram_user_id": "IG_USER_ID"
  // ⚠ SEM link_data / video_data — asset_feed_spec cobre isso
}

asset_feed_spec = {
  "ad_formats": ["AUTOMATIC_FORMAT"],
  "optimization_type": "PLACEMENT",

  "images": [
    { "hash": "HASH_FEED",       "adlabels": [{ "name": "IMAGE_FEED" }] },
    { "hash": "HASH_VERTICAL",   "adlabels": [{ "name": "IMAGE_VERTICAL" }] },
    { "hash": "HASH_HORIZONTAL", "adlabels": [{ "name": "IMAGE_HORIZONTAL" }] }
  ],

  "bodies":       [{ "text": "Texto principal" }],
  "titles":       [{ "text": "Título" }],
  "descriptions": [{ "text": "Descrição" }],
  "call_to_action_types": ["SHOP_NOW"],

  "link_urls": [{
    "website_url": "https://landing-page.url",

    // ⚠ Se cross-channel, tudo isto DENTRO de link_urls[0]:
    "deeplink_url": "https://landing-page.url",
    "object_store_urls": [
      "https://play.google.com/...",
      "https://apps.apple.com/..."
    ],
    "omnichannel_link_spec": {
      "web": { "url": "https://landing-page.url" },
      "app": {
        "application_id": "APP_ID",
        "platform_specs": {
          "android": { "url": "https://landing-page.url" },
          "ios":     { "url": "https://landing-page.url" }
        }
      }
    }
  }],

  "asset_customization_rules": [
    {
      "customization_spec": {
        "publisher_platforms": ["facebook", "instagram"],
        "facebook_positions": ["feed", "marketplace", "search"],
        "instagram_positions": ["stream", "explore", "profile_feed"]
      },
      "image_label": { "name": "IMAGE_FEED" }
    },
    {
      "customization_spec": {
        "publisher_platforms": ["facebook", "instagram"],
        "facebook_positions": ["story", "facebook_reels"],
        "instagram_positions": ["story", "reels"]
      },
      "image_label": { "name": "IMAGE_VERTICAL" }
    },
    {
      "customization_spec": {
        "publisher_platforms": ["facebook"],
        "facebook_positions": ["instant_article", "right_hand_column",
                              "suggested_video", "video_feeds"]
      },
      "image_label": { "name": "IMAGE_HORIZONTAL" }
    }
  ]
}

// Advantage+ Creative — OPT-OUT em tudo:
degrees_of_freedom_spec = {
  "creative_features_spec": {
    "adapt_to_placement":           { "enroll_status": "OPT_OUT" },
    "add_text_overlay":             { "enroll_status": "OPT_OUT" },
    "creative_stickers":            { "enroll_status": "OPT_OUT" },
    "description_automation":       { "enroll_status": "OPT_OUT" },
    "enhance_cta":                  { "enroll_status": "OPT_OUT" },
    "image_background_gen":         { "enroll_status": "OPT_OUT" },
    "image_brightness_and_contrast":{ "enroll_status": "OPT_OUT" },
    "image_templates":              { "enroll_status": "OPT_OUT" },
    "image_touchups":               { "enroll_status": "OPT_OUT" },
    "image_uncrop":                 { "enroll_status": "OPT_OUT" },
    "inline_comment":               { "enroll_status": "OPT_OUT" },
    "media_type_automation":        { "enroll_status": "OPT_OUT" },
    "product_extensions":           { "enroll_status": "OPT_OUT" },
    "text_optimizations":           { "enroll_status": "OPT_OUT" },
    "text_translation":             { "enroll_status": "OPT_OUT" },
    "video_auto_crop":              { "enroll_status": "OPT_OUT" }
  }
}

// Só se cross-channel (form level):
applink_treatment = "deeplink_with_web_fallback"

link_url = "https://landing-page.url"    // opcional, complementa link_urls[0]
access_token = "..."
```

Código: `criarCreativeImagem()` em `src/lib/meta-criar.ts`.

### Mapeamento placement → adlabel

| Placement interno (Claudinho) | `adlabel.name` | Usado em |
|---|---|---|
| `feed` | `IMAGE_FEED` | Feed FB/IG, Marketplace, Search, Explore, Profile Feed |
| `stories` | `IMAGE_VERTICAL` | Stories, Reels (ambas plataformas) |
| `horizontal` | `IMAGE_HORIZONTAL` | Right column, instant article, in-stream (só FB) |

---

## 4. Criar o Ad (depois do creative)

```
POST /act_{ID}/ads
Content-Type: application/x-www-form-urlencoded

name=<ad_name>
adset_id=<ADSET_ID>
creative={"creative_id":"<CREATIVE_ID>"}
status=PAUSED                            // ⚠ sempre PAUSED — ativação é manual
access_token=<token>

Response: { "id": "<ad_id>" }
```

---

## 5. Validação pós-criação

```
GET /{adId}?fields=effective_status,issues_info&access_token=...

Response:
{
  "effective_status": "WITH_ISSUES" | "ACTIVE" | "PAUSED" | "PENDING_REVIEW" | ...,
  "issues_info": [
    {
      "level": "AD",
      "error_code": 1234,
      "error_summary": "Descrição curta",
      "error_message": "Mensagem detalhada",
      "error_type": "FAILURE"
    }
  ]
}
```

Polling curto (3 × 4s no Claudinho) captura delivery errors logo
após a criação. `ACTIVE`/`PAUSED`/`PENDING_REVIEW` é sinal verde.
`WITH_ISSUES`/`DISAPPROVED`/`DELETED` → tratar como erro e expor a
mensagem real do Meta.

---

## 6. CTAs aceitos (enum `call_to_action.type`)

Os mais usados:

```
SHOP_NOW, LEARN_MORE, SIGN_UP, SUBSCRIBE, ORDER_NOW,
GET_OFFER, CONTACT_US, DOWNLOAD, APPLY_NOW, BOOK_TRAVEL,
BUY_NOW, GET_QUOTE, WATCH_MORE, OPEN_LINK, LIKE_PAGE,
INSTALL_APP, PLAY_GAME, WHATSAPP_MESSAGE, SEND_MESSAGE,
CALL_NOW, GET_DIRECTIONS, LISTEN_NOW, SEE_MENU,
USE_APP, SELL_NOW, REQUEST_TIME, MESSAGE_PAGE
```

Whitelist aplicada no Claudinho: `VALID_CTA_VALUES` em
`src/lib/constants.ts`. Ad-readiness bloqueia CTA fora desse set.

## 7. Limites de copy

| Campo | Recomendado | Hard Max | Observação |
|---|---|---|---|
| `name` (do creative) | — | 100 chars | |
| `message` / primary text | 125 chars | 2200 chars | Truncado após ~125 no mobile |
| `title` / headline | 25–40 chars | 255 chars | Truncado após ~25 no feed |
| `link_description` / description | 30 chars | 255 chars | Não aparece em todos placements |
| `link` (URL) | — | 1000 chars | |

## 8. Regras de texto Meta (primeiro char + pontuação)

- **Chars proibidos como primeiro caractere**: `\ / ! . ? - * ( ) , ; :`
- **Pontuação ASCII consecutiva** (3+): bloqueado; exceção única: `...`
- **Palavras > 30 chars**: recusado.
- **Muitas palavras de 1 char**: > 3 no texto gera warning.
- **Símbolos IPA, diacríticos soltos, sobrescritos/subscritos** (exceto TM/SM): não permitidos.

Validador: `validarTextoMeta()` em `src/lib/ad-readiness.ts`.
