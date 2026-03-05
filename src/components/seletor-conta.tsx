"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ContaOpcao {
  id: string;
  nome: string;
}

const CONTAS: ContaOpcao[] = [
  { id: "act_775254035944122", nome: "Evino" },
  { id: "act_1020013451372159", nome: "GrandCru" },
];

interface SeletorContaProps {
  valor: string;
  aoMudar: (contaId: string) => void;
}

export function SeletorConta({ valor, aoMudar }: SeletorContaProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Conta
      </label>
      <Select value={valor} onValueChange={aoMudar}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Selecione a conta" />
        </SelectTrigger>
        <SelectContent>
          {CONTAS.map((conta) => (
            <SelectItem key={conta.id} value={conta.id}>
              {conta.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
