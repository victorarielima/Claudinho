"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LinhaAnuncio } from "@/lib/sheets";
import { rotuloPlacementImagem } from "@/lib/ad-media";
import { interpretarErroMeta } from "@/lib/erros-meta";

export type StatusProcessamento =
  | "pendente"
  | "processando"
  | "concluido"
  | "erro";

export type StatusVideo =
  | "verificando"
  | "acessivel"
  | "inacessivel"
  | "nao_verificado";

export interface LinhaComStatus extends LinhaAnuncio {
  statusProcessamento: StatusProcessamento;
  adIdCriado?: string;
  mensagemErro?: string;
  statusVideo: StatusVideo;
  erroVideo?: string;
  nomeArquivoVideo?: string;
  thumbnailLink?: string;
  // Campos novos (Supabase)
  adId?: string;
  tipo?: "video" | "image";
  imageAssets?: { placement: string; url: string }[];
  linkCampanha?: string;
  linkAux?: string;
  prontoMeta?: boolean;
  bloqueiosMeta?: string[];
  avisosMeta?: string[];
  metaEffectiveStatus?: string | null;
}

interface TabelaPendentesProps {
  linhas: LinhaComStatus[];
  carregando: boolean;
  aoSubir: (linha: LinhaComStatus) => void;
  aoEditar?: (linha: LinhaComStatus) => void;
  aoVerDetalhes?: (linha: LinhaComStatus) => void;
  aoDuplicar?: (linha: LinhaComStatus) => void;
  aoExcluir?: (linha: LinhaComStatus) => void;
  aoExcluirMeta?: (linha: LinhaComStatus) => void;
  aoRenomear?: (adId: string, novoNome: string) => void;
  aoEditarCampo?: (adId: string, campo: string, valor: string) => void;
  processando: boolean;
  aoRevalidarVideo?: (linha: LinhaComStatus) => void;
  serviceAccountEmail?: string;
  selecionados: Set<number>;
  aoAlternarSelecao: (indiceLinha: number) => void;
  compacto?: boolean;
  aoMostrarDetalhes?: (indiceLinha?: number) => void;
  destaqueIndice?: number | null;
}

function extrairFileIdCliente(driveUrl: string): string | null {
  const matchFile = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile) return matchFile[1];
  const matchId = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId) return matchId[1];
  return null;
}

function StatusBadge({ status }: { status: StatusProcessamento }) {
  switch (status) {
    case "pendente":
      return (
        <Badge variant="secondary" className="gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
          Pendente
        </Badge>
      );
    case "processando":
      return (
        <Badge variant="default" className="gap-1.5 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          Processando...
        </Badge>
      );
    case "concluido":
      return (
        <Badge
          variant="secondary"
          className="gap-1.5 border-green-200 bg-green-50 text-green-700"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Concluído
        </Badge>
      );
    case "erro":
      return (
        <Badge variant="destructive" className="gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-300" />
          Erro
        </Badge>
      );
  }
}

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

function MetaStatusBadge({ status }: { status: string }) {
  const style = META_STATUS_STYLES[status] ?? {
    className: "border-gray-200 bg-gray-50 text-gray-500",
    label: status,
  };
  return (
    <Badge variant="outline" className={`gap-1 text-xs ${style.className}`}>
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.732-3.558" />
      </svg>
      {style.label}
    </Badge>
  );
}

function DetalheItem({
  rotulo,
  valor,
  subValor,
}: {
  rotulo: string;
  valor: string;
  subValor?: string;
}) {
  if (!valor) return null;
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </span>
      <span className="text-sm truncate" title={valor}>{valor}</span>
      {subValor && (
        <span className="text-[10px] text-muted-foreground/70 truncate" title={subValor}>
          {subValor}
        </span>
      )}
    </div>
  );
}

