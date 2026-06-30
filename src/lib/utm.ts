/**
 * Gera o link final do anúncio a partir do link base.
 *
 * Regras:
 * - Se o usuário já forneceu um link **completo** (contém qualquer parâmetro
 *   `utm_*`), ele é priorizado e devolvido exatamente como está. É o link dele.
 * - Caso contrário, o link é montado automaticamente: `utm_campaign` recebe o
 *   nome do conjunto de anúncios (ad set) e `utm_content` o nome do anúncio.
 *   Como esses nomes alimentam o link, ao mudar o nome o link muda junto.
 *
 * Template gerado automaticamente:
 *   LINK_BASE?utm_source=Facebook&utm_medium=Ads
 *     &utm_campaign=NOME_CONJUNTO_ANUNCIOS&utm_content=NOME_ANUNCIO&openShop=true
 */
export function gerarLinkAnuncio(
  linkBase: string,
  adSetName: string,
  adName: string
): string {
  if (!linkBase || !linkBase.trim()) return "";

  const url = new URL(linkBase.trim());

  // Link já completo (com UTMs): prioriza exatamente o que o usuário colocou.
  let jaTemUtm = false;
  url.searchParams.forEach((_valor, chave) => {
    if (chave.toLowerCase().startsWith("utm_")) jaTemUtm = true;
  });
  if (jaTemUtm) return url.toString();

  url.searchParams.set("utm_source", "Facebook");
  url.searchParams.set("utm_medium", "Ads");
  url.searchParams.set("utm_campaign", limparNomeParaUtm(adSetName));
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
