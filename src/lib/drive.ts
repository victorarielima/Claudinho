import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth";

function getAuth() {
  return getGoogleAuth();
}

/**
 * Extrai o file ID de um link de compartilhamento do Google Drive.
 * Aceita formatos como:
 * - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * - https://drive.google.com/open?id=FILE_ID
 */
export function extrairFileId(driveUrl: string): string {
  // Formato /file/d/FILE_ID/
  const matchFile = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile) return matchFile[1];

  // Formato ?id=FILE_ID
  const matchId = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId) return matchId[1];

  throw new Error(`Não foi possível extrair file ID de: ${driveUrl}`);
}

export interface ArquivoDrive {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

/**
 * Verifica se o service account tem acesso ao arquivo no Drive.
 * Retorna o nome do arquivo se acessível, ou uma mensagem de erro.
 */
export async function verificarAcessoArquivo(
  driveUrl: string
): Promise<{ acessivel: boolean; nomeArquivo?: string; erro?: string }> {
  try {
    const fileId = extrairFileId(driveUrl);
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    const meta = await drive.files.get({
      fileId,
      fields: "name,mimeType,size",
      supportsAllDrives: true,
    });

    return {
      acessivel: true,
      nomeArquivo: meta.data.name ?? undefined,
    };
  } catch (error: unknown) {
    const gaxiosError = error as { code?: number; message?: string };

    if (gaxiosError.code === 404) {
      return {
        acessivel: false,
        erro: "Arquivo não encontrado. Verifique se o link do Drive está correto.",
      };
    }

    if (gaxiosError.code === 403) {
      const msg = gaxiosError.message ?? "";
      if (msg.includes("has not been used") || msg.includes("is disabled")) {
        return {
          acessivel: false,
          erro: "A Google Drive API não está ativada no projeto GCP. Ative em: console.cloud.google.com/apis/api/drive.googleapis.com",
        };
      }
      return {
        acessivel: false,
        erro: `Sem permissão. Compartilhe o arquivo com: sheets-facebook-ads@evini-488110.iam.gserviceaccount.com`,
      };
    }

    return {
      acessivel: false,
      erro: gaxiosError.message ?? "Erro desconhecido ao acessar o arquivo.",
    };
  }
}

export function getServiceAccountEmail(): string {
  return "sheets-facebook-ads@evini-488110.iam.gserviceaccount.com";
}

export async function baixarArquivoDrive(
  driveUrl: string
): Promise<ArquivoDrive> {
  const fileId = extrairFileId(driveUrl);
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  // Buscar metadados do arquivo
  const meta = await drive.files.get({
    fileId,
    fields: "name,mimeType",
    supportsAllDrives: true,
  });

  const fileName = meta.data.name ?? `video_${fileId}`;
  const mimeType = meta.data.mimeType ?? "video/mp4";

  // Baixar conteúdo do arquivo
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );

  const buffer = Buffer.from(res.data as ArrayBuffer);

  return { buffer, mimeType, fileName };
}
