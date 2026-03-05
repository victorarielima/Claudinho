"use client";

import { useState } from "react";
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
}

interface TabelaPendentesProps {
  linhas: LinhaComStatus[];
  carregando: boolean;
  aoSubir: (linha: LinhaComStatus) => void;
  processando: boolean;
  aoRevalidarVideo?: (linha: LinhaComStatus) => void;
  serviceAccountEmail?: string;
  selecionados: Set<number>;
  aoAlternarSelecao: (indiceLinha: number) => void;
  compacto?: boolean;
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

function DetalheItem({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: string;
}) {
  if (!valor) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </span>
      <span className="text-sm">{valor}</span>
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

function TabelaCompacta({
  linhas,
  aoSubir,
  processando,
  selecionados,
  aoAlternarSelecao,
  setPreviewAberto,
}: {
  linhas: LinhaComStatus[];
  aoSubir: (linha: LinhaComStatus) => void;
  processando: boolean;
  selecionados: Set<number>;
  aoAlternarSelecao: (indiceLinha: number) => void;
  setPreviewAberto: (indiceLinha: number) => void;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Nome do Anúncio</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Campanha</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Ad Set</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">CTA</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Vídeo</th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Ação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => {
              const concluido = linha.statusProcessamento === "concluido";
              const temErro = linha.statusProcessamento === "erro";
              const processandoLinha = linha.statusProcessamento === "processando";
              const videoInacessivel = linha.statusVideo === "inacessivel";
              const selecionada = selecionados.has(linha.indiceLinha);
              const podeSelecionar = !concluido && !processandoLinha && !videoInacessivel;

              return (
                <tr
                  key={linha.indiceLinha}
                  className={`border-b last:border-b-0 transition-colors ${
                    concluido
                      ? "bg-green-50/30"
                      : temErro
                        ? "bg-destructive/5"
                        : selecionada
                          ? "bg-primary/5"
                          : "hover:bg-muted/30"
                  }`}
                >
                  <td className="px-3 py-2">
                    {podeSelecionar && (
                      <Checkbox
                        checked={selecionada}
                        onCheckedChange={() => aoAlternarSelecao(linha.indiceLinha)}
                        aria-label={`Selecionar ${linha.adName}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusDot status={linha.statusProcessamento} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium truncate block max-w-xs" title={linha.adName}>
                      {linha.adName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[10rem]" title={linha.campaign}>
                    {linha.campaign}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[10rem]" title={linha.adSet}>
                    {linha.adSet}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {linha.cta}
                  </td>
                  <td className="px-3 py-2">
                    {linha.linkVideo ? (
                      <button
                        onClick={() => setPreviewAberto(linha.indiceLinha)}
                        className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 transition-colors"
                        title="Ver vídeo"
                      >
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Ver
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {concluido ? (
                      <a
                        href={
                          linha.accountId
                            ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${linha.accountId}&selected_ad_ids=${linha.adIdCriado}`
                            : `https://adsmanager.facebook.com/adsmanager/manage/ads?selected_ad_ids=${linha.adIdCriado}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-900 transition-colors"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                        Ads Manager
                      </a>
                    ) : (
                      <button
                        onClick={() => aoSubir(linha)}
                        disabled={processando || processandoLinha || videoInacessivel}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                      >
                        {processandoLinha ? (
                          <>
                            <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-primary-foreground/30 border-t-primary-foreground" />
                            Subindo
                          </>
                        ) : temErro ? (
                          "Tentar"
                        ) : (
                          "Subir"
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TabelaPendentes({
  linhas,
  carregando,
  aoSubir,
  processando,
  aoRevalidarVideo,
  serviceAccountEmail,
  selecionados,
  aoAlternarSelecao,
  compacto = false,
}: TabelaPendentesProps) {
  const [previewAberto, setPreviewAberto] = useState<number | null>(null);

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
        Nenhum anúncio pendente na planilha.
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
          processando={processando}
          selecionados={selecionados}
          aoAlternarSelecao={aoAlternarSelecao}
          setPreviewAberto={setPreviewAberto}
        />
      ) : (
      <div className="flex flex-col gap-4">
        {linhas.map((linha) => {
          const concluido = linha.statusProcessamento === "concluido";
          const temErro = linha.statusProcessamento === "erro";
          const processandoLinha = linha.statusProcessamento === "processando";
          const videoInacessivel = linha.statusVideo === "inacessivel";
          const videoAcessivel = linha.statusVideo === "acessivel";

          const selecionada = selecionados.has(linha.indiceLinha);
          const podeSelecionar =
            !concluido && !processandoLinha && !videoInacessivel;

          return (
            <Card
              key={linha.indiceLinha}
              className={
                concluido
                  ? "border-green-200 bg-green-50/30"
                  : temErro
                    ? "border-destructive/30 bg-destructive/5"
                    : selecionada
                      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                      : ""
              }
            >
              <CardContent className="p-6">
                <div className="flex gap-4">
                  {/* Checkbox */}
                  {podeSelecionar && (
                    <div className="pt-0.5">
                      <Checkbox
                        checked={selecionada}
                        onCheckedChange={() =>
                          aoAlternarSelecao(linha.indiceLinha)
                        }
                        aria-label={`Selecionar ${linha.adName}`}
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-4 flex-1 min-w-0">
                  {/* Header: nome + status + ação */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-base font-semibold leading-tight">
                          {linha.adName}
                        </h3>
                        <StatusBadge status={linha.statusProcessamento} />
                        {concluido ? (
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
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {linha.textoPrincipal}
                      </p>
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-2">
                      {videoAcessivel && (
                        <button
                          onClick={() => setPreviewAberto(linha.indiceLinha)}
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
                          title="Preview do vídeo"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                            />
                          </svg>
                        </button>
                      )}
                      {concluido ? (
                        <a
                          href={
                            linha.accountId
                              ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${linha.accountId}&selected_ad_ids=${linha.adIdCriado}`
                              : `https://adsmanager.facebook.com/adsmanager/manage/ads?selected_ad_ids=${linha.adIdCriado}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 text-sm font-medium text-green-800 shadow-sm transition-all hover:bg-green-100 active:scale-[0.98]"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                            />
                          </svg>
                          Ver no Ads Manager
                        </a>
                      ) : (
                        <button
                          onClick={() => aoSubir(linha)}
                          disabled={
                            processando ||
                            processandoLinha ||
                            concluido ||
                            videoInacessivel
                          }
                          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                        >
                          {processandoLinha ? (
                            <>
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                              Subindo...
                            </>
                          ) : temErro ? (
                            "Tentar Novamente"
                          ) : (
                            "Subir Anúncio"
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Alerta: vídeo inacessível */}
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

                  {/* Mensagem de erro */}
                  {temErro && linha.mensagemErro && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {linha.mensagemErro}
                    </div>
                  )}

                  <Separator />

                  {/* Detalhes em grid */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                    <DetalheItem rotulo="Campanha" valor={linha.campaign} />
                    <DetalheItem rotulo="Ad Set" valor={linha.adSet} />
                    <DetalheItem rotulo="Título" valor={linha.titulo} />
                    <DetalheItem rotulo="CTA" valor={linha.cta} />
                    <DetalheItem rotulo="Descrição" valor={linha.descricao} />
                    <DetalheItem
                      rotulo="Page ID"
                      valor={linha.pageId || "via .env"}
                    />
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
