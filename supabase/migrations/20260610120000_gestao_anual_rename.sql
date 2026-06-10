-- Renomeia o módulo "Planejamento" (/planejamento · ex-PMO) → "Gestão Anual".
--
-- Mudança conceitual (Marcos · 2026-06-10): o /planejamento deixa de ser o painel
-- PMO consolidado e passa a ser a casa da ROTINA fora do ano corrente — planejar o
-- próximo ano (eventos/projetos) e ver os resultados dos anos fechados. Fica
-- SEPARADO do "Planejamento Estratégico" (ex-Expansão, plurianual/macro-eixo), pra
-- não misturar estratégico com rotina.
--
-- ⚠️ Só rótulo de exibição. O slug 'planejamento' e a rota '/planejamento'
-- PERMANECEM (identificadores · mexer quebraria ROUTE_MODULE_MAP, matriz de
-- permissões e bookmarks). A repaginação da página (abas "Próximo ano" e
-- "Resultados") + o recorte de ano em Projetos/Eventos vêm em PRs próprios.
-- Idempotente · só toca a coluna de exibição.

UPDATE public.modulos
   SET nome      = 'Gestão Anual',
       descricao = 'Planejamento do próximo ano e resultados dos anos fechados (eventos e projetos). Rotina · separado do Planejamento Estratégico.'
 WHERE slug = 'planejamento';
