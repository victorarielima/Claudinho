"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TabelaPendentes,
  type LinhaComStatus,
} from "@/components/tabela-pendentes";
import type { Ad, AdAsset, Brand } from "@/lib/db";
import type { LinhaAnuncio, ChaveAba } from "@/lib/sheets";
import {
  detectarTipoCriativo,
  extrairImageAssets,
  normalizarPlacementImagem,
  rotuloPlacementImagem,
} from "@/lib/ad-media";

type FonteDados = "supabase" | "sheets";

export function PainelCriacao() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandSelecionado, setBrandSelecionado] = useState<Brand | null>(null);
  const [fonteDados, setFonteDados] = useState<FonteDados>("supabase");

  const [linhas, setLinhas] = useState<LinhaComStatus[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [jaCarregou, setJaCarregou] = useState(false);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string>("");

  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroData, setFiltroData] = useState<string>("todas");
  const [filtroCampanha, setFiltroCampanha] = useState<string>("todas");
  const [filtroAdSet, setFiltroAdSet] = useState<string>("todos");
  const [busca, setBusca] = useState<string>("");
  const [compacto, setCompacto] = useState(false);

  const [dialogCriar, setDialogCriar] = useState(false);
  const [importando, setImportando] = useState(false);
  const [abaLegada, setAbaLegada] = useState<ChaveAba>("evino");

  // ─── Carregar brands ───────────────────────────────────────
  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((json) => {
        if (json.data?.length > 0) {
          setBrands(json.data);
          setBrandSelecionado(json.data[0]);
          setFonteDados("supabase");
        } else {
          setFonteDados("sheets");
        }
      })
      .catch(() => {
        setFonteDados("sheets");
      });
  }, []);

  // ─── Validação de vídeos ───────────────────────────────────
  const validarVideos = useCallback(
    async (linhasParaValidar: LinhaComStatus[]) => {
      const comVideo = linhasParaValidar.filter((l) => l.linkVideo);
      if (comVideo.length === 0) return;

      setLinhas((prev) =>
        prev.map((l) =>
          comVideo.some((v) => v.indiceLinha === l.indiceLinha)
            ? { ...l, statusVideo: "verificando" as const }
            : l
        )
      );

      try {
        const res = await fetch("/api/drive/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itens: comVideo.map((l) => ({
              indiceLinha: l.indiceLinha,
              linkVideo: l.linkVideo,
            })),
          }),
        });

        const json = await res.json();
        if (!res.ok) return;

        if (json.serviceAccountEmail) {
          setServiceAccountEmail(json.serviceAccountEmail);
        }

        setLinhas((prev) =>
          prev.map((l) => {
            const resultado = json.resultados?.find(
              (r: { indiceLinha: number }) => r.indiceLinha === l.indiceLinha
            );
            if (!resultado) return l;
            return {
              ...l,
              statusVideo: resultado.acessivel ? ("acessivel" as const) : ("inacessivel" as const),
              erroVideo: resultado.erro,
              nomeArquivoVideo: resultado.nomeArquivo,
              thumbnailLink: resultado.thumbnailLink,
            };
          })
        );
      } catch {
        // Falha na validação não impede o fluxo
      }
    },
    []
  );

  // ─── Converter Ad → LinhaComStatus ─────────────────────────
  function adParaLinha(ad: Ad, index: number): LinhaComStatus {
    const videoAsset = ad.ad_assets?.find((a: AdAsset) => a.asset_type === "video");
    const imageAssets = ad.ad_assets?.filter((a: AdAsset) => a.asset_type === "image") ?? [];

    return {
      indiceLinha: index + 1,
      campaign: ad.campaign_name,
      adSet: ad.ad_set_name,
      campaignId: ad.campaign_id ?? "",
      adSetId: ad.ad_set_id ?? "",
      tipoPlanilha: "",
      adName: ad.ad_name,
      textoPrincipal: ad.texto_principal ?? "",
      titulo: ad.titulo ?? "",
      descricao: ad.descricao ?? "",
      cta: ad.cta,
      linkAnuncio: ad.link_anuncio ?? "",
      linkVideo: videoAsset?.asset_url ?? "",
      statusAutomacao: ad.status,
      adIdGerado: ad.meta_ad_id ?? "",
      pageId: "",
      accountId: ad.meta_account_id ?? "",
      data: new Date(ad.created_at).toLocaleDateString("pt-BR"),
      statusProcessamento: ad.status === "concluido" ? "concluido"
        : ad.status === "processando" ? "processando"
        : ad.status === "erro" ? "erro"
        : "pendente",
      adIdCriado: ad.meta_ad_id ?? undefined,
      mensagemErro: ad.error_message ?? undefined,
      statusVideo: videoAsset ? "nao_verificado" : "acessivel",
      adId: ad.id,
      tipo: ad.type as "video" | "image",
      imageAssets: imageAssets.map((a: AdAsset) => ({
        placement: normalizarPlacementImagem(a.placement, a.asset_url),
        url: a.asset_url,
      })),
      linkCampanha: ad.link_campanha ?? "",
      linkAux: ad.link_aux ?? "",
    };
  }

  // ─── Carregar dados ────────────────────────────────────────
  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    try {
      if (fonteDados === "supabase" && brandSelecionado) {
        const res = await fetch(`/api/ads?brand_id=${brandSelecionado.id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.erro ?? "Erro ao carregar dados");

        const ads: Ad[] = json.data;
        const novasLinhas = ads.map(adParaLinha);
        setLinhas(novasLinhas);
        setJaCarregou(true);

        const paraValidar = novasLinhas.filter(
          (l) => l.tipo === "video" && l.statusProcessamento !== "concluido" && l.linkVideo
        );
        if (paraValidar.length > 0) await validarVideos(paraValidar);
      } else {
        const res = await fetch(`/api/sheets/pendentes?aba=${abaLegada}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.erro ?? "Erro ao carregar planilha");

        const todas: LinhaAnuncio[] = json.data;
        const novasLinhas: LinhaComStatus[] = todas.map((l) => {
          const tipo = detectarTipoCriativo(l.tipoPlanilha, l.linkVideo);
          const imageAssets = tipo === "image" ? extrairImageAssets(l.linkVideo) : [];
          return {
            ...l,
            statusProcessamento: l.statusAutomacao === "Concluído" ? "concluido" as const
              : l.statusAutomacao === "Processando" ? "processando" as const
              : l.statusAutomacao.startsWith("Erro") ? "erro" as const
              : "pendente" as const,
            adIdCriado: l.statusAutomacao === "Concluído" ? l.adIdGerado : undefined,
            accountId: l.accountId || "",
            mensagemErro: l.statusAutomacao.startsWith("Erro") ? l.statusAutomacao.replace("Erro: ", "") : undefined,
            statusVideo: tipo === "image" ? "acessivel" as const : "nao_verificado" as const,
            tipo,
            imageAssets,
          };
        });

        setLinhas(novasLinhas);
        setJaCarregou(true);

        const paraValidar = novasLinhas.filter(
          (l) => l.tipo === "video" && l.statusProcessamento !== "concluido"
        );
        await validarVideos(paraValidar);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setCarregando(false);
    }
  }, [fonteDados, brandSelecionado, abaLegada, validarVideos]);

  useEffect(() => {
    if ((fonteDados === "supabase" && brandSelecionado) || fonteDados === "sheets") {
      carregarDados();
    }
  }, [fonteDados, brandSelecionado, abaLegada, carregarDados]);

  const revalidarVideo = useCallback(
    async (linha: LinhaComStatus) => { await validarVideos([linha]); },
    [validarVideos]
  );

  // ─── Seleção ───────────────────────────────────────────────
  const alternarSelecao = useCallback((indiceLinha: number) => {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(indiceLinha)) novo.delete(indiceLinha);
      else novo.add(indiceLinha);
      return novo;
    });
  }, []);

  const selecionaveis = linhas.filter(
    (l) => (l.statusProcessamento === "pendente" || l.statusProcessamento === "erro") && l.statusVideo !== "inacessivel"
  );

  const selecionarTodos = useCallback(() => {
    setSelecionados(new Set(selecionaveis.map((l) => l.indiceLinha)));
  }, [selecionaveis]);

  const limparSelecao = useCallback(() => { setSelecionados(new Set()); }, []);

  // ─── Subir anúncio ─────────────────────────────────────────
  const subirAnuncio = useCallback(async (linha: LinhaComStatus) => {
    setProcessando(true);

    setLinhas((prev) =>
      prev.map((l) =>
        l.indiceLinha === linha.indiceLinha
          ? { ...l, statusProcessamento: "processando" as const }
          : l
      )
    );

    try {
      const payload = linha.adId
        ? { adId: linha.adId }
        : {
            indiceLinha: linha.indiceLinha,
            aba: abaLegada,
            adSetId: linha.adSetId,
            adName: linha.adName,
            textoPrincipal: linha.textoPrincipal,
            titulo: linha.titulo,
            descricao: linha.descricao,
            cta: linha.cta,
            linkAnuncio: linha.linkAnuncio,
            linkVideo: linha.linkVideo,
            pageId: linha.pageId,
            tipo: linha.tipo,
            tipoPlanilha: linha.tipoPlanilha,
            imageAssets: linha.imageAssets,
          };

      const res = await fetch("/api/meta/criar-anuncio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Erro ao criar anúncio");

      setLinhas((prev) =>
        prev.map((l) =>
          l.indiceLinha === linha.indiceLinha
            ? { ...l, statusProcessamento: "concluido" as const, adIdCriado: json.adId, accountId: json.accountId || "" }
            : l
        )
      );
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Erro desconhecido";
      setLinhas((prev) =>
        prev.map((l) =>
          l.indiceLinha === linha.indiceLinha
            ? { ...l, statusProcessamento: "erro" as const, mensagemErro: mensagem }
            : l
        )
      );
    } finally {
      setProcessando(false);
    }
  }, [abaLegada]);

  const subirSelecionados = useCallback(async () => {
    const podeSubir = (l: LinhaComStatus) =>
      (l.statusProcessamento === "pendente" || l.statusProcessamento === "erro") && l.statusVideo !== "inacessivel";

    const alvo = selecionados.size > 0
      ? linhas.filter((l) => selecionados.has(l.indiceLinha) && podeSubir(l))
      : linhas.filter(podeSubir);

    for (const linha of alvo) await subirAnuncio(linha);
    setSelecionados(new Set());
  }, [linhas, selecionados, subirAnuncio]);

  // ─── Importar da planilha ──────────────────────────────────
  const importarDaPlanilha = useCallback(async () => {
    if (!brandSelecionado) return;
    setImportando(true);
    try {
      const abaMap: Record<string, ChaveAba> = {};
      for (const b of brands) {
        if (b.name.toLowerCase().includes("evino")) abaMap[b.id] = "evino";
        else if (b.name.toLowerCase().includes("grandcru")) abaMap[b.id] = "grandcru";
      }
      const aba = abaMap[brandSelecionado.id] ?? "evino";

      const res = await fetch("/api/import/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aba }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Erro ao importar");

      alert(`Importação: ${json.data.importados} importados, ${json.data.ignorados} ignorados`);
      await carregarDados();
    } catch (e) {
      alert(`Erro: ${e instanceof Error ? e.message : "Erro desconhecido"}`);
    } finally {
      setImportando(false);
    }
  }, [brandSelecionado, brands, carregarDados]);

  // ─── Contadores ────────────────────────────────────────────
  const totalPendentes = linhas.filter((l) => l.statusProcessamento === "pendente").length;
  const totalConcluidos = linhas.filter((l) => l.statusProcessamento === "concluido").length;
  const totalErros = linhas.filter((l) => l.statusProcessamento === "erro").length;
  const totalVideosBloqueados = linhas.filter((l) => l.statusVideo === "inacessivel" && l.statusProcessamento === "pendente").length;
  const totalDisponiveis = totalPendentes - totalVideosBloqueados;
  const totalProcessando = linhas.filter((l) => l.statusProcessamento === "processando").length;
  const total = linhas.length;

  // ─── Filtros ───────────────────────────────────────────────
  const datasUnicas = Array.from(new Set(linhas.map((l) => l.data).filter(Boolean))).sort((a, b) => {
    const parseData = (s: string) => { const p = s.split("/"); return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime() : new Date(s).getTime(); };
    return parseData(b) - parseData(a);
  });
  const campanhasUnicas = Array.from(new Set(linhas.map((l) => l.campaign).filter(Boolean))).sort();
  const adSetsUnicos = Array.from(new Set(linhas.filter((l) => filtroCampanha === "todas" || l.campaign === filtroCampanha).map((l) => l.adSet).filter(Boolean))).sort();

  const buscaLower = busca.toLowerCase();
  const linhasFiltradas = linhas.filter((l) => {
    if (filtroStatus !== "todos" && l.statusProcessamento !== filtroStatus) return false;
    if (filtroData !== "todas" && l.data !== filtroData) return false;
    if (filtroCampanha !== "todas" && l.campaign !== filtroCampanha) return false;
    if (filtroAdSet !== "todos" && l.adSet !== filtroAdSet) return false;
    if (buscaLower && !(l.adName.toLowerCase().includes(buscaLower) || l.textoPrincipal.toLowerCase().includes(buscaLower) || l.campaign.toLowerCase().includes(buscaLower))) return false;
    return true;
  });

  const resetFiltros = () => {
    setLinhas([]); setJaCarregou(false); setSelecionados(new Set()); setErro(null);
    setFiltroStatus("todos"); setFiltroData("todas"); setFiltroCampanha("todas"); setFiltroAdSet("todos"); setBusca("");
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Criação de Anúncios</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Gerencie e suba anúncios para o Meta Ads.
            {fonteDados === "supabase" ? " Dados salvos no banco." : " Dados da planilha Google Sheets."}
          </p>
          <div className="mt-3 flex items-center gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
            {fonteDados === "supabase" ? (
              brands.map((b) => (
                <button key={b.id} onClick={() => { if (b.id !== brandSelecionado?.id) { setBrandSelecionado(b); resetFiltros(); } }}
                  disabled={carregando || processando}
                  className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all disabled:opacity-50 ${brandSelecionado?.id === b.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {b.name}
                </button>
              ))
            ) : (
              (["evino", "grandcru"] as ChaveAba[]).map((chave) => (
                <button key={chave} onClick={() => { if (chave !== abaLegada) { setAbaLegada(chave); resetFiltros(); } }}
                  disabled={carregando || processando}
                  className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all disabled:opacity-50 ${abaLegada === chave ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {chave === "evino" ? "Evino" : "GrandCru"}
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {fonteDados === "supabase" && (
            <button onClick={() => setDialogCriar(true)}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Novo Anúncio
            </button>
          )}
          <a href={`https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_GOOGLE_SHEETS_ID}/edit`} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.385 2H4.615A2.615 2.615 0 0 0 2 4.615v14.77A2.615 2.615 0 0 0 4.615 22h14.77A2.615 2.615 0 0 0 22 19.385V4.615A2.615 2.615 0 0 0 19.385 2zM7 18V6h4v12H7zm6 0V6h4v12h-4z" /></svg>
            Planilha
          </a>
        </div>
      </div>

      {/* Barra de ações */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={carregarDados} disabled={carregando}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-5 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50">
            {carregando ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />Carregando...</>) : jaCarregou ? "Recarregar" : "Carregar"}
          </button>

          {fonteDados === "supabase" && (
            <button onClick={importarDaPlanilha} disabled={importando || carregando}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-5 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50">
              {importando ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />Importando...</>) : (<><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>Importar da Planilha</>)}
            </button>
          )}

          {jaCarregou && totalDisponiveis > 0 && (
            <button onClick={subirSelecionados} disabled={processando}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50">
              {processando ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />Processando...</>) : selecionados.size > 0 ? `Subir Selecionados (${selecionados.size})` : `Subir Todos (${totalDisponiveis})`}
            </button>
          )}

          {jaCarregou && selecionaveis.length > 0 && (
            <>
              <button onClick={selecionados.size === selecionaveis.length ? limparSelecao : selecionarTodos}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]">
                {selecionados.size === selecionaveis.length ? "Desmarcar Todos" : "Selecionar Todos"}
              </button>
              {selecionados.size > 0 && (
                <button onClick={limparSelecao} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-all hover:text-foreground">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  Limpar
                </button>
              )}
            </>
          )}
        </div>

        {jaCarregou && total > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{total} anúncio{total !== 1 ? "s" : ""}</span>
            {selecionados.size > 0 && <span className="flex items-center gap-1.5 text-primary"><span className="h-2 w-2 rounded-full bg-primary" />{selecionados.size} selecionado{selecionados.size !== 1 ? "s" : ""}</span>}
            {totalConcluidos > 0 && <span className="flex items-center gap-1.5 text-green-600"><span className="h-2 w-2 rounded-full bg-green-500" />{totalConcluidos} concluído{totalConcluidos !== 1 ? "s" : ""}</span>}
            {totalErros > 0 && <span className="flex items-center gap-1.5 text-destructive"><span className="h-2 w-2 rounded-full bg-destructive" />{totalErros} erro{totalErros !== 1 ? "s" : ""}</span>}
            {totalVideosBloqueados > 0 && <span className="flex items-center gap-1.5 text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />{totalVideosBloqueados} sem acesso</span>}
          </div>
        )}
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Erro ao carregar dados</p>
          <p className="mt-1 text-destructive/80">{erro}</p>
        </div>
      )}

      {jaCarregou ? (
        <section>
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
              {[
                { valor: "todos", rotulo: "Todos", contagem: total },
                { valor: "pendente", rotulo: "Pendentes", contagem: totalPendentes },
                { valor: "processando", rotulo: "Processando", contagem: totalProcessando },
                { valor: "concluido", rotulo: "Concluídos", contagem: totalConcluidos },
                { valor: "erro", rotulo: "Erros", contagem: totalErros },
              ].filter((f) => f.valor === "todos" || f.contagem > 0).map((f) => (
                <button key={f.valor} onClick={() => setFiltroStatus(f.valor)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${filtroStatus === f.valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {f.rotulo} <span className={`tabular-nums text-xs ${filtroStatus === f.valor ? "text-foreground/60" : "text-muted-foreground/60"}`}>{f.contagem}</span>
                </button>
              ))}
            </div>

            {campanhasUnicas.length > 1 && (
              <select value={filtroCampanha} onChange={(e) => { setFiltroCampanha(e.target.value); setFiltroAdSet("todos"); }}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <option value="todas">Todas as campanhas</option>
                {campanhasUnicas.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {adSetsUnicos.length > 1 && (
              <select value={filtroAdSet} onChange={(e) => setFiltroAdSet(e.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <option value="todos">Todos os ad sets</option>
                {adSetsUnicos.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            )}

            {datasUnicas.length > 1 && (
              <select value={filtroData} onChange={(e) => setFiltroData(e.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <option value="todas">Todas as datas</option>
                {datasUnicas.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}

            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar anúncio..."
                className="h-9 w-56 rounded-lg border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" />
            </div>

            <button onClick={() => setCompacto((v) => !v)}
              className={`ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98] ${compacto ? "ring-1 ring-primary/30 border-primary/40" : ""}`}>
              {compacto ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>
              )}
              {compacto ? "Detalhado" : "Compacto"}
            </button>
          </div>
          <TabelaPendentes linhas={linhasFiltradas} carregando={carregando} aoSubir={subirAnuncio} processando={processando}
            aoRevalidarVideo={revalidarVideo} serviceAccountEmail={serviceAccountEmail} selecionados={selecionados} aoAlternarSelecao={alternarSelecao} compacto={compacto} />
        </section>
      ) : !erro ? (
        <Card className="border-dashed">
          <CardContent className="flex h-44 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-muted p-3">
              <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
              </svg>
            </div>
            <p className="text-sm font-medium">Pronto para começar</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Carregando anúncios...</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Dialog: Criar Novo Anúncio */}
      <DialogCriarAnuncio aberto={dialogCriar} aoFechar={() => setDialogCriar(false)} brandId={brandSelecionado?.id ?? ""} aoSalvar={carregarDados} />
    </div>
  );
}

// ─── Dialog de criação ───────────────────────────────────────

function DialogCriarAnuncio({ aberto, aoFechar, brandId, aoSalvar }: { aberto: boolean; aoFechar: () => void; brandId: string; aoSalvar: () => void }) {
  const [tipo, setTipo] = useState<"video" | "image">("video");
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ campaign_name: "", campaign_id: "", ad_set_name: "", ad_set_id: "", ad_name: "", texto_principal: "", titulo: "", descricao: "", cta: "SHOP_NOW", link_campanha: "", link_aux: "", videoUrl: "", imageFeed: "", imageStories: "", imageHorizontal: "" });

  const set = (campo: string, valor: string) => setForm((p) => ({ ...p, [campo]: valor }));

  const salvar = async () => {
    if (!form.campaign_name || !form.ad_set_name || !form.ad_name) { alert("Preencha: Campanha, Ad Set e Nome"); return; }
    setSalvando(true);
    try {
      const assets: { placement: string; asset_url: string; asset_type: "image" | "video" }[] = [];
      if (tipo === "video") {
        if (!form.videoUrl) { alert("Informe a URL do vídeo"); setSalvando(false); return; }
        assets.push({ placement: "video_principal", asset_url: form.videoUrl, asset_type: "video" });
      } else {
        if (form.imageFeed) assets.push({ placement: "feed", asset_url: form.imageFeed, asset_type: "image" });
        if (form.imageStories) assets.push({ placement: "stories", asset_url: form.imageStories, asset_type: "image" });
        if (form.imageHorizontal) assets.push({ placement: "horizontal", asset_url: form.imageHorizontal, asset_type: "image" });
        if (assets.length === 0) { alert("Informe pelo menos 1 URL de imagem"); setSalvando(false); return; }
      }
      const res = await fetch("/api/ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, type: tipo, ...form, assets }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro);
      aoFechar(); aoSalvar();
      setForm({ campaign_name: "", campaign_id: "", ad_set_name: "", ad_set_id: "", ad_name: "", texto_principal: "", titulo: "", descricao: "", cta: "SHOP_NOW", link_campanha: "", link_aux: "", videoUrl: "", imageFeed: "", imageStories: "", imageHorizontal: "" });
    } catch (e) { alert(e instanceof Error ? e.message : "Erro"); } finally { setSalvando(false); }
  };

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo Anúncio</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-5 pt-2">
          <div>
            <label className="text-sm font-medium">Tipo</label>
            <div className="mt-1.5 flex items-center gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
              <button onClick={() => setTipo("video")} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${tipo === "video" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Vídeo</button>
              <button onClick={() => setTipo("image")} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${tipo === "image" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Imagem</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Campanha *" valor={form.campaign_name} aoMudar={(v) => set("campaign_name", v)} />
            <Campo rotulo="Campaign ID" valor={form.campaign_id} aoMudar={(v) => set("campaign_id", v)} placeholder="Opcional" />
            <Campo rotulo="Ad Set *" valor={form.ad_set_name} aoMudar={(v) => set("ad_set_name", v)} />
            <Campo rotulo="Ad Set ID" valor={form.ad_set_id} aoMudar={(v) => set("ad_set_id", v)} placeholder="Opcional" />
          </div>
          <Campo rotulo="Nome do Anúncio *" valor={form.ad_name} aoMudar={(v) => set("ad_name", v)} />
          <div className="col-span-2">
            <label className="text-sm font-medium">Texto Principal</label>
            <textarea value={form.texto_principal} onChange={(e) => set("texto_principal", e.target.value)} rows={3}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Título" valor={form.titulo} aoMudar={(v) => set("titulo", v)} />
            <Campo rotulo="Descrição" valor={form.descricao} aoMudar={(v) => set("descricao", v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">CTA</label>
              <select value={form.cta} onChange={(e) => set("cta", e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <option value="SHOP_NOW">Shop Now</option><option value="LEARN_MORE">Learn More</option><option value="SIGN_UP">Sign Up</option><option value="SUBSCRIBE">Subscribe</option>
              </select>
            </div>
            <Campo rotulo="Link Aux (referência)" valor={form.link_aux} aoMudar={(v) => set("link_aux", v)} placeholder="Link interno" />
          </div>
          <Campo rotulo="Link da Campanha" valor={form.link_campanha} aoMudar={(v) => set("link_campanha", v)} placeholder="https://..." />
          {form.link_campanha && form.campaign_name && form.ad_name && (
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Link UTM (auto-gerado)</p>
              <p className="text-xs text-muted-foreground break-all font-mono">{form.link_campanha}?utm_source=Facebook&utm_medium=Ads&utm_campaign={encodeURIComponent(form.campaign_name)}&utm_content={encodeURIComponent(form.ad_name)}&openShop=true</p>
            </div>
          )}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3">{tipo === "video" ? "Vídeo" : "Imagens por Placement"}</h4>
            {tipo === "video" ? (
              <Campo rotulo="URL do Vídeo (Google Drive)" valor={form.videoUrl} aoMudar={(v) => set("videoUrl", v)} placeholder="https://drive.google.com/file/d/..." />
            ) : (
              <div className="flex flex-col gap-3">
                <Campo rotulo="Imagem Feed (1080x1080)" valor={form.imageFeed} aoMudar={(v) => set("imageFeed", v)} placeholder="URL pública (Cloudinary)" />
                <Campo rotulo="Imagem Stories (1080x1920)" valor={form.imageStories} aoMudar={(v) => set("imageStories", v)} placeholder="URL pública (Cloudinary)" />
                <Campo rotulo="Imagem Horizontal (1200x628)" valor={form.imageHorizontal} aoMudar={(v) => set("imageHorizontal", v)} placeholder="URL pública (Cloudinary)" />
                {(form.imageFeed || form.imageStories || form.imageHorizontal) && (
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {[{ url: form.imageFeed, label: rotuloPlacementImagem("feed") }, { url: form.imageStories, label: rotuloPlacementImagem("stories") }, { url: form.imageHorizontal, label: rotuloPlacementImagem("horizontal") }].map(({ url, label }) => (
                      <div key={label} className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                        {url ? <div className="aspect-square rounded-md border overflow-hidden bg-muted"><img src={url} alt={label} className="w-full h-full object-cover" /></div>
                          : <div className="aspect-square rounded-md border border-dashed flex items-center justify-center text-xs text-muted-foreground">Sem imagem</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 border-t pt-4">
            <button onClick={aoFechar} className="inline-flex h-10 items-center rounded-lg border border-input bg-background px-5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">Cancelar</button>
            <button onClick={salvar} disabled={salvando} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50">
              {salvando ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />Salvando...</>) : "Salvar Anúncio"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ rotulo, valor, aoMudar, placeholder }: { rotulo: string; valor: string; aoMudar: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-sm font-medium">{rotulo}</label>
      <input type="text" value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder={placeholder}
        className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" />
    </div>
  );
}
