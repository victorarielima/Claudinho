import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { META_API_BASE } from "@/lib/meta-config";
import { logger } from "@/lib/logger";
import { metaFetchWithRetry } from "@/lib/meta-retry";

/**
 * GET /api/meta/diagnostico-adset?adsetId=<id>
 *
 * Retorna a resposta crua do Graph API para os campos relacionados a
 * cross-channel/omnichannel de um adset. Endpoint de diagnostico —
 * usado quando o operador reporta que o Deep Link saiu vazio mesmo o
 * adset estando configurado como cross-channel no Ads Manager. O dev
 * abre essa rota com o adsetId reportado e ve exatamente o que a API
 * devolve, em vez de chutar.
 *
 * Inclui campos alem do que buscarCrossChannelInfo le, pra cobrir
 * caminhos alternativos (destination_type, top-level application_id,
 * object_store_url singular).
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    }

    const adsetId = request.nextUrl.searchParams.get("adsetId");
    if (!adsetId) {
      return NextResponse.json({ erro: "adsetId é obrigatório" }, { status: 400 });
    }

    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ erro: "META_ACCESS_TOKEN não configurado" }, { status: 500 });
    }

    const fields = [
      "id",
      "name",
      "status",
      "destination_type",
      "promoted_object",
      "promoted_object{application_id,object_store_url,object_store_urls,omnichannel_object{app{application_id,object_store_urls}}}",
    ].join(",");

    const url = `${META_API_BASE}/${adsetId}?fields=${encodeURIComponent(fields)}&access_token=${accessToken}`;

    logger.info("Diagnostico adset solicitado", { fn: "GET /api/meta/diagnostico-adset", adsetId });

    const response = await metaFetchWithRetry(url);
    const data = await response.json();

    if (data.error) {
      return NextResponse.json(
        { erro: data.error.message ?? "Erro na API do Meta", raw: data },
        { status: response.status },
      );
    }

    return NextResponse.json({
      adsetId,
      apiVersion: META_API_BASE.split("/").pop(),
      raw: data,
      campos_observados: {
        promoted_object_existe: data.promoted_object != null,
        omnichannel_object_existe: data.promoted_object?.omnichannel_object != null,
        omnichannel_app_count: Array.isArray(data.promoted_object?.omnichannel_object?.app)
          ? data.promoted_object.omnichannel_object.app.length
          : 0,
        application_id_topo: data.promoted_object?.application_id ?? null,
        application_id_nested: data.promoted_object?.omnichannel_object?.app?.[0]?.application_id ?? null,
        object_store_url_singular: data.promoted_object?.object_store_url ?? null,
        object_store_urls_topo: data.promoted_object?.object_store_urls ?? null,
        object_store_urls_nested: data.promoted_object?.omnichannel_object?.app?.[0]?.object_store_urls ?? null,
        destination_type: data.destination_type ?? null,
      },
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
