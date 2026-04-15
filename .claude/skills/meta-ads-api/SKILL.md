---
name: meta-ads-api
description: |
  Deep reference for the Meta/Facebook Ads API as used in this project.
  Use when creating, editing, debugging, or extending any Meta Ads integration code.
  Triggers on: meta ads, facebook ads, creative, adset, campaign, placement, ad creation,
  upload video, image upload, cross-channel, omnichannel, applink, asset_feed_spec.
---

# Meta Ads API — Project Reference

This skill provides validated patterns, payload structures, and known gotchas
for the Meta Marketing API as integrated in this codebase. Every structure
below has been validated in production.

## Architecture Overview

```
Client (React)
  ├── POST /api/meta/criar-anuncio   → starts pipeline (saves to Supabase, returns immediately)
  │     └── POST /api/meta/processar → long-running pipeline:
  │           Step A: Upload video/image to Meta
  │           Step B: Poll video processing status (video only)
  │           Step C: Create adcreative
  │           Step D: Create ad, verify delivery issues
  ├── GET  /api/meta/campanhas       → list campaigns (ACTIVE + PAUSED)
  ├── GET  /api/meta/adsets          → list ad sets for a campaign
  ├── GET  /api/meta/anuncios        → list ads with insights (5min cache)
  └── POST /api/meta/sync-status     → sync effective_status from Meta → Supabase
```

Core libs: `src/lib/meta-criar.ts` (36KB, all creation logic), `src/lib/meta-retry.ts`,
`src/lib/meta-config.ts`, `src/lib/erros-meta.ts`, `src/lib/ad-media.ts`, `src/lib/ad-readiness.ts`.

API version: **v23.0** (`src/lib/meta-config.ts`)

## Key Files

| Purpose | File |
|---------|------|
| Video/Image upload + Creative + Ad creation | `src/lib/meta-criar.ts` |
| Rate-limited fetch with retry | `src/lib/meta-retry.ts` |
| API base URL / version | `src/lib/meta-config.ts` |
| Error classification (subcodes) | `src/lib/erros-meta.ts` |
| Image placement detection | `src/lib/ad-media.ts` |
| Pre-submit validation | `src/lib/ad-readiness.ts` |
| Pipeline orchestrator (steps A→D) | `src/app/api/meta/processar/route.ts` |
| Entry point (start pipeline) | `src/app/api/meta/criar-anuncio/route.ts` |
| Sync statuses from Meta | `src/app/api/meta/sync-status/route.ts` |
| Supabase schema (ads + ad_assets) | `supabase/migrations/20240101000000_init.sql` |

---

## 1. Video Upload

### Simple Upload (<50MB)

```
POST https://graph.facebook.com/v23.0/{accountId}/advideos
Content-Type: multipart/form-data

Fields:
  source: Blob (video file)
  title: string (filename)
  access_token: string

Response: { id: "video_id" }
```

### Chunked Upload (>=50MB)

Three-phase protocol:

```
Phase 1 — START
POST /{accountId}/advideos
  upload_phase=start
  file_size={totalBytes}
  access_token=...
Response: { upload_session_id, video_id, start_offset, end_offset }

Phase 2 — TRANSFER (repeat until done)
POST /{accountId}/advideos
  upload_phase=transfer
  upload_session_id=...
  start_offset={currentOffset}
  video_file_chunk=Blob (4MB chunk)
  access_token=...
Response: { start_offset: nextOffset, end_offset }
⚠️ Use response's start_offset for the NEXT chunk, not your calculated offset.

Phase 3 — FINISH
POST /{accountId}/advideos
  upload_phase=finish
  upload_session_id=...
  access_token=...
```

### Video Processing Poll

```
GET /{videoId}?fields=status&access_token=...

Response: { status: { video_status: "ready" | "processing" | "error" } }

Poll config: up to 30 attempts, 5-15s intervals, timeout after 5 min.
⚠️ Always wait for "ready" before creating creative. Creating a creative
   with a still-processing video produces a WITH_ISSUES ad.
```

