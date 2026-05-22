# references/debugging-playbook.md — Debugging na Meta API

## Ordem de investigação

Quando um erro aparece:

1. **Extrair do log**: `code`, `error_subcode`, `error_user_msg`,
   `fbtrace_id`.
2. **Buscar em `errors-subcodes.md`** (ou
   `docs/meta-ads-api-docs-md/11-catalogo-erros-subcodes.md`).
3. **Se for delivery error** (`WITH_ISSUES`): buscar `issues_info`:
   ```
   GET /{adId}?fields=effective_status,issues_info,recommendations
   ```
4. **Reproduzir no Graph API Explorer** com o mesmo payload
   (substituindo tokens).
5. **Se for novo**: adicionar regra em `src/lib/erros-meta.ts` com
   marcador estável (string ou regex).
6. **Documentar** em commit message + subcode table.

## Ferramentas essenciais

| Ferramenta | URL | Para quê |
|---|---|---|
| Graph API Explorer | https://developers.facebook.com/tools/explorer/ | Reproduzir requests |
| Access Token Debugger | https://developers.facebook.com/tools/debug/accesstoken/ | Verificar validade/escopos |
| Sharing Debugger | https://developers.facebook.com/tools/debug/ | Debugar links/metadata |
| Business Settings | https://business.facebook.com/settings | Ver roles e ativos |
| Events Manager | https://business.facebook.com/events_manager2 | Pixel e conversions |

## Comandos curl úteis (substitua `$TOKEN`)

```sh
# Verificar token
curl "https://graph.facebook.com/v23.0/debug_token?input_token=$TOKEN&access_token=$APP_ID|$APP_SECRET"

# Listar contas acessíveis
curl "https://graph.facebook.com/v23.0/me/adaccounts?fields=id,name,account_status&access_token=$TOKEN"

# Inspecionar um ad
curl "https://graph.facebook.com/v23.0/{ad_id}?fields=effective_status,issues_info,creative{id,object_story_spec,asset_feed_spec},campaign{id,objective},adset{id,promoted_object}&access_token=$TOKEN"

# Inspecionar adset (pegar cross-channel info)
curl "https://graph.facebook.com/v23.0/{adset_id}?fields=promoted_object,optimization_goal,bid_strategy&access_token=$TOKEN"

# Verificar IG identity da page
curl "https://graph.facebook.com/v23.0/{page_id}?fields=instagram_business_account,connected_instagram_account&access_token=$TOKEN"

# Status de vídeo
curl "https://graph.facebook.com/v23.0/{video_id}?fields=status&access_token=$TOKEN"

# Listar últimos ads da conta
curl "https://graph.facebook.com/v23.0/act_{account_id}/ads?fields=id,name,effective_status,created_time&limit=20&access_token=$TOKEN"

# Deletar ad (cuidado — irreversível)
curl -X DELETE "https://graph.facebook.com/v23.0/{ad_id}?access_token=$TOKEN"
```

## Fluxo: "meu creative multi-placement dá WITH_ISSUES"

1. Criar ad com status PAUSED via código.
2. Pegar `meta_ad_id` do banco.
3. `GET /{adId}?fields=effective_status,issues_info` — esperar
   10-20s e repetir 2-3 vezes (validação é async).
4. Ler `issues_info[0].error_summary`.
5. Se for `2446461`: conferir em `criarCreativeImagem()` se
   `omnichannel_link_spec` está dentro de
   `asset_feed_spec.link_urls[0]`, não no form level.
6. Se for `2446455`: conferir se `applink_treatment` está sendo
   adicionado no form level quando `isCrossChannelValido()`.
7. Se for `1772103`: `instagram_user_id` está no
   `object_story_spec`? `buscarInstagramActorId()` está resolvendo?
8. Deletar ad (`DELETE /{adId}`), ajustar código, recriar.

Cleanup obrigatório: ads em teste deixam lixo na conta Advantage+
(limite 150). Sempre deletar após confirmar.

## Fluxo: "edição no Ads Manager quebra com #1885876"

Sintoma: operador edita qualquer campo (até 1 letra na legenda) num ad
publicado pelo Claudinho e o Ads Manager rejeita com *"Estamos com
problemas para adicionar mais posicionamentos a esse anúncio..."*.

Procedimento de diagnóstico (replicável via curl, sem precisar de
script dedicado):

