-- Add per-brand ClickUp list binding
ALTER TABLE brands ADD COLUMN IF NOT EXISTS clickup_list_id TEXT;

UPDATE brands SET clickup_list_id = '11430929'     WHERE name = 'Evino'    AND clickup_list_id IS NULL;
UPDATE brands SET clickup_list_id = '901103289485' WHERE name = 'GrandCru' AND clickup_list_id IS NULL;
