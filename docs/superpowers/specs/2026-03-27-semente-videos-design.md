# Semente de Vídeos — Design Spec

## Resumo

Feature para explorar vídeos do Google Drive, selecionar múltiplos, e criar lotes de anúncios de vídeo para subir na Meta Ads. Funciona como "semente" — cria rascunhos no Supabase que depois passam pelo fluxo existente de upload.

## Contexto

- Pasta do Drive: `1e3i_SxkmhZBfsEzh_2TT3oO61EnsBcJ6` (2026 - AUDIOVISUAL)
- Estrutura: `mês (01.2026, 02.2026...) → projeto (27_MAR_GC_Zé Delivery) → [subpastas] → vídeos`
- ~174 vídeos/mês, 4 níveis de profundidade, quase todos com thumbnail via API
- Vídeos são para Evino (`_EV_`) e GrandCru (`_GC_`)
- Service account já tem acesso: `sheets-facebook-ads@evini-488110.iam.gserviceaccount.com`

## Arquitetura — 2 Momentos

### Momento 1: Dialog Explorador de Vídeos

Dialog quase fullscreen com:

**Sidebar esquerda — Árvore de pastas:**
- Navegação hierárquica das pastas do Drive
- Contagem de vídeos por pasta
- Atalho "Novos (últimos 7 dias)" — lista flat de todos os vídeos recentes

**Área principal — Grid de vídeos:**
- Cards com: thumbnail real (do Drive), nome, duração, tamanho, data, pasta de origem
- Clique no card seleciona/deseleciona
- Preview via iframe do Drive (clique no ícone de play)
- Breadcrumb de navegação no topo

**Barra de filtros:**
- Filtro de data: últimos 7/14/30 dias, este mês, todos
- Toggle "Somente vídeos" (padrão: on)
- Toggle "Incluir subpastas" — mostra vídeos recursivamente

**Header:**
- Contador de selecionados
- Botão "Criar Anúncios (N) →" que avança para o Momento 2

### Momento 2: Formulário de Configuração do Lote

Após selecionar vídeos, um novo dialog/página com:

**Seção 1 — Destino:**
- Seletor de Brand (Evino / GrandCru)
- Seletor de Campanha (busca campanhas ativas da conta Meta selecionada)
- Seletor de Ad Set (busca ad sets da campanha) OU botão "Criar Novo Ad Set"
  - Se criar novo: campos nome, orçamento diário, datas início/fim

**Seção 2 — Campos compartilhados:**
- Texto principal (textarea)
- Descrição
- CTA (select: SHOP_NOW, LEARN_MORE, etc.)
- Link da campanha (gera UTM automaticamente)

**Seção 3 — Anúncios individuais (lista editável):**
- Um card por vídeo selecionado, mostrando thumbnail e nome do arquivo
- Campos editáveis por vídeo: ad_name (auto-gerado do nome do arquivo, editável) e título
- Botão para remover vídeo individual do lote

**Ação final:**
- Botão "Salvar Rascunhos (N)" → cria N registros de ads no Supabase com status "pendente"
- Redireciona para o painel de criação onde os ads aparecem na tabela de pendentes

## API Endpoints Novos

### `GET /api/drive/pastas`

Lista a árvore de pastas do Drive recursivamente.

**Query params:**
- `parentId` (opcional) — ID da pasta pai. Default: pasta raiz configurada

**Response:**
```json
{
  "pastas": [
    {
      "id": "abc123",
      "nome": "03.2026",
      "modifiedTime": "2026-03-03T13:31:54Z",
      "filhos": [
        {
          "id": "def456",
          "nome": "27_MAR_GC_Zé Delivery",
          "modifiedTime": "2026-03-27T17:37:36Z",
          "filhos": []
        }
      ]
    }
  ]
}
```

### `GET /api/drive/videos`

Lista vídeos de uma pasta (opcionalmente recursivo).

**Query params:**
- `pastaId` — ID da pasta do Drive
- `recursivo` (boolean, default: false) — incluir subpastas
- `dias` (number, opcional) — filtrar vídeos dos últimos N dias
- `pageToken` (opcional) — para paginação

**Response:**
```json
{
  "videos": [
    {
      "id": "file123",
      "nome": "Camila - Consumidor Final.mp4",
      "mimeType": "video/mp4",
      "tamanho": 176947200,
      "duracao": 74,
      "modifiedTime": "2026-03-27T17:37:36Z",
      "thumbnailLink": "https://...",
      "pastaOrigem": "27_MAR_GC_Zé Delivery",
      "driveUrl": "https://drive.google.com/file/d/file123/view"
    }
  ],
  "nextPageToken": null
}
```

