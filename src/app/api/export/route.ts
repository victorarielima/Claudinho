import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { exportarAds, type FiltrosAd, type StatusAd, type TipoAd } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const filtros: FiltrosAd = {};
  if (searchParams.get("brand_id")) filtros.brand_id = searchParams.get("brand_id")!;
  if (searchParams.get("status")) filtros.status = searchParams.get("status") as StatusAd;
  if (searchParams.get("type")) filtros.type = searchParams.get("type") as TipoAd;

  const formato = searchParams.get("formato") ?? "xlsx";

  try {
    const ads = await exportarAds(filtros);

    // Formatar dados para planilha
    const rows = ads.map((ad) => ({
      "Nome do Anúncio": ad.ad_name,
      Tipo: ad.type === "video" ? "Vídeo" : "Imagem",
      Campanha: ad.campaign_name,
      "Campaign ID": ad.campaign_id ?? "",
      "Ad Set": ad.ad_set_name,
      "Ad Set ID": ad.ad_set_id ?? "",
      "Texto Principal": ad.texto_principal ?? "",
      Título: ad.titulo ?? "",
      Descrição: ad.descricao ?? "",
      CTA: ad.cta,
      "Link Campanha": ad.link_campanha ?? "",
      "Link Anúncio (UTM)": ad.link_anuncio ?? "",
      "Link Aux": ad.link_aux ?? "",
      Status: ad.status,
      "Erro": ad.error_message ?? "",
      "Meta Ad ID": ad.meta_ad_id ?? "",
      "Meta Account ID": ad.meta_account_id ?? "",
      "Criado em": ad.created_at,
      "Atualizado em": ad.updated_at,
      "Assets": (ad.ad_assets ?? [])
        .map((a) => `${a.placement}: ${a.asset_url}`)
        .join(" | "),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Anúncios");

    if (formato === "csv") {
      const csv = XLSX.utils.sheet_to_csv(ws);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="anuncios_${Date.now()}.csv"`,
        },
      });
    }

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="anuncios_${Date.now()}.xlsx"`,
      },
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
