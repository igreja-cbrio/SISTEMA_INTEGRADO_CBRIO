-- ============================================================================
-- Next · fecha a porta legada e liga a FK que faltava (2026-07-30)
--
-- Decisões do Marcos (29/07), na conversa caso a caso:
--   · CASO 1 · os 865 "formado" do backfill FICAM como formado. "Antes eles
--     usavam folhas de papel e o controle era limitado" — o status reflete o
--     julgamento de quem conduzia o Next no papel, e reescrever isso hoje seria
--     trocar um dado impreciso por outro. NADA a fazer (fica só a ressalva de
--     que maio/2026 não tem matrícula real fora do backfill · ver CLAUDE.md).
--   · CASO 2 · converter as aparições sem matrícula e MATAR a porta legada.
--   · CASO 3 · NÃO apagar os 93 cadastros "vazios" (ver CLAUDE.md: o matcher
--     canônico filtra `deleted_at` e NUNCA `active`, então soft-delete quebraria
--     justamente a reconciliação futura que o Marcos quer).
--   · CASO 4 · resolver os órfãos e ligar a FK.
--
-- ⚠️ ORDEM IMPORTA: PARTE 1 antes da 2 (ninguém desaparece da view), e PARTE 3
-- antes da 4 (a FK não é criável com órfão na tabela).
-- ============================================================================

SET lock_timeout = '10s';

-- ── PARTE 1 · aparições sem matrícula viram MATRÍCULA (CASO 2) ──────────────
-- As 131 linhas que sobraram na porta `next_legado` são (mês × pessoa) sem
-- contrapartida na camada viva. Viram matrícula com a MESMA chave que a view
-- usa pra deduplicar, então a porta legada fica vazia por construção.
--   · `created_at` = data do ENCONTRO, não a data do import: a linha é NOVA,
--     não há fato de auditoria a preservar, e datar em 13/05/2026 jogaria mais
--     ruído na janela dos KPIs de maio.
--   · status: `formado` só onde existe presença registrada. Onde não existe, a
--     matrícula nasce `matriculado` — não vou AFIRMAR formatura de quem não tem
--     nenhuma evidência (diferente do CASO 1, onde o dado já existia e a
--     decisão de manter é do Marcos).
--   · ON CONFLICT DO NOTHING cobre as 3 UNIQUEs da tabela (origem_mes_key,
--     turma+cpf, turma+email).
INSERT INTO public.next_matriculas (
  turma_id, nome, sobrenome, cpf, telefone, email, data_nascimento,
  membro_id, origem, origem_mes_key, status, check_in_at, check_in_by,
  created_at, observacoes
)
SELECT DISTINCT ON (to_char(e.data, 'YYYY-MM'), ni.membro_id)
  t.id,
  ni.nome, ni.sobrenome, ni.cpf, ni.telefone, ni.email, ni.data_nascimento,
  ni.membro_id,
  'manual',
  to_char(e.data, 'YYYY-MM') || '|' || ni.membro_id::text,
  CASE WHEN ni.check_in_at IS NOT NULL THEN 'formado' ELSE 'matriculado' END,
  ni.check_in_at, ni.check_in_by,
  (e.data + time '12:00') AT TIME ZONE 'America/Sao_Paulo',
  'Convertida da lista do Next em 30/07/2026 (aparição sem matrícula no backfill de 13/05).'
FROM public.next_inscricoes ni
JOIN public.next_eventos e ON e.id = ni.evento_id
LEFT JOIN public.next_turmas t
       ON t.origem_mes = to_char(e.data, 'YYYY-MM') AND t.deleted_at IS NULL
WHERE ni.membro_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.next_matriculas m
     WHERE m.deleted_at IS NULL
       AND m.origem_mes_key = to_char(e.data, 'YYYY-MM') || '|' || ni.membro_id::text
  )
ORDER BY to_char(e.data, 'YYYY-MM'), ni.membro_id,
         (ni.check_in_at IS NULL), ni.check_in_at, ni.created_at, ni.id
ON CONFLICT DO NOTHING;

