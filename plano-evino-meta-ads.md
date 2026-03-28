# PLANO ESTRATÉGICO CONSOLIDADO — Evino x Meta Ads

> Proposta do claudinho-squad para otimização de performance das campanhas de marketing da Evino.com.br no Meta (Facebook/Instagram Ads). Resultado da discussão entre Marketeiro Digital, Creative, Dev Backend e Dev Frontend — 27/03/2026.

---

## CONTEXTO E DIAGNÓSTICO

A Evino se posiciona como democratizadora do vinho — acessível, moderna, com tom leve. Isso é vantagem competitiva para social ads, permitindo linguagem visual descontraída vs. wine brands tradicionais. Para escalar performance no Meta, identificamos 4 pilares interdependentes que precisam evoluir em paralelo:

1. **Infraestrutura de Tracking** — sem dados confiáveis, nenhuma otimização funciona
2. **Landing Pages de Alta Conversão** — o melhor anúncio perde se a LP não converte
3. **Produção Criativa em Escala** — o Meta em 2026 exige 10-20+ variações simultâneas
4. **Estratégia de Mídia e Otimização** — estrutura de campanhas, audiências e bidding

---

## FASE 1: FUNDAÇÃO DE TRACKING (Semanas 1-3)
*"Sem dados confiáveis, tudo é achismo"*

### Dev Backend (líder)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| API route `POST /api/meta/events` com Conversions API integrada (direto, sem esperar GTM SS) | Sem 1 | P0 |
| Enriquecimento server-side: 5+ parâmetros de match (email, telefone, nome, cidade — SHA-256) + `fbc`/`fbp` cookies + IP + User Agent | Sem 1-2 | P0 |
| Eventos CAPI: `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase` (com `value`, `currency`, `content_ids`, `content_type`, `num_items`) | Sem 2 | P0 |
| Deduplicação Pixel ↔ CAPI via `event_id` (alinhado com Frontend) | Sem 2 | P0 |
| Configurar GTM Server-Side como camada adicional | Sem 3 | P1 |

### Dev Frontend (co-líder)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| DataLayer unificado com schema padronizado | Sem 1 | P0 |
| Hook React `useTracking()` que gera `event_id`, hasheia user_data, faz push no dataLayer + envia ao backend via fetch com `keepalive: true` | Sem 1-2 | P0 |
| Implementar eventos padrão do Meta Pixel (client-side): ViewContent, AddToCart, Purchase, InitiateCheckout | Sem 2 | P0 |

### Marketeiro Digital (validação)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| Validar Event Match Quality > 7.0 no Events Manager | Sem 3 | P0 |
| Configurar janela de atribuição: 7-day click + 1-day view | Sem 2 | P0 |
| Definir UTMs padronizados para todas as campanhas | Sem 1 | P0 |

### Creative (compliance)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| Checklist de compliance de álcool (antes de qualquer criativo ir pro ar) | Sem 1 | P0 |

### Contrato do DataLayer

```typescript
// hooks/useTracking.ts
export function useTracking() {
  const trackEvent = (eventName: string, data: EventData) => {
    const eventId = crypto.randomUUID();

    // 1. Push pro dataLayer (GTM captura pro Pixel)
    window.dataLayer?.push({
      event: eventName,
      event_id: eventId,
      ecommerce: data.ecommerce,
      user_data: data.userData
    });

    // 2. Envia pro backend (CAPI)
    fetch('/api/meta/events', {
      method: 'POST',
      body: JSON.stringify({ event_name: eventName, event_id: eventId, ...data }),
      keepalive: true // garante envio mesmo se usuário navegar
    });
  };

  return { trackEvent };
}
```

**Meta da fase:** EMQ > 7.0/10, todos os eventos de conversão trackeados client + server-side com deduplicação funcional.

---

## FASE 2: CATÁLOGO DINÂMICO + AUDIÊNCIAS (Semanas 2-4)
*"O algoritmo do Meta é tão bom quanto os dados que recebe"*

