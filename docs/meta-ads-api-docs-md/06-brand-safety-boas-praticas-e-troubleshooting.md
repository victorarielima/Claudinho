# 06. Brand safety, boas praticas e troubleshooting

## Brand safety e suitability

### Pagina oficial

- https://developers.facebook.com/docs/marketing-api/brand-safety-and-suitability

### Resumo

Essa documentacao cobre controles de adequacao e seguranca para marcas, ajudando a posicionar anuncios junto de contextos mais apropriados no inventario da Meta.

## Boas praticas

### Pagina oficial

- https://developers.facebook.com/docs/marketing-api/best-practices

### Resumo

A Meta concentra aqui orientacoes operacionais importantes para uso saudavel da API, incluindo:

- Testes controlados
- Interpretacao de erros
- Qualidade de integracao
- Cuidados para escalar chamadas e automacoes

## Solucao de problemas

### Pagina oficial

- https://developers.facebook.com/docs/marketing-api/troubleshooting

### Resumo

Essa secao e a referencia natural quando voce encontrar:

- Erros de permissao
- Falhas de token
- Problemas de configuracao de app
- Diferencas entre comportamento esperado e resposta da API
- Dificuldades ao criar ou atualizar objetos de anuncios

## Checklist rapido de diagnostico

- Confirmar a versao da API chamada
- Validar o token e o contexto de autenticacao
- Confirmar se o objeto pertence a conta esperada
- Revisar permissoes e roles de negocio
- Registrar `fbtrace_id` para investigacao
- Conferir changelog e alteracoes fora de ciclo
