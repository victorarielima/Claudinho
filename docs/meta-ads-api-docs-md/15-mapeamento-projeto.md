# 15. Mapeamento: API oficial ↔ Claudinho

Como cada conceito da Marketing API aparece nos arquivos do projeto.
Use para navegar rápido.

## Pipelines existentes

### Fluxo novo (preferido) — Supabase-driven

```
UI (formularios)
  └── POST /api/ads            → cria ad em status "pendente" no Supabase
  └── POST /api/meta/criar-anuncio { adId }
        └── valida + deleta ad anterior (se recriando)
        └── muda status "processando"
        └── retorna imediatamente
  └── Cliente faz polling de:
      POST /api/meta/processar { adId }
        ├── Step A: baixar do Drive + POST /{accountId}/advideos|/adimages
        ├── Step B: GET /{videoId}?fields=status (polling)
        ├── Step C: POST /{accountId}/adcreatives
        └── Step D: POST /{accountId}/ads + GET /{adId}?fields=effective_status,issues_info
```

### Fluxo legado — planilha-driven (em remoção)

`POST /api/meta/criar-anuncio { indiceLinha, aba, ... }` executa
todos os steps síncronamente. Ainda existe mas deve ser migrado para
o fluxo novo (limitação de tempo Vercel).

## Tabela: conceito Meta ↔ arquivo

### Config & baixo nível

| Conceito | Código |
|---|---|
| Versão e URL base da API | `src/lib/meta-config.ts` |
| Fetch com retry e rate limit | `src/lib/meta-retry.ts` |
| Logger estruturado | `src/lib/logger.ts` |
| Parser seguro de JSON | `safeResponseJson()` em `meta-retry.ts` |

### Criação de anúncios

| Conceito Meta | Função no projeto | Arquivo |
|---|---|---|
| Resolver account_id do adset (`GET /{adsetId}?fields=account_id`) | `buscarAccountIdDoAdSet()` | `src/lib/meta-criar.ts` |
| Detectar cross-channel | `buscarCrossChannelInfo()` | `src/lib/meta-criar.ts` |
| Validar cross-channel | `isCrossChannelValido()` | `src/lib/meta-criar.ts` |
| Construir `omnichannel_link_spec` | `construirOmnichannelSpec()` | `src/lib/meta-criar.ts` |
| Resolver IG user id | `buscarInstagramActorId()` | `src/lib/meta-criar.ts` |
| Upload vídeo (simples) | `uploadVideoSimples()` | `src/lib/meta-criar.ts` |
| Upload vídeo (chunked) | `uploadVideoChunked()` | `src/lib/meta-criar.ts` |
| Upload vídeo (sem esperar) | `uploadVideoSemAguardar()` | `src/app/api/meta/processar/route.ts` |
| Polling de processamento | `aguardarProcessamentoVideo()` | `src/lib/meta-criar.ts` |
| Thumbnail do vídeo | `buscarThumbnailVideo()` | `src/lib/meta-criar.ts` |
| Upload imagem | `uploadImage()` | `src/lib/meta-criar.ts` |
| Creative de vídeo | `criarCreativeVideo()` | `src/lib/meta-criar.ts` |
| Creative de imagem simples | `criarCreativeImagemSimples()` | `src/lib/meta-criar.ts` |
| Creative de imagem multi-placement | `criarCreativeImagem()` | `src/lib/meta-criar.ts` |
| Criar o ad | `criarAnuncio()` | `src/lib/meta-criar.ts` |
| Verificar issues pós-criação | `verificarIssuesAd()` | `src/lib/meta-criar.ts` |
| Deletar ad no Meta | `deletarAdMeta()` | `src/lib/meta-criar.ts` |

### Leitura & insights

