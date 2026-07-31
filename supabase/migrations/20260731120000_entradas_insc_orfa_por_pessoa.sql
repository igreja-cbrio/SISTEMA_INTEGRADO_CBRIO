-- ============================================================================
-- Entradas · a fila de inscrição órfã dedupa por PESSOA, não por candidato
-- ============================================================================
-- A fila `inscricao_sem_vinculo` (20260730170000) reusou o UNIQUE parcial
-- histórico `uniq_identidade_pendencia_aberta (tipo, membro_id,
-- membro_conflito_id) WHERE status='pendente'`. Para os 3 tipos antigos isso é
-- correto (a pendência FALA de um par de cadastros). Para este tipo, não: a
-- pendência fala de uma PESSOA ÓRFÃ (que não tem cadastro) e aponta um
-- candidato — e duas pessoas órfãs diferentes podem apontar o MESMO candidato.
--
-- MEDIDO em produção (31/07): das 195 pessoas com candidato, 5 colapsaram no
-- UNIQUE → 190 candidatos distintos, 189 gravados. A pessoa perdida
-- desaparecia da fila **sem nenhum registro**, e em todas as 3 colisões que
-- abri a evidência que SOBREVIVEU foi a mais fraca (nome exato), porque quem
-- ganhava era a ordem de inserção — incluindo um caso cuja alternativa era
-- telefone+nome e outro cuja inscrição trazia CPF. Dedup nunca deve rebaixar
-- prova.
--
-- Junto: `origem_id` deste tipo passa a guardar a CHAVE DA PESSOA
-- (`cpf:<11>` / `tel:<ddd+numero>` / `nome:<normalizado>` / `ref:<uuid>`), o
-- que faz o clique em "Ligar ao cadastro" resolver TODAS as linhas daquela
-- pessoa (eram 20 linhas de 18 pessoas que ficavam órfãs e sem pendência
-- depois do clique).
--
-- Aditiva no schema (nenhuma coluna/tabela nova). A PARTE 3 apaga as 189
-- pendências pendentes deste tipo — nenhuma foi triada (conferido: 0 linhas
-- com status <> 'pendente'), então nada de decisão humana é perdido; elas são
-- recriadas pelo script `_entradas_inscricao_sem_vinculo.cjs --exec` já no
-- formato por pessoa.
-- ============================================================================

SET lock_timeout = '10s';

-- ── PARTE 1 · o UNIQUE histórico deixa de valer para este tipo ──────────────
-- Recriado com o MESMO nome, colunas e NULLS NOT DISTINCT — só o predicado
-- ganha a exclusão. Os 3 tipos antigos (cpf_conflito, cpf_divergente,
-- vinculo_divergente) e o histórico cpf_para_confirmar seguem deduplicando por
-- par de cadastros, exatamente como antes.
DROP INDEX IF EXISTS public.uniq_identidade_pendencia_aberta;
CREATE UNIQUE INDEX uniq_identidade_pendencia_aberta
  ON public.identidade_pendencias (tipo, membro_id, membro_conflito_id)
  NULLS NOT DISTINCT
  WHERE status = 'pendente' AND tipo <> 'inscricao_sem_vinculo';

-- ── PARTE 2 · 1 pendência ABERTA por pessoa órfã ────────────────────────────
-- A chave é (tipo, origem_id) e NÃO inclui membro_id: se a mesma pessoa órfã
-- fosse enfileirada duas vezes apontando candidatos diferentes, seriam duas
-- decisões sobre a MESMA pessoa — que é justamente o trabalho duplicado que a
-- fila existe pra evitar. Reenfileirar é no-op (23505 engolido pelo script).
DROP INDEX IF EXISTS public.uniq_identidade_pendencia_insc_orfa;
CREATE UNIQUE INDEX uniq_identidade_pendencia_insc_orfa
  ON public.identidade_pendencias (tipo, origem_id)
  WHERE status = 'pendente' AND tipo = 'inscricao_sem_vinculo';

COMMENT ON COLUMN public.identidade_pendencias.origem_id IS
  'id da linha de origem (quando houver). ⚠️ EXCEÇÃO em tipo=inscricao_sem_vinculo: guarda a CHAVE DA PESSOA órfã (cpf:… | tel:… | nome:… | ref:<uuid>) derivada por services/inscricaoOrfas.chavePessoa — é o agrupador das N linhas de inscrição daquela pessoa, e o UNIQUE parcial uniq_identidade_pendencia_insc_orfa garante 1 decisão por pessoa.';

-- ── PARTE 3 · limpa a fila do formato antigo (nada triado) ──────────────────
-- Guarda explícita: se alguém já tiver triado uma linha deste tipo, ABORTA —
-- decisão humana não é apagada por conveniência de migration.
DO $$
DECLARE
  v_triadas INT;
  v_antigas INT;
BEGIN
  SELECT count(*) INTO v_triadas
    FROM public.identidade_pendencias
   WHERE tipo = 'inscricao_sem_vinculo' AND status <> 'pendente';

  IF v_triadas > 0 THEN
    RAISE EXCEPTION 'Existem % pendencias inscricao_sem_vinculo JA TRIADAS. Nao apago a fila: reavalie o re-enfileiramento a mao.', v_triadas;
  END IF;

  -- Só o formato antigo (origem_id = uuid da linha). Se a migration rodar duas
  -- vezes, a 2ª não apaga as pendências novas (chave `cpf:`/`tel:`/`nome:`).
  DELETE FROM public.identidade_pendencias
   WHERE tipo = 'inscricao_sem_vinculo'
     AND status = 'pendente'
     AND origem_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  GET DIAGNOSTICS v_antigas = ROW_COUNT;

  RAISE NOTICE 'Fila antiga removida: % pendencia(s). Rode agora: node backend/scripts/_entradas_inscricao_sem_vinculo.cjs --exec', v_antigas;
END $$;

-- ── Conferência (depois de re-enfileirar) ────────────────────────────────────
--   SELECT count(*) FILTER (WHERE origem_id LIKE 'cpf:%')  AS por_cpf,
--          count(*) FILTER (WHERE origem_id LIKE 'tel:%')  AS por_telefone,
--          count(*) FILTER (WHERE origem_id LIKE 'nome:%') AS por_nome,
--          count(*) AS total
--     FROM public.identidade_pendencias
--    WHERE tipo = 'inscricao_sem_vinculo' AND status = 'pendente';
-- Esperado: ~195 no total (as 5 pessoas que o UNIQUE antigo colapsava voltam).