### `GET /api/meta/campanhas`

Lista campanhas ativas de uma conta Meta.

**Query params:**
- `accountId` — ID da conta Meta (ex: act_775254035944122)

**Response:**
```json
{
  "campanhas": [
    {
      "id": "6877344933197",
      "nome": "Campaign_Teste",
      "status": "ACTIVE",
      "objetivo": "OUTCOME_SALES"
    }
  ]
}
```

### `GET /api/meta/adsets`

Lista ad sets de uma campanha.

**Query params:**
- `campaignId` — ID da campanha

**Response:**
```json
{
  "adsets": [
    {
      "id": "6877344934197",
      "nome": "AdGroup_Teste",
      "status": "ACTIVE",
      "dailyBudget": "5000"
    }
  ]
}
```

### `POST /api/ads/lote`

Cria um lote de ads no Supabase (rascunhos pendentes).

**Body:**
```json
{
  "brandId": "uuid",
  "campaignName": "Campaign_Teste",
  "campaignId": "6877344933197",
  "adSetName": "AdGroup_Teste",
  "adSetId": "6877344934197",
  "textoPrincipal": "🇮🇹 Deguste...",
  "descricao": "Beba com moderação!",
  "cta": "SHOP_NOW",
  "linkCampanha": "https://www.evino.com.br/...",
  "anuncios": [
    {
      "adName": "VID-Camila-ConsumidorFinal-MAR2026",
      "titulo": "Camila - Consumidor Final",
      "driveFileId": "file123",
      "driveUrl": "https://drive.google.com/file/d/file123/view"
    }
  ]
}
```

**Response:**
```json
{
  "criados": 3,
  "adIds": ["uuid1", "uuid2", "uuid3"]
}
```

## Componentes Novos

### `dialog-explorador-videos.tsx`
- Dialog quase fullscreen (95vh)
- State: pasta selecionada, vídeos listados, seleção, filtros
- Usa API `/api/drive/pastas` e `/api/drive/videos`
- Chama `onConfirmar(videosSelecionados)` ao clicar "Criar Anúncios"

### `formulario-lote-videos.tsx`
- Formulário dividido em 3 seções (destino, campos compartilhados, anúncios individuais)
- Usa API `/api/meta/campanhas` e `/api/meta/adsets`
- Gera ad_name automaticamente a partir do nome do arquivo
- Chama API `/api/ads/lote` ao salvar
- Redireciona para painel de criação após salvar

### Integração em `painel-criacao.tsx`
- Botão "Nova Semente de Vídeos" ao lado do botão existente
- Controla estado de abertura do dialog explorador e formulário

## Lib Novo

### `src/lib/drive-explorer.ts`
- `listarPastasRecursivo(parentId)` — retorna árvore de pastas
- `listarVideos(pastaId, opts)` — lista vídeos com filtros
- Reutiliza `getGoogleAuth()` existente
- Cache em memória da árvore de pastas (5 min TTL)

## Configuração

Nova variável de ambiente:
```
DRIVE_PASTA_VIDEOS=1e3i_SxkmhZBfsEzh_2TT3oO61EnsBcJ6
```

## O que NÃO muda

- Schema do Supabase (ads + ad_assets) — reutiliza as tabelas existentes
- Fluxo de upload para Meta (`/api/meta/criar-anuncio`) — não muda
- Tabela de pendentes — exibe os rascunhos normalmente
- `lib/drive.ts` (download) — reutiliza para upload posterior
- `lib/meta-criar.ts` — reutiliza para criação de criativos

## Decisões de Design

1. **Rascunhos, não upload direto** — a semente cria ads pendentes no Supabase. O upload para a Meta usa o fluxo existente. Isso mantém a separação de responsabilidades e permite revisão antes de publicar.

2. **Cache da árvore de pastas** — a estrutura de pastas muda raramente. Cache de 5 minutos evita chamadas excessivas ao Drive API.

3. **Thumbnails do Drive** — a API do Google Drive retorna `thumbnailLink` para vídeos. Usa-se diretamente nos cards, sem precisar baixar/processar.

4. **Preview via iframe** — `https://drive.google.com/file/d/{id}/preview` funciona como player embutido. Sem necessidade de streaming próprio.

5. **Ad name auto-gerado** — formato: `VID-{NomeArquivoLimpo}-{MES}{ANO}`. Editável pelo usuário.

6. **Seletor de campanha/adset busca da Meta API** — busca apenas ACTIVE. Permite criar novo ad set inline.
