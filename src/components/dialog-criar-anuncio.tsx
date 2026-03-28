"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  Eye,
  Film,
  ImageIcon,
  Layers3,
  Link2,
  Loader2,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderOpen } from "lucide-react";
import { DialogExploradorVideos, type VideoDrive } from "@/components/dialog-explorador-videos";
import { analisarProntidaoAnuncio } from "@/lib/ad-readiness";
import { extrairImageAssets, rotuloPlacementImagem } from "@/lib/ad-media";
import { gerarLinkAnuncio } from "@/lib/utm";
import { cn } from "@/lib/utils";

type TipoCriativo = "video" | "image";

type FeedbackPainel = {
  tipo: "sucesso" | "erro" | "aviso" | "info";
  titulo: string;
  descricao?: string;
} | null;

type FormularioCriativo = {
  campaign_name: string;
  campaign_id: string;
  ad_set_name: string;
  ad_set_id: string;
  ad_name: string;
  texto_principal: string;
  titulo: string;
  descricao: string;
  cta: string;
  link_campanha: string;
  link_aux: string;
  videoUrl: string;
  imageFeed: string;
  imageStories: string;
  imageHorizontal: string;
  imagePaste: string;
};

type RascunhoCriativo = {
  id: string;
  tipo: TipoCriativo;
  form: FormularioCriativo;
  erro?: string;
};

const FORM_INICIAL: FormularioCriativo = {
  campaign_name: "",
  campaign_id: "",
  ad_set_name: "",
  ad_set_id: "",
  ad_name: "",
  texto_principal: "",
  titulo: "",
  descricao: "",
  cta: "SHOP_NOW",
  link_campanha: "",
  link_aux: "",
  videoUrl: "",
  imageFeed: "",
  imageStories: "",
  imageHorizontal: "",
  imagePaste: "",
};

const OPCOES_CTA = [
  { valor: "SHOP_NOW", rotulo: "Shop Now" },
  { valor: "LEARN_MORE", rotulo: "Learn More" },
  { valor: "SIGN_UP", rotulo: "Sign Up" },
  { valor: "SUBSCRIBE", rotulo: "Subscribe" },
];

function novoFormulario(): FormularioCriativo {
  return { ...FORM_INICIAL };
}

function prepararProximoCriativo(form: FormularioCriativo): FormularioCriativo {
  return {
    ...FORM_INICIAL,
    campaign_name: form.campaign_name,
    campaign_id: form.campaign_id,
    ad_set_name: form.ad_set_name,
    ad_set_id: form.ad_set_id,
    cta: form.cta,
    link_campanha: form.link_campanha,
    link_aux: form.link_aux,
  };
}

function extrairDriveFileId(url: string): string | null {
  const matchFile = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile) return matchFile[1];

  const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId) return matchId[1];

  return null;
}

function gerarIdRascunho(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function montarAssets(form: FormularioCriativo, tipo: TipoCriativo) {
  if (tipo === "video") {
    return form.videoUrl.trim()
      ? [
          {
            placement: "video_principal",
            asset_url: form.videoUrl.trim(),
            asset_type: "video" as const,
          },
        ]
      : [];
  }

  return [
    { placement: "feed", asset_url: form.imageFeed.trim(), asset_type: "image" as const },
    { placement: "stories", asset_url: form.imageStories.trim(), asset_type: "image" as const },
    { placement: "horizontal", asset_url: form.imageHorizontal.trim(), asset_type: "image" as const },
  ].filter((asset) => asset.asset_url.length > 0);
}

function montarLinkUtm(form: FormularioCriativo): string {
  if (!form.link_campanha.trim() || !form.campaign_name.trim() || !form.ad_name.trim()) {
    return "";
  }

  try {
    return gerarLinkAnuncio(form.link_campanha, form.campaign_name, form.ad_name);
  } catch {
    return form.link_campanha.trim();
  }
}

function montarDiagnostico(form: FormularioCriativo, tipo: TipoCriativo) {
  const assets = montarAssets(form, tipo);
  const linkAnuncio = montarLinkUtm(form);

  const diagnostico = analisarProntidaoAnuncio({
    tipo,
    adSetId: form.ad_set_id,
    adName: form.ad_name,
    linkVideo: tipo === "video" ? form.videoUrl : "",
    linkAnuncio,
    imageAssets: assets.map((asset) => ({
      placement: asset.placement,
      url: asset.asset_url,
    })),
  });

  return {
    assets,
    linkAnuncio,
    diagnostico,
  };
}

function validarFormulario(
  form: FormularioCriativo,
  tipo: TipoCriativo,
  brandId: string
): string | null {
  if (!brandId) {
    return "Selecione uma brand antes de criar o criativo.";
  }

  if (!form.campaign_name.trim() || !form.ad_set_name.trim() || !form.ad_name.trim()) {
    return "Preencha Campanha, Ad Set e Nome do anúncio.";
  }

  const { diagnostico } = montarDiagnostico(form, tipo);
  if (diagnostico.bloqueios.length > 0) {
    return diagnostico.bloqueios.map((item) => item.mensagem).join(" ");
  }

  return null;
}

function hostDoLink(link: string): string {
  if (!link.trim()) return "Sem destino";

  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "Link inválido";
  }
}