**Idempotency**: Skip re-upload if `ad_assets.meta_asset_id` is already set.

---

## 2. Image Upload

```
POST /{accountId}/adimages
Content-Type: multipart/form-data

Fields:
  filename: Blob (downloaded image)
  access_token: string

Response: { images: { "filename": { hash: "abc123" } } }
```

Returns a hash, NOT an ID. The hash is used in creative payloads.

---

## 3. Creative Creation — VIDEO

```
POST /{accountId}/adcreatives
Content-Type: application/x-www-form-urlencoded

Fields:
  name: string
  object_story_spec: JSON.stringify({
    page_id: "PAGE_ID",
    video_data: {
      video_id: "VIDEO_ID",
      message: "texto principal / legenda",
      title: "título",
      link_description: "descrição curta",
      image_url: "https://thumbnail.url",
      call_to_action: {
        type: "SHOP_NOW",
        value: {
          link: "https://landing-page.url",
          object_store_urls: ["https://play.google.com/...", "https://apps.apple.com/..."]
            // ⚠️ Only include if cross-channel! Array of store URLs.
        }
      }
    },
    instagram_user_id: "IG_USER_ID"
      // ⚠️ REQUIRED for IG placements. Without it: subcode 1772103.
      // Resolve via: GET /{pageId}?fields=instagram_business_account
      //          or: GET /{pageId}/instagram_accounts?fields=id
      //          or: env META_INSTAGRAM_ACTOR_ID_{pageId}
  })

  // ⚠️ Cross-channel fields (only when promoted_object has omnichannel_object):
  applink_treatment: "deeplink_with_web_fallback"
  omnichannel_link_spec: JSON.stringify({
    web: { url: "https://landing-page.url" },
    app: {
      application_id: "APP_ID",
      platform_specs: {
        android: { url: "https://play.google.com/..." },
        ios: { url: "https://apps.apple.com/..." }
      }
    }
  })

  access_token: string

Response: { id: "creative_id" }
```

### How to detect cross-channel

```
GET /{adsetId}?fields=promoted_object&access_token=...

Response: {
  promoted_object: {
    omnichannel_object: {
      app: [{
        object_store_urls: ["https://play.google.com/...", "https://apps.apple.com/..."],
        application_id: "APP_ID"
      }]
    }
  }
}
```

If `omnichannel_object` exists → include `applink_treatment` + `omnichannel_link_spec` + `object_store_urls` in CTA.

---

## 4. Creative Creation — IMAGE (Multi-Placement)

This is the most complex payload. Used when we have 2+ placement-specific images
(feed 1:1, stories 9:16, horizontal 1.91:1).

