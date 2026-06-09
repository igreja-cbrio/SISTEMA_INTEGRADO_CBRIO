-- Renomeia o módulo "Expansão" → "Planejamento Estratégico" (apenas EXIBIÇÃO).
--
-- Mudança conceitual (Marcos · 2026-06-09): o módulo passa a ser a disciplina
-- contínua de PLANEJAMENTO ESTRATÉGICO. "Expansão" deixa de ser o nome do módulo
-- e passa a ser o nome do PLANO/eixo plurianual vigente — o Quadriênio 2026–2029
-- do Pr. Pedrão. Quando esse ciclo terminar, um novo plano é construído, e os
-- planos encerrados ganham um parecer documental (retrospectiva das entregas por
-- etapa). Esta migration só atualiza o rótulo; a estrutura cíclica vem em PR
-- próprio (ver CLAUDE.md · Planejamento Estratégico).
--
-- ⚠️ O slug 'expansao' e a rota '/expansao' PERMANECEM (são identificadores):
-- mexer neles quebraria ROUTE_MODULE_MAP, a matriz cargo×módulo, current_user_
-- module_level e bookmarks. A regra de acentuação vale pro nome exibido, não pro
-- slug. Idempotente · só toca a coluna de exibição (sem impacto em RLS/permissão).

UPDATE public.modulos
   SET nome      = 'Planejamento Estratégico',
       descricao = 'Planejamento estratégico plurianual · etapas e marcos (plano vigente: Expansão 2026–2029 · Pr. Pedrão)'
 WHERE slug = 'expansao';