function resumoCamposEssenciais(form: FormularioCriativo, tipo: TipoCriativo): {
  preenchidos: number;
  total: number;
} {
  const itens = [
    Boolean(form.campaign_name.trim()),
    Boolean(form.ad_set_name.trim()),
    Boolean(form.ad_set_id.trim()),
    Boolean(form.ad_name.trim()),
    Boolean(form.link_campanha.trim()),
    tipo === "video"
      ? Boolean(form.videoUrl.trim())
      : Boolean(
          form.imageFeed.trim() || form.imageStories.trim() || form.imageHorizontal.trim()
        ),
  ];

  return {
    preenchidos: itens.filter(Boolean).length,
    total: itens.length,
  };
}

function resumoAssets(form: FormularioCriativo, tipo: TipoCriativo): string {
  if (tipo === "video") {
    return form.videoUrl.trim() ? "Video conectado" : "Sem video";
  }

  const total = [
    form.imageFeed.trim(),
    form.imageStories.trim(),
    form.imageHorizontal.trim(),
  ].filter(Boolean).length;

  return `${total}/3 cortes`;
}

function resumoTipo(tipo: TipoCriativo): string {
  return tipo === "video" ? "Video" : "Imagem";
}

function campoRascunho(rascunho: RascunhoCriativo): string {
  return rascunho.form.ad_name.trim() || "Criativo sem nome";
}

