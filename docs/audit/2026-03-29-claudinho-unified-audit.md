# Claudinho -- Unified System Audit & Improvement Plan

**Date:** 2026-03-29
**Auditors:** Product & Workflow Designer, Meta Ads Operations Specialist, Full-Stack Integration Architect, UX/UI Specialist, Data & Analytics Engineer

---

## Executive Summary

Claudinho is a well-structured internal tool with clean module separation, solid ad creation workflows, and a good foundation for growth. However, five independent audits converged on the same core risks: **the synchronous Meta upload pipeline is fundamentally incompatible with serverless timeouts**, **there is zero observability**, **performance data is never persisted**, and **several UX gaps create operational risk** (no confirmation before bulk upload, inconsistent forms, no progress indicators).

This plan organizes all findings into a unified, prioritized roadmap across three tiers.

---

## Critical Risks (Cross-Agent Consensus)

These issues were flagged by 3+ agents independently:

| Risk | Flagged By | Severity |
|------|-----------|----------|
| Meta upload pipeline exceeds Vercel function timeout | Architect, Product, Meta Ops | **Critical** |
| No idempotency -- retries create duplicate ads on Meta | Architect, Meta Ops, Product | **Critical** |
| No confirmation before "Subir Todos" (bulk upload to Meta) | UX, Product | **High** |
| Performance data is ephemeral (never persisted) | Data, Meta Ops | **High** |
| Zero logging/observability across entire codebase | Architect, Data | **High** |
| No rate limit handling for Meta API | Architect, Meta Ops | **High** |
| Sequential batch upload blocks UI for 30+ min | Product, UX | **High** |
| `audit_log.changes` uses 3 incompatible JSONB formats | Data, Architect | **High** |
| Single Meta token with no expiration detection | Meta Ops, Architect | **Medium** |
| No database transactions on multi-step operations | Architect, Data | **Medium** |

---

## Tier 1: Quick Wins (1-3 days each)

Low-risk, high-impact changes that can ship independently.

### QW-1: Confirmation dialog before bulk upload
**Source:** UX, Product | **Impact:** Safety
Add a shadcn AlertDialog before "Subir Todos" and "Subir Selecionados" showing exact count and list of ads. Prevents the single most costly accidental action.
**File:** `src/components/painel-criacao.tsx` (around line 396)

### QW-2: Per-ad progress counter during batch upload
**Source:** Product, UX | **Impact:** UX
Replace "Processando..." with "Subindo 3/15..." counter. Update inside the existing `for...of` loop.
**File:** `src/components/painel-criacao.tsx` (line 396)

### QW-3: Unify CTA options into shared constant
**Source:** UX | **Impact:** Consistency
Three components define CTA options differently (4 vs 6 options, PT vs EN labels). Extract to `src/lib/constants.ts`.
**Files:** `dialog-criar-anuncio.tsx`, `formulario-lote-videos.tsx`, `dialog-editar-anuncio.tsx`

### QW-4: Centralize Meta API version constant
**Source:** Meta Ops | **Impact:** Maintainability
`META_API_BASE` is hardcoded in 4 files. Extract to shared config.
**Files:** `meta-criar.ts`, `meta.ts`, `campanhas/route.ts`, `adsets/route.ts`

### QW-5: Add text length warnings to readiness check
**Source:** Meta Ops, Product | **Impact:** Quality
Add soft warnings in `ad-readiness.ts` for: primary text >125 chars, headline >40, description >30. Use existing `avisos` infrastructure.
**File:** `src/lib/ad-readiness.ts`

### QW-6: Add missing copy warnings to readiness check
**Source:** Product | **Impact:** Quality
Flag empty `texto_principal`, `titulo`, `descricao` as warnings (not blockers).
**File:** `src/lib/ad-readiness.ts`

### QW-7: Validate CTA type against whitelist
**Source:** Meta Ops | **Impact:** Error prevention
Check CTA against Meta's valid enum values before saving.
**File:** `src/lib/ad-readiness.ts`

### QW-8: Fix `Promise.all` in batch creation
**Source:** Architect | **Impact:** Reliability
Change `Promise.all` to `Promise.allSettled` in `/api/ads/lote/route.ts` and return per-item success/failure.
**File:** `src/app/api/ads/lote/route.ts` (line 64)