-- ── PARTE 2 · a porta `next_legado` SAI da view (CASO 2) ────────────────────
-- Depois da PARTE 1 o ramo devolveria 0 linhas. Ele sai de vez: `next_inscricoes`
-- deixa de ser "porta de inscrição" e passa a ser só o que sempre foi — PRESENÇA
-- POR ENCONTRO (é o que o KPI `frequencia_next` lê). Um modelo de inscrição
-- (turma/matrícula), um de presença (encontro). Fim da competição entre os dois.
-- A view cai de 10 para 9 fontes (`inscricaoPortas.js` e o teste acompanham).
-- ⚠️ Ponto cego consciente: o ramo `next` do `fn_app_inscricoes_fanout` (rede de
-- segurança pra builds ANTIGOS do app) ainda insere só em `next_inscricoes` —
-- uma linha dessas agora não aparece na view. Volume real: 1 linha em 2 meses.
-- Fecha quando o fanout puder ser reescrito sem reverter o patch dinâmico de
-- 20260729060000 (ver pendências no CLAUDE.md).

CREATE OR REPLACE VIEW public.vw_inscricoes_unificadas AS
-- ── 1. ESPINHA (inscricoes × insc_eventos × insc_series) ──
SELECT
  'inscricoes'::text AS porta,
  i.id AS ref_id,
  '/inscricoes/evento/' || e.id AS rota_detalhe,
  i.membro_id,
  i.nome_completo AS nome_display,
  NULLIF(regexp_replace(coalesce(i.telefone, ''), '\D', '', 'g'), '') AS telefone_norm,
  NULLIF(regexp_replace(coalesce(i.cpf, ''), '\D', '', 'g'), '') AS cpf_norm,
  NULLIF(lower(trim(coalesce(i.email, ''))), '') AS email_norm,
  i.data_nascimento AS nascimento,
  i.created_at AS criado_em,
  i.status AS status_original,
  i.status AS status_canonico,            -- espinha já fala o vocabulário canônico
  coalesce(i.origem, 'formulario_publico') AS origem_norm,
  e.area AS area_display,
  e.nome AS evento_rotulo,
  s.slug_base AS serie_chave,
  e.edicao_rotulo,
  e.id::text AS evento_ref,
  e.data AS evento_data,
  CASE WHEN e.checkin_ativo THEN EXISTS (
    SELECT 1 FROM public.insc_checkins ck WHERE ck.inscricao_id = i.id
  ) ELSE NULL END AS compareceu
FROM public.inscricoes i
JOIN public.insc_eventos e ON e.id = i.evento_id
LEFT JOIN public.insc_series s ON s.id = e.serie_id
WHERE i.deleted_at IS NULL

UNION ALL
-- ── 2. EVENTOS EXTERNOS (redundante pós-virada · só linhas NÃO migradas) ──
SELECT
  'eventos_externos', x.id, '/inscricoes', x.membro_id,
  x.nome,
  NULLIF(regexp_replace(coalesce(x.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(x.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(x.email, ''))), ''),
  x.data_nascimento, x.created_at,
  x.status,
  CASE x.status WHEN 'cancelada' THEN 'cancelada' ELSE 'confirmada' END,
  coalesce(x.origem, 'formulario_publico'),
  'Sede', ee.nome, NULL, NULL, ee.id::text, ee.data, NULL::boolean
FROM public.ext_inscricoes x
JOIN public.ext_eventos ee ON ee.id = x.evento_id
WHERE x.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inscricoes i2
    WHERE i2.legado_fonte = 'ext_inscricoes' AND i2.legado_ref = x.id
  )

UNION ALL
-- ── 3. BATISMO (série derivada mensal · edição = mês do batismo) ──
SELECT
  'batismo', b.id, '/ministerial/integracao?tab=batismos', b.membro_id,
  trim(b.nome || ' ' || coalesce(b.sobrenome, '')),
  NULLIF(regexp_replace(coalesce(b.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(b.email, ''))), ''),
  b.data_nascimento, b.created_at,
  b.status,
  CASE b.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'confirmado' THEN 'confirmada'
    WHEN 'realizado' THEN 'concluida'
    WHEN 'cancelado' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  coalesce(b.origem, 'formulario_publico'),
  coalesce(public.fn_insc_area_display(b.area_kpi), 'Sede'),
  'Batismo · ' || coalesce(to_char(b.data_batismo, 'DD/MM/YYYY'), 'a agendar'),
  'batismo-mensal', to_char(b.data_batismo, 'YYYY-MM'), NULL, b.data_batismo,
  CASE WHEN b.status IN ('realizado', 'confirmado') THEN (b.checkin_em IS NOT NULL OR b.status = 'realizado') ELSE NULL END
FROM public.batismo_inscricoes b
WHERE b.deleted_at IS NULL

