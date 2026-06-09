# Importação de Anúncios Estáticos via ClickUp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a ClickUp-based static image ad import system analogous to the existing video import from Google Drive.

**Architecture:** Two-dialog flow (explorer → batch form) backed by a ClickUp API client with in-memory caching. The existing `/api/ads/lote` endpoint is extended to support image ads. All filtering is client-side after a single cached index load.

**Tech Stack:** Next.js App Router, React hooks, shadcn/ui, ClickUp API v2, Supabase, Clerk auth, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-04-04-importacao-estaticos-clickup-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/clickup.ts` | ClickUp API client — fetch tasks, resolve custom fields, cache index |
| Create | `src/app/api/clickup/tasks/route.ts` | GET endpoint — returns cached ClickUp index |
| Create | `src/components/dialog-explorador-clickup.tsx` | Explorer dialog — browse/filter/select ClickUp cards |
| Create | `src/components/formulario-lote-imagens.tsx` | Batch form — configure destination + per-ad fields, save |
| Modify | `src/app/api/ads/lote/route.ts` | Extend to accept `type` and `assets` from request body |
| Modify | `src/components/painel-criacao.tsx` | Add button + states for static ads flow |

---

### Task 1: ClickUp API Client (`src/lib/clickup.ts`)

**Files:**
- Create: `src/lib/clickup.ts`

- [ ] **Step 1: Create the ClickUp client with types and index loader**

```typescript
// src/lib/clickup.ts
import { classificarPlacementImagem } from "@/lib/ad-media";

// ─── Config ────────────────────────────────────────────────
const CLICKUP_BASE = "https://api.clickup.com/api/v2";
const CLICKUP_LIST_ID = "11430929"; // Externos Evino
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const CONCURRENCY = 10;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function getToken(): string {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN não configurado.");
  return token;
}

// ─── Types ─────────────────────────────────────────────────

export interface ClickUpAttachment {
  id: string;
  title: string;
  url: string;
  thumbnailLarge: string | null;
  thumbnailSmall: string | null;
  extension: string;
  size: number;
  placement: string;
}

export interface ClickUpTask {
  id: string;
  name: string;
  status: string;
  tipo: string | null;
  yearMonth: string | null;
  entrega: string | null;
  url: string;
  attachments: ClickUpAttachment[];
}

export interface ClickUpIndice {
  tasks: ClickUpTask[];
  statuses: string[];
  tipos: string[];
  totalTasks: number;
  carregadoEm: string;
}

// ─── Cache ─────────────────────────────────────────────────

let cacheIndice: { data: ClickUpIndice; timestamp: number } | null = null;

// ─── Helpers ───────────────────────────────────────────────

