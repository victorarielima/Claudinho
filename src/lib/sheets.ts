import { google } from "googleapis";
import path from "path";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
];

function getAuth() {
  const keyFilePath = path.resolve(
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH ?? "./secrets/evini-488110-2a7ec135e42d.json"
  );
  return new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: SCOPES,
  });
}

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
}

let nomeAbaCacheado: string | null = null;

async function obterNomeAba(): Promise<string> {
  if (nomeAbaCacheado) return nomeAbaCacheado;

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const nome = meta.data.sheets?.[0]?.properties?.title;
  if (!nome) throw new Error("Não foi possível obter o nome da aba da planilha");

  nomeAbaCacheado = nome;
  return nome;
}

export async function lerLinhas(): Promise<LinhaAnuncio[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID não configurado");
  }

  const nomeAba = await obterNomeAba();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${nomeAba}'!A:O`,
  });

  const linhas = res.data.values;
  if (!linhas || linhas.length <= 1) {
    return [];
  }

  const todas: LinhaAnuncio[] = [];

  for (let i = 1; i < linhas.length; i++) {
    const row = linhas[i];
    const statusAutomacao = (row[11] ?? "").trim();

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
      linkAnuncio: row[9] ?? "",
      linkVideo: row[10] ?? "",
      statusAutomacao,
      adIdGerado: row[12] ?? "",
      pageId: row[13] ?? "",
      accountId: row[14] ?? "",
    });
  }

  return todas;
}

export async function atualizarLinha(
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

  const nomeAba = await obterNomeAba();

  // Atualizar Status (L), Ad ID (M), Account ID (O)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: `'${nomeAba}'!L${indiceLinha}`,
          values: [["Concluído"]],
        },
        {
          range: `'${nomeAba}'!M${indiceLinha}`,
          values: [[adId]],
        },
        {
          range: `'${nomeAba}'!O${indiceLinha}`,
          values: [[accountId]],
        },
      ],
    },
  });
}

export async function marcarErro(
  indiceLinha: number,
  mensagemErro: string
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_ID não configurado");
  }

  const nomeAba = await obterNomeAba();

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: `'${nomeAba}'!L${indiceLinha}`,
          values: [[`Erro: ${mensagemErro.slice(0, 100)}`]],
        },
      ],
    },
  });
}
