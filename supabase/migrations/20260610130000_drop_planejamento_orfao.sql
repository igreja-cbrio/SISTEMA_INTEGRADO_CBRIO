-- Remove o esqueleto órfão do Planejamento Anual (propostas + aprovação diretor→diretoria).
--
-- Contexto (Marcos · 2026-06-10): a feature de "propor eventos/projetos do ano seguinte
-- com aprovação" nunca foi usada (1 ciclo vazio, 0 propostas). O modelo novo é nativo:
-- planejar o próximo ano direto no hub "Gestão Anual" + recorte de ano em Projetos/Eventos.
-- As telas órfãs (/planejamento/anual) e o painel PMO antigo saíram no código (PR-D).
--
-- MANTÉM:
--   • event_liturgia_templates → usada pelo hub ("Gerar litúrgicos {ano}")
--   • planejamento_ciclos       → registro leve de "ano de planejamento" (dormente · pode virar portão)
--
-- As colunas events.proposta_id / projects.proposta_id NÃO são dropadas (só a FK),
-- pra não esbarrar em nenhum INSERT que ainda as toque — ficam como uuid solto, inócuo.
-- ⚠️ DESTRUTIVO (DROP TABLE). Rodar no SQL Editor. As tabelas estão vazias/0 uso.

ALTER TABLE public.events   DROP CONSTRAINT IF EXISTS events_proposta_id_fkey;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_proposta_id_fkey;

DROP TABLE IF EXISTS public.planejamento_audit;
DROP TABLE IF EXISTS public.planejamento_propostas;
DROP TABLE IF EXISTS public.planejamento_areas_setor;
DROP TABLE IF EXISTS public.planejamento_setores;
