-- ============================================================================
-- Cruzamentos de pessoas · BATISMO, "fez o Next" e CONVERSÃO como critérios
-- Pedido do Matheus em 20/08/2026
-- ============================================================================
-- A PERGUNTA QUE ELE FEZ
--   "quantos voluntários já são batizados · quantos servem ativamente mas não
--    são batizados · das pessoas que se inscreveram ou fizeram o Next, quantas
--    são recém-convertidas"
--
-- A tela `/admin/cruzamentos` já existe e cruza 10 critérios. Faltavam
-- exatamente os 3 eixos das perguntas dele — nenhum era batismo.
--
-- ⚠️⚠️ LEI QUE GOVERNA ESTA MIGRATION · "não batizado" NÃO É DERIVÁVEL.
--   Medido em 20/08/2026:
--     · `batismo_inscricoes` começa em 25/02/2024 — é o registro da PORTA do
--       sistema, não o histórico da igreja;
--     · dos 1.699 `membro_ativo`, só 488 têm batismo registrado — 1.208 não;
--     · `mem_membros.data_batismo` está preenchida em ZERO linhas;
--     · `batizado_outra_igreja` está marcado em 4 pessoas.
--   Numa igreja batista membro é batizado por definição, então esses 1.208 são
--   lacuna de CADASTRO. Chamar isso de "não batizado" faria a tela afirmar,
--   sobre 495 voluntários reais, algo que ela não sabe — e é decisão pastoral
--   que sairia disso.
--   ⇒ A coluna é `is_batizado` = "TEM REGISTRO de batismo", e a tela diz isso.
--      É a mesma régua dos marcadores de jornada (13/08): marcador diz o que o
--      sistema tem registro de; ausência não é prova.
--
-- ⚠️ "FEZ O NEXT" vem de `vw_next_formado_pessoa`, nunca de
--   `next_matriculas.status` — as 2 aulas não são sequenciais e o status por
--   turma diz "não formou" para quem formou cruzando turmas (lei de 14/08).
--   É DIFERENTE de `is_inscrito_next`, que já existia: inscrito ≠ concluiu.
--
-- ⚠️ CONVERSÃO tem duas formas de ser lida e as duas ficam:
--   · `valor_seguir` (já existia) = etapa da trilha `mem_trilha_valores`;
--   · `is_convertido` (nova) = tem linha em `cui_convertidos`, a fila REAL do
--     cuidado pastoral, COM DATA (`convertido_em`) — é ela que permite
--     "recém-convertido" com janela.
--   Somar as duas num critério só apagaria a diferença entre "está na trilha" e
--   "decidiu num culto e entrou na fila de acompanhamento".
--
-- NADA É DESTRUTIVO: acrescenta 5 colunas à matview e 4 chaves à RPC. Os 10
-- critérios existentes não mudam de significado nem de valor.
-- ============================================================================

-- ── ETAPA 1 · a matview ganha as colunas ───────────────────────────────────
-- ⚠️ Matview não aceita ALTER ADD COLUMN: é DROP + CREATE. Por isso os índices
-- são recriados abaixo, um por um — inclusive o UNIQUE, sem o qual
-- `REFRESH ... CONCURRENTLY` (que o cron usa) falha.
DROP MATERIALIZED VIEW IF EXISTS public.vw_pessoas_papeis_mat;

