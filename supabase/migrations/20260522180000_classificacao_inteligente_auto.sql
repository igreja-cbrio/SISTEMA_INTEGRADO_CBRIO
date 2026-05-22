-- Conciliacao inteligente · classificacao automatica + memoria de aprendizado
-- 2026-05-22 · PR 3/3 do pacote financeiro
--
-- O que muda no fluxo:
--   1. INSERT em fin_lancamentos_brutos → trigger cria fila com sugestao
--      automatica (regra → memoria → heuristica)
--   2. UPDATE em fin_fila_classificacao status=decidido → trigger alimenta
--      memoria com a categoria escolhida (proxima vez acerta sozinho)
--   3. View vw_classificacao_stats · % acerto automatico ultimos 30d
--   4. Funcao reclassificar_fila_pendente() · roda sugestao de novo na fila
--      apos cadastrar regra nova ou editar memoria

-- 1. Funcao · aplica regras + memoria a um lancamento bruto
CREATE OR REPLACE FUNCTION public.aplicar_classificacao_lancamento(p_bruto_id uuid)
RETURNS TABLE (plano_contas_id uuid, centro_custo_id uuid, membro_id uuid,
               confianca numeric, origem text, explicacao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE b RECORD; r RECORD; m RECORD;
BEGIN
  SELECT * INTO b FROM fin_lancamentos_brutos WHERE id = p_bruto_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Prioridade 1 · memoria por documento (chave forte)
  IF b.documento_contraparte IS NOT NULL AND length(trim(b.documento_contraparte)) > 0 THEN
    SELECT * INTO m FROM fin_memoria_classificacao
     WHERE tipo_chave = 'documento' AND chave_contraparte = b.documento_contraparte
     ORDER BY ocorrencias DESC, ultimo_uso DESC NULLS LAST LIMIT 1;
    IF FOUND THEN
      plano_contas_id := m.plano_contas_id; centro_custo_id := m.centro_custo_id;
      confianca := LEAST(0.95, 0.7 + (LEAST(m.ocorrencias, 10) * 0.025));
      origem := 'memoria_documento';
      explicacao := format('Memoria · documento %s ja foi classificado %s vez(es)',
                           b.documento_contraparte, m.ocorrencias);
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- Memoria por nome (chave fraca · fallback)
  IF b.nome_contraparte IS NOT NULL AND length(trim(b.nome_contraparte)) > 2 THEN
    SELECT * INTO m FROM fin_memoria_classificacao
     WHERE tipo_chave = 'nome' AND chave_contraparte = LOWER(TRIM(b.nome_contraparte))
     ORDER BY ocorrencias DESC, ultimo_uso DESC NULLS LAST LIMIT 1;
    IF FOUND THEN
      plano_contas_id := m.plano_contas_id; centro_custo_id := m.centro_custo_id;
      confianca := LEAST(0.90, 0.6 + (LEAST(m.ocorrencias, 10) * 0.03));
      origem := 'memoria_nome';
      explicacao := format('Memoria · "%s" ja foi classificado %s vez(es)',
                           b.nome_contraparte, m.ocorrencias);
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- Prioridade 2 · regras manuais
  FOR r IN
    SELECT * FROM fin_regras_classificacao
    WHERE ativo = true
      AND (aplica_a IS NULL OR aplica_a = 'ambos'
           OR (aplica_a = 'credito' AND b.tipo_trn = 'CREDIT')
           OR (aplica_a = 'debito'  AND b.tipo_trn = 'DEBIT'))
    ORDER BY prioridade DESC, created_at ASC
  LOOP
    IF r.tipo_regra = 'regex_memo' AND b.memo IS NOT NULL THEN
      IF (r.case_insensitive AND b.memo ~* r.pattern)
         OR (NOT r.case_insensitive AND b.memo ~ r.pattern) THEN
        plano_contas_id := r.plano_contas_id; centro_custo_id := r.centro_custo_id;
        membro_id := r.membro_id; confianca := 0.85; origem := 'regra';
        explicacao := format('Regra: %s · pattern em memo', r.nome);
        RETURN NEXT; RETURN;
      END IF;
    ELSIF r.tipo_regra = 'regex_nome' AND b.nome_contraparte IS NOT NULL THEN
      IF (r.case_insensitive AND b.nome_contraparte ~* r.pattern)
         OR (NOT r.case_insensitive AND b.nome_contraparte ~ r.pattern) THEN
        plano_contas_id := r.plano_contas_id; centro_custo_id := r.centro_custo_id;
        membro_id := r.membro_id; confianca := 0.85; origem := 'regra';
        explicacao := format('Regra: %s · pattern em nome', r.nome);
        RETURN NEXT; RETURN;
      END IF;
    END IF;
  END LOOP;

  -- Prioridade 3 · sem sugestao
  confianca := 0.0; origem := 'sem_sugestao';
  explicacao := 'Nenhuma regra ou memoria bateu';
  RETURN NEXT;
END;
$$;

-- 2. Trigger AUTO · cria fila com sugestao ao inserir bruto
CREATE OR REPLACE FUNCTION public.tg_fila_auto_classificar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE s RECORD;
BEGIN
  IF NEW.ja_classificado = true THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM fin_fila_classificacao WHERE lancamento_bruto_id = NEW.id) THEN RETURN NEW; END IF;
  SELECT * INTO s FROM aplicar_classificacao_lancamento(NEW.id);
  INSERT INTO fin_fila_classificacao (
    lancamento_bruto_id, status,
    sugestao_plano_contas_id, sugestao_centro_custo_id, sugestao_membro_id,
    sugestao_confianca, sugestao_origem, sugestao_explicacao
  )
  VALUES (
    NEW.id, 'pendente',
    s.plano_contas_id, s.centro_custo_id, s.membro_id,
    s.confianca, s.origem, s.explicacao
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fila_auto_classificar_ins ON fin_lancamentos_brutos;
CREATE TRIGGER tg_fila_auto_classificar_ins
AFTER INSERT ON fin_lancamentos_brutos
FOR EACH ROW EXECUTE FUNCTION tg_fila_auto_classificar();

-- 3. Trigger MEMORIA · ao decidir, alimenta cache da proxima vez
CREATE UNIQUE INDEX IF NOT EXISTS fin_memoria_classificacao_chave_unq
  ON fin_memoria_classificacao (tipo_chave, chave_contraparte);

CREATE OR REPLACE FUNCTION public.tg_fila_alimenta_memoria()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE b RECORD; v_doc text; v_nome text;
BEGIN
  IF NEW.status NOT IN ('decidido', 'aprovado') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.sugestao_plano_contas_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO b FROM fin_lancamentos_brutos WHERE id = NEW.lancamento_bruto_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_doc := NULLIF(TRIM(b.documento_contraparte), '');
  v_nome := NULLIF(LOWER(TRIM(b.nome_contraparte)), '');

  IF v_doc IS NOT NULL THEN
    INSERT INTO fin_memoria_classificacao (tipo_chave, chave_contraparte, plano_contas_id, centro_custo_id, ocorrencias, ultimo_uso)
    VALUES ('documento', v_doc, NEW.sugestao_plano_contas_id, NEW.sugestao_centro_custo_id, 1, now())
    ON CONFLICT (tipo_chave, chave_contraparte) DO UPDATE
      SET plano_contas_id = EXCLUDED.plano_contas_id,
          centro_custo_id = EXCLUDED.centro_custo_id,
          ocorrencias = fin_memoria_classificacao.ocorrencias + 1,
          ultimo_uso = now();
  END IF;

  IF v_nome IS NOT NULL AND length(v_nome) > 2 THEN
    INSERT INTO fin_memoria_classificacao (tipo_chave, chave_contraparte, plano_contas_id, centro_custo_id, ocorrencias, ultimo_uso)
    VALUES ('nome', v_nome, NEW.sugestao_plano_contas_id, NEW.sugestao_centro_custo_id, 1, now())
    ON CONFLICT (tipo_chave, chave_contraparte) DO UPDATE
      SET plano_contas_id = EXCLUDED.plano_contas_id,
          centro_custo_id = EXCLUDED.centro_custo_id,
          ocorrencias = fin_memoria_classificacao.ocorrencias + 1,
          ultimo_uso = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fila_alimenta_memoria_upd ON fin_fila_classificacao;
CREATE TRIGGER tg_fila_alimenta_memoria_upd
AFTER UPDATE ON fin_fila_classificacao
FOR EACH ROW EXECUTE FUNCTION tg_fila_alimenta_memoria();

-- 4. View · stats de classificacao (KPI da fila)
CREATE OR REPLACE VIEW public.vw_classificacao_stats AS
WITH ult30 AS (
  SELECT * FROM fin_fila_classificacao
   WHERE created_at >= CURRENT_DATE - interval '30 days'
)
SELECT
  (SELECT COUNT(*) FROM fin_fila_classificacao WHERE status = 'pendente') AS pendentes,
  (SELECT COUNT(*) FROM fin_fila_classificacao WHERE status IN ('decidido', 'aprovado')) AS decididas_total,
  (SELECT COUNT(*) FROM ult30) AS total_ult30,
  (SELECT COUNT(*) FROM ult30 WHERE sugestao_origem IN ('regra', 'memoria_documento', 'memoria_nome')) AS classificadas_auto_ult30,
  (SELECT COUNT(*) FROM ult30 WHERE sugestao_origem = 'sem_sugestao') AS sem_sugestao_ult30,
  (SELECT AVG(sugestao_confianca) FROM ult30 WHERE sugestao_confianca > 0) AS confianca_media_ult30,
  (SELECT COUNT(*) FROM fin_memoria_classificacao) AS memoria_total;

-- 5. Funcao · re-classifica fila pendente apos editar regras/memoria
CREATE OR REPLACE FUNCTION public.reclassificar_fila_pendente()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r RECORD; s RECORD; n integer := 0;
BEGIN
  FOR r IN SELECT * FROM fin_fila_classificacao WHERE status = 'pendente' LOOP
    SELECT * INTO s FROM aplicar_classificacao_lancamento(r.lancamento_bruto_id);
    UPDATE fin_fila_classificacao SET
      sugestao_plano_contas_id = s.plano_contas_id,
      sugestao_centro_custo_id = s.centro_custo_id,
      sugestao_membro_id = s.membro_id,
      sugestao_confianca = s.confianca,
      sugestao_origem = s.origem,
      sugestao_explicacao = s.explicacao
    WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_classificacao_lancamento(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reclassificar_fila_pendente() TO authenticated, service_role;
GRANT SELECT ON public.vw_classificacao_stats TO authenticated, service_role;

COMMIT;
