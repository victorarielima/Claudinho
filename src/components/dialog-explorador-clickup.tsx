"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  RefreshCw,
} from "lucide-react";
import type { ClickUpTask, ClickUpIndice } from "@/lib/clickup";

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

  const placementLabel: Record<string, string> = {
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
              {placementLabel[img.placement] ?? img.title} · {indice + 1}/{task.attachments.length}
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
  const [diasAtras, setDiasAtras] = useState(7);

  // Selection
  const [selecionados, setSelecionados] = useState<Map<string, ClickUpTask>>(new Map());

  // Preview
  const [previewTask, setPreviewTask] = useState<ClickUpTask | null>(null);

  // ── Load index ──────────────────────────────────────────
  const carregar = useCallback(async (dias?: number) => {
    const d = dias ?? diasAtras;
    setCarregando(true);
    setErroCarregamento(null);
    try {
      const res = await fetch(`/api/clickup/tasks?dias=${d}`);
      if (!res.ok) throw new Error("Erro ao carregar tasks do ClickUp");
      const data: ClickUpIndice = await res.json();
      setIndice(data);
    } catch (e) {
      setErroCarregamento(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setCarregando(false);
    }
  }, [diasAtras]);

  const carregarMais = useCallback(() => {
    const novoDias = diasAtras === 7 ? 30 : diasAtras === 30 ? 90 : 365;
    setDiasAtras(novoDias);
    setIndice(null);
    carregar(novoDias);
  }, [diasAtras, carregar]);

  useEffect(() => {
    if (aberto && !indice) carregar();
  }, [aberto, indice, carregar]);

  // ── Reset on close ──────────────────────────────────────
  useEffect(() => {
    if (!aberto) {
      setSelecionados(new Map());
      setPreviewTask(null);
      setBusca("");
      setDiasAtras(7);
      setIndice(null);
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
      <DialogContent className="flex h-[90vh] max-w-6xl sm:max-w-6xl flex-col gap-0 p-0 overflow-hidden" showCloseButton={false}>
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
            <input
              value={busca}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusca(e.target.value)}
              placeholder="Buscar..."
              className="h-7 w-48 pl-7 text-xs rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <Button variant="outline" size="sm" onClick={() => carregar()}>Tentar novamente</Button>
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
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {tasksFiltradas.length} card{tasksFiltradas.length !== 1 ? "s" : ""}
              <span className="text-xs"> (últimos {diasAtras}d)</span>
              {selecionados.size > 0 && (
                <span className="font-medium text-foreground">
                  {" "}· {selecionados.size} selecionado{selecionados.size !== 1 ? "s" : ""} ({totalImagens} imagens)
                </span>
              )}
            </p>
            {diasAtras < 365 && !carregando && (
              <button
                type="button"
                onClick={carregarMais}
                className="text-xs text-primary hover:underline"
              >
                Carregar mais antigos
              </button>
            )}
          </div>
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
