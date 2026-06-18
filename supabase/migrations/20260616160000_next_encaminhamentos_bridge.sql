-- ============================================================================
-- Fase 2 Next-Batismo · ponte Next → jornada_encaminhamentos
--
-- Convergir o roteamento do Next pra a caixa unificada de encaminhamentos (a
-- mesma que Grupos/Voluntariado já trabalham, com devolutiva engajou/sem_interesse
-- e "engajou" materializando o vínculo real na NSM). Hoje o Next gravava só em
-- next_indicacoes (silo sem devolutiva, dead-end pra NSM).
--
-- Escopo: convergem os destinos que JÁ têm caixa + materialização:
--   grupo  → destino 'grupos'      (valor conectar)
--   servir → destino 'voluntarios' (valor servir)
-- NÃO convergem (seguem só em next_indicacoes · sem caixa consumidora ainda):
--   batismo → Integração tem fluxo próprio (batismo_inscricoes)
--   dízimo  → generosidade não tem módulo/caixa
--
-- `origem` já é texto livre (default 'cuidados') → uso 'next' sem mudar CHECK.
-- `destino` grupos/voluntarios já são válidos → sem CHECK novo.
-- Só falta ligar a inscrição do Next ao encaminhamento (dedup idempotente +
-- back-link pro /next + sync da devolutiva terminal pro next_indicacoes).
-- ADITIVA · idempotente.
-- ============================================================================

ALTER TABLE public.jornada_encaminhamentos
  ADD COLUMN IF NOT EXISTS next_inscricao_id uuid
    REFERENCES public.next_inscricoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jornada_enc_next_insc_idx
  ON public.jornada_encaminhamentos (next_inscricao_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.jornada_encaminhamentos.next_inscricao_id IS
  'Fase 2 · inscrição do Next que originou o encaminhamento (origem=next). Dedup por (next_inscricao_id, destino) + back-link + sync da devolutiva terminal pro next_indicacoes.';

-- Conferência:
--   SELECT origem, destino, count(*) FROM jornada_encaminhamentos GROUP BY 1,2;
--   SELECT * FROM jornada_encaminhamentos WHERE origem = 'next' LIMIT 20;
-- ============================================================================
