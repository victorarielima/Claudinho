"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  status?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Selecione...",
  disabled = false,
  loading = false,
}: SearchableSelectProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selecionado = options.find((o) => o.value === value);

  const filtradas = useMemo(() => {
    if (!busca.trim()) return options;
    const termo = busca.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(termo));
  }, [options, busca]);

  // Close on click outside
  useEffect(() => {
    if (!aberto) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [aberto]);

  const abrir = useCallback(() => {
    if (disabled || loading) return;
    setAberto(true);
    setBusca("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled, loading]);

  const selecionar = useCallback(
    (val: string) => {
      onValueChange(val);
      setAberto(false);
      setBusca("");
    },
    [onValueChange]
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={abrir}
        disabled={disabled || loading}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={selecionado ? "truncate" : "truncate text-muted-foreground"}
          title={selecionado?.label}
        >
          {loading ? "Carregando..." : selecionado ? selecionado.label : placeholder}
        </span>
        <svg className="h-3.5 w-3.5 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown */}
      {aberto && (
        <div className="absolute z-50 mt-1 min-w-full w-max max-w-[480px] rounded-md border bg-background shadow-lg">
          {/* Search input */}
          <div className="border-b px-2 py-1.5">
            <input
              ref={inputRef}
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar..."
              className="h-7 w-full bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Options */}
          <div className="max-h-[200px] overflow-y-auto py-1">
            {filtradas.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado</p>
            ) : (
              filtradas.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => selecionar(opt.value)}
                  title={opt.label}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent ${
                    opt.value === value ? "bg-accent/50 font-medium" : ""
                  }`}
                >
                  {opt.status !== undefined && (
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${opt.status === "ACTIVE" ? "bg-green-500" : "bg-slate-300"}`} />
                  )}
                  <span className="truncate">{opt.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
