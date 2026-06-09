#!/usr/bin/env python3
"""Gera PDF com relatório das mudanças do deploy de 06/03/2026 — cores Evino."""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

BASE = os.path.dirname(__file__)
OUT = os.path.join(BASE, "relatorio_deploy_06mar.pdf")
SS_DIR = os.path.join(BASE, "screenshots")

# ── Cores Evino ──────────────────────────────────────────────
VERDE       = HexColor("#03a678")   # primary green
VERDE_DARK  = HexColor("#088A66")   # dark green
VERMELHO    = HexColor("#CE2A36")   # accent red
FLORESTA    = HexColor("#134c19")   # dark forest
PRETO       = HexColor("#1C1C1C")   # text
CINZA       = HexColor("#696969")   # secondary text
FUNDO       = HexColor("#f5f7f5")   # light green-tinted bg
BORDA       = HexColor("#d4e5d9")   # soft green border
BRANCO      = HexColor("#ffffff")

# ── Estilos ────────────────────────────────────────────────────
styles = getSampleStyleSheet()
styles.add(ParagraphStyle("Titulo", parent=styles["Title"], fontSize=24, textColor=FLORESTA, spaceAfter=6, fontName="Helvetica-Bold"))
styles.add(ParagraphStyle("Subtitulo", parent=styles["Normal"], fontSize=11, textColor=CINZA, spaceAfter=18))
styles.add(ParagraphStyle("H2", parent=styles["Heading2"], fontSize=15, textColor=FLORESTA, spaceBefore=16, spaceAfter=8, fontName="Helvetica-Bold"))
styles.add(ParagraphStyle("H3", parent=styles["Heading3"], fontSize=12, textColor=VERDE, spaceBefore=12, spaceAfter=6, fontName="Helvetica-Bold"))
styles.add(ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, textColor=PRETO, leading=15, spaceAfter=6))
styles.add(ParagraphStyle("BulletCustom", parent=styles["Normal"], fontSize=10, textColor=PRETO, leading=15, leftIndent=18, bulletIndent=6, spaceAfter=3))
styles.add(ParagraphStyle("Caption", parent=styles["Normal"], fontSize=9, textColor=CINZA, alignment=TA_CENTER, spaceBefore=4, spaceAfter=12))
styles.add(ParagraphStyle("Stat", parent=styles["Normal"], fontSize=10, textColor=PRETO, alignment=TA_CENTER))

def add_screenshot(story, filename, caption, W):
    """Adiciona screenshot ao relatório se existir, mantendo aspect ratio."""
    path = os.path.join(SS_DIR, filename)
    if os.path.exists(path):
        from reportlab.lib.utils import ImageReader
        reader = ImageReader(path)
        iw, ih = reader.getSize()
        aspect = ih / iw
        img_w = W
        img_h = img_w * aspect
        # Limit max height to ~14cm to avoid page overflow
        max_h = 14 * cm
        if img_h > max_h:
            img_h = max_h
            img_w = img_h / aspect
        img = Image(path, width=img_w, height=img_h)
        img.hAlign = "CENTER"
        story.append(img)
        story.append(Paragraph(caption, styles["Caption"]))
    else:
        story.append(Paragraph(f"<i>[Screenshot: {caption}]</i>", styles["Caption"]))

