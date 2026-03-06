import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth";

function getAuth() {
  return getGoogleAuth();
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

export async function lerLinhas(nomeAba: string): Promise<LinhaAnuncio[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID não configurado");
  }

  // Colunas: A-I (campaign…cta), J (linkAux — não usado), K (linkAux2),
  //          L (linkAnuncio), M (linkVideo), N (statusAutomacao),
  //          O (adIdGerado), P (pageId), Q (accountId), R (data)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${nomeAba}'!A:R`,
  });

  const linhas = res.data.values;
  if (!linhas || linhas.length <= 1) {
    return [];
  }

  const todas: LinhaAnuncio[] = [];

  for (let i = 1; i < linhas.length; i++) {
    const row = linhas[i];
    const statusAutomacao = (row[13] ?? "").trim();

    // Ignorar linhas sem dados essenciais
    if (!row[4] && !row[3]) continue;

    todas.push({
      indiceLinha: i + 1,
      campaign: row[0] ?? "",
      adSet: row[1] ?? "",
      campaignId: row[2] ?? "",
      adSetId: row[3] ?? "",
      adName: row[4] ?? "",
      textoPrincipal: row[5] ?? "",
      titulo: row[6] ?? "",
      descricao: row[7] ?? "",
      cta: row[8] ?? "",
      linkAnuncio: row[11] ?? "",
      linkVideo: row[12] ?? "",
      statusAutomacao,
      adIdGerado: row[14] ?? "",
      pageId: row[15] ?? "",
      accountId: row[16] ?? "",
      data: row[17] ?? "",
    });
  }

  return todas;
}

export async function atualizarLinha(
  nomeAba: string,
  indiceLinha: number,
  adId: string,
  accountId: string
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID não configurado");
  }

  const agora = new Date();
  const dataCriacao = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  // Atualizar Status (N), Ad ID (O), Account ID (Q), Data (R)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: `'${nomeAba}'!N${indiceLinha}`,
          values: [["Concluído"]],
        },
        {
          range: `'${nomeAba}'!O${indiceLinha}`,
          values: [[adId]],
        },
        {
          range: `'${nomeAba}'!Q${indiceLinha}`,
          values: [[accountId]],
        },
        {
          range: `'${nomeAba}'!R${indiceLinha}`,
          values: [[dataCriacao]],
        },
      ],
    },
  });
}

/**
 * Lê o status atual da coluna N direto da planilha (sem cache).
 * Retorna o valor raw da célula (ex: "Pendente", "Processando", "Concluído", "Erro: ...").
 */
export async function lerStatusLinha(nomeAba: string, indiceLinha: number): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID não configurado");
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${nomeAba}'!N${indiceLinha}`,
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

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${nomeAba}'!N${indiceLinha}`,
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
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID não configurado");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${nomeAba}'!Q${indiceLinha}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[accountId]],
    },
  });
}

export async function marcarErro(
  nomeAba: string,
  indiceLinha: number,
  mensagemErro: string
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID não configurado");
  }

  const agora = new Date();
  const dataErro = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: `'${nomeAba}'!N${indiceLinha}`,
          values: [[`Erro: ${mensagemErro.slice(0, 100)}`]],
        },
        {
          range: `'${nomeAba}'!R${indiceLinha}`,
          values: [[dataErro]],
        },
      ],
    },
  });
}