### Dev Backend (líder)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| Feed de produtos sincronizado com Meta Commerce Manager via Catalog Batch API | Sem 2-3 | P0 |
| Campos do feed: id, title, description, price, sale_price, availability, image_link (packshot + lifestyle), brand, url | Sem 2-3 | P0 |
| Campos enriquecidos: tipo de uva, país de origem, rating, volume (ml) | Sem 3 | P1 |
| Custom labels: faixa de preço, ocasião, destaque, país, tipo de uva | Sem 3 | P1 |
| Atualização automática do feed a cada 1h + webhook em mudança de preço/estoque | Sem 3-4 | P1 |
| Endpoint para exportar Custom Audiences por LTV, frequência e recência de compra | Sem 3-4 | P1 |
| Integração CRM → Meta Custom Audiences via API | Sem 4 | P1 |

### Custom Labels do Feed
| Label | Valores exemplo | Uso |
|-------|----------------|-----|
| `custom_label_0` | "Até R$49", "R$50-99", "R$100+" | Segmentar por poder aquisitivo |
| `custom_label_1` | "Casual", "Jantar Especial", "Presente", "Churrasco" | Matching com contexto do ad |
| `custom_label_2` | "Bestseller", "Novo", "Última Chance", "Exclusivo" | Badges dinâmicos no overlay |
| `custom_label_3` | "Argentina", "Chile", "Portugal", "Itália" | Campanhas temáticas por região |
| `custom_label_4` | "Malbec", "Cabernet", "Pinot Noir" | Criativos educativos |

### Marketeiro Digital (co-líder)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| Configurar Lookalike Audiences baseados em valor (Value-Based LLA 1-3%) | Sem 3 | P0 |
| Custom Audiences do CRM: compradores recorrentes, churned, alto ticket | Sem 3-4 | P1 |
| Exclusões: compradores recentes (7-14 dias) excluídos do TOF | Sem 3 | P0 |
| Habilitar Dynamic Product Ads no Ads Manager | Sem 4 | P0 |

### Creative (suporte)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| Fornecer 2 imagens por SKU: packshot (fundo neutro) + lifestyle (em contexto). Resolução mínima 1080x1080px | Sem 2-4 | P0 |
| Criar 3 templates de overlay para DPA: Oferta (badge desconto + preço riscado), Destaque (badge + nome + preço), Premium (sem badge, foco imagem) | Sem 3-4 | P1 |

**Meta da fase:** Catálogo completo com 100% dos SKUs, DPA habilitado, audiências de valor configuradas.

---

## FASE 3: LANDING PAGES DE ALTA CONVERSÃO (Semanas 3-5)
*"O melhor anúncio do mundo perde se a LP não converte"*

### Dev Frontend (líder)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| Template de LP modular em Next.js com slots configuráveis (hero, grade de produtos, CTA, countdown, social proof) | Sem 3-4 | P0 |
| Age gate modal (compliance álcool) — obrigatório antes de linkar ads | Sem 3 | P0 |
| Otimização Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms | Sem 4-5 | P0 |
| Componentes: carrossel scroll-snap nativo, countdown server-rendered, social proof bar, sticky CTA mobile (56px, touch target 44px+) | Sem 4 | P0 |
| Sistema de skins por campanha via CSS variables | Sem 4-5 | P1 |
| Conteúdo dinâmico baseado em UTMs/query params (scent matching) | Sem 5 | P1 |

### Creative (co-líder)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| Design system compartilhado (tokens + componentes) no Figma, exportado para Tailwind config | Sem 3-4 | P0 |
| Assets para hero das LPs em resolução dupla (1x para ad, 2x para LP) | Sem 4-5 | P0 |
| Skins visuais por segmento (mulheres 28-45, homens 30-50, jovens 25-34) | Sem 4-5 | P1 |

### Design System Compartilhado

**Paleta de Cores:**

| Token | Hex | Uso |
|-------|-----|-----|
| `--wine-primary` | #8B1A2B | CTAs, destaques, badges de desconto |
| `--wine-dark` | #1C1C2E | Fundos, sticky bar, headers |
| `--wine-gold` | #D4A017 | Estrelas, premium, elementos de destaque |
| `--wine-warm` | #F5E6D3 | Backgrounds de conteúdo, cards |
| `--wine-accent` | #C41E3A | Urgência, countdown, alertas |
| `--wine-text` | #2D2D3A | Texto principal |
| `--wine-muted` | #8A8A9A | Texto secundário, labels |

