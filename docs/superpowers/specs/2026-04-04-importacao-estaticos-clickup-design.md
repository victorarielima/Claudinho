# Importação de Anúncios Estáticos via ClickUp

**Data:** 2026-04-04
**Status:** Aprovado
**Fonte de dados:** ClickUp API v2 — Lista "Externos Evino" (ID: 11430929)

---

## Contexto

O sistema já possui um fluxo de importação de vídeos (Google Drive → explorador visual → formulário lote → criação de ads). Este spec descreve um fluxo análogo para **anúncios estáticos (imagens)**, com dados vindos do ClickUp.

Os cards do ClickUp na lista "Externos Evino" contêm:
- Nome do anúncio (ex: `Face | El Origen Winemaker Selection | 3 formatos`)
- Attachments com imagens por formato (`1080x1080`, `1080x1920`, `1200x628`)
- Custom fields: Tipo (dropdown), Y-M (dropdown), Entrega (date)
- Status workflow: alocação → conteúdo → design → foto/motion → revisão → revisado → finalizada

As URLs dos attachments são **públicas** (não requerem autenticação para download).

---

## Decisões de Design

| Decisão | Escolha |
|---------|---------|
| Filtro de status | Usuário escolhe na UI (multi-select) |
| Mapeamento card → anúncio | 1 card = 1 anúncio com N assets (1 por formato/placement) |
| Ad name pattern | `STATIC-{DESTINO}-{NOME_LIMPO}-W{SEMANA}-{ANO}` |
| Filtro por Tipo | Disponível mas opcional |
| Download de imagens | URL pública direta do ClickUp (sem proxy) |
| UI do explorador | Grid com thumbnails + preview full expandível |

---

## Arquitetura

### Fluxo do Usuário

```
Botão "Importar Estáticos" (painel-criacao)
  → Dialog Explorador ClickUp (navegar/filtrar/selecionar cards)
    → Formulário Lote Imagens (configurar destino + campos por anúncio)
      → POST /api/ads/lote (salvar no Supabase)
```

### Novos Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/lib/clickup.ts` | Client da API do ClickUp — listar tasks com attachments |
| `src/app/api/clickup/tasks/route.ts` | Endpoint GET com cache in-memory (TTL 10min) |
| `src/components/dialog-explorador-clickup.tsx` | Dialog explorador visual dos cards |
| `src/components/formulario-lote-imagens.tsx` | Formulário de lote para anúncios estáticos |

### Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/painel-criacao.tsx` | Novo botão + states para fluxo de estáticos |

### Reutilização

| Componente existente | Uso |
|---------------------|-----|
| `POST /api/ads/lote` | Reutilizar — já suporta `type: "image"` e múltiplos assets |
| `criarAd()` em `db.ts` | Reutilizar sem alteração |
| `classificarPlacementImagem()` em `ad-media.ts` | Reutilizar — mapeia `1080x1080 → feed`, `1080x1920 → stories`, `1200x628 → horizontal` |
| `normalizarPlacementImagem()` em `ad-media.ts` | Reutilizar |
| `CTA_OPTIONS` em `constants.ts` | Reutilizar |
| `gerarLinkAnuncio()` em `utm.ts` | Reutilizar |
| Cascading dropdowns (brands → campanhas → adsets) | Extrair lógica compartilhada de `formulario-lote-videos.tsx` |
| `gerarAdName()` | Adaptar — prefixo `STATIC` ao invés de `VIDEO` |

---

## Backend

### `src/lib/clickup.ts` — Client ClickUp

```typescript
// Configuração
const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN
const CLICKUP_BASE_URL = "https://api.clickup.com/api/v2"
const CLICKUP_LIST_ID = "11430929" // Externos Evino

// Tipos exportados
interface ClickUpTask {
  id: string
  name: string                        // "Face | El Origen | 3 formatos"
  status: string                      // "revisado", "finalizada", etc.
  tipo: string | null                 // Custom field "Tipo" resolvido (ex: "Face & Insta")
  yearMonth: string | null            // Custom field "Y-M" resolvido (ex: "04-2026")
  entrega: string | null              // Custom field "Entrega" como ISO date
  url: string                         // URL do card no ClickUp
  attachments: ClickUpAttachment[]
}

interface ClickUpAttachment {
  id: string
  title: string                       // "1080X1080_05_07.jpg"
  url: string                         // URL pública direta
  thumbnailLarge: string | null
  thumbnailSmall: string | null
  extension: string
  size: number
  placement: string                   // Detectado via classificarPlacementImagem()
}

interface ClickUpIndice {
  tasks: ClickUpTask[]
  totalTasks: number
  carregadoEm: string                 // ISO timestamp
}
```

