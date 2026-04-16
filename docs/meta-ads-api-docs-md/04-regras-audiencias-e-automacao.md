# 04. Regras, audiências e automação

## Regras automatizadas de anúncios

### Páginas oficiais

- Ad rules: https://developers.facebook.com/docs/marketing-api/ad-rules
- Ad rules reference: https://developers.facebook.com/docs/marketing-api/reference/ad-account/adrules_library/

### O que são

Mecanismo da própria Meta para automatizar operação com base em
condições e ações. Útil para:

- Pausar entidades com desempenho ruim
- Aumentar ou reduzir orçamento
- Disparar notificações
- Disparar ações sob critérios de gasto, CPA, ROAS ou entrega

Formato básico de uma rule (`POST /{accountId}/adrules_library`):

```jsonc
{
  "name": "Pausar ads com CPA > R$ 50",
  "evaluation_spec": {
    "evaluation_type": "SCHEDULE",
    "filters": [
      { "field": "entity_type",     "operator": "EQUAL",    "value": "AD" },
      { "field": "cost_per_result", "operator": "GREATER_THAN", "value": 50.0 },
      { "field": "time_preset",     "operator": "EQUAL",    "value": "LAST_7_DAYS" }
    ]
  },
  "execution_spec": {
    "execution_type": "PAUSE",
    "execution_options": []
  },
  "schedule_spec": { "schedule_type": "DAILY" },
  "status": "ENABLED"
}
```

### Alternativa (recomendada para este projeto)

Claudinho **não** usa ad rules do Meta. O audit em ST-12 recomenda
implementar regras do lado do servidor (Vercel Cron + Supabase +
fetch de insights) porque:

- Damos controle e observabilidade próprios.
- Histórico de execuções fica na nossa base.
- Pode cruzar dados de CRM/BI, não só do Meta.

## Audiências

### Páginas oficiais

- Audiences (hub): https://developers.facebook.com/docs/marketing-api/audiences
- Custom Audiences: https://developers.facebook.com/docs/marketing-api/audiences/reference/custom-audience
- Lookalike Audiences: https://developers.facebook.com/docs/marketing-api/audiences/reference/lookalike-audience
- Pixel / Custom Audiences from Website: https://developers.facebook.com/docs/marketing-api/audiences/reference/website-custom-audience

### Tipos principais

| Tipo | Fonte |
|---|---|
| **Custom Audience (lista)** | CSV/SDK de clientes (emails, phones hasheados) |
| **Custom Audience (site)** | Tráfego do pixel (regras sobre eventos) |
| **Custom Audience (app)** | SDK de app |
| **Custom Audience (engagement)** | Quem engajou com Page, Video, IG, Canvas |
| **Lookalike** | Derivada de uma Custom (1%, 2%…10%) |
| **Saved Audience** | Segmentação comum salva (idade, interesse, localização) |

### Criar custom audience de lista

```
POST /{accountId}/customaudiences
  name=Clientes Q1 2026
  subtype=CUSTOM
  description=...
  customer_file_source=USER_PROVIDED_ONLY

POST /{audienceId}/users
  payload={ schema:["EMAIL"], data:[["hash1"],["hash2"],...] }
```

Hashing obrigatório: SHA-256 minúsculo e trimmed para emails/phones,
formato específico para cada `schema`.

## Casos de uso comuns

- Sincronizar lista de clientes para remarketing
- Gerar lookalikes a partir de lista de top-spenders
- Automatizar manutenção de audiências (rotação, atualização)
- Acoplar regras ao desempenho da campanha
- Excluir audiências convertidas de campanhas de prospecção

## Pontos de atenção

- **Privacidade**: audiências envolvem exigências específicas
  (LGPD no Brasil, GDPR na EU). Sempre hashear dados antes de subir.
- **Tamanho mínimo**: Custom Audiences precisam de no mínimo
  1.000 matches para se tornarem "READY".
- **Lookalikes**: exigem audiência seed ativa/populada.
- Regras automatizadas exigem **monitoramento e rollback
  operacional**: já vi ad rule pausar campanha inteira porque a
  condição foi mal escrita.
