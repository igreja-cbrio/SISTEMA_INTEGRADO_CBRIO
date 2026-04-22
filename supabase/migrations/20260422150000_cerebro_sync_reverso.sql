-- Cerebro CBRio — sync reverso: ERP → vault Obsidian (SharePoint)
-- Idempotente, backwards-compatible. O backend tolera ausência destas tabelas.

-- ── Índice de entidades já materializadas como notas no vault ────────
CREATE TABLE IF NOT EXISTS public.cerebro_entidades_indice (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  note_path TEXT NOT NULL,
  note_hash TEXT,
  vault_item_id TEXT,
  sharepoint_url TEXT,
  titulo TEXT,
  area_vault TEXT,
  criada_em TIMESTAMPTZ DEFAULT NOW(),
  atualizada_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_cerebro_entidades_type
  ON public.cerebro_entidades_indice (entity_type);

CREATE INDEX IF NOT EXISTS idx_cerebro_entidades_entity
  ON public.cerebro_entidades_indice (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_cerebro_entidades_area
  ON public.cerebro_entidades_indice (area_vault);

-- ── Fila de sync ERP → vault (processada por cron) ───────────────────
CREATE TABLE IF NOT EXISTS public.cerebro_sync_fila (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'upsert'
    CHECK (action IN ('upsert', 'delete')),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
  tentativas INT NOT NULL DEFAULT 0,
  erro_mensagem TEXT,
  payload JSONB,
  enfileirado_em TIMESTAMPTZ DEFAULT NOW(),
  processado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cerebro_sync_fila_status
  ON public.cerebro_sync_fila (status, enfileirado_em);

CREATE INDEX IF NOT EXISTS idx_cerebro_sync_fila_entity
  ON public.cerebro_sync_fila (entity_type, entity_id);

-- Dedup: se já existe item pendente/processando para a mesma entidade, não enfileirar de novo.
-- (implementado via código no cerebroSync.enqueue, não via constraint pra permitir re-enqueues legítimos)

COMMENT ON TABLE public.cerebro_entidades_indice IS
  'Mapeia cada registro do ERP que virou nota no vault Obsidian (SharePoint).';
COMMENT ON TABLE public.cerebro_sync_fila IS
  'Fila de sincronização ERP → Cérebro. Consumida pelo cron /api/cerebro/sync-erp.';
