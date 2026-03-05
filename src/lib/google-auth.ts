import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
];
const DEFAULT_SERVICE_ACCOUNT_PATH = "./secrets/evini-488110-2a7ec135e42d.json";

/**
 * Cria a instância de autenticação do Google.
 * - Em produção (Vercel): usa GOOGLE_SERVICE_ACCOUNT_JSON (JSON string na env var)
 * - Em local: usa o arquivo em GOOGLE_SERVICE_ACCOUNT_PATH ou fallback padrão
 */
export function getGoogleAuth() {
  const jsonString = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();

  if (jsonString) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(jsonString) as Record<string, unknown>;
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON inválido. Use o JSON completo da service account em uma única linha."
      );
    }

    return new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
    });
  }

  const keyFileFromEnv = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

  if (process.env.VERCEL && !keyFileFromEnv) {
    throw new Error(
      "Credencial Google não configurada no deploy. Defina GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente da Vercel."
    );
  }

  const keyFilePath = path.resolve(keyFileFromEnv ?? DEFAULT_SERVICE_ACCOUNT_PATH);

  if (!fs.existsSync(keyFilePath)) {
    throw new Error(
      `Arquivo de credencial não encontrado em "${keyFilePath}". Em deploy, configure GOOGLE_SERVICE_ACCOUNT_JSON.`
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: SCOPES,
  });
}