async function clickupGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CLICKUP_BASE}${path}`, {
    headers: { Authorization: getToken() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ClickUp API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/** Run promises with limited concurrency */
async function pool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ─── Dropdown resolution ───────────────────────────────────

interface DropdownOption {
  orderindex: number;
  name: string;
}

interface CustomFieldDef {
  id: string;
  name: string;
  type: string;
  type_config?: { options?: DropdownOption[] };
}

type DropdownMap = Map<number, string>;

async function carregarDropdowns(): Promise<{ tipo: DropdownMap; ym: DropdownMap }> {
  const data = await clickupGet<{ fields: CustomFieldDef[] }>(`/list/${CLICKUP_LIST_ID}/field`);
  const tipo = new Map<number, string>();
  const ym = new Map<number, string>();

  for (const f of data.fields) {
    if (f.name === "Tipo" && f.type_config?.options) {
      for (const o of f.type_config.options) tipo.set(o.orderindex, o.name);
    }
    if (f.name === "Y-M" && f.type_config?.options) {
      for (const o of f.type_config.options) ym.set(o.orderindex, o.name);
    }
  }
  return { tipo, ym };
}

// ─── Task fetching ─────────────────────────────────────────

interface RawTask {
  id: string;
  name: string;
  status: { status: string };
  url: string;
  custom_fields: { name: string; type: string; value: unknown }[];
  attachments?: RawAttachment[];
}

interface RawAttachment {
  id: string;
  title: string;
  url: string;
  thumbnail_large?: string;
  thumbnail_small?: string;
  extension: string;
  size: number;
}

async function listarTaskIds(): Promise<string[]> {
  const ids: string[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await clickupGet<{ tasks: { id: string }[] }>(
      `/list/${CLICKUP_LIST_ID}/task?page=${page}&include_closed=false&subtasks=false`
    );
    for (const t of data.tasks) ids.push(t.id);
    hasMore = data.tasks.length === 100;
    page++;
  }
  return ids;
}

async function buscarTaskDetalhe(taskId: string): Promise<RawTask> {
  return clickupGet<RawTask>(`/task/${taskId}`);
}

function resolverCustomField(
  task: RawTask,
  fieldName: string,
  dropdown: DropdownMap
): string | null {
  const cf = task.custom_fields.find((f) => f.name === fieldName);
  if (!cf || cf.value == null) return null;
  if (cf.type === "drop_down") return dropdown.get(cf.value as number) ?? null;
  if (cf.type === "date") {
    const ts = Number(cf.value);
    return ts ? new Date(ts).toISOString() : null;
  }
  return String(cf.value);
}

function mapearTask(
  raw: RawTask,
  tipoMap: DropdownMap,
  ymMap: DropdownMap
): ClickUpTask {
  const imageAttachments = (raw.attachments ?? [])
    .filter((a) => IMAGE_EXTENSIONS.has(a.extension.toLowerCase()))
    .map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      thumbnailLarge: a.thumbnail_large ?? null,
      thumbnailSmall: a.thumbnail_small ?? null,
      extension: a.extension,
      size: a.size,
      placement: classificarPlacementImagem(a.title),
    }));

  return {
    id: raw.id,
    name: raw.name,
    status: raw.status.status,
    tipo: resolverCustomField(raw, "Tipo", tipoMap),
    yearMonth: resolverCustomField(raw, "Y-M", ymMap),
    entrega: resolverCustomField(raw, "Entrega", new Map()),
    url: raw.url,
    attachments: imageAttachments,
  };
}

// ─── Main: carregarIndiceClickUp ───────────────────────────

export async function carregarIndiceClickUp(): Promise<ClickUpIndice> {
  if (cacheIndice && Date.now() - cacheIndice.timestamp < CACHE_TTL_MS) {
    return cacheIndice.data;
  }

  const [dropdowns, taskIds] = await Promise.all([
    carregarDropdowns(),
    listarTaskIds(),
  ]);

  const rawTasks = await pool(
    taskIds.map((id) => () => buscarTaskDetalhe(id)),
    CONCURRENCY
  );

  const tasks = rawTasks
    .map((raw) => mapearTask(raw, dropdowns.tipo, dropdowns.ym))
    .filter((t) => t.attachments.length > 0);

  const statuses = [...new Set(tasks.map((t) => t.status))].sort();
  const tipos = [...new Set(tasks.map((t) => t.tipo).filter(Boolean) as string[])].sort();

  const indice: ClickUpIndice = {
    tasks,
    statuses,
    tipos,
    totalTasks: tasks.length,
    carregadoEm: new Date().toISOString(),
  };

  cacheIndice = { data: indice, timestamp: Date.now() };
  return indice;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/clickup.ts
git commit -m "feat: add ClickUp API client with cached index loader"
```

---

### Task 2: ClickUp Tasks API Route (`src/app/api/clickup/tasks/route.ts`)

**Files:**
- Create: `src/app/api/clickup/tasks/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
// src/app/api/clickup/tasks/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { carregarIndiceClickUp } from "@/lib/clickup";

export async function GET() {
  try {
    await auth();
    const indice = await carregarIndiceClickUp();
    return NextResponse.json(indice);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx next build --no-lint 2>&1 | head -30` or `npx tsc --noEmit`
Expected: No type errors in clickup.ts or route.ts

- [ ] **Step 3: Manual smoke test**

Run: `curl -s http://localhost:3000/api/clickup/tasks | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Tasks: {d[\"totalTasks\"]}, Statuses: {d[\"statuses\"]}')"` (requires dev server running)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clickup/tasks/route.ts
git commit -m "feat: add GET /api/clickup/tasks endpoint"
```

---

### Task 3: Extend `/api/ads/lote` for Image Support

**Files:**
- Modify: `src/app/api/ads/lote/route.ts`

The current route hardcodes `type: "video"` and a single `video_principal` asset. We need it to accept an optional `type` field and optional `assets` array per anuncio, while keeping backward compatibility with the video flow.

- [ ] **Step 1: Update the route to support type and assets**

In `src/app/api/ads/lote/route.ts`, replace the `AnuncioItem` interface and the `promises` mapping:

Replace the `AnuncioItem` interface (lines 5-14):
```typescript
interface AnuncioItem {
  adName: string;
  titulo: string;
  textoPrincipal?: string;
  linkCampanha?: string;
  // Video flow (backward compat)
  driveUrl?: string;
  videoId?: string;
  thumbnailLink?: string;
  nomeArquivo?: string;
  // Image flow
  assets?: { placement: string; url: string; type: "image" | "video" }[];
}
```

Replace the `LoteBody` interface (lines 16-27) — add optional `type`:
```typescript
interface LoteBody {
  brandId: string;
  campaignName: string;
  campaignId: string;
  adSetName: string;
  adSetId: string;
  textoPrincipal: string;
  descricao: string;
  cta: string;
  linkCampanha: string;
  type?: "video" | "image";
  anuncios: AnuncioItem[];
}
```

Replace the `promises` mapping block (lines 68-92):
```typescript
    const adType = body.type ?? "video";

    const promises = body.anuncios.map((item) => {
      let assets: { placement: string; asset_url: string; asset_type: "image" | "video" }[];

      if (item.assets && item.assets.length > 0) {
        assets = item.assets.map((a) => ({
          placement: a.placement,
          asset_url: a.url,
          asset_type: a.type,
        }));
      } else {
        assets = [
          {
            placement: "video_principal",
            asset_url: item.driveUrl ?? "",
            asset_type: "video" as const,
          },
        ];
      }

      const input: CriarAdInput = {
        brand_id: body.brandId,
        type: adType,
        campaign_name: body.campaignName,
        campaign_id: body.campaignId,
        ad_set_name: body.adSetName,
        ad_set_id: body.adSetId,
        ad_name: item.adName,
        titulo: item.titulo,
        texto_principal: item.textoPrincipal || body.textoPrincipal,
        descricao: descricaoPadrao,
        cta: ctaPadrao,
        link_campanha: item.linkCampanha || body.linkCampanha,
        assets,
      };

      return criarAd(input, userId);
    });