CREATE MATERIALIZED VIEW public.vw_pessoas_papeis_mat AS
SELECT
  m.id AS membresia_id,
  m.nome, m.email, m.telefone, m.cpf, m.status, m.foto_url, m.familia_id, m.active,

  -- ───── papéis (inalterados) ─────
  (EXISTS (SELECT 1 FROM vol_profiles vp WHERE vp.membresia_id = m.id)) AS is_voluntario,
  (SELECT vp.id FROM vol_profiles vp WHERE vp.membresia_id = m.id LIMIT 1) AS vol_profile_id,
  (EXISTS (SELECT 1 FROM int_visitantes iv
            WHERE iv.membresia_id = m.id AND iv.deleted_at IS NULL)) AS is_visitante,
  (SELECT iv.id FROM int_visitantes iv
     WHERE iv.membresia_id = m.id AND iv.deleted_at IS NULL
     ORDER BY iv.data_visita DESC LIMIT 1) AS visitante_id,
  (EXISTS (SELECT 1 FROM next_inscricoes ni WHERE ni.membro_id = m.id)) AS is_inscrito_next,
  (SELECT count(*) FROM next_inscricoes ni WHERE ni.membro_id = m.id) AS total_inscricoes_next,
  (EXISTS (SELECT 1 FROM mem_grupo_membros gm
            WHERE gm.membro_id = m.id AND gm.saiu_em IS NULL AND gm.deleted_at IS NULL)) AS in_grupo_ativo,
  (EXISTS (SELECT 1 FROM mem_contribuicoes mc
            WHERE mc.membro_id = m.id AND mc.deleted_at IS NULL
              AND mc.data >= (CURRENT_DATE - '90 days'::interval))) AS is_contribuinte,

  -- ───── os 5 valores (inalterados) ─────
  (EXISTS (SELECT 1 FROM mem_trilha_valores tv
            WHERE tv.membro_id = m.id AND tv.concluida = true AND tv.deleted_at IS NULL
              AND tv.etapa = ANY (ARRAY['conversao','primeiro_contato','batismo']))) AS valor_seguir,
  (EXISTS (SELECT 1 FROM mem_grupo_membros gm
            WHERE gm.membro_id = m.id AND gm.saiu_em IS NULL AND gm.deleted_at IS NULL)) AS valor_conectar,
  (EXISTS (SELECT 1 FROM cui_jornada180 j
            WHERE j.membro_id = m.id AND j.deleted_at IS NULL
              AND j.data_encontro >= (CURRENT_DATE - '90 days'::interval))) AS valor_investir,
  (EXISTS (SELECT 1 FROM mem_voluntarios v
            WHERE v.membro_id = m.id AND v.ate IS NULL AND v.deleted_at IS NULL)) AS valor_servir,
  (EXISTS (SELECT 1 FROM mem_contribuicoes c
            WHERE c.membro_id = m.id AND c.deleted_at IS NULL
              AND c.data >= (CURRENT_DATE - '90 days'::interval))) AS valor_generosidade,

  -- ───── NOVO · batismo REGISTRADO ─────
  -- ⚠️ As duas fontes contam: a cerimônia registrada pela porta do sistema E a
  -- marcação `batizado_outra_igreja`, que é declaração da própria pessoa no app.
  -- Sem a segunda, quem se batizou noutra igreja há 20 anos apareceria na lista
  -- de "regularizar" para sempre.
  (EXISTS (SELECT 1 FROM batismo_inscricoes b
            WHERE b.membro_id = m.id AND b.status = 'realizado' AND b.deleted_at IS NULL)
   OR m.batizado_outra_igreja IS TRUE) AS is_batizado,
  -- Distingue as duas origens: a equipe precisa saber se o batismo é da casa
  -- (tem data e cerimônia) ou autodeclarado.
  CASE
    WHEN EXISTS (SELECT 1 FROM batismo_inscricoes b
                  WHERE b.membro_id = m.id AND b.status = 'realizado' AND b.deleted_at IS NULL)
      THEN 'registro'
    WHEN m.batizado_outra_igreja IS TRUE THEN 'outra_igreja'
    ELSE NULL
  END AS batismo_origem,
  (SELECT max(b.data_batismo) FROM batismo_inscricoes b
    WHERE b.membro_id = m.id AND b.status = 'realizado' AND b.deleted_at IS NULL) AS batizado_em,

  -- ───── NOVO · CONCLUIU o Next (≠ inscrito) ─────
  -- ⚠️ Fonte única `vw_next_formado_pessoa` (lei de 14/08): UM encontro basta, e
  -- `next_matriculas.status` mente para quem formou cruzando turmas.
  (EXISTS (SELECT 1 FROM vw_next_formado_pessoa f WHERE f.membro_id = m.id)) AS fez_next,

  -- ───── NOVO · conversão com DATA (permite "recém-convertido") ─────
  (EXISTS (SELECT 1 FROM cui_convertidos cc WHERE cc.membro_id = m.id)) AS is_convertido,
  (SELECT max(COALESCE(cc.data_culto, cc.created_at::date))
     FROM cui_convertidos cc WHERE cc.membro_id = m.id) AS convertido_em,

  now() AS atualizado_em
FROM mem_membros m
WHERE m.active = true AND m.deleted_at IS NULL;