UNION ALL
-- ── 4. APRESENTAÇÃO DE CRIANÇAS (form público · série derivada mensal) ──
SELECT
  'apresentacao_criancas', a.id, '/kids', a.responsavel_membro_id,
  a.crianca_nome,
  NULLIF(regexp_replace(coalesce(a.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(a.cpf_responsavel, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(a.email, ''))), ''),
  a.crianca_data_nascimento, a.created_at,
  a.status,
  CASE a.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'confirmado' THEN 'confirmada'
    WHEN 'realizado' THEN 'concluida'
    WHEN 'cancelado' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  CASE coalesce(a.origem, '') WHEN 'publico' THEN 'formulario_publico' WHEN '' THEN 'formulario_publico' ELSE a.origem END,
  'KIDS',
  'Apresentação · ' || coalesce(to_char(a.data_apresentacao, 'DD/MM/YYYY'), 'a agendar'),
  'apresentacao-mensal', to_char(a.data_apresentacao, 'YYYY-MM'), NULL, a.data_apresentacao,
  CASE WHEN a.status = 'realizado' THEN true ELSE NULL END
FROM public.apresentacao_criancas a
WHERE a.deleted_at IS NULL

UNION ALL
-- ── 5. APRESENTAÇÃO DE BEBÊS (porta viva do totem · mesma série derivada) ──
SELECT
  'apresentacao_bebes', ab.id, '/kids', ab.responsavel_membro_id,
  ab.bebe_nome,
  NULLIF(regexp_replace(coalesce(ab.responsavel_telefone, ''), '\D', '', 'g'), ''),
  NULL,
  NULLIF(lower(trim(coalesce(ab.responsavel_email, ''))), ''),
  ab.bebe_data_nascimento, ab.created_at,
  ab.status,
  CASE ab.status
    WHEN 'agendada' THEN 'confirmada'
    WHEN 'confirmada' THEN 'confirmada'
    WHEN 'realizada' THEN 'concluida'
    WHEN 'cancelada' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  'formulario_publico',
  'KIDS',
  'Apresentação (bebê) · ' || coalesce(to_char(ab.data_apresentacao, 'DD/MM/YYYY'), 'a agendar'),
  'apresentacao-mensal', to_char(ab.data_apresentacao, 'YYYY-MM'), NULL, ab.data_apresentacao,
  CASE WHEN ab.status = 'realizada' THEN true ELSE NULL END
FROM public.apresentacao_bebes ab
WHERE ab.deleted_at IS NULL

UNION ALL
-- ── 6. GRUPOS (pedidos · série derivada = temporada do grupo) ──
SELECT
  'grupos', p.id, '/grupos?tab=entrada', p.membro_id,
  p.nome,
  NULLIF(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g'), ''),
  NULL,
  NULLIF(lower(trim(coalesce(p.email, ''))), ''),
  NULL::date, p.created_at,
  p.status,
  CASE p.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'devolvido' THEN 'em_tratamento'
    WHEN 'encaminhado' THEN 'em_tratamento'
    WHEN 'aprovado' THEN 'concluida'
    WHEN 'rejeitado' THEN 'recusada'
    WHEN 'cancelado' THEN 'cancelada'
    ELSE 'recebida'
  END,
  coalesce(p.origem, 'formulario_publico'),
  coalesce(public.fn_insc_area_display(g.area), 'Grupos'),
  'Grupo ' || coalesce(g.nome, '—'),
  'grupos-temporadas', g.temporada, g.id::text, NULL::date, NULL::boolean
FROM public.mem_grupo_pedidos p
LEFT JOIN public.mem_grupos g ON g.id = p.grupo_id
WHERE p.deleted_at IS NULL

UNION ALL
-- ── 7. LÍDERES E ANFITRIÕES ──
SELECT
  'grupos_lider', l.id, '/grupos?tab=entrada', l.membro_id,
  l.nome,
  NULLIF(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), ''),
  NULL,
  NULLIF(lower(trim(coalesce(l.email, ''))), ''),
  NULL::date, l.created_at,
  l.status,
  CASE l.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'aceito' THEN 'em_tratamento'
    WHEN 'vinculado' THEN 'concluida'
    WHEN 'recusado' THEN 'recusada'
    ELSE 'recebida'
  END,
  coalesce(l.origem, 'formulario_publico'),
  'Grupos', 'Líderes e anfitriões', NULL, NULL, NULL, NULL::date, NULL::boolean
FROM public.mem_lider_inscricoes l
WHERE l.deleted_at IS NULL

UNION ALL
-- ── 8. NEXT · matrículas (série derivada = turma) ──
SELECT
  'next', m.id, '/ministerial/integracao?tab=next', m.membro_id,
  trim(m.nome || ' ' || coalesce(m.sobrenome, '')),
  NULLIF(regexp_replace(coalesce(m.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(m.email, ''))), ''),
  m.data_nascimento, m.created_at,
  m.status,
  CASE
    WHEN m.status = 'matriculado' AND m.turma_id IS NULL THEN 'recebida'
    WHEN m.status = 'matriculado' THEN 'confirmada'
    WHEN m.status = 'formado' THEN 'concluida'
    WHEN m.status = 'incompleto' THEN 'nao_concluida'
    WHEN m.status = 'desistiu' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  coalesce(m.origem, 'formulario_publico'),
  'Next',
  'Next · ' || coalesce(t.nome, 'sem turma'),
  'next-turmas', coalesce(t.origem_mes, t.nome), t.id::text, NULL::date,
  (m.check_in_at IS NOT NULL)
FROM public.next_matriculas m
LEFT JOIN public.next_turmas t ON t.id = m.turma_id
WHERE m.deleted_at IS NULL

UNION ALL
-- ── 10. VOLUNTARIADO ──
SELECT
  'voluntariado', v.id, '/ministerial/voluntariado/inscricoes', v.membro_id,
  coalesce(NULLIF(trim(coalesce(v.nome_completo, '')), ''), trim(coalesce(v.nome, '') || ' ' || coalesce(v.sobrenome, ''))),
  NULLIF(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(v.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(v.email, ''))), ''),
  v.data_nascimento, v.created_at,
  v.status,
  CASE v.status
    WHEN 'inscrito' THEN 'recebida'
    WHEN 'enviado_ministerio' THEN 'em_tratamento'
    WHEN 'kids' THEN 'em_tratamento'
    WHEN 'integrado' THEN 'concluida'
    WHEN 'nao_responde' THEN 'nao_concluida'
    WHEN 'nao_pode_ou_duplicata' THEN 'recusada'
    ELSE 'recebida'
  END,
  coalesce(v.origem, 'formulario_publico'),
  coalesce(public.fn_insc_area_display(v.area), 'Voluntariado'),
  'Voluntariado', NULL, NULL, NULL, NULL::date, NULL::boolean
