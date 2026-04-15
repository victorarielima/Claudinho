# 07. Referencia da API

## Pagina oficial principal

- https://developers.facebook.com/docs/marketing-api/reference

## Objetos centrais localizados na documentacao oficial

- Ad Account: https://developers.facebook.com/docs/marketing-api/reference/ad-account
- Ad Account edges: https://developers.facebook.com/docs/marketing-api/reference/ad-account#edges
- Ad Account User: https://developers.facebook.com/docs/marketing-api/reference/ad-account-user
- Ad Campaign: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
- Ad Campaign Group: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
- Ad Creative: https://developers.facebook.com/docs/marketing-api/reference/ad-creative
- Ad Creative edges: https://developers.facebook.com/docs/marketing-api/reference/ad-creative#edges
- Ad Group: https://developers.facebook.com/docs/marketing-api/reference/adgroup
- Ad Group edges: https://developers.facebook.com/docs/marketing-api/reference/adgroup#edges
- Reference by version `v25`: https://developers.facebook.com/docs/marketing-api/reference/v25

## Como ler a referencia

Ao navegar pela referencia, procure sempre por:

- Campos disponiveis
- Metodos suportados
- Edges relacionados
- Requisitos de permissao
- Parametros obrigatorios
- Restricoes por tipo de conta, objetivo ou recurso

## Objetos que normalmente entram primeiro no fluxo

- `Ad Account`
- `Campaign`
- `Ad Set` / `Ad Group`
- `Ad`
- `Ad Creative`

## Sugestao de ordem de estudo

1. `Ad Account`
2. `Campaign`
3. `Ad Group` / `Ad Set`
4. `Ad Creative`
5. `Insights`

## Observacao importante

A referencia oficial da Meta costuma ser a fonte definitiva para detalhes de request e response. Antes de implementar, confira a pagina do objeto na mesma versao da API que sua aplicacao usa.
