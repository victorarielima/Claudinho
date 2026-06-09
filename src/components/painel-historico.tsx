"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditEntry } from "@/lib/db";

const ACOES: Record<string, { rotulo: string; cor: string }> = {
  created: { rotulo: "Criado", cor: "border-blue-200 bg-blue-50 text-blue-700" },
  updated: { rotulo: "Atualizado", cor: "border-yellow-200 bg-yellow-50 text-yellow-700" },
  uploaded_to_meta: { rotulo: "Subido na Meta", cor: "border-green-200 bg-green-50 text-green-700" },
  error: { rotulo: "Erro", cor: "border-red-200 bg-red-50 text-red-700" },
  imported: { rotulo: "Importado", cor: "border-purple-200 bg-purple-50 text-purple-700" },
};

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PainelHistorico() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [pagina, setPagina] = useState(0);
  const limite = 50;

  const buscarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({
        limit: String(limite),
        offset: String(pagina * limite),
      });

      const res = await fetch(`/api/audit?${params}`);
      const json = await res.json();

      if (res.ok) {
        setEntries(json.data);
        setTotal(json.total);
      }
    } catch {
      // silently fail
    } finally {
      setCarregando(false);
    }
  }, [pagina]);

  useEffect(() => {
    buscarDados();
  }, [buscarDados]);

  const exportar = () => {
    window.open("/api/export?formato=xlsx", "_blank");
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Log de todas as ações realizadas no sistema. {total > 0 && `${total} registros no total.`}
          </p>
        </div>
        <button
          onClick={exportar}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Exportar Excel
        </button>
      </div>

      {carregando ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          Nenhum registro no histórico.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const acao = ACOES[entry.action] ?? { rotulo: entry.action, cor: "" };

            return (
              <div key={entry.id} className="rounded-lg border p-4 transition-colors hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className={`text-xs ${acao.cor}`}>
                      {acao.rotulo}
                    </Badge>
                    <span className="text-sm font-medium">
                      {entry.entity_type === "ad" ? "Anúncio" : entry.entity_type}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {entry.entity_id.slice(0, 8)}...
                    </span>
                    {entry.user_name && (
                      <span className="text-xs text-muted-foreground">
                        por {entry.user_name}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatarData(entry.created_at)}
                  </span>
                </div>

                {entry.changes && Object.keys(entry.changes).length > 0 && (
                  <div className="mt-2 rounded-md bg-muted/30 px-3 py-2">
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      {Object.entries(entry.changes).map(([key, val]) => (
                        <span key={key} className="text-xs text-muted-foreground">
                          <span className="font-medium">{key}</span>:{" "}
                          {typeof val === "object" && val !== null && "old" in (val as Record<string, unknown>)
                            ? `${(val as { old?: unknown }).old ?? "—"} → ${(val as { new?: unknown }).new ?? "—"}`
                            : JSON.stringify(val)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Paginação */}
          {total > limite && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm text-muted-foreground">
                Página {pagina + 1} de {Math.ceil(total / limite)}
              </span>
              <button
                onClick={() => setPagina((p) => p + 1)}
                disabled={(pagina + 1) * limite >= total}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