| Conceito | Função no projeto | Arquivo |
|---|---|---|
| Listar campanhas | `GET /api/meta/campanhas` | `src/app/api/meta/campanhas/route.ts` |
| Listar adsets | `GET /api/meta/adsets` | `src/app/api/meta/adsets/route.ts` |
| Listar ads com insights | `GET /api/meta/anuncios` | `src/app/api/meta/anuncios/route.ts` |
| Resumo por período | `buscarResumoDoPeriodo()` | `src/lib/meta.ts` |
| Paginação de ads por período | `buscarPaginaAnunciosDoPeriodo()` | `src/lib/meta.ts` |
| Sync de status | `POST /api/meta/sync-status` | `src/app/api/meta/sync-status/route.ts` |

### Validação & erros

| Conceito | Função | Arquivo |
|---|---|---|
| Readiness check | `analisarProntidaoAnuncio()` | `src/lib/ad-readiness.ts` |
| Regras de texto Meta | `validarTextoMeta()` | `src/lib/ad-readiness.ts` |
| Placement detection | `classificarPlacementImagem()`, `normalizarPlacementImagem()` | `src/lib/ad-media.ts` |
| Classificação de erro Meta | `interpretarErroMeta()` | `src/lib/erros-meta.ts` |
| Extração de erro Meta (crua) | `extrairErroMeta()` | `src/lib/meta-criar.ts` |

### Schema Supabase

Ver `supabase/migrations/*.sql`. Tabelas relevantes:

- **`ads`**: status da criação + `meta_ad_id`, `meta_creative_id`,
  `meta_account_id`, `meta_effective_status`, `error_message`.
- **`ad_assets`**: 1 linha por vídeo/imagem, guarda `asset_url`,
  `placement`, `meta_asset_id` (= video_id ou image_hash).
- **`brands`**: `meta_account_id`, `meta_page_id`, etc.
- **`audit_log`**: histórico de mudanças, usado como source of truth
  de quem fez o quê.

## Cross-cutting: como o projeto lida com cada "pain point"

| Pain Point | Mitigação |
|---|---|
| Rate limit (codes 17/32/613/80004) | `metaFetchWithRetry()` com backoff |
| Token inválido (#190) | `extrairErroMeta()` expõe ao usuário; env precisa ser rotacionado |
| IG identity ausente (1772103) | `buscarInstagramActorId()` com env override e 2 fallbacks |
| Campanha Advantage+ cheia (2446811) | `deletarAdMeta()` antes do retry |
| Cross-channel com posição errada | Matriz em `10-cross-channel-omnichannel.md` |
| Delivery error assíncrono | `verificarIssuesAd()` pós-criação |
| Ad zumbi no Meta (status conflito) | `sync-status` diferencia existente de deletado |
| Vídeo ainda processando | `aguardarProcessamentoVideo()` com timeout 5 min |
| Duplicata de chunk no upload | Usar `start_offset` da resposta |

## Como testar localmente

1. Criar `.env.local` copiando `.env.example`.
2. Preencher com tokens e IDs de **ambiente de teste** (não prod).
3. Usar um ad account de staging; criar campanha Advantage+
   pausada com daily budget mínimo.
4. `npm run dev` e acessar `http://localhost:3000`.
5. Após criar ads via UI, verificar no Ads Manager:
   - Navegar para Campanha → Ad Set → Ad.
   - Abrir "Detalhes" → "Ver em pré-visualização".
   - Confirmar que placement correto foi aplicado.
   - `GET /{adId}?fields=effective_status,issues_info` manual se
     algo estranho.

## Como contribuir com correções

Ao corrigir qualquer bug de Meta:

1. **Reproduzir com Graph API Explorer** se possível. Não confie
   só no Claudinho.
2. **Adicionar regra em `erros-meta.ts`** se o erro for novo, com
   marcador estável (string ou regex).
3. **Registrar a descoberta** no commit message, incluindo:
   - Código/subcode do erro
   - Payload que falhou vs. payload que funcionou
   - ID de ad real usado no teste (ajuda em investigação futura)
4. **Atualizar `10-cross-channel-omnichannel.md`** ou
   `11-catalogo-erros-subcodes.md` se aplicável.
5. **Atualizar o skill** (`.claude/skills/meta-ads-api/`) se o bug
   seria evitado tendo a info lá.
