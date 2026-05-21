-- =====================================================================
-- Performance · 35 índices FK faltantes (auditoria 2026-05-21)
-- =====================================================================
-- Regra Postgres: toda FK precisa de índice na coluna filha · evita
-- full scan em JOINs + locks em DELETE/UPDATE da tabela pai.
--
-- 73% das FKs do sistema já têm índice. Esta migration cobre os 27%
-- restantes priorizando alta volume (kids_checkins, vol_inscricoes,
-- nsm_eventos, dados_brutos) e médio volume (mem_*, pcs_progressoes).
--
-- Idempotente · `CREATE INDEX IF NOT EXISTS`.
-- =====================================================================

-- =====================================================================
-- 🔴 ALTA PRIORIDADE · 16 índices em tabelas de alto volume
-- =====================================================================

-- cultos_decisoes_pessoas
CREATE INDEX IF NOT EXISTS idx_cultos_decisoes_pessoas_registrado_por
  ON public.cultos_decisoes_pessoas(registrado_por);

-- kids_checkins (HIGH VOLUME durante culto)
CREATE INDEX IF NOT EXISTS idx_kids_checkins_responsavel_checkin
  ON public.kids_checkins(responsavel_checkin_id);
CREATE INDEX IF NOT EXISTS idx_kids_checkins_checkin_por
  ON public.kids_checkins(checkin_por);
CREATE INDEX IF NOT EXISTS idx_kids_checkins_responsavel_checkout
  ON public.kids_checkins(responsavel_checkout_id);
CREATE INDEX IF NOT EXISTS idx_kids_checkins_checkout_por
  ON public.kids_checkins(checkout_por);
CREATE INDEX IF NOT EXISTS idx_kids_checkins_override_aprovado_por
  ON public.kids_checkins(override_aprovado_por);
CREATE INDEX IF NOT EXISTS idx_kids_checkins_decisao_jesus_marcada_por
  ON public.kids_checkins(decisao_jesus_marcada_por);
CREATE INDEX IF NOT EXISTS idx_kids_checkins_sala_id
  ON public.kids_checkins(sala_id);
CREATE INDEX IF NOT EXISTS idx_kids_checkins_estacao_checkin
  ON public.kids_checkins(estacao_checkin_id);

-- vol_inscricoes (voluntariado)
CREATE INDEX IF NOT EXISTS idx_vol_inscricoes_membro
  ON public.vol_inscricoes(membro_id);
CREATE INDEX IF NOT EXISTS idx_vol_inscricoes_vol_profile
  ON public.vol_inscricoes(vol_profile_id);
CREATE INDEX IF NOT EXISTS idx_vol_inscricoes_visitante
  ON public.vol_inscricoes(visitante_id);

-- nsm_eventos (jornada NSM · joins diários no painel)
CREATE INDEX IF NOT EXISTS idx_nsm_eventos_membro
  ON public.nsm_eventos(membro_id);
CREATE INDEX IF NOT EXISTS idx_nsm_eventos_visitante
  ON public.nsm_eventos(visitante_id);

-- dados_brutos (coleta KPI)
CREATE INDEX IF NOT EXISTS idx_dados_brutos_tipo_id
  ON public.dados_brutos(tipo_id);
CREATE INDEX IF NOT EXISTS idx_dados_brutos_registrado_por
  ON public.dados_brutos(registrado_por);

-- kpi_valores_calculados (cache de cálculos)
CREATE INDEX IF NOT EXISTS idx_kpi_valores_calculados_kpi_id
  ON public.kpi_valores_calculados(kpi_id);

-- =====================================================================
-- 🟡 MÉDIA PRIORIDADE · 19 índices em tabelas de volume médio
-- =====================================================================

-- mem_contribuicoes (histórico financeiro)
CREATE INDEX IF NOT EXISTS idx_mem_contribuicoes_membro
  ON public.mem_contribuicoes(membro_id);

-- mem_grupo_membros (participação em grupos)
CREATE INDEX IF NOT EXISTS idx_mem_grupo_membros_grupo_id
  ON public.mem_grupo_membros(grupo_id);
CREATE INDEX IF NOT EXISTS idx_mem_grupo_membros_membro_id
  ON public.mem_grupo_membros(membro_id);

-- mem_grupo_encontros
CREATE INDEX IF NOT EXISTS idx_mem_grupo_encontros_grupo_id
  ON public.mem_grupo_encontros(grupo_id);
CREATE INDEX IF NOT EXISTS idx_mem_grupo_encontros_membro_id
  ON public.mem_grupo_encontros(membro_id);

-- kids_criancas
CREATE INDEX IF NOT EXISTS idx_kids_criancas_familia_id
  ON public.kids_criancas(familia_id) WHERE familia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kids_criancas_created_by
  ON public.kids_criancas(created_by);

-- kids_responsaveis
CREATE INDEX IF NOT EXISTS idx_kids_responsaveis_crianca_id
  ON public.kids_responsaveis(crianca_id);
CREATE INDEX IF NOT EXISTS idx_kids_responsaveis_membro_id
  ON public.kids_responsaveis(membro_id);

-- kids_salas
CREATE INDEX IF NOT EXISTS idx_kids_salas_igreja_id
  ON public.kids_salas(igreja_id) WHERE igreja_id IS NOT NULL;

-- kids_sessoes
CREATE INDEX IF NOT EXISTS idx_kids_sessoes_culto_id
  ON public.kids_sessoes(culto_id);
CREATE INDEX IF NOT EXISTS idx_kids_sessoes_encerrada_por
  ON public.kids_sessoes(encerrada_por);

-- kids_estacoes
CREATE INDEX IF NOT EXISTS idx_kids_estacoes_sala_id
  ON public.kids_estacoes(sala_id) WHERE sala_id IS NOT NULL;

-- mem_escalas
CREATE INDEX IF NOT EXISTS idx_mem_escalas_membro_id
  ON public.mem_escalas(membro_id);
CREATE INDEX IF NOT EXISTS idx_mem_escalas_ministerio_id
  ON public.mem_escalas(ministerio_id);

-- pcs_progressoes (histórico salarial · LGPD)
CREATE INDEX IF NOT EXISTS idx_pcs_progressoes_funcionario_id
  ON public.pcs_progressoes(funcionario_id);
