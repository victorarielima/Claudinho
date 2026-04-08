"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
            <div className="grid grid-cols-3 gap-3">
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
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Campanha</label>
                <Select value={campanhaId} onValueChange={handleCampanhaChange} disabled={!brandId || carregandoCampanhas}>
                  <SelectTrigger className="h-9 text-sm">
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
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Conjunto</label>
                <Select value={adSetId} onValueChange={setAdSetId} disabled={!campanhaId || carregandoAdsets}>
                  <SelectTrigger className="h-9 text-sm">
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
                      className="h-8 text-xs font-mono w-full rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <input
                      value={anuncio.titulo}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAnuncio(i, "titulo", e.target.value)}
                      className="h-8 text-xs w-full rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <textarea
                      value={anuncio.textoPrincipal}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateAnuncio(i, "textoPrincipal", e.target.value)}
                      className="text-xs min-h-[32px] resize-none w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <input
                      value={anuncio.linkCampanha}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAnuncio(i, "linkCampanha", e.target.value)}
                      className="h-8 text-xs w-full rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
