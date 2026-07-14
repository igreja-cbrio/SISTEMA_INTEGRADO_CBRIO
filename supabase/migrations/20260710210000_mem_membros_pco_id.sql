-- Adiciona planning_center_id (Person ID do Planning Center) em mem_membros.
-- Coluna aditiva para futura reconciliacao PCO x membresia. Nao preenche valores agora.
ALTER TABLE mem_membros
  ADD COLUMN IF NOT EXISTS planning_center_id text;

-- Unicidade parcial: cada Person ID do PCO mapeia para no maximo um membro,
-- mas permite multiplos membros sem PCO (NULL).
CREATE UNIQUE INDEX IF NOT EXISTS mem_membros_planning_center_id_uidx
  ON mem_membros (planning_center_id)
  WHERE planning_center_id IS NOT NULL;