function VideoBadge({
  status,
  nomeArquivo,
  onClick,
}: {
  status: StatusVideo;
  nomeArquivo?: string;
  onClick?: () => void;
}) {
  switch (status) {
    case "verificando":
      return (
        <Badge variant="secondary" className="gap-1.5 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          Verificando vídeo...
        </Badge>
      );
    case "acessivel":
      return (
        <Badge
          variant="secondary"
          className="gap-1.5 border-green-200 bg-green-50 text-green-700 cursor-pointer hover:bg-green-100 transition-colors"
          onClick={onClick}
        >
          <svg
            className="h-3 w-3"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          {nomeArquivo ?? "Vídeo acessível"}
        </Badge>
      );
    case "inacessivel":
      return (
        <Badge variant="destructive" className="gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-300" />
          Vídeo inacessível
        </Badge>
      );
    case "nao_verificado":
      return (
        <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
          Não verificado
        </Badge>
      );
  }
}

function PreviewVideoDialog({
  aberto,
  aoFechar,
  linkVideo,
  nomeArquivo,
}: {
  aberto: boolean;
  aoFechar: () => void;
  linkVideo: string;
  nomeArquivo?: string;
}) {
  const fileId = extrairFileIdCliente(linkVideo);

  if (!fileId) return null;

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="text-base font-semibold">
            {nomeArquivo ?? "Preview do Vídeo"}
          </DialogTitle>
        </DialogHeader>
        <div className="relative w-full bg-black" style={{ aspectRatio: "16/9" }}>
          <iframe
            src={`https://drive.google.com/file/d/${fileId}/preview`}
            className="absolute inset-0 h-full w-full"
            allow="autoplay"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusDot({ status }: { status: StatusProcessamento }) {
  const cores: Record<StatusProcessamento, string> = {
    pendente: "bg-yellow-500",
    processando: "bg-blue-400 animate-pulse",
    concluido: "bg-green-500",
    erro: "bg-red-500",
  };
  const rotulos: Record<StatusProcessamento, string> = {
    pendente: "Pendente",
    processando: "Processando",
    concluido: "Concluído",
    erro: "Erro",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={rotulos[status]}>
      <span className={`h-2 w-2 rounded-full ${cores[status]}`} />
      {rotulos[status]}
    </span>
  );
}

function BotaoErroMeta({ mensagem, adName }: { mensagem: string; adName: string }) {
  const [aberto, setAberto] = useState(false);
  const erro = interpretarErroMeta(mensagem);
  if (!erro) return null;

  const tooltip = `${erro.tipo}\n\n${erro.explicacao}\n\nClique para ver o erro original do Meta`;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAberto(true);
        }}
        title={tooltip}
        aria-label={`Erro: ${erro.tipo}. Clique para detalhes.`}
        className="group mt-0.5 w-full max-w-[300px] text-left text-[10px] text-destructive hover:text-destructive/80 transition-colors"
      >
        <span className="inline-flex items-center gap-1 font-semibold underline decoration-dotted underline-offset-2">
          <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {erro.tipo}
        </span>
        <span className="block truncate text-muted-foreground group-hover:text-destructive/70">
          {erro.explicacao}
        </span>
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-destructive/15 px-2 py-1 text-xs font-bold uppercase tracking-wide text-destructive">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {erro.tipo}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Anúncio</p>
              <p className="text-sm font-medium break-all">{adName}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">O que aconteceu</p>
              <p className="text-sm leading-relaxed">{erro.explicacao}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Mensagem original do Meta
              </p>
              <pre className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs font-mono whitespace-pre-wrap break-words text-destructive select-all">
                {erro.original}
              </pre>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Clique no texto acima para selecionar e copiar.
              </p>
            </div>
            {!erro.conhecido && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Esse erro ainda não está catalogado. Compartilhe a mensagem
                original com o time para adicionarmos ao classificador em
                <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono">src/lib/erros-meta.ts</code>.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NomeEditavel({
  valor,
  aoSalvar,
  className = "",
  limite,
}: {
  valor: string;
  aoSalvar: (novoValor: string) => void;
  className?: string;
  /** Limite de caracteres (aplica maxLength + mostra contador). */
  limite?: number;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTexto(valor);
  }, [valor]);

  useEffect(() => {
    if (editando) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editando]);

  const confirmar = useCallback(() => {
    const trimmed = texto.trim();
    if (trimmed && trimmed !== valor) {
      aoSalvar(trimmed);
    } else {
      setTexto(valor);
    }
    setEditando(false);
  }, [texto, valor, aoSalvar]);

  if (editando) {
    const len = texto.trim().length;
    const excedeu = limite ? len > limite : false;
    return (
      <div className="relative w-full">
        <input
          ref={inputRef}
          value={texto}
          maxLength={limite}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmar();
            if (e.key === "Escape") {
              setTexto(valor);
              setEditando(false);
            }
          }}
          className={`w-full rounded border border-primary/40 bg-background px-1.5 py-0.5 ${limite ? "pr-10" : ""} text-sm font-medium outline-none ring-1 ring-primary/20 ${className}`}
        />
        {limite != null && (
          <span
            className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] tabular-nums ${excedeu ? "text-amber-600 font-medium" : "text-muted-foreground"}`}
          >
            {len}/{limite}
          </span>
        )}
      </div>
    );
  }

  return (
    <span
      className={`font-medium truncate cursor-text hover:bg-muted/50 rounded px-1 -mx-1 transition-colors ${className}`}
      title={`${valor} (clique para editar)`}
      onClick={() => setEditando(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "F2") setEditando(true);
      }}
    >
      {valor}
    </span>
  );
}

function TabelaCompacta({
  linhas,
  aoSubir,
  aoEditar,
  aoVerDetalhes,
  aoDuplicar,
  aoExcluir,
  aoExcluirMeta,
  aoRenomear,
  aoEditarCampo,
  processando,
  selecionados,
  aoAlternarSelecao,
  setPreviewAberto,
  aoMostrarDetalhes,
}: {
  linhas: LinhaComStatus[];
  aoSubir: (linha: LinhaComStatus) => void;
  aoEditar?: (linha: LinhaComStatus) => void;
  aoVerDetalhes?: (linha: LinhaComStatus) => void;
  aoDuplicar?: (linha: LinhaComStatus) => void;
  aoExcluir?: (linha: LinhaComStatus) => void;
  aoExcluirMeta?: (linha: LinhaComStatus) => void;
  aoRenomear?: (adId: string, novoNome: string) => void;
  aoEditarCampo?: (adId: string, campo: string, valor: string) => void;
  processando: boolean;
  selecionados: Set<number>;
  aoAlternarSelecao: (indiceLinha: number) => void;
  setPreviewAberto: (indiceLinha: number) => void;
  aoMostrarDetalhes: (indiceLinha?: number) => void;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-9 px-2 py-2.5" />
            <th className="w-20 px-2 py-2.5 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-2 py-2.5 text-left font-medium text-muted-foreground">Nome do Anúncio</th>
            <th className="w-[20%] px-2 py-2.5 text-left font-medium text-muted-foreground">Título</th>
            <th className="w-20 px-2 py-2.5 text-left font-medium text-muted-foreground">Data</th>
            <th className="w-10 px-2 py-2.5 text-center font-medium text-muted-foreground" title="Link da campanha">Link</th>
            <th className="w-36 px-2 py-2.5 text-right font-medium text-muted-foreground">Ação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const concluido = linha.statusProcessamento === "concluido";
            const temErro = linha.statusProcessamento === "erro";
            const processandoLinha = linha.statusProcessamento === "processando";
            const isImage = linha.tipo === "image";
            const videoInacessivel = !isImage && linha.statusVideo === "inacessivel";
            const bloqueada = linha.prontoMeta === false;
            const totalAvisos = linha.avisosMeta?.length ?? 0;
            const totalBloqueios = linha.bloqueiosMeta?.length ?? 0;
            const temAlertas = videoInacessivel || bloqueada || totalAvisos > 0 || totalBloqueios > 0;
            const selecionada = selecionados.has(linha.indiceLinha);
            const podeSelecionar = !concluido && !processandoLinha && !videoInacessivel && !bloqueada;
            const podeEditar = (linha.statusProcessamento === "pendente" || linha.statusProcessamento === "erro") && linha.adId;

            return (
              <tr
                key={linha.indiceLinha}
                className={`border-b last:border-b-0 transition-colors ${concluido
                  ? "bg-green-50/30"
                  : temErro
                    ? "bg-destructive/5"
                    : temAlertas
                      ? "bg-amber-50/40"
                    : selecionada
                      ? "bg-primary/5"
                      : "hover:bg-muted/30"
                  }`}
              >
                <td className="px-2 py-2">
                  {podeSelecionar && (
                    <Checkbox
                      checked={selecionada}
                      onCheckedChange={() => aoAlternarSelecao(linha.indiceLinha)}
                      aria-label={`Selecionar ${linha.adName}`}
                    />
                  )}
                </td>
                <td className="px-2 py-2 whitespace-nowrap w-[110px] max-w-[110px]" title={(temErro || linha.mensagemErro?.startsWith("[AVISO")) && linha.mensagemErro ? linha.mensagemErro : linha.metaEffectiveStatus ? `Meta: ${linha.metaEffectiveStatus}` : undefined}>
                  <div className="flex items-center gap-1 overflow-hidden">
                    <StatusDot status={linha.statusProcessamento} />
                    {linha.metaEffectiveStatus && (
                      <span className={`text-[9px] font-medium truncate ${
                        linha.metaEffectiveStatus === "ACTIVE" ? "text-green-600"
                        : linha.metaEffectiveStatus === "DELETED" || linha.metaEffectiveStatus === "DISAPPROVED" ? "text-red-600"
                        : "text-gray-500"
                      }`}>
                        {META_STATUS_STYLES[linha.metaEffectiveStatus]?.label ?? linha.metaEffectiveStatus}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {isImage ? "IMG" : "VID"}
                    </span>
                    {aoRenomear && podeEditar ? (
                      <NomeEditavel
                        valor={linha.adName}
                        aoSalvar={(novoNome) => aoRenomear(linha.adId!, novoNome)}
                      />
                    ) : (
                      <span className="font-medium truncate" title={linha.adName}>
                        {linha.adName}
                      </span>
                    )}
                    {temAlertas && (
                      <button
                        type="button"
                        onClick={() => aoMostrarDetalhes(linha.indiceLinha)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 transition-colors hover:bg-amber-100"
                        title="Ver detalhes deste anúncio"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {videoInacessivel
                          ? "Video sem acesso"
                          : totalBloqueios > 0
                            ? `${totalBloqueios} bloqueio${totalBloqueios > 1 ? "s" : ""}`
                            : `${totalAvisos} aviso${totalAvisos > 1 ? "s" : ""}`}
                      </button>
                    )}
                  </div>
                  {(temErro || linha.mensagemErro?.startsWith("[AVISO")) && linha.mensagemErro && (
                    <BotaoErroMeta mensagem={linha.mensagemErro} adName={linha.adName} />
                  )}
                </td>
                <td className="px-2 py-2">
                  {aoEditarCampo && podeEditar ? (
                    <NomeEditavel
                      valor={linha.titulo}
                      aoSalvar={(novoTitulo) => aoEditarCampo(linha.adId!, "titulo", novoTitulo)}
                      className="text-xs text-muted-foreground"
                      limite={40}
                    />
                  ) : (
                    <span className="truncate block text-muted-foreground text-xs" title={linha.titulo}>{linha.titulo}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <span className="text-[11px] text-muted-foreground">{linha.data}</span>
                </td>
                <td className="px-2 py-2 text-center">
                  {linha.linkAnuncio ? (
                    <a
                      href={linha.linkAnuncio}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
                      title={linha.linkAnuncio}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-muted-foreground/30">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {concluido ? (
                      <div className="flex items-center gap-1">
                        {aoVerDetalhes && (
                          <button
                            onClick={() => aoVerDetalhes(linha)}
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium transition-all hover:bg-accent active:scale-[0.98]"
                            title="Ver detalhes"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                          </button>
                        )}
                        {aoEditar && (
                          <button
                            onClick={() => aoEditar(linha)}
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium transition-all hover:bg-accent active:scale-[0.98]"
                            title="Editar e recriar no Meta"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                            </svg>
                          </button>
                        )}
                        {aoDuplicar && (
                          <button
                            onClick={() => aoDuplicar(linha)}
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium transition-all hover:bg-accent active:scale-[0.98]"
                            title="Duplicar para outra campanha"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                            </svg>
                          </button>
                        )}
                        <a
                          href={
                            linha.accountId
                              ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${linha.accountId}&filter_set=SEARCH_BY_ADGROUP_IDS-STRING_SET%1EANY%1E[%22${linha.adIdCriado}%22]`
                              : `https://adsmanager.facebook.com/adsmanager/manage/ads?filter_set=SEARCH_BY_ADGROUP_IDS-STRING_SET%1EANY%1E[%22${linha.adIdCriado}%22]`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-900 transition-colors"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                          Ads
                        </a>
                      </div>
                    ) : (
                      <>
                        {podeEditar && aoExcluir && (
                          <button
                            onClick={() => aoExcluir(linha)}
                            disabled={processando || processandoLinha}
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium text-destructive transition-all hover:bg-destructive/10 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                            title="Excluir rascunho"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        )}
                        {podeEditar && aoEditar && (
                          <button
                            onClick={() => aoEditar(linha)}
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium transition-all hover:bg-accent active:scale-[0.98]"
                            title="Editar rascunho"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => aoSubir(linha)}
                          disabled={processando || processandoLinha || videoInacessivel || bloqueada}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                        >
                          {processandoLinha ? (
                            <>
                              <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-primary-foreground/30 border-t-primary-foreground" />
                              ...
                            </>
                          ) : temErro ? (
                            "Tentar"
                          ) : bloqueada ? (
                            "Corrigir"
                          ) : (
                            "Subir"
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TabelaPendentes({
  linhas,
  carregando,
  aoSubir,
  aoEditar,
  aoVerDetalhes,
  aoDuplicar,
  aoExcluir,
  aoExcluirMeta,
  aoRenomear,
  aoEditarCampo,
  processando,
  aoRevalidarVideo,
  serviceAccountEmail,
  selecionados,
  aoAlternarSelecao,
  compacto = false,
  aoMostrarDetalhes,
  destaqueIndice,
}: TabelaPendentesProps) {
  const [previewAberto, setPreviewAberto] = useState<number | null>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Scroll + highlight when switching to detailed view targeting a specific ad
  useEffect(() => {
    if (compacto || !destaqueIndice) return;
    // Small delay to let the detailed view render
    const timer = setTimeout(() => {
      const el = cardRefs.current.get(destaqueIndice);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary/50");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2000);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [compacto, destaqueIndice]);

  if (carregando) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-64" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex flex-col gap-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        Nenhum anúncio encontrado com os filtros atuais.
      </div>
    );
  }

  const linhaPreview = linhas.find((l) => l.indiceLinha === previewAberto);

  return (
    <>
      {linhaPreview && (
        <PreviewVideoDialog
          aberto={true}
          aoFechar={() => setPreviewAberto(null)}
          linkVideo={linhaPreview.linkVideo}
          nomeArquivo={linhaPreview.nomeArquivoVideo}
        />
      )}

      {compacto ? (
        <TabelaCompacta
          linhas={linhas}
          aoSubir={aoSubir}
          aoEditar={aoEditar}
          aoExcluir={aoExcluir}
          aoExcluirMeta={aoExcluirMeta}
          aoRenomear={aoRenomear}
          aoEditarCampo={aoEditarCampo}
          processando={processando}
          selecionados={selecionados}
          aoAlternarSelecao={aoAlternarSelecao}
          setPreviewAberto={setPreviewAberto}
          aoVerDetalhes={aoVerDetalhes}
          aoDuplicar={aoDuplicar}
          aoMostrarDetalhes={aoMostrarDetalhes ?? (() => {})}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {linhas.map((linha) => {
            const concluido = linha.statusProcessamento === "concluido";
            const temErro = linha.statusProcessamento === "erro";
            const processandoLinha = linha.statusProcessamento === "processando";
            const isImage = linha.tipo === "image";
            const videoInacessivel = !isImage && linha.statusVideo === "inacessivel";
            const videoAcessivel = !isImage && linha.statusVideo === "acessivel";
            const bloqueada = linha.prontoMeta === false;

            const selecionada = selecionados.has(linha.indiceLinha);
            const podeSelecionar =
              !concluido && !processandoLinha && !videoInacessivel && !bloqueada;

            return (
              <Card
                key={linha.indiceLinha}
                ref={(el) => {
                  if (el) cardRefs.current.set(linha.indiceLinha, el);
                  else cardRefs.current.delete(linha.indiceLinha);
                }}
                className={`transition-shadow duration-500 ${
                  concluido
                    ? "border-green-200 bg-green-50/30"
                    : temErro
                      ? "border-destructive/30 bg-destructive/5"
                      : selecionada
                        ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                        : ""
                }`}
              >
                <CardContent className="p-6">
                  <div className="flex gap-4">
                    {/* Checkbox */}
                    {podeSelecionar && (
                      <div className="pt-0.5 shrink-0">
                        <Checkbox
                          checked={selecionada}
                          onCheckedChange={() =>
                            aoAlternarSelecao(linha.indiceLinha)
                          }
                          aria-label={`Selecionar ${linha.adName}`}
                        />
                      </div>
                    )}

                    {/* Thumbnail */}
                    <div className="relative shrink-0 w-14 h-14 overflow-hidden rounded-md border border-border bg-black/5 flex items-center justify-center">
                      {isImage && linha.imageAssets && linha.imageAssets.length > 0 ? (
                        <Image
                          src={linha.imageAssets[0].url}
                          alt="Preview"
                          fill
                          unoptimized
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : linha.thumbnailLink ? (
                        <Image
                          src={linha.thumbnailLink}
                          alt="Thumbnail"
                          fill
                          unoptimized
                          sizes="56px"
                          className="object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="text-muted-foreground">
                          <svg className="w-8 h-8 opacity-20" fill="currentColor" viewBox="0 0 24 24"><path d="M4 6h16v12H4z" opacity="0.3" /><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM8 15l2.5-3.2 1.5 1.9L14.5 10l3.5 4.5H8z" /></svg>
                        </div>
                      )}

                      {videoAcessivel && (
                        <button
                          onClick={() => setPreviewAberto(linha.indiceLinha)}
                          className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                          title="Ver vídeo"
                        >
                          <svg className="w-8 h-8 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-4 flex-1 min-w-0">
                      {/* Header: nome + status + ação */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-base leading-tight">
                              {aoRenomear && (linha.statusProcessamento === "pendente" || linha.statusProcessamento === "erro") && linha.adId ? (
                                <NomeEditavel
                                  valor={linha.adName}
                                  aoSalvar={(novoNome) => aoRenomear(linha.adId!, novoNome)}
                                  className="text-base font-semibold"
                                />
                              ) : (
                                <span className="font-semibold">{linha.adName}</span>
                              )}
                            </h3>
                            <StatusBadge status={linha.statusProcessamento} />
                            {linha.metaEffectiveStatus && (
                              <MetaStatusBadge status={linha.metaEffectiveStatus} />
                            )}
                            <Badge variant="outline" className="gap-1 text-xs">
                              {isImage ? "Imagem" : "Vídeo"}
                            </Badge>
                            {bloqueada && (
                              <Badge className="border-amber-300 bg-amber-50 text-amber-800" variant="outline">
                                Revisar antes de subir
                              </Badge>
                            )}
                            {!isImage && (
                              concluido ? (
                                linha.linkVideo && (
                                  <Badge
                                    variant="secondary"
                                    className="gap-1.5 border-green-200 bg-green-50 text-green-700 cursor-pointer hover:bg-green-100 transition-colors"
                                    onClick={() => setPreviewAberto(linha.indiceLinha)}
                                  >
                                    <svg
                                      className="h-3 w-3"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                    Ver vídeo
                                  </Badge>
                                )
                              ) : (
                                <VideoBadge
                                  status={linha.statusVideo}
                                  nomeArquivo={linha.nomeArquivoVideo}
                                  onClick={
                                    videoAcessivel
                                      ? () => setPreviewAberto(linha.indiceLinha)
                                      : undefined
                                  }
                                />
                              )
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {linha.textoPrincipal}
                          </p>
                        </div>

                        <div className="flex-shrink-0 flex items-center gap-2 flex-col justify-end">
                          {concluido ? (
                            <div className="flex items-center gap-2">
                              {aoVerDetalhes && (
                                <button
                                  onClick={() => aoVerDetalhes(linha)}
                                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                  </svg>
                                  Detalhes
                                </button>
                              )}
                              {aoEditar && (
                                <button
                                  onClick={() => aoEditar(linha)}
                                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                                  </svg>
                                  Editar
                                </button>
                              )}
                              {aoDuplicar && (
                                <button
                                  onClick={() => aoDuplicar(linha)}
                                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                                  </svg>
                                  Duplicar
                                </button>
                              )}
                              {aoExcluirMeta && (
                                <button
                                  onClick={() => aoExcluirMeta(linha)}
                                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/30 bg-background px-4 text-sm font-medium text-destructive shadow-sm transition-all hover:bg-destructive/10 active:scale-[0.98]"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                  </svg>
                                  Excluir do Meta
                                </button>
                              )}
                              <a
                                href={
                                  linha.accountId
                                    ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${linha.accountId}&filter_set=SEARCH_BY_ADGROUP_IDS-STRING_SET%1EANY%1E[%22${linha.adIdCriado}%22]`
                                    : `https://adsmanager.facebook.com/adsmanager/manage/ads?filter_set=SEARCH_BY_ADGROUP_IDS-STRING_SET%1EANY%1E[%22${linha.adIdCriado}%22]`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-10 items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 text-sm font-medium text-green-800 shadow-sm transition-all hover:bg-green-100 active:scale-[0.98]"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                                Ads Manager
                              </a>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {aoExcluir && (linha.statusProcessamento === "pendente" || linha.statusProcessamento === "erro") && linha.adId && (
                                <button
                                  onClick={() => aoExcluir(linha)}
                                  disabled={processando || processandoLinha}
                                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/30 bg-background px-4 text-sm font-medium text-destructive shadow-sm transition-all hover:bg-destructive/10 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                                  title="Excluir rascunho"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                  </svg>
                                  Excluir
                                </button>
                              )}
                              {aoEditar && (linha.statusProcessamento === "pendente" || linha.statusProcessamento === "erro") && linha.adId && (
                                <button
                                  onClick={() => aoEditar(linha)}
                                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                                  </svg>
                                  Editar
                                </button>
                              )}
                              <button
                                onClick={() => aoSubir(linha)}
                                disabled={
                                  processando ||
                                  processandoLinha ||
                                  concluido ||
                                  videoInacessivel ||
                                  bloqueada
                                }
                                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                              >
                                {processandoLinha ? (
                                  <>
                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                                    Subindo...
                                  </>
                                ) : bloqueada ? (
                                  "Corrigir pendências"
                                ) : temErro ? (
                                  "Tentar Novamente"
                                ) : (
                                  "Subir Anúncio"
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Alerta: vídeo inacessível (somente para vídeos) */}
                      {videoInacessivel && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col gap-1.5">
                              <p className="text-sm font-medium text-amber-800">
                                Vídeo sem permissão de acesso
                              </p>
                              <p className="text-xs text-amber-700 leading-relaxed">
                                {linha.erroVideo ??
                                  "O arquivo no Google Drive não está acessível."}
                              </p>
                              {serviceAccountEmail && (
                                <div className="mt-1 flex flex-col gap-1">
                                  <p className="text-xs text-amber-700">
                                    Compartilhe o arquivo do vídeo no Drive com:
                                  </p>
                                  <code className="w-fit rounded bg-amber-100 px-2 py-1 text-xs font-mono text-amber-900 select-all">
                                    {serviceAccountEmail}
                                  </code>
                                </div>
                              )}
                            </div>
                            {aoRevalidarVideo && (
                              <button
                                onClick={() => aoRevalidarVideo(linha)}
                                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-800 shadow-sm transition-all hover:bg-amber-50 active:scale-[0.98]"
                              >
                                <svg
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  strokeWidth={2}
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M20.016 4.372v4.992"
                                  />
                                </svg>
                                Revalidar
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Preview de imagens (somente para image ads) */}
                      {isImage && linha.imageAssets && linha.imageAssets.length > 0 && !concluido && (
                        <div className="flex gap-3">
                          {linha.imageAssets.map((asset, idx) => (
                            <div key={`${asset.placement}-${idx}`} className="flex flex-col gap-1">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                {rotuloPlacementImagem(asset.placement, asset.url)}
                              </span>
                              <div className="relative h-16 w-16 rounded-md border overflow-hidden bg-muted">
                                <Image
                                  src={asset.url}
                                  alt={rotuloPlacementImagem(asset.placement, asset.url)}
                                  fill
                                  unoptimized
                                  sizes="64px"
                                  className="object-cover"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {bloqueada && (linha.bloqueiosMeta?.length ?? 0) > 0 && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          <p className="font-medium">Bloqueios para subir</p>
                          <div className="mt-1 flex flex-col gap-1">
                            {linha.bloqueiosMeta?.map((item) => (
                              <p key={item}>{item}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {!bloqueada && (linha.avisosMeta?.length ?? 0) > 0 && (
                        <div className="rounded-md border border-amber-300 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
                          <p className="font-medium">Avisos</p>
                          <div className="mt-1 flex flex-col gap-1">
                            {linha.avisosMeta?.map((item) => (
                              <p key={item}>{item}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mensagem de erro (status=erro) ou aviso intencional
                          (concluido com prefixo "[AVISO ..."). Outros
                          error_message em ads concluidos sao stale (sync,
                          retry) e ficam fora pra evitar falso positivo. */}
                      {(temErro || linha.mensagemErro?.startsWith("[AVISO")) && linha.mensagemErro && (() => {
                        const erro = interpretarErroMeta(linha.mensagemErro);
                        if (!erro) return null;
                        return (
                          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase tracking-wide font-bold rounded bg-destructive/20 px-1.5 py-0.5">
                                {erro.tipo}
                              </span>
                            </div>
                            <p className="leading-snug">{erro.explicacao}</p>
                            <details className="text-xs opacity-80">
                              <summary className="cursor-pointer select-none hover:opacity-100">
                                Mensagem original do Meta
                              </summary>
                              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] bg-destructive/5 rounded p-2">
                                {erro.original}
                              </pre>
                            </details>
                          </div>
                        );
                      })()}

                      <Separator />

                      {/* Detalhes em grid */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                        <DetalheItem rotulo="Data" valor={linha.data} />
                        <DetalheItem rotulo="Campanha" valor={linha.campaign} subValor={linha.campaignId} />
                        <DetalheItem rotulo="Ad Set" valor={linha.adSet} subValor={linha.adSetId} />
                        <DetalheItem rotulo="Título" valor={linha.titulo} />
                        <DetalheItem rotulo="CTA" valor={linha.cta} />
                        <DetalheItem rotulo="Descrição" valor={linha.descricao} />
                        {linha.linkAnuncio && (
                          <DetalheItem rotulo="Link UTM" valor={linha.linkAnuncio} />
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
