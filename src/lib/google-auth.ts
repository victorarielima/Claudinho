import { google } from "googleapis";
import path from "path";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
];

/**
 * Cria a instância de autenticação do Google.
 * - Em produção (Vercel): usa GOOGLE_SERVICE_ACCOUNT_JSON (JSON string na env var)
 * - Em local: usa o arquivo em GOOGLE_SERVICE_ACCOUNT_PATH ou fallback padrão
 */
export function getGoogleAuth() {
  const jsonString = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (jsonString) {
    const credentials = JSON.parse(jsonString);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
    });
  }

  const keyFilePath = path.resolve(
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH ?? "./secrets/evini-488110-2a7ec135e42d.json"
  );
  return new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: SCOPES,
  });
}