```
POST /{accountId}/adcreatives

Fields:
  name: string
  object_story_spec: JSON.stringify({
    page_id: "PAGE_ID",
    instagram_user_id: "IG_USER_ID"  // optional but recommended
  })

  asset_feed_spec: JSON.stringify({
    ad_formats: ["AUTOMATIC_FORMAT"],
    optimization_type: "PLACEMENT",

    images: [
      { hash: "abc123", adlabels: [{ name: "IMAGE_FEED" }] },
      { hash: "def456", adlabels: [{ name: "IMAGE_VERTICAL" }] },
      { hash: "ghi789", adlabels: [{ name: "IMAGE_HORIZONTAL" }] }
    ],

    bodies: [{ text: "Texto principal" }],
    titles: [{ text: "Título" }],
    descriptions: [{ text: "Descrição" }],

    link_urls: [{
      website_url: "https://landing-page.url",

      // ⚠️ CRITICAL: omnichannel_link_spec goes INSIDE link_urls[0],
      //    NOT at the form level. Getting this wrong → subcode 2446461.
      omnichannel_link_spec: {    // only if cross-channel
        web: { url: "https://..." },
        app: {
          application_id: "APP_ID",
          platform_specs: {
            android: { url: "https://play.google.com/..." },
            ios: { url: "https://apps.apple.com/..." }
          }
        }
      }
    }],

    call_to_action_types: ["SHOP_NOW"],

    asset_customization_rules: [
      {
        customization_spec: {
          publisher_platforms: ["facebook"],
          facebook_positions: ["feed", "marketplace", "search"]
        },
        image_label: { name: "IMAGE_FEED" }
      },
      {
        customization_spec: {
          publisher_platforms: ["facebook"],
          facebook_positions: ["story", "reels"]
        },
        image_label: { name: "IMAGE_VERTICAL" }
      },
      // ... (instagram positions too)
      {
        customization_spec: {
          publisher_platforms: ["instagram"],
          instagram_positions: ["stream", "explore_home", "ig_search"]
        },
        image_label: { name: "IMAGE_FEED" }
      }
    ]
  })

  // ⚠️ For images, applink_treatment goes at FORM level (not inside asset_feed_spec):
  applink_treatment: "deeplink_with_web_fallback"  // only if cross-channel

  // Disable all Advantage+ creative modifications:
  degrees_of_freedom_spec: JSON.stringify({
    creative_features_spec: {
      standard_enhancements: { enroll_status: "OPT_OUT" },
      image_enhancement: { enroll_status: "OPT_OUT" },
      text_generation: { enroll_status: "OPT_OUT" },
      image_touchups: { enroll_status: "OPT_OUT" },
      inline_comment: { enroll_status: "OPT_OUT" },
      profile_card: { enroll_status: "OPT_OUT" }
    }
  })

  access_token: string
```

### Placement Label Mapping

| Internal Name | adlabel | Feeds |
|---------------|---------|-------|
| `feed` | `IMAGE_FEED` | FB: feed, marketplace, search; IG: stream, explore, ig_search |
| `stories` | `IMAGE_VERTICAL` | FB: story, reels; IG: story, reels, profile_reels |
| `horizontal` | `IMAGE_HORIZONTAL` | FB only: instant_article, right_column, suggested_video, video_feeds |

### Placement Detection (ad-media.ts)

Infer from image dimensions:
- ~1:1 (1080x1080) → `feed`
- ~9:16 (1080x1920) → `stories`
- ~1.91:1 (1200x628) → `horizontal`

Or from URL/filename containing "feed", "stories", "story", "horizontal", "landscape".

---

## 5. Ad Creation

```
POST /{accountId}/ads

Fields:
  name: "ad_name"
  adset_id: "ADSET_ID"
  creative: JSON.stringify({ creative_id: "CREATIVE_ID" })
  status: "PAUSED"
  access_token: string

Response: { id: "ad_id" }
```

⚠️ Always create as PAUSED. The team activates manually in Ads Manager.

### Post-Creation Verification

```
GET /{adId}?fields=effective_status,issues_info&access_token=...

Poll 3 times with 4s intervals. Check for:
  - effective_status: "WITH_ISSUES" → extract issues_info[0].error_summary
  - effective_status: "DISAPPROVED" → blocked by Meta policy
  - effective_status: "ACTIVE" | "PAUSED" | "PENDING_REVIEW" → OK
```

---

## 6. Reading Ads & Insights

```
GET /{accountId}/ads?fields=
  id,name,effective_status,
  creative{id,thumbnail_url,body,title},
  campaign{id,name,objective},
  adset{id,name,daily_budget},
  insights.date_preset({datePreset}){
    impressions,clicks,spend,ctr,cpc,cpm,reach,
    actions,cost_per_action_type
  }
  &filtering=[{"field":"ad.effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]
  &limit=200

Date presets: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month
```

Pagination: follow `paging.next` URL until null.

---

## 7. Deleting Ads

```
DELETE /{adId}?access_token=...
```

Error code 803 ("Object does not exist") → treat as success.

---

## 8. Known Gotchas & War Stories

### Critical — These WILL break your creative if wrong:

