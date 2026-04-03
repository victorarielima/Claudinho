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
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  textoPrincipal: string;
  linkCampanha: string;
  driveUrl: string;
  thumbnailLink: string | null;
  nomeArquivo: string;
  /** true se o usuário editou o adName manualmente */
  nomeEditado?: boolean;
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

/**
 * Extrai o destino (PRODUCT, CAMPAIGN, etc.) a partir da URL de campanha.
 * Ex: evino.com.br/product/... → PRODUCT, evino.com.br/campaign/... → CAMPAIGN
 */
function extrairDestinoDaUrl(url: string): string {
  if (!url) return "";
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.includes("/product")) return "PRODUCT";
    if (pathname.includes("/campaign")) return "CAMPAIGN";
    if (pathname.includes("/category") || pathname.includes("/categoria")) return "CATEGORY";
    if (pathname.includes("/landing")) return "LANDING";
    return "LINK";
  } catch {
    return "";
  }
}

/**
 * Retorna a semana ISO e o ano no formato W{NN}-{AAAA}.
 */
function semanaAno(): string {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000
  ) + 1;
  const weekNum = Math.ceil((dayOfYear + jan4.getDay()) / 7);
  return `W${String(weekNum).padStart(2, "0")}-${now.getFullYear()}`;
}

/**
 * Limpa o nome do arquivo para usar como miolo do ad name.
 * Remove extensão, caracteres especiais, e limita tamanho.
 */
