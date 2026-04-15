# 01. Visao geral

## O que e

A Meta Ads API e documentada oficialmente pela Meta como **Marketing API**. Ela faz parte do ecossistema da Graph API e permite criar, configurar, automatizar e medir anuncios em propriedades como Facebook, Instagram, Messenger e, em alguns casos, superficies relacionadas pela Meta.

## Pagina oficial

- https://developers.facebook.com/docs/marketing-api/
- https://developers.facebook.com/docs/marketing-api/overview

## O que essa documentacao cobre

- Estrutura de objetos de anuncios
- Fluxos de criacao e gerenciamento de campanhas
- Criativos
- Lances
- Regras automatizadas
- Publicos
- Insights e relatorios
- Brand safety e suitability
- Boas praticas
- Troubleshooting
- Referencia da API
- Changelog

## Modelo conceitual principal

Em termos praticos, a hierarquia central costuma girar em torno destes objetos:

- `Ad Account`
- `Campaign`
- `Ad Set` / `Ad Group`
- `Ad`
- `Ad Creative`

## Quando usar

Use a Marketing API quando voce precisa:

- Criar campanhas em escala
- Gerenciar anuncios de forma programatica
- Atualizar orcamentos, status e segmentacao
- Ler performance por conta, campanha, conjunto e anuncio
- Sincronizar dados com CRM, BI ou plataformas internas
- Automatizar regras operacionais

## Pontos de atencao

- A Meta trabalha com **versionamento explicito** da API.
- Permissoes, acessos e revisoes de app podem ser necessarios dependendo do caso.
- Nem todo recurso esta disponivel para toda conta, app ou tipo de negocio.
- Muitos problemas praticos decorrem de tokens, roles, permissao insuficiente, limite de taxa ou configuracao da conta de anuncios.

## Leitura recomendada

- Proximo arquivo: `02-primeiros-passos.md`