| # | Issue | Wrong | Right |
|---|-------|-------|-------|
| 1 | **omnichannel_link_spec position (IMAGE)** | At form level | Inside `asset_feed_spec.link_urls[0]` |
| 2 | **omnichannel_link_spec position (VIDEO)** | Inside object_story_spec | At form level |
| 3 | **Instagram actor ID missing** | Omit it | Always resolve via page → IG business account |
| 4 | **applink_treatment missing** | Omit when cross-channel | Always include `deeplink_with_web_fallback` when omnichannel |
| 5 | **object_store_urls format** | String | Array of strings in CTA value |
| 6 | **Video not ready** | Create creative immediately after upload | Poll status until "ready" |

### Operational:

| # | Issue | Detail |
|---|-------|--------|
| 7 | **Advantage+ 150 ad limit** | Delete `meta_creative_id` and `meta_ad_id` before retrying failed ads to avoid zombie accumulation |
| 8 | **Rate limiting** | Codes 17, 32, 4, HTTP 429 → exponential backoff (1s base, 30s max, 3 attempts) |
| 9 | **Account ID prefix** | Always store/use `act_` prefix. Some endpoints return without it |
| 10 | **Stale processing** | If video stays "processing" >5min, timeout and mark as error |
| 11 | **WITH_ISSUES detection** | Poll effective_status 3x after ad creation; if WITH_ISSUES, revert ad to "erro" in Supabase |
| 12 | **Sync deleting active ads** | When syncing status, NEVER mark active ads as DELETED. Only update if Meta returns non-200 with error 803/100 |
| 13 | **degrees_of_freedom_spec** | OPT_OUT all creative features for image ads to prevent Meta from auto-modifying assets |

### Error Subcodes Reference:

| Subcode | Meaning | Fix |
|---------|---------|-----|
| 1772103 | IG identity not set | Resolve instagram_user_id from page |
| 2446811 | Campaign at 150 ad limit | Pause/delete old ads first |
| 2446455 | Missing applink_treatment | Add `deeplink_with_web_fallback` for cross-channel |
| 2446461 | omnichannel_link_spec wrong position | Move inside link_urls[] for images |
| #190 | Invalid OAuth token | Refresh or re-auth |

---

## 9. Database Schema (Supabase)

### ads table
Key columns for Meta integration:
- `type`: "video" | "image"
- `status`: "pendente" | "processando" | "concluido" | "erro"
- `meta_ad_id`: the ad ID returned by Meta after creation
- `meta_creative_id`: the creative ID (clear on retry!)
- `meta_account_id`: always with `act_` prefix
- `meta_effective_status`: synced from Meta (ACTIVE, PAUSED, DELETED, DISAPPROVED, WITH_ISSUES, etc.)

### ad_assets table
- `asset_type`: "video" | "image"
- `placement`: "feed" | "stories" | "horizontal" | "video_principal"
- `asset_url`: source URL (Drive for video, public URL for image)
- `meta_asset_id`: video ID or image hash after Meta upload

---

## 10. Creative Specs & Constraints

### Text Limits

| Field | Recommended | Hard Max | Notes |
|-------|-------------|----------|-------|
| `name` (creative name) | — | 100 chars | |
| `message` / primary text | 125 chars | 2200 chars | Truncated after ~125 on mobile |
| `title` / headline | 25-40 chars | 255 chars | Truncated after ~25 in feed |
| `link_description` | 30 chars | 255 chars | Not shown on all placements |
| `link` / URL | — | 1000 chars | |

### Text Validation Rules

- **Prohibited first characters**: `\ / ! . ? - * ( ) , ; :`
- **Consecutive punctuation**: Forbidden except `...`
- **Max word length**: 30 characters
- **Max single-character words**: 3
- **Disallowed**: IPA symbols, standalone diacritics, superscript/subscript (except TM/SM), `^~_={}[]|<>`

### Image Specs

| Placement | Aspect Ratio | Recommended Size | Min Size |
|-----------|-------------|-----------------|----------|
| Feed (FB+IG) | 1:1 | 1080x1080 | 600x600 |
| Stories/Reels | 9:16 | 1080x1920 | 600x1067 |
| Right Column / Horizontal | 1.91:1 | 1200x628 | 600x314 |
| Carousel | 1:1 | 1080x1080 | 600x600 |

