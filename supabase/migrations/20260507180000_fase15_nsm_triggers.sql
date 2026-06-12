-- ============================================================================
-- FASE 1.5 · Triggers que alimentam nsm_eventos
--
-- Quando alguem com decisao registrada (int_visitantes.fez_decisao=true)
-- engaja em algum dos 5 valores, dispara trigger que insere em nsm_eventos.
-- A funcao recalcular_nsm() entao consolida nsm_estado.
--
-- Mapeamento valor → tabela de origem:
--   seguir       → mem_trilha_valores (etapa='batismo' AND concluida=true)
--   conectar     → mem_grupo_membros INSERT (entrou em grupo)
--   investir     → mem_devocionais INSERT (registrou devocional)
--   servir       → mem_voluntarios INSERT (comecou a servir)
--   generosidade → mem_contribuicoes INSERT (primeira doacao)
--
-- Linkagem int_visitantes ↔ mem_membros: por CPF (ambos usam cpf como chave).
-- Sem CPF coincidente, evento nao eh registrado (ok — pessoa nao esta no
-- funil NSM).
--
-- 1 evento NSM por (pessoa, valor) — primeiro engajamento conta.
-- Constraint UNIQUE garante isso. Triggers usam ON CONFLICT DO NOTHING.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Constraint de unicidade (1 evento por pessoa+valor)
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS nsm_eventos_pessoa_valor_uq ON public.nsm_eventos
  (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado);

