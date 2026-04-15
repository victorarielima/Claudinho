"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// EditorUtmTrigger — inline link field + "Editar UTMs" button
// ---------------------------------------------------------------------------

export function EditorUtmTrigger({
  valor,
  onChange,
  placeholder = "https://www.evino.com.br/...",
  rotulo = "Link da campanha",
  className = "",
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rotulo?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{rotulo}</label>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-[10px] font-medium text-primary hover:underline"
        >
          Editar UTMs
        </button>
      </div>
      <input
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
      />
      {aberto && (
        <EditorUtm
          url={valor}
          onSalvar={(novaUrl) => { onChange(novaUrl); setAberto(false); }}
          onFechar={() => setAberto(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditorUtmButton — small button that opens the editor (for inline layouts)
// ---------------------------------------------------------------------------

export function EditorUtmButton({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="shrink-0 rounded-md border border-input bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Editar UTMs do link"
      >
        UTM
      </button>
      {aberto && (
        <EditorUtm
          url={valor}
          onSalvar={(novaUrl) => { onChange(novaUrl); setAberto(false); }}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// EditorUtm — dialog that shows URL components for easy editing
// ---------------------------------------------------------------------------

const KNOWN_KEYS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "openShop",
]);

function parseUrl(raw: string) {
  try {
    const url = new URL(raw);
    const base = url.origin + url.pathname;
    const params: { key: string; value: string }[] = [];
    url.searchParams.forEach((v, k) => params.push({ key: k, value: v }));
    return { base, params, valid: true };
  } catch {
    return { base: raw, params: [] as { key: string; value: string }[], valid: false };
  }
}

function buildUrl(base: string, params: { key: string; value: string }[]) {
  try {
    const url = new URL(base);
    for (const p of params) {
      if (p.key.trim()) url.searchParams.set(p.key.trim(), p.value);
    }
    return url.toString();
  } catch {
    return base;
  }
}

function EditorUtm({
  url,
  onSalvar,
  onFechar,
}: {
  url: string;
  onSalvar: (url: string) => void;
  onFechar: () => void;
}) {
  const parsed = useMemo(() => parseUrl(url), [url]);
  const [base, setBase] = useState(parsed.base);
  const [params, setParams] = useState(parsed.params);

  const atualizarParam = useCallback((idx: number, campo: "key" | "value", valor: string) => {
    setParams((prev) => prev.map((p, i) => i === idx ? { ...p, [campo]: valor } : p));
  }, []);

  const removerParam = useCallback((idx: number) => {
    setParams((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const adicionarParam = useCallback(() => {
    setParams((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const preview = useMemo(() => buildUrl(base, params), [base, params]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onFechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Link</DialogTitle>
          <DialogDescription>Edite a URL base e os parâmetros separadamente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Base URL */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">URL base</label>
            <input
              type="text"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* Parameters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Parâmetros</label>
              <button
                type="button"
                onClick={adicionarParam}
                className="text-[10px] font-medium text-primary hover:underline"
              >
                + Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {params.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={p.key}
                    onChange={(e) => atualizarParam(i, "key", e.target.value)}
                    placeholder="chave"
                    className={`w-[130px] shrink-0 rounded-md border bg-background px-2 py-1.5 text-xs shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/20 ${
                      KNOWN_KEYS.has(p.key) ? "border-input" : "border-amber-300"
                    }`}
                  />
                  <span className="text-muted-foreground text-xs">=</span>
                  <input
                    type="text"
                    value={p.value}
                    onChange={(e) => atualizarParam(i, "value", e.target.value)}
                    placeholder="valor"
                    className="flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-xs shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/20"
                  />
                  <button
                    type="button"
                    onClick={() => removerParam(i)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {params.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-1">Nenhum parâmetro</p>
              )}
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</label>
            <p className="mt-1 rounded-lg border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground break-all select-all">
              {preview}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
          <Button size="sm" onClick={() => onSalvar(preview)}>Aplicar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
