"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Calendar,
  Copy,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Info,
  Link2,
  MousePointerClick,
  Video,
} from "lucide-react";
import { CTA_OPTIONS } from "@/lib/constants";
import { rotuloPlacementImagem } from "@/lib/ad-media";
import type { LinhaComStatus } from "@/components/tabela-pendentes";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DialogDetalhesAnuncioProps {
  aberto: boolean;
  aoFechar: () => void;
  linha: LinhaComStatus | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const META_STATUS_STYLES: Record<string, { className: string; label: string }> = {
  ACTIVE: { className: "border-green-200 bg-green-50 text-green-700", label: "Active" },
  PAUSED: { className: "border-gray-200 bg-gray-50 text-gray-600", label: "Paused" },
  DELETED: { className: "border-red-200 bg-red-50 text-red-700", label: "Deleted" },
  DISAPPROVED: { className: "border-red-200 bg-red-50 text-red-700", label: "Disapproved" },
  PENDING_REVIEW: { className: "border-yellow-200 bg-yellow-50 text-yellow-700", label: "Em revisão" },
  WITH_ISSUES: { className: "border-amber-200 bg-amber-50 text-amber-700", label: "Com problemas" },
  CAMPAIGN_PAUSED: { className: "border-gray-200 bg-gray-50 text-gray-600", label: "Campanha pausada" },
  ADSET_PAUSED: { className: "border-gray-200 bg-gray-50 text-gray-600", label: "AdSet pausado" },
};

function copiarTexto(texto: string) {
  navigator.clipboard.writeText(texto).catch(() => {});
}

function extrairDriveFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DialogDetalhesAnuncio({
  aberto,
  aoFechar,
  linha,
}: DialogDetalhesAnuncioProps) {
  if (!linha) return null;

  const ctaLabel = CTA_OPTIONS.find((o) => o.value === linha.cta)?.label ?? linha.cta;
  const isImage = linha.tipo === "image";
  const imageAssets = linha.imageAssets ?? [];

  const adsManagerUrl = linha.adIdCriado
    ? linha.accountId
      ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${linha.accountId}&selected_ad_ids=${linha.adIdCriado}`
      : `https://adsmanager.facebook.com/adsmanager/manage/ads?selected_ad_ids=${linha.adIdCriado}`
    : null;

  const videoFileId = !isImage && linha.linkVideo ? extrairDriveFileId(linha.linkVideo) : null;

  let dominio = "";
  try {
    const url = linha.linkCampanha || linha.linkAnuncio;
    if (url) dominio = new URL(url).hostname.replace("www.", "");
  } catch { /* ignore */ }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-3 flex-wrap">
            <DialogTitle className="text-lg">Detalhes do Anúncio</DialogTitle>
            <Badge variant="secondary" className="text-[10px]">
              {isImage ? (
                <><ImageIcon className="size-3 mr-1" />Imagem</>
              ) : (
                <><Video className="size-3 mr-1" />Vídeo</>
              )}
            </Badge>
            <StatusBadge status={linha.statusProcessamento} />
            {linha.metaEffectiveStatus && (
              <MetaStatusBadge status={linha.metaEffectiveStatus} />
            )}
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 flex gap-6">
          {/* ── Left: Details ──────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* ── Alerts ─────────────────────────────────────── */}
            {linha.mensagemErro && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-xs font-semibold text-destructive mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5" />
                  Erro
                </p>
                <p className="text-xs text-destructive/90">{linha.mensagemErro}</p>
              </div>
            )}

            {linha.bloqueiosMeta && linha.bloqueiosMeta.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-xs font-semibold text-destructive mb-1.5">Bloqueios Meta</p>
                <ul className="space-y-1">
                  {linha.bloqueiosMeta.map((b, i) => (
                    <li key={i} className="text-xs text-destructive/90 flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-destructive" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {linha.avisosMeta && linha.avisosMeta.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
                <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                  <Info className="size-3.5" />
                  Avisos
                </p>
                <ul className="space-y-1">
                  {linha.avisosMeta.map((a, i) => (
                    <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Ad Name ────────────────────────────────────── */}
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Nome do anúncio
              </h4>
              <div className="group flex items-center gap-2">
                <p className="text-sm font-medium break-all">{linha.adName || "—"}</p>
                {linha.adName && (
                  <button
                    type="button"
                    onClick={() => copiarTexto(linha.adName)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                    title="Copiar"
                  >
                    <Copy className="size-3.5" />
                  </button>
                )}
              </div>
              {linha.adIdCriado && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">
                  Meta Ad ID: {linha.adIdCriado}
                </p>
              )}
            </section>

            <Separator />

            {/* ── Destino ────────────────────────────────────── */}
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Destino
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Campanha" valor={linha.campaign || "—"} sub={linha.campaignId} />
                <Campo rotulo="Conjunto de Anúncios" valor={linha.adSet || "—"} sub={linha.adSetId} />
              </div>
            </section>

            <Separator />

            {/* ── Media ───────────────────────────────────────── */}
            {isImage && imageAssets.length > 0 && (
              <>
                <section>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Imagens ({imageAssets.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {imageAssets.map((asset, i) => (
                      <a
                        key={`${asset.placement}-${i}`}
                        href={asset.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block overflow-hidden rounded-lg border bg-muted/30 transition-colors hover:border-ring"
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

            {!isImage && linha.linkVideo && (() => {
              const fileId = extrairDriveFileId(linha.linkVideo);
              return (
                <>
                  <section>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Vídeo
                    </h4>
                    {fileId ? (
                      <video
                        src={`/api/drive/stream/${fileId}`}
                        controls
                        className="w-full max-h-[280px] rounded-lg border bg-black"
                        preload="metadata"
                      />
                    ) : (
                      <a
                        href={linha.linkVideo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline break-all"
                      >
                        {linha.linkVideo}
                      </a>
                    )}
                    <a
                      href={linha.linkVideo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-muted-foreground hover:underline mt-1.5 block truncate"
                    >
                      {linha.linkVideo}
                    </a>
                  </section>
                  <Separator />
                </>
              );
            })()}

            {/* ── Conteúdo ───────────────────────────────────── */}
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Conteúdo
              </h4>
              <div className="space-y-3">
                <CampoTextoLongo
                  rotulo="Texto principal"
                  valor={linha.textoPrincipal}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Título" valor={linha.titulo || "—"} />
                  <Campo rotulo="Descrição" valor={linha.descricao || "—"} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">CTA</p>
                    <div className="flex items-center gap-1.5">
                      <MousePointerClick className="size-3.5 text-muted-foreground" />
                      <span className="text-sm">{ctaLabel}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Link</p>
                    {(linha.linkCampanha || linha.linkAnuncio) ? (
                      <a
                        href={linha.linkCampanha || linha.linkAnuncio}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1 break-all"
                      >
                        <Link2 className="size-3.5 shrink-0" />
                        {linha.linkCampanha || linha.linkAnuncio}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* ── Metadata ───────────────────────────────────── */}
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Informações
              </h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="size-3.5" />
                  {linha.data || "—"}
                </div>
                {linha.accountId && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Globe className="size-3.5" />
                    <span className="font-mono text-xs">act_{linha.accountId}</span>
                  </div>
                )}
              </div>
            </section>

            {/* ── Footer ─────────────────────────────────────── */}
            <div className="flex items-center justify-between pt-2">
              <div>
                {adsManagerUrl && (
                  <a
                    href={adsManagerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    Ver no Ads Manager
                  </a>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={aoFechar}>
                Fechar
              </Button>
            </div>
          </div>

          {/* ── Right: Preview ─────────────────────────────── */}
          <div className="hidden sm:block w-[280px] shrink-0">
            <div className="sticky top-0">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Preview
              </h4>
              <PreviewAnuncio
                textoPrincipal={linha.textoPrincipal}
                titulo={linha.titulo}
                descricao={linha.descricao}
                cta={ctaLabel}
                linkCampanha={linha.linkCampanha || linha.linkAnuncio}
                thumbnailLink={linha.thumbnailLink}
                imageAssets={imageAssets}
                tipo={linha.tipo}
                dominio={dominio}
                videoFileId={videoFileId}
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { className: string; label: string }> = {
    pendente: { className: "", label: "Pendente" },
    processando: { className: "animate-pulse", label: "Processando..." },
    concluido: { className: "border-green-200 bg-green-50 text-green-700", label: "Concluído" },
    erro: { className: "bg-destructive text-destructive-foreground", label: "Erro" },
  };
  const s = map[status] ?? { className: "", label: status };
  return (
    <Badge variant="secondary" className={`gap-1.5 text-[10px] ${s.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        status === "concluido" ? "bg-green-500"
        : status === "erro" ? "bg-red-300"
        : status === "processando" ? "bg-blue-400"
        : "bg-yellow-500"
      }`} />
      {s.label}
    </Badge>
  );
}

function MetaStatusBadge({ status }: { status: string }) {
  const style = META_STATUS_STYLES[status] ?? {
    className: "border-gray-200 bg-gray-50 text-gray-500",
    label: status,
  };
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] ${style.className}`}>
      <Globe className="size-3" />
      {style.label}
    </Badge>
  );
}

function Campo({
  rotulo,
  valor,
  sub,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">
        {rotulo}
      </p>
      <p className="text-sm" title={valor}>{valor}</p>
      {sub && (
        <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}

function CampoTextoLongo({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: string;
}) {
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-0.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {rotulo}
        </p>
        {valor && (
          <button
            type="button"
            onClick={() => copiarTexto(valor)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            title="Copiar"
          >
            <Copy className="size-3" />
          </button>
        )}
      </div>
      <p className="text-sm whitespace-pre-line leading-relaxed rounded-lg border bg-muted/20 px-3 py-2">
        {valor || <span className="text-muted-foreground italic">Vazio</span>}
      </p>
    </div>
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
  dominio,
  videoFileId,
}: {
  textoPrincipal: string;
  titulo: string;
  descricao: string;
  cta: string;
  linkCampanha: string;
  thumbnailLink?: string;
  imageAssets?: { placement: string; url: string }[];
  tipo?: "video" | "image";
  dominio: string;
  videoFileId?: string | null;
}) {
  const imagemPreview =
    tipo === "image" && imageAssets && imageAssets.length > 0
      ? (imageAssets.find((a) => a.placement === "feed") ?? imageAssets[0]).url
      : thumbnailLink;

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden text-[13px]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400" />
        <div>
          <p className="text-xs font-semibold text-slate-900 leading-tight">Marca</p>
          <p className="text-[10px] text-slate-400">Patrocinado</p>
        </div>
      </div>

      {/* Primary text */}
      {textoPrincipal ? (
        <p className="px-3 py-2 text-slate-700 text-xs leading-relaxed whitespace-pre-line">
          {textoPrincipal}
        </p>
      ) : (
        <p className="px-3 py-2 text-slate-300 text-xs italic">Sem texto principal</p>
      )}

      {/* Media */}
      <div className="relative aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
        {videoFileId ? (
          <video
            src={`/api/drive/stream/${videoFileId}`}
            controls
            className="h-full w-full object-cover"
            preload="metadata"
          />
        ) : imagemPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagemPreview}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-300">
            {tipo === "image" ? (
              <ImageIcon className="h-10 w-10" />
            ) : (
              <Video className="h-10 w-10" />
            )}
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
          <span className="shrink-0 rounded-md bg-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700">
            {cta}
          </span>
        </div>
      </div>

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
