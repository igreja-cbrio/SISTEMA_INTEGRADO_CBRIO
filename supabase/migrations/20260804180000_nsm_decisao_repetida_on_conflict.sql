-- ============================================================================
-- Decisão REPETIDA da mesma pessoa não pode derrubar o cadastro (2026-08-04)
-- ============================================================================
-- Sintoma reportado: o Marcelo cadastra os dados de um convertido na aba
-- Decisões da Integração, aperta "Registrar" e recebe erro do servidor. Nos
-- logs de produção (04/08, 3 tentativas seguidas às 17:54/17:55/17:56 no culto
-- de domingo 11:30 de 02/08):
--
--   POST /api/kpis/cultos/78435f84-.../decisoes-pessoas 500
--   duplicate key value violates unique constraint "nsm_eventos_pessoa_valor_uq"
--
-- CAUSA: este trigger é AFTER INSERT ROW em cultos_decisoes_pessoas, e a
-- guarda de idempotência dele é por DECISÃO (origem='culto_decisao' AND
-- origem_id = NEW.id) — enquanto o índice único é por PESSOA:
--
--   nsm_eventos_pessoa_valor_uq
--     ON nsm_eventos (COALESCE(membro_id::text, visitante_id::text, cpf),
--                     valor_engajado)
--
-- Ou seja: quem JÁ tem um evento 'seguir' (porque decidiu num culto anterior,
-- ou porque outro caminho já registrou o engajamento) passa pela guarda —
-- `NEW.id` é outro —, o INSERT viola o índice, e como a exceção sobe num
-- trigger AFTER **o statement inteiro aborta**: a linha de
-- `cultos_decisoes_pessoas` NÃO é gravada e a pessoa fica de fora do sistema.
-- Medido hoje: 386 pessoas já têm evento 'seguir', então qualquer
-- re-decisão de qualquer uma delas era um 500 sem saída pela tela.
--
-- CORREÇÃO: `ON CONFLICT ... DO NOTHING` com o MESMO alvo que
-- `nsm_inserir_evento` (o outro escritor da tabela) já usa desde sempre — a
-- semântica documentada do índice é "primeiro engajamento por valor conta".
-- Segunda decisão da mesma pessoa não cria um segundo 'seguir'; o que ela
-- precisa criar é a linha da DECISÃO, e essa passa a ser gravada.
--
-- ⚠️ A expressão do ON CONFLICT tem que ser IDÊNTICA à do índice, senão o
-- Postgres recusa a inferência ("no unique or exclusion constraint matching").
-- Conferida contra pg_indexes e testada em produção antes desta migration.
--
-- ⚠️ NÃO mexer no índice: é ele que faz a NSM contar PESSOAS engajadas, não
-- eventos. Afrouxá-lo duplicaria gente no numerador.
--
-- ⚠️ Nenhum número muda com esta migration. A linha duplicada que agora é
-- ignorada nunca chegou a existir antes (o INSERT falhava). O que muda é só a
-- decisão passar a ser salva.
--
-- Resíduo consciente: re-decisão não atualiza `data_decisao` do evento 'seguir'
-- já existente (fica a data da PRIMEIRA decisão). É o que "primeiro
-- engajamento conta" significa; mudar isso é decisão de negócio, não de bug.
--
-- Base: definição VIVA em produção (inclui o `SET search_path` que o arquivo
-- de 20260518150000 não tem — replicar a partir do arquivo apagaria essa
-- proteção em silêncio).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_jornada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
  DECLARE
    v_data_culto date;
  BEGIN
    -- KIDS: não cria trilha de conversão nem nsm_eventos (criança não segue a
    -- jornada · decisão do Marcos).
    IF NEW.tipo_decisao = 'kids' THEN
      RETURN NEW;
    END IF;

    IF NEW.membro_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT data INTO v_data_culto FROM public.cultos WHERE id = NEW.culto_id;
    IF v_data_culto IS NULL THEN v_data_culto := CURRENT_DATE; END IF;

    -- Trilha de conversão (idempotente · guarda por membro+etapa, que é a
    -- chave real dela — este ramo nunca teve o problema).
    IF NOT EXISTS (
      SELECT 1 FROM public.mem_trilha_valores
       WHERE membro_id = NEW.membro_id AND etapa = 'conversao'
    ) THEN
      INSERT INTO public.mem_trilha_valores (
        membro_id, etapa, concluida, data_conclusao, observacoes
      ) VALUES (
        NEW.membro_id, 'conversao', true, v_data_culto,
        'Decisao registrada no culto (cultos_decisoes_pessoas.id=' || NEW.id::text || ')'
      );
    END IF;

    -- Evento NSM. A guarda por origem/origem_id continua como atalho barato
    -- pro re-insert da MESMA decisão; o ON CONFLICT é o que segura a decisão
    -- REPETIDA da mesma pessoa (índice é por pessoa+valor, não por decisão).
    IF NOT EXISTS (
      SELECT 1 FROM public.nsm_eventos
       WHERE origem = 'culto_decisao' AND origem_id = NEW.id
    ) THEN
      INSERT INTO public.nsm_eventos (
        membro_id, cpf, nome,
        data_decisao, valor_engajado, data_engajamento,
        origem, origem_id, observacao
      ) VALUES (
        NEW.membro_id, NEW.cpf, NEW.nome,
        v_data_culto, 'seguir', v_data_culto,
        'culto_decisao', NEW.id,
        'Decisao de Cristo registrada via modal de culto'
      )
      ON CONFLICT (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado)
        DO NOTHING;
    END IF;

    RETURN NEW;
  END $function$;

COMMENT ON FUNCTION public.tg_cultos_dec_pessoas_jornada() IS
  'Decisão de culto -> trilha de conversão + evento NSM. O INSERT em '
  'nsm_eventos é ON CONFLICT DO NOTHING porque o índice único é por '
  '(pessoa, valor) e a pessoa pode decidir mais de uma vez: sem isso a '
  'exceção do AFTER trigger abortava o cadastro da decisão inteiro '
  '(incidente 2026-08-04).';
