"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnuncioMeta, ResumoMeta } from "@/lib/meta";

interface CartoesResumoProps {
  anuncios: AnuncioMeta[];
  carregando: boolean;
  resumo?: ResumoMeta | null;
}

function formatarNumero(valor: number): string {
  if (valor >= 1_000_000) {
    return `${(valor / 1_000_000).toFixed(1)}M`;
  }
  if (valor >= 1_000) {
    return `${(valor / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("pt-BR").format(Math.round(valor));
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function formatarPorcentagem(valor: number): string {
  return `${valor.toFixed(2)}%`;
}

export function CartoesResumo({ anuncios, carregando, resumo }: CartoesResumoProps) {
  const totaisCalculados = anuncios.reduce(
    (acc, anuncio) => {
      const insight = anuncio.insights?.data?.[0];
      if (!insight) return acc;
      acc.investimento += parseFloat(insight.spend || "0");
      acc.impressoes += parseInt(insight.impressions || "0", 10);
      acc.cliques += parseInt(insight.clicks || "0", 10);
      acc.alcance += parseInt(insight.reach || "0", 10);
      return acc;
    },
    { investimento: 0, impressoes: 0, cliques: 0, alcance: 0 }
  );

  const totais = resumo ?? {
    ...totaisCalculados,
    ctr:
      totaisCalculados.impressoes > 0
        ? (totaisCalculados.cliques / totaisCalculados.impressoes) * 100
        : 0,
    cpc:
      totaisCalculados.cliques > 0
        ? totaisCalculados.investimento / totaisCalculados.cliques
        : 0,
  };

  const metricas = [
    {
      titulo: "Investimento",
      valor: formatarMoeda(totais.investimento),
      descricao: "Total gasto no período",
    },
    {
      titulo: "Impressões",
      valor: formatarNumero(totais.impressoes),
      descricao: "Vezes que os anúncios foram exibidos",
    },
    {
      titulo: "Cliques",
      valor: formatarNumero(totais.cliques),
      descricao: "Total de cliques recebidos",
    },
    {
      titulo: "CTR",
      valor: formatarPorcentagem(totais.ctr),
      descricao: "Taxa de cliques por impressão",
    },
    {
      titulo: "CPC Médio",
      valor: formatarMoeda(totais.cpc),
      descricao: "Custo médio por clique",
    },
    {
      titulo: "Alcance",
      valor: formatarNumero(totais.alcance),
      descricao: "Pessoas únicas alcançadas",
    },
  ];

  if (carregando) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-7 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {metricas.map((m) => (
        <Card key={m.titulo}>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {m.titulo}
            </p>
            <p className="text-2xl font-bold tracking-tight">{m.valor}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground/70 leading-tight">
              {m.descricao}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