### QW-9: Standardize audit_log changes format
**Source:** Data | **Impact:** Data quality
Enforce `{ field: { old, new } }` structure everywhere. Fix `atualizarStatusAd` and `excluirAd`.
**File:** `src/lib/db.ts` (lines 329, 372)

### QW-10: Add missing database indexes
**Source:** Data | **Impact:** Performance
Add: `ads(meta_ad_id)`, `ads(brand_id, ad_name, campaign_name) UNIQUE`, `audit_log(user_id)`, `audit_log(action)`.
**File:** `supabase/schema.sql`

### QW-11: Add ROAS and video metrics to Meta insights
**Source:** Meta Ops, Data | **Impact:** Analytics
Add `purchase_roas`, `frequency`, `video_p25/50/75/100_watched_actions` to the fields list.
**File:** `src/lib/meta.ts`

### QW-12: Replace native `confirm()` with shadcn AlertDialog for delete
**Source:** UX | **Impact:** UX polish
**File:** `src/components/painel-criacao.tsx` (line 671)

### QW-13: Fix meta_account_id format inconsistency
**Source:** Data | **Impact:** Data quality
`brands` stores `act_*`, `ads` strips the prefix. Pick one convention.
**Files:** `src/app/api/meta/criar-anuncio/route.ts`, `supabase/schema.sql`

### QW-14: Extract shared utility functions
**Source:** UX | **Impact:** Maintainability
`formatarNumero`, `formatarMoeda`, `extrairDriveFileId` are duplicated. Move to `src/lib/utils.ts`.
**Files:** `tabela-anuncios.tsx`, `cartoes-resumo.tsx`, `dialog-criar-anuncio.tsx`, `tabela-pendentes.tsx`

### QW-15: Increase error_message capacity
**Source:** Meta Ops | **Impact:** Debuggability
Remove `.slice(0, 200)` truncation or increase to 500+ chars.
**File:** `src/app/api/meta/criar-anuncio/route.ts` (line 222)

### QW-16: Remove redundant manual asset deletion
**Source:** Architect | **Impact:** Simplification
`excluirAd` manually deletes assets before deleting the ad, but `ON DELETE CASCADE` already handles this.
**File:** `src/lib/db.ts` (line 361)

---

## Tier 2: Medium-Term Improvements (1-2 weeks each)

Require more coordination but deliver substantial value.

### MT-1: Background job queue for Meta uploads
**Source:** Architect, Product, Meta Ops | **Impact:** Critical reliability fix
**The single most important architectural change.** Move the entire upload pipeline out of the HTTP request handler. The endpoint should mark the ad as "processando" and return immediately. A background worker handles: download from Drive, upload to Meta, poll for processing, create creative, create ad.
**Options:** Inngest, Trigger.dev, QStash, or Vercel Cron + Supabase polling.
**Enables:** Proper retry, idempotency, progress tracking, no timeout risk.

### MT-2: Idempotency guards on Meta operations
**Source:** Meta Ops, Architect | **Impact:** Prevents duplicate ads
Before creating a creative/ad, check if `meta_creative_id` or `meta_ad_id` already exists. Skip re-creation on retry.
**File:** `src/app/api/meta/criar-anuncio/route.ts`

### MT-3: Cascading Campaign/AdSet selectors in single-ad dialog
**Source:** Product, UX | **Impact:** Eliminates most common friction point
Port the cascading select pattern from `formulario-lote-videos.tsx` into `dialog-criar-anuncio.tsx`. API endpoints already exist.
**Files:** `src/components/dialog-criar-anuncio.tsx`

### MT-4: Add structured logging
**Source:** Architect, Data | **Impact:** Observability foundation
Add pino or JSON console.log with timing and context to every Meta API call, Drive operation, and database mutation. Add request correlation IDs.
**All lib/ and api/ files**

### MT-5: Meta API rate limit handling
**Source:** Meta Ops, Architect | **Impact:** Reliability
Implement retry wrapper with exponential backoff detecting Meta error codes 17/32 and HTTP 429.
**Files:** `src/lib/meta-criar.ts`, `src/lib/meta.ts`