- **Formats**: JPG, PNG (PNG for transparency)
- **Max file size**: 30 MB
- **Min width**: 600px

### Video Specs

| Spec | Feed | Stories/Reels | In-Stream |
|------|------|--------------|-----------|
| Aspect ratio | 1:1 or 4:5 | 9:16 | 16:9 |
| Duration | 1s - 241min | 1-120s | 5-15s |
| Resolution | 1080x1080+ | 1080x1920 | 1920x1080 |

- **Formats**: MP4, MOV (MP4 preferred)
- **Codecs**: H.264 video, AAC audio (128kbps+)
- **Max file size**: 4 GB
- **Thumbnail**: Auto-generated or custom `image_url` in video_data

---

## 11. CTA Values (call_to_action type)

### Used in this project:

```
SHOP_NOW, LEARN_MORE, SIGN_UP, SUBSCRIBE, ORDER_NOW,
GET_OFFER, CONTACT_US, DOWNLOAD, APPLY_NOW, BOOK_TRAVEL,
BUY_NOW, GET_QUOTE, WATCH_MORE
```

### Full Meta API enum (65+ values, most common):

```
SHOP_NOW, LEARN_MORE, SIGN_UP, SUBSCRIBE, ORDER_NOW,
GET_OFFER, CONTACT_US, DOWNLOAD, APPLY_NOW, BOOK_TRAVEL,
BUY_NOW, GET_QUOTE, WATCH_MORE, OPEN_LINK, LIKE_PAGE,
INSTALL_APP, PLAY_GAME, WHATSAPP_MESSAGE, SEND_MESSAGE,
CALL_NOW, GET_DIRECTIONS, LISTEN_NOW, SEE_MENU,
USE_APP, SELL_NOW, REQUEST_TIME, MESSAGE_PAGE
```

---

## 12. Campaign & Ad Set Enums

### Campaign Objectives

```
Outcome-based (current):
  OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT,
  OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_APP_PROMOTION

Legacy (still functional):
  APP_INSTALLS, BRAND_AWARENESS, CONVERSIONS, EVENT_RESPONSES,
  LEAD_GENERATION, LINK_CLICKS, LOCAL_AWARENESS, MESSAGES,
  OFFER_CLAIMS, PAGE_LIKES, POST_ENGAGEMENT, PRODUCT_CATALOG_SALES,
  REACH, STORE_VISITS, VIDEO_VIEWS
```

### Special Ad Categories

```
NONE, EMPLOYMENT, HOUSING, CREDIT, ISSUES_ELECTIONS_POLITICS,
ONLINE_GAMBLING_AND_GAMING, FINANCIAL_PRODUCTS_SERVICES
```

### Bid Strategies

| Value | Behavior |
|-------|----------|
| `LOWEST_COST_WITHOUT_CAP` | Maximize results at lowest cost (default) |
| `LOWEST_COST_WITH_BID_CAP` | Set max bid per optimization event |
| `COST_CAP` | Keep average cost at or below your cap |
| `LOWEST_COST_WITH_MIN_ROAS` | Optimize for minimum return on ad spend |

### Optimization Goals by Objective

| Objective | Default | Common Alternatives |
|-----------|---------|-------------------|
| CONVERSIONS | OFFSITE_CONVERSIONS | LINK_CLICKS, LANDING_PAGE_VIEWS, VALUE, REACH |
| LEAD_GENERATION | LEAD_GENERATION | QUALITY_LEAD, LINK_CLICKS |
| LINK_CLICKS | LINK_CLICKS | LANDING_PAGE_VIEWS, REACH |
| APP_INSTALLS | APP_INSTALLS | LINK_CLICKS, OFFSITE_CONVERSIONS, VALUE |
| VIDEO_VIEWS | THRUPLAY | — |
| MESSAGES | CONVERSATIONS | LEAD_GENERATION, LINK_CLICKS |
| PRODUCT_CATALOG_SALES | OFFSITE_CONVERSIONS | LINK_CLICKS, VALUE |

