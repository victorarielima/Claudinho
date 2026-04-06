import { NextResponse } from "next/server";
import { META_API_BASE } from "@/lib/meta-config";
import { metaFetchWithRetry, safeResponseJson } from "@/lib/meta-retry";
import { listarAdsSincronizaveis, atualizarMetaEffectiveStatus } from "@/lib/db";
import { logger } from "@/lib/logger";

const STATUS_QUE_VOLTAM_PARA_ERRO = new Set([
  "DELETED",
  "DISAPPROVED",
  "WITH_ISSUES",
]);

function getAccessToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN não configurado");
  return token;
}

interface SyncResult {
  /** IDs que retornaram effective_status do Meta */
  encontrados: Map<string, string>;
  /** IDs que o Meta confirmou não existir (erro 803 ou similar) */
  deletados: Set<string>;
}

/**
 * Consulta Meta API individualmente por ad.
 * Usa chamadas individuais GET /{ad_id}?fields=effective_status para ter
 * certeza se o ad existe ou não (batch ?ids= não diferencia "não retornou"
 * de "deletado").
 */
async function buscarStatusMeta(metaAdIds: string[]): Promise<SyncResult> {
  const token = getAccessToken();
  const encontrados = new Map<string, string>();
  const deletados = new Set<string>();

  // Executar em paralelo com limite de concorrência
  const CONCURRENCY = 5;
  for (let i = 0; i < metaAdIds.length; i += CONCURRENCY) {
    const batch = metaAdIds.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (adId) => {
        const url = `${META_API_BASE}/${adId}?fields=effective_status&access_token=${token}`;
        const res = await metaFetchWithRetry(url);
        const json = await safeResponseJson(res);

        if (res.ok && json.effective_status) {
          encontrados.set(adId, json.effective_status as string);
          return;
        }

        // Erro do Meta — verificar se é "ad não existe"
        const errorCode = (json.error as { code?: number })?.code;
        // 803 = "Some of the aliases you requested do not exist" (deletado)
        // 100 + subcode pode indicar objeto não encontrado
        if (errorCode === 803 || errorCode === 100) {
          deletados.add(adId);
          return;
        }

        // Outro erro (permissão, rate limit, etc) — ignorar, não marcar como deletado
        logger.warn("Não foi possível verificar status do ad", {
          fn: "buscarStatusMeta",
          adId,
          status: res.status,
          error: json.error,
        });
      })
    );

    // Log de erros de rede
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "rejected") {
        logger.warn("Erro de rede ao verificar ad", {
          fn: "buscarStatusMeta",
          adId: batch[j],
          error: r.reason instanceof Error ? r.reason.message : "desconhecido",
        });
      }
    }
  }

  return { encontrados, deletados };
}

export async function POST() {
  try {
    const ads = await listarAdsSincronizaveis();

    if (ads.length === 0) {
      return NextResponse.json({ sincronizados: 0, alterados: 0 });
    }

    // Coletar todos os meta_ad_ids válidos
    const metaAdIds = ads
      .map((ad) => ad.meta_ad_id)
      .filter((id): id is string => Boolean(id));

    if (metaAdIds.length === 0) {
      return NextResponse.json({ sincronizados: 0, alterados: 0 });
    }

    // Buscar status no Meta
    const { encontrados, deletados } = await buscarStatusMeta(metaAdIds);

    let alterados = 0;

    for (const ad of ads) {
      if (!ad.meta_ad_id) continue;

      let effectiveStatus: string | null = null;

      if (deletados.has(ad.meta_ad_id)) {
        effectiveStatus = "DELETED";
      } else if (encontrados.has(ad.meta_ad_id)) {
        effectiveStatus = encontrados.get(ad.meta_ad_id)!;
      } else {
        // Não conseguiu verificar (erro de rede, permissão, etc) — não alterar
        continue;
      }

      // Só atualizar se mudou
      if (effectiveStatus === ad.meta_effective_status) continue;

      // Se o status Meta indica problema e o ad está concluído, voltar para erro
      const deveVoltar =
        STATUS_QUE_VOLTAM_PARA_ERRO.has(effectiveStatus) && ad.status === "concluido";

      const mensagemErro = deveVoltar
        ? `Meta status: ${effectiveStatus}. O anúncio foi ${effectiveStatus === "DELETED" ? "excluído" : effectiveStatus === "DISAPPROVED" ? "reprovado" : "sinalizado"} no Meta.`
        : undefined;

      await atualizarMetaEffectiveStatus(
        ad.id,
        effectiveStatus,
        deveVoltar ? "erro" : undefined,
        mensagemErro
      );

      alterados++;
    }

    const verificados = encontrados.size + deletados.size;

    logger.info("Sync com Meta concluído", {
      fn: "syncStatus",
      total: ads.length,
      consultados: metaAdIds.length,
      encontrados: encontrados.size,
      deletados: deletados.size,
      alterados,
    });

    return NextResponse.json({
      sincronizados: verificados,
      alterados,
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    logger.error("Erro no sync de status Meta", { fn: "syncStatus", error: mensagem });
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
