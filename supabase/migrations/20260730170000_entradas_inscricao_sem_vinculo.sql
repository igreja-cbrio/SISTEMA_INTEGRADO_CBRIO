-- ============================================================================
-- Entradas · fila nova: INSCRICAO SEM VINCULO (pares inscricao x cadastro)
-- ============================================================================
-- Pedido do Marcos (2026-07-30): "vou pedir para alguem acompanhar essa area de
-- entradas, mas nao resolva duplicatas, adicione os pares la."
--
-- O QUE MOTIVOU. A view unificada tem 445 linhas de inscricao sem `membro_id`
-- (next 194 · voluntariado 131 · espinha 97 · batismo 15 · apresentacao 4 ·
-- lideres 3 · grupos 1). Deduplicadas por pessoa dao 388 pessoas, e delas:
--   166 JA EXISTEM em mem_membros e so nao foram LIGADAS (5 por CPF, 161 por
--       telefone+nome) -> essas viram par nesta fila;
--   193 nao estao na base (a maioria e o backfill das listas de papel do Next
--       de 2024, gente que nunca preencheu formulario com CPF);
--    29 casam so por nome exato -> sinal FRACO, entram na fila marcadas como
--       tal, porque nome igual nao e prova (a lei da casa).
--
-- POR QUE NAO LIGUEI SOZINHO. Telefone e compartilhado em familia e nome
-- divergente e a regra, nao a excecao (Izabel Kahn x Izabel kahn, LUMA MONTEIRO
-- x Luma Monteiro Correa). Ligar em massa por telefone+nome e o "auto-fundir"
-- que a lei do Contrato de porta proibe, e um erro aqui gruda a inscricao de uma
-- pessoa no cadastro de outra - foi exatamente o que o import do Next fez em 25
-- casos. A decisao e humana; o sistema so apresenta a evidencia.
--
-- Aditiva e idempotente. Nao mexe em dado de pessoa.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O tipo novo no CHECK
-- ----------------------------------------------------------------------------
-- `cpf_para_confirmar` continua na lista porque a linha existe em producao (218
-- registros historicos) e o trigger de 20260718120000 e que barra INSERT novo -
-- tirar do CHECK invalidaria o historico.
ALTER TABLE public.identidade_pendencias
  DROP CONSTRAINT IF EXISTS identidade_pendencias_tipo_check;
ALTER TABLE public.identidade_pendencias
  ADD CONSTRAINT identidade_pendencias_tipo_check
  CHECK (tipo IN (
    'cpf_conflito',
    'cpf_divergente',
    'vinculo_divergente',
    'cpf_para_confirmar',
    'inscricao_sem_vinculo'
  ));

COMMENT ON COLUMN public.identidade_pendencias.tipo IS
  'cpf_conflito | cpf_divergente | vinculo_divergente | cpf_para_confirmar (historico: o trigger de 20260718120000 barra INSERT novo) | inscricao_sem_vinculo (linha de inscricao sem membro_id + o cadastro CANDIDATO em membro_id; a evidencia vai no detalhe e a decisao e humana).';

-- ----------------------------------------------------------------------------
-- 2. Conferencia (rodar depois de aplicar)
-- ----------------------------------------------------------------------------
--   SELECT tipo, status, count(*) FROM public.identidade_pendencias
--    GROUP BY 1,2 ORDER BY 1,2;
-- Depois de rodar o script de enfileiramento
-- (backend/scripts/_entradas_inscricao_sem_vinculo.cjs --exec), esperado:
-- ~166 linhas 'inscricao_sem_vinculo/pendente'.
