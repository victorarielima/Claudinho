"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  TabelaPendentes,
  type LinhaComStatus,
} from "@/components/tabela-pendentes";
import { DialogCriarAnuncio } from "@/components/dialog-criar-anuncio";
import { DialogExploradorVideos } from "@/components/dialog-explorador-videos";
import { FormularioLoteVideos } from "@/components/formulario-lote-videos";
import { DialogEditarAnuncio } from "@/components/dialog-editar-anuncio";
import { DialogDetalhesAnuncio } from "@/components/dialog-detalhes-anuncio";
import { DialogExploradorClickUp } from "@/components/dialog-explorador-clickup";
import { FormularioLoteImagens } from "@/components/formulario-lote-imagens";
import { useBrand } from "@/components/brand-provider";
import type { Ad, AdAsset, Brand } from "@/lib/db";
import type { VideoDrive } from "@/lib/drive-explorer";
import type { ClickUpTask } from "@/lib/clickup";
import type { LinhaAnuncio, ChaveAba, DiagnosticoPlanilha } from "@/lib/sheets";
import {
  detectarTipoCriativo,
  extrairImageAssets,
  normalizarPlacementImagem,
} from "@/lib/ad-media";
import { analisarProntidaoAnuncio } from "@/lib/ad-readiness";

const SHEETS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SHEETS === "true";
const STALE_PROCESSING_MS = 5 * 60 * 1000; // 5 minutos

type FonteDados = "supabase" | "sheets";

type FeedbackPainel = {
  tipo: "sucesso" | "erro" | "aviso" | "info";
  titulo: string;
  descricao?: string;
} | null;

const ROTULOS_COLUNA_PLANILHA: Record<string, string> = {
  campaign: "Campanha",
  adSet: "Ad Set",
  adSetId: "Ad Set ID",
  tipoPlanilha: "Tipo",
  adName: "Ad Name",
  linkVideo: "Link Vídeo (Drive)",
  statusAutomacao: "Status",
};

function formatarColunaPlanilha(campo: string): string {
  return ROTULOS_COLUNA_PLANILHA[campo] ?? campo;
}

function enriquecerLinha(linha: LinhaComStatus): LinhaComStatus {
  const diagnostico = analisarProntidaoAnuncio({
    tipo: linha.tipo ?? "video",
    adSetId: linha.adSetId,
    adName: linha.adName,
    linkVideo: linha.linkVideo,
    linkAnuncio: linha.linkAnuncio,
    imageAssets: linha.imageAssets,
    texto_principal: linha.textoPrincipal,
    titulo: linha.titulo,
    descricao: linha.descricao,
    cta: linha.cta,
  });

  return {
    ...linha,
    imageAssets:
      linha.tipo === "image" && diagnostico.imageAssetsNormalizados.length > 0
        ? diagnostico.imageAssetsNormalizados
        : linha.imageAssets,
    prontoMeta: diagnostico.prontoParaSubir,
    bloqueiosMeta: diagnostico.bloqueios.map((item) => item.mensagem),
    avisosMeta: diagnostico.avisos.map((item) => item.mensagem),
  };
}

