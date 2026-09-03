"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PreviewLinkAnuncio } from "@/components/editor-utm";
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
  Check,
  CheckCircle2,
  AlertCircle,
  Plus,
  Sparkles,
} from "lucide-react";
import { CTA_OPTIONS } from "@/lib/constants";
import { gerarLegendaCliente, detectarMarca } from "@/lib/ai-cliente";
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

interface Destino {
  campaignId: string;
  campaignName: string;
  adSetId: string;
  adSetName: string;
}

interface AnuncioForm {
  taskId: string;
  taskName: string;
  adName: string;
  adNameEditado: boolean;
  titulo: string;
  textoPrincipal: string;
  linkCampanha: string;
  linkAnuncioOverride: string | null;
  attachments: { placement: string; url: string; title: string; selecionado: boolean }[];
}

// ─── Helpers ───────────────────────────────────────────────

function semanaAno(): string {
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - oneJan.getTime()) / 86400000);
  const week = Math.ceil((days + oneJan.getDay() + 1) / 7);
  return `W${String(week).padStart(2, "0")}-${now.getFullYear()}`;
}

function limparMiolo(nome: string): string {
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

function gerarAdName(taskName: string): string {
  const miolo = limparMiolo(taskName);
  const semana = semanaAno();

  return ["EST", miolo, semana].join("-");
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Retorna o próximo nome disponível para um ad_name base, considerando os
// nomes já em uso no ad set. Se `base` ainda não existe → retorna `base`.
// Caso contrário acrescenta -V2, -V3, ... pulando versões já tomadas.
function calcularProximaVersao(base: string, existentes: Set<string>): string {
  if (!existentes.has(base)) {
    let i = 2;
    while (existentes.has(`${base}-V${i}`)) i += 1;
    if (i === 2) return base;
    return `${base}-V${i}`;
  }
  const re = new RegExp(`^${escaparRegex(base)}-V(\\d+)$`);
  let maiorV = 1;
  for (const nome of existentes) {
    const m = nome.match(re);
    if (m) {
      const v = parseInt(m[1], 10);
      if (v > maiorV) maiorV = v;
    }
  }
  return `${base}-V${maiorV + 1}`;
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
  // Multi-destino: mesmos criativos para campanhas/ad sets diferentes (fan-out).
  const [destinos, setDestinos] = useState<Destino[]>([]);

  // ── Shared fields ───────────────────────────────────────
  const [descricao, setDescricao] = useState("");
  const [cta, setCta] = useState("SHOP_NOW");

  // ── Per-ad form ─────────────────────────────────────────
  const [anuncios, setAnuncios] = useState<AnuncioForm[]>([]);

  // ── Legenda por IA ──────────────────────────────────────
  const [statusLegenda, setStatusLegenda] = useState<
    Record<string, "gerando" | "erro" | undefined>
  >({});
  const legendasDisparadasRef = useRef<Set<string>>(new Set());

  // ── Save state ──────────────────────────────────────────
  const [salvando, setSalvando] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // ── Duplicate detection ─────────────────────────────────
  const [adNamesExistentes, setAdNamesExistentes] = useState<Set<string>>(() => new Set());
  const [confirmandoVersao, setConfirmandoVersao] = useState(false);

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
        linkAnuncioOverride: null,
        attachments: card.attachments.map((a) => ({
          placement: a.placement,
          url: a.url,
          title: a.title,
          selecionado: true,
        })),
      }))
    );
    legendasDisparadasRef.current = new Set();
    setStatusLegenda({});
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
    setDestinos([]);
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

  // ── Multi-destino ───────────────────────────────────────
  const adicionarDestino = useCallback(() => {
    if (!campanhaId || !adSetId) return;
    const campaignName = campanhas.find((c) => c.id === campanhaId)?.nome ?? campanhaId;
    const adSetName = adsets.find((a) => a.id === adSetId)?.nome ?? adSetId;
    setDestinos((prev) => {
      if (prev.some((d) => d.adSetId === adSetId)) return prev;
      return [...prev, { campaignId: campanhaId, campaignName, adSetId, adSetName }];
    });
    setAdSetId("");
  }, [campanhaId, adSetId, campanhas, adsets]);

  const removerDestino = useCallback((id: string) => {
    setDestinos((prev) => prev.filter((d) => d.adSetId !== id));
  }, []);

  // ── Update anuncio field ────────────────────────────────
  const updateAnuncio = useCallback((index: number, field: keyof AnuncioForm, value: string | null) => {
    setAnuncios((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      if (field === "adName") {
        item.adNameEditado = true;
      }
      next[index] = item;
      return next;
    });
  }, []);

  // ── Toggle attachment selection ─────────────────────────
  const toggleAttachment = useCallback((anuncioIndex: number, url: string) => {
    setAnuncios((prev) => {
      const next = [...prev];
      const item = next[anuncioIndex];
      next[anuncioIndex] = {
        ...item,
        attachments: item.attachments.map((att) =>
          att.url === url ? { ...att, selecionado: !att.selecionado } : att
        ),
      };
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
        return updated;
      });
    });
  }, []);

  // ── Gerar legenda com IA (analisa o criativo estático) ──
  const gerarLegendaPara = useCallback(
    async (anuncio: AnuncioForm, forcar = false) => {
      if (!forcar && anuncio.textoPrincipal.trim()) return;
      // Usa o primeiro criativo selecionado (ou o primeiro anexo) como visual.
      const visual =
        anuncio.attachments.find((a) => a.selecionado) ?? anuncio.attachments[0];
      setStatusLegenda((s) => ({ ...s, [anuncio.taskId]: "gerando" }));
      try {
        const legenda = await gerarLegendaCliente({
          tipo: "imagem",
          imagemUrl: visual?.url ?? null,
          nomeArquivo: anuncio.taskName,
          marca: detectarMarca(anuncio.taskName),
        });
        setAnuncios((prev) =>
          prev.map((a) => {
            if (a.taskId !== anuncio.taskId) return a;
            if (!forcar && a.textoPrincipal.trim()) return a;
            return { ...a, textoPrincipal: legenda };
          })
        );
        setStatusLegenda((s) => ({ ...s, [anuncio.taskId]: undefined }));
      } catch {
        setStatusLegenda((s) => ({ ...s, [anuncio.taskId]: "erro" }));
      }
    },
    []
  );

  // Auto-dispara a geração quando os anúncios são inicializados.
  useEffect(() => {
    if (!aberto) return;
    for (const a of anuncios) {
      if (legendasDisparadasRef.current.has(a.taskId)) continue;
      legendasDisparadasRef.current.add(a.taskId);
      void gerarLegendaPara(a);
    }
  }, [aberto, anuncios, gerarLegendaPara]);

  // ── Sort: ACTIVE first, then alphabetical ───────────────
  const campanhasOrdenadas = useMemo(
    () =>
      [...campanhas].sort((a, b) => {
        const ativoA = a.status === "ACTIVE" ? 0 : 1;
        const ativoB = b.status === "ACTIVE" ? 0 : 1;
        if (ativoA !== ativoB) return ativoA - ativoB;
        return a.nome.localeCompare(b.nome);
      }),
    [campanhas],
  );

  const adsetsOrdenados = useMemo(
    () =>
      [...adsets].sort((a, b) => {
        const ativoA = a.status === "ACTIVE" ? 0 : 1;
        const ativoB = b.status === "ACTIVE" ? 0 : 1;
        if (ativoA !== ativoB) return ativoA - ativoB;
        return a.nome.localeCompare(b.nome);
      }),
    [adsets],
  );

  // ── Validation ──────────────────────────────────────────
  const podeSalvar = useMemo(() => {
    if (!brandId) return false;
    // Precisa de pelo menos um destino: na lista ou no staging.
    if (destinos.length === 0 && (!campanhaId || !adSetId)) return false;
    if (anuncios.length === 0) return false;
    return anuncios.every(
      (a) => a.adName.trim() && a.attachments.some((att) => att.selecionado)
    );
  }, [brandId, campanhaId, adSetId, destinos, anuncios]);

  // ── Fetch existing ad names for selected destino ────────
  const campanhaNome = useMemo(
    () => campanhas.find((c) => c.id === campanhaId)?.nome ?? "",
    [campanhas, campanhaId]
  );
  const adSetNome = useMemo(
    () => adsets.find((a) => a.id === adSetId)?.nome ?? "",
    [adsets, adSetId]
  );

  // Destinos efetivos: a lista + o staging selecionado (se ainda não estiver
  // na lista). Garante que o ad set escolhido no dropdown não seja perdido
  // caso o usuário esqueça de clicar "Adicionar destino" após já ter
  // adicionado outros — antes, o anúncio subia só para os destinos adicionados.
  const destinosEfetivos: Destino[] = useMemo(() => {
    const efetivos = [...destinos];
    if (campanhaId && adSetId && !efetivos.some((d) => d.adSetId === adSetId)) {
      efetivos.push({ campaignId: campanhaId, campaignName: campanhaNome, adSetId, adSetName: adSetNome });
    }
    return efetivos;
  }, [destinos, campanhaId, adSetId, campanhaNome, adSetNome]);

  // Versionamento automático de nome só faz sentido para um único ad set
  // (os existentes são consultados por ad set). Com fan-out multi-destino
  // mantemos o nome digitado — nomes iguais em ad sets distintos não colidem.
  const versionarNomes = destinosEfetivos.length <= 1;

  useEffect(() => {
    // Só consultamos duplicatas quando há um único destino efetivo
    // (o versionamento por ad set não faz sentido no fan-out).
    const alvo = versionarNomes ? destinosEfetivos[0] : undefined;
    if (!brandId || !alvo) {
      setAdNamesExistentes(new Set());
      return;
    }
    let cancelado = false;
    fetch("/api/ads/lote/checar-duplicatas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, campaignName: alvo.campaignName, adSetName: alvo.adSetName }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelado) return;
        const lista: string[] = Array.isArray(json.existentes) ? json.existentes : [];
        setAdNamesExistentes(new Set(lista));
      })
      .catch(() => {
        if (!cancelado) setAdNamesExistentes(new Set());
      });
    return () => {
      cancelado = true;
    };
  }, [brandId, versionarNomes, destinosEfetivos]);

  // Mapa: index do anuncio → próximo ad_name disponível (igual ao atual se não há conflito)
  const proximosNomes = useMemo(() => {
    return anuncios.map((a) => calcularProximaVersao(a.adName, adNamesExistentes));
  }, [anuncios, adNamesExistentes]);

  const conflitos = useMemo(
    () => anuncios.map((a, i) => proximosNomes[i] !== a.adName),
    [anuncios, proximosNomes]
  );

  const totalConflitos = useMemo(
    () => conflitos.filter(Boolean).length,
    [conflitos]
  );

  // Reset o estado de confirmação quando o conjunto de conflitos mudar
  useEffect(() => {
    setConfirmandoVersao(false);
  }, [totalConflitos, brandId, campanhaId, adSetId]);

  // ── Save handler ────────────────────────────────────────
  const salvar = useCallback(async () => {
    if (!podeSalvar) return;

    // Se há conflitos (apenas no caso de destino único) e o usuário ainda
    // não confirmou, mostrar banner de confirmação em vez de salvar.
    if (versionarNomes && totalConflitos > 0 && !confirmandoVersao) {
      setConfirmandoVersao(true);
      setMensagemErro(null);
      return;
    }

    setSalvando(true);
    setMensagemErro(null);
    setMensagemSucesso(null);

    try {
      const res = await fetch("/api/ads/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          destinos: destinosEfetivos,
          descricao,
          cta,
          textoPrincipal: "",
          linkCampanha: "",
          type: "image",
          anuncios: anuncios.map((a, i) => ({
            adName: versionarNomes ? proximosNomes[i] : a.adName,
            titulo: a.titulo,
            textoPrincipal: a.textoPrincipal || undefined,
            linkCampanha: a.linkCampanha || undefined,
            linkAnuncioOverride: a.linkAnuncioOverride || undefined,
            assets: a.attachments
              .filter((att) => att.selecionado)
              .map((att) => ({
                placement: att.placement,
                url: att.url,
                type: "image" as const,
              })),
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Erro ao salvar rascunhos");

      const totalCriados = typeof json.criados === "number" ? json.criados : anuncios.length;
      const sufixoDestino = destinosEfetivos.length > 1 ? ` em ${destinosEfetivos.length} destinos` : "";
      setMensagemSucesso(
        `${totalCriados} rascunho${totalCriados !== 1 ? "s" : ""} salvo${totalCriados !== 1 ? "s" : ""}${sufixoDestino} com sucesso!`
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
  }, [podeSalvar, versionarNomes, totalConflitos, confirmandoVersao, brandId, destinosEfetivos, descricao, cta, anuncios, proximosNomes, aoSalvar, aoFechar]);

  // ── Reset on close ──────────────────────────────────────
  useEffect(() => {
    if (!aberto) {
      setBrandId("");
      setCampanhaId("");
      setAdSetId("");
      setDestinos([]);
      setDescricao("");
      setCta("SHOP_NOW");
      setAnuncios([]);
      setMensagemErro(null);
      setMensagemSucesso(null);
      setAdNamesExistentes(new Set());
      setConfirmandoVersao(false);
      legendasDisparadasRef.current = new Set();
      setStatusLegenda({});
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
      <DialogContent className="flex h-[90vh] max-w-5xl sm:max-w-5xl flex-col gap-0 p-0 overflow-hidden" showCloseButton={false}>
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
            <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
              <div className="space-y-1 min-w-0">
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
              <div className="space-y-1 min-w-0">
                <label className="text-xs text-muted-foreground">Campanha</label>
                <Select value={campanhaId} onValueChange={handleCampanhaChange} disabled={!brandId || carregandoCampanhas}>
                  <SelectTrigger className="h-9 text-sm truncate">
                    <SelectValue placeholder={carregandoCampanhas ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {campanhasOrdenadas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${
                              c.status === "ACTIVE" ? "bg-emerald-500" : "bg-muted-foreground/40"
                            }`}
                          />
                          <span className={c.status === "ACTIVE" ? "" : "text-muted-foreground"}>
                            {c.nome}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-0">
                <label className="text-xs text-muted-foreground">Conjunto</label>
                <Select value={adSetId} onValueChange={setAdSetId} disabled={!campanhaId || carregandoAdsets}>
                  <SelectTrigger className="h-9 text-sm truncate">
                    <SelectValue placeholder={carregandoAdsets ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {adsetsOrdenados.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${
                              a.status === "ACTIVE" ? "bg-emerald-500" : "bg-muted-foreground/40"
                            }`}
                          />
                          <span className={a.status === "ACTIVE" ? "" : "text-muted-foreground"}>
                            {a.nome}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Multi-destino */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={adicionarDestino}
                disabled={!campanhaId || !adSetId}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Adicionar destino
              </Button>
              <p className="text-xs text-muted-foreground">
                Envie os mesmos criativos para campanhas e ad sets diferentes numa única importação.
              </p>
            </div>

            {destinos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {destinos.map((d) => (
                  <span
                    key={d.adSetId}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-3 pr-1.5 text-xs"
                  >
                    <span className="font-medium">{d.campaignName}</span>
                    <span className="text-muted-foreground">/ {d.adSetName}</span>
                    <button
                      type="button"
                      onClick={() => removerDestino(d.adSetId)}
                      className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Remover destino"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <span className="self-center text-[11px] text-muted-foreground">
                  O versionamento automático de nomes (V2, V3…) é aplicado apenas com um único destino.
                </span>
              </div>
            )}
          </div>

          {/* ── Shared Fields ────────────────────────────── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Campos Compartilhados</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Descrição</label>
                <input
                  value={descricao}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescricao(e.target.value)}
                  placeholder="Beba com Moderação!"
                  className="h-9 text-sm w-full rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  <div className="flex gap-1 shrink-0">
                    {anuncio.attachments.map((att) => (
                      <button
                        key={att.url}
                        type="button"
                        onClick={() => toggleAttachment(i, att.url)}
                        aria-pressed={att.selecionado}
                        title={att.selecionado ? "Clique para não enviar" : "Clique para enviar"}
                        className={`relative h-16 w-16 rounded overflow-hidden ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          att.selecionado
                            ? "ring-2 ring-primary"
                            : "opacity-40 grayscale hover:opacity-70"
                        }`}
                      >
                        <img
                          src={att.url}
                          alt={att.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        {att.selecionado && (
                          <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white text-center py-0.5">
                          {placementLabel[att.placement] ?? att.placement}
                        </span>
                      </button>
                    ))}
                  </div>
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
                    <input
                      value={anuncio.adName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAnuncio(i, "adName", e.target.value)}
                      placeholder="Nome do anúncio"
                      className={`h-8 text-xs font-mono w-full rounded-md border bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        conflitos[i] ? "border-amber-500" : "border-input"
                      }`}
                    />
                    {conflitos[i] && (
                      <p className="text-[10px] text-amber-600">
                        Já existe neste ad set — será criado como{" "}
                        <span className="font-mono">{proximosNomes[i]}</span>
                      </p>
                    )}
                    {anuncio.attachments.some((att) => att.selecionado) ? (
                      <p className="text-[10px] text-muted-foreground">
                        {anuncio.attachments.filter((att) => att.selecionado).length} de{" "}
                        {anuncio.attachments.length} criativo
                        {anuncio.attachments.length !== 1 ? "s" : ""} selecionado
                        {anuncio.attachments.filter((att) => att.selecionado).length !== 1 ? "s" : ""}
                      </p>
                    ) : (
                      <p className="text-[10px] text-destructive">
                        Selecione ao menos um criativo
                      </p>
                    )}
                  </div>
                </div>

                {/* Row 2: título + texto principal + link */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-muted-foreground">Título</label>
                      <span className={`text-[10px] ${anuncio.titulo.length > 50 ? "text-destructive" : "text-muted-foreground"}`}>
                        {anuncio.titulo.length}/50
                      </span>
                    </div>
                    <input
                      value={anuncio.titulo}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAnuncio(i, "titulo", e.target.value)}
                      className="h-8 text-xs w-full rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      maxLength={50}
                    />
                    {anuncio.titulo.length === 0 && (
                      <p className="text-[10px] text-amber-600">Recomendado pela Meta</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] text-muted-foreground">Texto Principal</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => gerarLegendaPara(anuncio, true)}
                          disabled={statusLegenda[anuncio.taskId] === "gerando"}
                          className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          title="Gerar a legenda com IA a partir do criativo"
                        >
                          {statusLegenda[anuncio.taskId] === "gerando" ? (
                            <><Loader2 className="h-3 w-3 animate-spin" />gerando...</>
                          ) : (
                            <><Sparkles className="h-3 w-3" />IA</>
                          )}
                        </button>
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
                    </div>
                    <textarea
                      value={anuncio.textoPrincipal}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateAnuncio(i, "textoPrincipal", e.target.value)}
                      className="text-xs min-h-[32px] resize-none w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      rows={1}
                      placeholder={statusLegenda[anuncio.taskId] === "gerando" ? "A IA está escrevendo..." : undefined}
                    />
                    {statusLegenda[anuncio.taskId] === "erro" && (
                      <p className="text-[10px] text-destructive">Falha ao gerar — clique em “IA” para tentar de novo.</p>
                    )}
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
                    <input
                      value={anuncio.linkCampanha}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAnuncio(i, "linkCampanha", e.target.value)}
                      className="h-8 text-xs w-full rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="https://..."
                    />
                    {anuncio.linkCampanha.length > 0 && !anuncio.linkCampanha.startsWith("https://") && (
                      <p className="text-[10px] text-amber-600">URL deve começar com https://</p>
                    )}
                    <PreviewLinkAnuncio
                      linkCampanha={anuncio.linkCampanha}
                      adSetName={adSetNome}
                      adName={versionarNomes ? proximosNomes[i] : anuncio.adName}
                      destinos={destinosEfetivos}
                      override={anuncio.linkAnuncioOverride}
                      onOverride={(v) => updateAnuncio(i, "linkAnuncioOverride", v)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t bg-background">
          {confirmandoVersao && totalConflitos > 0 && (
            <div className="border-b bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <p className="font-semibold mb-1 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {totalConflitos} card{totalConflitos !== 1 ? "s" : ""} já {totalConflitos !== 1 ? "foram usados" : "foi usado"} neste ad set
              </p>
              <p className="mb-2">
                Confirme para subir como nova versão — os nomes em conflito serão renomeados automaticamente (V2, V3, …).
                Para editar manualmente, cancele e ajuste o nome de cada anúncio.
              </p>
              <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                {anuncios.map((a, i) =>
                  conflitos[i] ? (
                    <li key={a.taskId} className="font-mono text-[11px]">
                      {a.adName} → {proximosNomes[i]}
                    </li>
                  ) : null
                )}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3">
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
              {confirmandoVersao ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmandoVersao(false)}
                    disabled={salvando}
                  >
                    Voltar e editar
                  </Button>
                  <Button size="sm" disabled={!podeSalvar || salvando} onClick={salvar}>
                    {salvando ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-1" />Salvando...</>
                    ) : (
                      `Confirmar — criar como nova versão`
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
                  <Button
                    size="sm"
                    disabled={!podeSalvar || salvando}
                    onClick={salvar}
                  >
                    {salvando ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-1" />Salvando...</>
                    ) : totalConflitos > 0 ? (
                      `Salvar ${anuncios.length} rascunho${anuncios.length !== 1 ? "s" : ""} (${totalConflitos} em nova versão)`
                    ) : (
                      `Salvar ${anuncios.length} rascunho${anuncios.length !== 1 ? "s" : ""}`
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
