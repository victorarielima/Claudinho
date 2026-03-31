# Plano de Melhorias — Automação de Ads

**Origem:** Reunião com Renato Salzstein e Ana Vasconcelos (30/03/2026)
**Status:** Em andamento

---

## 1. Fix do pipeline de criação no Meta ✅

**Problema encontrado:** O client-side (`subirAnuncio` em `painel-criacao.tsx`) chamava `POST /api/meta/criar-anuncio` e ao receber `{ status: "processando" }` marcava o anúncio como "concluido" sem nunca chamar `POST /api/meta/processar` para executar o pipeline de 4 steps (upload → video processing → creative → ad).

**Correção aplicada:**
- Adicionado loop de polling no `subirAnuncio`: após iniciar via `criar-anuncio`, o client agora faz polling a cada 5s no `/api/meta/processar` até receber `step: "completed"` ou `step: "error"`
- Separados os fluxos legado (planilha, síncrono) e novo (Supabase, com polling) no client
- Timeout de 60 polls (5 min), com mensagem de progresso no UI durante processing
- `accountId` agora retornado no response de `processar` para o link "Ver no Ads Manager"

---

## 2. Melhorar identificação de erros ao subir pro Meta ✅

**Correções aplicadas:**

- **Catches vazios eliminados** em `criar-anuncio/route.ts` e `processar/route.ts` — agora logam o erro original E o erro de DB quando o fallback falha, usando `logger.error`
- **Logging estruturado** adicionado em cada step do pipeline (A, B, C, D) com `fn`, `adId`, `accountId`
- **Mensagens de erro descritivas** — em vez de "Asset de video nao encontrado", agora diz "Asset de video nao encontrado no banco. Verifique se o anuncio foi criado corretamente."
- **Validação de URL do Drive** antes do download no step A — rejeita URLs que não são do Google Drive com mensagem clara
- **Erros de download do Drive** agora envelopados com contexto: "Falha ao baixar video do Drive: {motivo}. Verifique se o arquivo existe e esta compartilhado."
- **Upload de imagens com `Promise.allSettled`** — não falha silenciosamente se algumas imagens falham, reporta quais falharam
- **Validação no ad-readiness** — aviso quando URL de vídeo não parece ser do Google Drive
- **Erro visível no modo compacto** — `tabela-pendentes.tsx` agora mostra `mensagemErro` truncada abaixo do nome do anúncio + tooltip com mensagem completa no status dot
- **Tooltip no status dot** (compact view) — hover mostra a mensagem de erro completa

---

## 3. Fix do placeholder/label nos campos

**Problema:** Na view compacta da `tabela-pendentes.tsx`, campos como "texto principal", "título" e "descrição" aparecem como "vazio" mesmo quando preenchidos. O placeholder sobrepõe o valor.

**Arquivos-chave:**
- `src/components/tabela-pendentes.tsx` — Renderização dos campos na tabela

**O que investigar:**
- [ ] Verificar como os campos são lidos do objeto `LinhaComStatus`
- [ ] Checar se o enriquecimento em `painel-criacao.tsx` (`enriquecerLinha`) está preservando os valores
- [ ] Verificar se o problema é de renderização (conditional rendering errado) ou de dados

---

## 4. Layout responsivo para notebook padrão ✅

**Viewport de referência:** Chrome no Windows 1366x768 → ~1366x625px útil.

**Ajustes aplicados:**

- **Formulário batch dialog:** `w-[80vw] h-[90vh]` → `w-[min(80vw,1100px)] h-[min(90vh,620px)]` — não cresce além do necessário em telas grandes, cabe em telas menores
- **Video explorer dialog:** `w-[95vw] h-[90vh]` → `w-[min(95vw,1300px)] h-[min(90vh,620px)]`
- **Video cards:** `minmax(180px,1fr)` → `minmax(150px,1fr)` — mais cards por linha em telas menores
- **Video thumbnails:** `aspect-[4/5]` → `aspect-square` — cards mais compactos verticalmente
- **Tabela pendentes (detail):** thumbnails `w-24 h-24` → `w-20 h-20`
- **Header do painel:** `flex` → `flex-col sm:flex-row` — empilha em mobile
- **Status counters:** adicionado `flex-wrap` para quebrar linha quando necessário
- **Espaçamento geral:** `gap-8` → `gap-6` entre seções

---

## 5. Nova lógica de nomenclatura automática (ad name) ✅

**Implementação em `formulario-lote-videos.tsx`:**

Novo formato: `VIDEO-{DESTINO}-{MIOLO}-W{NN}-{AAAA}`

| Componente | Fonte | Exemplo |
|---|---|---|
| `VIDEO` | Fixo (tipo do criativo) | `VIDEO` |
| DESTINO | Auto-detectado da URL de campanha | `PRODUCT`, `CAMPAIGN`, `CATEGORY`, `LANDING`, `LINK` |
| MIOLO | Nome do arquivo limpo (max 50 chars) | `IA-99mais` |
| W{NN}-{AAAA} | Semana ISO + ano | `W14-2026` |

**Helpers criados:**
- `extrairDestinoDaUrl(url)` — parseia pathname da URL pra detectar destino
- `semanaAno()` — retorna `W{NN}-{AAAA}` baseado na data atual
- `limparMiolo(nomeArquivo)` — sanitiza o filename para uso no nome

**Comportamento reativo:**
- Quando `linkCampanha` muda, ad names são regenerados automaticamente
- Flag `nomeEditado` preserva edições manuais (se o user editou o nome, não sobrescreve)
- Título continua derivado do nome do arquivo, editável independentemente

**Exemplos:**
- Arquivo `IA-99mais.mp4` + URL `evino.com.br/product/123` → `VIDEO-PRODUCT-IA-99mais-W14-2026`
- Arquivo `influencer-vinho.mp4` + sem URL → `VIDEO-influencer-vinho-W14-2026`
- Arquivo `campanha-verao.mp4` + URL `evino.com.br/campaign/abc` → `VIDEO-CAMPAIGN-campanha-verao-W14-2026`

---

## Fora de escopo (confirmado na reunião)

- Criação de campanhas na ferramenta (muda a cada 3-4 meses)
- Criação de ad sets (tratam como campanhas)
- Sugestões de texto com IA (backlog)
- Ads de foto/imagem (depois do vídeo funcionar)
- Ordenação de campanhas/ad sets por status ativo (nice-to-have, não prioritário agora)
