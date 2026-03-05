"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  TabelaPendentes,
  type LinhaComStatus,
} from "@/components/tabela-pendentes";
import type { LinhaAnuncio } from "@/lib/sheets";

export function PainelCriacao() {
  const [linhas, setLinhas] = useState<LinhaComStatus[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [jaCarregou, setJaCarregou] = useState(false);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string>("");
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroData, setFiltroData] = useState<string>("todas");

  const validarVideos = useCallback(
    async (linhasParaValidar: LinhaComStatus[]) => {
      const comVideo = linhasParaValidar.filter((l) => l.linkVideo);
      if (comVideo.length === 0) return;

      // Marcar como "verificando"
      setLinhas((prev) =>
        prev.map((l) =>
          comVideo.some((v) => v.indiceLinha === l.indiceLinha)
            ? { ...l, statusVideo: "verificando" as const }
            : l
        )
      );

      try {
        const res = await fetch("/api/drive/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itens: comVideo.map((l) => ({
              indiceLinha: l.indiceLinha,
              linkVideo: l.linkVideo,
            })),
          }),
        });

        const json = await res.json();

        if (!res.ok) return;

        if (json.serviceAccountEmail) {
          setServiceAccountEmail(json.serviceAccountEmail);
        }

        setLinhas((prev) =>
          prev.map((l) => {
            const resultado = json.resultados?.find(
              (r: { indiceLinha: number }) => r.indiceLinha === l.indiceLinha
            );
            if (!resultado) return l;

            return {
              ...l,
              statusVideo: resultado.acessivel
                ? ("acessivel" as const)
                : ("inacessivel" as const),
              erroVideo: resultado.erro,
              nomeArquivoVideo: resultado.nomeArquivo,
            };
          })
        );
      } catch {
        // Falha na validação não impede o fluxo
      }
    },
    []
  );

  const carregarPlanilha = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    try {
      const res = await fetch("/api/sheets/pendentes");
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.erro ?? "Erro ao carregar planilha");
      }

      const todas: LinhaAnuncio[] = json.data;
      const novasLinhas: LinhaComStatus[] = todas.map((l) => {
        const isConcluido = l.statusAutomacao === "Concluído";
        const isErro = l.statusAutomacao.startsWith("Erro");
        return {
          ...l,
          statusProcessamento: isConcluido
            ? ("concluido" as const)
            : isErro
              ? ("erro" as const)
              : ("pendente" as const),
          adIdCriado: isConcluido ? l.adIdGerado : undefined,
          accountId: l.accountId || "",
          mensagemErro: isErro ? l.statusAutomacao.replace("Erro: ", "") : undefined,
          statusVideo: "nao_verificado" as const,
        };
      });

      setLinhas(novasLinhas);
      setJaCarregou(true);

      // Validar vídeos apenas dos pendentes/erro
      const paraValidar = novasLinhas.filter(
        (l) => l.statusProcessamento !== "concluido"
      );
      await validarVideos(paraValidar);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setCarregando(false);
    }
  }, [validarVideos]);

  useEffect(() => {
    carregarPlanilha();
  }, [carregarPlanilha]);

  const revalidarVideo = useCallback(
    async (linha: LinhaComStatus) => {
      await validarVideos([linha]);
    },
    [validarVideos]
  );

  const alternarSelecao = useCallback((indiceLinha: number) => {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(indiceLinha)) {
        novo.delete(indiceLinha);
      } else {
        novo.add(indiceLinha);
      }
      return novo;
    });
  }, []);

  const selecionaveis = linhas.filter(
    (l) =>
      (l.statusProcessamento === "pendente" ||
        l.statusProcessamento === "erro") &&
      l.statusVideo !== "inacessivel"
  );

  const selecionarTodos = useCallback(() => {
    setSelecionados(new Set(selecionaveis.map((l) => l.indiceLinha)));
  }, [selecionaveis]);

  const limparSelecao = useCallback(() => {
    setSelecionados(new Set());
  }, []);

  const subirAnuncio = useCallback(async (linha: LinhaComStatus) => {
    setProcessando(true);

    setLinhas((prev) =>
      prev.map((l) =>
        l.indiceLinha === linha.indiceLinha
          ? { ...l, statusProcessamento: "processando" as const }
          : l
      )
    );

    try {
      const res = await fetch("/api/meta/criar-anuncio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indiceLinha: linha.indiceLinha,
          adSetId: linha.adSetId,
          adName: linha.adName,
          textoPrincipal: linha.textoPrincipal,
          titulo: linha.titulo,
          descricao: linha.descricao,
          cta: linha.cta,
          linkAnuncio: linha.linkAnuncio,
          linkVideo: linha.linkVideo,
          pageId: linha.pageId,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.erro ?? "Erro ao criar anúncio");
      }

      setLinhas((prev) =>
        prev.map((l) =>
          l.indiceLinha === linha.indiceLinha
            ? {
                ...l,
                statusProcessamento: "concluido" as const,
                adIdCriado: json.adId,
                accountId: json.accountId || "",
              }
            : l
        )
      );
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Erro desconhecido";

      setLinhas((prev) =>
        prev.map((l) =>
          l.indiceLinha === linha.indiceLinha
            ? {
                ...l,
                statusProcessamento: "erro" as const,
                mensagemErro: mensagem,
              }
            : l
        )
      );
    } finally {
      setProcessando(false);
    }
  }, []);

  const subirSelecionados = useCallback(async () => {
    const podeSubir = (l: LinhaComStatus) =>
      (l.statusProcessamento === "pendente" ||
        l.statusProcessamento === "erro") &&
      l.statusVideo !== "inacessivel";

    const alvo =
      selecionados.size > 0
        ? linhas.filter(
            (l) => selecionados.has(l.indiceLinha) && podeSubir(l)
          )
        : linhas.filter(podeSubir);

    for (const linha of alvo) {
      await subirAnuncio(linha);
    }

    setSelecionados(new Set());
  }, [linhas, selecionados, subirAnuncio]);

  const totalPendentes = linhas.filter(
    (l) => l.statusProcessamento === "pendente"
  ).length;
  const totalConcluidos = linhas.filter(
    (l) => l.statusProcessamento === "concluido"
  ).length;
  const totalErros = linhas.filter(
    (l) => l.statusProcessamento === "erro"
  ).length;
  const totalVideosBloqueados = linhas.filter(
    (l) =>
      l.statusVideo === "inacessivel" &&
      l.statusProcessamento === "pendente"
  ).length;
  const totalDisponiveis = totalPendentes - totalVideosBloqueados;
  const totalProcessando = linhas.filter(
    (l) => l.statusProcessamento === "processando"
  ).length;
  const total = linhas.length;

  const datasUnicas = Array.from(
    new Set(linhas.map((l) => l.data).filter(Boolean))
  ).sort((a, b) => {
    // Tentar ordenar como data (dd/mm/yyyy ou yyyy-mm-dd)
    const parseData = (s: string) => {
      const partes = s.split("/");
      if (partes.length === 3) return new Date(`${partes[2]}-${partes[1]}-${partes[0]}`).getTime();
      return new Date(s).getTime();
    };
    return parseData(b) - parseData(a);
  });

  const linhasFiltradas = linhas.filter((l) => {
    if (filtroStatus !== "todos" && l.statusProcessamento !== filtroStatus) return false;
    if (filtroData !== "todas" && l.data !== filtroData) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Criação de Anúncios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Suba anúncios automaticamente a partir da planilha do Google Sheets.
            O time preenche a planilha com os dados do criativo e a ferramenta
            cria os anúncios no Meta Ads.
          </p>
        </div>
        <a
          href={`https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_GOOGLE_SHEETS_ID}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.385 2H4.615A2.615 2.615 0 0 0 2 4.615v14.77A2.615 2.615 0 0 0 4.615 22h14.77A2.615 2.615 0 0 0 22 19.385V4.615A2.615 2.615 0 0 0 19.385 2zM7 18V6h4v12H7zm6 0V6h4v12h-4z" />
          </svg>
          Abrir Planilha
        </a>
      </div>

      {/* Como funciona */}
      {!jaCarregou && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-muted/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  1
                </span>
                <div>
                  <p className="text-sm font-medium">Preencha a planilha</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                    Adicione Campaign ID, Ad Set ID, nome, textos, CTA e link
                    do vídeo. Marque &quot;Pendente&quot; na coluna Status.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  2
                </span>
                <div>
                  <p className="text-sm font-medium">Carregue e revise</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                    Clique em &quot;Carregar Planilha&quot; para ver os anúncios
                    pendentes. Os vídeos são validados automaticamente.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  3
                </span>
                <div>
                  <p className="text-sm font-medium">Suba os anúncios</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                    Suba um por um ou todos de uma vez. Os anúncios são criados
                    como <strong>pausados</strong> para revisão no Ads Manager.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Barra de ações */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={carregarPlanilha}
            disabled={carregando}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-5 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            {carregando ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                Carregando...
              </>
            ) : jaCarregou ? (
              "Recarregar Planilha"
            ) : (
              "Carregar Planilha"
            )}
          </button>

          {jaCarregou && totalDisponiveis > 0 && (
            <button
              onClick={subirSelecionados}
              disabled={processando}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              {processando ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  Processando...
                </>
              ) : selecionados.size > 0 ? (
                `Subir Selecionados (${selecionados.size})`
              ) : (
                `Subir Todos (${totalDisponiveis})`
              )}
            </button>
          )}

          {jaCarregou && selecionaveis.length > 0 && (
            <>
              <button
                onClick={
                  selecionados.size === selecionaveis.length
                    ? limparSelecao
                    : selecionarTodos
                }
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
              >
                {selecionados.size === selecionaveis.length
                  ? "Desmarcar Todos"
                  : "Selecionar Todos"}
              </button>
              {selecionados.size > 0 && (
                <button
                  onClick={limparSelecao}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-all hover:text-foreground"
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
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                  Limpar
                </button>
              )}
            </>
          )}
        </div>

        {/* Contadores */}
        {jaCarregou && total > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {total} anúncio{total !== 1 ? "s" : ""}
            </span>
            {selecionados.size > 0 && (
              <span className="flex items-center gap-1.5 text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {selecionados.size} selecionado{selecionados.size !== 1 ? "s" : ""}
              </span>
            )}
            {totalConcluidos > 0 && (
              <span className="flex items-center gap-1.5 text-green-600">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {totalConcluidos} concluído{totalConcluidos !== 1 ? "s" : ""}
              </span>
            )}
            {totalErros > 0 && (
              <span className="flex items-center gap-1.5 text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                {totalErros} erro{totalErros !== 1 ? "s" : ""}
              </span>
            )}
            {totalVideosBloqueados > 0 && (
              <span className="flex items-center gap-1.5 text-amber-600">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {totalVideosBloqueados} sem acesso ao vídeo
              </span>
            )}
          </div>
        )}
      </div>

      {/* Erro global */}
      {erro && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Erro ao carregar planilha</p>
          <p className="mt-1 text-destructive/80">{erro}</p>
        </div>
      )}

      {/* Conteúdo */}
      {jaCarregou ? (
        <section>
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
              {[
                { valor: "todos", rotulo: "Todos", contagem: total },
                { valor: "pendente", rotulo: "Pendentes", contagem: totalPendentes },
                { valor: "processando", rotulo: "Processando", contagem: totalProcessando },
                { valor: "concluido", rotulo: "Concluídos", contagem: totalConcluidos },
                { valor: "erro", rotulo: "Erros", contagem: totalErros },
              ]
                .filter((f) => f.valor === "todos" || f.contagem > 0)
                .map((f) => (
                  <button
                    key={f.valor}
                    onClick={() => setFiltroStatus(f.valor)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                      filtroStatus === f.valor
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.rotulo}
                    <span
                      className={`tabular-nums text-xs ${
                        filtroStatus === f.valor
                          ? "text-foreground/60"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {f.contagem}
                    </span>
                  </button>
                ))}
            </div>

            {datasUnicas.length > 0 && (
              <select
                value={filtroData}
                onChange={(e) => setFiltroData(e.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="todas">Todas as datas</option>
                {datasUnicas.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </div>
          <TabelaPendentes
            linhas={linhasFiltradas}
            carregando={carregando}
            aoSubir={subirAnuncio}
            processando={processando}
            aoRevalidarVideo={revalidarVideo}
            serviceAccountEmail={serviceAccountEmail}
            selecionados={selecionados}
            aoAlternarSelecao={alternarSelecao}
          />
        </section>
      ) : !erro ? (
        <Card className="border-dashed">
          <CardContent className="flex h-44 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-muted p-3">
              <svg
                className="h-6 w-6 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium">Pronto para começar</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Clique em &quot;Carregar Planilha&quot; para buscar os anúncios
                com status &quot;Pendente&quot;
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
