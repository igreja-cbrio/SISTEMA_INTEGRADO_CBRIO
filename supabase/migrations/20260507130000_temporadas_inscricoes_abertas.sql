-- Adiciona flag de inscricoes abertas em cada temporada.
-- Default: false (fechado). Admin abre quando comeca o periodo de inscricao
-- e fecha quando termina.

ALTER TABLE public.mem_temporadas
  ADD COLUMN IF NOT EXISTS inscricoes_abertas boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mem_temporadas.inscricoes_abertas IS 'Se true, o formulario publico de inscricao em grupo aceita novos pedidos. Se false, retorna 403.';