**Funções:**

- `carregarIndiceClickUp(statuses?: string[]): Promise<ClickUpIndice>`
  - Chama `GET /list/{listId}/task` com paginação (100/página, percorre todas)
  - Para cada task com attachments > 0 no resumo OU para todas: chama `GET /task/{taskId}` para obter attachments completos
  - Resolve os custom fields dropdown (Tipo, Y-M) mapeando `orderindex` → `name` via opções do campo
  - Classifica placement de cada attachment via `classificarPlacementImagem(attachment.title)`
  - Filtra apenas attachments com extensão de imagem (jpg, jpeg, png, webp, gif)

- `buscarOpcoesDropdown(listId: string): Promise<Map<fieldId, Map<orderindex, name>>>`
  - Chama `GET /list/{listId}/field` uma vez e cacheia
  - Retorna mapa de resolução para dropdowns

**Otimização:** A API do ClickUp não retorna attachments na listagem (`GET /list/{id}/task`). Duas estratégias possíveis:
- **Batch detail:** Para cada task, fazer `GET /task/{id}`. Com 100 tasks e rate limit de 100 req/min, pode demorar. Usar `Promise.allSettled` com concorrência limitada (10 paralelas).
- O cache de 10min mitiga o problema — a carga pesada acontece apenas 1x.

### `src/app/api/clickup/tasks/route.ts` — Endpoint

```typescript
// GET /api/clickup/tasks
// Query params: nenhum (filtros são client-side)
// Response: ClickUpIndice

// Cache in-memory com TTL de 10 minutos (mesmo padrão de /api/drive/indice)
let cache: { data: ClickUpIndice; timestamp: number } | null = null
const CACHE_TTL = 10 * 60 * 1000

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return Response.json(cache.data)
  }
  const indice = await carregarIndiceClickUp()
  cache = { data: indice, timestamp: Date.now() }
  return Response.json(indice)
}
```

---

## Frontend

### `dialog-explorador-clickup.tsx` — Explorador Visual

**Layout:** Dialog fullscreen responsivo (mesmo padrão de `dialog-explorador-videos.tsx`)

**Barra de filtros (topo):**
- **Status** — multi-select checkboxes (revisado, finalizada, etc.). Default: revisado + finalizada.
- **Tipo** — dropdown opcional (Face & Insta, Display, etc.)
- **Y-M** — dropdown opcional (mês/ano)
- **Busca** — input text, filtra por nome do card
- Todos os filtros são **client-side** sobre o índice carregado.

**Grid de cards:**
- Layout responsivo de cards (CSS grid, similar ao explorador de vídeos)
- Cada card mostra:
  - Thumbnail da primeira imagem (`thumbnailLarge` ou `url` da primeira attachment)
  - Nome do card (truncado se necessário)
  - Badge de status (com cor)
  - Badge de Tipo (ex: "Face & Insta")
  - Badge com quantidade de formatos (ex: "3 imgs")
  - Checkbox de seleção (top-left)
- **Click na thumbnail** → abre modal de preview

**Modal de preview:**
- Mostra todas as imagens do card em tamanho full
- Navegação entre imagens (setas ou dots)
- Label do placement detectado em cada imagem (Quadrado, Vertical, Horizontal)
- Dimensões e tamanho do arquivo

**Footer:**
- Contador de selecionados: "N cards selecionados (M imagens)"
- Botão "Continuar" → fecha dialog e abre formulário

**States:**
- `carregando` — skeleton grid durante fetch do índice
- `tasks` — índice completo (ClickUpTask[])
- `selecionados` — Map<taskId, ClickUpTask>
- `filtroStatus` — string[] (default: ["revisado", "finalizada"])
- `filtroTipo` — string | null
- `filtroYM` — string | null
- `busca` — string
- `previewTask` — ClickUpTask | null (para modal)

