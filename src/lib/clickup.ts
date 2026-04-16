import { classificarPlacementImagem } from "@/lib/ad-media";

// ─── Config ────────────────────────────────────────────────
const CLICKUP_BASE = "https://api.clickup.com/api/v2";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
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

const cacheIndice = new Map<string, { data: ClickUpIndice; timestamp: number }>();

function cacheKey(listId: string, diasAtras: number): string {
  return `${listId}:${diasAtras}`;
}

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

/** Run promises in sequential batches with delay to respect rate limits */
async function poolWithDelay<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number,
  delayMs: number
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
    // Delay between batches to respect rate limit
    if (i + batchSize < tasks.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
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

async function carregarDropdowns(listId: string): Promise<{ tipo: DropdownMap; ym: DropdownMap }> {
  const data = await clickupGet<{ fields: CustomFieldDef[] }>(`/list/${listId}/field`);
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

/** Statuses where images are expected to be attached */
const STATUSES_COM_IMAGENS = new Set(["revisado", "finalizada", "revisão"]);

interface RawListTask {
  id: string;
  name: string;
  status: { status: string };
  url: string;
  custom_fields: { name: string; type: string; value: unknown }[];
}

async function listarTasks(listId: string, diasAtras?: number): Promise<RawListTask[]> {
  const tasks: RawListTask[] = [];
  let page = 0;
  let hasMore = true;

  // Filter by date_updated to get recent tasks
  const dateFilter = diasAtras
    ? `&date_updated_gt=${Date.now() - diasAtras * 24 * 60 * 60 * 1000}`
    : "";

  while (hasMore) {
    const data = await clickupGet<{ tasks: RawListTask[] }>(
      `/list/${listId}/task?page=${page}&include_closed=false&subtasks=false${dateFilter}`
    );
    tasks.push(...data.tasks);
    hasMore = data.tasks.length === 100;
    page++;
  }
  return tasks;
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

export async function carregarIndiceClickUp(
  listId: string,
  diasAtras = 7
): Promise<ClickUpIndice> {
  const key = cacheKey(listId, diasAtras);
  const cached = cacheIndice.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const [dropdowns, listedTasks] = await Promise.all([
    carregarDropdowns(listId),
    listarTasks(listId, diasAtras),
  ]);

  // Only fetch details (for attachments) for tasks in statuses that typically have images
  const tasksParaDetalhar = listedTasks.filter((t) =>
    STATUSES_COM_IMAGENS.has(t.status.status)
  );

  // Fetch in batches of 8 with 1.5s delay to stay under 100 req/min rate limit
  const rawTasks = await poolWithDelay(
    tasksParaDetalhar.map((t) => () => buscarTaskDetalhe(t.id)),
    8,
    1500
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

  cacheIndice.set(key, { data: indice, timestamp: Date.now() });
  return indice;
}
