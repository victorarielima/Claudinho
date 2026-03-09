const META_API_BASE = "https://graph.facebook.com/v23.0";

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
  effective_status: string;
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

export type PresetPeriodo =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "this_month"
  | "last_month";

export async function buscarAnunciosDoPeriodo(
  accountId: string,
  datePreset: PresetPeriodo = "last_30d"
): Promise<AnuncioMeta[]> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("META_ACCESS_TOKEN não configurado");
  }

  const fields = [
    "id",
    "name",
    "effective_status",
    "creative{id,thumbnail_url,body,title}",
    "campaign{id,name,objective}",
    "adset{id,name,daily_budget}",
    `insights.date_preset(${datePreset}){impressions,clicks,spend,ctr,cpc,cpm,reach,actions,cost_per_action_type}`,
  ].join(",");

  const url = new URL(`${META_API_BASE}/${accountId}/ads`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);

  const todosAnuncios: AnuncioMeta[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      const erro = await res.json();
      throw new Error(
        `Erro na API Meta: ${erro.error?.message ?? res.statusText}`
      );
    }
    const json: MetaApiResponse = await res.json();
    todosAnuncios.push(...json.data);
    nextUrl = json.paging?.next ?? null;
  }

  return todosAnuncios;
}
