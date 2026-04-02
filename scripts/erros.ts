#!/usr/bin/env npx tsx
/**
 * Script local para investigar erros de criação de anúncios.
 *
 * Uso:
 *   npx tsx scripts/erros.ts              # erros dos últimos 7 dias
 *   npx tsx scripts/erros.ts 30           # erros dos últimos 30 dias
 *   npx tsx scripts/erros.ts 7 --full     # mostra detalhes de cada erro
 */

import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const days = parseInt(process.argv[2] || "7", 10);
const full = process.argv.includes("--full");

const since = new Date();
since.setDate(since.getDate() - days);

interface AuditEntry {
  id: string;
  entity_id: string;
  changes: { error_message?: { new?: string }; status?: { new?: string } };
  user_name: string | null;
  created_at: string;
}

async function fetchErrors(): Promise<AuditEntry[]> {
  const params = new URLSearchParams({
    action: "eq.error",
    "created_at": `gte.${since.toISOString()}`,
    order: "created_at.desc",
    limit: "500",
  });

  const res = await fetch(`${SUPABASE_URL}/rest/v1/audit_log?${params}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

function extractMessage(entry: AuditEntry): string {
  return entry.changes?.error_message?.new ?? "(sem mensagem)";
}

function normalizePattern(msg: string): string {
  return msg
    .replace(/\[trace [^\]]+\]/g, "")
    .replace(/\[subcode \d+\]/g, "[subcode ...]")
    .replace(/#\d+/g, "#...")
    .replace(/ID \d+/g, "ID ...")
    .trim();
}

async function main() {
  const errors = await fetchErrors();

  if (errors.length === 0) {
    console.log(`\n✅ Nenhum erro nos últimos ${days} dias.\n`);
    return;
  }

  console.log(`\n📊 ${errors.length} erro(s) nos últimos ${days} dias\n`);

  // Agrupar por padrão de erro
  const groups = new Map<string, AuditEntry[]>();
  for (const e of errors) {
    const pattern = normalizePattern(extractMessage(e));
    if (!groups.has(pattern)) groups.set(pattern, []);
    groups.get(pattern)!.push(e);
  }

  // Ordenar por frequência
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log("─".repeat(80));

  for (const [pattern, entries] of sorted) {
    const first = entries[entries.length - 1]!;
    const last = entries[0]!;
    console.log(`\n🔴 ${entries.length}x — ${pattern}`);
    console.log(`   Primeiro: ${fmtDate(first.created_at)}  |  Último: ${fmtDate(last.created_at)}`);
    console.log(`   Anúncios afetados: ${new Set(entries.map((e) => e.entity_id)).size}`);

    if (full) {
      console.log("");
      for (const e of entries) {
        console.log(`   • ${fmtDate(e.created_at)}  ad=${e.entity_id.slice(0, 8)}  user=${e.user_name ?? e.id.slice(0, 8)}`);
      }
    }
  }

  console.log("\n" + "─".repeat(80));
  console.log(`\nDica: use --full para ver cada ocorrência individualmente.\n`);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

main().catch((err) => {
  console.error("Erro ao buscar logs:", err.message);
  process.exit(1);
});