-- ── ETAPA 2 · índices (o UNIQUE é obrigatório para REFRESH CONCURRENTLY) ────
CREATE UNIQUE INDEX idx_vppm_id           ON public.vw_pessoas_papeis_mat (membresia_id);
CREATE        INDEX idx_vppm_nome         ON public.vw_pessoas_papeis_mat (nome);
CREATE        INDEX idx_vppm_seguir       ON public.vw_pessoas_papeis_mat (valor_seguir)       WHERE valor_seguir = true;
CREATE        INDEX idx_vppm_conectar     ON public.vw_pessoas_papeis_mat (valor_conectar)     WHERE valor_conectar = true;
CREATE        INDEX idx_vppm_investir     ON public.vw_pessoas_papeis_mat (valor_investir)     WHERE valor_investir = true;
CREATE        INDEX idx_vppm_servir       ON public.vw_pessoas_papeis_mat (valor_servir)       WHERE valor_servir = true;
CREATE        INDEX idx_vppm_generosidade ON public.vw_pessoas_papeis_mat (valor_generosidade) WHERE valor_generosidade = true;
CREATE        INDEX idx_vppm_voluntario   ON public.vw_pessoas_papeis_mat (is_voluntario)      WHERE is_voluntario = true;
CREATE        INDEX idx_vppm_visitante    ON public.vw_pessoas_papeis_mat (is_visitante)       WHERE is_visitante = true;
CREATE        INDEX idx_vppm_next         ON public.vw_pessoas_papeis_mat (is_inscrito_next)   WHERE is_inscrito_next = true;
-- novos
CREATE        INDEX idx_vppm_batizado     ON public.vw_pessoas_papeis_mat (is_batizado)        WHERE is_batizado = true;
CREATE        INDEX idx_vppm_fez_next     ON public.vw_pessoas_papeis_mat (fez_next)           WHERE fez_next = true;
CREATE        INDEX idx_vppm_convertido   ON public.vw_pessoas_papeis_mat (convertido_em)      WHERE is_convertido = true;

COMMENT ON MATERIALIZED VIEW public.vw_pessoas_papeis_mat IS
  'Papéis e valores por pessoa, para os cruzamentos de /admin/cruzamentos. '
  'Atualizada por REFRESH CONCURRENTLY (cron /api/jornada/cron/refresh-papeis). '
  '⚠️ `is_batizado` significa TEM REGISTRO de batismo — NUNCA "é batizado": o '
  'registro começa em 02/2024 e 1.208 dos 1.699 membros ativos não têm linha. '
  'Ausência não é prova (mesma régua dos marcadores de jornada). '
  '⚠️ `fez_next` (concluiu) é diferente de `is_inscrito_next` (se inscreveu).';