export function DialogCriarAnuncio({
  aberto,
  aoFechar,
  brandId,
  brandNome,
  aoSalvar,
  aoNotificar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  brandId: string;
  brandNome?: string;
  aoSalvar: () => Promise<void> | void;
  aoNotificar: (feedback: FeedbackPainel) => void;
}) {
  const [tipo, setTipo] = useState<TipoCriativo>("video");
  const [form, setForm] = useState<FormularioCriativo>(novoFormulario);
  const [fila, setFila] = useState<RascunhoCriativo[]>([]);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const [mensagemColagem, setMensagemColagem] = useState<string | null>(null);
  const [salvandoAtual, setSalvandoAtual] = useState(false);
  const [salvandoFila, setSalvandoFila] = useState(false);
  const [exploradorAberto, setExploradorAberto] = useState(false);

  useEffect(() => {
    if (!aberto) {
      setTipo("video");
      setForm(novoFormulario());
      setFila([]);
      setErroFormulario(null);
      setMensagemColagem(null);
      setSalvandoAtual(false);
      setSalvandoFila(false);
    }
  }, [aberto]);

  const { assets, linkAnuncio, diagnostico } = montarDiagnostico(form, tipo);
  const fileIdVideo = tipo === "video" ? extrairDriveFileId(form.videoUrl) : null;
  const formIniciado = Object.values(form).some((valor) => valor.trim().length > 0);
  const essenciais = resumoCamposEssenciais(form, tipo);
  const prontoParaSalvar = diagnostico.bloqueios.length === 0;
  const usandoFila = fila.length > 0;

  function atualizarCampo(campo: keyof FormularioCriativo, valor: string) {
    setForm((anterior) => ({ ...anterior, [campo]: valor }));
    setErroFormulario(null);
  }

  async function salvarNoBackend(
    itemForm: FormularioCriativo,
    itemTipo: TipoCriativo
  ) {
    const payload = {
      brand_id: brandId,
      type: itemTipo,
      ...itemForm,
      assets: montarAssets(itemForm, itemTipo),
    };

    const response = await fetch("/api/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.erro ?? "Erro ao salvar anúncio");
    }

    return json;
  }

  function adicionarNaFila() {
    const mensagemErro = validarFormulario(form, tipo, brandId);
    if (mensagemErro) {
      setErroFormulario(mensagemErro);
      return;
    }

    setFila((anterior) => [
      ...anterior,
      {
        id: gerarIdRascunho(),
        tipo,
        form: { ...form },
      },
    ]);
    setForm(prepararProximoCriativo(form));
    setErroFormulario(null);
    setMensagemColagem(null);
  }

  async function salvarAtual() {
    const mensagemErro = validarFormulario(form, tipo, brandId);
    if (mensagemErro) {
      setErroFormulario(mensagemErro);
      return;
    }

    setSalvandoAtual(true);

    try {
      const { diagnostico: diagnosticoAtual } = montarDiagnostico(form, tipo);
      await salvarNoBackend(form, tipo);
      await aoSalvar();
      aoNotificar({
        tipo: diagnosticoAtual.avisos.length > 0 ? "aviso" : "sucesso",
        titulo: diagnosticoAtual.avisos.length > 0 ? "Criativo salvo com avisos" : "Criativo salvo",
        descricao:
          diagnosticoAtual.avisos.length > 0
            ? diagnosticoAtual.avisos.map((item) => item.mensagem).join(" ")
            : "O criativo ja aparece no painel de criacao.",
      });
      aoFechar();
    } catch (error) {
      setErroFormulario(
        error instanceof Error ? error.message : "Erro desconhecido ao salvar criativo."
      );
    } finally {
      setSalvandoAtual(false);
    }
  }

  async function salvarFilaCompleta() {
    if (fila.length === 0) return;

    setSalvandoFila(true);

    let sucessos = 0;
    const falhas: RascunhoCriativo[] = [];

    for (const item of fila) {
      try {
        await salvarNoBackend(item.form, item.tipo);
        sucessos += 1;
      } catch (error) {
        falhas.push({
          ...item,
          erro:
            error instanceof Error ? error.message : "Erro desconhecido ao salvar criativo.",
        });
      }
    }

    if (sucessos > 0) {
      await aoSalvar();
    }

    setFila(falhas);

    if (sucessos > 0 && falhas.length === 0) {
      aoNotificar({
        tipo: "sucesso",
        titulo: "Fila salva com sucesso",
        descricao: `${sucessos} criativo${sucessos > 1 ? "s" : ""} salvo${sucessos > 1 ? "s" : ""}.`,
      });
      aoFechar();
    } else if (sucessos > 0 && falhas.length > 0) {
      aoNotificar({
        tipo: "aviso",
        titulo: "Fila salva parcialmente",
        descricao: `${sucessos} item${sucessos > 1 ? "s" : ""} salvo${sucessos > 1 ? "s" : ""}. ${falhas.length} ainda precisam de ajuste.`,
      });
    } else {
      setErroFormulario("Nao foi possivel salvar os itens da fila. Revise os erros e tente novamente.");
    }

    setSalvandoFila(false);
  }

  function editarRascunho(id: string) {
    const item = fila.find((rascunho) => rascunho.id === id);
    if (!item) return;

    setTipo(item.tipo);
    setForm({ ...item.form });
    setFila((anterior) => anterior.filter((rascunho) => rascunho.id !== id));
    setErroFormulario(null);
    setMensagemColagem(null);
  }

  function removerRascunho(id: string) {
    setFila((anterior) => anterior.filter((rascunho) => rascunho.id !== id));
  }

  function aplicarColagemRapida() {
    const detectados = extrairImageAssets(form.imagePaste);
    if (detectados.length === 0) {
      setMensagemColagem("Cole URLs validas separadas por quebra de linha, virgula ou ponto e virgula.");
      return;
    }

    let ignorados = 0;
    let preenchidos = 0;
    const slots = {
      feed: "",
      stories: "",
      horizontal: "",
    };

    for (const asset of detectados) {
      if (asset.placement === "feed" && !slots.feed) {
        slots.feed = asset.url;
        preenchidos += 1;
        continue;
      }

      if (asset.placement === "stories" && !slots.stories) {
        slots.stories = asset.url;
        preenchidos += 1;
        continue;
      }

      if (asset.placement === "horizontal" && !slots.horizontal) {
        slots.horizontal = asset.url;
        preenchidos += 1;
        continue;
      }

      ignorados += 1;
    }

    setForm((anterior) => ({
      ...anterior,
      imageFeed: slots.feed || anterior.imageFeed,
      imageStories: slots.stories || anterior.imageStories,
      imageHorizontal: slots.horizontal || anterior.imageHorizontal,
    }));
    setMensagemColagem(
      preenchidos === 0
        ? "Nao consegui identificar automaticamente os cortes. Ajuste manualmente."
        : `${preenchidos} corte${preenchidos > 1 ? "s" : ""} distribuido${preenchidos > 1 ? "s" : ""} automaticamente${ignorados > 0 ? `. ${ignorados} link${ignorados > 1 ? "s" : ""} precisam de ajuste manual.` : "."}`
    );
  }

  return (
    <>
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[min(1240px,calc(100vw-3rem))]">
        <div className="max-h-[88vh] overflow-y-auto bg-slate-50">
          <div className="border-b bg-white px-6 py-5">
            <DialogHeader className="gap-3 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-slate-200 bg-slate-100 text-slate-700" variant="outline">
                  {brandNome ?? "Brand ativa"}
                </Badge>
                <Badge className="border-sky-200 bg-sky-50 text-sky-700" variant="outline">
                  <Sparkles className="size-3" />
                  Preview ao vivo
                </Badge>
                {usandoFila && (
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">
                    <Layers3 className="size-3" />
                    {fila.length} na fila
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-2xl text-slate-950">Adicionar criativos</DialogTitle>
              <DialogDescription className="max-w-3xl text-sm text-slate-600">
                Preencha o basico, confira a previa e use a fila quando precisar subir varios
                criativos em sequencia.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ResumoTopo
                rotulo="Status"
                valor={prontoParaSalvar ? "Pronto" : "Revisar"}
                destaque={prontoParaSalvar ? "ok" : "warn"}
              />
              <ResumoTopo
                rotulo="Essenciais"
                valor={`${essenciais.preenchidos}/${essenciais.total}`}
              />
              <ResumoTopo rotulo="Assets" valor={resumoAssets(form, tipo)} />
              <ResumoTopo rotulo="Destino" valor={hostDoLink(form.link_campanha)} />
            </div>
          </div>

          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="space-y-6">
                <BlocoComposer
                  numero="01"
                  titulo="Estrutura"
                  descricao="Campanha, ad set e tipo do criativo."
                >
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Tipo de criativo</p>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <BotaoTipo
                          ativo={tipo === "video"}
                          icone={<Film className="size-4" />}
                          titulo="Video"
                          descricao="Drive + preview"
                          onClick={() => setTipo("video")}
                        />
                        <BotaoTipo
                          ativo={tipo === "image"}
                          icone={<ImageIcon className="size-4" />}
                          titulo="Imagem"
                          descricao="cortes por placement"
                          onClick={() => setTipo("image")}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <CampoTexto
                        rotulo="Campanha"
                        valor={form.campaign_name}
                        obrigatorio
                        onChange={(valor) => atualizarCampo("campaign_name", valor)}
                      />
                      <CampoTexto
                        rotulo="Campaign ID"
                        placeholder="Opcional"
                        valor={form.campaign_id}
                        onChange={(valor) => atualizarCampo("campaign_id", valor)}
                      />
                      <CampoTexto
                        rotulo="Ad Set"
                        valor={form.ad_set_name}
                        obrigatorio
                        onChange={(valor) => atualizarCampo("ad_set_name", valor)}
                      />
                      <CampoTexto
                        rotulo="Ad Set ID"
                        placeholder="Obrigatorio para subir na Meta"
                        valor={form.ad_set_id}
                        onChange={(valor) => atualizarCampo("ad_set_id", valor)}
                      />
                    </div>

                    <CampoTexto
                      rotulo="Nome do anuncio"
                      valor={form.ad_name}
                      obrigatorio
                      onChange={(valor) => atualizarCampo("ad_name", valor)}
                    />

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      O criativo pode ser salvo sem <code>Ad Set ID</code>, mas fica bloqueado para
                      envio ate esse campo ser preenchido.
                    </div>
                  </div>
                </BlocoComposer>

                <BlocoComposer
                  numero="02"
                  titulo="Copy e destino"
                  descricao="Texto, CTA e link com UTM gerada automaticamente."
                >
                  <div className="space-y-4">
                    <CampoTextoLongo
                      rotulo="Texto principal"
                      valor={form.texto_principal}
                      onChange={(valor) => atualizarCampo("texto_principal", valor)}
                      linhas={4}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <CampoTexto
                        rotulo="Titulo"
                        valor={form.titulo}
                        onChange={(valor) => atualizarCampo("titulo", valor)}
                      />
                      <CampoTexto
                        rotulo="Descricao"
                        valor={form.descricao}
                        onChange={(valor) => atualizarCampo("descricao", valor)}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-slate-900">CTA</label>
                        <select
                          value={form.cta}
                          onChange={(event) => atualizarCampo("cta", event.target.value)}
                          className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                        >
                          {OPCOES_CTA.map((opcao) => (
                            <option key={opcao.valor} value={opcao.valor}>
                              {opcao.rotulo}
                            </option>
                          ))}
                        </select>
                      </div>
                      <CampoTexto
                        rotulo="Link aux"
                        placeholder="Referencia interna"
                        valor={form.link_aux}
                        onChange={(valor) => atualizarCampo("link_aux", valor)}
                      />
                    </div>

                    <CampoTexto
                      rotulo="Link da campanha"
                      valor={form.link_campanha}
                      placeholder="https://..."
                      onChange={(valor) => atualizarCampo("link_campanha", valor)}
                    />

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <Link2 className="size-3.5" />
                        Link UTM gerado
                      </div>
                      <p className="mt-2 break-all font-mono text-xs text-slate-700">
                        {linkAnuncio ||
                          "Preencha campanha, nome do anuncio e link base para gerar a UTM."}
                      </p>
                    </div>
                  </div>
                </BlocoComposer>

                <BlocoComposer
                  numero="03"
                  titulo="Assets"
                  descricao="Cole as URLs ou preencha manualmente."
                >
                  {tipo === "video" ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Importe um vídeo da pasta do Drive ou cole o link manualmente.
                      </div>
                      <div className="flex gap-3 items-end">
                        <div className="flex-1">
                          <CampoTexto
                            rotulo="URL do video"
                            placeholder="https://drive.google.com/file/d/..."
                            valor={form.videoUrl}
                            onChange={(valor) => atualizarCampo("videoUrl", valor)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 mb-0.5"
                          onClick={() => setExploradorAberto(true)}
                        >
                          <FolderOpen className="size-4" />
                          Importar do Drive
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Cole varias URLs de uma vez e eu tento encaixar automaticamente quadrado,
                        vertical e horizontal.
                      </div>

                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">Colagem rapida</p>
                            <p className="mt-1 text-sm text-slate-500">
                              Aceita quebra de linha, virgula ou ponto e virgula.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={aplicarColagemRapida}
                          >
                            <ClipboardPaste className="size-4" />
                            Distribuir links
                          </Button>
                        </div>
                        <textarea
                          value={form.imagePaste}
                          onChange={(event) => {
                            atualizarCampo("imagePaste", event.target.value);
                            setMensagemColagem(null);
                          }}
                          rows={4}
                          className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                          placeholder="https://...1080x1080.jpg&#10;https://...1080x1920.jpg&#10;https://...1200x628.jpg"
                        />
                        {mensagemColagem && (
                          <p className="mt-2 text-sm text-slate-600">{mensagemColagem}</p>
                        )}
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <CampoTexto
                          rotulo="Quadrado"
                          placeholder="1080x1080"
                          valor={form.imageFeed}
                          onChange={(valor) => atualizarCampo("imageFeed", valor)}
                        />
                        <CampoTexto
                          rotulo="Vertical"
                          placeholder="1080x1920"
                          valor={form.imageStories}
                          onChange={(valor) => atualizarCampo("imageStories", valor)}
                        />
                        <CampoTexto
                          rotulo="Horizontal"
                          placeholder="1200x628"
                          valor={form.imageHorizontal}
                          onChange={(valor) => atualizarCampo("imageHorizontal", valor)}
                        />
                      </div>
                    </div>
                  )}
                </BlocoComposer>
              </div>

              <aside className="lg:sticky lg:top-6 lg:self-start">
                <div className="space-y-6">
                  <Card className="gap-0 overflow-hidden border-slate-200 py-0 shadow-sm">
                    <CardContent className="space-y-4 px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Previa do criativo</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Revisa a copy, o asset e o destino sem sair do formulario.
                      </p>
                    </div>
                    <Badge variant="outline" className="border-slate-200">
                      <Eye className="size-3" />
                      {resumoTipo(tipo)}
                    </Badge>
                  </div>

                  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                          {(brandNome ?? "M").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {form.ad_name || "Nome do anuncio"}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {form.campaign_name || "Campanha"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={cn("px-4 py-5", tipo === "video" ? "bg-linear-to-br from-slate-950 via-slate-900 to-slate-800" : "bg-slate-950")}>
                      {tipo === "video" ? (
                        <div className="mx-auto w-full max-w-[260px]">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <Badge className="border-white/15 bg-white/10 text-white" variant="outline">
                              Story / Reels
                            </Badge>
                            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
                              9:16
                            </span>
                          </div>

                          {fileIdVideo ? (
                            <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem] border border-white/15 bg-black shadow-2xl shadow-black/30">
                              <iframe
                                src={`https://drive.google.com/file/d/${fileIdVideo}/preview`}
                                title="Preview do video"
                                className="absolute inset-0 h-full w-full"
                                allow="autoplay"
                                allowFullScreen
                              />
                            </div>
                          ) : (
                            <div className="flex aspect-[9/16] items-center justify-center rounded-[2rem] border border-white/15 bg-white/6 text-slate-200">
                              <div className="flex flex-col items-center gap-2 px-6 text-center">
                                <div className="rounded-full border border-white/20 bg-white/10 p-3">
                                  <Film className="size-6" />
                                </div>
                                <p className="text-sm font-medium">Adicione o link do video</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : assets.length > 0 ? (
                        <div className="relative aspect-square w-full">
                          <Image
                            src={assets[0].asset_url}
                            alt="Preview do criativo"
                            fill
                            unoptimized
                            sizes="(min-width: 1280px) 420px, (min-width: 1024px) 380px, 100vw"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-square items-center justify-center bg-slate-100 text-slate-400">
                          <div className="flex flex-col items-center gap-2 text-center">
                            <div className="rounded-full border border-slate-300 bg-white p-3">
                              <ImageIcon className="size-6" />
                            </div>
                            <p className="text-sm font-medium">Adicione imagens para ver a previa</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 px-4 py-4">
                      <p className="text-sm leading-relaxed text-slate-700">
                        {form.texto_principal ||
                          "O texto principal aparece aqui para revisar hierarquia e tom."}
                      </p>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {form.titulo || "Titulo do criativo"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {form.descricao || "Descricao complementar"}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="truncate text-xs text-slate-500">
                            {hostDoLink(form.link_campanha)}
                          </span>
                          <span className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                            {OPCOES_CTA.find((item) => item.valor === form.cta)?.rotulo ?? form.cta}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {tipo === "image" && assets.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {assets.map((asset) => (
                        <div
                          key={`${asset.placement}-${asset.asset_url}`}
                          className="overflow-hidden rounded-2xl border border-slate-200"
                        >
                          <div className="border-b border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {rotuloPlacementImagem(asset.placement, asset.asset_url)}
                          </div>
                          <div className="relative aspect-square w-full">
                            <Image
                              src={asset.asset_url}
                              alt={rotuloPlacementImagem(asset.placement, asset.asset_url)}
                              fill
                              unoptimized
                              sizes="96px"
                              className="object-cover"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                    </CardContent>
                  </Card>

                  <Card className="gap-0 border-slate-200 py-0 shadow-sm">
                    <CardContent className="space-y-3 px-5 py-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Checklist</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Bloqueios impedem o salvamento. Avisos servem como revisao.
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "border-slate-200",
                            prontoParaSalvar && "border-emerald-200 bg-emerald-50 text-emerald-700"
                          )}
                        >
                          {prontoParaSalvar ? <Check className="size-3" /> : <AlertTriangle className="size-3" />}
                          {prontoParaSalvar ? "Pronto" : "Revisar"}
                        </Badge>
                      </div>

                      <ChecklistLinha rotulo="Campanha preenchida" ok={Boolean(form.campaign_name.trim())} />
                      <ChecklistLinha rotulo="Ad Set preenchido" ok={Boolean(form.ad_set_name.trim())} />
                      <ChecklistLinha rotulo="Ad Set ID preenchido" ok={Boolean(form.ad_set_id.trim())} />
                      <ChecklistLinha rotulo="Nome do anuncio" ok={Boolean(form.ad_name.trim())} />
                      <ChecklistLinha
                        rotulo={tipo === "video" ? "Video conectado" : "Pelo menos um corte informado"}
                        ok={tipo === "video" ? Boolean(form.videoUrl.trim()) : assets.length > 0}
                      />
                      <ChecklistLinha rotulo="Link com UTM gerada" ok={Boolean(linkAnuncio)} opcional />

                      {diagnostico.bloqueios.length > 0 && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          <p className="font-medium">Bloqueios</p>
                          <div className="mt-2 space-y-1">
                            {diagnostico.bloqueios.map((item) => (
                              <p key={item.codigo}>{item.mensagem}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {diagnostico.avisos.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                          <p className="font-medium text-slate-900">Avisos</p>
                          <div className="mt-2 space-y-1">
                            {diagnostico.avisos.map((item) => (
                              <p key={item.codigo}>{item.mensagem}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </aside>
            </div>

            <BlocoComposer
              numero="04"
              titulo="Fila de cadastro"
              descricao="Monte varios rascunhos e salve tudo em lote quando fizer sentido."
            >
              <div className="space-y-3">
                {fila.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Nenhum rascunho na fila ainda.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fila.map((item) => {
                      const { diagnostico: diagnosticoItem } = montarDiagnostico(item.form, item.tipo);
                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {campoRascunho(item)}
                                </p>
                                <Badge variant="outline" className="border-slate-200">
                                  {resumoTipo(item.tipo)}
                                </Badge>
                              </div>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {item.form.campaign_name || "Sem campanha"}
                              </p>
                              {item.erro && (
                                <p className="mt-2 text-xs text-destructive">{item.erro}</p>
                              )}
                              {diagnosticoItem.avisos.length > 0 && !item.erro && (
                                <p className="mt-2 text-xs text-amber-700">
                                  {diagnosticoItem.avisos.length} aviso{diagnosticoItem.avisos.length > 1 ? "s" : ""}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                type="button"
                                onClick={() => editarRascunho(item.id)}
                              >
                                <PencilLine className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                type="button"
                                onClick={() => removerRascunho(item.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {usandoFila && formIniciado && (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    O item atual ainda nao entrou na fila. Use <strong>Adicionar a fila</strong>{" "}
                    se quiser salvar tudo junto.
                  </div>
                )}
              </div>
            </BlocoComposer>

            {erroFormulario && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {erroFormulario}
              </div>
            )}
          </div>
        </div>

        <div className="border-t bg-white px-6 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-slate-500">
              {fila.length > 0
                ? `${fila.length} item${fila.length > 1 ? "s" : ""} pronto${fila.length > 1 ? "s" : ""} na fila.`
                : "Salve o criativo atual ou adicione a fila para continuar cadastrando."}
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                disabled={salvandoAtual || salvandoFila}
                onClick={aoFechar}
              >
                Cancelar
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={salvandoAtual || salvandoFila}
                onClick={adicionarNaFila}
              >
                <Plus className="size-4" />
                Adicionar a fila
              </Button>

              <Button
                type="button"
                variant="secondary"
                disabled={fila.length === 0 || salvandoAtual || salvandoFila}
                onClick={salvarFilaCompleta}
              >
                {salvandoFila ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Salvando fila...
                  </>
                ) : (
                  <>
                    <Layers3 className="size-4" />
                    Salvar fila ({fila.length})
                  </>
                )}
              </Button>

              <Button
                type="button"
                disabled={salvandoAtual || salvandoFila}
                onClick={salvarAtual}
              >
                {salvandoAtual ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Salvando criativo...
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    Salvar criativo
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <DialogExploradorVideos
      aberto={exploradorAberto}
      aoFechar={() => setExploradorAberto(false)}
      aoConfirmar={(videos: VideoDrive[]) => {
        setExploradorAberto(false);
        if (videos.length > 0) {
          const video = videos[0];
          atualizarCampo("videoUrl", video.driveUrl);
          // Auto-fill ad name from video name if empty
          if (!form.ad_name.trim()) {
            const nomeBase = video.nome.replace(/\.[^.]+$/, "");
            atualizarCampo("ad_name", nomeBase);
          }
          // Auto-fill titulo if empty
          if (!form.titulo.trim()) {
            atualizarCampo("titulo", video.nome.replace(/\.[^.]+$/, ""));
          }
        }
      }}
    />
    </>
  );
}

function ResumoTopo({
  rotulo,
  valor,
  destaque = "neutral",
}: {
  rotulo: string;
  valor: string;
  destaque?: "neutral" | "ok" | "warn";
}) {
  const classes = {
    neutral: "border-slate-200 bg-slate-50 text-slate-900",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
  } as const;

  return (
    <div className={cn("rounded-2xl border px-4 py-3", classes[destaque])}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {rotulo}
      </p>
      <p className="mt-1 truncate text-sm font-medium">{valor}</p>
    </div>
  );
}

function BlocoComposer({
  numero,
  titulo,
  descricao,
  children,
}: {
  numero: string;
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xs font-semibold tracking-[0.16em] text-slate-700">
          {numero}
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-950">{titulo}</h3>
          <p className="mt-1 text-sm text-slate-500">{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function BotaoTipo({
  ativo,
  icone,
  titulo,
  descricao,
  onClick,
}: {
  ativo: boolean;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition",
        ativo
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
      )}
    >
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-xl",
          ativo ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"
        )}
      >
        {icone}
      </div>
      <div>
        <p className="text-sm font-medium">{titulo}</p>
        <p className={cn("mt-0.5 text-xs", ativo ? "text-white/70" : "text-slate-500")}>
          {descricao}
        </p>
      </div>
    </button>
  );
}

function CampoTexto({
  rotulo,
  valor,
  onChange,
  placeholder,
  obrigatorio = false,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  obrigatorio?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-900">
        {rotulo}
        {obrigatorio && <span className="text-slate-400"> *</span>}
      </label>
      <input
        type="text"
        value={valor}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </div>
  );
}

function CampoTextoLongo({
  rotulo,
  valor,
  onChange,
  linhas,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  linhas: number;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-900">{rotulo}</label>
      <textarea
        value={valor}
        onChange={(event) => onChange(event.target.value)}
        rows={linhas}
        className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </div>
  );
}

function ChecklistLinha({
  rotulo,
  ok,
  opcional = false,
}: {
  rotulo: string;
  ok: boolean;
  opcional?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm text-slate-800">{rotulo}</p>
        {opcional && <p className="text-xs text-slate-500">Opcional, mas recomendado.</p>}
      </div>
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full border",
          ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-50 text-slate-400"
        )}
      >
        {ok ? <Check className="size-4" /> : <span className="size-2 rounded-full bg-current" />}
      </span>
    </div>
  );
}