**Tipografia:**
- Headlines: Inter Bold / 24-32px mobile, 36-48px desktop
- Body: Inter Regular / 14-16px
- Price: Inter Black / tamanho variável, sempre maior que body
- Badge: Inter Semibold / 12-14px, uppercase

**Componentes visuais (Figma → Tailwind):**
- Badge de desconto: `rounded-full bg-wine-accent text-white px-3 py-1`
- Card de produto: `rounded-xl shadow-md bg-white overflow-hidden` (aspect ratio 3:4, garrafa 60% do card)
- CTA button: `rounded-lg bg-wine-primary text-white font-bold h-14 min-w-[200px]`
- Sticky CTA mobile: fundo `--wine-dark`, preço branco à esquerda, botão `--wine-primary` à direita, border-top 1px
- Countdown: números grandes, fonte mono, fundo escuro, texto claro (minimalista, não Shopee)
- Social proof: estrelas douradas `--wine-gold`, texto cinza médio, ícone trending
- Age gate: tela cheia mobile, overlay desktop, logo + pergunta + blur do conteúdo

### LPs a criar (Sem 5)
| LP | Propósito | Funil |
|----|-----------|-------|
| **Oferta Principal** | Deal do momento, hero + countdown + social proof | TOF |
| **Kit/Combo** | Kits temáticos, CTA de add to cart do kit inteiro | TOF/MOF |
| **Quiz/Curadoria** | "Descubra seu vinho ideal" — cards visuais, gera lead + recomendação | TOF (conteúdo) |
| **Primeira Compra** | Cupom exclusivo + frete grátis para retargeting | MOF |
| **Recompra/Clube** | Assinatura e benefícios para clientes existentes | BOF |

**Meta da fase:** 5 LPs otimizadas, < 2.5s load time mobile, design consistente com os ads, age-gating implementado.

---

## FASE 4: PRODUÇÃO CRIATIVA EM ESCALA (Semanas 3-6)
*"O Meta em 2026 consome criativos — ou você alimenta a máquina ou ela para"*

### Creative (líder)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| Recrutar 3-5 UGC creators (modelo gifting + fee R$500-1.500/mês) | Sem 3-4 | P0 |
| Criar templates modulares no Figma/Canva com módulos intercambiáveis (hook + corpo + CTA + background) | Sem 4-5 | P0 |
| Sessão de fotos/vídeo profissional: packshots, lifestyle, b-roll | Sem 5 | P1 |

### Batch Inicial de Criativos (Sem 5-6)
| Formato | Qtd | Funil | Specs |
|---------|-----|-------|-------|
| Reels/Vídeos UGC (unboxing, degustação, sommelier casual) | 10 | TOF | 9:16, 6-15s, hook 1.5s, subtitle obrigatório |
| Vídeos estilizados (garrafa hero + text overlay) | 5 | TOF/MOF | 9:16, 6-15s |
| Carrosséis educativos/kits | 5 | TOF/MOF | 1080x1080, 3-5 cards, CTA no último |
| Static images (lifestyle + price anchoring) | 5 | MOF/BOF | 1080x1080 e 1080x1350 |
| DPA overlays (desconto dinâmico) | 3 templates | MOF | Auto-gerado via catálogo |

### Mix Criativo por Etapa do Funil
| | Reels UGC | Vídeo estilizado | Carrossel | Static | DPA |
|---|---|---|---|---|---|
| **TOF** | 40% | 30% | 20% | 10% | — |
| **MOF** | 30% (social proof) | — | 40% (DPA) | 30% (oferta) | sim |
| **BOF** | 20% (novidades) | — | 50% (DPA complementar) | 30% (oferta exclusiva) | sim |

### Compliance de Álcool no Meta

| Permitido | Proibido |
|-----------|----------|
| Heritage, craftsmanship, história do vinho | Consumo excessivo |
| Momentos sociais (sem mostrar consumo) | Claims de saúde/relaxamento |
| Garrafa, rótulo, oferta em destaque | Apelo a menores |
| Harmonização com comida | Pessoas visivelmente embriagadas |

