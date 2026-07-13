import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth";
import type { Ad } from "./db";

function getAuth() {
  return getGoogleAuth();
}

type CampoPlanilha =
  | "campaign"
  | "adSet"
  | "campaignId"
  | "adSetId"
  | "tipoPlanilha"
  | "adName"
  | "textoPrincipal"
  | "titulo"
  | "descricao"
  | "cta"
  | "linkAnuncio"
  | "linkVideo"
  | "statusAutomacao"
  | "adIdGerado"
  | "pageId"
  | "accountId"
  | "data";

const CAMPOS_ESSENCIAIS_PLANILHA: CampoPlanilha[] = [
  "campaign",
  "adSet",
  "adSetId",
  "tipoPlanilha",
  "adName",
  "linkVideo",
  "statusAutomacao",
];

const HEADER_ALIASES: Record<CampoPlanilha, string[]> = {
  campaign: ["campaign", "campanha", "campaign name", "nome da campanha"],
  adSet: ["ad set", "adset", "conjunto", "conjunto de anuncios", "nome do ad set"],
  campaignId: ["campaign id", "id da campanha", "id campanha"],
  adSetId: ["ad set id", "adset id", "id do ad set", "id ad set", "id conjunto"],
  tipoPlanilha: ["tipo", "tipo do anuncio", "tipo do anuncio", "tipo do criativo"],
  adName: ["ad name", "nome do anuncio", "nome anuncio"],
  textoPrincipal: [
    "texto principal",
    "texto",
    "primary text",
    "texto do anuncio",
    "copy principal",
  ],
  titulo: ["titulo", "title", "headline"],
  descricao: ["descricao", "description", "link description"],
  cta: ["cta", "call to action"],
  linkAnuncio: ["link anuncio", "link do anuncio", "url anuncio", "link campanha"],
  linkVideo: [
    "link video",
    "link video drive",
    "link do video",
    "link do video drive",
    "video",
    "midia",
    "link imagem/video",
  ],
  statusAutomacao: ["status", "status automacao", "status da automacao"],
  adIdGerado: ["ad id", "id do anuncio", "meta ad id", "ad id gerado"],
  pageId: ["page id", "id da pagina", "pagina id"],
  accountId: ["account id", "id da conta", "meta account id", "ad account id"],
  data: ["data", "data criacao", "criado em"],
};

const FALLBACK_COLUMN_INDEXES: Record<CampoPlanilha, number> = {
  campaign: 0,
  adSet: 1,
  campaignId: 2,
  adSetId: 3,
  tipoPlanilha: 4,
  adName: 5,
  textoPrincipal: 6,
  titulo: 7,
  descricao: 8,
  cta: 9,
  linkAnuncio: 11,
  linkVideo: 12,
  statusAutomacao: 13,
  adIdGerado: 14,
  pageId: 15,
  accountId: 16,
  data: 17,
};

function normalizarCabecalho(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function encontrarIndiceCabecalho(cabecalhos: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const indice = cabecalhos.indexOf(normalizarCabecalho(alias));
    if (indice >= 0) return indice;
  }
  return -1;
}

function resolverIndicesColunas(cabecalhoBruto: string[] | undefined): Record<CampoPlanilha, number> {
  const cabecalhos = (cabecalhoBruto ?? []).map((valor) => normalizarCabecalho(valor));
  const encontrouCabecalhos = cabecalhos.some((valor) => valor.length > 0);

  return (Object.keys(FALLBACK_COLUMN_INDEXES) as CampoPlanilha[]).reduce(
    (acc, campo) => {
      const indiceCabecalho = encontrouCabecalhos
        ? encontrarIndiceCabecalho(cabecalhos, HEADER_ALIASES[campo])
        : -1;

      acc[campo] = indiceCabecalho >= 0 ? indiceCabecalho : FALLBACK_COLUMN_INDEXES[campo];
      return acc;
    },
    {} as Record<CampoPlanilha, number>
  );
}

export interface DiagnosticoPlanilha {
  colunasObrigatoriasAusentes: CampoPlanilha[];
  colunasEmFallback: CampoPlanilha[];
  cabecalhosDuplicados: string[];
  usandoCabecalho: boolean;
}

