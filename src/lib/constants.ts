export const CTA_OPTIONS = [
  { value: 'SHOP_NOW', label: 'Comprar Agora' },
  { value: 'LEARN_MORE', label: 'Saiba Mais' },
  { value: 'SIGN_UP', label: 'Cadastre-se' },
  { value: 'SUBSCRIBE', label: 'Assinar' },
  { value: 'ORDER_NOW', label: 'Pedir Agora' },
  { value: 'GET_OFFER', label: 'Obter Oferta' },
  { value: 'CONTACT_US', label: 'Fale Conosco' },
  { value: 'DOWNLOAD', label: 'Baixar' },
  { value: 'APPLY_NOW', label: 'Inscreva-se Agora' },
  { value: 'BOOK_TRAVEL', label: 'Reservar' },
  { value: 'BUY_NOW', label: 'Comprar' },
  { value: 'GET_QUOTE', label: 'Solicitar Orcamento' },
  { value: 'WATCH_MORE', label: 'Assistir Mais' },
] as const;

export type CTAType = typeof CTA_OPTIONS[number]['value'];
export type CTAValue = CTAType;

export const VALID_CTA_VALUES: string[] = CTA_OPTIONS.map(o => o.value);