```sh
# 1) Inspecionar o creative — qual path foi usado?
curl "https://graph.facebook.com/v23.0/{ad_id}?fields=creative{id,object_type,asset_feed_spec,applink_treatment,omnichannel_link_spec}&access_token=$TOKEN"

# 2) Inspecionar o adset — é ASC com Advantage+ Placements?
curl "https://graph.facebook.com/v23.0/{adset_id}?fields=targeting{publisher_platforms,facebook_positions,instagram_positions,audience_network_positions,messenger_positions},promoted_object,bid_strategy,optimization_goal&access_token=$TOKEN"
```

Decisão:

| Combinação | Gatilho | Fix |
|---|---|---|
| `creative.object_type = SHARE` (asset_feed_spec) + adset sem `publisher_platforms` explícito | **(a) Gap de placements em ASC.** Customization rules cobrem só FB/IG; Advantage+ ativa Audience Network/Messenger/Threads também. | Default rule (já em `criarCreativeImagem()` desde commit `e4f2294`). Ad pré-fix precisa ser recriado. |
| `creative.omnichannel_link_spec` vazio mas adset tem `promoted_object.omnichannel_object` | **(b) Cross-channel ghost link.** Ad subiu sem applink/spec. | `omnichannel_link_spec` form-level + `link_urls[0]` (commit `6ba3c85`). Ad pré-fix precisa ser recriado. |
| Creative completo (asset_feed_spec com default rule + omnichannel_link_spec em ambos) | **Bug residual do editor da Meta.** Sem fix de código. | Operacional: duplicar o ad no Ads Manager e editar a cópia, OU recriar pelo Claudinho. |

Confirmado ao vivo em 2026-05-22 contra creative `927204320375938`
(ad `6934174404797`, Evino ASCPremium): gatilho (a), `asset_customization_rules`
cobrindo 14 placements vs ASC implicitamente cobrindo ~25.

## Fluxo: "pipeline trava em processing"

1. Ver no banco: `SELECT * FROM ads WHERE status='processando' AND
   updated_at < NOW() - INTERVAL '5 min'`.
2. Para cada um:
   - Se `meta_asset_id` vazio: upload falhou. `error_message` no banco?
   - Se `meta_asset_id` preenchido mas `meta_creative_id` vazio:
     vídeo ainda processing OU creative falhou. `GET
     /{videoId}?fields=status`.
   - Se `meta_creative_id` preenchido mas `meta_ad_id` vazio: falha
     no Step D. Rechamar `/api/meta/processar { adId }`.

## Fluxo: "ad foi criado mas desapareceu do Meta"

O sync (`/api/meta/sync-status`) trata:

- `effective_status=DELETED` → atualiza no banco e marca como erro.
- `effective_status=DISAPPROVED` → idem.
- `effective_status=WITH_ISSUES` → busca `issues_info`, atualiza
  com mensagem real.

Se o ad "desapareceu" mas não está em nenhum desses estados, pode
ter sido deletado pelo time manualmente no Ads Manager. Código 803
no sync indica isso.

## Como testar um fix manualmente

1. Identificar um AdSet real apropriado (ex.: Evino Prod Advantage+
   para cross-channel multi-placement).
2. Criar campanha de teste PAUSED com daily budget R$ 1.
3. Via UI do Claudinho: criar ad e subir.
4. Se `WITH_ISSUES`, inspecionar via curl (comandos acima).
5. Se OK, deletar o ad (`DELETE` via curl ou botão "Excluir do Meta").
6. Repetir com variações do payload até entender a causa.

## Armadilhas comuns de debugging

1. **Caches**: `/api/meta/anuncios` cache in-memory de 5 min.
   Se um ad não aparece, adicionar `?cache=0` ou reiniciar
   servidor dev.
2. **GET não retorna campo**: nem todo field é incluído por default.
   Listar explicitamente: `?fields=a,b,c`.
3. **`GET creative` não mostra `omnichannel_link_spec`**: isso é
   esperado — o field existe no creative mas o GET não retorna.
   Não é bug.
4. **Placements silenciosamente ignorados**: se um label não bate
   com `asset_customization_rules`, a imagem simplesmente não é
   usada. Sempre logar `placementCount` no creative.
5. **Retry cria duplicata**: limpar `meta_ad_id` no banco antes de
   retry. Se já tem `meta_ad_id`, `deletarAdMeta()` antes.

## Quando abrir suporte com a Meta

Se `fbtrace_id` persiste em múltiplos ads, com mesmo payload válido
contra a doc, sem match em `errors-subcodes.md`:

1. Coletar: `fbtrace_id`, timestamp UTC, payload completo,
   response completa.
2. Se possível, isolar em 1 chamada reproduzível (curl).
3. Abrir ticket em Meta for Developers → Support → Bug.

Manter esperança moderada: tempo de resposta é longo.