function diagnosticarCabecalho(cabecalhoBruto: string[] | undefined): DiagnosticoPlanilha {
  const cabecalhos = (cabecalhoBruto ?? []).map((valor) => normalizarCabecalho(valor));
  const usandoCabecalho = cabecalhos.some((valor) => valor.length > 0);
  const frequencias = new Map<string, number>();

  for (const cabecalho of cabecalhos) {
    if (!cabecalho) continue;
    frequencias.set(cabecalho, (frequencias.get(cabecalho) ?? 0) + 1);
  }

  const cabecalhosDuplicados = Array.from(frequencias.entries())
    .filter(([, total]) => total > 1)
    .map(([cabecalho]) => cabecalho);

  const colunasObrigatoriasAusentes: CampoPlanilha[] = [];
  const colunasEmFallback: CampoPlanilha[] = [];

  for (const campo of CAMPOS_ESSENCIAIS_PLANILHA) {
    const indiceCabecalho = usandoCabecalho
      ? encontrarIndiceCabecalho(cabecalhos, HEADER_ALIASES[campo])
      : -1;

    if (indiceCabecalho === -1) {
      colunasEmFallback.push(campo);
      if (usandoCabecalho) {
        colunasObrigatoriasAusentes.push(campo);
      }
    }
  }

  return {
    colunasObrigatoriasAusentes,
    colunasEmFallback,
    cabecalhosDuplicados,
    usandoCabecalho,
  };
}

function obterCelula(row: string[], colunas: Record<CampoPlanilha, number>, campo: CampoPlanilha): string {
  return (row[colunas[campo]] ?? "").trim();
}

function indiceParaColunaA1(indiceBaseZero: number): string {
  let restante = indiceBaseZero + 1;
  let coluna = "";

  while (restante > 0) {
    const modulo = (restante - 1) % 26;
    coluna = String.fromCharCode(65 + modulo) + coluna;
    restante = Math.floor((restante - 1) / 26);
  }

  return coluna;
}

async function obterSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

async function obterSpreadsheetId(): Promise<string> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID não configurado");
  }

  return spreadsheetId;
}

async function lerCabecalhoComDiagnostico(nomeAba: string): Promise<{
  colunas: Record<CampoPlanilha, number>;
  diagnostico: DiagnosticoPlanilha;
}> {
  const sheets = await obterSheetsClient();
  const spreadsheetId = await obterSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${nomeAba}'!1:1`,
  });

  return {
    colunas: resolverIndicesColunas(res.data.values?.[0]),
    diagnostico: diagnosticarCabecalho(res.data.values?.[0]),
  };
}

async function lerCabecalho(nomeAba: string): Promise<Record<CampoPlanilha, number>> {
  const { colunas } = await lerCabecalhoComDiagnostico(nomeAba);
  return colunas;
}

export const ABAS = {
  evino: "Evino_Anuncios_Novos",
  grandcru: "GrandCru_Anuncios_Novos",
} as const;

export type ChaveAba = keyof typeof ABAS;

export interface LinhaAnuncio {
  indiceLinha: number; // índice da linha na planilha (2-indexed, 1 = header)
  campaign: string;
  adSet: string;
  campaignId: string;
  adSetId: string;
  tipoPlanilha: string;
  adName: string;
  textoPrincipal: string;
  titulo: string;
  descricao: string;
  cta: string;
  linkAnuncio: string;
  linkVideo: string;
  statusAutomacao: string;
  adIdGerado: string;
  pageId: string;
  accountId: string;
  data: string;
}

export async function lerLinhasComDiagnostico(nomeAba: string): Promise<{
  linhas: LinhaAnuncio[];
  diagnostico: DiagnosticoPlanilha;
}> {
  const sheets = await obterSheetsClient();
  const spreadsheetId = await obterSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${nomeAba}'`,
  });

  const linhas = res.data.values;
  if (!linhas || linhas.length <= 1) {
    return {
      linhas: [],
      diagnostico: diagnosticarCabecalho(linhas?.[0]),
    };
  }

  const colunas = resolverIndicesColunas(linhas[0]);
  const diagnostico = diagnosticarCabecalho(linhas[0]);
  const todas: LinhaAnuncio[] = [];

  for (let i = 1; i < linhas.length; i++) {
    const row = linhas[i];
    const statusAutomacao = obterCelula(row, colunas, "statusAutomacao");

    // Ignorar linhas sem dados essenciais
    if (!obterCelula(row, colunas, "adName") && !obterCelula(row, colunas, "adSetId")) continue;

    todas.push({
      indiceLinha: i + 1,
      campaign: obterCelula(row, colunas, "campaign"),
      adSet: obterCelula(row, colunas, "adSet"),
      campaignId: obterCelula(row, colunas, "campaignId"),
      adSetId: obterCelula(row, colunas, "adSetId"),
      tipoPlanilha: obterCelula(row, colunas, "tipoPlanilha"),
      adName: obterCelula(row, colunas, "adName"),
      textoPrincipal: obterCelula(row, colunas, "textoPrincipal"),
      titulo: obterCelula(row, colunas, "titulo"),
      descricao: obterCelula(row, colunas, "descricao"),
      cta: obterCelula(row, colunas, "cta"),
      linkAnuncio: obterCelula(row, colunas, "linkAnuncio"),
      linkVideo: obterCelula(row, colunas, "linkVideo"),
      statusAutomacao,
      adIdGerado: obterCelula(row, colunas, "adIdGerado"),
      pageId: obterCelula(row, colunas, "pageId"),
      accountId: obterCelula(row, colunas, "accountId"),
      data: obterCelula(row, colunas, "data"),
    });
  }

  return {
    linhas: todas,
    diagnostico,
  };
}

