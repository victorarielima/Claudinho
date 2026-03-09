"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnuncioMeta } from "@/lib/meta";

interface TabelaAnunciosProps {
  anuncios: AnuncioMeta[];
  carregando: boolean;
}

function formatarNumero(valor: string | undefined): string {
  if (!valor) return "—";
  const num = parseInt(valor, 10);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("pt-BR").format(num);
}

function formatarMoeda(valor: string | undefined): string {
  if (!valor) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(parseFloat(valor));
}

function formatarPorcentagem(valor: string | undefined): string {
  if (!valor) return "—";
  return `${parseFloat(valor).toFixed(2)}%`;
}

const OBJETIVOS_PT: Record<string, string> = {
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_LEADS: "Leads",
  OUTCOME_SALES: "Vendas",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_APP_PROMOTION: "App",
  CONVERSIONS: "Conversões",
  LINK_CLICKS: "Cliques no link",
  REACH: "Alcance",
  BRAND_AWARENESS: "Reconhecimento",
  POST_ENGAGEMENT: "Engajamento",
  VIDEO_VIEWS: "Visualizações",
  LEAD_GENERATION: "Leads",
  MESSAGES: "Mensagens",
  PRODUCT_CATALOG_SALES: "Vendas catálogo",
};

function traduzirObjetivo(objetivo?: string): string {
  if (!objetivo) return "—";
  return OBJETIVOS_PT[objetivo] ?? objetivo;
}

export function TabelaAnuncios({ anuncios, carregando }: TabelaAnunciosProps) {
  if (carregando) {
    return (
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {["Anúncio", "Campanha", "Objetivo", "Invest.", "Impressões", "Cliques", "CTR", "CPC", "CPM", "Alcance"].map((col) => (
                <TableHead key={col} className="text-xs font-medium uppercase tracking-wider">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (anuncios.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Nenhum anúncio com investimento
        </p>
        <p className="text-xs text-muted-foreground/70">
          Não há anúncios com gasto acima de R$0 no período selecionado.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="min-w-[220px] text-xs font-medium uppercase tracking-wider">
              Anúncio
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider">
              Campanha
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider">
              Objetivo
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider">
              Invest.
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider">
              Impressões
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider">
              Cliques
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider">
              CTR
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider">
              CPC
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider">
              CPM
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider">
              Alcance
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {anuncios.map((anuncio) => {
            const insight = anuncio.insights?.data?.[0];
            return (
              <TableRow key={anuncio.id} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-sm leading-tight">
                      {anuncio.name}
                    </span>
                    <Badge
                      variant="secondary"
                      className="w-fit text-[10px] px-1.5 py-0 h-4 font-normal"
                    >
                      {anuncio.effective_status}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>{anuncio.campaign?.name ?? "—"}</span>
                    {anuncio.campaign?.name && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                          anuncio.campaign.name.toLowerCase().includes("clube")
                            ? "border-purple-200 bg-purple-50 text-purple-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }`}
                      >
                        {anuncio.campaign.name.toLowerCase().includes("clube") ? "Clube" : "Ecommerce"}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs font-normal">
                    {traduzirObjetivo(anuncio.campaign?.objective)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {formatarMoeda(insight?.spend)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatarNumero(insight?.impressions)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatarNumero(insight?.clicks)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatarPorcentagem(insight?.ctr)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatarMoeda(insight?.cpc)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatarMoeda(insight?.cpm)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatarNumero(insight?.reach)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
