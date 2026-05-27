# references/creatives.md — Payloads de AdCreative validados

## Endpoint

```
POST https://graph.facebook.com/v23.0/act_{ID}/adcreatives
Content-Type: application/x-www-form-urlencoded (ou multipart)

Response: { "id": "<creative_id>" }
```

## 3 paths distintos (não misturar)

| Path | Usar quando | Função do projeto |
|---|---|---|
| 1. **video_data** | 1 vídeo | `criarCreativeVideo()` |
| 2. **link_data** | 1 imagem, 1 placement | `criarCreativeImagemSimples()` |
| 3. **asset_feed_spec** | 2+ imagens / placements | `criarCreativeImagem()` |

**NUNCA** combinar `link_data`/`video_data` com `asset_feed_spec`.

---

## 1. VIDEO (`video_data`)

```jsonc
name = "Creative - <ad_name>"
object_story_spec = {
  "page_id": "PAGE_ID",
  "instagram_user_id": "IG_USER_ID",            // obrigatório p/ IG
  "video_data": {
    "video_id": "VIDEO_ID",
    "message": "texto principal",
    "title": "título",
    "link_description": "descrição",
    "image_url": "https://thumbnail",
    "call_to_action": {
      "type": "SHOP_NOW",
      "value": {
        "link": "https://landing",
        "object_store_urls": ["...play", "...apple"]  // só se cross-channel
      }
    }
  }
}

// Se cross-channel:
applink_treatment = "deeplink_with_web_fallback"
omnichannel_link_spec = { web:{url}, app:{application_id, platform_specs} }

access_token = "..."
```

---

## 2. IMAGEM SIMPLES (`link_data`)

```jsonc
name = "Creative - <ad_name>"
object_story_spec = {
  "page_id": "PAGE_ID",
  "instagram_user_id": "IG_USER_ID",
  "link_data": {
    "message": "texto",
    "link": "https://landing",
    "name": "título",                             // aqui "name" é o headline
    "description": "descrição",
    "image_hash": "HASH",                         // do POST /adimages
    "call_to_action": {
      "type": "SHOP_NOW",
      "value": {
        "link": "https://landing",
        "object_store_urls": ["..."]              // só se cross-channel
      }
    }
  }
}

// Se cross-channel:
applink_treatment = "deeplink_with_web_fallback"
omnichannel_link_spec = { ... }

access_token = "..."
```

---

## 3. IMAGEM MULTI-PLACEMENT (`asset_feed_spec`)

```jsonc
name = "Creative - <ad_name>"
object_story_spec = {
  "page_id": "PAGE_ID",
  "instagram_user_id": "IG_USER_ID"
  // NÃO incluir link_data nem video_data aqui
}

asset_feed_spec = {
  "ad_formats": ["AUTOMATIC_FORMAT"],
  "optimization_type": "PLACEMENT",

  "images": [
    { "hash": "HASH_FEED",       "adlabels": [{ "name": "IMAGE_FEED" }] },
    { "hash": "HASH_VERTICAL",   "adlabels": [{ "name": "IMAGE_VERTICAL" }] },
    { "hash": "HASH_HORIZONTAL", "adlabels": [{ "name": "IMAGE_HORIZONTAL" }] }
  ],
  "bodies":       [{ "text": "texto principal" }],
  "titles":       [{ "text": "título" }],
  "descriptions": [{ "text": "descrição" }],
  "call_to_action_types": ["SHOP_NOW"],

  "link_urls": [{
    "website_url": "https://landing",
    "deeplink_url": "https://landing",            // só se cross-channel
    "object_store_urls": ["...", "..."],           // só se cross-channel
    "omnichannel_link_spec": { /* só se cross-channel */ }
  }],

  "asset_customization_rules": [
    { "customization_spec": {
        "publisher_platforms": ["facebook","instagram"],
        "facebook_positions": ["feed","marketplace","search"],
        "instagram_positions": ["stream","explore","profile_feed"]
      }, "image_label": { "name": "IMAGE_FEED" }, "priority": 1 },
    { "customization_spec": {
        "publisher_platforms": ["facebook","instagram"],
        "facebook_positions": ["story","facebook_reels"],
        "instagram_positions": ["story","reels"]
      }, "image_label": { "name": "IMAGE_VERTICAL" }, "priority": 2 },
    { "customization_spec": {
        "publisher_platforms": ["facebook"],
        "facebook_positions": ["instant_article","right_hand_column",
                               "suggested_video","video_feeds"]
      }, "image_label": { "name": "IMAGE_HORIZONTAL" }, "priority": 3 },
    // Default rule (catch-all) — OBRIGATÓRIA pra editabilidade em ASC.
    // `customization_spec: {}` (vazio) pega qualquer placement do
    // Advantage+ que nao caiu nas regras acima (Audience Network,
    // Messenger, Threads, IG Reels Overlay/Explore Home, FB Instream
    // Video). Sem ela, edits manuais no Ads Manager disparam #1885876.
    //
    // ⚠️  NAO OMITIR `customization_spec`. Ate ~27/05/2026 a Meta aceitava
    //     a chave omissa; depois passou a rejeitar com code 100 / subcode
    //     1487390 ("Adcreative Create Failed: Something went wrong",
    //     is_transient=false). Ver war story em errors-subcodes.md.
    { "customization_spec": {}, "image_label": { "name": "IMAGE_FEED" }, "priority": 4 }
  ]
}

// Form level (SEMPRE):
degrees_of_freedom_spec = {
  "creative_features_spec": {
    "adapt_to_placement":            { "enroll_status": "OPT_OUT" },
    "add_text_overlay":              { "enroll_status": "OPT_OUT" },
    "creative_stickers":             { "enroll_status": "OPT_OUT" },
    "description_automation":        { "enroll_status": "OPT_OUT" },
    "enhance_cta":                   { "enroll_status": "OPT_OUT" },
    "image_background_gen":          { "enroll_status": "OPT_OUT" },
    "image_brightness_and_contrast": { "enroll_status": "OPT_OUT" },
    "image_templates":               { "enroll_status": "OPT_OUT" },
    "image_touchups":                { "enroll_status": "OPT_OUT" },
    "image_uncrop":                  { "enroll_status": "OPT_OUT" },
    "inline_comment":                { "enroll_status": "OPT_OUT" },
    "media_type_automation":         { "enroll_status": "OPT_OUT" },
    "product_extensions":            { "enroll_status": "OPT_OUT" },
    "text_optimizations":            { "enroll_status": "OPT_OUT" },
    "text_translation":              { "enroll_status": "OPT_OUT" },
    "video_auto_crop":               { "enroll_status": "OPT_OUT" }
  }
}

// Form level, só se cross-channel:
applink_treatment = "deeplink_with_web_fallback"

link_url = "https://landing"         // complementa link_urls[0]
access_token = "..."
```