### MT-6: Daily performance data ETL
**Source:** Data | **Impact:** Unlocks analytics and AI
Create `daily_ad_performance` table. Run daily job to fetch and store Meta insights snapshots. Schema: `meta_ad_id, date, impressions, clicks, spend, reach, ctr, cpc, cpm, frequency, actions, cost_per_action`.
**Files:** New migration, new scheduled function

### MT-7: Parallel batch upload with concurrency control
**Source:** Product, UX | **Impact:** 3-5x faster batch uploads
Replace sequential `for...of await` with concurrent executor (3-5 simultaneous). Combine with MT-1 for best results.
**File:** `src/components/painel-criacao.tsx`

### MT-8: Wrap DB operations in transactions
**Source:** Architect, Data | **Impact:** Data integrity
Create Postgres function for `criarAd` (insert ad + assets + audit atomically). Call via `supabase.rpc()`.
**File:** `src/lib/db.ts`, new migration

### MT-9: Token health check endpoint
**Source:** Meta Ops, Architect | **Impact:** Proactive failure prevention
Call Meta's `debug_token` endpoint periodically. Surface warnings in UI when token nears expiration.
**New endpoint + UI component**

### MT-10: Unify brand selection across pages
**Source:** UX | **Impact:** Consistency
Create shared `BrandProvider` context. Replace hardcoded `CONTAS` in `seletor-conta.tsx` with API data. Persist selection across pages.
**Files:** New context provider, `seletor-conta.tsx`, all page components

### MT-11: Add sorting to performance table
**Source:** UX | **Impact:** Dashboard usability
Allow column header clicks to sort by spend, CTR, CPC, etc.
**File:** `src/components/tabela-anuncios.tsx`

### MT-12: Duplicate detection on ad creation
**Source:** Product, Data | **Impact:** Prevents wasted Meta spend
Query for existing `ad_name + ad_set_id + brand_id` before saving. Add unique DB constraint as safety net.
**Files:** `src/app/api/ads/route.ts`, `supabase/schema.sql`

### MT-13: Add filters to history page
**Source:** UX | **Impact:** Audit usability
Add action type dropdown, date range, search by entity name.
**File:** `src/components/painel-historico.tsx`

### MT-14: Normalize campaigns and ad sets
**Source:** Data | **Impact:** Schema quality
Create `campaigns` and `ad_sets` tables. Migrate denormalized fields to foreign keys.
**New migration**

### MT-15: Stream video uploads (avoid OOM)
**Source:** Architect | **Impact:** Reliability for large files
Stream Drive download directly to Meta upload instead of buffering entire video in memory.
**Files:** `src/lib/drive.ts`, `src/lib/meta-criar.ts`

---

## Tier 3: Strategic Upgrades (1+ months)

Foundational changes that enable AI-driven automation and long-term scalability.

### ST-1: Event-driven architecture
**Source:** Architect | **Impact:** Foundation for all automation
Replace synchronous pipeline with event-driven flow: `ad.created` -> worker downloads -> `video.uploaded` -> creative created -> `ad.live`. Each step independently retryable and observable. Inngest step functions or Temporal workflows.

### ST-2: Real-time status updates via Supabase Realtime
**Source:** Product, UX | **Impact:** Responsive UI during long operations
Subscribe to `ads` table changes. Panel updates instantly when status changes. Pairs with MT-1.

### ST-3: Dynamic Creative Optimization (DCO)
**Source:** Meta Ops | **Impact:** Performance optimization
Allow multiple headlines, descriptions, images per ad. Create single creative with `asset_feed_spec` variants. Meta's algorithm optimizes combinations.

### ST-4: A/B testing workflow
**Source:** Meta Ops, Product | **Impact:** Creative optimization
Create N ad variants from single briefing. Track which variant wins.

### ST-5: Carousel creative support
**Source:** Meta Ops | **Impact:** High-performing format for e-commerce
Extend `meta-criar.ts` with `criarCreativeCarrossel()`.

