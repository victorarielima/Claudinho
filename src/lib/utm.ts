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

/**
 * Força os parâmetros que dependem do DESTINO (`utm_campaign` = nome do ad set,
 * `utm_content` = nome do anúncio) sobre um link que já pode vir com UTMs —
 * seja um link completo colado pelo usuário, seja um override editado à mão.
 * Todos os outros parâmetros são preservados exatamente como estão.
 *
 * Por que existe: no fan-out multi-destino o mesmo criativo sobe para vários
 * ad sets, e `gerarLinkAnuncio` devolve o link intacto quando ele já tem UTM
 * (regra "o link é do usuário"). Isso fazia TODAS as cópias herdarem o
 * `utm_campaign` de um único destino. Com mais de um destino não existe link
 * único possível: cada cópia precisa do seu próprio `utm_campaign`.
 *
 * Se o link não tem nenhuma UTM, cai no template padrão (`gerarLinkAnuncio`).
 */
export function aplicarUtmDestino(
  link: string,
  adSetName: string,
  adName: string
): string {
  if (!link || !link.trim()) return "";

  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return link.trim(); // link inválido: devolve como está, quem valida é a UI
  }

  let jaTemUtm = false;
  url.searchParams.forEach((_valor, chave) => {
    if (chave.toLowerCase().startsWith("utm_")) jaTemUtm = true;
  });
  if (!jaTemUtm) return gerarLinkAnuncio(link, adSetName, adName);

  if (adSetName.trim()) {
    url.searchParams.set("utm_campaign", limparNomeParaUtm(adSetName));
  }
  if (adName.trim()) {
    url.searchParams.set("utm_content", limparNomeParaUtm(adName));
  }

  return url.toString();
}