FROM public.vol_inscricoes v
WHERE v.deleted_at IS NULL;

-- Acesso SÓ via backend (F1 M9): a view concentra PII de todas as portas.
REVOKE ALL ON public.vw_inscricoes_unificadas FROM anon, authenticated;

COMMENT ON VIEW public.vw_inscricoes_unificadas IS
  'Leitura unificada das 10 portas de inscrição (F1 §5-6 + SPEC-03/SPEC-10). Status canônico: recebida→em_tratamento→confirmada→concluida|nao_concluida|recusada|cancelada. Séries derivadas (tempo 1 do SPEC-10) só pra analytics. ext_inscricoes = fonte redundante pós-virada (linhas migradas ficam de fora via legado_ref). Acesso exclusivo via backend.';


-- Acesso SÓ via backend (F1 M9): a view concentra PII de todas as portas.
REVOKE ALL ON public.vw_inscricoes_unificadas FROM anon, authenticated;

COMMENT ON VIEW public.vw_inscricoes_unificadas IS
  'Leitura unificada das 9 portas de inscrição (F1 §5-6 + SPEC-03/SPEC-10). Status canônico: recebida→em_tratamento→confirmada→concluida|nao_concluida|recusada|cancelada. Séries derivadas (tempo 1 do SPEC-10) só pra analytics. ext_inscricoes = fonte redundante pós-virada (linhas migradas ficam de fora via legado_ref). next_inscricoes NÃO é porta: é presença por encontro (decisão 2026-07-30). Acesso exclusivo via backend.';

-- ── PARTE 3 · matrículas órfãs voltam pra pessoa certa (CASO 4) ─────────────
-- 58 `membro_id` (92 matrículas) apontam pra cadastro que não existe mais:
-- `merge_membros` faz HARD delete do membro fundido e descobre os filhos a
-- repontar pela FK — como as tabelas do Next não tinham FK, elas ficaram para
-- trás em cada fusão. Todos os 58 estão no `mem_merge_log`, então dá pra
-- reconstruir o destino (seguindo a cadeia: keep que também foi fundido depois).
-- Repontar troca TAMBÉM o `origem_mes_key`, que carrega o id da pessoa no texto.
DO $$
DECLARE
  r RECORD;
  v_destino UUID;
  v_hops INT;
  v_repontadas INT := 0;
  v_soltas INT := 0;
  v_redundantes INT := 0;
