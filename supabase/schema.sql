-- ===========================================================
-- Claudinho – Schema Supabase (PostgreSQL)
-- ===========================================================

-- Marcas / contas Meta
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  meta_account_id TEXT NOT NULL,
  meta_page_id TEXT NOT NULL,
  sheet_name TEXT,
  clickup_list_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO brands (name, meta_account_id, meta_page_id, sheet_name, clickup_list_id) VALUES
  ('Evino',    'act_775254035944122',  '250970455039152', 'Evino_Anuncios_Novos',    '11430929'),
  ('GrandCru', 'act_1020013451372159', '211248702248642', 'GrandCru_Anuncios_Novos', '901103289485');

-- Anuncios
CREATE TABLE ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('video', 'image')),

  campaign_name TEXT NOT NULL,
  campaign_id TEXT,
  ad_set_name TEXT NOT NULL,
  ad_set_id TEXT,
  ad_name TEXT NOT NULL,

  texto_principal TEXT,
  titulo TEXT,
  descricao TEXT,
  cta TEXT DEFAULT 'SHOP_NOW',

  link_campanha TEXT,
  link_anuncio TEXT,          -- UTM completo (auto-gerado)
  link_aux TEXT,              -- referencia interna do time

  status TEXT DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
  error_message TEXT,

  meta_ad_id TEXT,
  meta_creative_id TEXT,
  meta_account_id TEXT,
  meta_effective_status TEXT,

  created_by TEXT,            -- clerk user ID
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Assets dos anuncios (imagens / videos)
CREATE TABLE ad_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID REFERENCES ads(id) ON DELETE CASCADE NOT NULL,
  placement TEXT NOT NULL,    -- 'feed', 'stories', 'reels', 'video_principal'
  asset_url TEXT NOT NULL,    -- URL publica (Cloudinary ou Drive)
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'video')),
  meta_asset_id TEXT,         -- hash/id apos upload na Meta
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Log de auditoria
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- 'ad', 'ad_asset', etc
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,       -- 'created', 'updated', 'uploaded_to_meta', 'error', 'imported'
  changes JSONB,              -- { campo: { old: X, new: Y } }
  user_id TEXT NOT NULL,      -- clerk user ID
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ads_brand ON ads(brand_id);
CREATE INDEX idx_ads_status ON ads(status);
CREATE INDEX idx_ads_type ON ads(type);
CREATE INDEX idx_ads_campaign ON ads(campaign_name);
CREATE INDEX idx_ads_created ON ads(created_at DESC);
CREATE INDEX idx_ad_assets_ad ON ad_assets(ad_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_meta_ad_id ON ads(meta_ad_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_unique_name ON ads(brand_id, ad_name, campaign_name);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ads_updated_at
  BEFORE UPDATE ON ads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
