export const CTA_OPTIONS = [
  { value: 'SHOP_NOW', label: 'Comprar Agora' },
  { value: 'LEARN_MORE', label: 'Saiba Mais' },
  { value: 'SIGN_UP', label: 'Cadastre-se' },
  { value: 'SUBSCRIBE', label: 'Assinar' },
  { value: 'ORDER_NOW', label: 'Pedir Agora' },
  { value: 'GET_OFFER', label: 'Obter Oferta' },
] as const;

export type CTAType = typeof CTA_OPTIONS[number]['value'];

export const VALID_CTA_VALUES: string[] = CTA_OPTIONS.map(o => o.value);
