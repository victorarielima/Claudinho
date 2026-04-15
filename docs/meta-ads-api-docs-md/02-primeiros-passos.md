# 02. Primeiros passos

## Pagina oficial

- https://developers.facebook.com/docs/marketing-api/get-started

## O que voce precisa para comecar

Em alto nivel, a documentacao oficial indica que o inicio do uso da Marketing API passa por:

- Conta no ecossistema Meta for Developers
- App configurado no painel de developers
- Conta de anuncios com acesso adequado
- Usuario, sistema ou negocio com as permissoes corretas
- Token de acesso valido
- Uso da versao certa da Graph API / Marketing API

## Fluxo recomendado

1. Criar ou configurar um app no Meta for Developers.
2. Associar ativos de negocio e conta de anuncios quando necessario.
3. Obter token de acesso apropriado para o ambiente.
4. Testar chamadas basicas em leitura.
5. Validar escrita em ambiente controlado.
6. Conferir limites, erros e requisitos de permissao antes de escalar.

## O que verificar cedo

- Quem e o owner da conta de anuncios
- Quais roles existem no Business Manager
- Se o app esta em modo de desenvolvimento ou apto para producao
- Se o token e de usuario, sistema ou outro fluxo suportado
- Se os escopos e permissoes realmente cobrem o endpoint desejado

## Dicas praticas

- Comece lendo dados de `ad account` e campanhas antes de automatizar criacao.
- Mantenha logs de request, response e `fbtrace_id`.
- Sempre confira a documentacao de permissao do endpoint que voce vai usar.
- Antes de subir para producao, valide mudancas com versao fixa da API.

## Links oficiais uteis

- https://developers.facebook.com/docs/marketing-api/get-started
- https://developers.facebook.com/docs/graph-api
- https://developers.facebook.com/tools/explorer/