def build_pdf():
    doc = SimpleDocTemplate(
        OUT, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )
    W = A4[0] - 4*cm
    story = []

    # ── CAPA ───────────────────────────────────────────────────
    story.append(Spacer(1, 2*cm))

    # Barra verde decorativa
    bar = Table([["  "]], colWidths=[W])
    bar.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), VERDE),
        ("TOPPADDING", (0,0), (-1,-1), 2),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2),
    ]))
    story.append(bar)
    story.append(Spacer(1, 1*cm))

    story.append(Paragraph("Claudinho", styles["Titulo"]))
    story.append(Paragraph("Relatorio de Deploy", ParagraphStyle("SubTitle2", parent=styles["Title"], fontSize=18, textColor=VERDE, spaceAfter=8)))
    story.append(Paragraph("06 de marco de 2026 &bull; 3 commits &bull; 24 arquivos &bull; +2.417 / -590 linhas", styles["Subtitulo"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDA, spaceAfter=20))

    # Resumo executivo
    story.append(Paragraph("Resumo Executivo", styles["H2"]))
    story.append(Paragraph(
        "Neste deploy evoluimos o Claudinho de uma ferramenta que apenas lia dados da planilha "
        "para um <b>sistema completo de gestao de anuncios</b> com banco de dados proprio, "
        "suporte a multiplas marcas, historico de auditoria e exportacao.",
        styles["Body"]
    ))

    # Stats com cores Evino
    stats_data = [
        ["3", "24", "2.417", "7"],
        ["Commits", "Arquivos alterados", "Linhas adicionadas", "Novas API routes"],
    ]
    stats_table = Table(stats_data, colWidths=[W/4]*4)
    stats_table.setStyle(TableStyle([
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("FONTSIZE", (0,0), (-1,0), 22),
        ("FONTSIZE", (0,1), (-1,1), 8),
        ("TEXTCOLOR", (0,0), (-1,0), VERDE),
        ("TEXTCOLOR", (0,1), (-1,1), CINZA),
        ("FONT", (0,0), (-1,0), "Helvetica-Bold"),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LINEBELOW", (0,0), (-1,0), 0.5, BORDA),
    ]))
    story.append(Spacer(1, 12))
    story.append(stats_table)

    # Screenshot da pagina principal
    story.append(Spacer(1, 16))
    add_screenshot(story, "criacao_page.png", "Pagina de Criacao de Anuncios — aba Evino", W)

    # ── MUDANCA 1 ──────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("1. Selecao Multi-Marca (Evino / GrandCru)", styles["H2"]))
    story.append(Paragraph(
        "Antes, a planilha era fixa para Evino. Agora o sistema suporta multiplas marcas, "
        "cada uma com sua propria aba na planilha e configuracao de conta Meta.",
        styles["Body"]
    ))
    story.append(Paragraph("O que mudou:", styles["H3"]))
    story.append(Paragraph("&bull; Seletor de marca (Evino / GrandCru) no topo da pagina de criacao", styles["BulletCustom"]))
    story.append(Paragraph("&bull; Cada marca tem sua aba na Google Sheets (Evino_Anuncios_Novos, GrandCru_Anuncios_Novos)", styles["BulletCustom"]))
    story.append(Paragraph("&bull; A API de pendentes agora recebe o parametro <b>aba</b> para filtrar por marca", styles["BulletCustom"]))
    story.append(Paragraph("&bull; Arquivos alterados: <b>painel-criacao.tsx</b>, <b>sheets.ts</b>, <b>pendentes/route.ts</b>, <b>criar-anuncio/route.ts</b>", styles["BulletCustom"]))

    # ── MUDANCA 2 ──────────────────────────────────────────────
    story.append(Spacer(1, 16))
    story.append(Paragraph("2. Planilha Expandida (ate coluna R)", styles["H2"]))
    story.append(Paragraph(
        "O mapeamento de colunas foi estendido de ~10 para 18 colunas (A ate R). "
        "Isso permite ler e escrever todos os campos necessarios para automacao completa.",
        styles["Body"]
    ))
    story.append(Paragraph("Novas colunas mapeadas:", styles["H3"]))

    cols_data = [
        ["Coluna", "Campo", "Descricao"],
        ["A-B", "Campaign / Ad Set", "Nomes de campanha e conjunto"],
        ["C-D", "Campaign ID / Ad Set ID", "IDs do Meta Ads Manager"],
        ["E", "Tipo", "VIDEO ou ESTATICO"],
        ["F", "Ad Name", "Nome padronizado do anuncio"],
        ["G-J", "Texto / Titulo / Desc / CTA", "Copy do anuncio"],
        ["K-L", "Link Campanha / Link Anuncio", "URLs com UTMs auto-gerados"],
        ["M", "Link Video (Drive)", "URL do criativo (Drive ou Cloudinary)"],
        ["N", "Status Automacao", "PENDENTE / CONCLUIDO / ERRO"],
        ["O-R", "Ad ID / Page ID / Account / Data", "Feedback apos publicacao"],
    ]
    col_table = Table(cols_data, colWidths=[2.5*cm, 4.5*cm, W-7*cm])
    col_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), VERDE),
        ("TEXTCOLOR", (0,0), (-1,0), BRANCO),
        ("FONTSIZE", (0,0), (-1,-1), 8),
        ("FONT", (0,0), (-1,0), "Helvetica-Bold"),
        ("TEXTCOLOR", (0,1), (-1,-1), PRETO),
        ("GRID", (0,0), (-1,-1), 0.5, BORDA),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [BRANCO, FUNDO]),
    ]))
    story.append(col_table)

    # ── MUDANCA 3 ──────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("3. Banco de Dados Supabase + Gestao Completa de Ads", styles["H2"]))
    story.append(Paragraph(
        "Este foi o maior bloco de mudancas. Migramos de uma arquitetura 100% baseada em planilha "
        "para um banco PostgreSQL no Supabase como <b>fonte de verdade</b>.",
        styles["Body"]
    ))

    story.append(Paragraph("Novas tabelas criadas:", styles["H3"]))
    story.append(Paragraph("&bull; <b>brands</b> — Marcas com conta Meta e nome da aba (Evino, GrandCru)", styles["BulletCustom"]))
    story.append(Paragraph("&bull; <b>ads</b> — Anuncios com todos os campos (campanha, copy, links, status, IDs Meta)", styles["BulletCustom"]))
    story.append(Paragraph("&bull; <b>ad_assets</b> — Assets (imagens/videos) por placement (feed, stories, reels)", styles["BulletCustom"]))
    story.append(Paragraph("&bull; <b>audit_log</b> — Log de auditoria com todas as acoes (criou, atualizou, importou, erro)", styles["BulletCustom"]))

    # Screenshot do historico
    story.append(Spacer(1, 12))
    add_screenshot(story, "historico_page.png", "Pagina de Historico — audit log em tempo real", W)

    story.append(Paragraph("Novos arquivos criados:", styles["H3"]))
    story.append(Paragraph("&bull; <b>src/lib/supabase.ts</b> — Cliente Supabase singleton", styles["BulletCustom"]))
    story.append(Paragraph("&bull; <b>src/lib/db.ts</b> (415 linhas) — Camada de acesso a dados completa (CRUD, filtros, paginacao, busca)", styles["BulletCustom"]))
    story.append(Paragraph("&bull; <b>src/lib/utm.ts</b> — Gerador automatico de links UTM", styles["BulletCustom"]))
    story.append(Paragraph("&bull; <b>supabase/schema.sql</b> — Schema DDL completo com indexes e triggers", styles["BulletCustom"]))

    story.append(Paragraph("Novas API Routes:", styles["H3"]))
    api_data = [
        ["Rota", "Metodo", "Funcao"],
        ["/api/ads", "GET / POST", "Listar e criar anuncios no banco"],
        ["/api/ads/[id]", "GET / PATCH", "Detalhe e atualizacao de anuncio"],
        ["/api/brands", "GET", "Listar marcas cadastradas"],
        ["/api/import/sheets", "POST", "Importar planilha -> Supabase (com dedup)"],
        ["/api/export", "GET", "Exportar anuncios para XLSX ou CSV"],
        ["/api/audit", "GET", "Consultar log de auditoria"],
    ]
    api_table = Table(api_data, colWidths=[4*cm, 2.8*cm, W-6.8*cm])
    api_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), FLORESTA),
        ("TEXTCOLOR", (0,0), (-1,0), BRANCO),
        ("FONTSIZE", (0,0), (-1,-1), 8),
        ("FONT", (0,0), (-1,0), "Helvetica-Bold"),
        ("TEXTCOLOR", (0,1), (-1,-1), PRETO),
        ("GRID", (0,0), (-1,-1), 0.5, BORDA),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [BRANCO, FUNDO]),
    ]))
    story.append(api_table)

    # ── MUDANCA 4 ──────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("4. Suporte a Video e Imagem na Criacao", styles["H2"]))
    story.append(Paragraph(
        "O fluxo de criacao de anuncios na Meta foi refatorado para suportar dois tipos de criativos:",
        styles["Body"]
    ))
    story.append(Paragraph("&bull; <b>Video</b> — Upload de video do Google Drive, gera ad com Video Creative", styles["BulletCustom"]))
    story.append(Paragraph("&bull; <b>Imagem (Estatico)</b> — URLs Cloudinary por placement (1080x1080 feed, 1080x1920 stories, 1200x628 reels)", styles["BulletCustom"]))
    story.append(Paragraph(
        "O arquivo <b>meta-criar.ts</b> passou de ~50 para ~300 linhas, "
        "agora com funcoes separadas para cada tipo de criativo e tratamento de erros.",
        styles["Body"]
    ))

    # ── MUDANCA 5 ──────────────────────────────────────────────
    story.append(Spacer(1, 16))
    story.append(Paragraph("5. Pagina de Performance + Exportacao", styles["H2"]))
    story.append(Paragraph("Duas novas funcionalidades de interface:", styles["Body"]))
    story.append(Paragraph("&bull; <b>Pagina /historico</b> — Timeline com todos os eventos do sistema (importacao, criacao, erro, atualizacao)", styles["BulletCustom"]))
    story.append(Paragraph("&bull; <b>Exportar Excel</b> — Botao para baixar todos os anuncios filtrados como .xlsx ou .csv", styles["BulletCustom"]))
    story.append(Paragraph("&bull; <b>Importar da Planilha</b> — Botao que sincroniza dados do Google Sheets para o Supabase (com deduplicacao)", styles["BulletCustom"]))

    # Screenshot de performance
    story.append(Spacer(1, 12))
    add_screenshot(story, "performance_page.png", "Pagina de Performance — metricas e anuncios ativos", W)

    # ── ARQUITETURA ────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Visao Geral da Arquitetura (Apos Deploy)", styles["H2"]))

    arch_data = [
        ["Camada", "Tecnologia", "Papel"],
        ["Frontend", "Next.js 16 + React 19 + Tailwind + Radix", "Interface de criacao, performance e historico"],
        ["Auth", "Clerk (Google OAuth)", "Autenticacao de usuarios"],
        ["API", "Next.js API Routes (App Router)", "7 endpoints REST"],
        ["Banco", "Supabase (PostgreSQL)", "4 tabelas, indexes, triggers"],
        ["Planilha", "Google Sheets API", "Fonte de dados de entrada (Evino + GrandCru)"],
        ["Ads", "Meta Marketing API", "Criacao de campanhas, ad sets e anuncios"],
        ["Assets", "Google Drive + Cloudinary", "Armazenamento de videos e imagens"],
        ["Export", "xlsx (SheetJS)", "Exportacao de dados para Excel/CSV"],
    ]
    arch_table = Table(arch_data, colWidths=[2.5*cm, 5.5*cm, W-8*cm])
    arch_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), FLORESTA),
        ("TEXTCOLOR", (0,0), (-1,0), BRANCO),
        ("FONTSIZE", (0,0), (-1,-1), 8),
        ("FONT", (0,0), (-1,0), "Helvetica-Bold"),
        ("TEXTCOLOR", (0,1), (-1,-1), PRETO),
        ("GRID", (0,0), (-1,-1), 0.5, BORDA),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [BRANCO, FUNDO]),
    ]))
    story.append(arch_table)

    # Fluxo
    story.append(Spacer(1, 16))
    story.append(Paragraph("Fluxo Principal", styles["H3"]))
    flow_steps = [
        "1. Usuario preenche dados na Google Sheets (aba Evino ou GrandCru)",
        "2. No Claudinho, clica em 'Importar da Planilha' — dados vao para Supabase",
        "3. Anuncios aparecem como 'Pendentes' no painel de Criacao",
        "4. Clica em 'Subir Anuncio' — sistema cria campanha/adset/ad na Meta via API",
        "5. Status atualiza para 'Concluido' e IDs da Meta sao gravados no banco e na planilha",
        "6. Tudo fica registrado no Historico (audit_log)",
        "7. Pode exportar tudo como Excel a qualquer momento",
    ]
    for step in flow_steps:
        story.append(Paragraph(step, styles["BulletCustom"]))

    # ── FOOTER ─────────────────────────────────────────────────
    story.append(Spacer(1, 2*cm))

    # Barra verde final
    bar2 = Table([["  "]], colWidths=[W])
    bar2.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), VERDE),
        ("TOPPADDING", (0,0), (-1,-1), 1),
        ("BOTTOMPADDING", (0,0), (-1,-1), 1),
    ]))
    story.append(bar2)
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Gerado automaticamente pelo Claude Code em 06/03/2026",
        ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, textColor=CINZA, alignment=TA_CENTER)
    ))

    doc.build(story)
    print(f"PDF gerado: {OUT}")

if __name__ == "__main__":
    build_pdf()