**Checklist obrigatório pré-publicação:**
- [ ] Nenhuma cena de consumo excessivo
- [ ] Sem claims de saúde, relaxamento ou confiança
- [ ] Sem apelo visual/linguístico a menores
- [ ] Foco em: produto, craftsmanship, origem, oferta
- [ ] Age gate presente na LP de destino
- [ ] Copy revisada contra termos proibidos do Meta

### Marketeiro Digital (co-líder)
| Ação | Entrega | Prioridade |
|------|---------|------------|
| Copy matrix: 3 ângulos (benefício/preço, social proof, urgência) x 3 formatos por etapa do funil | Sem 4-5 | P0 |
| Briefings de criativos com persona, tom e messaging por segmento | Sem 4 | P0 |

**Meta da fase:** 28+ variações criativas prontas, templates para escalar produção, compliance 100%.

---

## FASE 5: ESTRUTURA DE CAMPANHAS & LANÇAMENTO (Semanas 5-7)
*"Estrutura simples + bons dados + bons criativos = ROAS"*

### Estrutura de Campanhas

```
Campanha 1: PROSPECÇÃO (TOF) — CBO
   Ad Set: Broad Targeting (sem interesses, 25-55, Brasil)
   Ad Set: Lookalike 1% (Value-Based, melhores clientes LTV)
   Ad Set: Lookalike 1-3% (compradores gerais)
   → Criativos: Reels UGC + vídeos estilizados + carrosséis educativos
   → Otimização: Purchase, janela 7d click + 1d view
   → Exclusão: compradores últimos 14 dias

Campanha 2: RETARGETING (MOF) — CBO
   Ad Set: Visitantes site 7-14 dias (não compraram)
   Ad Set: Engajadores IG/FB 14 dias
   Ad Set: Abandono de carrinho 7 dias
   → Criativos: DPA carrossel + UGC social proof + static oferta
   → Frequency cap: máx 3-4x/semana
   → Otimização: Purchase

Campanha 3: RETENÇÃO/RECOMPRA (BOF) — CBO
   Ad Set: Clientes 30-90 dias (recompra)
   Ad Set: Clientes 90-180 dias (reativação)
   Ad Set: Clientes alto LTV (upsell/clube)
   → Criativos: DPA complementar + oferta exclusiva + novidades
   → Otimização: Purchase

Campanha 4: ADVANTAGE+ SHOPPING (ASC)
   → Automated — amplo, algoritmo do Meta define audiência
   → Criativos: mix de todos os melhores performers
   → Budget: 20-30% do total
```

### Lançamento
| Ação | Responsável | Entrega |
|------|-------------|---------|
| Lançar com 20-30% do budget total (fase de aprendizado) | Marketeiro | Sem 6 |
| Validar CAPI + Pixel no Events Manager (test events) | Mkt + Backend | Sem 6 |
| Monitorar CPM, CTR, CPC nos primeiros 3-5 dias | Marketeiro | Sem 6-7 |
| Creative testing: matar underperformers após 3-5 dias e $20-30 gastos | Creative + Mkt | Sem 6+ |
| Escalar budget para campanhas com ROAS > 3x | Marketeiro | Sem 7 |

**Meta da fase:** Campanhas rodando com budget de teste, dados fluindo, primeiros sinais de performance.

---

## FASE 6: OTIMIZAÇÃO CONTÍNUA & ESCALA (Semanas 7+)
*"Performance é um jogo infinito"*

| Ação | Responsável | Cadência |
|------|-------------|----------|
| A/B testing de LPs (hero copy, CTA, layout, social proof) | Frontend + Mkt | Contínuo |
| Creative refresh: 3-5 novos criativos/semana | Creative + Mkt | Semanal |
| Dashboard Supabase: ROAS, CAC, AOV, LTV por campanha e por criativo (via `utm_content`) | Backend + Mkt | Sem 7 (setup) |
| Automação retargeting por comportamento | Backend + Mkt | Sem 8+ |
| LPs sazonais — subir 2-3 semanas antes do pico | Todo o time | Calendário |
| Monitoramento EMQ com alertas se cair abaixo de 7.0 | Backend | Contínuo |
| Expansão: Advantage+ Shopping em escala, Reels Ads, Catalog Ads | Mkt + Creative | Sem 8+ |

---

## DIREÇÃO DE ARTE POR SEGMENTO

