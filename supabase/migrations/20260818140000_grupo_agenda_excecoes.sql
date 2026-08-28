-- Grupos · exceções da agenda: remarcar ou cancelar UM encontro (Naná · 18/08/2026)
--
-- Pedido: no box "Próximo encontro" do app, o líder poder abrir um modal e
-- **alterar a data/hora daquele encontro específico** ou **cancelar a reunião**.
--
-- ⚠️ POR QUE TABELA NOVA, e não `mem_grupo_encontros`: aquela é o registro do
-- que ACONTECEU (com presenças) e alimenta os KPIs de frequência de grupos.
-- Gravar ali uma ocorrência FUTURA ou CANCELADA faria a frequência contar
-- encontro que não houve — a mesma armadilha do "soft-delete ingênuo deixa a
-- linha contando" que este repo já documentou. Agenda e presença são coisas
-- diferentes e ficam em tabelas diferentes.
--
-- ⚠️ O encontro recorrente NÃO é uma linha: ele é DERIVADO de
-- `mem_grupos.dia_semana` + `horario`. Então o que se guarda aqui é a EXCEÇÃO à
-- regra, identificada pela data original da ocorrência. Sem exceção, vale a
-- recorrência — que é o comportamento de hoje, intacto.

CREATE TABLE IF NOT EXISTS public.mem_grupo_agenda_excecoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id      UUID NOT NULL REFERENCES public.mem_grupos(id) ON DELETE CASCADE,
  -- A ocorrência que está sendo alterada (data que a recorrência produziria).
  data_original DATE NOT NULL,
  -- 'cancelado' = não haverá encontro nesta data.
  -- 'remarcado'  = acontece em nova_data/novo_horario.
  status        TEXT NOT NULL CHECK (status IN ('cancelado', 'remarcado')),
  nova_data     DATE,
  novo_horario  TIME,
  motivo        TEXT,
  -- Snapshot de quem decidiu (o líder costuma não ter login no ERP).
  decidido_por      UUID,
  decidido_por_nome TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Remarcado PRECISA de data nova; cancelado não pode ter.
  CONSTRAINT chk_agenda_excecao_coerente CHECK (
    (status = 'remarcado' AND nova_data IS NOT NULL)
    OR (status = 'cancelado' AND nova_data IS NULL AND novo_horario IS NULL)
  )
);

-- Uma exceção por ocorrência: remarcar de novo ATUALIZA, não empilha (senão
-- "qual das três vale?" vira pergunta sem resposta).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_grupo_agenda_excecao
  ON public.mem_grupo_agenda_excecoes (grupo_id, data_original);

CREATE INDEX IF NOT EXISTS idx_grupo_agenda_excecoes_grupo
  ON public.mem_grupo_agenda_excecoes (grupo_id, data_original DESC);

-- ⚠️ SEM `deleted_at` e FORA da whitelist de soft-delete, de propósito: não é
-- PII (é agenda de grupo) e "desfazer" aqui significa VOLTAR À RECORRÊNCIA, que
-- é literalmente apagar a exceção. Soft-delete deixaria a linha existindo e o
-- leitor teria que lembrar de filtrá-la — um jeito silencioso de o encontro
-- continuar cancelado depois de "desfazer".

ALTER TABLE public.mem_grupo_agenda_excecoes ENABLE ROW LEVEL SECURITY;

-- Leitura: quem enxerga grupos (nível 1). Escrita pelo app passa por
-- service_role no backend, que aplica o MESMO gate de "gerencia o grupo".
DROP POLICY IF EXISTS mem_grupo_agenda_excecoes_select ON public.mem_grupo_agenda_excecoes;
CREATE POLICY mem_grupo_agenda_excecoes_select ON public.mem_grupo_agenda_excecoes
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('grupos') >= 1);

DROP POLICY IF EXISTS mem_grupo_agenda_excecoes_write ON public.mem_grupo_agenda_excecoes;
CREATE POLICY mem_grupo_agenda_excecoes_write ON public.mem_grupo_agenda_excecoes
  FOR ALL TO authenticated
  USING (public.current_user_module_level('grupos') >= 3)
  WITH CHECK (public.current_user_module_level('grupos') >= 3);

DROP POLICY IF EXISTS mem_grupo_agenda_excecoes_service ON public.mem_grupo_agenda_excecoes;
CREATE POLICY mem_grupo_agenda_excecoes_service ON public.mem_grupo_agenda_excecoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Audit: mudar a data de um encontro é decisão que a coordenação vai querer
-- rastrear ("por que ninguém apareceu?").
DROP TRIGGER IF EXISTS trg_audit_grupo_agenda_excecoes ON public.mem_grupo_agenda_excecoes;
CREATE TRIGGER trg_audit_grupo_agenda_excecoes
AFTER INSERT OR UPDATE OR DELETE ON public.mem_grupo_agenda_excecoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'status,nova_data,novo_horario,motivo,decidido_por_nome'
);

COMMENT ON TABLE public.mem_grupo_agenda_excecoes IS
  'Exceções à recorrência do grupo: cancelar ou remarcar UMA ocorrência. O '
  'encontro recorrente é derivado de mem_grupos.dia_semana+horario; aqui mora '
  'só o que foge à regra. NÃO confundir com mem_grupo_encontros, que é o '
  'registro do que aconteceu (com presenças) e alimenta os KPIs.';

-- Conferência (o SQL Editor não mostra RAISE NOTICE):
--   select column_name, data_type from information_schema.columns
--    where table_name = 'mem_grupo_agenda_excecoes' order by ordinal_position;
--   select polname from pg_policies where tablename = 'mem_grupo_agenda_excecoes';
