import { getSupabase } from "./supabase";
import { gerarLinkAnuncio } from "./utm";

// ─── Types ──────────────────────────────────────────────────

export type TipoAd = "video" | "image";
export type StatusAd = "pendente" | "processando" | "concluido" | "erro";

export interface Ad {
  id: string;
  brand_id: string;
  type: TipoAd;
  campaign_name: string;
  campaign_id: string | null;
  ad_set_name: string;
  ad_set_id: string | null;
  ad_name: string;
  texto_principal: string | null;
  titulo: string | null;
  descricao: string | null;
  cta: string;
  link_campanha: string | null;
  link_anuncio: string | null;
  link_aux: string | null;
  status: StatusAd;
  error_message: string | null;
  meta_ad_id: string | null;
  meta_creative_id: string | null;
  meta_account_id: string | null;
  meta_effective_status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  ad_assets?: AdAsset[];
}

export interface AdAsset {
  id: string;
  ad_id: string;
  placement: string;
  asset_url: string;
  asset_type: "image" | "video";
  meta_asset_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: Record<string, { old?: unknown; new?: unknown }> | null;
  user_id: string;
  user_name: string | null;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  meta_account_id: string;
  meta_page_id: string;
  sheet_name: string | null;
  clickup_list_id: string | null;
  created_at: string;
}

// ─── Input types ────────────────────────────────────────────

export interface CriarAdInput {
  brand_id: string;
  type: TipoAd;
  campaign_name: string;
  campaign_id?: string;
  ad_set_name: string;
  ad_set_id?: string;
  ad_name: string;
  texto_principal?: string;
  titulo?: string;
  descricao?: string;
  cta?: string;
  link_campanha?: string;
  link_anuncio_override?: string;
  link_aux?: string;
  assets: { placement: string; asset_url: string; asset_type: "image" | "video" }[];
}

export interface AtualizarAdInput {
  campaign_name?: string;
  campaign_id?: string;
  ad_set_name?: string;
  ad_set_id?: string;
  ad_name?: string;
  texto_principal?: string;
  titulo?: string;
  descricao?: string;
  cta?: string;
  link_campanha?: string;
  link_anuncio?: string;
  link_aux?: string;
  type?: TipoAd;
}

export interface FiltrosAd {
  brand_id?: string;
  status?: StatusAd;
  type?: TipoAd;
  busca?: string;
  campaign_name?: string;
  limit?: number;
  offset?: number;
}

// ─── Brands ─────────────────────────────────────────────────

export async function listarBrands(): Promise<Brand[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("brands")
    .select("*")
    .order("name");

  if (error) throw new Error(`Erro ao listar brands: ${error.message}`);
  return data as Brand[];
}

export async function buscarBrand(id: string): Promise<Brand | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("brands")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar brand: ${error.message}`);
  return data as Brand | null;
}

export async function buscarBrandPorMetaAccount(metaAccountId: string): Promise<Brand | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("brands")
    .select("*")
    .eq("meta_account_id", metaAccountId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar brand por meta account: ${error.message}`);
  return data as Brand | null;
}

// ─── Ads ────────────────────────────────────────────────────

