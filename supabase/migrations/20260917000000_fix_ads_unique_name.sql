-- Corrige o escopo da unicidade de nome de anuncio.
--
-- O indice antigo era ON ads(brand_id, ad_name, campaign_name): ignorava o ad
-- set e o status. Consequencias:
--   1. Duplicar/editar um anuncio e salva-lo em uma campanha que ja tem outro
--      anuncio com o mesmo nome (mesmo em ad set diferente) estourava
--      "duplicate key value violates unique constraint idx_ads_unique_name".
--   2. Fan-out do lote (mesmo criativo para varios ad sets da mesma campanha)
--      falhava no insert.
--   3. Rascunhos em `erro` continuavam reservando o nome, contrariando a regra
--      de `criarAd`, que so bloqueia nomes em uso ativo.
--
-- O novo indice espelha exatamente a checagem de `criarAd` em src/lib/db.ts:
-- brand + campanha + ad set + nome, apenas para status ativos.
DROP INDEX IF EXISTS idx_ads_unique_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_unique_name
  ON ads(brand_id, campaign_name, ad_set_name, ad_name)
  WHERE status IN ('pendente', 'processando', 'concluido');
