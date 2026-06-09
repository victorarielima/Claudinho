# references/pipeline.md — Pipeline de criação (Step A→D)

## Visão geral

Criar um ad no Meta é um pipeline de 4 passos. No Claudinho, o
pipeline é orquestrado pela rota `src/app/api/meta/processar/route.ts`
e dirigido pelo estado da tabela `ads` no Supabase.

```
Step A: upload video/imagem         (/{accountId}/advideos | /adimages)
Step B: poll processing do vídeo    (GET /{videoId}?fields=status)  [video only]
Step C: criar AdCreative            (POST /{accountId}/adcreatives)
Step D: criar Ad + verificar issues (POST /{accountId}/ads + GET issues_info)
```

## Estados em `ads.status`

```
pendente → processando → concluido | erro
```

Transições:
- `pendente` → `processando`: quando usuário clica "Subir" ou
  `/api/meta/criar-anuncio` é chamada.
- `processando` → `concluido`: Step D completa sem issues_info.
- `processando` → `erro`: qualquer step falha, OU issues_info vem
  com problema após Step D.
- `concluido`/`erro` → `processando`: recriar (delete ad anterior,
  reseta meta_* fields).

## Qual step executar (decision tree)

No `POST /api/meta/processar { adId }`:

```
ad.status == "concluido" ?
  → return { step: "completed" }

ad.status == "erro" ?
  → return { step: "error", message }

ad.status != "processando" ?
  → 400

Agora sabemos que está processando.

ad.meta_creative_id && !ad.meta_ad_id ?
  → Step D (criar ad)

!ad.meta_creative_id ?
  checkAllAssetsUploaded(ad.type, ad.ad_assets) ?
    NÃO → Step A (upload)
    SIM → if type=video e video ainda não ready → Step B
          else → Step C (criar creative)

fallback → already completed
```

Cada step executa uma ação e retorna um estado intermediário
(`uploaded`, `processing_video`, `creative_created`, `completed`,
`error`). O cliente polleia até chegar em `completed` ou `error`.

## Idempotência por step

- **Step A**: se `asset.meta_asset_id` já preenchido, pular.
- **Step C**: se `ad.meta_creative_id` já preenchido, pular.
- **Step D**: se `ad.meta_ad_id` já preenchido, pular.

## Por que isso existe

Vercel tem timeout de ~60s por função. Upload de vídeo grande +
polling de processamento + creative + ad pode ultrapassar fácil.
Quebrando em 4 steps e fazendo o cliente polar, cada chamada ao
`processar` é curta.

**Alternativa ideal** (audit MT-1): mover para background job
queue (Inngest, Trigger.dev, QStash) para não depender do
cliente ficar com a página aberta. Não implementado ainda.

## Retry de um ad em erro

Entrada: `POST /api/meta/criar-anuncio { adId }` com um ad em
`status=erro`.

Handler (`processarFluxoNovo()`):
1. Validar readiness.
2. **Deletar ad antigo no Meta** (`deletarAdMeta(meta_ad_id)`) —
   libera slot da campanha Advantage+ (limite 150).
3. **Limpar no banco** todos os `meta_*` IDs e `error_message`.
4. Marcar `status=processando`.
5. Retornar imediatamente; cliente polleia `/processar`.

**Importante**: antes disso, `atualizarStatusAd()` usava
`if (field)` que tratava `null` como noop. Agora usa `!== undefined`,
garantindo que `meta_creative_id: null` realmente limpa.

## Gotcha do fluxo antigo

O `processarFluxoLegado()` em `criar-anuncio/route.ts` executa
tudo em sequência (sem steps). Ainda é usado pelo fluxo de planilha.
Em produção funciona quando:
- Vídeo < 50 MB (upload simples + processamento < 60s).
- Imagem multi-placement (sem polling de vídeo).

Para vídeos grandes, **sempre** use o fluxo novo.

## Supabase schema relevante

```sql
-- ads
id UUID PK
brand_id FK
type TEXT        -- "video" | "image"
status TEXT      -- "pendente" | "processando" | "concluido" | "erro"
ad_name TEXT
ad_set_id TEXT   -- Meta AdSet ID
meta_ad_id TEXT
meta_creative_id TEXT
meta_account_id TEXT   -- com prefixo act_
meta_effective_status TEXT  -- sync from Meta
texto_principal TEXT
titulo TEXT
descricao TEXT
cta TEXT
link_anuncio TEXT
error_message TEXT
created_at, updated_at, created_by

-- ad_assets
id UUID PK
ad_id FK
asset_type TEXT  -- "video" | "image"
placement TEXT   -- "feed" | "stories" | "horizontal" | "video_principal"
asset_url TEXT   -- Drive link / image URL
meta_asset_id TEXT  -- video_id ou image_hash após upload
```

## Arquivos envolvidos

| Função | Arquivo |
|---|---|
| Entry | `src/app/api/meta/criar-anuncio/route.ts` |
| Steps orchestrator | `src/app/api/meta/processar/route.ts` |
| Uploads | `src/lib/meta-criar.ts` |
| Creative | `src/lib/meta-criar.ts` |
| Ad creation + issues check | `src/lib/meta-criar.ts` |
| DB updates | `src/lib/db.ts` |
| Sync periódico | `src/app/api/meta/sync-status/route.ts` |