-- ── ETAPA 3 · a RPC aceita as chaves novas ─────────────────────────────────
-- ⚠️ MESMA ASSINATURA (jsonb, int, int): mudar criaria OVERLOAD, e o PostgREST
-- poderia escolher a versão antiga. Os critérios novos entram como CHAVES do
-- jsonb que já é parâmetro — inclusive a janela de dias.
CREATE OR REPLACE FUNCTION public.cruzar_pessoas(
  p_criterios jsonb,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_where text := 'true';
  v_keys text[] := ARRAY[
    'seguir', 'conectar', 'investir', 'servir', 'generosidade',
    'voluntario', 'visitante', 'inscrito_next', 'grupo_ativo', 'contribuinte',
    -- novos (20/08/2026)
    'batizado', 'fez_next', 'convertido'
  ];
  v_key text;
  v_val text;
  v_col text;
  v_dias int;
  v_total_geral int;
  v_total_match int;
  v_membros jsonb;
BEGIN
  FOREACH v_key IN ARRAY v_keys LOOP
    v_val := p_criterios ->> v_key;
    IF v_val IS NULL OR v_val NOT IN ('tem', 'nao_tem') THEN CONTINUE; END IF;

    v_col := CASE v_key
      WHEN 'seguir'        THEN 'valor_seguir'
      WHEN 'conectar'      THEN 'valor_conectar'
      WHEN 'investir'      THEN 'valor_investir'
      WHEN 'servir'        THEN 'valor_servir'
      WHEN 'generosidade'  THEN 'valor_generosidade'
      WHEN 'voluntario'    THEN 'is_voluntario'
      WHEN 'visitante'     THEN 'is_visitante'
      WHEN 'inscrito_next' THEN 'is_inscrito_next'
      WHEN 'grupo_ativo'   THEN 'in_grupo_ativo'
      WHEN 'contribuinte'  THEN 'is_contribuinte'
      WHEN 'batizado'      THEN 'is_batizado'
      WHEN 'fez_next'      THEN 'fez_next'
      WHEN 'convertido'    THEN 'is_convertido'
    END;

    -- ⚠️ `v_col` só pode sair do CASE acima (nome de coluna nosso) e `v_val` só
    -- pode ser 'tem'/'nao_tem'. Nada vindo do cliente é concatenado cru — este
    -- WHERE vai para EXECUTE.
    IF v_val = 'tem' THEN
      v_where := v_where || ' AND ' || v_col || ' = true';
    ELSE
      v_where := v_where || ' AND ' || v_col || ' = false';
    END IF;
  END LOOP;

  -- ── "recém-convertido": janela em dias sobre a data da decisão ────────────
  -- ⚠️ Só se aplica quando o critério `convertido` está pedindo QUEM É — numa
  -- busca por "nao_tem" a janela não tem sentido (a pessoa não tem data), e
  -- aplicá-la esvaziaria o resultado sem explicação.
  IF (p_criterios ->> 'convertido') = 'tem' THEN
    BEGIN
      v_dias := NULLIF(p_criterios ->> 'convertido_dias', '')::int;
    EXCEPTION WHEN others THEN
      v_dias := NULL;  -- valor não numérico: ignora a janela em vez de estourar
    END;
    -- Teto de 10 anos e piso de 1 dia: número absurdo vindo do cliente não
    -- viraria erro, viraria filtro silenciosamente vazio.
    IF v_dias IS NOT NULL AND v_dias BETWEEN 1 AND 3650 THEN
      v_where := v_where || format(
        ' AND convertido_em IS NOT NULL AND convertido_em >= (CURRENT_DATE - %s)',
        v_dias  -- já é int; format %s de int não injeta
      );
    END IF;
  END IF;

  SELECT count(*) INTO v_total_geral FROM public.vw_pessoas_papeis_mat;

  EXECUTE 'SELECT count(*) FROM public.vw_pessoas_papeis_mat WHERE ' || v_where
    INTO v_total_match;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM ('
    'SELECT membresia_id AS id, nome, email, telefone, status, foto_url, '
    '       is_batizado, batismo_origem, batizado_em, fez_next, convertido_em '
    'FROM public.vw_pessoas_papeis_mat WHERE %s '
    'ORDER BY nome LIMIT %s OFFSET %s) t',
    v_where, p_limit, p_offset
  ) INTO v_membros;

  RETURN jsonb_build_object(
    'total_geral', v_total_geral,
    'total_match', v_total_match,
    'percentual', CASE WHEN v_total_geral > 0
                       THEN round((v_total_match::numeric / v_total_geral) * 1000) / 10
                       ELSE 0 END,
    'membros', v_membros
  );
END;
$function$;

COMMENT ON FUNCTION public.cruzar_pessoas(jsonb, integer, integer) IS
  'Cruzamento de pessoas por papéis/valores para /admin/cruzamentos. '
  'Chaves de `p_criterios`: seguir, conectar, investir, servir, generosidade, '
  'voluntario, visitante, inscrito_next, grupo_ativo, contribuinte, batizado, '
  'fez_next, convertido — cada uma com "tem" | "nao_tem"; mais '
  '`convertido_dias` (1..3650) para recortar recém-convertidos. '
  '⚠️ Critério novo entra em `v_keys` E no CASE — chave fora do CASE deixaria '
  'v_col nulo e o WHERE viraria "AND = true", que é erro de sintaxe no EXECUTE. '
  '⚠️ `batizado=nao_tem` significa SEM REGISTRO, não "não é batizado".';

-- ── ETAPA 4 · primeira carga ────────────────────────────────────────────────
-- ⚠️ Sem CONCURRENTLY aqui de propósito: a matview acabou de ser criada e está
-- vazia, e o Postgres recusa CONCURRENTLY numa matview nunca populada.
REFRESH MATERIALIZED VIEW public.vw_pessoas_papeis_mat;