-- ----------------------------------------------------------------------------
-- 2. Funcao helper: nsm_inserir_evento(membro, valor, origem)
--    - Busca CPF do membro
--    - Procura int_visitantes com mesma CPF e fez_decisao=true (mais recente)
--    - Se encontrar, insere evento com data_decisao
--    - Se nao encontrar, ignora (pessoa nao esta no funil de conversao)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nsm_inserir_evento(
  p_membro_id uuid,
  p_valor text,
  p_origem text,
  p_origem_id uuid DEFAULT NULL,
  p_data_engajamento date DEFAULT CURRENT_DATE
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decisao_data date;
  v_membro_cpf text;
  v_membro_nome text;
  v_igreja_id uuid;
  v_visitante_id uuid;
BEGIN
  -- 1. Busca dados do membro
  SELECT cpf, nome, igreja_id
    INTO v_membro_cpf, v_membro_nome, v_igreja_id
    FROM public.mem_membros
   WHERE id = p_membro_id;

  IF v_membro_cpf IS NULL OR v_membro_cpf = '' THEN
    -- Sem CPF, nao da pra linkar com int_visitantes — sai silenciosamente
    RETURN;
  END IF;

  -- 2. Busca decisao mais recente em int_visitantes
  SELECT id, data_visita
    INTO v_visitante_id, v_decisao_data
    FROM public.int_visitantes
   WHERE cpf = v_membro_cpf
     AND fez_decisao = true
   ORDER BY data_visita DESC
   LIMIT 1;

  IF v_decisao_data IS NULL THEN
    -- Nao tem decisao registrada → nao entra no funil NSM
    RETURN;
  END IF;

  -- 3. Insere (ON CONFLICT DO NOTHING — primeiro engajamento por valor conta)
  INSERT INTO public.nsm_eventos (
    membro_id, visitante_id, cpf, nome, igreja_id,
    data_decisao, valor_engajado, data_engajamento,
    origem, origem_id
  ) VALUES (
    p_membro_id, v_visitante_id, v_membro_cpf, v_membro_nome, v_igreja_id,
    v_decisao_data, p_valor, p_data_engajamento,
    p_origem, p_origem_id
  )
  ON CONFLICT (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nsm_inserir_evento(uuid, text, text, uuid, date) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. TRIGGER: mem_trilha_valores → seguir (quando etapa='batismo' concluida)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_nsm_trilha_seguir()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- So dispara em batismo concluido
  IF NEW.etapa = 'batismo' AND NEW.concluida = true THEN
    PERFORM public.nsm_inserir_evento(
      NEW.membro_id,
      'seguir',
      'mem_trilha_valores:batismo',
      NEW.id,
      COALESCE(NEW.data_conclusao, CURRENT_DATE)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_nsm_trilha_seguir ON public.mem_trilha_valores;
CREATE TRIGGER tg_nsm_trilha_seguir
  AFTER INSERT OR UPDATE OF concluida, etapa ON public.mem_trilha_valores
  FOR EACH ROW EXECUTE FUNCTION public.tg_nsm_trilha_seguir();

-- ----------------------------------------------------------------------------
-- 4. TRIGGER: mem_devocionais → investir
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_nsm_devocional_investir()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.concluida = true THEN
    PERFORM public.nsm_inserir_evento(
      NEW.membro_id,
      'investir',
      'mem_devocionais',
      NEW.id,
      NEW.data_devocional
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_nsm_devocional_investir ON public.mem_devocionais;
CREATE TRIGGER tg_nsm_devocional_investir
  AFTER INSERT ON public.mem_devocionais
  FOR EACH ROW EXECUTE FUNCTION public.tg_nsm_devocional_investir();

-- ----------------------------------------------------------------------------
-- 5. TRIGGER: mem_grupo_membros → conectar
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_nsm_grupo_conectar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nsm_inserir_evento(
    NEW.membro_id,
    'conectar',
    'mem_grupo_membros',
    NEW.id,
    NEW.entrou_em
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_nsm_grupo_conectar ON public.mem_grupo_membros;
CREATE TRIGGER tg_nsm_grupo_conectar
  AFTER INSERT ON public.mem_grupo_membros
  FOR EACH ROW EXECUTE FUNCTION public.tg_nsm_grupo_conectar();

-- ----------------------------------------------------------------------------
-- 6. TRIGGER: mem_voluntarios → servir
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_nsm_voluntario_servir()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nsm_inserir_evento(
    NEW.membro_id,
    'servir',
    'mem_voluntarios',
    NEW.id,
    NEW.desde
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_nsm_voluntario_servir ON public.mem_voluntarios;
CREATE TRIGGER tg_nsm_voluntario_servir
  AFTER INSERT ON public.mem_voluntarios
  FOR EACH ROW EXECUTE FUNCTION public.tg_nsm_voluntario_servir();

-- ----------------------------------------------------------------------------
-- 7. TRIGGER: mem_contribuicoes → generosidade
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_nsm_contribuicao_generosidade()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nsm_inserir_evento(
    NEW.membro_id,
    'generosidade',
    'mem_contribuicoes:' || NEW.tipo,
    NEW.id,
    NEW.data
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_nsm_contribuicao_generosidade ON public.mem_contribuicoes;
CREATE TRIGGER tg_nsm_contribuicao_generosidade
  AFTER INSERT ON public.mem_contribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_nsm_contribuicao_generosidade();

-- ----------------------------------------------------------------------------
-- 8. BACKFILL: pegar dados ja existentes e popular nsm_eventos
--
-- Roda uma vez ao aplicar a migration. Nao reroda em re-execucao porque
-- ON CONFLICT DO NOTHING evita duplicatas. Idempotente.
-- ----------------------------------------------------------------------------

-- Backfill seguir (batismos concluidos)
INSERT INTO public.nsm_eventos (
  membro_id, visitante_id, cpf, nome, igreja_id,
  data_decisao, valor_engajado, data_engajamento, origem, origem_id
)
SELECT
  m.id, iv.id, m.cpf, m.nome, m.igreja_id,
  iv.data_visita, 'seguir', COALESCE(t.data_conclusao, CURRENT_DATE),
  'mem_trilha_valores:batismo', t.id
FROM public.mem_trilha_valores t
JOIN public.mem_membros m ON m.id = t.membro_id
JOIN public.int_visitantes iv ON iv.cpf = m.cpf AND iv.fez_decisao = true
WHERE t.etapa = 'batismo' AND t.concluida = true
  AND m.cpf IS NOT NULL AND m.cpf <> ''
ON CONFLICT (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado) DO NOTHING;

-- Backfill conectar (entradas em grupo)
INSERT INTO public.nsm_eventos (
  membro_id, visitante_id, cpf, nome, igreja_id,
  data_decisao, valor_engajado, data_engajamento, origem, origem_id
)
SELECT DISTINCT ON (m.id)
  m.id, iv.id, m.cpf, m.nome, m.igreja_id,
  iv.data_visita, 'conectar', g.entrou_em,
  'mem_grupo_membros', g.id
FROM public.mem_grupo_membros g
JOIN public.mem_membros m ON m.id = g.membro_id
JOIN public.int_visitantes iv ON iv.cpf = m.cpf AND iv.fez_decisao = true
WHERE m.cpf IS NOT NULL AND m.cpf <> ''
ORDER BY m.id, g.entrou_em ASC
ON CONFLICT (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado) DO NOTHING;

-- Backfill investir (devocionais)
INSERT INTO public.nsm_eventos (
  membro_id, visitante_id, cpf, nome, igreja_id,
  data_decisao, valor_engajado, data_engajamento, origem, origem_id
)
SELECT DISTINCT ON (m.id)
  m.id, iv.id, m.cpf, m.nome, m.igreja_id,
  iv.data_visita, 'investir', d.data_devocional,
  'mem_devocionais', d.id
FROM public.mem_devocionais d
JOIN public.mem_membros m ON m.id = d.membro_id
JOIN public.int_visitantes iv ON iv.cpf = m.cpf AND iv.fez_decisao = true
WHERE d.concluida = true
  AND m.cpf IS NOT NULL AND m.cpf <> ''
ORDER BY m.id, d.data_devocional ASC
ON CONFLICT (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado) DO NOTHING;

-- Backfill servir (voluntariado)
INSERT INTO public.nsm_eventos (
  membro_id, visitante_id, cpf, nome, igreja_id,
  data_decisao, valor_engajado, data_engajamento, origem, origem_id
)
SELECT DISTINCT ON (m.id)
  m.id, iv.id, m.cpf, m.nome, m.igreja_id,
  iv.data_visita, 'servir', v.desde,
  'mem_voluntarios', v.id
FROM public.mem_voluntarios v
JOIN public.mem_membros m ON m.id = v.membro_id
JOIN public.int_visitantes iv ON iv.cpf = m.cpf AND iv.fez_decisao = true
WHERE m.cpf IS NOT NULL AND m.cpf <> ''
ORDER BY m.id, v.desde ASC
ON CONFLICT (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado) DO NOTHING;

-- Backfill generosidade (contribuicoes)
INSERT INTO public.nsm_eventos (
  membro_id, visitante_id, cpf, nome, igreja_id,
  data_decisao, valor_engajado, data_engajamento, origem, origem_id
)
SELECT DISTINCT ON (m.id)
  m.id, iv.id, m.cpf, m.nome, m.igreja_id,
  iv.data_visita, 'generosidade', c.data,
  'mem_contribuicoes:' || c.tipo, c.id
FROM public.mem_contribuicoes c
JOIN public.mem_membros m ON m.id = c.membro_id
JOIN public.int_visitantes iv ON iv.cpf = m.cpf AND iv.fez_decisao = true
WHERE m.cpf IS NOT NULL AND m.cpf <> ''
ORDER BY m.id, c.data ASC
ON CONFLICT (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9. Recalcular NSM apos backfill (popular nsm_estado)
-- ----------------------------------------------------------------------------
SELECT public.recalcular_nsm();

-- ----------------------------------------------------------------------------
-- Conferencia
-- ----------------------------------------------------------------------------
-- SELECT count(*) FROM nsm_eventos;
-- SELECT valor_engajado, count(*) FROM nsm_eventos GROUP BY valor_engajado;
-- SELECT * FROM vw_nsm_painel;

COMMENT ON FUNCTION public.nsm_inserir_evento IS
  'Helper: tenta linkar engajamento com decisao em int_visitantes. Se ha CPF coincidente com fez_decisao=true, insere em nsm_eventos. ON CONFLICT garante 1 evento por pessoa+valor (primeiro engajamento conta).';
