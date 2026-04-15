"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CTA_OPTIONS } from "@/lib/constants";
import { analisarProntidaoAnuncio, type AssetImagemValidavel } from "@/lib/ad-readiness";
import { rotuloPlacementImagem } from "@/lib/ad-media";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DadosEdicao {
  ad_name: string;
  texto_principal: string;
  titulo: string;
  descricao: string;
  cta: string;
  campaign_name: string;
  campaign_id: string;
  ad_set_name: string;
  ad_set_id: string;
  link_campanha: string;
  tipo?: "video" | "image";
  linkVideo?: string;
  thumbnailLink?: string;
  imageAssets?: AssetImagemValidavel[];
  bloqueiosMeta?: string[];
  avisosMeta?: string[];
  brand_id?: string;
  meta_account_id?: string;
}

interface Campanha {
  id: string;
  nome: string;
  status: string;
}

interface AdSet {
  id: string;
  nome: string;
  status: string;
}

interface DialogEditarAnuncioProps {
  aberto: boolean;
  aoFechar: () => void;
  adId: string | null;
  dadosIniciais: DadosEdicao | null;
  aoSalvar: () => void;
  recriar?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DialogEditarAnuncio({
  aberto,
  aoFechar,
  adId,
  dadosIniciais,
  aoSalvar,
  recriar = false,
}: DialogEditarAnuncioProps) {
  const [form, setForm] = useState<DadosEdicao>({
    ad_name: "",
    texto_principal: "",
    titulo: "",
    descricao: "",
    cta: "SHOP_NOW",
    campaign_name: "",
    campaign_id: "",
    ad_set_name: "",
    ad_set_id: "",
    link_campanha: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Campaign / AdSet selectors
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [adsets, setAdsets] = useState<AdSet[]>([]);
  const [carregandoCampanhas, setCarregandoCampanhas] = useState(false);
  const [carregandoAdsets, setCarregandoAdsets] = useState(false);

  useEffect(() => {
    if (aberto && dadosIniciais) {
      setForm(dadosIniciais);
      setErro(null);
      setCampanhas([]);
      setAdsets([]);

      // Load campaigns if we have account id
      if (dadosIniciais.meta_account_id) {
        setCarregandoCampanhas(true);
        fetch(`/api/meta/campanhas?accountId=${dadosIniciais.meta_account_id}`)
          .then((r) => r.json())
          .then((json) => {
            setCampanhas(json.campanhas ?? []);
            // Load adsets for current campaign
            if (dadosIniciais.campaign_id) {
              setCarregandoAdsets(true);
              fetch(`/api/meta/adsets?campaignId=${dadosIniciais.campaign_id}`)
                .then((r) => r.json())
                .then((json2) => setAdsets(json2.adsets ?? []))
                .catch(() => setAdsets([]))
                .finally(() => setCarregandoAdsets(false));
            }
          })
          .catch(() => setCampanhas([]))
          .finally(() => setCarregandoCampanhas(false));
      }
    }
  }, [aberto, dadosIniciais]);

  const handleCampanhaChange = useCallback((campaignId: string) => {
    const camp = campanhas.find((c) => c.id === campaignId);
    setForm((prev) => ({
      ...prev,
      campaign_id: campaignId,
      campaign_name: camp?.nome ?? prev.campaign_name,
      ad_set_id: "",
      ad_set_name: "",
    }));
    setAdsets([]);
    if (!campaignId) return;
    setCarregandoAdsets(true);
    fetch(`/api/meta/adsets?campaignId=${campaignId}`)
      .then((r) => r.json())
      .then((json) => setAdsets(json.adsets ?? []))
      .catch(() => setAdsets([]))
      .finally(() => setCarregandoAdsets(false));
  }, [campanhas]);

  const handleAdsetChange = useCallback((adsetId: string) => {
    const as_ = adsets.find((a) => a.id === adsetId);
    setForm((prev) => ({
      ...prev,
      ad_set_id: adsetId,
      ad_set_name: as_?.nome ?? prev.ad_set_name,
    }));
  }, [adsets]);

  const atualizar = useCallback(
    (campo: keyof DadosEdicao, valor: string) => {
      setForm((prev) => ({ ...prev, [campo]: valor }));
    },
    []
  );

  // Live validation
  const diagnostico = useMemo(() => {
    return analisarProntidaoAnuncio({
      tipo: form.tipo ?? "video",
      adSetId: form.ad_set_id,
      adName: form.ad_name,
      linkVideo: form.linkVideo,
      imageAssets: form.imageAssets,
      linkAnuncio: form.link_campanha,
      texto_principal: form.texto_principal,
      titulo: form.titulo,
      descricao: form.descricao,
      cta: form.cta,
    });
  }, [form]);

  const salvar = useCallback(async () => {
    if (!adId) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/ads/${adId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad_name: form.ad_name,
          texto_principal: form.texto_principal,
          titulo: form.titulo,
          descricao: form.descricao,
          cta: form.cta,
          link_campanha: form.link_campanha,
          campaign_name: form.campaign_name,
          campaign_id: form.campaign_id,
          ad_set_name: form.ad_set_name,
          ad_set_id: form.ad_set_id,
          ...(recriar && { _recriar: true }),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Erro ao salvar");
      aoSalvar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setSalvando(false);
    }
  }, [adId, form, aoSalvar, aoFechar]);

  const temBloqueios = diagnostico.bloqueios.length > 0;
  const temAvisos = diagnostico.avisos.length > 0;

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-3">
            <DialogTitle>{recriar ? "Editar e Recriar" : "Editar Anúncio"}</DialogTitle>
            <Badge variant="secondary" className="text-[10px]">
              {form.tipo === "image" ? "Imagem" : "Vídeo"}
            </Badge>
            {temBloqueios ? (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertTriangle className="size-3" />
                {diagnostico.bloqueios.length} bloqueio{diagnostico.bloqueios.length > 1 ? "s" : ""}
              </Badge>
            ) : temAvisos ? (
              <Badge variant="secondary" className="gap-1 text-[10px] border-amber-300 bg-amber-50 text-amber-800">
                <Info className="size-3" />
                {diagnostico.avisos.length} aviso{diagnostico.avisos.length > 1 ? "s" : ""}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 text-[10px] border-green-300 bg-green-50 text-green-800">
                Pronto para subir
              </Badge>
            )}
          </div>
          <DialogDescription>
            {recriar
              ? "O anúncio será apagado no Meta e recriado com os novos dados."
              : "Edite os campos do rascunho antes de subir para a Meta."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 flex gap-6">
        {/* ── Left: Form ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* ── Alertas ──────────────────────────────────────────── */}
          {temBloqueios && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-xs font-semibold text-destructive mb-1.5">Bloqueios</p>
              <ul className="space-y-1">
                {diagnostico.bloqueios.map((b) => (
                  <li key={b.codigo} className="text-xs text-destructive/90 flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-destructive" />
                    {b.mensagem}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {temAvisos && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 mb-1.5">Avisos</p>
              <ul className="space-y-1">
                {diagnostico.avisos.map((a) => (
                  <li key={a.codigo} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                    {a.mensagem}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Destino ─────────────────────────────────────────── */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Destino</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Campanha</label>
                {campanhas.length > 0 || carregandoCampanhas ? (
                  <SearchableSelect
                    options={campanhas.map((c) => ({ value: c.id, label: c.nome, status: c.status }))}
                    value={form.campaign_id}
                    onValueChange={handleCampanhaChange}
                    loading={carregandoCampanhas}
                    placeholder="Buscar campanha..."
                  />
                ) : (
                  <CampoReadOnly rotulo="" valor={form.campaign_name || "—"} />
                )}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Conjunto de anúncios <span className="text-muted-foreground/60 font-normal text-xs">(Ad Set)</span>
                </label>
                {adsets.length > 0 || carregandoAdsets ? (
                  <SearchableSelect
                    options={adsets.map((a) => ({ value: a.id, label: a.nome, status: a.status }))}
                    value={form.ad_set_id}
                    onValueChange={handleAdsetChange}
                    loading={carregandoAdsets}
                    placeholder="Buscar ad set..."
                  />
                ) : form.ad_set_name ? (
                  <CampoReadOnly rotulo="" valor={form.ad_set_name} subValor={form.ad_set_id} />
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    {form.campaign_id ? "Carregando..." : "Selecione uma campanha"}
                  </p>
                )}
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Nome do anúncio ───────────────────────────────────── */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Identificação</h4>
            <CampoTexto
              rotulo="Nome do anúncio"
              valor={form.ad_name}
              onChange={(v) => atualizar("ad_name", v)}
              erro={!form.ad_name.trim()}
              erroMsg="Obrigatório"
            />
          </section>

          <Separator />

          {/* ── Imagens (apenas para criativos estáticos) ─────────── */}
          {form.tipo === "image" && form.imageAssets && form.imageAssets.length > 0 && (
            <>
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Imagens ({form.imageAssets.length})
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {form.imageAssets.map((asset, i) => (
                    <a
                      key={`${asset.placement}-${i}`}
                      href={asset.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block overflow-hidden rounded-lg border bg-muted/30 transition-colors hover:border-ring"
                      title={asset.url}
                    >
                      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.url}
                          alt=""
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {rotuloPlacementImagem(asset.placement)}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </section>

              <Separator />
            </>
          )}

          {/* ── Conteúdo (copy) ────────────────────────────────────── */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Conteúdo</h4>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Legenda <span className="text-muted-foreground/60 font-normal text-xs">(texto principal)</span></label>
                  <ContadorCaracteres valor={form.texto_principal} limite={125} />
                </div>
                <textarea
                  value={form.texto_principal}
                  onChange={(e) => atualizar("texto_principal", e.target.value)}
                  rows={3}
                  placeholder="Legenda do anúncio..."
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <CampoTexto
                  rotulo="Título"
                  valor={form.titulo}
                  onChange={(v) => atualizar("titulo", v)}
                  placeholder="Título visível ao cliente"
                  contador={40}
                />
                <CampoTexto
                  rotulo="Descrição"
                  valor={form.descricao}
                  onChange={(v) => atualizar("descricao", v)}
                  placeholder="Descrição curta"
                  contador={30}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">CTA</label>
                  <Select value={form.cta} onValueChange={(v) => atualizar("cta", v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CTA_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <CampoTexto
                  rotulo="Link da campanha"
                  valor={form.link_campanha ?? ""}
                  onChange={(v) => atualizar("link_campanha", v)}
                  placeholder="https://www.evino.com.br/..."
                />
              </div>
            </div>
          </section>

          {/* ── Erro de save ───────────────────────────────────────── */}
          {erro && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
              {erro}
            </div>
          )}

          {/* ── Actions ────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              {temBloqueios
                ? "Corrija os bloqueios antes de subir."
                : temAvisos
                  ? "Pode subir, mas revise os avisos."
                  : "Pronto para subir."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={aoFechar} size="sm">Cancelar</Button>
              <Button onClick={salvar} disabled={salvando} size="sm">
                {salvando && <Loader2 className="size-3.5 animate-spin" />}
                {recriar ? "Salvar e Recriar" : "Salvar"}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Right: Preview ─────────────────────────────────────── */}
        <div className="hidden sm:block w-[280px] shrink-0">
          <div className="sticky top-0">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Preview</h4>
            <PreviewAnuncio
              textoPrincipal={form.texto_principal}
              titulo={form.titulo}
              descricao={form.descricao}
              cta={form.cta}
              linkCampanha={form.link_campanha}
              thumbnailLink={form.thumbnailLink}
              imageAssets={form.imageAssets}
              tipo={form.tipo}
            />
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CampoReadOnly({
  rotulo,
  valor,
  subValor,
}: {
  rotulo: string;
  valor: string;
  subValor?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className="text-sm truncate" title={valor}>{valor || "—"}</p>
      {subValor && (
        <p className="text-[10px] text-muted-foreground/70 truncate" title={subValor}>{subValor}</p>
      )}
    </div>
  );
}

function CampoTexto({
  rotulo,
  valor,
  onChange,
  placeholder,
  contador,
  erro,
  erroMsg,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  contador?: number;
  erro?: boolean;
  erroMsg?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{rotulo}</label>
        {contador && <ContadorCaracteres valor={valor} limite={contador} />}
      </div>
      <input
        type="text"
        value={valor}
        maxLength={contador}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring/20 ${
          erro ? "border-destructive focus:border-destructive" : "border-input focus:border-ring"
        }`}
      />
      {erro && erroMsg && (
        <p className="mt-0.5 text-[10px] text-destructive">{erroMsg}</p>
      )}
    </div>
  );
}

function ContadorCaracteres({ valor, limite }: { valor: string; limite: number }) {
  const len = valor.trim().length;
  const excedeu = len > limite;
  return (
    <span className={`text-[10px] tabular-nums ${excedeu ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
      {len}/{limite}
    </span>
  );
}

function PreviewAnuncio({
  textoPrincipal,
  titulo,
  descricao,
  cta,
  linkCampanha,
  thumbnailLink,
  imageAssets,
  tipo,
}: {
  textoPrincipal: string;
  titulo: string;
  descricao: string;
  cta: string;
  linkCampanha: string;
  thumbnailLink?: string;
  imageAssets?: AssetImagemValidavel[];
  tipo?: "video" | "image";
}) {
  // For image ads, prefer the feed image (or first available) for the preview
  const imagemPreview =
    tipo === "image" && imageAssets && imageAssets.length > 0
      ? (imageAssets.find((a) => a.placement === "feed") ?? imageAssets[0]).url
      : thumbnailLink;
  const ctaLabel = CTA_OPTIONS.find((o) => o.value === cta)?.label ?? cta;

  let dominio = "";
  try {
    dominio = new URL(linkCampanha).hostname.replace("www.", "");
  } catch { /* ignore */ }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden text-[13px]">
      {/* Header simulando página */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400" />
        <div>
          <p className="text-xs font-semibold text-slate-900 leading-tight">Marca</p>
          <p className="text-[10px] text-slate-400">Patrocinado</p>
        </div>
      </div>

      {/* Texto principal */}
      {textoPrincipal ? (
        <p className="px-3 py-2 text-slate-700 text-xs leading-relaxed whitespace-pre-line">
          {textoPrincipal}
        </p>
      ) : (
        <p className="px-3 py-2 text-slate-300 text-xs italic">Sem texto principal</p>
      )}

      {/* Media */}
      <div className="relative aspect-square bg-slate-100 flex items-center justify-center">
        {imagemPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagemPreview}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-300">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            <span className="text-[10px]">{tipo === "image" ? "Imagem" : "Vídeo"}</span>
          </div>
        )}
      </div>

      {/* Link + CTA bar */}
      <div className="border-t bg-slate-50 px-3 py-2">
        {dominio && (
          <p className="text-[10px] text-slate-400 uppercase tracking-wider truncate">{dominio}</p>
        )}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">
              {titulo || <span className="text-slate-300 font-normal italic">Sem título</span>}
            </p>
            {descricao && (
              <p className="text-[10px] text-slate-500 truncate">{descricao}</p>
            )}
          </div>
          {linkCampanha ? (
            <a
              href={linkCampanha}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md bg-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-300"
            >
              {ctaLabel}
            </a>
          ) : (
            <span className="shrink-0 rounded-md bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-300">
              {ctaLabel}
            </span>
          )}
        </div>
      </div>

      {/* Clickable link test */}
      {linkCampanha && (
        <div className="border-t px-3 py-1.5">
          <a
            href={linkCampanha}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-600 hover:underline truncate block"
            title={linkCampanha}
          >
            Testar link: {linkCampanha}
          </a>
        </div>
      )}
    </div>
  );
}
