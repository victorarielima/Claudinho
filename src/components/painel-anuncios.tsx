"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SeletorConta } from "@/components/seletor-conta";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { CartoesResumo } from "@/components/cartoes-resumo";
import { TabelaAnuncios } from "@/components/tabela-anuncios";
import type { AnuncioMeta, PresetPeriodo, ResumoMeta } from "@/lib/meta";

const CONTA_PADRAO = "act_775254035944122";
const PAGE_SIZE = 25;

function formatarHora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Canal = "todos" | "ecommerce" | "clube";

const CANAIS: { valor: Canal; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "ecommerce", rotulo: "Ecommerce" },
  { valor: "clube", rotulo: "Clube" },
];

export function PainelAnuncios() {
  const [contaId, setContaId] = useState(CONTA_PADRAO);
  const [periodo, setPeriodo] = useState<PresetPeriodo>("last_30d");
  const [canal, setCanal] = useState<Canal>("todos");
  const [anuncios, setAnuncios] = useState<AnuncioMeta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [usouCache, setUsouCache] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoMeta | null>(null);
  const [cursorAtual, setCursorAtual] = useState<string | null>(null);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [historicoCursores, setHistoricoCursores] = useState<(string | null)[]>([]);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [temProximaPagina, setTemProximaPagina] = useState(false);
  const requisicaoAtualRef = useRef(0);

  const buscarDados = useCallback(
    async (
      forcar = false,
      after: string | null = null,
      historicoAnterior?: (string | null)[],
      paginaDestino = 1
    ) => {
      const requestId = ++requisicaoAtualRef.current;
      setCarregando(true);
      setErro(null);

      try {
        const params = new URLSearchParams({
          accountId: contaId,
          datePreset: periodo,
          canal,
          limit: String(PAGE_SIZE),
        });
        if (after) params.set("after", after);
        if (forcar) params.set("fresh", "1");

        const res = await fetch(`/api/meta/anuncios?${params}`);
        const json = await res.json();

        if (requestId !== requisicaoAtualRef.current) {
          return;
        }

        if (!res.ok) {
          throw new Error(json.erro ?? "Erro ao buscar anúncios");
        }

        setAnuncios(json.data);
        setResumo(json.resumo ?? null);
        setUsouCache(json.cache ?? false);
        setAtualizadoEm(json.atualizadoEm ?? null);
        setCursorAtual(after);
        setPaginaAtual(paginaDestino);
        setTemProximaPagina(Boolean(json.hasNextPage));
        setProximoCursor(json.nextCursor ?? null);
        setHistoricoCursores(historicoAnterior ?? []);
      } catch (e) {
        if (requestId !== requisicaoAtualRef.current) {
          return;
        }
        setErro(e instanceof Error ? e.message : "Erro desconhecido");
        setAnuncios([]);
        setResumo(null);
        setUsouCache(false);
        setAtualizadoEm(null);
        setProximoCursor(null);
        setTemProximaPagina(false);
      } finally {
        if (requestId === requisicaoAtualRef.current) {
          setCarregando(false);
        }
      }
    },
    [contaId, periodo, canal]
  );

  useEffect(() => {
    setCursorAtual(null);
    setHistoricoCursores([]);
    setProximoCursor(null);
    setPaginaAtual(1);
    buscarDados(false, null, [], 1);
  }, [buscarDados]);

  const carregarProximaPagina = () => {
    if (!temProximaPagina || !proximoCursor) return;
    void buscarDados(
      false,
      proximoCursor,
      [...historicoCursores, cursorAtual],
      paginaAtual + 1
    );
  };

  const carregarPaginaAnterior = () => {
    if (historicoCursores.length === 0) return;
    const proximoHistorico = [...historicoCursores];
    const anterior = proximoHistorico.pop() ?? null;
    void buscarDados(false, anterior, proximoHistorico, Math.max(1, paginaAtual - 1));
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe os anúncios com investimento no período selecionado.
            Os totais consideram o gasto real do intervalo, mesmo se o anúncio estiver pausado hoje.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SeletorConta valor={contaId} aoMudar={setContaId} />
          <SeletorPeriodo valor={periodo} aoMudar={setPeriodo} />
          <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
            {CANAIS.map((c) => (
              <button
                key={c.valor}
                onClick={() => setCanal(c.valor)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${
                  canal === c.valor
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.rotulo}
              </button>
            ))}
          </div>
          <button
            onClick={() => buscarDados(true, cursorAtual, historicoCursores, paginaAtual)}
            disabled={carregando}
            title="Atualizar dados (ignora cache)"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-50"
          >
            <svg
              className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Erro ao carregar dados</p>
          <p className="mt-1 text-destructive/80">{erro}</p>
        </div>
      )}

      {/* Cards de resumo */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Resumo do Período
          </h2>
          {atualizadoEm && !carregando && (
            <span className="text-xs text-muted-foreground">
              {usouCache ? "Cache" : "Atualizado"} às{" "}
              {formatarHora(atualizadoEm)}
            </span>
          )}
        </div>
        <CartoesResumo anuncios={anuncios} carregando={carregando} resumo={resumo} />
      </section>

      {/* Tabela de anúncios */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Anúncios com Investimento
          </h2>
          {!carregando && anuncios.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Página {paginaAtual} • {anuncios.length} anúncio{anuncios.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <TabelaAnuncios anuncios={anuncios} carregando={carregando} />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={carregarPaginaAnterior}
            disabled={carregando || historicoCursores.length === 0}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            onClick={carregarProximaPagina}
            disabled={carregando || !temProximaPagina || !proximoCursor}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </section>
    </div>
  );
}
