-- ============================================================================
-- NEXT · uma turma por DOMINGO, aberta automaticamente (2026-08-26)
--
-- Pedido do Matheus: "agora é um encontro para cada turma, e vamos ter 4
-- encontros no mês, então é 1 encontro por turma, e será sempre no culto de
-- 09:30 de domingo" + "preciso que todo mês as turmas sejam abertas
-- automaticamente, sem ter que abrir manualmente no módulo".
--
-- O QUE **NÃO** PRECISOU DE MIGRATION (medido antes de escrever):
--   · `next_encontros.numero` já é CHECK (numero BETWEEN 1 AND 4) e a turma nova
--     tem UM encontro, sempre numero 1 → nada a alterar.
--   · `next_encontros.data` já é nullable.
--   · `uq_next_turmas_origem_mes` (UNIQUE em origem_mes) **não** atrapalha: as
--     turmas vivas de 2026 têm `origem_mes` NULL — só o backfill histórico de
--     2024 preencheu essa coluna. A criação automática segue deixando NULL.
--
-- O QUE ESTA MIGRATION FAZ: só a CHAVE DE IDEMPOTÊNCIA da abertura automática.
-- Sem ela, a rotina diária abriria as mesmas turmas todo dia.
-- ============================================================================

ALTER TABLE public.next_turmas
  ADD COLUMN IF NOT EXISTS auto_domingo date;

-- ⚠️⚠️ ÍNDICE **SEM PREDICADO**, de propósito — é a lei do projeto (04/08):
-- `ON CONFLICT` não infere índice PARCIAL, e a rotina de abertura depende dessa
-- inferência para pular a turma que já existe. Um `WHERE auto_domingo IS NOT
-- NULL` aqui faria o insert estourar 42P10 em vez de pular, e a falha seria
-- silenciosa (o serviço trata 23505, não 42P10).
--
-- Seguro sem predicado porque `NULLS DISTINCT` é o padrão do Postgres: as
-- turmas históricas e as criadas à mão têm `auto_domingo` NULL e nunca
-- conflitam entre si.
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_turmas_auto_domingo
  ON public.next_turmas (auto_domingo);

COMMENT ON COLUMN public.next_turmas.auto_domingo IS
  'Domingo que esta turma atende, quando ela foi ABERTA AUTOMATICAMENTE (regra de 26/08/2026: 1 turma por domingo, 1 encontro, culto de 09:30). NULL = turma criada a mao ou historica. E a chave de idempotencia da rotina diaria: o UNIQUE e SEM predicado porque ON CONFLICT nao infere indice parcial. Turma apagada NAO e recriada — o soft-delete e decisao humana e a rotina a respeita.';

-- ⚠️ Nada é preenchido retroativamente. As turmas de 2026 que existem hoje
-- (formato antigo, 2 encontros) ficam com `auto_domingo` NULL e seguem como
-- estão — a turma de agosto foi encerrada pelo Matheus em 26/08, e a regra nova
-- vale para o que a rotina abrir de setembro em diante.