export async function listarAds(filtros: FiltrosAd = {}): Promise<{ ads: Ad[]; total: number }> {
  const sb = getSupabase();

  let query = sb
    .from("ads")
    .select("*, ad_assets(*)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filtros.brand_id) query = query.eq("brand_id", filtros.brand_id);
  if (filtros.status) query = query.eq("status", filtros.status);
  if (filtros.type) query = query.eq("type", filtros.type);
  if (filtros.campaign_name) query = query.eq("campaign_name", filtros.campaign_name);
  if (filtros.busca) query = query.ilike("ad_name", `%${filtros.busca}%`);

  const limit = filtros.limit ?? 100;
  const offset = filtros.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Erro ao listar ads: ${error.message}`);
  return { ads: data as Ad[], total: count ?? 0 };
}

export async function buscarAd(id: string, tentativas = 3): Promise<Ad | null> {
  const sb = getSupabase();

  for (let i = 0; i < tentativas; i++) {
    try {
      const { data, error } = await sb
        .from("ads")
        .select("*, ad_assets(*)")
        .eq("id", id)
        .maybeSingle();

      if (error) throw new Error(`Erro ao buscar ad: ${error.message}`);
      return data as Ad | null;
    } catch (e) {
      const isFetchError = e instanceof Error && e.message.includes("fetch failed");
      if (isFetchError && i < tentativas - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw e;
    }
  }

  return null;
}

export async function listarAdNamesAtivosNoAdSet(
  brandId: string,
  campaignName: string,
  adSetName: string
): Promise<string[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ads")
    .select("ad_name")
    .eq("brand_id", brandId)
    .eq("campaign_name", campaignName)
    .eq("ad_set_name", adSetName)
    .in("status", ["pendente", "processando", "concluido"]);

  if (error) throw new Error(`Erro ao listar ads do ad set: ${error.message}`);
  return (data as { ad_name: string }[]).map((r) => r.ad_name);
}

export async function criarAd(input: CriarAdInput, userId: string, userName?: string): Promise<Ad> {
  const sb = getSupabase();

  // Verificar duplicata antes de inserir. Escopo: mesma brand + ad_name +
  // campaign + ad_set. Só bloqueia se o existente estiver em estado ativo
  // (pendente, processando, concluido). Se estiver em `erro`, permitimos
  // criar um novo — o usuário pode ter corrigido assets ou configuração e
  // está recriando. O Meta API não exige unicidade de ad_name.
  const { data: existente } = await sb
    .from("ads")
    .select("id, status")
    .eq("brand_id", input.brand_id)
    .eq("ad_name", input.ad_name)
    .eq("campaign_name", input.campaign_name)
    .eq("ad_set_name", input.ad_set_name)
    .in("status", ["pendente", "processando", "concluido"])
    .maybeSingle();

  if (existente) {
    const label =
      existente.status === "concluido"
        ? "ja foi subido para a Meta"
        : existente.status === "processando"
          ? "esta sendo processado"
          : "ja existe como rascunho";
    throw new Error(
      `O anuncio '${input.ad_name}' ${label} neste ad set. Edite o existente em vez de criar um novo.`
    );
  }

  // Usar override se fornecido, senão gerar UTM automaticamente
  const linkAnuncio = input.link_anuncio_override
    ?? (input.link_campanha
      ? gerarLinkAnuncio(input.link_campanha, input.ad_set_name, input.ad_name)
      : null);

  const { data: ad, error } = await sb
    .from("ads")
    .insert({
      brand_id: input.brand_id,
      type: input.type,
      campaign_name: input.campaign_name,
      campaign_id: input.campaign_id || null,
      ad_set_name: input.ad_set_name,
      ad_set_id: input.ad_set_id || null,
      ad_name: input.ad_name,
      texto_principal: input.texto_principal || null,
      titulo: input.titulo || null,
      descricao: input.descricao || null,
      cta: input.cta || "SHOP_NOW",
      link_campanha: input.link_campanha || null,
      link_anuncio: linkAnuncio,
      link_aux: input.link_aux || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao criar ad: ${error.message}`);

  // Inserir assets
  if (input.assets.length > 0) {
    const assetsData = input.assets.map((a, i) => ({
      ad_id: ad.id,
      placement: a.placement,
      asset_url: a.asset_url,
      asset_type: a.asset_type,
      sort_order: i,
    }));

    const { error: assetsError } = await sb.from("ad_assets").insert(assetsData);
    if (assetsError) throw new Error(`Erro ao inserir assets: ${assetsError.message}`);
  }

  // Audit log
  await registrarAudit({
    entity_type: "ad",
    entity_id: ad.id,
    action: "created",
    changes: null,
    user_id: userId,
    user_name: userName,
  });

  // Retornar ad completo com assets
  return (await buscarAd(ad.id))!;
}