### ST-6: Ad template system
**Source:** Product | **Impact:** Productivity for repeat campaigns
Save/reuse ad templates (campaign, copy, CTA, link pattern). New ads require only selecting template + adding asset.

### ST-7: AI-powered copy suggestions
**Source:** Product, Data | **Impact:** Creative acceleration
"Suggest with AI" button next to text fields. Generate copy based on campaign context, brand voice, past performance.
**Requires:** MT-6 (performance data) for performance-informed suggestions.

### ST-8: Predictive creative scoring
**Source:** Data | **Impact:** Pre-launch performance estimation
Train model predicting CTR/CPC from creative features. Show "Creative Score" in creation dialog.
**Requires:** MT-6 (500+ ads with 7+ days performance data), feature extraction pipeline.

### ST-9: Multi-tenant token management
**Source:** Meta Ops, Architect | **Impact:** Security & resilience
Replace single `META_ACCESS_TOKEN` with per-brand System User tokens. Auto-refresh via Meta's token exchange.

### ST-10: Observability platform (OpenTelemetry)
**Source:** Architect, Data | **Impact:** Full operational visibility
Traces across pipeline (HTTP -> DB -> Drive -> Meta -> DB). Dashboards for success rate, latency, error rate.

### ST-11: Comprehensive test suite
**Source:** Architect | **Impact:** Development velocity & confidence
Vitest for unit tests (pure functions in ad-media, ad-readiness, utm, sheets). Playwright for E2E.

### ST-12: Automated rules engine
**Source:** Meta Ops | **Impact:** Hands-off optimization
Server-side rules: auto-pause underperforming ads, scale budgets on winners. Requires scheduled job + performance data.

### ST-13: Drive folder monitoring
**Source:** Product | **Impact:** Proactive ad creation
Watch Drive folders. Auto-create drafts when new videos appear, with metadata from folder naming.

---

## Recommended Execution Order

### Phase 1: Stabilize (Weeks 1-2)
Focus: Safety and reliability fundamentals.
- QW-1 (confirmation dialog) -- prevents accidental bulk upload
- QW-2 (progress counter) -- visibility during operations
- QW-8 (Promise.allSettled) -- batch reliability
- QW-9 (audit format) -- data quality foundation
- QW-10 (indexes) -- performance
- QW-13 (meta_account_id) -- data consistency
- QW-15 (error message capacity) -- debuggability

### Phase 2: Reliability (Weeks 3-5)
Focus: The upload pipeline.
- MT-1 (background job queue) -- **critical path**
- MT-2 (idempotency) -- prevents duplicate Meta ads
- MT-4 (structured logging) -- observability
- MT-5 (rate limit handling) -- API resilience

### Phase 3: UX & Quality (Weeks 6-8)
Focus: Daily workflow improvement.
- MT-3 (cascading selects in single-ad dialog)
- QW-3 (unified CTA options)
- QW-5 + QW-6 (readiness warnings)
- MT-10 (unified brand selection)
- MT-12 (duplicate detection)
- QW-12 (AlertDialog for delete)

### Phase 4: Analytics Foundation (Weeks 9-11)
Focus: Data for decisions and AI.
- MT-6 (daily performance ETL)
- QW-11 (ROAS + video metrics)
- MT-14 (normalize campaigns/ad sets)
- MT-11 (sortable performance table)
- MT-13 (history page filters)

### Phase 5: Strategic (Months 4+)
Focus: Automation and intelligence.
- ST-1 (event-driven architecture)
- ST-2 (real-time updates)
- ST-7 (AI copy suggestions)
- ST-3 (DCO) + ST-5 (carousel)
- ST-8 (predictive scoring)

---

## Appendix: Individual Audit Reports

The five specialist reports are available with full detail, code references, and line numbers:

1. **Product & Workflow Designer** -- Workflow maps, friction points, automation opportunities
2. **Meta Ads Operations Specialist** -- API alignment, platform constraints, creative best practices
3. **Full-Stack Integration Architect** -- Reliability, async processing, security, scalability
4. **UX/UI Specialist** -- Information architecture, task efficiency, accessibility, consistency
5. **Data & Analytics Engineer** -- Data model, instrumentation, AI/ML readiness, pipeline design
