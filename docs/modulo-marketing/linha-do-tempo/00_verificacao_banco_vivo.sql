-- ════════════════════════════════════════════════════════════════════════
-- Linha do tempo do Marketing · FASE 0 · conferência no banco vivo
-- SÓ LEITURA. Rodar no SQL Editor do Supabase ANTES das migrations
-- 20260925100000…140000 e colar o resultado de volta na conversa.
--
-- É UMA consulta só, de propósito: o SQL Editor mostra apenas o resultado
-- da ÚLTIMA instrução, e com 13 SELECTs soltos 12 respostas sumiriam.
-- O resultado é 1 linha com 1 coluna JSON (q01…q13) · copiar o valor inteiro.
-- Se der erro, colar a mensagem: ela diz qual tabela/coluna não existe,
-- e isso já é resposta da Fase 0.
--
-- Por quê: events, event_categories, event_cycle_phases, cycle_phase_tasks,
-- cycle_phase_templates e adm_task_templates foram criadas FORA do git. As
-- migrations da linha do tempo assumem nomes e tipos que só o banco confirma.
-- ════════════════════════════════════════════════════════════════════════

SELECT jsonb_build_object(
  'q01', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 1. Colunas e tipos das tabelas do ciclo (confere prazo = date, status text…)
    SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('events', 'event_categories', 'event_cycle_phases',
                          'cycle_phase_tasks', 'cycle_phase_templates', 'adm_task_templates')
     ORDER BY table_name, ordinal_position
  ) x),
  'q02', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 2. Categorias de evento (a migration procura 'Série' / 'Serie' / 'Séries')
    SELECT id, name, active FROM public.event_categories ORDER BY sort_order NULLS LAST, name
  ) x),
  'q03', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 3. Fases do ciclo criativo (offsets em DIAS antes do Dia D)
    SELECT category_id, numero, nome, area, semanas_inicio AS dias_inicio, semanas_fim AS dias_fim
      FROM public.cycle_phase_templates
     ORDER BY category_id NULLS FIRST, numero
  ) x),
  'q04', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 4. Quais tarefas de marketing o ciclo gera (vira a lista de "tarefas por etapa")
    SELECT etapa, titulo, offset_start, offset_end, category_id, ativo
      FROM public.adm_task_templates
     WHERE LOWER(area) = 'marketing'
     ORDER BY category_id NULLS FIRST, sort_order
  ) x),
  'q05', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 5. Quantas tarefas de marketing por fase nos ciclos que já existem
    SELECT ecp.nome_fase, count(*) AS tarefas, count(DISTINCT t.titulo) AS titulos_distintos
      FROM public.cycle_phase_tasks t
      JOIN public.event_cycle_phases ecp ON ecp.id = t.event_phase_id
     WHERE LOWER(t.area) = 'marketing'
     GROUP BY ecp.nome_fase ORDER BY 1
  ) x),
  'q06', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 6. Valores de status em uso (a migration trata 'concluida' como fechado)
    SELECT status, count(*) FROM public.cycle_phase_tasks GROUP BY status ORDER BY 2 DESC
  ) x),
  'q07', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 7. Séries de 2027 já cadastradas como evento? E com ciclo ativo?
    SELECT e.id, e.name, e.date, c.name AS categoria,
           EXISTS (SELECT 1 FROM public.event_cycles ec WHERE ec.event_id = e.id) AS tem_ciclo
      FROM public.events e
      LEFT JOIN public.event_categories c ON c.id = e.category_id
     WHERE e.date BETWEEN '2026-11-01' AND '2027-12-31'
     ORDER BY e.date
  ) x),
  'q08', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 8. Equipe do marketing (a seed procura Cauã e Letícia pelo nome)
    SELECT m.id, p.name, m.habilidade, m.horas_semanais, m.slots_dia, m.ativo
      FROM public.marketing_membros m
      LEFT JOIN public.profiles p ON p.id = m.profile_id
     WHERE m.deleted_at IS NULL
     ORDER BY m.ativo DESC, p.name
  ) x),
  'q09', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 9. Padrões por fase que já existem (culto ainda não existe aqui)
    SELECT p.category_id, c.name, p.nome_fase, p.atribuido_a, p.ativo
      FROM public.marketing_ciclo_padroes p
      LEFT JOIN public.event_categories c ON c.id = p.category_id
     ORDER BY c.name, p.nome_fase
  ) x),
  'q10', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 10. Nome real da UNIQUE que a Fase 2 derruba
    SELECT conname, pg_get_constraintdef(oid)
      FROM pg_constraint
     WHERE conrelid = 'public.marketing_ciclo_padroes'::regclass AND contype = 'u'
  ) x),
  'q11', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 11. Triggers vivos nas tabelas que as migrations tocam (pega trigger feito fora do git)
    SELECT tgrelid::regclass AS tabela, tgname, pg_get_triggerdef(oid) AS def
      FROM pg_trigger
     WHERE NOT tgisinternal
       AND tgrelid IN ('public.cycle_phase_tasks'::regclass, 'public.marketing_kanban_cards'::regclass,
                       'public.marketing_card_checklist'::regclass, 'public.marketing_campanhas'::regclass,
                       'public.solicitacoes'::regclass)
     ORDER BY 1, 2
  ) x),
  'q12', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 12. De que áreas vêm os pedidos de marketing (base das regras de roteamento)
    SELECT area_cliente, count(*) AS pedidos, max(created_at) AS ultimo
      FROM public.solicitacoes
     WHERE area_responsavel = 'marketing'
     GROUP BY area_cliente ORDER BY 2 DESC
  ) x),
  'q13', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    -- 13. Rotina: compromissos recorrentes e quem participa
    SELECT r.id, r.descricao, r.dia_semana, r.hora_inicio, r.duracao_h, r.ativo,
           string_agg(p.name, ', ') AS participantes
      FROM public.marketing_compromissos_recorrentes r
      LEFT JOIN public.marketing_recorrentes_participantes rp ON rp.compromisso_id = r.id
      LEFT JOIN public.marketing_membros m ON m.id = rp.membro_id
      LEFT JOIN public.profiles p ON p.id = m.profile_id
     WHERE r.deleted_at IS NULL
     GROUP BY r.id ORDER BY r.dia_semana, r.hora_inicio
  ) x)
) AS fase0;
