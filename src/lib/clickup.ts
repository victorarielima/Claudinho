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
  /** Descrição do card em texto puro (briefing: link, preço, KV...). */
  descricao: string | null;
  /** URL do produto/campanha encontrada na descrição (linha "Link: ..."). */
  linkProduto: string | null;
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
  text_content?: string | null;
  description?: string | null;
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

const DOMINIOS_LOJA = /(^|\.)(evino|grandcru)\.com\.br$/i;

function urlsDoTexto(texto: string): string[] {
  return (texto.match(/https?:\/\/[^\s<>()"'\][]+/gi) ?? []).map((u) =>
    u.replace(/[.,;:!?*_]+$/, "")
  );
}

function ehUrlDaLoja(url: string): boolean {
  try {
    return DOMINIOS_LOJA.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Link do produto no briefing do card. Os cards seguem o modelo
 * "Link: https://www.grandcru.com.br/vinho/..." — essa linha tem prioridade;
 * sem ela, vale a primeira URL de evino.com.br / grandcru.com.br do texto.
 * Links de Drive, Figma, ClickUp etc. são ignorados.
 */
export function extrairLinkProduto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  for (const linha of texto.split(/\r?\n/)) {
    if (!/^\s*(link|url|lp|landing)[^:\n]{0,30}:/i.test(linha)) continue;
    const url = urlsDoTexto(linha).find(ehUrlDaLoja);
    if (url) return url;
  }
  return urlsDoTexto(texto).find(ehUrlDaLoja) ?? null;
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
      // URL estável do proxy: o link do ClickUp vale um único acesso.
      url: urlAnexoClickUp(raw.id, a.id),
      // Miniaturas para a grade do explorador; se o link já foi gasto,
      // a tela cai para a imagem do proxy.
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
    descricao: raw.text_content?.trim() || raw.description?.trim() || null,
    linkProduto: extrairLinkProduto(raw.text_content ?? raw.description),
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

// ─── Anexos (links de uso único) ───────────────────────────
//
// Desde nov/2026 o ClickUp assina os links de anexo com um authz_token de
// USO ÚNICO ("maxUsage": 1, expira em poucas horas). O primeiro GET devolve a
// imagem; os seguintes devolvem uma página HTML com status 200. Como o
// preview do formulário consumia o link, o servidor mandava HTML para a Meta
// → "Não foi possível processar a imagem carregada" (subcode 2446496).
//
// Por isso o Claudinho nunca guarda o link do ClickUp: guarda uma URL estável
// do próprio app (/api/clickup/anexo?task=…&id=…), que pede um link novo à API
// do ClickUp a cada download.

const PROXY_ANEXO = "/api/clickup/anexo";

export function urlAnexoClickUp(taskId: string, attachmentId: string): string {
  return `${PROXY_ANEXO}?task=${encodeURIComponent(taskId)}&id=${encodeURIComponent(attachmentId)}`;
}

/** Lê task/anexo de uma URL do proxy (relativa ou absoluta). */
export function lerUrlAnexoClickUp(
  url: string
): { taskId: string; attachmentId: string } | null {
  try {
    const u = new URL(url, "http://local");
    if (u.pathname !== PROXY_ANEXO) return null;
    const taskId = u.searchParams.get("task");
    const attachmentId = u.searchParams.get("id");
    return taskId && attachmentId ? { taskId, attachmentId } : null;
  } catch {
    return null;
  }
}

export interface ImagemBaixada {
  buffer: Buffer;
  contentType: string;
  /** Nome do arquivo com extensão (a Meta usa no upload). */
  nome: string;
}

function pareceImagem(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const hex = buf.subarray(0, 4).toString("hex");
  return (
    hex.startsWith("ffd8ff") || // JPEG
    hex === "89504e47" || // PNG
    hex === "47494638" || // GIF
    (hex === "52494646" && buf.subarray(8, 12).toString("ascii") === "WEBP")
  );
}

async function baixarBytes(url: string, rotulo: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao baixar imagem (${rotulo}): HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "";
  if (!pareceImagem(buffer)) {
    const ehClickUp = /clickup-attachments\.com/i.test(url);
    throw new Error(
      `Erro ao baixar imagem (${rotulo}): o link devolveu ${contentType || "um arquivo"} em vez de uma imagem.` +
        (ehClickUp
          ? " Links de anexo do ClickUp valem um único acesso — use \"Trocar arte\" e escolha o card de novo no ClickUp."
          : "")
    );
  }
  return { buffer, contentType: contentType.startsWith("image/") ? contentType : "image/jpeg" };
}

/** Baixa um anexo pedindo um link novo (de uso único) à API do ClickUp. */
export async function baixarAnexoClickUp(taskId: string, attachmentId: string): Promise<ImagemBaixada> {
  const task = await clickupGet<RawTask>(`/task/${encodeURIComponent(taskId)}`);
  const anexo = (task.attachments ?? []).find((a) => a.id === attachmentId);
  if (!anexo) {
    throw new Error(
      `Erro ao baixar imagem: o anexo ${attachmentId} não existe mais no card "${task.name}" do ClickUp.`
    );
  }
  const { buffer, contentType } = await baixarBytes(anexo.url, anexo.title);
  return { buffer, contentType, nome: anexo.title };
}

/**
 * Baixa uma imagem para uso no servidor (upload na Meta, legenda com IA).
 * Aceita a URL do proxy do ClickUp ou qualquer URL pública, e garante que os
 * bytes são de fato uma imagem — nunca manda HTML para a Meta.
 */
export async function baixarImagem(url: string): Promise<ImagemBaixada> {
  const anexo = lerUrlAnexoClickUp(url);
  if (anexo) return baixarAnexoClickUp(anexo.taskId, anexo.attachmentId);
  const nomeUrl = decodeURIComponent(url.split("?")[0].split("/").pop() || "");
  const { buffer, contentType } = await baixarBytes(url, nomeUrl || "imagem");
  const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const nome = /\.[a-z0-9]{3,4}$/i.test(nomeUrl) ? nomeUrl : `image.${ext}`;
  return { buffer, contentType, nome };
}
