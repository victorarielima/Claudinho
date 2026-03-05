"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PresetPeriodo } from "@/lib/meta";

const PERIODOS: { valor: PresetPeriodo; rotulo: string }[] = [
  { valor: "today", rotulo: "Hoje" },
  { valor: "yesterday", rotulo: "Ontem" },
  { valor: "last_7d", rotulo: "Últimos 7 dias" },
  { valor: "last_14d", rotulo: "Últimos 14 dias" },
  { valor: "last_30d", rotulo: "Últimos 30 dias" },
  { valor: "this_month", rotulo: "Este mês" },
  { valor: "last_month", rotulo: "Mês passado" },
];

interface SeletorPeriodoProps {
  valor: PresetPeriodo;
  aoMudar: (periodo: PresetPeriodo) => void;
}

export function SeletorPeriodo({ valor, aoMudar }: SeletorPeriodoProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Período
      </label>
      <Select value={valor} onValueChange={(v) => aoMudar(v as PresetPeriodo)}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {PERIODOS.map((p) => (
            <SelectItem key={p.valor} value={p.valor}>
              {p.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
