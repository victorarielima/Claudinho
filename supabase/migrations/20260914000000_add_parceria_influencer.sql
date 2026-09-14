-- Anúncios de parceria (influencer): quando o vídeo é de um criador, o
-- creative precisa levar o parceiro em `branded_content.partners`. Guardamos
-- o IG user id do criador (usado no payload) e o @ (usado só para exibição).
ALTER TABLE ads ADD COLUMN IF NOT EXISTS parceria_ig_user_id TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS parceria_username TEXT;