```

- [ ] **Step 2: Verify the video flow still works**

Run: `npx tsc --noEmit`
Expected: No type errors. The video flow (`formulario-lote-videos.tsx`) doesn't send `type` or `assets`, so it falls back to the default `"video"` + `driveUrl` path.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ads/lote/route.ts
git commit -m "feat: extend /api/ads/lote to support image ads with multiple assets"
```

---

### Task 4: Dialog Explorador ClickUp (`src/components/dialog-explorador-clickup.tsx`)

**Files:**
- Create: `src/components/dialog-explorador-clickup.tsx`

This is the largest component. It follows the same pattern as `dialog-explorador-videos.tsx` (752 lines) but adapted for ClickUp cards with image attachments.

- [ ] **Step 1: Create the explorer dialog**

```typescript
// src/components/dialog-explorador-clickup.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ImageIcon,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { ClickUpTask, ClickUpAttachment, ClickUpIndice } from "@/lib/clickup";

// ─── Props ─────────────────────────────────────────────────

interface DialogExploradorClickUpProps {
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmar: (tasks: ClickUpTask[]) => void;
}

// ─── Status Colors ─────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  revisado: "bg-blue-100 text-blue-700",
  finalizada: "bg-green-100 text-green-700",
  design: "bg-yellow-100 text-yellow-700",
  "foto/motion": "bg-purple-100 text-purple-700",
  revisão: "bg-orange-100 text-orange-700",
  conteúdo: "bg-gray-100 text-gray-700",
  alocação: "bg-gray-100 text-gray-500",
};

// ─── Skeleton ──────────────────────────────────────────────

function GradeEsqueleto() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-square rounded-lg bg-muted" />
          <div className="mt-2 h-3 w-3/4 rounded bg-muted" />
          <div className="mt-1 h-3 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────

function CardClickUp({
  task,
  selecionado,
  aoAlternar,
  aoPreview,
}: {
  task: ClickUpTask;
  selecionado: boolean;
  aoAlternar: () => void;
  aoPreview: () => void;
}) {
  const thumb =
    task.attachments[0]?.thumbnailLarge ?? task.attachments[0]?.url ?? "";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-all hover:shadow-md">
      {/* Thumbnail area */}
      <button
        type="button"
        className="relative aspect-square w-full overflow-hidden bg-muted"
        onClick={aoPreview}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={task.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Format count badge */}
        <div className="absolute bottom-2 right-2">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-black/70 text-white border-0">
            {task.attachments.length} img{task.attachments.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <ImageIcon className="h-8 w-8 text-white" />
        </div>
      </button>

      {/* Selection checkmark */}
      <button
        type="button"
        className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${
          selecionado
            ? "border-primary bg-primary text-primary-foreground"
            : "border-white/80 bg-black/30 text-transparent hover:border-white"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          aoAlternar();
        }}
      >
        <Check className="h-3.5 w-3.5" />
      </button>

      {/* Info */}
      <div className="flex flex-col gap-1 p-2">
        <p className="text-xs font-medium leading-tight line-clamp-2">{task.name}</p>
        <div className="flex flex-wrap gap-1">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[task.status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {task.status}
          </Badge>
          {task.tipo && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {task.tipo}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Preview Modal ─────────────────────────────────────────

function PreviewImagens({
  task,
  aoFechar,
}: {
  task: ClickUpTask;
  aoFechar: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const img = task.attachments[indice];
  if (!img) return null;

  const placement_label: Record<string, string> = {
    feed: "Quadrado (1080×1080)",
    stories: "Vertical (1080×1920)",
    horizontal: "Horizontal (1200×628)",
  };

  return (
    <Dialog open onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent
        className="flex flex-col gap-0 p-0 overflow-hidden sm:max-w-fit max-h-[90vh]"
        showCloseButton={false}
      >
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b">
          <DialogTitle className="text-sm font-medium truncate min-w-0">
            {task.name}
          </DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {placement_label[img.placement] ?? img.title} · {indice + 1}/{task.attachments.length}
            </span>
            <Button variant="ghost" size="sm" onClick={aoFechar}>✕</Button>
          </div>
        </div>

        <div className="bg-black flex items-center justify-center min-h-0 flex-1 relative">
          <img
            src={img.url}
            alt={img.title}
            className="max-h-[calc(90vh-52px)] max-w-full object-contain"
          />

          {task.attachments.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 disabled:opacity-30"
                disabled={indice === 0}
                onClick={() => setIndice((i) => i - 1)}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 disabled:opacity-30"
                disabled={indice === task.attachments.length - 1}
                onClick={() => setIndice((i) => i + 1)}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {/* Dots navigation */}
        {task.attachments.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-2 border-t bg-background">
            {task.attachments.map((a, i) => (
              <button
                key={a.id}
                type="button"
                className={`h-2 w-2 rounded-full transition-all ${
                  i === indice ? "bg-primary scale-125" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                onClick={() => setIndice(i)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────

export function DialogExploradorClickUp({
  aberto,
  aoFechar,
  aoConfirmar,
}: DialogExploradorClickUpProps) {
  // Data
  const [indice, setIndice] = useState<ClickUpIndice | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  // Filters
  const [filtroStatus, setFiltroStatus] = useState<Set<string>>(new Set(["revisado", "finalizada"]));
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroYM, setFiltroYM] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  // Selection
  const [selecionados, setSelecionados] = useState<Map<string, ClickUpTask>>(new Map());

  // Preview
  const [previewTask, setPreviewTask] = useState<ClickUpTask | null>(null);

  // ── Load index ──────────────────────────────────────────
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarregamento(null);
    try {
      const res = await fetch("/api/clickup/tasks");
      if (!res.ok) throw new Error("Erro ao carregar tasks do ClickUp");
      const data: ClickUpIndice = await res.json();
      setIndice(data);
    } catch (e) {
      setErroCarregamento(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (aberto && !indice) carregar();
  }, [aberto, indice, carregar]);

  // ── Reset on close ──────────────────────────────────────
  useEffect(() => {
    if (!aberto) {
      setSelecionados(new Map());
      setPreviewTask(null);
      setBusca("");
    }
  }, [aberto]);

  // ── Filtered tasks ──────────────────────────────────────
  const tasksFiltradas = useMemo(() => {
    if (!indice) return [];
    return indice.tasks.filter((t) => {
      if (filtroStatus.size > 0 && !filtroStatus.has(t.status)) return false;
      if (filtroTipo !== "todos" && t.tipo !== filtroTipo) return false;
      if (filtroYM !== "todos" && t.yearMonth !== filtroYM) return false;
      if (busca) {
        const termo = busca.toLowerCase();
        if (!t.name.toLowerCase().includes(termo)) return false;
      }
      return true;
    });
  }, [indice, filtroStatus, filtroTipo, filtroYM, busca]);

  // ── Status toggle ───────────────────────────────────────
  const toggleStatus = useCallback((status: string) => {
    setFiltroStatus((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  // ── Selection toggle ────────────────────────────────────
  const toggleSelecionado = useCallback((task: ClickUpTask) => {
    setSelecionados((prev) => {
      const next = new Map(prev);
      if (next.has(task.id)) next.delete(task.id);
      else next.set(task.id, task);
      return next;
    });
  }, []);

  // ── Count images ────────────────────────────────────────
  const totalImagens = useMemo(() => {
    let count = 0;
    for (const t of selecionados.values()) count += t.attachments.length;
    return count;
  }, [selecionados]);

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="flex h-[90vh] max-w-6xl flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogTitle className="text-base font-semibold">
            Explorador ClickUp — Externos Evino
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setIndice(null); carregar(); }}
              disabled={carregando}
            >
              <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={aoFechar}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 bg-muted/30">
          {/* Status chips */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Status:</span>
            {(indice?.statuses ?? []).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                  filtroStatus.has(s)
                    ? STATUS_COLORS[s] ?? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Tipo select */}
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {(indice?.tipos ?? []).map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Y-M select */}
          <Select value={filtroYM} onValueChange={setFiltroYM}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {[...new Set(indice?.tasks.map((t) => t.yearMonth).filter(Boolean) as string[])]
                .sort()
                .reverse()
                .map((ym) => (
                  <SelectItem key={ym} value={ym}>{ym}</SelectItem>
                ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar..."
              className="h-7 w-48 pl-7 text-xs"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto">
          {carregando ? (
            <GradeEsqueleto />
          ) : erroCarregamento ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-sm text-destructive">{erroCarregamento}</p>
              <Button variant="outline" size="sm" onClick={carregar}>Tentar novamente</Button>
            </div>
          ) : tasksFiltradas.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                {indice ? "Nenhum card encontrado com esses filtros." : "Carregando..."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4">
              {tasksFiltradas.map((task) => (
                <CardClickUp
                  key={task.id}
                  task={task}
                  selecionado={selecionados.has(task.id)}
                  aoAlternar={() => toggleSelecionado(task)}
                  aoPreview={() => setPreviewTask(task)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-3 bg-background">
          <p className="text-sm text-muted-foreground">
            {tasksFiltradas.length} card{tasksFiltradas.length !== 1 ? "s" : ""}
            {selecionados.size > 0 && (
              <span className="font-medium text-foreground">
                {" "}· {selecionados.size} selecionado{selecionados.size !== 1 ? "s" : ""} ({totalImagens} imagens)
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={aoFechar}>Cancelar</Button>
            <Button
              size="sm"
              disabled={selecionados.size === 0}
              onClick={() => aoConfirmar(Array.from(selecionados.values()))}
            >
              Continuar com {selecionados.size} card{selecionados.size !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Preview modal */}
      {previewTask && (
        <PreviewImagens task={previewTask} aoFechar={() => setPreviewTask(null)} />
      )}
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dialog-explorador-clickup.tsx
git commit -m "feat: add ClickUp explorer dialog for static ads"
```

---

### Task 5: Formulário Lote Imagens (`src/components/formulario-lote-imagens.tsx`)

**Files:**
- Create: `src/components/formulario-lote-imagens.tsx`

Follows the same pattern as `formulario-lote-videos.tsx` (699 lines). Cascading dropdowns, per-ad editing, ad name generation with STATIC prefix.

- [ ] **Step 1: Create the batch form component**

```typescript
// src/components/formulario-lote-imagens.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Copy,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ImageIcon,
} from "lucide-react";
import { CTA_OPTIONS } from "@/lib/constants";
import type { ClickUpTask } from "@/lib/clickup";
import type { Brand } from "@/lib/db";

// ─── Props ─────────────────────────────────────────────────

export interface FormularioLoteImagensProps {
  aberto: boolean;
  aoFechar: () => void;
  cards: ClickUpTask[];
  aoSalvar: () => void;
}

// ─── Types ─────────────────────────────────────────────────

interface Campanha {
  id: string;
  nome: string;
  status: string;
  objetivo: string;
}

interface AdSet {
  id: string;
  nome: string;
  status: string;
  dailyBudget: number | null;
}

interface AnuncioForm {
  taskId: string;
  taskName: string;
  adName: string;
  adNameEditado: boolean;
  titulo: string;
  textoPrincipal: string;
  linkCampanha: string;
  attachments: { placement: string; url: string; title: string }[];
}

// ─── Helpers ───────────────────────────────────────────────

function extrairDestinoDaUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path.includes("/produto/") || path.includes("/product/")) return "PRODUCT";
    if (path.includes("/campanha/") || path.includes("/campaign/")) return "CAMPAIGN";
    if (path.includes("/categoria/") || path.includes("/category/")) return "CATEGORY";
    if (path.includes("/landing")) return "LANDING";
    return "LINK";
  } catch {
    return "";
  }
}

function semanaAno(): string {
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - oneJan.getTime()) / 86400000);
  const week = Math.ceil((days + oneJan.getDay() + 1) / 7);
  return `W${String(week).padStart(2, "0")}-${now.getFullYear()}`;
}

function limparMiolo(nome: string): string {
  // Remove prefixos "Face |", "Display |", sufixos "| N formatos"
  let s = nome
    .replace(/^(face|display|display e face)\s*\|\s*/i, "")
    .replace(/\s*\|\s*\d+\s*formatos?\s*$/i, "")
    .trim();
  s = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toUpperCase()
    .slice(0, 50);
  return s;
}

function gerarAdName(taskName: string, linkCampanha?: string): string {
  const miolo = limparMiolo(taskName);
  const destino = linkCampanha ? extrairDestinoDaUrl(linkCampanha) : "";
  const semana = semanaAno();

  const partes = ["STATIC"];
  if (destino) partes.push(destino);
  partes.push(miolo, semana);

  return partes.join("-");
}

// ─── Main Component ────────────────────────────────────────

export function FormularioLoteImagens({
  aberto,
  aoFechar,
  cards,
  aoSalvar,
}: FormularioLoteImagensProps) {
  // ── Destination selectors ───────────────────────────────
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [adsets, setAdsets] = useState<AdSet[]>([]);

  const [carregandoBrands, setCarregandoBrands] = useState(false);
  const [carregandoCampanhas, setCarregandoCampanhas] = useState(false);
  const [carregandoAdsets, setCarregandoAdsets] = useState(false);

  const [brandId, setBrandId] = useState("");
  const [campanhaId, setCampanhaId] = useState("");
  const [adSetId, setAdSetId] = useState("");

  // ── Shared fields ───────────────────────────────────────
  const [descricao, setDescricao] = useState("");
  const [cta, setCta] = useState("SHOP_NOW");

  // ── Per-ad form ─────────────────────────────────────────
  const [anuncios, setAnuncios] = useState<AnuncioForm[]>([]);

  // ── Save state ──────────────────────────────────────────
  const [salvando, setSalvando] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // ── Init anuncios from cards ────────────────────────────
  useEffect(() => {
    if (!aberto || cards.length === 0) return;
    setAnuncios(
      cards.map((card) => ({
        taskId: card.id,
        taskName: card.name,
        adName: gerarAdName(card.name),
        adNameEditado: false,
        titulo: "",
        textoPrincipal: "",
        linkCampanha: "",
        attachments: card.attachments.map((a) => ({
          placement: a.placement,
          url: a.url,
          title: a.title,
        })),
      }))
    );
  }, [aberto, cards]);

  // ── Load brands ─────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    setCarregandoBrands(true);
    fetch("/api/brands")
      .then((r) => r.json())
      .then((json) => setBrands(json.data ?? []))
      .catch(() => setBrands([]))
      .finally(() => setCarregandoBrands(false));
  }, [aberto]);

  // ── Load campanhas ──────────────────────────────────────
  const carregarCampanhas = useCallback(async (accountId: string) => {
    setCampanhas([]);
    setAdsets([]);
    setCampanhaId("");
    setAdSetId("");
    if (!accountId) return;

    setCarregandoCampanhas(true);
    try {
      const res = await fetch(`/api/meta/campanhas?accountId=${accountId}`);
      const json = await res.json();
      setCampanhas(json.campanhas ?? []);
    } catch {
      setCampanhas([]);
    } finally {
      setCarregandoCampanhas(false);
    }
  }, []);

  const handleBrandChange = useCallback(
    (value: string) => {
      setBrandId(value);
      const brand = brands.find((b) => b.id === value);
      if (brand) carregarCampanhas(brand.meta_account_id);
    },
    [brands, carregarCampanhas]
  );

  // ── Auto-select brand (Evino) ───────────────────────────
  useEffect(() => {
    if (!aberto || brands.length === 0 || brandId) return;
    // Externos Evino → default to Evino brand
    const evino = brands.find((b) => b.name.toLowerCase().includes("evino"));
    if (evino) handleBrandChange(evino.id);
  }, [aberto, brands, brandId, handleBrandChange]);

  // ── Load adsets ─────────────────────────────────────────
  const carregarAdsets = useCallback(async (campaignId: string) => {
    setAdsets([]);
    setAdSetId("");
    if (!campaignId) return;

    setCarregandoAdsets(true);
    try {
      const res = await fetch(`/api/meta/adsets?campaignId=${campaignId}`);
      const json = await res.json();
      setAdsets(json.adsets ?? []);
    } catch {
      setAdsets([]);
    } finally {
      setCarregandoAdsets(false);
    }
  }, []);

  const handleCampanhaChange = useCallback(
    (value: string) => {
      setCampanhaId(value);
      carregarAdsets(value);
    },
    [carregarAdsets]
  );

  // ── Update anuncio field ────────────────────────────────
  const updateAnuncio = useCallback((index: number, field: keyof AnuncioForm, value: string) => {
    setAnuncios((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      // Regenerate ad name if link changed and name not manually edited
      if (field === "linkCampanha" && !item.adNameEditado) {
        item.adName = gerarAdName(item.taskName, value);
      }
      if (field === "adName") {
        item.adNameEditado = true;
      }
      next[index] = item;
      return next;
    });
  }, []);

  // ── Remove anuncio ──────────────────────────────────────
  const removerAnuncio = useCallback((index: number) => {
    setAnuncios((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Replicate field ─────────────────────────────────────
  const replicarCampo = useCallback((fromIndex: number, field: "textoPrincipal" | "linkCampanha") => {
    setAnuncios((prev) => {
      const valor = prev[fromIndex][field];
      return prev.map((a, i) => {
        if (i === fromIndex) return a;
        const updated = { ...a, [field]: valor };
        if (field === "linkCampanha" && !a.adNameEditado) {
          updated.adName = gerarAdName(a.taskName, valor);
        }
        return updated;
      });
    });
  }, []);

  // ── Validation ──────────────────────────────────────────
  const podeSalvar = useMemo(() => {
    if (!brandId || !campanhaId || !adSetId) return false;
    if (anuncios.length === 0) return false;
    return anuncios.every((a) => a.adName.trim() && a.attachments.length > 0);
  }, [brandId, campanhaId, adSetId, anuncios]);

  // ── Save handler ────────────────────────────────────────
  const salvar = useCallback(async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    setMensagemErro(null);
    setMensagemSucesso(null);

    try {
      const res = await fetch("/api/ads/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          campaignName: campanhas.find((c) => c.id === campanhaId)?.nome ?? "",
          campaignId: campanhaId,
          adSetName: adsets.find((a) => a.id === adSetId)?.nome ?? "",
          adSetId,
          descricao,
          cta,
          textoPrincipal: "",
          linkCampanha: "",
          type: "image",
          anuncios: anuncios.map((a) => ({
            adName: a.adName,
            titulo: a.titulo,
            textoPrincipal: a.textoPrincipal || undefined,
            linkCampanha: a.linkCampanha || undefined,
            assets: a.attachments.map((att) => ({
              placement: att.placement,
              url: att.url,
              type: "image" as const,
            })),
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Erro ao salvar rascunhos");

      setMensagemSucesso(
        `${anuncios.length} rascunho${anuncios.length !== 1 ? "s" : ""} salvo${anuncios.length !== 1 ? "s" : ""} com sucesso!`
      );
      setTimeout(() => {
        aoSalvar();
        aoFechar();
      }, 1200);
    } catch (e) {
      setMensagemErro(e instanceof Error ? e.message : "Erro desconhecido ao salvar");
    } finally {
      setSalvando(false);
    }
  }, [podeSalvar, brandId, campanhaId, adSetId, campanhas, adsets, descricao, cta, anuncios, aoSalvar, aoFechar]);

  // ── Reset on close ──────────────────────────────────────
  useEffect(() => {
    if (!aberto) {
      setBrandId("");
      setCampanhaId("");
      setAdSetId("");
      setDescricao("");
      setCta("SHOP_NOW");
      setAnuncios([]);
      setMensagemErro(null);
      setMensagemSucesso(null);
    }
  }, [aberto]);

  // ── Placement label ─────────────────────────────────────
  const placementLabel: Record<string, string> = {
    feed: "Feed",
    stories: "Stories",
    horizontal: "Horizontal",
  };

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="flex h-[90vh] max-w-4xl flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogTitle className="text-base font-semibold">
            Criar Anúncios Estáticos — {anuncios.length} card{anuncios.length !== 1 ? "s" : ""}
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={aoFechar}><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* ── Destination ──────────────────────────────── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Destino</h3>
            <div className="grid grid-cols-3 gap-3">
              {/* Brand */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Marca</label>
                <Select value={brandId} onValueChange={handleBrandChange} disabled={carregandoBrands}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={carregandoBrands ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Campaign */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Campanha</label>
                <Select value={campanhaId} onValueChange={handleCampanhaChange} disabled={!brandId || carregandoCampanhas}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={carregandoCampanhas ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {campanhas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ad Set */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Conjunto</label>
                <Select value={adSetId} onValueChange={setAdSetId} disabled={!campanhaId || carregandoAdsets}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={carregandoAdsets ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {adsets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── Shared Fields ────────────────────────────── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Campos Compartilhados</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Descrição</label>
                <Input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Beba com Moderação!"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">CTA</label>
                <Select value={cta} onValueChange={setCta}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CTA_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── Per-Ad Items ─────────────────────────────── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Anúncios ({anuncios.length})</h3>

            {anuncios.map((anuncio, i) => (
              <div key={anuncio.taskId} className="rounded-lg border p-3 space-y-3">
                {/* Row 1: thumbnails + ad name */}
                <div className="flex gap-3">
                  {/* Thumbnails mini grid */}
                  <div className="flex gap-1 shrink-0">
                    {anuncio.attachments.slice(0, 3).map((att) => (
                      <div key={att.url} className="relative">
                        <img
                          src={att.url}
                          alt={att.title}
                          className="h-16 w-16 rounded object-cover"
                          loading="lazy"
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white text-center py-0.5 rounded-b">
                          {placementLabel[att.placement] ?? att.placement}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Ad name + remove */}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground truncate flex-1">{anuncio.taskName}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={() => removerAnuncio(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={anuncio.adName}
                      onChange={(e) => updateAnuncio(i, "adName", e.target.value)}
                      placeholder="Nome do anúncio"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Row 2: título + texto principal + link */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-muted-foreground">Título</label>
                      <span className={`text-[10px] ${anuncio.titulo.length > 40 ? "text-destructive" : "text-muted-foreground"}`}>
                        {anuncio.titulo.length}/40
                      </span>
                    </div>
                    <Input
                      value={anuncio.titulo}
                      onChange={(e) => updateAnuncio(i, "titulo", e.target.value)}
                      className="h-8 text-xs"
                      maxLength={40}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-muted-foreground">Texto Principal</label>
                      {anuncios.length > 1 && (
                        <button
                          type="button"
                          className="text-[10px] text-primary hover:underline"
                          onClick={() => replicarCampo(i, "textoPrincipal")}
                        >
                          <Copy className="h-3 w-3 inline mr-0.5" />replicar
                        </button>
                      )}
                    </div>
                    <Textarea
                      value={anuncio.textoPrincipal}
                      onChange={(e) => updateAnuncio(i, "textoPrincipal", e.target.value)}
                      className="text-xs min-h-[32px] resize-none"
                      rows={1}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-muted-foreground">Link Campanha</label>
                      {anuncios.length > 1 && (
                        <button
                          type="button"
                          className="text-[10px] text-primary hover:underline"
                          onClick={() => replicarCampo(i, "linkCampanha")}
                        >
                          <Copy className="h-3 w-3 inline mr-0.5" />replicar
                        </button>
                      )}
                    </div>
                    <Input
                      value={anuncio.linkCampanha}
                      onChange={(e) => updateAnuncio(i, "linkCampanha", e.target.value)}
                      className="h-8 text-xs"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-3 bg-background">
          <div>
            {mensagemErro && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />{mensagemErro}
              </p>
            )}
            {mensagemSucesso && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />{mensagemSucesso}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
            <Button
              size="sm"
              disabled={!podeSalvar || salvando}
              onClick={salvar}
            >
              {salvando ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" />Salvando...</>
              ) : (
                `Salvar ${anuncios.length} rascunho${anuncios.length !== 1 ? "s" : ""}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/formulario-lote-imagens.tsx
git commit -m "feat: add batch form for static image ads from ClickUp"
```

---

### Task 6: Integrate into Painel de Criação

**Files:**
- Modify: `src/components/painel-criacao.tsx`

- [ ] **Step 1: Add imports**

At the top of `painel-criacao.tsx`, after the existing imports (line 32), add:

```typescript
import { DialogExploradorClickUp } from "@/components/dialog-explorador-clickup";
import { FormularioLoteImagens } from "@/components/formulario-lote-imagens";
import type { ClickUpTask } from "@/lib/clickup";
```

- [ ] **Step 2: Add state variables**

After the existing video flow states (around line 159, after `const [editarDados, setEditarDados] = ...`), add:

```typescript
  const [dialogClickUp, setDialogClickUp] = useState(false);
  const [dialogLoteImagens, setDialogLoteImagens] = useState(false);
  const [cardsClickUp, setCardsClickUp] = useState<ClickUpTask[]>([]);
```

- [ ] **Step 3: Add the "Importar Estáticos" button**

Find the video explorer button (around line 641 — the button with `onClick={() => setDialogExplorador(true)}`). After that button, add:

```typescript
<button
  onClick={() => setDialogClickUp(true)}
  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98]"
>
  <ImageIcon className="h-4 w-4" />
  Importar Estáticos
</button>
```

Also add `ImageIcon` to the lucide-react imports if not already present.

- [ ] **Step 4: Add dialog components**

Find where the video dialogs are rendered (around lines 914-931). After the `FormularioLoteVideos` closing tag, add:

```typescript
{/* Dialog: Explorador ClickUp (Estáticos) */}
<DialogExploradorClickUp
  aberto={dialogClickUp}
  aoFechar={() => setDialogClickUp(false)}
  aoConfirmar={(cards: ClickUpTask[]) => {
    setDialogClickUp(false);
    setCardsClickUp(cards);
    setDialogLoteImagens(true);
  }}
/>

{/* Dialog: Formulário de Lote Imagens */}
<FormularioLoteImagens
  aberto={dialogLoteImagens}
  aoFechar={() => setDialogLoteImagens(false)}
  cards={cardsClickUp}
  aoSalvar={carregarDados}
/>
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Visual smoke test**

Run dev server, verify:
1. "Importar Estáticos" button appears next to the video button
2. Clicking opens the ClickUp explorer
3. Explorer loads tasks from ClickUp (may take a few seconds first time)
4. Cards show with thumbnails, status badges, tipo badges
5. Clicking thumbnail opens preview with image navigation
6. Selecting cards and clicking "Continuar" opens the batch form
7. Batch form has cascading dropdowns, per-ad fields
8. Saving creates ads in Supabase

- [ ] **Step 7: Commit**

```bash
git add src/components/painel-criacao.tsx
git commit -m "feat: integrate ClickUp static ads import into main panel"
```

---

### Task 7: Final Verification & Cleanup

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: Zero errors

- [ ] **Step 2: Lint check**

Run: `npx next lint`
Expected: No errors (warnings OK)

- [ ] **Step 3: Build check**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: End-to-end manual test**

1. Open the app
2. Click "Importar Estáticos"
3. Wait for ClickUp index to load
4. Filter by status "revisado"
5. Select 2 cards
6. Click "Continuar"
7. Select Brand → Campaign → Ad Set
8. Fill título and link for one ad
9. Use "replicar" to copy link to all
10. Click "Salvar"
11. Verify ads appear in the pendentes table with type "image"

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues from static ads import testing"
```
