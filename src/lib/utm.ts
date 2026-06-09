/**
 * Gera link completo com UTMs a partir do link base da campanha.
 *
 * Template:
 *   LINK_CAMPANHA?utm_source=Facebook&utm_medium=Ads
 *     &utm_campaign=NOME_CAMPANHA&utm_content=NOME_ANUNCIO&openShop=true
 */
export function gerarLinkAnuncio(
  linkCampanha: string,
  campaignName: string,
  adName: string
): string {
  if (!linkCampanha || !linkCampanha.trim()) return "";

  const url = new URL(linkCampanha.trim());
  url.searchParams.set("utm_source", "Facebook");
  url.searchParams.set("utm_medium", "Ads");
  url.searchParams.set("utm_campaign", campaignName);
  url.searchParams.set("utm_content", limparNomeParaUtm(adName));
  url.searchParams.set("openShop", "true");

  return url.toString();
}

/**
 * Remove sufixos "(cópia)" e numeração que se acumulam ao duplicar ads.
 * Ex: "MeuAd (cópia) (cópia) 2 (cópia)" → "MeuAd"
 */
function limparNomeParaUtm(nome: string): string {
  return nome.replace(/(\s*\(cópia\)\s*\d*)+$/i, "").trim();
}
