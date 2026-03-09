# Claudinho (Painel Meta Ads) 🤖📊

**Claudinho** é um painel interno de automação e gestão de campanhas de marketing, focado unicamente na integração com **Meta Ads**, **Google Drive**, **Google Sheets** e **Supabase**. Ele permite a criação rápida de anúncios, acompanhamento do histórico de modificações e análise de performance (Insights).

Este documento serve como a **Documentação Principal (AI-Friendly)** para o projeto. Ao contribuir com este repositório, referencie esta documentação para entender a arquitetura, padrões e dependências.

---

## 🛠️ Stack Tecnológico

- **Framework:** [Next.js 16.1](https://nextjs.org/) (App Router)
- **View Engine:** React 19
- **Estilização:** Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/) (Radix UI)
- **Autenticação:** [Clerk](https://clerk.com/) (`@clerk/nextjs`)
- **Banco de Dados:** [Supabase](https://supabase.com/) (PostgreSQL)
- **Integrações Externas (APIs):**
  - Meta Graph API (Criação de anúncios, busca de insights)
  - Google APIs (Drive, Sheets)
- **Linguagem:** TypeScript estrito

---

## 📂 Arquitetura e Estrutura de Diretórios

O projeto segue a estrutura padrão do **Next.js App Router** com diretório `src/`:

```text
/
├── src/
│   ├── app/                # Rotas da aplicação (Next.js App Router)
│   │   ├── api/            # Endpoints de API internas e Webhooks
│   │   ├── criacao/        # Interface de criação de anúncios (PainelCriacao)
│   │   ├── historico/      # Log de auditoria e histórico de anúncios criados
│   │   ├── performance/    # Dashboard de métricas e Meta Insights
│   │   ├── globals.css     # Estilos globais Tailwind
│   │   ├── layout.tsx      # Root layout com <ClerkProvider> e navegação
│   │   └── page.tsx        # Página inicial (redireciona para criação)
│   ├── components/         # Componentes React
│   │   ├── ui/             # Componentes base do shadcn/ui
│   │   └── ...             # Componentes de negócio (ex: painel-criacao, navegacao)
│   ├── lib/                # Utilidades, integrações e SDKs
│   │   ├── meta.ts         # Wrapper para Meta Graph API (Leitura/Insights)
│   │   ├── meta-criar.ts   # Wrapper para Meta Graph API (Escrita/Criação)
│   │   ├── db.ts           # Interações diretas com Supabase
│   │   ├── google-auth.ts  # Autenticação server-side com Google
│   │   ├── sheets.ts       # Leitura/Escrita no Google Sheets
│   │   ├── drive.ts        # Upload/Leitura de assets no Google Drive
│   │   ├── supabase.ts     # Inicialização do client Supabase
│   │   └── utm.ts          # Gerador de links parametrizados (UTM)
│   └── middleware.ts       # Middleware do Next.js (Proteção de rotas com Clerk)
├── supabase/
│   └── schema.sql          # Schema do banco de dados relacional
└── relatorio_deploy.py     # Script Python para automação de relatórios
```

---

## 🗄️ Modelo de Dados (Supabase)

O banco de dados relacional é gerenciado no Supabase. O schema principal (`supabase/schema.sql`) foca nas seguintes entidades:

1. **`brands`**: Marcas gerenciadas (ex: Evino, GrandCru) atreladas a contas de anúncio da Meta (`meta_account_id`).
2. **`ads`**: A entidade central de anúncios. Guarda os textos, links, status do processamento (`pendente`, `processando`, `concluido`, `erro`) e IDs da Meta. Relaciona-se com `brands`.
3. **`ad_assets`**: Imagens e vídeos vinculados a um anúncio (`ad_id`). Armazena o tipo de asset, posicionamento (placement) e URL (Drive/Storage).
4. **`audit_log`**: Tabela de log para auditoria de todas as ações de criação, edição ou importação na plataforma. Guarda o usuário do Clerk que executou a ação.

---

## 🤖 Padrões para Agentes de IA (AI-Friendly Guidelines)

Quando atuar neste repositório, por favor siga estas diretrizes arquiteturais:

### 1. Roteamento e Server Components
- Use **Server Components** por padrão em `src/app/`.
- Marque com `"use client"` apenas os componentes em `src/components/` que necessitem de interatividade (hooks, onClick, estado local).
- Mantenha a busca de dados sensível a token no lado do servidor passando os dados como props para os Client Components.

### 2. Autenticação e Autorização
- A proteção de rotas é feita via **Clerk** em `src/middleware.ts`. Rotas não explicitamente definidas no `isPublicRoute` requerem autenticação.
- O ID do usuário logado (Clerk) deve ser gravado nas tabelas do banco de dados (ex: `ads.created_by`, `audit_log.user_id`) para trailing de auditoria.

### 3. Integração com APIs Externas
- Toda lógica de comunicação direta com APIs externas deve residir em `src/lib/`.
- Exemplo: Nova feature de Google Sheets precisa ir em `src/lib/sheets.ts`, e nova rotação da Meta API em `src/lib/meta.ts` ou `meta-criar.ts`.
- **Nunca exponha Access Tokens no frontend.** Consuma os tokens do `process.env` sempre em Server Actions ou Rotas de API (`/api/...`).

### 4. Estilização Global
- Use classes de utilitários do **Tailwind CSS v4**.
- Utilize as variáveis de design system definidas no `globals.css` (padrão shadcn/ui) com a sintaxe semântica do tailwind (ex: `bg-background text-foreground`).

---

## 🚀 Como Executar o Projeto Localmente

1. Crie seu arquivo de ambiente:
   ```bash
   cp .env.example .env.local
   ```
   *Certifique-se de preencher as chaves do Clerk (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`), Supabase e APIs do Meta/Google.*

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Gire o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Acesse o painel pelo navegador em [http://localhost:3000](http://localhost:3000). A requisição passará pelo Middleware do Clerk solicitando o login.
