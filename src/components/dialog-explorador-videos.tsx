"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  Search,
  Sparkles,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types (re-export from lib for convenience)
// ---------------------------------------------------------------------------

export type { PastaDrive, VideoDrive, FormatoVideo } from "@/lib/drive-explorer";
import type { PastaDrive, VideoDrive, IndiceCompleto, FormatoVideo } from "@/lib/drive-explorer";

interface DialogExploradorVideosProps {
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmar: (videos: VideoDrive[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatarDuracao(segundos: number): string {
  const min = Math.floor(segundos / 60);
  const seg = Math.floor(segundos % 60);
  return `${min}:${seg.toString().padStart(2, "0")}`;
}

function formatarTamanho(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function formatarData(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES_CURTOS[d.getMonth()]}`;
}

const ROTULO_FORMATO: Record<FormatoVideo, string> = {
  portrait: "9:16",
  landscape: "16:9",
  square: "1:1",
  unknown: "?",
};

function IconeFormato({ formato, className = "size-3.5" }: { formato: FormatoVideo; className?: string }) {
  if (formato === "portrait") {
    return (
      <svg className={className} viewBox="0 0 16 16" fill="currentColor">
        <rect x="4" y="1" width="8" height="14" rx="1.5" />
      </svg>
    );
  }
  if (formato === "landscape") {
    return (
      <svg className={className} viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="4" width="14" height="8" rx="1.5" />
      </svg>
    );
  }
  if (formato === "square") {
    return (
      <svg className={className} viewBox="0 0 16 16" fill="currentColor">
        <rect x="2" y="2" width="12" height="12" rx="1.5" />
      </svg>
    );
  }
  return null;
}

type FiltroData = "7" | "14" | "30" | "mes" | "todos";

const OPCOES_FILTRO_DATA: { valor: FiltroData; rotulo: string }[] = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "14", rotulo: "Últimos 14 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "todos", rotulo: "Todos" },
];

/** Build breadcrumb path from root to the given folder */
function construirCaminho(
  pastas: PastaDrive[],
  id: string,
  caminho: PastaDrive[] = [],
): PastaDrive[] | null {
  for (const p of pastas) {
    if (p.id === id) return [...caminho, p];
    const resultado = construirCaminho(p.filhos, id, [...caminho, p]);
    if (resultado) return resultado;
  }
  return null;
}

/** Collect all folder IDs under a given folder (including self) */
function coletarIds(pastas: PastaDrive[], alvoId: string): Set<string> {
  const ids = new Set<string>();

  function buscar(lista: PastaDrive[], dentro: boolean) {
    for (const p of lista) {
      if (p.id === alvoId || dentro) {
        ids.add(p.id);
        buscar(p.filhos, true);
      } else {
        buscar(p.filhos, false);
      }
    }
  }

  buscar(pastas, false);
  ids.add(alvoId); // include self
  return ids;
}

/** Find the most recently modified top-level folder */
function pastaMaisRecente(pastas: PastaDrive[]): PastaDrive | null {
  if (pastas.length === 0) return null;
  return pastas.reduce((a, b) =>
    new Date(b.modifiedTime).getTime() > new Date(a.modifiedTime).getTime() ? b : a,
  );
}

/** Get the cutoff date for a filter value */
function dataCorteFiltro(filtro: FiltroData): Date | null {
  if (filtro === "todos") return null;
  if (filtro === "mes") {
    const agora = new Date();
    return new Date(agora.getFullYear(), agora.getMonth(), 1);
  }
  const dias = Number(filtro);
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ItemPasta({
  pasta,
  selecionadaId,
  nivel,
  aoSelecionar,
  contagens,
}: {
  pasta: PastaDrive;
  selecionadaId: string | null;
  nivel: number;
  aoSelecionar: (id: string) => void;
  contagens: Map<string, number>;
}) {
  const [expandida, setExpandida] = useState(nivel === 0);
  const ativa = pasta.id === selecionadaId;
  const temFilhos = pasta.filhos.length > 0;
  const count = contagens.get(pasta.id) ?? 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          aoSelecionar(pasta.id);
          if (temFilhos) setExpandida((v) => !v);
        }}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
          ativa ? "bg-accent font-medium text-accent-foreground" : "text-foreground"
        }`}
        style={{ paddingLeft: `${nivel * 12 + 8}px` }}
      >
        {temFilhos ? (
          <ChevronRight
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expandida ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {ativa ? (
          <FolderOpen className="size-4 shrink-0 text-primary" />
        ) : (
          <Folder className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate flex-1 text-left">{pasta.nome}</span>
        {count > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
        )}
      </button>

      {expandida &&
        pasta.filhos.map((filho) => (
          <ItemPasta
            key={filho.id}
            pasta={filho}
            selecionadaId={selecionadaId}
            nivel={nivel + 1}
            aoSelecionar={aoSelecionar}
            contagens={contagens}
          />
        ))}
    </div>
  );
}

function CardVideo({
  video,
  selecionado,
  aoAlternar,
  aoPreview,
}: {
  video: VideoDrive;
  selecionado: boolean;
  aoAlternar: () => void;
  aoPreview: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={aoAlternar}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          aoAlternar();
        }
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-card transition-all ${
        selecionado
          ? "border-primary ring-1 ring-primary/20"
          : "border-border hover:border-border/80 hover:shadow-sm"
      }`}
    >
      {/* Thumbnail — uniform 4:5 cards, object-cover for all. Badge shows format. */}
      <div className="relative w-full aspect-[4/5] bg-muted overflow-hidden">
        {/* Fallback always behind */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Video className="size-8 text-muted-foreground/20" />
        </div>
        {video.thumbnailLink && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailLink}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}

        {/* Badges top-right: duration + format */}
        <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
          {video.duracao != null && video.duracao > 0 && (
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {formatarDuracao(video.duracao)}
            </span>
          )}
          <span className="flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <IconeFormato formato={video.formato} className="size-2.5" />
            {ROTULO_FORMATO[video.formato]}
          </span>
        </div>

        {/* Play overlay */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            aoPreview();
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100"
          aria-label="Pré-visualizar vídeo"
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-white/90 shadow-md">
            <Play className="size-4 text-foreground" />
          </div>
        </button>

        {/* Selection checkmark */}
        {selecionado && (
          <div className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="size-3" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-1 p-2">
        <p className="truncate text-xs font-medium leading-tight" title={video.nome}>
          {video.nome}
        </p>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{formatarTamanho(video.tamanho)}</span>
          <span>·</span>
          <span>{formatarData(video.modifiedTime)}</span>
        </div>
        {video.pastaOrigem && (
          <p className="truncate text-[10px] text-muted-foreground/70">
            {video.pastaOrigem}
          </p>
        )}
      </div>
    </div>
  );
}

function GradeEsqueleto() {
  return (
    <div className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border">
          <Skeleton className="aspect-video w-full" />
          <div className="space-y-1.5 p-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DialogExploradorVideos({
  aberto,
  aoFechar,
  aoConfirmar,
}: DialogExploradorVideosProps) {
  // Full index loaded once
  const [indice, setIndice] = useState<IndiceCompleto | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  // Filters (all client-side)
  const [pastaSelecionada, setPastaSelecionada] = useState<string | null>(null);
  const [filtroData, setFiltroData] = useState<FiltroData>("7");
  const [incluirSubpastas, setIncluirSubpastas] = useState(true);
  const [atalhoNovos, setAtalhoNovos] = useState(false);
  const [busca, setBusca] = useState("");

  // Selection
  const [selecionados, setSelecionados] = useState<Map<string, VideoDrive>>(new Map());

  // Preview
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);

  // Load full index on dialog open (single API call, cached server-side for 10min)
  useEffect(() => {
    if (!aberto || indice) return;

    async function carregar() {
      setCarregando(true);
      setErroCarregamento(null);
      try {
        const res = await fetch("/api/drive/indice");
        if (!res.ok) throw new Error("Erro ao carregar índice de vídeos");
        const dados: IndiceCompleto = await res.json();
        setIndice(dados);

        // Auto-select most recent month folder
        const recente = pastaMaisRecente(dados.pastas);
        if (recente) setPastaSelecionada(recente.id);
      } catch (err) {
        setErroCarregamento(err instanceof Error ? err.message : "Erro desconhecido");
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, [aberto, indice]);

  // Reset on close
  useEffect(() => {
    if (!aberto) {
      setPastaSelecionada(null);
      setSelecionados(new Map());
      setFiltroData("7");
      setIncluirSubpastas(true);
      setPreviewVideoId(null);
      setAtalhoNovos(false);
      setBusca("");
      // Don't clear indice — reuse on next open
    }
  }, [aberto]);

  // Client-side video filtering (instant)
  const videosFiltrados = useMemo(() => {
    if (!indice) return [];

    let lista = indice.videos;

    // Filter by folder
    if (atalhoNovos) {
      // "Novos" shortcut: all videos from last 7 days
      const corte = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return lista.filter((v) => new Date(v.modifiedTime) >= corte);
    }

    if (pastaSelecionada) {
      if (incluirSubpastas) {
        const idsValidos = coletarIds(indice.pastas, pastaSelecionada);
        lista = lista.filter((v) => idsValidos.has(v.pastaId));
      } else {
        lista = lista.filter((v) => v.pastaId === pastaSelecionada);
      }
    }

    // Filter by date
    const corte = dataCorteFiltro(filtroData);
    if (corte) {
      lista = lista.filter((v) => new Date(v.modifiedTime) >= corte);
    }

    // Filter by search
    if (busca.trim()) {
      const termo = busca.trim().toLowerCase();
      lista = lista.filter(
        (v) =>
          v.nome.toLowerCase().includes(termo) ||
          v.pastaOrigem.toLowerCase().includes(termo)
      );
    }

    return lista;
  }, [indice, pastaSelecionada, filtroData, incluirSubpastas, atalhoNovos, busca]);

  // Video count per folder (for sidebar badges)
  const contagensPorPasta = useMemo(() => {
    if (!indice) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const v of indice.videos) {
      map.set(v.pastaId, (map.get(v.pastaId) ?? 0) + 1);
    }
    return map;
  }, [indice]);

  // Breadcrumb
  const caminho = useMemo(() => {
    if (!pastaSelecionada || !indice) return [];
    return construirCaminho(indice.pastas, pastaSelecionada) ?? [];
  }, [indice, pastaSelecionada]);

  // Handlers
  const alternarSelecao = useCallback((video: VideoDrive) => {
    setSelecionados((prev) => {
      const next = new Map(prev);
      if (next.has(video.id)) next.delete(video.id);
      else next.set(video.id, video);
      return next;
    });
  }, []);

  const selecionarPasta = useCallback((id: string) => {
    setAtalhoNovos(false);
    setPastaSelecionada(id);
  }, []);

  const ativarAtalhoNovos = useCallback(() => {
    setPastaSelecionada(null);
    setAtalhoNovos(true);
  }, []);

  const confirmar = useCallback(() => {
    aoConfirmar(Array.from(selecionados.values()));
  }, [selecionados, aoConfirmar]);

  const totalSelecionados = selecionados.size;

  return (
    <>
      <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
        <DialogContent
          className="flex max-h-[90vh] h-[90vh] w-[95vw] max-w-[95vw] sm:max-w-[95vw] flex-col gap-0 p-0"
          showCloseButton={false}
        >
          {/* ── Top bar ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-b px-5 py-3">
            <DialogHeader className="flex-row items-center gap-3">
              <DialogTitle className="flex items-center gap-2">
                <Video className="size-5 text-primary" />
                Explorar Vídeos
              </DialogTitle>
              {indice && (
                <Badge variant="outline" className="text-muted-foreground font-normal">
                  {indice.totalVideos} vídeos
                </Badge>
              )}
              {totalSelecionados > 0 && (
                <Badge>{totalSelecionados} selecionado{totalSelecionados !== 1 ? "s" : ""}</Badge>
              )}
            </DialogHeader>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={aoFechar}>
                Cancelar
              </Button>
              <Button size="sm" disabled={totalSelecionados === 0} onClick={confirmar}>
                Criar Anúncios ({totalSelecionados})
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* ── Loading state (full index) ──────────────────────────── */}
          {carregando ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Carregando vídeos do Drive...</p>
              <p className="text-xs text-muted-foreground/60">Primeira carga pode levar alguns segundos</p>
            </div>
          ) : erroCarregamento ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <p className="text-sm text-destructive">{erroCarregamento}</p>
              <Button variant="outline" size="sm" onClick={() => { setIndice(null); }}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              {/* ── Filter bar ────────────────────────────────────────── */}
              <div className="flex items-center gap-3 border-b px-5 py-2">
                <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
                  {atalhoNovos ? (
                    <span className="flex items-center gap-1 font-medium text-primary">
                      <Sparkles className="size-3.5" />
                      Novos (últimos 7 dias)
                    </span>
                  ) : caminho.length > 0 ? (
                    caminho.map((p, i) => (
                      <span key={p.id} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight className="size-3 text-muted-foreground" />}
                        {i < caminho.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => selecionarPasta(p.id)}
                            className="truncate text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {p.nome}
                          </button>
                        ) : (
                          <span className="truncate font-medium">{p.nome}</span>
                        )}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground">Selecione uma pasta</span>
                  )}
                </nav>

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar vídeo..."
                    className="h-8 w-48 rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  />
                </div>

                {!atalhoNovos && (
                  <>
                    <Select value={filtroData} onValueChange={(v) => setFiltroData(v as FiltroData)}>
                      <SelectTrigger size="sm" className="w-[170px]">
                        <Clock className="size-3.5 text-muted-foreground" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPCOES_FILTRO_DATA.map((o) => (
                          <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground select-none">
                      <Checkbox checked={incluirSubpastas} onCheckedChange={(v) => setIncluirSubpastas(v === true)} />
                      Incluir subpastas
                    </label>
                  </>
                )}

                <Badge variant="secondary" className="tabular-nums">
                  {videosFiltrados.length} vídeo{videosFiltrados.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              {/* ── Main area ─────────────────────────────────────────── */}
              <div className="flex min-h-0 flex-1">
                {/* Sidebar */}
                <aside className="flex w-[240px] shrink-0 flex-col border-r bg-muted/30">
                  <div className="flex-1 overflow-y-auto p-2">
                    {indice?.pastas.map((pasta) => (
                      <ItemPasta
                        key={pasta.id}
                        pasta={pasta}
                        selecionadaId={atalhoNovos ? null : pastaSelecionada}
                        nivel={0}
                        aoSelecionar={selecionarPasta}
                        contagens={contagensPorPasta}
                      />
                    ))}
                  </div>

                  <div className="border-t p-2">
                    <button
                      type="button"
                      onClick={ativarAtalhoNovos}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
                        atalhoNovos ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <Sparkles className="size-4 text-amber-500" />
                      Novos (últimos 7 dias)
                    </button>
                  </div>
                </aside>

                {/* Video grid */}
                <main className="flex-1 overflow-y-auto p-4">
                  {videosFiltrados.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Video className="size-10 opacity-30" />
                      <p className="text-sm">
                        {pastaSelecionada || atalhoNovos
                          ? "Nenhum vídeo encontrado com os filtros atuais"
                          : "Selecione uma pasta para explorar vídeos"}
                      </p>
                    </div>
                  ) : (
                    <div className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                      {videosFiltrados.map((video) => (
                        <CardVideo
                          key={video.id}
                          video={video}
                          selecionado={selecionados.has(video.id)}
                          aoAlternar={() => alternarSelecao(video)}
                          aoPreview={() => setPreviewVideoId(video.id)}
                        />
                      ))}
                    </div>
                  )}
                </main>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Video preview dialog ──────────────────────────────────── */}
      <Dialog open={previewVideoId !== null} onOpenChange={(open) => !open && setPreviewVideoId(null)}>
        <DialogContent
          className="flex flex-col gap-0 p-0 overflow-hidden sm:max-w-fit max-h-[90vh]"
          showCloseButton={false}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b">
            <DialogTitle className="text-sm font-medium truncate min-w-0">
              {(() => {
                const v = previewVideoId ? indice?.videos.find((x) => x.id === previewVideoId) : null;
                return v ? `${v.nome}  ·  ${v.largura}×${v.altura}  ·  ${ROTULO_FORMATO[v.formato]}` : "Preview";
              })()}
            </DialogTitle>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setPreviewVideoId(null)}>
              ✕
            </Button>
          </div>
          <div className="bg-black flex items-center justify-center min-h-0 flex-1">
            {previewVideoId && (
              <video
                key={previewVideoId}
                src={`/api/drive/stream/${previewVideoId}`}
                className="max-h-[calc(90vh-52px)] max-w-full"
                controls
                autoPlay
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
