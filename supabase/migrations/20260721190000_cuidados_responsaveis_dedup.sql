-- Dedup dos responsáveis do atendimento (Cuidados · Próximos passos).
-- Pedido do Marcos (2026-07-21): consolidar os nomes duplicados/combinados da
-- planilha antiga no responsável canônico e remover os duplicados da lista
-- gerenciável (cui_responsaveis):
--   Kevin/Arthur, Arthur/Kevin -> Arthur Cecconi
--   Naná (e variação Nana)     -> Natasha
--   Mari                        -> Mariane
--   Carmet/Arthur               -> Carmet
-- Atualiza TODOS os registros (inclusive soft-deletados · histórico
-- consistente). Só DADOS · idempotente · o código não depende desta migration.
DO $$
DECLARE n int;
BEGIN
  UPDATE public.cui_convertidos
     SET responsavel_atendimento = 'Arthur Cecconi'
   WHERE responsavel_atendimento IN ('Kevin/Arthur', 'Arthur/Kevin');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Kevin/Arthur + Arthur/Kevin -> Arthur Cecconi: % registro(s)', n;

  UPDATE public.cui_convertidos
     SET responsavel_atendimento = 'Natasha'
   WHERE responsavel_atendimento IN ('Naná', 'Nana');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Naná -> Natasha: % registro(s)', n;

  UPDATE public.cui_convertidos
     SET responsavel_atendimento = 'Mariane'
   WHERE responsavel_atendimento = 'Mari';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Mari -> Mariane: % registro(s)', n;

  UPDATE public.cui_convertidos
     SET responsavel_atendimento = 'Carmet'
   WHERE responsavel_atendimento = 'Carmet/Arthur';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Carmet/Arthur -> Carmet: % registro(s)', n;

  -- Remove os duplicados da lista gerenciável — com guarda: só sai quem
  -- realmente ficou sem nenhum registro apontando pro nome.
  DELETE FROM public.cui_responsaveis r
   WHERE r.nome IN ('Kevin/Arthur', 'Arthur/Kevin', 'Naná', 'Nana', 'Mari', 'Carmet/Arthur')
     AND NOT EXISTS (
       SELECT 1 FROM public.cui_convertidos c
        WHERE c.responsavel_atendimento = r.nome
     );
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Responsáveis duplicados removidos da lista: %', n;
END $$;