export function PainelCriacao() {
  const {
    brands: brandsCtx,
    selectedBrand: brandCtx,
    setSelectedBrand: setBrandCtx,
    loading: brandLoading,
    error: brandError,
    reloadBrands,
  } = useBrand();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandSelecionado, setBrandSelecionado] = useState<Brand | null>(null);
  const [fonteDados, setFonteDados] = useState<FonteDados>("supabase");

  // QW-1: Confirmation dialog before bulk upload
  const [confirmUpload, setConfirmUpload] = useState<{show: boolean, linhas: LinhaComStatus[]}>({show: false, linhas: []});
  // QW-2: Per-ad progress counter during batch upload
  const [progressoUpload, setProgressoUpload] = useState<{atual: number, total: number} | null>(null);
  // QW-12: AlertDialog for delete confirmation
  const [confirmExcluir, setConfirmExcluir] = useState<{show: boolean, linha: LinhaComStatus | null}>({show: false, linha: null});
  // Confirmation for deleting ad from Meta
  const [confirmExcluirMeta, setConfirmExcluirMeta] = useState<{show: boolean, linha: LinhaComStatus | null}>({show: false, linha: null});

  const [linhas, setLinhas] = useState<LinhaComStatus[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackPainel>(null);
  const [jaCarregou, setJaCarregou] = useState(false);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string>("");
  const [diagnosticoPlanilha, setDiagnosticoPlanilha] = useState<DiagnosticoPlanilha | null>(null);

  const [sincronizando, setSincronizando] = useState(false);

  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroData, setFiltroData] = useState<"30d" | "todos">("30d");
  const [filtroCampanha, setFiltroCampanha] = useState<string>("todas");
  const [filtroAdSet, setFiltroAdSet] = useState<string>("todos");
  const [busca, setBusca] = useState<string>("");
  const [compacto, setCompacto] = useState(true);
  const [destaqueIndice, setDestaqueIndice] = useState<number | null>(null);

  // Sync view mode with URL hash for browser back/forward
  useEffect(() => {
    function handlePopState() {
      const hash = window.location.hash;
      if (hash === "#detalhado") {
        setCompacto(false);
      } else {
        setCompacto(true);
        setDestaqueIndice(null);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const mudarParaDetalhado = useCallback((indiceLinha?: number) => {
    window.history.pushState(null, "", "#detalhado");
    setCompacto(false);
    setDestaqueIndice(indiceLinha ?? null);
  }, []);

  const mudarParaCompacto = useCallback(() => {
    if (window.location.hash === "#detalhado") {
      window.history.back();
    } else {
      setCompacto(true);
      setDestaqueIndice(null);
    }
  }, []);

  const [dialogCriar, setDialogCriar] = useState(false);
  const [dialogExplorador, setDialogExplorador] = useState(false);
  const [dialogLote, setDialogLote] = useState(false);
  const [videosSelecionados, setVideosSelecionados] = useState<VideoDrive[]>([]);
  const [dialogEditar, setDialogEditar] = useState(false);
  const [dialogEditarRecriar, setDialogEditarRecriar] = useState(false);
  const [dialogDetalhes, setDialogDetalhes] = useState(false);
  const [linhaDetalhes, setLinhaDetalhes] = useState<LinhaComStatus | null>(null);
  const [editarAdId, setEditarAdId] = useState<string | null>(null);
  const [editarDados, setEditarDados] = useState<{
    ad_name: string; texto_principal: string; titulo: string; descricao: string;
    cta: string; campaign_name: string; campaign_id: string;
    ad_set_name: string; ad_set_id: string; link_anuncio: string;
    tipo?: "video" | "image"; linkVideo?: string; thumbnailLink?: string;
    imageAssets?: { placement: string; url: string }[];
    bloqueiosMeta?: string[]; avisosMeta?: string[];
    brand_id?: string; meta_account_id?: string;
    metaEffectiveStatus?: string | null;
  } | null>(null);
  const [dialogClickUp, setDialogClickUp] = useState(false);
  const [dialogLoteImagens, setDialogLoteImagens] = useState(false);
  const [cardsClickUp, setCardsClickUp] = useState<ClickUpTask[]>([]);
  const [importando, setImportando] = useState(false);
  const [abaLegada, setAbaLegada] = useState<ChaveAba>("evino");

  // ─── Sincronizar brands do contexto ─────────────────────────
  useEffect(() => {
    if (brandLoading) return;
    if (brandsCtx.length > 0) {
      setBrands(brandsCtx as Brand[]);
      setBrandSelecionado(brandCtx as Brand | null);
      setFonteDados("supabase");
    } else if (SHEETS_ENABLED) {
      setFonteDados("sheets");
    }
  }, [brandLoading, brandsCtx, brandCtx]);

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
      accountId: (ad.meta_account_id ?? "").replace("act_", ""),
      data: new Date(ad.created_at).toLocaleDateString("pt-BR"),
      statusProcessamento: ad.status === "concluido" ? "concluido"
        : ad.status === "processando" && (Date.now() - new Date(ad.updated_at).getTime() > STALE_PROCESSING_MS)
          ? "erro"
        : ad.status === "processando" ? "processando"
        : ad.status === "erro" ? "erro"
        : "pendente",
      adIdCriado: ad.meta_ad_id ?? undefined,
      mensagemErro: ad.status === "processando" && (Date.now() - new Date(ad.updated_at).getTime() > STALE_PROCESSING_MS)
        ? "Processamento travou. Tente novamente."
        : ad.error_message ?? undefined,
      statusVideo: videoAsset ? "nao_verificado" : "acessivel",
      adId: ad.id,
      tipo: ad.type as "video" | "image",
      imageAssets: imageAssets.map((a: AdAsset) => ({
        placement: normalizarPlacementImagem(a.placement, a.asset_url),
        url: a.asset_url,
      })),
      linkCampanha: ad.link_campanha ?? "",
      linkAux: ad.link_aux ?? "",
      metaEffectiveStatus: ad.meta_effective_status ?? null,
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
        const novasLinhas = ads.map(adParaLinha).map(enriquecerLinha);
        setLinhas(novasLinhas);
        setDiagnosticoPlanilha(null);
        setJaCarregou(true);

        const paraValidar = novasLinhas.filter(
          (l) => l.tipo === "video" && l.statusProcessamento !== "concluido" && l.linkVideo
        );
        if (paraValidar.length > 0) await validarVideos(paraValidar);
      } else if (SHEETS_ENABLED) {
        const res = await fetch(`/api/sheets/pendentes?aba=${abaLegada}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.erro ?? "Erro ao carregar planilha");

        const todas: LinhaAnuncio[] = json.data;
        setDiagnosticoPlanilha(json.meta?.diagnosticoPlanilha ?? null);
        const novasLinhas: LinhaComStatus[] = todas.map((l) => {
          const tipo = detectarTipoCriativo(l.tipoPlanilha, l.linkVideo);
          const imageAssets = tipo === "image" ? extrairImageAssets(l.linkVideo) : [];
          return enriquecerLinha({
            ...l,
            statusProcessamento: l.statusAutomacao === "Concluído" ? "concluido" as const
              : l.statusAutomacao === "Processando" ? "processando" as const
              : l.statusAutomacao.startsWith("Erro") ? "erro" as const
              : "pendente" as const,
            adIdCriado: l.statusAutomacao === "Concluído" ? l.adIdGerado : undefined,
            accountId: (l.accountId || "").replace("act_", ""),
            mensagemErro: l.statusAutomacao.startsWith("Erro") ? l.statusAutomacao.replace("Erro: ", "") : undefined,
            statusVideo: tipo === "image" ? "acessivel" as const : "nao_verificado" as const,
            tipo,
            imageAssets,
          });
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
    if ((fonteDados === "supabase" && brandSelecionado) || (fonteDados === "sheets" && SHEETS_ENABLED)) {
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
    (l) => (l.statusProcessamento === "pendente" || l.statusProcessamento === "erro") && l.prontoMeta
  );

  const selecionarTodos = useCallback(() => {
    setSelecionados(new Set(selecionaveis.map((l) => l.indiceLinha)));
  }, [selecionaveis]);

  const limparSelecao = useCallback(() => { setSelecionados(new Set()); }, []);

  // ─── Subir anúncio ─────────────────────────────────────────
  const subirAnuncio = useCallback(async (linha: LinhaComStatus) => {
    if (!linha.prontoMeta) {
      setFeedback({
        tipo: "aviso",
        titulo: "Anúncio com pendências",
        descricao: linha.bloqueiosMeta?.join(" ") ?? "Revise os bloqueios antes de subir.",
      });
      return;
    }

    setProcessando(true);

    const atualizarLinha = (update: Partial<LinhaComStatus>) =>
      setLinhas((prev) =>
        prev.map((l) =>
          l.indiceLinha === linha.indiceLinha ? { ...l, ...update } : l
        )
      );

    atualizarLinha({ statusProcessamento: "processando" });

    try {
      // --- Fluxo legado (planilha): síncrono, sem polling ---
      if (!linha.adId) {
        const payload = {
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

        atualizarLinha({
          statusProcessamento: "concluido",
          adIdCriado: json.adId,
          accountId: json.accountId || "",
        });
        return;
      }

      // --- Fluxo novo (Supabase): iniciar + polling ---
      const resInicio = await fetch("/api/meta/criar-anuncio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId: linha.adId }),
      });
      const jsonInicio = await resInicio.json();
      if (!resInicio.ok) throw new Error(jsonInicio.erro ?? "Erro ao iniciar upload");

      // Se o fluxo legado retornou sucesso direto (não deveria, mas por segurança)
      if (jsonInicio.sucesso || jsonInicio.status === "concluido") {
        atualizarLinha({
          statusProcessamento: "concluido",
          adIdCriado: jsonInicio.adId ?? jsonInicio.meta_ad_id,
          accountId: jsonInicio.accountId || "",
        });
        return;
      }

      // Polling do /api/meta/processar até completar ou falhar
      const MAX_POLLS = 60; // ~5 minutos com intervalo de 5s
      const POLL_INTERVAL_MS = 5_000;

      for (let poll = 0; poll < MAX_POLLS; poll++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const resPoll = await fetch("/api/meta/processar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adId: linha.adId }),
        });
        const jsonPoll = await resPoll.json();

        if (jsonPoll.step === "completed" || jsonPoll.status === "concluido") {
          atualizarLinha({
            statusProcessamento: "concluido",
            adIdCriado: jsonPoll.meta_ad_id ?? jsonPoll.adId,
            accountId: jsonPoll.accountId || "",
          });
          return;
        }

        if (jsonPoll.step === "error" || jsonPoll.status === "erro") {
          throw new Error(jsonPoll.message ?? jsonPoll.erro ?? "Erro ao processar anúncio na Meta");
        }

        // Still processing — update progress hint in UI
        if (jsonPoll.progress) {
          atualizarLinha({
            statusProcessamento: "processando",
            mensagemErro: `Processando: ${jsonPoll.progress}`,
          });
        }
      }

      throw new Error("Timeout: o anúncio não foi processado em 5 minutos. Tente novamente.");
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Erro desconhecido";
      atualizarLinha({
        statusProcessamento: "erro",
        mensagemErro: mensagem,
      });
    } finally {
      setProcessando(false);
    }
  }, [abaLegada]);

  const sincronizarMeta = useCallback(async () => {
    setSincronizando(true);
    try {
      const res = await fetch("/api/meta/sync-status", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Erro ao sincronizar");

      if (json.alterados > 0) {
        // Recarregar dados para refletir mudanças
        await carregarDados();
        setFeedback({
          tipo: "info",
          titulo: "Sync concluído",
          descricao: `${json.sincronizados} anúncio${json.sincronizados !== 1 ? "s" : ""} verificado${json.sincronizados !== 1 ? "s" : ""}, ${json.alterados} atualizado${json.alterados !== 1 ? "s" : ""}.`,
        });
      } else {
        setFeedback({
          tipo: "sucesso",
          titulo: "Tudo sincronizado",
          descricao: `${json.sincronizados} anúncio${json.sincronizados !== 1 ? "s" : ""} verificado${json.sincronizados !== 1 ? "s" : ""}, nenhuma alteração.`,
        });
      }
    } catch (e) {
      setFeedback({
        tipo: "erro",
        titulo: "Erro ao sincronizar com Meta",
        descricao: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setSincronizando(false);
    }
  }, [carregarDados]);

  // QW-1: Collect target lines and show confirmation dialog
  const pedirConfirmacaoUpload = useCallback(() => {
    const podeSubir = (l: LinhaComStatus) =>
      (l.statusProcessamento === "pendente" || l.statusProcessamento === "erro") && l.prontoMeta;

    const alvo = selecionados.size > 0
      ? linhas.filter((l) => selecionados.has(l.indiceLinha) && podeSubir(l))
      : linhas.filter(podeSubir);

    if (alvo.length === 0) return;
    setConfirmUpload({ show: true, linhas: alvo });
  }, [linhas, selecionados]);

  // QW-1 + QW-2: Execute bulk upload after confirmation
  const subirSelecionados = useCallback(async () => {
    const alvo = confirmUpload.linhas;
    setConfirmUpload({ show: false, linhas: [] });
    if (alvo.length === 0) return;

    setProgressoUpload({ atual: 0, total: alvo.length });
    let contador = 0;
    for (const linha of alvo) {
      contador += 1;
      setProgressoUpload({ atual: contador, total: alvo.length });
      await subirAnuncio(linha);
    }
    setProgressoUpload(null);
    setSelecionados(new Set());
  }, [confirmUpload.linhas, subirAnuncio]);

  // ─── Importar da planilha ──────────────────────────────────
  const importarDaPlanilha = useCallback(async () => {
    if (!brandSelecionado) return;
    setImportando(true);
    setFeedback(null);
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

      setDiagnosticoPlanilha(json.meta?.diagnosticoPlanilha ?? null);
      setFeedback({
        tipo: "sucesso",
        titulo: "Importação concluída",
        descricao: `${json.data.importados} importados, ${json.data.ignorados} ignorados.`,
      });
      await carregarDados();
    } catch (e) {
      setFeedback({
        tipo: "erro",
        titulo: "Falha ao importar da planilha",
        descricao: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setImportando(false);
    }
  }, [brandSelecionado, brands, carregarDados]);

  // ─── Contadores ────────────────────────────────────────────
  const totalPendentes = linhas.filter((l) => l.statusProcessamento === "pendente").length;
  const totalConcluidos = linhas.filter((l) => l.statusProcessamento === "concluido").length;
  const totalErros = linhas.filter((l) => l.statusProcessamento === "erro").length;
  const totalBloqueados = linhas.filter(
    (l) => (l.statusProcessamento === "pendente" || l.statusProcessamento === "erro") && !l.prontoMeta
  ).length;
  const totalVideosBloqueados = linhas.filter(
    (l) =>
      l.statusVideo === "inacessivel" &&
      (l.statusProcessamento === "pendente" || l.statusProcessamento === "erro")
  ).length;
  const totalDisponiveis = selecionaveis.length;
  const totalProcessando = linhas.filter((l) => l.statusProcessamento === "processando").length;
  const total = linhas.length;

  // ─── Filtros ───────────────────────────────────────────────
  // Aceita "dd/mm/yyyy" (pt-BR, vindo de toLocaleDateString) e ISO. Retorna
  // null se não conseguir parsear — nesses casos o filtro de período deixa
  // a linha passar (não esconde linha por causa de data ausente/quebrada).
  const parseDataBr = (s: string): number | null => {
    if (!s) return null;
    const p = s.split("/");
    const ms = p.length === 3
      ? new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime()
      : new Date(s).getTime();
    return Number.isNaN(ms) ? null : ms;
  };
  const limiteUltimos30Dias = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  const campanhasUnicas = Array.from(new Set(linhas.map((l) => l.campaign).filter(Boolean))).sort();
  const adSetsUnicos = Array.from(new Set(linhas.filter((l) => filtroCampanha === "todas" || l.campaign === filtroCampanha).map((l) => l.adSet).filter(Boolean))).sort();

  const buscaLower = busca.toLowerCase();
  const linhasFiltradas = linhas.filter((l) => {
    if (filtroStatus !== "todos" && l.statusProcessamento !== filtroStatus) return false;
    if (filtroData === "30d") {
      const t = parseDataBr(l.data);
      if (t !== null && t < limiteUltimos30Dias) return false;
    }
    if (filtroCampanha !== "todas" && l.campaign !== filtroCampanha) return false;
    if (filtroAdSet !== "todos" && l.adSet !== filtroAdSet) return false;
    if (buscaLower && !(l.adName.toLowerCase().includes(buscaLower) || l.textoPrincipal.toLowerCase().includes(buscaLower) || l.campaign.toLowerCase().includes(buscaLower))) return false;
    return true;
  });

  const resetFiltros = () => {
    setLinhas([]); setJaCarregou(false); setSelecionados(new Set()); setErro(null); setFeedback(null); setDiagnosticoPlanilha(null);
    setFiltroStatus("todos"); setFiltroData("30d"); setFiltroCampanha("todas"); setFiltroAdSet("todos"); setBusca("");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Criação de Anúncios</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Gerencie e suba anúncios para o Meta Ads.
            {fonteDados === "supabase" ? " Dados salvos no banco." : SHEETS_ENABLED ? " Dados da planilha Google Sheets." : ""}
          </p>
          <div className="mt-3 flex items-center gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
            {fonteDados === "supabase" ? (
              brands.map((b) => (
                <button key={b.id} onClick={() => { if (b.id !== brandSelecionado?.id) { setBrandSelecionado(b); setBrandCtx(b); resetFiltros(); } }}
                  disabled={carregando || processando}
                  className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all disabled:opacity-50 ${brandSelecionado?.id === b.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {b.name}
                </button>
              ))
            ) : SHEETS_ENABLED ? (
              (["evino", "grandcru"] as ChaveAba[]).map((chave) => (
                <button key={chave} onClick={() => { if (chave !== abaLegada) { setAbaLegada(chave); resetFiltros(); } }}
                  disabled={carregando || processando}
                  className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all disabled:opacity-50 ${abaLegada === chave ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {chave === "evino" ? "Evino" : "GrandCru"}
                </button>
              ))
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {fonteDados === "supabase" && (
            <>
              <button onClick={() => setDialogExplorador(true)}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                Importar Vídeos
              </button>
              <button onClick={() => setDialogClickUp(true)}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                </svg>
                Importar Estáticos
              </button>
              <button onClick={() => setDialogCriar(true)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]">
                Novo Criativo
              </button>
            </>
          )}
          {SHEETS_ENABLED && (
            <a href={`https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_GOOGLE_SHEETS_ID}/edit`} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.385 2H4.615A2.615 2.615 0 0 0 2 4.615v14.77A2.615 2.615 0 0 0 4.615 22h14.77A2.615 2.615 0 0 0 22 19.385V4.615A2.615 2.615 0 0 0 19.385 2zM7 18V6h4v12H7zm6 0V6h4v12h-4z" /></svg>
              Planilha
            </a>
          )}
        </div>
      </div>

      {/* Barra de ações */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={carregarDados} disabled={carregando}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-5 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50">
            {carregando ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />Carregando...</>) : jaCarregou ? "Recarregar" : "Carregar"}
          </button>

          {jaCarregou && fonteDados === "supabase" && totalConcluidos > 0 && (
            <button onClick={sincronizarMeta} disabled={sincronizando || processando}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-5 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50">
              {sincronizando ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />Sincronizando...</>) : (<><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>Sincronizar Meta</>)}
            </button>
          )}

          {fonteDados === "supabase" && SHEETS_ENABLED && (
            <button onClick={importarDaPlanilha} disabled={importando || carregando}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-5 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50">
              {importando ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />Importando...</>) : (<><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>Importar da Planilha</>)}
            </button>
          )}

          {jaCarregou && totalDisponiveis > 0 && (
            <button onClick={pedirConfirmacaoUpload} disabled={processando || progressoUpload !== null}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50">
              {progressoUpload ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />Subindo {progressoUpload.atual}/{progressoUpload.total}...</>) : processando ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />Processando...</>) : selecionados.size > 0 ? `Subir Selecionados (${selecionados.size})` : `Subir Todos (${totalDisponiveis})`}
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
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm">
            <span className="text-muted-foreground">{total} anúncio{total !== 1 ? "s" : ""}</span>
            {selecionados.size > 0 && <span className="flex items-center gap-1.5 text-primary"><span className="h-2 w-2 rounded-full bg-primary" />{selecionados.size} selecionado{selecionados.size !== 1 ? "s" : ""}</span>}
            {totalDisponiveis > 0 && <span className="flex items-center gap-1.5 text-blue-700"><span className="h-2 w-2 rounded-full bg-blue-500" />{totalDisponiveis} pronto{totalDisponiveis !== 1 ? "s" : ""}</span>}
            {totalConcluidos > 0 && <span className="flex items-center gap-1.5 text-green-600"><span className="h-2 w-2 rounded-full bg-green-500" />{totalConcluidos} concluído{totalConcluidos !== 1 ? "s" : ""}</span>}
            {totalErros > 0 && <span className="flex items-center gap-1.5 text-destructive"><span className="h-2 w-2 rounded-full bg-destructive" />{totalErros} erro{totalErros !== 1 ? "s" : ""}</span>}
            {totalBloqueados > 0 && <span className="flex items-center gap-1.5 text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />{totalBloqueados} com bloqueio</span>}
            {totalVideosBloqueados > 0 && <span className="flex items-center gap-1.5 text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-600" />{totalVideosBloqueados} vídeo{totalVideosBloqueados !== 1 ? "s" : ""} sem acesso</span>}
          </div>
        )}
      </div>

      {feedback && (
        <BannerPainel
          tipo={feedback.tipo}
          titulo={feedback.titulo}
          descricao={feedback.descricao}
          aoFechar={() => setFeedback(null)}
        />
      )}

      {SHEETS_ENABLED && diagnosticoPlanilha && (
        <BannerPlanilha diagnostico={diagnosticoPlanilha} />
      )}

      {erro && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Erro ao carregar dados</p>
          <p className="mt-1 text-destructive/80">{erro}</p>
        </div>
      )}

      {!brandLoading && fonteDados === "supabase" && brands.length === 0 && brandError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                Falha ao carregar as marcas
              </p>
              <p className="text-sm text-muted-foreground">{brandError}</p>
              <p className="text-xs text-muted-foreground">
                Em produção, isso normalmente aponta para erro em
                <span className="mx-1 font-mono">/api/brands</span>
                ou nas variáveis do Supabase.
              </p>
            </div>
            <button
              onClick={() => void reloadBrands()}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
            >
              Tentar novamente
            </button>
          </CardContent>
        </Card>
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

            <select value={filtroData} onChange={(e) => setFiltroData(e.target.value as "30d" | "todos")}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <option value="30d">Últimos 30 dias</option>
              <option value="todos">Todos</option>
            </select>

            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar anúncio..."
                className="h-9 w-56 rounded-lg border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" />
            </div>

            <button onClick={() => compacto ? mudarParaDetalhado() : mudarParaCompacto()}
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
            aoExcluir={(linha) => {
              if (!linha.adId) return;
              setConfirmExcluir({ show: true, linha });
            }}
            aoExcluirMeta={(linha) => {
              if (!linha.adId) return;
              setConfirmExcluirMeta({ show: true, linha });
            }}
            aoVerDetalhes={(linha) => {
              setLinhaDetalhes(linha);
              setDialogDetalhes(true);
            }}
            aoDuplicar={async (linha) => {
              try {
                const assets = linha.tipo === "image"
                  ? (linha.imageAssets ?? []).map((a) => ({
                      placement: a.placement,
                      asset_url: a.url,
                      asset_type: "image" as const,
                    }))
                  : linha.linkVideo
                    ? [{ placement: "video_principal", asset_url: linha.linkVideo, asset_type: "video" as const }]
                    : [];

                const res = await fetch("/api/ads", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    brand_id: brandSelecionado?.id,
                    type: linha.tipo ?? "video",
                    campaign_name: linha.campaign || "(selecionar)",
                    campaign_id: "",
                    ad_set_name: linha.adSet || "(selecionar)",
                    ad_set_id: "",
                    ad_name: `${linha.adName} (cópia)`,
                    texto_principal: linha.textoPrincipal,
                    titulo: linha.titulo,
                    descricao: linha.descricao,
                    cta: linha.cta,
                    link_campanha: linha.linkCampanha,
                    assets,
                  }),
                });
                if (!res.ok) {
                  const json = await res.json();
                  throw new Error(json.erro ?? "Erro ao duplicar");
                }
                const { data: novoAd } = await res.json();
                setFeedback({ tipo: "sucesso", titulo: "Anúncio duplicado", descricao: "Selecione campanha e ad set antes de subir." });
                await carregarDados();
                // Abre editor no novo ad
                if (novoAd?.id) {
                  setEditarAdId(novoAd.id);
                  setEditarDados({
                    ad_name: `${linha.adName} (cópia)`,
                    texto_principal: linha.textoPrincipal ?? "",
                    titulo: linha.titulo ?? "",
                    descricao: linha.descricao ?? "",
                    cta: linha.cta ?? "SHOP_NOW",
                    campaign_name: "",
                    campaign_id: "",
                    ad_set_name: "",
                    ad_set_id: "",
                    link_anuncio: linha.linkAnuncio ?? linha.linkCampanha ?? "",
                    tipo: linha.tipo,
                    linkVideo: linha.linkVideo,
                    thumbnailLink: linha.thumbnailLink,
                    imageAssets: linha.imageAssets,
                    brand_id: brandSelecionado?.id,
                    meta_account_id: brandSelecionado?.meta_account_id,
                  });
                  setDialogEditar(true);
                }
              } catch (e) {
                setFeedback({ tipo: "erro", titulo: "Falha ao duplicar", descricao: e instanceof Error ? e.message : "Erro desconhecido" });
              }
            }}
            aoEditar={(linha) => {
              if (!linha.adId) return;
              const concluido = linha.statusProcessamento === "concluido";
              setEditarAdId(linha.adId);
              setEditarDados({
                ad_name: linha.adName ?? "",
                texto_principal: linha.textoPrincipal ?? "",
                titulo: linha.titulo ?? "",
                descricao: linha.descricao ?? "",
                cta: linha.cta ?? "SHOP_NOW",
                campaign_name: linha.campaign ?? "",
                campaign_id: linha.campaignId ?? "",
                ad_set_name: linha.adSet ?? "",
                ad_set_id: linha.adSetId ?? "",
                link_anuncio: linha.linkAnuncio ?? linha.linkCampanha ?? "",
                tipo: linha.tipo,
                linkVideo: linha.linkVideo,
                thumbnailLink: linha.thumbnailLink,
                imageAssets: linha.imageAssets,
                bloqueiosMeta: linha.bloqueiosMeta,
                avisosMeta: linha.avisosMeta,
                brand_id: brandSelecionado?.id,
                meta_account_id: brandSelecionado?.meta_account_id,
                metaEffectiveStatus: linha.metaEffectiveStatus,
              });
              setDialogEditarRecriar(concluido);
              setDialogEditar(true);
            }}
            aoRenomear={async (adId, novoNome) => {
              try {
                const res = await fetch(`/api/ads/${adId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ad_name: novoNome }),
                });
                if (!res.ok) throw new Error("Erro ao renomear");
                setLinhas((prev) =>
                  prev.map((l) => l.adId === adId ? { ...l, adName: novoNome } : l)
                );
              } catch {
                // silently fail — user can try again
              }
            }}
            aoEditarCampo={async (adId, campo, valor) => {
              try {
                const res = await fetch(`/api/ads/${adId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ [campo]: valor }),
                });
                if (!res.ok) throw new Error("Erro ao editar");
                setLinhas((prev) =>
                  prev.map((l) => l.adId === adId ? { ...l, [campo]: valor } : l)
                );
              } catch {
                // silently fail — user can try again
              }
            }}
            aoRevalidarVideo={revalidarVideo}
            serviceAccountEmail={serviceAccountEmail}
            selecionados={selecionados}
            aoAlternarSelecao={alternarSelecao}
            compacto={compacto}
            aoMostrarDetalhes={mudarParaDetalhado}
            destaqueIndice={destaqueIndice}
          />
        </section>
      ) : !erro && !(fonteDados === "supabase" && brands.length === 0 && brandError) ? (
        <Card className="border-dashed">
          <CardContent className="flex h-44 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-muted p-3">
              <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
              </svg>
            </div>
            <p className="text-sm font-medium">Pronto para começar</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {brandLoading ? "Carregando marcas..." : "Carregando anúncios..."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Dialog: Criar Novo Anúncio */}
      <DialogCriarAnuncio
        aberto={dialogCriar}
        aoFechar={() => setDialogCriar(false)}
        brandId={brandSelecionado?.id ?? ""}
        brandNome={brandSelecionado?.name}
        metaAccountId={brandSelecionado?.meta_account_id}
        aoSalvar={carregarDados}
        aoNotificar={setFeedback}
      />

      {/* Dialog: Explorador de Vídeos (Nova Semente) */}
      <DialogExploradorVideos
        aberto={dialogExplorador}
        aoFechar={() => setDialogExplorador(false)}
        aoConfirmar={(videos: VideoDrive[]) => {
          setDialogExplorador(false);
          setVideosSelecionados(videos);
          setDialogLote(true);
        }}
      />

      {/* Dialog: Formulário de Lote */}
      <FormularioLoteVideos
        aberto={dialogLote}
        aoFechar={() => setDialogLote(false)}
        videos={videosSelecionados}
        aoSalvar={carregarDados}
      />

      {/* Dialog: Explorador ClickUp (Estáticos) */}
      <DialogExploradorClickUp
        aberto={dialogClickUp}
        aoFechar={() => setDialogClickUp(false)}
        aoConfirmar={(cards: ClickUpTask[]) => {
          setDialogClickUp(false);
          setCardsClickUp(cards);
          setDialogLoteImagens(true);
        }}
      />

      {/* Dialog: Formulário de Lote Imagens */}
      <FormularioLoteImagens
        aberto={dialogLoteImagens}
        aoFechar={() => setDialogLoteImagens(false)}
        cards={cardsClickUp}
        aoSalvar={carregarDados}
      />

      <DialogEditarAnuncio
        aberto={dialogEditar}
        aoFechar={() => {
          setDialogEditar(false);
          setDialogEditarRecriar(false);
          setEditarAdId(null);
          setEditarDados(null);
        }}
        adId={editarAdId}
        dadosIniciais={editarDados}
        aoSalvar={carregarDados}
        recriar={dialogEditarRecriar}
      />

      <DialogDetalhesAnuncio
        aberto={dialogDetalhes}
        aoFechar={() => { setDialogDetalhes(false); setLinhaDetalhes(null); }}
        linha={linhaDetalhes}
      />

      {/* QW-1: Confirmation dialog before bulk upload */}
      <AlertDialog open={confirmUpload.show} onOpenChange={(open) => { if (!open) setConfirmUpload({ show: false, linhas: [] }); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar upload</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  Deseja subir {confirmUpload.linhas.length} anuncio{confirmUpload.linhas.length !== 1 ? "s" : ""} para o Meta Ads?
                </p>
                <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                  {confirmUpload.linhas.slice(0, 5).map((l) => (
                    <li key={l.indiceLinha}>{l.adName || "Sem nome"}</li>
                  ))}
                  {confirmUpload.linhas.length > 5 && (
                    <li>e mais {confirmUpload.linhas.length - 5}...</li>
                  )}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={subirSelecionados}>
              Confirmar Upload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QW-12: Delete confirmation dialog */}
      <AlertDialog open={confirmExcluir.show} onOpenChange={(open) => { if (!open) setConfirmExcluir({ show: false, linha: null }); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anuncio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir &ldquo;{confirmExcluir.linha?.adName ?? ""}&rdquo;? Essa acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const linha = confirmExcluir.linha;
                if (!linha?.adId) return;
                setConfirmExcluir({ show: false, linha: null });
                try {
                  const res = await fetch(`/api/ads/${linha.adId}`, { method: "DELETE" });
                  if (!res.ok) {
                    const json = await res.json();
                    throw new Error(json.erro ?? "Erro ao excluir");
                  }
                  setLinhas((prev) => prev.filter((l) => l.adId !== linha.adId));
                  setSelecionados((prev) => { const novo = new Set(prev); novo.delete(linha.indiceLinha); return novo; });
                  setFeedback({ tipo: "sucesso", titulo: "Anuncio excluido" });
                } catch (e) {
                  setFeedback({ tipo: "erro", titulo: "Falha ao excluir", descricao: e instanceof Error ? e.message : "Erro desconhecido" });
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation: delete ad from Meta */}
      <AlertDialog open={confirmExcluirMeta.show} onOpenChange={(open) => { if (!open) setConfirmExcluirMeta({ show: false, linha: null }); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anúncio do Meta</AlertDialogTitle>
            <AlertDialogDescription>
              O anúncio &ldquo;{confirmExcluirMeta.linha?.adName ?? ""}&rdquo;
              {confirmExcluirMeta.linha?.metaEffectiveStatus === "ACTIVE"
                ? " está ativo no Meta e sairá do ar imediatamente."
                : confirmExcluirMeta.linha?.metaEffectiveStatus === "PAUSED"
                  ? " está pausado no Meta."
                  : confirmExcluirMeta.linha?.metaEffectiveStatus
                    ? ` está com status "${confirmExcluirMeta.linha.metaEffectiveStatus}" no Meta.`
                    : ""}
              {" "}Será apagado permanentemente do Meta Ads Manager. O rascunho será mantido no Claudinho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const linha = confirmExcluirMeta.linha;
                if (!linha?.adId) return;
                setConfirmExcluirMeta({ show: false, linha: null });
                try {
                  const res = await fetch(`/api/ads/${linha.adId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ _excluirMeta: true }),
                  });
                  if (!res.ok) {
                    const json = await res.json();
                    throw new Error(json.erro ?? "Erro ao excluir do Meta");
                  }
                  setFeedback({ tipo: "sucesso", titulo: "Anúncio excluído do Meta", descricao: "O rascunho foi mantido." });
                  await carregarDados();
                } catch (e) {
                  setFeedback({ tipo: "erro", titulo: "Falha ao excluir do Meta", descricao: e instanceof Error ? e.message : "Erro desconhecido" });
                }
              }}
            >
              Excluir do Meta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BannerPainel({
  tipo,
  titulo,
  descricao,
  aoFechar,
}: {
  tipo: NonNullable<FeedbackPainel>["tipo"];
  titulo: string;
  descricao?: string;
  aoFechar: () => void;
}) {
  const estilos = {
    sucesso: "border-green-300 bg-green-50 text-green-900",
    erro: "border-destructive/40 bg-destructive/10 text-destructive",
    aviso: "border-amber-300 bg-amber-50 text-amber-900",
    info: "border-blue-300 bg-blue-50 text-blue-900",
  } as const;

  return (
    <div className={`rounded-lg border px-4 py-3 ${estilos[tipo]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{titulo}</p>
          {descricao && <p className="mt-1 text-sm opacity-90">{descricao}</p>}
        </div>
        <button onClick={aoFechar} className="text-sm opacity-70 transition-opacity hover:opacity-100">
          Fechar
        </button>
      </div>
    </div>
  );
}

function BannerPlanilha({ diagnostico }: { diagnostico: DiagnosticoPlanilha }) {
  const temProblema =
    diagnostico.colunasObrigatoriasAusentes.length > 0 || diagnostico.cabecalhosDuplicados.length > 0;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        temProblema
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-blue-300 bg-blue-50 text-blue-900"
      }`}
    >
      <p className="text-sm font-medium">
        {temProblema ? "Atenção ao mapeamento da planilha" : "Mapeamento da planilha validado"}
      </p>
      <div className="mt-1 flex flex-col gap-1 text-sm">
        {diagnostico.colunasObrigatoriasAusentes.length > 0 && (
          <p>
            Cabeçalhos não encontrados:{" "}
            {diagnostico.colunasObrigatoriasAusentes.map(formatarColunaPlanilha).join(", ")}.
          </p>
        )}
        {diagnostico.colunasEmFallback.length > 0 && (
          <p>
            Colunas lidas por fallback/posição:{" "}
            {diagnostico.colunasEmFallback.map(formatarColunaPlanilha).join(", ")}.
          </p>
        )}
        {diagnostico.cabecalhosDuplicados.length > 0 && (
          <p>
            Cabeçalhos duplicados:{" "}
            {diagnostico.cabecalhosDuplicados.map(formatarColunaPlanilha).join(", ")}.
          </p>
        )}
        {!temProblema && diagnostico.usandoCabecalho && (
          <p>O fluxo está lendo a planilha pelos nomes de coluna, não pela posição.</p>
        )}
      </div>
    </div>
  );
}
