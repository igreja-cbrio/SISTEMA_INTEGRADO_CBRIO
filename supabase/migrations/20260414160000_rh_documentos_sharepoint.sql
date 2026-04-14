-- Adiciona colunas para rastrear arquivos de RH no SharePoint
ALTER TABLE rh_documentos ADD COLUMN IF NOT EXISTS sharepoint_url text;
ALTER TABLE rh_documentos ADD COLUMN IF NOT EXISTS sharepoint_item_id text;
