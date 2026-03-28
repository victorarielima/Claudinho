"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DadosEdicao {
  ad_name: string;
  texto_principal: string;
  titulo: string;
  descricao: string;
  cta: string;
  campaign_name: string;
  campaign_id: string;
  ad_set_name: string;
  ad_set_id: string;
  link_campanha: string;
}

interface DialogEditarAnuncioProps {
  aberto: boolean;
  aoFechar: () => void;
  adId: string | null;
  dadosIniciais: DadosEdicao | null;
  aoSalvar: () => void;
}

const OPCOES_CTA = [
  { valor: "SHOP_NOW", rotulo: "Shop Now" },
  { valor: "LEARN_MORE", rotulo: "Learn More" },
  { valor: "SIGN_UP", rotulo: "Sign Up" },
  { valor: "SUBSCRIBE", rotulo: "Subscribe" },
  { valor: "ORDER_NOW", rotulo: "Order Now" },
  { valor: "GET_OFFER", rotulo: "Get Offer" },
];

export function DialogEditarAnuncio({
  aberto,
  aoFechar,
  adId,
  dadosIniciais,
  aoSalvar,
}: DialogEditarAnuncioProps) {
  const [form, setForm] = useState<DadosEdicao>({
    ad_name: "",
    texto_principal: "",
    titulo: "",
    descricao: "",
    cta: "SHOP_NOW",
    campaign_name: "",
    campaign_id: "",
    ad_set_name: "",
    ad_set_id: "",
    link_campanha: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (aberto && dadosIniciais) {
      setForm(dadosIniciais);
      setErro(null);
    }
  }, [aberto, dadosIniciais]);

  const atualizar = useCallback(
    (campo: keyof DadosEdicao, valor: string) => {
      setForm((prev) => ({ ...prev, [campo]: valor }));
    },
    []
  );

  const salvar = useCallback(async () => {
    if (!adId) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/ads/${adId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro ?? "Erro ao salvar");
      aoSalvar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setSalvando(false);
    }
  }, [adId, form, aoSalvar, aoFechar]);

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Anúncio</DialogTitle>
          <DialogDescription>
            Edite os campos do rascunho antes de subir para a Meta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Estrutura */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Estrutura</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Campanha" valor={form.campaign_name} onChange={(v) => atualizar("campaign_name", v)} />
              <Campo rotulo="Campaign ID" valor={form.campaign_id} onChange={(v) => atualizar("campaign_id", v)} />
              <Campo rotulo="Ad Set" valor={form.ad_set_name} onChange={(v) => atualizar("ad_set_name", v)} />
              <Campo rotulo="Ad Set ID" valor={form.ad_set_id} onChange={(v) => atualizar("ad_set_id", v)} />
            </div>
            <Campo rotulo="Nome do anúncio" valor={form.ad_name} onChange={(v) => atualizar("ad_name", v)} />
          </div>

          <Separator />

          {/* Conteúdo */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Conteúdo</h4>
            <div>
              <label className="text-sm text-muted-foreground">Texto principal</label>
              <textarea
                value={form.texto_principal}
                onChange={(e) => atualizar("texto_principal", e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>
            <Campo rotulo="Título" valor={form.titulo} onChange={(v) => atualizar("titulo", v)} />
            <Campo rotulo="Descrição" valor={form.descricao} onChange={(v) => atualizar("descricao", v)} />
            <div>
              <label className="text-sm text-muted-foreground">CTA</label>
              <select
                value={form.cta}
                onChange={(e) => atualizar("cta", e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {OPCOES_CTA.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                ))}
              </select>
            </div>
            <Campo rotulo="Link da campanha" valor={form.link_campanha ?? ""} onChange={(v) => atualizar("link_campanha", v)} />
          </div>
        </div>

        {erro && (
          <p className="text-sm text-destructive">{erro}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm text-muted-foreground">{rotulo}</label>
      <input
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      />
    </div>
  );
}
