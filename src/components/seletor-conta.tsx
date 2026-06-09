"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrand } from "@/components/brand-provider";

export interface ContaOpcao {
  id: string;
  nome: string;
}

interface SeletorContaProps {
  valor: string;
  aoMudar: (contaId: string) => void;
}

export function SeletorConta({ valor, aoMudar }: SeletorContaProps) {
  const { brands, loading } = useBrand();

  const contas: ContaOpcao[] = brands.map((b) => ({
    id: b.meta_account_id,
    nome: b.name,
  }));

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Conta
      </label>
      <Select value={valor} onValueChange={aoMudar} disabled={loading}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder={loading ? "Carregando..." : "Selecione a conta"} />
        </SelectTrigger>
        <SelectContent>
          {contas.map((conta) => (
            <SelectItem key={conta.id} value={conta.id}>
              {conta.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