| Segmento | Perfil | Visual | Tom de copy |
|----------|--------|--------|-------------|
| **Mulheres 28-45, A/B** | Maior volume de conversão | Lifestyle elegante mas acessível, momentos de autocuidado | Empoderado, leve |
| **Homens 30-50, A/B** | Ticket médio mais alto | Editorial, foco na garrafa/rótulo, harmonização | Confiante, direto |
| **Jovens 25-34** | Crescimento acelerado, impulso | UGC puro, colorido, dinâmico, trends | Descomplicado, "vinho sem frescura" |
| **Presenteadores** | Sazonal, alto AOV | Packaging em destaque, mockups de caixa | Emocional, "surpreenda quem você ama" |

---

## KPIs E METAS

| Métrica | Target | Quando medir |
|---------|--------|-------------|
| Event Match Quality (CAPI) | > 7.0/10 | Fim da Fase 1 |
| LCP Mobile (LPs) | < 2.5s | Fim da Fase 3 |
| CTR Link Click (TOF) | > 1.5% | Fase 5+ |
| CPC | < R$1.50 | Fase 5+ |
| ROAS Meta | > 3x (meta: 4x+) | Fase 6 |
| Blended ROAS | > 4x | Fase 6 |
| CAC | < 30% do AOV | Fase 6 |
| Taxa de conversão LP | > 3% | Fase 6 |
| Creative refresh rate | 3-5 novos/semana | Fase 6+ |
| Hook Rate (3s views/impressions) | > 30% | Fase 6+ |

---

## CRONOGRAMA VISUAL

```
Semana:    1    2    3    4    5    6    7    8+
           |----|----|----|----|----|----|----|--->

TRACKING   ██████████████████
           DataLayer  CAPI   EMQ✓

CATÁLOGO        ██████████████████
                Feed   DPA   Audiências

LPs                  ██████████████████
                     Template  5 LPs  CWV✓

CRIATIVOS       ██████████████████████████
                UGC    Templates  28+ peças

CAMPANHAS                     ████████████████►
                              Setup  Launch  Escala

OTIMIZAÇÃO                              ████████►
                                        A/B  Ongoing
```

---

## INVESTIMENTO ESTIMADO EM PRODUÇÃO

| Item | Custo estimado |
|------|---------------|
| UGC Creators (3-5) | R$2.500-7.500/mês |
| Sessão foto/vídeo profissional | R$3.000-5.000/trimestre |
| Ferramentas (Canva Pro, templates) | R$200-500/mês |
| GTM Server-Side hosting | R$100-300/mês |
| **Total setup (Fases 1-5)** | **~6-8 semanas de trabalho do time** |

*Nota: custos de produção, não incluem budget de mídia paga no Meta.*

---

## INTERDEPENDÊNCIAS-CHAVE

| Backend | Frontend | Motivo |
|---------|----------|--------|
| CAPI endpoint | `useTracking` hook | Mesmo `event_id` para deduplicação |
| Feed de catálogo | Cards de produto nas LPs | Dados consistentes entre DPA e LP |
| Analytics Supabase | UTMs nas LPs | Performance por criativo |
| Age-gating middleware | Modal de idade na LP | Compliance álcool |

---

## CONSENSO DO TIME

O claudinho-squad está 100% alinhado nos seguintes pilares:

1. **CAPI + Pixel com deduplicação** é fundação não-negociável (Backend + Frontend)
2. **LPs dedicadas mobile-first < 2.5s** com scent matching (Frontend + Creative)
3. **UGC como formato principal** + DPA para retargeting em escala (Marketing + Creative)
4. **Catálogo de produtos enriquecido** com tags de ocasião e overlays dinâmicos (Backend + Creative)
5. **Compliance de álcool** em todas as camadas: criativos, LPs, age-gating (Todo o time)
6. **Otimizar para Purchase** sempre, nunca para eventos intermediários (Marketing)
7. **Broad targeting no TOF** + Lookalikes de valor — deixar o algoritmo trabalhar (Marketing)
8. **Testing contínuo** de criativos (3-5/semana) e LPs (A/B) como cultura permanente (Todo o time)

---

*Plano consolidado pelo claudinho-squad: Marketeiro Digital, Creative, Dev Backend, Dev Frontend — 27/03/2026*
