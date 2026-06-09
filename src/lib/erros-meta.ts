/**
 * Classifica e explica erros conhecidos da Meta API que aparecem no fluxo
 * de criação de anúncios. Retorna o tipo (label curto), uma explicação em
 * português e a mensagem original do Meta para diagnóstico.
 *
 * Como adicionar um novo erro:
 *   1. Identifique um marcador único (subcode preferencial, ou trecho
 *      estável da mensagem).
 *   2. Adicione uma entrada em REGRAS abaixo. A primeira regra que casar
 *      é usada — coloque as mais específicas primeiro.
 */

export interface ErroMetaInterpretado {
  /** Label curto do tipo de erro (ex: "Limite da campanha"). */
  tipo: string;
  /** Explicação em português, incluindo ação sugerida. */
  explicacao: string;
  /** Mensagem original que veio do Meta (ou do nosso wrapper). */
  original: string;
  /** True se conseguimos classificar; false se é um erro desconhecido. */
  conhecido: boolean;
}

interface RegraErro {
  tipo: string;
  explicacao: string;
  /** Casa se QUALQUER um dos marcadores estiver na mensagem. */
  marcadores: (string | RegExp)[];
}

const REGRAS: RegraErro[] = [
  {
    tipo: "Identidade do Instagram",
    explicacao:
      "O criativo precisa de uma conta do Instagram vinculada à página do Facebook para rodar nos placements do IG. Verifique se a página tem um IG Business Account conectado em Meta Business Suite → Configurações → Contas conectadas.",
    marcadores: ["1772103", "Select an Instagram account"],
  },
  {
    tipo: "Limite de ads da campanha",
    explicacao:
      "A campanha Advantage+ Shopping atingiu o limite de 150 anúncios. Pause ou exclua anúncios antigos no Ads Manager dessa campanha antes de subir novos.",
    marcadores: ["2446811", "maximum of 150 ads"],
  },
  {
    tipo: "Cross-channel sem applink",
    explicacao:
      "O ad set tem cross-channel optimization (web + app), mas o criativo foi gerado sem applink_treatment. Atualize o app e tente novamente — o fix mais recente já inclui esse parâmetro.",
    marcadores: ["2446455", "applink_treatment is required"],
  },
  {
    tipo: "Cross-channel: omnichannel_link_spec mal posicionado",
    explicacao:
      "O criativo foi criado com asset_feed_spec (placements múltiplos), mas o omnichannel_link_spec ficou no nível do form em vez de dentro do asset_feed_spec. Esse erro só aparece em runtime (delivery error). Já corrigido — recrie o criativo desse anúncio.",
    marcadores: ["2446461", "omnichannel_link_spec needs to be within"],
  },
  {
    tipo: "Edição manual quebrou o anúncio no Ads Manager",
    explicacao:
      "Esse erro aparece quando alguém edita um anúncio (mesmo 1 letra na legenda) direto no Ads Manager da Meta, em campanha Advantage+ (ASC). A UI da Meta tenta re-validar todos os posicionamentos do criativo e falha. Não é problema do Claudinho — é uma limitação do editor da Meta. Para corrigir: recrie o anúncio pelo Claudinho com o texto novo, ou duplique no Ads Manager e edite a cópia.",
    marcadores: ["1885876", "adicionar mais posicionamentos", "having trouble adding more placements"],
  },
  {
    tipo: "Vídeo ainda processando",
    explicacao:
      "O Meta ainda está processando o vídeo. Aguarde alguns instantes e tente novamente; vídeos grandes podem levar até alguns minutos.",
    marcadores: [/video.*processing/i, "video_status"],
  },
  {
    tipo: "Filename do vídeo sem extensão (code 352)",
    explicacao:
      "O Meta rejeita uploads quando o filename não tem extensão de vídeo (.mp4/.mov/.m4v) — a mensagem de 'formato não suportado' é enganosa: o problema é só o nome do arquivo, não os bytes. Confirmado por matriz de testes em 2026-04-30: mesmo arquivo aceito com 'video.mp4' e rejeitado com 'video' sem extensão. O upload no Claudinho já sanitiza o filename automaticamente; se esse erro aparecer mesmo assim, verifique se o nome no Drive realmente termina sem .mp4/.mov e renomeie. Causas alternativas (raras): codec não-H.264 (HEVC/ProRes) ou container .webm/.mkv/.avi.",
    marcadores: ["1363024", "[code 352]", "format that isn't supported", "in a supported format"],
  },
  {
    tipo: "Falha temporária no upload do vídeo (Meta)",
    explicacao:
      "Erro transitório do serviço de upload de vídeo do Meta — o /advideos ficou indisponível por alguns instantes. Não tem problema com o arquivo, token ou payload. O retry automático já cobre esse subcode; se chegou aqui é porque persistiu mesmo após retentativas. Espere um minuto e clique em 'Tentar de novo'.",
    marcadores: ["1363047", "There was a problem uploading your video"],
  },
  {
    tipo: "Vídeo rejeitado pelo Meta",
    explicacao:
      "O Meta não conseguiu processar o vídeo. Verifique formato (recomendado MP4 H.264), resolução e tamanho, e reenvie.",
    marcadores: ["não conseguiu processar o vídeo", "Meta nao conseguiu processar"],
  },
  {
    tipo: "Vídeo sem acesso no Drive",
    explicacao:
      "O link do Google Drive não está acessível pela conta de serviço. Compartilhe o arquivo (ou a pasta pai) com permissão de leitura para o e-mail da service account.",
    marcadores: ["Falha ao baixar video do Drive", "Drive", /URL de v[ií]deo inv[aá]lida/i],
  },
  {
    tipo: "Token Meta inválido",
    explicacao:
      "O META_ACCESS_TOKEN expirou ou não tem permissão para essa ação. Gere um novo token de longa duração e atualize o .env.",
    marcadores: ["OAuthException", "(#190)", "access token"],
  },
  {
    tipo: "Page ID não configurado",
    explicacao:
      "Não foi possível resolver a página do Facebook. Configure META_PAGE_ID_EVINO/GRANDCRU no .env ou preencha o meta_page_id da brand.",
    marcadores: ["Page ID nao encontrado", "Page ID não encontrado"],
  },
  {
    tipo: "Ad Set inválido",
    explicacao:
      "O Ad Set ID informado não existe ou não é acessível pelo token atual. Confirme o ID e as permissões da conta de anúncio.",
    marcadores: ["Erro ao buscar account do adset", /adset.*not.*found/i],
  },
  {
    tipo: "Imagem não encontrada",
    explicacao:
      "Não foi possível baixar uma das imagens. Verifique se as URLs do ClickUp/Cloudinary ainda estão válidas e públicas.",
    marcadores: ["Erro ao baixar imagem", "Erro ao fazer upload da imagem"],
  },
  {
    tipo: "Nenhuma imagem válida",
    explicacao:
      "O anúncio estático não tem nenhuma imagem associada. Adicione pelo menos uma imagem (feed, stories ou horizontal) e tente novamente.",
    marcadores: ["Nenhuma imagem valida", "Nenhuma imagem válida", "Nenhum asset de imagem"],
  },
];

export function interpretarErroMeta(mensagem: string | null | undefined): ErroMetaInterpretado | null {
  if (!mensagem || !mensagem.trim()) return null;

  const original = mensagem.trim();

  for (const regra of REGRAS) {
    const casa = regra.marcadores.some((m) =>
      typeof m === "string" ? original.includes(m) : m.test(original)
    );
    if (casa) {
      return {
        tipo: regra.tipo,
        explicacao: regra.explicacao,
        original,
        conhecido: true,
      };
    }
  }

  return {
    tipo: "Erro não classificado",
    explicacao:
      "Não temos uma explicação pronta para esse erro. Copie a mensagem original abaixo e mande pro time se persistir.",
    original,
    conhecido: false,
  };
}
