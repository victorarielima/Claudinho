# 08. Versão e changelog

## Estado verificado

- Data da verificação: **2026-04-16**
- Versão mais recente da Marketing API: **v25.0** (lançada em
  **18/02/2026**).
- Versão em uso pelo Claudinho: **v23.0** (`META_API_VERSION` em
  `src/lib/meta-config.ts`).

## Fontes oficiais

- Hub da Marketing API: https://developers.facebook.com/docs/marketing-api/
- Changelog: https://developers.facebook.com/docs/marketing-api/marketing-api-changelog
- Versões: https://developers.facebook.com/docs/marketing-api/marketing-api-changelog/versions/
- Out-of-cycle changes: https://developers.facebook.com/docs/marketing-api/out-of-cycle-changes
- Referência por versão: https://developers.facebook.com/docs/marketing-api/reference/v25

## Breaking changes relevantes (v22 → v25)

### v22.0 (jan/2025)

- **`standard_enhancements` deprecado** — cada Advantage+ creative
  enhancement passa a ser opt-in/opt-out individualmente via
  `creative_features_spec` (`standard_enhancements`,
  `image_enhancement`, `text_generation`, `image_touchups`,
  `inline_comment`, `profile_card`, etc.).
- Grace period de 90 dias após lançamento.

### v23.0 (2025)

- Versão atual do Claudinho. Sem breaking changes críticos para o
  nosso fluxo. (Foi a primeira versão onde `instagram_user_id` já
  era o campo canônico.)

### v24.0 (2025)

- Refinos em insights e attribution windows.

### v25.0 (fev/2026)

- **ASC e AAC (Advantage+ Shopping / App Campaigns) DEPRECADOS** —
  criação, duplicação e updates **não são mais permitidos** em
  nenhuma versão da API. Breaking change retroativo.
- `smart_promotion_type` removido na criação de campanha.
- `existing_customer_budget_percentage` permanentemente removido.
- **Async Insights**: quando falha, retorna novos campos por padrão
  (`error_user_msg`, `error_code` agora `int`).

### Deprecations IG (21/01/2026 — já passou)

- `instagram_actor_id` → `instagram_user_id`
- `instagram_story_id` → `instagram_media_id`

Endpoints que deixaram de aceitar os campos antigos:
`/generatepreviews`, `/act_<accountId>/generatepreviews`,
campanhas/creatives/async_ads relacionados.

> ✅ O Claudinho **já** migrou para `instagram_user_id` (commit
> `0f63a52`). Se ver `instagram_actor_id` no código, é bug.

## Como usar isso na prática

- **Fixe a versão** nas chamadas (único ponto de mudança:
  `src/lib/meta-config.ts`).
- Revise o changelog antes de upgrades de versão.
- Monitore alterações fora de ciclo, porque elas podem afetar
  comportamento mesmo fora da janela de upgrade planejada.
- Trate upgrades como **projeto de compatibilidade**, não como simples
  troca de número de versão:
  1. Criar branch só para o upgrade.
  2. Rodar todas as chamadas contra um ad account de staging.
  3. Verificar cada breaking change listado no changelog.
  4. Deploy em janela de baixa criação (fim de expediente).

## Upgrade v23 → v25 (checklist)

Quando for subir para v25:

- [ ] Auditar uso de `smart_promotion_type` (não é usado hoje).
- [ ] Conferir que todas as campanhas Evino/GrandCru não são ASC/AAC
      legacy — se forem, migrar para Advantage+ padrão antes.
- [ ] Auditar `existing_customer_budget_percentage` (não é usado hoje).
- [ ] Atualizar async insights para lidar com `error_user_msg` e
      `error_code` int.
- [ ] Validar chamadas de creative (todo o `asset_feed_spec`,
      `object_story_spec`, `omnichannel_link_spec`).
- [ ] Validar insights (campos, breakdowns, action_types).
- [ ] Testar em ad account de staging por 48h antes de trocar prod.
- [ ] Atualizar `src/lib/meta-config.ts` e os docs (`README.md`,
      `08-versao-e-changelog.md`).

## Quando não migrar

Se a Meta ainda mantém a v23 e não há funcionalidade nova precisando
de v24/v25, não migre por hábito — cada upgrade é chance de regressão.
O projeto é estável em v23 e o escopo funcional não exige v25.