export async function lerLinhas(nomeAba: string): Promise<LinhaAnuncio[]> {
  const { linhas } = await lerLinhasComDiagnostico(nomeAba);
  return linhas;
}

export async function atualizarLinha(
  nomeAba: string,
  indiceLinha: number,
  adId: string,
  accountId: string
): Promise<void> {
  const sheets = await obterSheetsClient();
  const spreadsheetId = await obterSpreadsheetId();
  const colunas = await lerCabecalho(nomeAba);

  const agora = new Date();
  const dataCriacao = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const colunaStatus = indiceParaColunaA1(colunas.statusAutomacao);
  const colunaAdId = indiceParaColunaA1(colunas.adIdGerado);
  const colunaAccountId = indiceParaColunaA1(colunas.accountId);
  const colunaData = indiceParaColunaA1(colunas.data);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: `'${nomeAba}'!${colunaStatus}${indiceLinha}`,
          values: [["Concluído"]],
        },
        {
          range: `'${nomeAba}'!${colunaAdId}${indiceLinha}`,
          values: [[adId]],
        },
        {
          range: `'${nomeAba}'!${colunaAccountId}${indiceLinha}`,
          values: [[accountId]],
        },
        {
          range: `'${nomeAba}'!${colunaData}${indiceLinha}`,
          values: [[dataCriacao]],
        },
      ],
    },
  });
}

/**
 * Lê o status atual diretamente da coluna mapeada por cabeçalho (sem cache).
 * Retorna o valor raw da célula (ex: "Pendente", "Processando", "Concluído", "Erro: ...").
 */
export async function lerStatusLinha(nomeAba: string, indiceLinha: number): Promise<string> {
  const sheets = await obterSheetsClient();
  const spreadsheetId = await obterSpreadsheetId();
  const colunas = await lerCabecalho(nomeAba);
  const colunaStatus = indiceParaColunaA1(colunas.statusAutomacao);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${nomeAba}'!${colunaStatus}${indiceLinha}`,
  });

  return (res.data.values?.[0]?.[0] ?? "").trim();
}

/**
 * Marca a linha como "Processando" na planilha.
 * Retorna true se conseguiu reservar (status anterior era Pendente ou Erro).
 * Retorna false se outro processo já reservou.
 */
export async function reservarLinha(nomeAba: string, indiceLinha: number): Promise<boolean> {
  const statusAtual = await lerStatusLinha(nomeAba, indiceLinha);

  // Só permite processar se estiver Pendente ou com Erro
  if (statusAtual !== "Pendente" && !statusAtual.startsWith("Erro")) {
    return false;
  }

  const sheets = await obterSheetsClient();
  const spreadsheetId = await obterSpreadsheetId();
  const colunas = await lerCabecalho(nomeAba);
  const colunaStatus = indiceParaColunaA1(colunas.statusAutomacao);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${nomeAba}'!${colunaStatus}${indiceLinha}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["Processando"]],
    },
  });

  return true;
}

export async function atualizarAccountId(
  nomeAba: string,
  indiceLinha: number,
  accountId: string
): Promise<void> {
  const sheets = await obterSheetsClient();
  const spreadsheetId = await obterSpreadsheetId();
  const colunas = await lerCabecalho(nomeAba);
  const colunaAccountId = indiceParaColunaA1(colunas.accountId);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${nomeAba}'!${colunaAccountId}${indiceLinha}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[accountId]],
    },
  });
}

// ─── Exportação automática para a planilha de acompanhamento ──
//
// Quando um anúncio é criado pelo formulário, replicamos a linha numa
// planilha externa de acompanhamento (uma aba por marca), logo abaixo da
// última linha preenchida. Usa `values.append` com INSERT_ROWS, que detecta
// sozinho o fim da tabela.
//
// IMPORTANTE: a escrita usa a service account (getGoogleAuth). A planilha
// precisa estar compartilhada como Editor com o e-mail da service account
// (client_email do JSON de credenciais) — não basta o usuário ter acesso.

const SPREADSHEET_EXPORTACAO_ID =
  process.env.GOOGLE_SHEETS_EXPORT_ID || "1SIm9wuzoAHf5rNwECZPASBQM12uPKUTNcacQeeFm17A";

// Mapeia a marca para a aba de destino. Ordem importa: testa por substring.
const ABAS_EXPORTACAO: { contem: string; aba: string }[] = [
  { contem: "grand", aba: "Grand Cru - Meta" },
  { contem: "evino", aba: "Evino - Meta" },
];

