# 06. Brand safety, boas práticas e troubleshooting

## Brand safety e suitability

### Páginas oficiais

- Brand safety and suitability: https://developers.facebook.com/docs/marketing-api/brand-safety-and-suitability
- Publisher list: https://developers.facebook.com/docs/marketing-api/bidding/guides/ad-placements-customization

### Resumo

Controles de adequação e segurança para marcas, ajustando o inventário
onde os anúncios aparecem (Facebook Audience Network, Instagram,
Messenger, Reels, in-stream videos).

Ferramentas principais:

- **Publisher block lists** — listas de URLs/apps onde **não**
  entregar
- **Inventory filter** (`brand_safety_content_filter_levels`) —
  `FULL_INVENTORY`, `STANDARD_INVENTORY`, `LIMITED_INVENTORY`
- **Content type exclusions** — categorias temáticas

No Claudinho, ads de álcool usam inventário padrão + `NONE` como
categoria especial; a própria Meta aplica restrições (18+, não pode
promover consumo excessivo).

## Boas práticas

### Páginas oficiais

- Best practices: https://developers.facebook.com/docs/marketing-api/best-practices
- Rate limiting: https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/

### Operacionais

1. **Idempotência**: antes de criar `creative`/`ad`, verifique se
   já existe (no Claudinho: `meta_creative_id`/`meta_ad_id` na
   tabela `ads`). Retry **não** deve criar duplicatas.
2. **Criação em `PAUSED`**: nunca crie ads em `ACTIVE` automaticamente.
   Deixe a ativação para operação humana.
3. **Validação assíncrona pós-criação**: o Meta valida criativos
   em background. Faça polling curto de
   `effective_status,issues_info` após `POST /ads`. Se surgir
   `WITH_ISSUES`, marque como erro e exponha `issues_info[0].error_summary`.
   O Claudinho implementa em `verificarIssuesAd()` em
   `src/lib/meta-criar.ts`.
4. **Rate limit com backoff**: erro codes 4, 17, 32, 100, 613, 80004
   e HTTP 429 → exponential backoff (1s, 2s, 4s, 8s, max 30s).
5. **Fbtrace_id no log**: todo erro do Meta vem com `fbtrace_id`.
   Guarde — é a forma de abrir ticket com o suporte.
6. **Testes com Graph API Explorer**: bom para reproduzir um request
   manualmente e ver exatamente o que o Meta devolve.
7. **Nunca exponha access_token no client**: ficou uma prática
   recente (mobile apps), mas no Claudinho tudo roda em rotas
   `/api/meta/**`.

### Escala

- Chunked upload para vídeos ≥ 50MB (`12-upload-midia.md`).
- Paralelismo limitado (3-5) em chamadas batch para não explodir
  rate limit.
- ETL de performance diário em vez de fetch on-demand a cada abertura
  de dashboard.
- Logs estruturados (JSON) com campos padrão: `fn`, `adId`,
  `metaAdId`, `fbtrace_id`, `error`.

## Solução de problemas

### Páginas oficiais

- Troubleshooting: https://developers.facebook.com/docs/marketing-api/troubleshooting
- Error codes: https://developers.facebook.com/docs/marketing-api/error-reference/
- Handle errors (Graph API): https://developers.facebook.com/docs/graph-api/guides/error-handling/

### Catálogo de códigos/subcodes

Ver arquivo dedicado: [`11-catalogo-erros-subcodes.md`](./11-catalogo-erros-subcodes.md).

### Checklist rápido de diagnóstico

1. **Copiar fbtrace_id** da resposta para todo log/report.
2. **Confirmar versão da API chamada** (a `META_API_VERSION` local
   bate com o que está rodando?).
3. **Validar token e contexto de autenticação**
   (`/debug_token?input_token=...`).
4. **Confirmar que o objeto pertence à conta esperada** (erros 100,
   803 costumam ser "objeto não existe ou token não tem acesso").
5. **Revisar permissões e roles de negócio** (System User está em
   todos os ativos?).
6. **Conferir changelog / out-of-cycle changes**.
7. Repetir a mesma chamada no **Graph API Explorer**.
8. Se for delivery error após criar o ad, buscar `issues_info`:

```
GET /{adId}?fields=effective_status,issues_info
  &access_token=...
```

Mensagem real está em `issues_info[0].error_summary` + `error_message`.

### Padrões de falha recorrentes

| Sintoma | Causa frequente |
|---|---|
| Ad fica `WITH_ISSUES` | Cross-channel mal configurado (ver `10-cross-channel-omnichannel.md`) |
| Subcode 1772103 | Falta `instagram_user_id` no `object_story_spec` |
| Subcode 2446811 | Campanha Advantage+ atingiu 150 ads |
| Subcode 2446455 | Cross-channel sem `applink_treatment` |
| Subcode 2446461 | `omnichannel_link_spec` na posição errada |
| Erro #190 | Token expirou ou permissão foi revogada |
| Erro #100 "Unexpected key" | Campo enviado que o endpoint não aceita (versão errada ou field deprecado) |
| HTTP 429 / codes 17/32 | Rate limit — aplicar backoff |
| Ad "processando" por mais de 5 min | Vídeo preso em `processing` no Meta |
