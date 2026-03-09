import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { lerLinhas, ABAS, type ChaveAba } from "@/lib/sheets";
import { getSupabase } from "@/lib/supabase";
import { gerarLinkAnuncio } from "@/lib/utm";
import { detectarTipoCriativo, extrairImageAssets } from "@/lib/ad-media";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const aba = (body.aba ?? "evino") as ChaveAba;
    const nomeAba = ABAS[aba];

    if (!nomeAba) {
      return NextResponse.json({ erro: "Aba inválida" }, { status: 400 });
    }

    // Buscar brand correspondente
    const sb = getSupabase();
    const { data: brand, error: brandError } = await sb
      .from("brands")
      .select("id, meta_account_id, meta_page_id")
      .eq("sheet_name", nomeAba)
      .maybeSingle();

    if (brandError || !brand) {
      return NextResponse.json(
        { erro: `Brand não encontrado para aba ${nomeAba}` },
        { status: 400 }
      );
    }

    // Ler linhas da planilha
    const linhas = await lerLinhas(nomeAba);
    if (linhas.length === 0) {
      return NextResponse.json({ data: { importados: 0, ignorados: 0 } });
    }

    let importados = 0;
    let ignorados = 0;

    for (const linha of linhas) {
      // Verificar se já existe no banco (por ad_name + campaign_name)
      const { data: existente } = await sb
        .from("ads")
        .select("id")
        .eq("brand_id", brand.id)
        .eq("ad_name", linha.adName)
        .eq("campaign_name", linha.campaign)
        .maybeSingle();

      if (existente) {
        ignorados++;
        continue;
      }

      // Mapear status
      let status: "pendente" | "processando" | "concluido" | "erro" = "pendente";
      if (linha.statusAutomacao === "Concluído") status = "concluido";
      else if (linha.statusAutomacao === "Processando") status = "processando";
      else if (linha.statusAutomacao.startsWith("Erro")) status = "erro";

      const adType = detectarTipoCriativo(linha.tipoPlanilha, linha.linkVideo);
      const isImage = adType === "image";

      // Gerar UTM
      const linkAnuncio = linha.linkAnuncio
        ? gerarLinkAnuncio(linha.linkAnuncio, linha.campaign, linha.adName)
        : null;

      // Inserir ad
      const { data: ad, error: adError } = await sb
        .from("ads")
        .insert({
          brand_id: brand.id,
          type: adType,
          campaign_name: linha.campaign,
          campaign_id: linha.campaignId || null,
          ad_set_name: linha.adSet,
          ad_set_id: linha.adSetId || null,
          ad_name: linha.adName,
          texto_principal: linha.textoPrincipal || null,
          titulo: linha.titulo || null,
          descricao: linha.descricao || null,
          cta: linha.cta || "SHOP_NOW",
          link_campanha: linha.linkAnuncio || null,
          link_anuncio: linkAnuncio,
          status,
          error_message: status === "erro" ? linha.statusAutomacao.replace("Erro: ", "") : null,
          meta_ad_id: linha.adIdGerado || null,
          meta_account_id: linha.accountId || null,
          created_by: userId,
        })
        .select("id")
        .single();

      if (adError) {
        console.error(`Erro ao importar linha ${linha.indiceLinha}:`, adError);
        ignorados++;
        continue;
      }

      // Inserir assets
      if (isImage) {
        const assets = extrairImageAssets(linha.linkVideo).map((asset, i) => ({
          ad_id: ad.id,
          placement: asset.placement,
          asset_url: asset.url,
          asset_type: "image" as const,
          sort_order: i,
        }));

        if (assets.length > 0) {
          await sb.from("ad_assets").insert(assets);
        }
      } else if (linha.linkVideo) {
        await sb.from("ad_assets").insert({
          ad_id: ad.id,
          placement: "video_principal",
          asset_url: linha.linkVideo,
          asset_type: "video",
          sort_order: 0,
        });
      }

      // Audit log
      await sb.from("audit_log").insert({
        entity_type: "ad",
        entity_id: ad.id,
        action: "imported",
        changes: { source: { old: null, new: `sheets:${nomeAba}:${linha.indiceLinha}` } },
        user_id: userId,
      });

      importados++;
    }

    return NextResponse.json({
      data: { importados, ignorados, total: linhas.length },
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
