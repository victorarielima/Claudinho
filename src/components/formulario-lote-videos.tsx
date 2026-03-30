"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Separator } from "@/components/ui/separator";
import type { VideoDrive } from "@/lib/drive-explorer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Brand {
  id: string;
  name: string;
  meta_account_id: string;
  meta_page_id: string;
}

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
  dailyBudget: string;
}

interface AnuncioItem {
  videoId: string;
  adName: string;
  titulo: string;
  driveUrl: string;
  thumbnailLink: string | null;
  nomeArquivo: string;
}

export interface FormularioLoteVideosProps {
  aberto: boolean;
  aoFechar: () => void;
  videos: VideoDrive[];
  aoSalvar: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gerarAdName(nomeArquivo: string): string {
  const semExtensao = nomeArquivo.replace(/\.[^.]+$/, "");
  const limpo = semExtensao
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50);
  const mes = new Date()
    .toLocaleString("pt-BR", { month: "short" })
    .toUpperCase()
    .replace(".", "");
  const ano = new Date().getFullYear();
  return `VID-${limpo}-${mes}${ano}`;
}

import { CTA_OPTIONS } from "@/lib/constants";

const DESCRICAO_PADRAO_VINHO = "Beba com Moderação!";
const CTA_PADRAO_VINHO = "SHOP_NOW";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormularioLoteVideos({
  aberto,
  aoFechar,
  videos,
  aoSalvar,
}: FormularioLoteVideosProps) {
  // ─── Selector data ─────────────────────────────────────────
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [adsets, setAdsets] = useState<AdSet[]>([]);

  const [carregandoBrands, setCarregandoBrands] = useState(false);
  const [carregandoCampanhas, setCarregandoCampanhas] = useState(false);
  const [carregandoAdsets, setCarregandoAdsets] = useState(false);

  // ─── Form: destination ─────────────────────────────────────
  const [brandId, setBrandId] = useState("");
  const [campanhaId, setCampanhaId] = useState("");
  const [adSetId, setAdSetId] = useState("");

  // ─── Form: shared fields ───────────────────────────────────
  const [textoPrincipal, setTextoPrincipal] = useState("");
  const [descricao, setDescricao] = useState(DESCRICAO_PADRAO_VINHO);
  const [cta, setCta] = useState(CTA_PADRAO_VINHO);
  const [linkCampanha, setLinkCampanha] = useState("");

  // ─── Form: individual ads ──────────────────────────────────
  const [anuncios, setAnuncios] = useState<AnuncioItem[]>([]);

  // ─── Save state ────────────────────────────────────────────
  const [salvando, setSalvando] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // ─── Load brands on mount ──────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    setCarregandoBrands(true);
    fetch("/api/brands")
      .then((r) => r.json())
      .then((json) => {
        setBrands(json.data ?? []);
      })
      .catch(() => setBrands([]))
      .finally(() => setCarregandoBrands(false));
  }, [aberto]);

  // ─── Initialize anuncios from videos prop ──────────────────
  useEffect(() => {
    if (!aberto) return;
    setAnuncios(
      videos.map((v) => ({
        videoId: v.id,
        adName: gerarAdName(v.nome),
        titulo: v.nome.replace(/\.[^.]+$/, ""),
        driveUrl: v.driveUrl,
        thumbnailLink: v.thumbnailLink,
        nomeArquivo: v.nome,
      }))
    );
    // Reset form on open
    setBrandId("");
    setCampanhaId("");
    setAdSetId("");
    setTextoPrincipal("");
    setDescricao(DESCRICAO_PADRAO_VINHO);
    setCta(CTA_PADRAO_VINHO);
    setLinkCampanha("");
    setCampanhas([]);
    setAdsets([]);
    setMensagemErro(null);
    setMensagemSucesso(null);
  }, [aberto, videos]);

  // ─── Load campanhas when brand changes ─────────────────────
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
      if (brand) {
        carregarCampanhas(brand.meta_account_id);
      }
    },
    [brands, carregarCampanhas]
  );

  // ─── Load adsets when campanha changes ─────────────────────
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

  // ─── Update individual ad ──────────────────────────────────
  const atualizarAnuncio = useCallback(
    (videoId: string, campo: "adName" | "titulo", valor: string) => {
      setAnuncios((prev) =>
        prev.map((a) => (a.videoId === videoId ? { ...a, [campo]: valor } : a))
      );
    },
    []
  );

  const removerAnuncio = useCallback((videoId: string) => {
    setAnuncios((prev) => prev.filter((a) => a.videoId !== videoId));
  }, []);

  // ─── Save ──────────────────────────────────────────────────
  const podeSalvar =
    brandId && campanhaId && adSetId && anuncios.length > 0 && !salvando;

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
          textoPrincipal,
          descricao,
          cta,
          linkCampanha,
          anuncios: anuncios.map((a) => ({
            videoId: a.videoId,
            adName: a.adName,
            titulo: a.titulo,
            driveUrl: a.driveUrl,
            thumbnailLink: a.thumbnailLink,
            nomeArquivo: a.nomeArquivo,
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
      setMensagemErro(
        e instanceof Error ? e.message : "Erro desconhecido ao salvar"
      );
    } finally {
      setSalvando(false);
    }
  }, [
    podeSalvar,
    brandId,
    campanhaId,
    campanhas,
    adSetId,
    adsets,
    textoPrincipal,
    descricao,
    cta,
    linkCampanha,
    anuncios,
    aoSalvar,
    aoFechar,
  ]);

  // ─── Render ────────────────────────────────────────────────
  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="flex max-h-[90vh] h-[90vh] w-[80vw] max-w-[80vw] sm:max-w-[80vw] flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Criar Anúncios em Lote</DialogTitle>
          <DialogDescription>
            Configure o destino e os campos compartilhados para{" "}
            {anuncios.length} vídeo{anuncios.length !== 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {/* ── Section 1: Destino ────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Destino
            </h3>
            <div className="grid gap-3">
              {/* Brand */}
              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Marca
                </label>
                <Select
                  value={brandId}
                  onValueChange={handleBrandChange}
                  disabled={carregandoBrands}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        carregandoBrands ? "Carregando..." : "Selecione a marca"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Campanha */}
              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Campanha
                </label>
                <Select
                  value={campanhaId}
                  onValueChange={handleCampanhaChange}
                  disabled={!brandId || carregandoCampanhas}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        carregandoCampanhas
                          ? "Carregando..."
                          : !brandId
                            ? "Selecione a marca primeiro"
                            : "Selecione a campanha"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {campanhas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}{" "}
                        <span className="text-muted-foreground">
                          ({c.status})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ad Set */}
              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Conjunto de Anúncios
                </label>
                <Select
                  value={adSetId}
                  onValueChange={setAdSetId}
                  disabled={!campanhaId || carregandoAdsets}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        carregandoAdsets
                          ? "Carregando..."
                          : !campanhaId
                            ? "Selecione a campanha primeiro"
                            : "Selecione o conjunto"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {adsets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nome}{" "}
                        <span className="text-muted-foreground">
                          ({a.status})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator className="my-5" />

          {/* ── Section 2: Campos compartilhados ──────────────── */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Campos compartilhados
            </h3>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Texto principal
                </label>
                <textarea
                  rows={3}
                  value={textoPrincipal}
                  onChange={(e) => setTextoPrincipal(e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  placeholder="Texto do anúncio..."
                />
              </div>

              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Descrição
                </label>
                <input
                  type="text"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  placeholder="Descrição curta..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-muted-foreground">
                    CTA
                  </label>
                  <Select value={cta} onValueChange={setCta}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o CTA" />
                    </SelectTrigger>
                    <SelectContent>
                      {CTA_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-muted-foreground">
                    Link da campanha
                  </label>
                  <input
                    type="text"
                    value={linkCampanha}
                    onChange={(e) => setLinkCampanha(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    placeholder="https://www.evino.com.br/..."
                  />
                </div>
              </div>
            </div>
          </section>

          <Separator className="my-5" />

          {/* ── Section 3: Anúncios individuais ───────────────── */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Anúncios individuais{" "}
              <span className="font-normal text-muted-foreground">
                ({anuncios.length} anúncio{anuncios.length !== 1 ? "s" : ""})
              </span>
            </h3>
            <div className="grid gap-3">
              {anuncios.map((anuncio) => (
                <div
                  key={anuncio.videoId}
                  className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3"
                >
                  {/* Thumbnail */}
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    {anuncio.thumbnailLink ? (
                      <Image
                        src={anuncio.thumbnailLink}
                        alt={anuncio.nomeArquivo}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <svg
                          className="h-6 w-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Fields */}
                  <div className="flex-1 grid gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {anuncio.nomeArquivo}
                    </p>
                    <input
                      type="text"
                      value={anuncio.adName}
                      onChange={(e) =>
                        atualizarAnuncio(
                          anuncio.videoId,
                          "adName",
                          e.target.value
                        )
                      }
                      className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      placeholder="Nome do Anúncio"
                    />
                    <input
                      type="text"
                      value={anuncio.titulo}
                      onChange={(e) =>
                        atualizarAnuncio(
                          anuncio.videoId,
                          "titulo",
                          e.target.value
                        )
                      }
                      className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      placeholder="Título"
                    />
                  </div>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removerAnuncio(anuncio.videoId)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title="Remover vídeo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {anuncios.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum vídeo selecionado. Todos os vídeos foram removidos.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* ── Bottom bar (sticky) ─────────────────────────────── */}
        <div className="border-t bg-background px-6 py-4">
          {mensagemErro && (
            <p className="mb-3 text-sm text-destructive">{mensagemErro}</p>
          )}
          {mensagemSucesso && (
            <p className="mb-3 text-sm text-green-600">{mensagemSucesso}</p>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={aoFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={!podeSalvar}>
              {salvando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                `Salvar Rascunhos (${anuncios.length})`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
