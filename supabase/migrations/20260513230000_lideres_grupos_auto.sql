-- ============================================================================
-- Tipos lideres_treinados e lideres_acompanhados viram automaticos (Grupos·Supervisao)
--
-- Marcos: "ainda existe a area de registrar dados e ainda da pra registrar
--          dados · cheque se os dados vao conseguir ser preenchidos de uma
--          boa forma"
--
-- Agora que o modulo Grupos tem:
--  - mem_grupo_membros.funcao = 'lider_treinamento'
--  - grupo_supervisao_visitas (visitas registradas pelo supervisor)
--
-- Esses 2 tipos param de exigir input manual em /dados-brutos:
--  - lideres_treinados      → count membros funcao='lider_treinamento'
--  - lideres_acompanhados   → count grupos visitados no mes pelo supervisor
--
-- Os coletores SQL ficam em kpiAutoCollector.js · aqui so marca entrada_manual=false
-- ============================================================================

UPDATE public.tipos_dado_bruto
   SET entrada_manual = false,
       origem_tabela = CASE
         WHEN id = 'lideres_treinados'    THEN 'mem_grupo_membros'
         WHEN id = 'lideres_acompanhados' THEN 'grupo_supervisao_visitas'
         ELSE origem_tabela
       END
 WHERE id IN ('lideres_treinados', 'lideres_acompanhados');

-- Conferencia:
-- SELECT id, entrada_manual, origem_tabela FROM tipos_dado_bruto
--  WHERE id IN ('lideres_treinados', 'lideres_acompanhados');
-- Espera: ambos com entrada_manual=false
-- ============================================================================