BEGIN
  FOR r IN
    SELECT m.id, m.membro_id, m.origem_mes_key
      FROM public.next_matriculas m
     WHERE m.membro_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.mem_membros p WHERE p.id = m.membro_id)
  LOOP
    v_destino := r.membro_id;
    v_hops := 0;
    WHILE v_hops < 10
      AND v_destino IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.mem_membros p WHERE p.id = v_destino)
    LOOP
      SELECT l.keep_id INTO v_destino
        FROM public.mem_merge_log l
       WHERE v_destino = ANY(l.merged_ids)
       LIMIT 1;
      v_hops := v_hops + 1;
    END LOOP;

    IF v_destino IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.mem_membros p WHERE p.id = v_destino) THEN
      -- Sem destino reconstruível: solta o ponteiro. A linha mantém nome e
      -- telefone como texto histórico (nada é apagado).
      UPDATE public.next_matriculas SET membro_id = NULL WHERE id = r.id;
      v_soltas := v_soltas + 1;
      CONTINUE;
    END IF;

    BEGIN
      UPDATE public.next_matriculas
         SET membro_id = v_destino,
             origem_mes_key = CASE
               WHEN r.origem_mes_key IS NULL THEN NULL
               ELSE split_part(r.origem_mes_key, '|', 1) || '|' || v_destino::text
             END,
             updated_at = now()
       WHERE id = r.id;
      v_repontadas := v_repontadas + 1;
    EXCEPTION WHEN unique_violation THEN
      -- A pessoa certa JÁ tem matrícula naquele mês: esta é a linha redundante
      -- da fusão. O `merge_membros` deleta; aqui é soft-delete, porque a tabela
      -- tem `deleted_at` e a lei nº 2 da casa vale.
      UPDATE public.next_matriculas
         SET deleted_at = now(), updated_at = now()
       WHERE id = r.id;
      v_redundantes := v_redundantes + 1;
    END;
  END LOOP;
  RAISE NOTICE 'Matrículas órfãs · repontadas: % · redundantes (soft-delete): % · ponteiro solto: %',
    v_repontadas, v_redundantes, v_soltas;
END $$;

-- ── PARTE 4 · a FK que estava faltando (CASO 4) ─────────────────────────────
-- ⚠️ LEI: `merge_membros` descobre os filhos a repontar por FOREIGN KEY
-- (pg_constraint · confrelid = mem_membros) e faz HARD delete do membro
-- fundido. Tabela com `membro_id` SEM FK fica invisível pra ele e acumula
-- ponteiro morto a cada fusão — foi exatamente o que produziu os 58 órfãos.
-- `ON DELETE SET NULL` é o padrão da casa (as 21 FKs convertidas em 2026-05-21).
-- Com a FK no lugar, toda fusão futura reponta as duas tabelas sozinha.
ALTER TABLE public.next_inscricoes
  DROP CONSTRAINT IF EXISTS next_inscricoes_membro_id_fkey;
ALTER TABLE public.next_inscricoes
  ADD CONSTRAINT next_inscricoes_membro_id_fkey
  FOREIGN KEY (membro_id) REFERENCES public.mem_membros(id) ON DELETE SET NULL;

ALTER TABLE public.next_matriculas
  DROP CONSTRAINT IF EXISTS next_matriculas_membro_id_fkey;
ALTER TABLE public.next_matriculas
  ADD CONSTRAINT next_matriculas_membro_id_fkey
  FOREIGN KEY (membro_id) REFERENCES public.mem_membros(id) ON DELETE SET NULL;

-- Conferência final.
DO $$
DECLARE v_legado INT; v_next INT; v_orfaos INT; v_total INT;
BEGIN
  SELECT count(*) INTO v_legado FROM public.vw_inscricoes_unificadas WHERE porta = 'next_legado';
  SELECT count(*) INTO v_next   FROM public.vw_inscricoes_unificadas WHERE porta = 'next';
  SELECT count(*) INTO v_total  FROM public.vw_inscricoes_unificadas;
  SELECT count(*) INTO v_orfaos FROM public.next_matriculas m
   WHERE m.membro_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.mem_membros p WHERE p.id = m.membro_id);
  RAISE NOTICE 'porta next_legado: % (esperado 0) · porta next: % · view total: % · órfãos restantes: % (esperado 0)',
    v_legado, v_next, v_total, v_orfaos;
END $$;
