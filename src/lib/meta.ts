import { META_API_BASE } from "./meta-config";
import { logger } from "./logger";
import { metaFetchWithRetry, safeResponseJson } from "./meta-retry";

export interface ContaMeta {
  id: string;
  nome: string;
}

export const CONTAS_META: ContaMeta[] = [
  { id: process.env.META_AD_ACCOUNT_EVINO!, nome: "Evino" },
  { id: process.env.META_AD_ACCOUNT_GRANDCRU!, nome: "GrandCru" },
];

export interface MetaInsights {
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpm: string;
  reach: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
}

export interface MetaCreative {
  id: string;
  thumbnail_url?: string;
  body?: string;
  title?: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective?: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  daily_budget?: string;
}

export interface AnuncioMeta {
  id: string;
  name: string;
  effective_status?: string;
  creative?: MetaCreative;
  campaign?: MetaCampaign;
  adset?: MetaAdSet;
  insights?: { data: MetaInsights[] };
}

interface MetaApiResponse {
  data: AnuncioMeta[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
  };
}

interface MetaInsightsRow {
  ad_id: string;
  ad_name: string;
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  reach?: string;
}

interface MetaInsightsResponse {
  data: MetaInsightsRow[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
  };
}

export interface ResumoMeta {
  investimento: number;
  impressoes: number;
  cliques: number;
  alcance: number;
  ctr: number;
  cpc: number;
}

export interface ResultadoPaginaAnuncios {
  data: AnuncioMeta[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export type PresetPeriodo =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "this_month"
  | "last_month";

export async function buscarResumoDoPeriodo(
  accountId: string,
  datePreset: PresetPeriodo = "last_30d"
): Promise<ResumoMeta> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("META_ACCESS_TOKEN não configurado");
  }

  const url = new URL(`${META_API_BASE}/${accountId}/insights`);
  url.searchParams.set("level", "account");
  url.searchParams.set("fields", "impressions,clicks,spend,ctr,cpc,reach");
  url.searchParams.set("date_preset", datePreset);
  url.searchParams.set("access_token", accessToken);

  logger.info("Fetching account summary from Meta API", {
    fn: "buscarResumoDoPeriodo",
    accountId,
    datePreset,
  });

  const res = await metaFetchWithRetry(url.toString());
  const json = await safeResponseJson(res);

  if (!res.ok) {
    logger.error("Failed to fetch account summary from Meta API", {
      fn: "buscarResumoDoPeriodo",
      accountId,
      datePreset,
      error: json.error?.message ?? res.statusText,
    });
    throw new Error(
      `Erro na API Meta: ${json.error?.message ?? res.statusText}`
    );
  }

  const resumo = Array.isArray((json as { data?: MetaInsights[] }).data)
    ? (json as { data: MetaInsights[] }).data[0]
    : undefined;

  return {
    investimento: Number.parseFloat(resumo?.spend ?? "0"),
    impressoes: Number.parseInt(resumo?.impressions ?? "0", 10),
    cliques: Number.parseInt(resumo?.clicks ?? "0", 10),
    alcance: Number.parseInt(resumo?.reach ?? "0", 10),
    ctr: Number.parseFloat(resumo?.ctr ?? "0"),
    cpc: Number.parseFloat(resumo?.cpc ?? "0"),
  };
}

function construirFiltroCanal(canal: "todos" | "ecommerce" | "clube") {
  if (canal === "todos") return null;
  return [
    {
      field: "campaign.name",
      operator: canal === "clube" ? "CONTAIN" : "NOT_CONTAIN",
      value: "clube",
    },
  ];
}

function mapearInsightParaAnuncio(row: MetaInsightsRow): AnuncioMeta {
  return {
    id: row.ad_id,
    name: row.ad_name,
    campaign: {
      id: row.campaign_id ?? "",
      name: row.campaign_name ?? "—",
      objective: row.objective,
    },
    insights: {
      data: [
        {
          impressions: row.impressions ?? "0",
          clicks: row.clicks ?? "0",
          spend: row.spend ?? "0",
          ctr: row.ctr ?? "0",
          cpc: row.cpc ?? "0",
          cpm: row.cpm ?? "0",
          reach: row.reach ?? "0",
        },
      ],
    },
  };
}

export async function buscarPaginaAnunciosDoPeriodo(
  accountId: string,
  datePreset: PresetPeriodo = "last_30d",
  opts: { canal?: "todos" | "ecommerce" | "clube"; limit?: number; after?: string | null } = {}
): Promise<ResultadoPaginaAnuncios> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("META_ACCESS_TOKEN não configurado");
  }

  const { canal = "todos", limit = 25, after } = opts;

  const url = new URL(`${META_API_BASE}/${accountId}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set(
    "fields",
    "ad_id,ad_name,campaign_id,campaign_name,objective,impressions,clicks,spend,ctr,cpc,cpm,reach"
  );
  url.searchParams.set("date_preset", datePreset);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort[0]", "spend_descending");
  if (after) url.searchParams.set("after", after);

  const filtro = construirFiltroCanal(canal);
  if (filtro) {
    url.searchParams.set("filtering", JSON.stringify(filtro));
  }

  url.searchParams.set("access_token", accessToken);

  logger.info("Fetching paginated ad insights from Meta API", {
    fn: "buscarPaginaAnunciosDoPeriodo",
    accountId,
    datePreset,
    canal,
    limit,
    after,
  });

  const res = await metaFetchWithRetry(url.toString());
  const json = await safeResponseJson(res);

  if (!res.ok) {
    logger.error("Failed to fetch paginated ad insights from Meta API", {
      fn: "buscarPaginaAnunciosDoPeriodo",
      accountId,
      datePreset,
      canal,
      limit,
      error: json.error?.message ?? res.statusText,
    });
    throw new Error(
      `Erro na API Meta: ${json.error?.message ?? res.statusText}`
    );
  }

  const data = Array.isArray((json as MetaInsightsResponse).data)
    ? (json as MetaInsightsResponse).data
    : [];

  return {
    data: data.map(mapearInsightParaAnuncio),
    nextCursor: (json as MetaInsightsResponse).paging?.cursors?.after ?? null,
    hasNextPage: Boolean((json as MetaInsightsResponse).paging?.next),
  };
}