function limparMiolo(nomeArquivo: string): string {
  return nomeArquivo
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

/**
 * Gera o ad name seguindo o padrão:
 * VIDEO-{DESTINO}-{MIOLO}-W{NN}-{AAAA}
 *
 * Se destino não for identificável, omite essa parte.
 */
function gerarAdName(nomeArquivo: string, linkCampanha?: string): string {
  const miolo = limparMiolo(nomeArquivo);
  const destino = linkCampanha ? extrairDestinoDaUrl(linkCampanha) : "";
  const semana = semanaAno();

  const partes = ["VIDEO"];
  if (destino) partes.push(destino);
  partes.push(miolo, semana);

  return partes.join("-");
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
  const [descricao, setDescricao] = useState(DESCRICAO_PADRAO_VINHO);
  const [cta, setCta] = useState(CTA_PADRAO_VINHO);

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
        textoPrincipal: "",
        linkCampanha: "",
        driveUrl: v.driveUrl,
        thumbnailLink: v.thumbnailLink,
        nomeArquivo: v.nome,
      }))
    );
    // Reset form on open
    setBrandId("");
    setCampanhaId("");
    setAdSetId("");
    setDescricao(DESCRICAO_PADRAO_VINHO);
    setCta(CTA_PADRAO_VINHO);
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

  // ─── Auto-select brand from video tags (_EV_ / _GC_) ───────
  useEffect(() => {
    if (!aberto || brands.length === 0 || videos.length === 0 || brandId) return;

    const ehEV = (t: string) => t.includes("_EV_") || t.includes("_EV ") || t.includes(" EV_") || t.includes("EVINO");
    const ehGC = (t: string) => t.includes("_GC_") || t.includes("_GC ") || t.includes(" GC_") || t.includes("GRAND CRU") || t.includes("GRANDCRU");

    // Checar tag no nome do arquivo e na pasta de origem
    const textos = videos.map((v) =>
      [v.nome, v.pastaOrigem].join(" ").toUpperCase()
    );

    const algumEV = textos.some(ehEV);
    const algumGC = textos.some(ehGC);

    // Só auto-seleciona se não houver conflito (não mistura EV com GC)
    if (algumEV && !algumGC) {
      const brand = brands.find((b) => b.name.toLowerCase().includes("evino"));
      if (brand) handleBrandChange(brand.id);
    } else if (algumGC && !algumEV) {
      const brand = brands.find((b) => b.name.toLowerCase().includes("grand"));
      if (brand) handleBrandChange(brand.id);
    }
  }, [aberto, brands, videos, brandId, handleBrandChange]);

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
    (videoId: string, campo: "adName" | "titulo" | "textoPrincipal" | "linkCampanha", valor: string) => {
      setAnuncios((prev) =>
        prev.map((a) => {
          if (a.videoId !== videoId) return a;
          const atualizado = { ...a, [campo]: valor };
          if (campo === "adName") atualizado.nomeEditado = true;
          // Regenerar ad name quando link individual muda (se não editado manualmente)
          if (campo === "linkCampanha" && !a.nomeEditado) {
            atualizado.adName = gerarAdName(a.nomeArquivo, valor);
          }
          return atualizado;
        })
      );
    },
    []
  );

  const removerAnuncio = useCallback((videoId: string) => {
    setAnuncios((prev) => prev.filter((a) => a.videoId !== videoId));
  }, []);

  const replicarCampo = useCallback(
    (campo: "textoPrincipal" | "linkCampanha", valor: string) => {
      setAnuncios((prev) => prev.map((a) => ({ ...a, [campo]: valor })));
    },
    []
  );

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
          textoPrincipal: "",
          descricao,
          cta,
          linkCampanha: "",
          anuncios: anuncios.map((a) => ({
            videoId: a.videoId,
            adName: a.adName,
            titulo: a.titulo,
            textoPrincipal: a.textoPrincipal || undefined,
            linkCampanha: a.linkCampanha || undefined,
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
    descricao,
    cta,
    anuncios,
    aoSalvar,
    aoFechar,
  ]);

  // ─── Render ────────────────────────────────────────────────
  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="flex max-h-[90vh] h-[min(90vh,620px)] w-[min(80vw,1100px)] max-w-[min(80vw,1100px)] sm:max-w-[min(80vw,1100px)] flex-col gap-0 p-0">
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
                <SearchableSelect
                  options={campanhas.map((c) => ({ value: c.id, label: c.nome, status: c.status }))}
                  value={campanhaId}
                  onValueChange={handleCampanhaChange}
                  disabled={!brandId}
                  loading={carregandoCampanhas}
                  placeholder={!brandId ? "Selecione a marca primeiro" : "Buscar campanha..."}
                />
              </div>

              {/* Ad Set */}
              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Conjunto de anúncios <span className="text-muted-foreground/60 font-normal">(Ad Set)</span>
                </label>
                <SearchableSelect
                  options={adsets.map((a) => ({ value: a.id, label: a.nome, status: a.status }))}
                  value={adSetId}
                  onValueChange={setAdSetId}
                  disabled={!campanhaId}
                  loading={carregandoAdsets}
                  placeholder={!campanhaId ? "Selecione a campanha primeiro" : "Buscar ad set..."}
                />
              </div>
            </div>
          </section>

          <Separator className="my-5" />

          {/* ── Section 2: Campos compartilhados ──────────────── */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Campos compartilhados
            </h3>
            <div className="grid grid-cols-2 gap-3">
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
                    <div className="relative">
                      <input
                        type="text"
                        value={anuncio.titulo}
                        maxLength={40}
                        onChange={(e) =>
                          atualizarAnuncio(
                            anuncio.videoId,
                            "titulo",
                            e.target.value
                          )
                        }
                        className="h-8 w-full rounded-md border border-input bg-background px-2.5 pr-12 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        placeholder="Título"
                      />
                      <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums ${anuncio.titulo.trim().length > 40 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                        {anuncio.titulo.trim().length}/40
                      </span>
                    </div>
                    <div className="flex gap-1.5 items-start">
                      <textarea
                        value={anuncio.textoPrincipal}
                        onChange={(e) =>
                          atualizarAnuncio(
                            anuncio.videoId,
                            "textoPrincipal",
                            e.target.value
                          )
                        }
                        rows={2}
                        className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        placeholder="Legenda (texto principal do anúncio)"
                      />
                      {anuncios.length > 1 && anuncio.textoPrincipal && (
                        <button
                          type="button"
                          onClick={() => replicarCampo("textoPrincipal", anuncio.textoPrincipal)}
                          className="shrink-0 mt-1.5 rounded-md border border-input bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="Aplicar este texto a todos os anúncios"
                        >
                          Replicar
                        </button>
                      )}
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="text"
                        value={anuncio.linkCampanha}
                        onChange={(e) =>
                          atualizarAnuncio(
                            anuncio.videoId,
                            "linkCampanha",
                            e.target.value
                          )
                        }
                        className="h-8 flex-1 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        placeholder="Link da campanha (URL)"
                      />
                      {anuncios.length > 1 && anuncio.linkCampanha && (
                        <button
                          type="button"
                          onClick={() => replicarCampo("linkCampanha", anuncio.linkCampanha)}
                          className="shrink-0 rounded-md border border-input bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="Aplicar este link a todos os anúncios"
                        >
                          Replicar
                        </button>
                      )}
                    </div>
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