// A aba de acompanhamento ("Evino - Meta" / "Grand Cru - Meta") só tem estas 4
// colunas de conteúdo, nesta ordem: Texto Principal (Legenda), Título, Descrição,
// CTA (as colunas Observações, Link Click Up e Data Da Subida são preenchidas
// manualmente). O mapeamento é feito por cabeçalho — não escrevemos mais
// Conjunto/Link/Ad Name, que não existem na aba e deslocavam todas as colunas.
type CampoExportacao = "textoPrincipal" | "titulo" | "descricao" | "cta";

const EXPORT_HEADER_ALIASES: Record<CampoExportacao, string[]> = {
  textoPrincipal: ["texto principal legenda", "texto principal", "legenda", "texto"],
  titulo: ["titulo", "title", "headline"],
  descricao: ["descricao", "description"],
  cta: ["cta", "call to action"],
};

// Posição padrão das colunas caso o cabeçalho não seja encontrado.
const EXPORT_FALLBACK_INDEX: Record<CampoExportacao, number> = {
  textoPrincipal: 0,
  titulo: 1,
  descricao: 2,
  cta: 3,
};

export interface LinhaExportacao {
  textoPrincipal: string;
  titulo: string;
  descricao: string;
  cta: string;
}

/** Resolve a aba de exportação a partir do nome da marca. */
export function resolverAbaExportacao(brandName: string): string | null {
  const nome = brandName.toLowerCase();
  for (const { contem, aba } of ABAS_EXPORTACAO) {
    if (nome.includes(contem)) return aba;
  }
  return null;
}

/** Converte um Ad (já criado) numa linha da planilha de acompanhamento. */
export function linhaExportacaoDeAd(ad: Ad): LinhaExportacao {
  return {
    textoPrincipal: ad.texto_principal ?? "",
    titulo: ad.titulo ?? "",
    descricao: ad.descricao ?? "",
    cta: ad.cta,
  };
}

/**
 * Acrescenta linhas de anúncios na planilha externa de acompanhamento,
 * abaixo da última linha preenchida da aba correspondente à marca.
 * Lança erro se a marca não tiver aba mapeada — o chamador deve decidir
 * se isso quebra ou não o fluxo (a criação do anúncio não deve depender disso).
 */
export async function appendAnunciosExportados(
  brandName: string,
  linhas: LinhaExportacao[]
): Promise<void> {
  if (linhas.length === 0) return;

  const aba = resolverAbaExportacao(brandName);
  if (!aba) {
    throw new Error(`Marca "${brandName}" não tem aba mapeada na planilha de acompanhamento`);
  }

  const sheets = await obterSheetsClient();

  // Mapear colunas pelo cabeçalho (com fallback para a ordem padrão).
  const cab = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_EXPORTACAO_ID,
    range: `'${aba}'!1:1`,
  });
  const cabecalhos = (cab.data.values?.[0] ?? []).map((valor) => normalizarCabecalho(String(valor)));
  const usandoCabecalho = cabecalhos.some((valor) => valor.length > 0);

  const indices = (Object.keys(EXPORT_FALLBACK_INDEX) as CampoExportacao[]).reduce(
    (acc, campo) => {
      const indiceCabecalho = usandoCabecalho
        ? encontrarIndiceCabecalho(cabecalhos, EXPORT_HEADER_ALIASES[campo])
        : -1;
      acc[campo] = indiceCabecalho >= 0 ? indiceCabecalho : EXPORT_FALLBACK_INDEX[campo];
      return acc;
    },
    {} as Record<CampoExportacao, number>
  );

  const maxIndice = Math.max(...Object.values(indices));
  const colunaFinal = indiceParaColunaA1(maxIndice);

  const values = linhas.map((linha) => {
    const row = new Array<string>(maxIndice + 1).fill("");
    row[indices.textoPrincipal] = linha.textoPrincipal;
    row[indices.titulo] = linha.titulo;
    row[indices.descricao] = linha.descricao;
    row[indices.cta] = linha.cta;
    return row;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_EXPORTACAO_ID,
    range: `'${aba}'!A:${colunaFinal}`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

export async function marcarErro(
  nomeAba: string,
  indiceLinha: number,
  mensagemErro: string
): Promise<void> {
  const sheets = await obterSheetsClient();
  const spreadsheetId = await obterSpreadsheetId();
  const colunas = await lerCabecalho(nomeAba);

  const agora = new Date();
  const dataErro = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const colunaStatus = indiceParaColunaA1(colunas.statusAutomacao);
  const colunaData = indiceParaColunaA1(colunas.data);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: `'${nomeAba}'!${colunaStatus}${indiceLinha}`,
          values: [[`Erro: ${mensagemErro.slice(0, 100)}`]],
        },
        {
          range: `'${nomeAba}'!${colunaData}${indiceLinha}`,
          values: [[dataErro]],
        },
      ],
    },
  });
}
