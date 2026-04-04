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
