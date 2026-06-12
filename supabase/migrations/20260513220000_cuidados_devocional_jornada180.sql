-- ============================================================================
-- Cuidados absorve Devocional + Jornada 180 inscricoes
--
-- Marcos: "devocional e jornada 180 sao pertencentes a cuidados, adicione
--          no modulo deles essa logica, inclusive em cuidados ja tem uma
--          aba de jornada 180"
--
-- Frontend: aba 'Mensal / Agregado' em /cuidados agora aceita 5 tipos
-- (era 2 · aconselhamento, capelania + adicionados devocional,
--  jornada180_inscricoes, novos_convertidos_atend)
--
-- Backend: POST /cuidados/agregado mirror em dados_brutos pra alimentar KPIs
--
-- Migration: marca tipos como entrada_manual=false (vem do modulo, nao de
-- /dados-brutos)
-- ============================================================================

UPDATE public.tipos_dado_bruto
   SET entrada_manual = false
 WHERE id IN (
   'devocionais',
   'inscricoes_jornada180',
   'solicitacoes_capelania',
   'solicitacoes_aconselh',
   'novos_convertidos_atend'
 );

-- Conferencia:
-- SELECT id, entrada_manual FROM tipos_dado_bruto
--  WHERE id IN ('devocionais','inscricoes_jornada180','solicitacoes_capelania','solicitacoes_aconselh','novos_convertidos_atend');
-- Espera: todos com entrada_manual = false
-- ============================================================================