export async function atualizarAd(
  id: string,
  input: AtualizarAdInput,
  userId: string,
  userName?: string
): Promise<Ad> {
  const sb = getSupabase();

  // Buscar estado anterior para diff
  const anterior = await buscarAd(id);
  if (!anterior) throw new Error("Ad não encontrado");

  const updateData: Record<string, unknown> = { ...input };

  // ── Consistência do link/UTM ────────────────────────────────
  // O link do anúncio embute o nome do ad set (utm_campaign) e o nome do
  // anúncio (utm_content). Se o usuário renomear o rascunho, o link precisa
  // ser regenerado a partir da base (link_campanha) para não continuar
  // apontando o nome antigo. Mas se o link tiver sido editado à mão,
  // respeitamos a escolha dele.
  const base = input.link_campanha ?? anterior.link_campanha;
  const novoAdSetName = input.ad_set_name ?? anterior.ad_set_name;
  const novoAdName = input.ad_name ?? anterior.ad_name;
  const nomeMudou =
    (input.ad_name !== undefined && input.ad_name !== anterior.ad_name) ||
    (input.ad_set_name !== undefined && input.ad_set_name !== anterior.ad_set_name);

  if (input.link_anuncio !== undefined) {
    // O editor sempre reenvia o link atual. Detectamos se ele foi customizado
    // comparando com o que geraríamos a partir dos nomes ANTIGOS: se bate, é
    // um link auto-gerado (seguro regenerar); se difere, o usuário editou.
    const linkAutoAntigo = base
      ? gerarLinkAnuncio(base, anterior.ad_set_name, anterior.ad_name)
      : "";
    const linkCustomizado =
      input.link_anuncio.trim() !== "" && input.link_anuncio !== linkAutoAntigo;

    if (nomeMudou && base && !linkCustomizado) {
      updateData.link_anuncio = gerarLinkAnuncio(base, novoAdSetName, novoAdName);
    }
    // caso contrário: mantém o link_anuncio recebido (custom ou inalterado)
  } else if (input.link_campanha !== undefined) {
    // Sem link_anuncio explícito: deriva do link_campanha informado.
    updateData.link_anuncio = gerarLinkAnuncio(input.link_campanha, novoAdSetName, novoAdName);
  } else if (nomeMudou && base) {
    // Só o nome mudou (nem link_anuncio nem link_campanha vieram no payload):
    // regenera a partir da base salva para manter a consistência.
    updateData.link_anuncio = gerarLinkAnuncio(base, novoAdSetName, novoAdName);
  }

  const { error } = await sb.from("ads").update(updateData).eq("id", id);
  if (error) throw new Error(`Erro ao atualizar ad: ${error.message}`);

  // Calcular diff para audit. Iteramos sobre updateData (e não input) para
  // que a regeneração do link_anuncio também apareça no histórico.
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, value] of Object.entries(updateData)) {
    const oldVal = (anterior as unknown as Record<string, unknown>)[key];
    if (oldVal !== value) {
      changes[key] = { old: oldVal, new: value };
    }
  }

  if (Object.keys(changes).length > 0) {
    await registrarAudit({
      entity_type: "ad",
      entity_id: id,
      action: "updated",
      changes,
      user_id: userId,
      user_name: userName,
    });
  }

  return (await buscarAd(id))!;
}

export async function atualizarStatusAd(
  id: string,
  status: StatusAd,
  meta?: {
    error_message?: string | null;
    meta_ad_id?: string | null;
    meta_creative_id?: string | null;
    meta_account_id?: string | null;
    meta_effective_status?: string | null;
  },
  userId?: string,
  userName?: string
): Promise<void> {
  const sb = getSupabase();

  // Importante: usar `!== undefined` para permitir setar explicitamente
  // null (limpar o campo). Antes só atualizava em truthy, então passar
  // null era silenciosamente ignorado — bug latente que travava retry
  // de ads em erro (meta_creative_id antigo persistia).
  const updateData: Record<string, unknown> = { status };
  if (meta?.error_message !== undefined) updateData.error_message = meta.error_message;
  if (meta?.meta_ad_id !== undefined) updateData.meta_ad_id = meta.meta_ad_id;
  if (meta?.meta_creative_id !== undefined) updateData.meta_creative_id = meta.meta_creative_id;
  if (meta?.meta_account_id !== undefined) updateData.meta_account_id = meta.meta_account_id;
  if (meta?.meta_effective_status !== undefined) updateData.meta_effective_status = meta.meta_effective_status;

  const { error } = await sb.from("ads").update(updateData).eq("id", id);
  if (error) throw new Error(`Erro ao atualizar status: ${error.message}`);

  const actionMap: Record<StatusAd, string> = {
    pendente: "updated",
    processando: "updated",
    concluido: "uploaded_to_meta",
    erro: "error",
  };

  await registrarAudit({
    entity_type: "ad",
    entity_id: id,
    action: actionMap[status],
    changes: {
      status: { old: undefined, new: status },
      ...(meta?.meta_ad_id ? { meta_ad_id: { old: null, new: meta.meta_ad_id } } : {}),
      ...(meta?.meta_creative_id ? { meta_creative_id: { old: null, new: meta.meta_creative_id } } : {}),
      ...(meta?.meta_account_id ? { meta_account_id: { old: null, new: meta.meta_account_id } } : {}),
      ...(meta?.error_message !== undefined ? { error_message: { old: null, new: meta.error_message } } : {}),
    },
    user_id: userId ?? "system",
    user_name: userName,
  });
}