### Campaign/Ad Status Values

```
ACTIVE, PAUSED, DELETED, ARCHIVED
```

### Ad effective_status Values

```
ACTIVE, PAUSED, DELETED, ARCHIVED, PENDING_REVIEW,
DISAPPROVED, PREAPPROVED, PENDING_BILLING_INFO,
CAMPAIGN_PAUSED, ADSET_PAUSED, IN_PROCESS, WITH_ISSUES
```

---

## 13. Insights & Reporting

### Common Metrics

| Field | Description |
|-------|-------------|
| `impressions` | Number of times ads were shown |
| `reach` | Unique people who saw the ad |
| `clicks` | All clicks (links, reactions, comments, shares) |
| `spend` | Total amount spent |
| `ctr` | Click-through rate (%) |
| `cpc` | Cost per click |
| `cpm` | Cost per 1000 impressions |
| `actions` | Array of `{action_type, value}` objects |
| `cost_per_action_type` | Array of `{action_type, value}` costs |
| `unique_clicks` | Unique people who clicked |
| `frequency` | Average times each person saw the ad |

### Action Types (in actions[] array)

| action_type | Measures |
|-------------|----------|
| `link_click` | Link clicks to destination |
| `outbound_click` | Clicks leaving Facebook/IG |
| `landing_page_view` | Landing page views (with pixel) |
| `post_reaction` | Reactions (like, love, etc.) |
| `comment` | Post comments |
| `post` | Post shares |
| `video_view` | 3-second video views |
| `omni_purchase` | Purchases (all channels) |
| `offsite_conversion.fb_pixel_purchase` | Pixel purchase events |
| `offsite_conversion.fb_pixel_lead` | Pixel lead events |
| `offsite_conversion.fb_pixel_add_to_cart` | Pixel add-to-cart |
| `offsite_conversion.fb_pixel_view_content` | Pixel content views |
| `onsite_conversion.messaging_conversation_started_7d` | Messaging conversations |
| `lead` | All lead types aggregated |
| `page_engagement` | All page engagement aggregated |

### Date Presets

```
today, yesterday, this_month, last_month, this_quarter,
last_3d, last_7d, last_14d, last_28d, last_30d, last_90d,
last_week_mon_sun, last_week_sun_sat,
last_quarter, last_year, this_week_mon_today, this_week_sun_today,
this_year, maximum, data_maximum, lifetime
```

### Attribution Windows

```
1d_click, 7d_click, 28d_click, 1d_view, 7d_view, 28d_view
```

Default: `7d_click, 1d_view`

### Breakdowns

```
age, gender, country, region, impression_device,
platform_position, publisher_platform, device_platform,
product_id, place_page_id, hourly_stats_aggregated_by_advertiser_time_zone
```

---

## 14. Alcohol Compliance (Brazil)

This project advertises alcoholic beverages (wine). Key requirements:
- Age-gate modal on landing pages (18+ for Brazil)
- Ad copy must include "Beba com Moderação!" (Drink Responsibly)
- Special ad category: `NONE` (alcohol ads aren't a special category, but targeting is restricted to 18+ automatically by Meta in Brazil)
- Custom labels used for catalog: price_range, occasion, status, origin, grape type

---

## When to use this skill

Invoke this skill whenever:
- Creating or modifying ad creation pipelines
- Debugging Meta API errors (check subcodes table first)
- Adding new placement types or creative formats
- Implementing cross-channel / omnichannel features
- Working with video upload or image upload flows
- Modifying sync or status checking logic
- Adding new CTA types or creative fields
- Building or extending insights/reporting features
- Changing bidding/optimization settings
- Working with campaign objectives or targeting

Always read the actual code in `src/lib/meta-criar.ts` before making changes —
this reference describes the validated patterns but the source of truth is the code.