### `formulario-lote-imagens.tsx` — Formulário de Lote

**Mesmo padrão de `formulario-lote-videos.tsx` adaptado para imagens.**

**Seção Destino:**
- Brand (dropdown) — auto-detect se possível pelo nome do card (contém _EV_ ou _GC_)
- Campanha (dropdown, carrega ao selecionar brand)
- Ad Set (dropdown, carrega ao selecionar campanha)

**Campos compartilhados:**
- Descrição (input)
- CTA (dropdown de `CTA_OPTIONS`)

**Por anúncio (1 card selecionado = 1 bloco):**
- Mini grid de thumbnails (mostrando os formatos/placements detectados)
- Ad Name: pré-preenchido `STATIC-{DESTINO}-{NOME_LIMPO}-W{SEMANA}-{ANO}`, editável. Track se foi editado manualmente.
- Título (input, max 40 chars com contador)
- Texto Principal (textarea, 2 rows)
- Link Campanha (input URL)
- Botão remover (X)
- Botão replicar (copiar texto/link para todos os outros)

**Geração do Ad Name:**
- Reutilizar lógica de `gerarAdName()` do formulário de vídeos
- Trocar prefixo de `VIDEO` para `STATIC`
- Limpar nome do card: remover prefixo "Face |" / "Display |", remover "| 3 formatos", normalizar

**Salvar:**
- POST em `/api/ads/lote` com:
  ```json
  {
    "brandId": "...",
    "campaignId": "...",
    "adSetId": "...",
    "descricao": "...",
    "cta": "...",
    "anuncios": [
      {
        "adName": "STATIC-PRODUCT-EL-ORIGEN-W14-2026",
        "titulo": "...",
        "textoPrincipal": "...",
        "linkCampanha": "...",
        "assets": [
          { "placement": "feed", "url": "https://...1080X1080.jpg", "type": "image" },
          { "placement": "stories", "url": "https://...1080X1920.jpg", "type": "image" },
          { "placement": "horizontal", "url": "https://...1200x628.jpg", "type": "image" }
        ]
      }
    ]
  }
  ```
- Resposta: `{ criados: N, erros: N, detalhes: [...] }`

### Alterações em `painel-criacao.tsx`

- Novo botão "Importar Estáticos" (ao lado do botão de vídeos)
- States: `explorador​ClickupAberto`, `formularioImagensAberto`, `cardsClickupSelecionados`
- Fluxo: botão → dialog explorador → ao confirmar → abre formulário lote → ao salvar → refresh lista

---

## Configuração

### Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `CLICKUP_API_TOKEN` | Personal API Token (pk_...) |

Já adicionada ao `.env.example`.

### Constantes (em `clickup.ts` ou `constants.ts`)

| Constante | Valor |
|-----------|-------|
| `CLICKUP_LIST_ID` | `"11430929"` |
| `CLICKUP_CACHE_TTL` | `10 * 60 * 1000` (10 min) |
| `CLICKUP_CONCURRENCY` | `10` (requests paralelas para buscar detalhes) |
| `IMAGE_EXTENSIONS` | `["jpg", "jpeg", "png", "webp", "gif"]` |

---

## Rate Limiting e Performance

- ClickUp Free/Business: **100 req/min**
- A listagem retorna 100 tasks/página. Para cada task precisamos do detalhe (attachments).
- Com concorrência de 10, uma página de 100 tasks leva ~10 batches × ~200ms = ~2s
- Cache de 10min garante que isso acontece no máximo 6x/hora
- Se a lista crescer muito (>500 tasks), considerar filtrar por status na API para reduzir volume

---

## Testes

- Testar chamadas à API do ClickUp com token válido
- Testar classificação de placement por nome de arquivo (já coberto pelos testes de `ad-media.ts`)
- Testar resolução de custom fields (dropdown orderindex → name)
- Testar filtros client-side (status, tipo, Y-M, busca)
- Testar geração de ad name com prefixo STATIC
- Testar integração end-to-end: selecionar cards → preencher form → salvar ads no Supabase