export async function listarAdsSincronizaveis(tentativas = 3): Promise<Pick<Ad, "id" | "meta_ad_id" | "meta_account_id" | "status" | "meta_effective_status">[]> {
  const sb = getSupabase();

  for (let i = 0; i < tentativas; i++) {
    try {
      const { data, error } = await sb
        .from("ads")
        .select("id, meta_ad_id, meta_account_id, status, meta_effective_status")
        .not("meta_ad_id", "is", null);

      if (error) throw new Error(`Erro ao listar ads sincronizaveis: ${error.message}`);
      return data ?? [];
    } catch (e) {
      const isFetchError = e instanceof Error && e.message.includes("fetch failed");
      if (isFetchError && i < tentativas - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw e;
    }
  }

  return [];
}

export async function atualizarMetaEffectiveStatus(
  id: string,
  metaEffectiveStatus: string,
  statusLocal?: StatusAd,
  errorMessage?: string,
  tentativas = 3
): Promise<void> {
  const sb = getSupabase();
  const updateData: Record<string, unknown> = { meta_effective_status: metaEffectiveStatus };
  if (statusLocal) updateData.status = statusLocal;
  if (errorMessage !== undefined) updateData.error_message = errorMessage;

  for (let i = 0; i < tentativas; i++) {
    try {
      const { error } = await sb.from("ads").update(updateData).eq("id", id);
      if (error) throw new Error(`Erro ao atualizar meta_effective_status: ${error.message}`);
      return;
    } catch (e) {
      const isFetchError = e instanceof Error && e.message.includes("fetch failed");
      if (isFetchError && i < tentativas - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
}

export async function atualizarMetaAssetId(
  assetId: string,
  metaAssetId: string
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("ad_assets")
    .update({ meta_asset_id: metaAssetId })
    .eq("id", assetId);

  if (error) throw new Error(`Erro ao atualizar meta_asset_id: ${error.message}`);
}

// ─── Excluir Ad (apenas drafts não subidos) ────────────────

export async function excluirAd(
  id: string,
  userId?: string,
  userName?: string
): Promise<void> {
  const sb = getSupabase();

  const ad = await buscarAd(id);
  if (!ad) throw new Error("Ad não encontrado");
  if (ad.status === "concluido") throw new Error("Não é possível excluir um anúncio já subido para a Meta.");
  if (ad.status === "processando") throw new Error("Não é possível excluir um anúncio em processamento.");

  const { error } = await sb.from("ads").delete().eq("id", id);
  if (error) throw new Error(`Erro ao excluir anúncio: ${error.message}`);

  await registrarAudit({
    entity_type: "ad",
    entity_id: id,
    action: "deleted",
    changes: { ad_name: { old: ad.ad_name, new: null }, status: { old: ad.status, new: 'deleted' } },
    user_id: userId ?? "system",
    user_name: userName,
  });
}

// ─── Audit Log ──────────────────────────────────────────────

interface RegistrarAuditInput {
  entity_type: string;
  entity_id: string;
  action: string;
  changes: Record<string, unknown> | null;
  user_id: string;
  user_name?: string;
}

async function registrarAudit(input: RegistrarAuditInput): Promise<void> {
  const sb = getSupabase();
  await sb.from("audit_log").insert({
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    action: input.action,
    changes: input.changes,
    user_id: input.user_id,
    user_name: input.user_name || null,
  });
}

export async function listarAuditLog(filtros: {
  entity_id?: string;
  entity_type?: string;
  user_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: AuditEntry[]; total: number }> {
  const sb = getSupabase();

  let query = sb
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filtros.entity_id) query = query.eq("entity_id", filtros.entity_id);
  if (filtros.entity_type) query = query.eq("entity_type", filtros.entity_type);
  if (filtros.user_id) query = query.eq("user_id", filtros.user_id);

  const limit = filtros.limit ?? 50;
  const offset = filtros.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Erro ao listar audit log: ${error.message}`);
  return { entries: data as AuditEntry[], total: count ?? 0 };
}

// ─── Export helper ──────────────────────────────────────────

export async function exportarAds(filtros: FiltrosAd = {}): Promise<Ad[]> {
  const sb = getSupabase();

  let query = sb
    .from("ads")
    .select("*, ad_assets(*)")
    .order("created_at", { ascending: false });

  if (filtros.brand_id) query = query.eq("brand_id", filtros.brand_id);
  if (filtros.status) query = query.eq("status", filtros.status);
  if (filtros.type) query = query.eq("type", filtros.type);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao exportar ads: ${error.message}`);
  return data as Ad[];
}
