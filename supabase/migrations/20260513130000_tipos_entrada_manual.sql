-- ============================================================================
-- Flag entrada_manual em tipos_dado_bruto
--
-- Marcos: "nao devemos ter essa aba de voluntarios ativos (isso deve vir
--          direto do modulo de voluntariado, nao se deve lancar os dados
--          financeiros, eles vem direto do modulo financeiro com conciliacao
--          bancaria e nao precisa lancar as nps, tudo que for nps deve vir
--          automatico"
--
-- Regra: tipos com entrada_manual=false NUNCA aparecem na UI de lancamento
-- (/dados-brutos e /meus-kpis). Eles sao alimentados por outros modulos.
--
-- Categorias automaticas:
-- - NPS (modulo /nps via sincronizarKpi)
-- - Financeiro (modulo Generosidade com conciliacao bancaria)
-- - Voluntariado (modulo Voluntariado · ativos/inativos/checkin/treinamento)
-- - Cultos (auto-collector via vw_culto_stats)
-- - Devocional (modulo App de devocional)
-- - NEXT (modulo NEXT)
-- - Membresia (mem_grupos / mem_grupo_membros)
-- ============================================================================

ALTER TABLE public.tipos_dado_bruto
  ADD COLUMN IF NOT EXISTS entrada_manual boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tipos_dado_bruto.entrada_manual IS
  'Se true, aparece em /dados-brutos e /meus-kpis pra lancamento manual. Se false, dado e populado pelo modulo correspondente.';

-- ----------------------------------------------------------------------------
-- Marca como automaticos (entrada_manual=false)
-- ----------------------------------------------------------------------------
UPDATE public.tipos_dado_bruto SET entrada_manual = false
 WHERE id IN (
   -- NPS · vem do modulo /nps via sincronizarKpi
   'nps_geral', 'nps_next', 'nps_lideres', 'nps_voluntarios', 'nps_culto',
   'satisfacao_lideres', 'satisfacao_voluntarios',

   -- Financeiro · vem do modulo Generosidade (mem_contribuicoes + conciliacao)
   'doacoes_valor', 'doadores_count', 'doadores_recorrentes', 'doacoes_qualidade',
   'financeiro_despesas_orcamento_pct', 'financeiro_reserva_caixa_pct',
   'financeiro_prazos_pagamento_pct',

   -- Voluntariado · vem do modulo Voluntariado
   'voluntarios_ativos', 'voluntarios_inativos_3m', 'voluntarios_inativos',
   'voluntarios_recuperados', 'voluntarios_checkin', 'voluntarios_treinamento',
   'voluntarios_alocados',
   'solicitacoes_servir_recebidas', 'solicitacoes_servir_alocadas',

   -- Cultos · vem de vw_culto_stats (auto-collector)
   'frequencia_culto', 'conversoes', 'batismos',

   -- Devocional · modulo App de devocional
   'devocionais',

   -- NEXT · modulo NEXT
   'frequencia_next', 'inscricoes_jornada180',

   -- Grupos/Membresia · vem de mem_grupo_membros
   'frequencia_grupos', 'grupos_ativos', 'lideres_grupos'
 );

-- ----------------------------------------------------------------------------
-- Tipos que permanecem manuais (entrada_manual=true por default):
-- - lideres_acompanhados, lideres_treinados (ate ter modulo Lideres)
-- - solicitacoes_capelania, solicitacoes_capelania_recebidas
-- - solicitacoes_aconselh, solicitacoes_aconselhamento_recebidas
-- - novos_convertidos_atend (ate ter modulo Cuidados)
-- - rh_q12_nota, rh_engajamento_treinamentos_pct, rh_rotatividade_pct
-- - infra_cronogramas_pct, infra_orcamentos_pct
-- ----------------------------------------------------------------------------

-- Conferencia:
-- SELECT entrada_manual, count(*) FROM tipos_dado_bruto WHERE ativo
--  GROUP BY entrada_manual;
-- Espera: ~30 false (automaticos), ~10 true (manuais)
-- ============================================================================