### Mapeamento placement → label

| Placement interno | adlabel.name | Placements finais |
|---|---|---|
| `feed` | `IMAGE_FEED` | FB: feed, marketplace, search. IG: stream, explore, profile_feed |
| `stories` | `IMAGE_VERTICAL` | FB: story, facebook_reels. IG: story, reels |
| `horizontal` | `IMAGE_HORIZONTAL` | FB only: instant_article, right_hand_column, suggested_video, video_feeds |

---

## 4. Criar o Ad (após qualquer creative)

```
POST /act_{ID}/ads
Content-Type: application/x-www-form-urlencoded

name=<ad_name>
adset_id=<ADSET_ID>
creative={"creative_id":"<CREATIVE_ID>"}
status=PAUSED                    // OBRIGATÓRIO: sempre PAUSED
access_token=<token>

Response: { "id": "<ad_id>" }
```

---

## 5. Polling pós-criação (OBRIGATÓRIO)

```
for i in range(3):
  sleep 4s
  GET /{adId}?fields=effective_status,issues_info

  if issues_info não vazio:
    erro = issues_info[0].error_summary + issues_info[0].error_message
    → marcar ad como "erro" com essa mensagem

  if status in {ACTIVE, PAUSED, PENDING_REVIEW}:
    → OK, sair do loop

  if status in {DISAPPROVED, DELETED}:
    → erro

  else (IN_PROCESS etc):
    continuar
```

No projeto: `verificarIssuesAd()` em `src/lib/meta-criar.ts`.

---

## 6. Limites de copy (gates do Claudinho)

| Campo | Recomendado | Hard max | Validador |
|---|---|---|---|
| `message` | 125 | 2200 | ad-readiness.ts |
| `title` | 25-40 | 255 | ad-readiness.ts |
| `link_description` | 30 | 255 | ad-readiness.ts |

Regras de texto Meta (validarTextoMeta em ad-readiness.ts):

- Primeiro char não pode ser: `\ / ! . ? - * ( ) , ; :`
- Pontuação ASCII consecutiva (3+): proibida (exceção: `...`)
- Palavra > 30 chars: warning
- Palavras de 1 char: > 3 no texto = warning

---

## 7. CTAs aceitos

Whitelist em `src/lib/constants.ts` (`VALID_CTA_VALUES`).
Mais usados:

```
SHOP_NOW, LEARN_MORE, SIGN_UP, SUBSCRIBE, ORDER_NOW,
GET_OFFER, CONTACT_US, DOWNLOAD, APPLY_NOW, BOOK_TRAVEL,
BUY_NOW, GET_QUOTE, WATCH_MORE
```

Ad-readiness bloqueia CTA fora da whitelist (`cta_invalido`).
