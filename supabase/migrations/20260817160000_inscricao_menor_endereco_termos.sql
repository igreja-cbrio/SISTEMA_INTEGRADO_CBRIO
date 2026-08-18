-- ============================================================================
-- INSCRIÇÃO · BLOCO DO RESPONSÁVEL (MENOR) · ENDEREÇO OBRIGATÓRIO · TERMOS EXTRA
-- 2026-08-17 — perguntas do retiro 2027 (PDF do Arthur, trazido pelo Marcos)
--
-- O PDF pede três coisas que a espinha de inscrições não sabia fazer:
--   1. bloco *"caso for menor de idade"* — nome, CPF, parentesco, celular e
--      e-mail do responsável + a autorização dele pra a pessoa se batizar;
--   2. **endereço completo** entre os dados (hoje é fixo-OPCIONAL em todas as
--      portas, por decisão de 28/07 · Marcos autorizou tornar obrigatório
--      NESTE evento, sem mexer em nenhum outro formulário);
--   3. dois aceites próprios do evento: "Termos de Responsabilidade — Menor de
--      idade" e "Informações Sobre o Retiro".
--
-- ⚠️ Tudo POR EVENTO, nunca global: quem tem menor é o retiro; o Celebra não
-- cobra nada e não pede endereço. Coluna global mudaria as 5 portas de uma vez.
--
-- ⚠️ Aditiva e idempotente. Os defaults reproduzem EXATAMENTE o comportamento
-- de hoje (`false` / `[]`), então nenhum evento existente muda de fluxo pela
-- aplicação desta migration.
-- ============================================================================

-- ── 1 · Configuração no EVENTO ─────────────────────────────────────────────
ALTER TABLE public.insc_eventos
  ADD COLUMN IF NOT EXISTS exigir_endereco   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exige_dados_menor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS termos_extra      jsonb   NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.insc_eventos.exigir_endereco IS
  'Endereço passa a ser OBRIGATÓRIO neste evento. Default false = fixo-opcional, o comportamento do Contrato de Inscrição (28/07). Faz sentido em retiro/viagem: emergência, menor de idade, transporte.';

COMMENT ON COLUMN public.insc_eventos.exige_dados_menor IS
  'Pede os dados do RESPONSÁVEL quando a pessoa é menor de 18 na data da inscrição (LGPD art. 14 §1º). ⚠️ A régua é backend/utils/inscricaoMenor.js e vale para a tela E para o servidor — não duplicar. Evento sem a marca não pergunta nada.';

COMMENT ON COLUMN public.insc_eventos.termos_extra IS
  'Aceites PRÓPRIOS deste evento, além do termo de LGPD fixo. Lista de {chave, titulo, texto, url?}. Cada um vira linha em inscricao_consentimentos (tipo=''evento_termo'') com o texto EXIBIDO como snapshot. ⚠️ NÃO é campo do construtor: consentimento é prova legal, não resposta de pergunta.';

-- ⚠️ A forma da lista é conferida NO BANCO, não só na rota: script, SQL Editor e
-- import escrevem aqui também, e um valor que não é ARRAY faz todo leitor
-- (`Array.isArray`) tratar a lista como vazia — os aceites desapareceriam da tela
-- **em silêncio**, que é exatamente o tipo de falha que este projeto persegue.
--
-- ⚠️⚠️ `CASE`, não `AND`: a ordem de avaliação de `AND` **não é garantida** no
-- Postgres, e `jsonb_array_length` de um objeto LEVANTA erro
-- (`cannot get array length of a non-array`) em vez de devolver false. Com `CASE`
-- o `jsonb_array_length` só é alcançado quando já se sabe que é array, e o
-- resultado é um 23514 limpo, com o nome da constraint na mensagem.
--
-- ⚠️ A forma de CADA ITEM (`chave` e `texto` não vazios) fica de fora daqui, e é
-- decisão: exigi-la no banco pediria `jsonb_array_elements`, que é função de
-- CONJUNTO — e **CHECK não aceita subquery** (0A000, o erro que derrubou a 1ª
-- versão desta migration). O caminho seria uma função IMMUTABLE, que eu
-- descartei: `pg_dump` escreve o CHECK junto da tabela e pode restaurar ANTES da
-- função existir. E o que se ganharia é pequeno — item malformado é FILTRADO
-- pelos leitores (`.filter(t => t.chave && t.texto)` na rota pública e no POST),
-- então ele degrada pra "não aparece", nunca pra consentimento vazio gravado.
-- Quem garante a forma do item é `sanitizeTermosExtra` em routes/inscricoes.js.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.insc_eventos'::regclass
       AND conname  = 'chk_insc_eventos_termos_extra'
  ) THEN
    ALTER TABLE public.insc_eventos
      ADD CONSTRAINT chk_insc_eventos_termos_extra CHECK (
        CASE jsonb_typeof(termos_extra)
          WHEN 'array' THEN jsonb_array_length(termos_extra) <= 6
          ELSE false
        END
      );
  END IF;
END $$;

-- ── 2 · Dados do responsável na INSCRIÇÃO ──────────────────────────────────
-- ⚠️ COLUNAS, não `dados` jsonb. Três motivos, e o 3º é o que decide:
--   · são dados VALIDADOS (CPF com DV, telefone com DDD) — o jsonb do construtor
--     aceita qualquer texto;
--   · o contato do responsável é OPERACIONAL (a equipe liga pra esse número no
--     dia), e não pode depender de uma `key` de pergunta que alguém renomeia;
--   · `dados` é o armazém do form-builder. Misturar um conceito de primeira
--     classe ali é exatamente o que o desenho "campos padrão travados" evita.
ALTER TABLE public.inscricoes
  ADD COLUMN IF NOT EXISTS responsavel_nome             text,
  ADD COLUMN IF NOT EXISTS responsavel_cpf              text,
  ADD COLUMN IF NOT EXISTS responsavel_parentesco       text,
  ADD COLUMN IF NOT EXISTS responsavel_telefone         text,
  ADD COLUMN IF NOT EXISTS responsavel_email            text,
  ADD COLUMN IF NOT EXISTS responsavel_autoriza_batismo boolean;

COMMENT ON COLUMN public.inscricoes.responsavel_nome IS
  'Responsável legal, preenchido quando a pessoa é menor de 18 na inscrição (evento com exige_dados_menor). NULL = inscrição de maior de idade, ou evento que não pede.';
COMMENT ON COLUMN public.inscricoes.responsavel_cpf IS
  'CPF do responsável, digits-only e com DV validado na porta (mesma régua do CPF da pessoa — é por CPF que o matcher canônico liga gente).';
COMMENT ON COLUMN public.inscricoes.responsavel_autoriza_batismo IS
  'O responsável autoriza o menor a se batizar no evento? TRUE/FALSE respondido · NULL = não respondeu (a pergunta é sobre INTERESSE em batizar — quem não pretende não precisa responder). ⚠️ NUNCA tratar NULL como autorizado.';

-- ⚠️ CPF do responsável guardado digits-only, como o da pessoa: máscara aqui não
-- casa com o índice único de CPF nem com o lookup de dedup — é fábrica silenciosa
-- de duplicata (lição da migration 20260804140000).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.inscricoes'::regclass
       AND conname  = 'chk_inscricoes_responsavel_cpf_digits'
  ) THEN
    ALTER TABLE public.inscricoes
      ADD CONSTRAINT chk_inscricoes_responsavel_cpf_digits
      CHECK (responsavel_cpf IS NULL OR responsavel_cpf ~ '^[0-9]{11}$');
  END IF;
END $$;

-- ── 3 · O consentimento do termo do evento ─────────────────────────────────
-- ⚠️⚠️ O CHECK de `tipo` é AMPLIADO com GUARDA DE DRIFT. A definição VIVA foi
-- sondada em 17/08 (INSERT com tipo='evento_termo' → 23514) e os tipos gravados
-- são exatamente os 4 originais. Se a lista viva divergir do esperado, ABORTA em
-- vez de reescrever: um `DROP + ADD` cego apagaria um tipo que outra frente
-- acrescentou em produção, e o efeito seria consentimento parando de ser gravado
-- — em silêncio, porque `registrarConsentimentos` é best-effort.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.inscricao_consentimentos'::regclass
     AND conname  = 'inscricao_consentimentos_tipo_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'inscricao_consentimentos_tipo_check não existe — conferir o catálogo antes de prosseguir';
  END IF;

  IF position('evento_termo' in v_def) > 0 THEN
    RAISE NOTICE 'CHECK de tipo já aceita evento_termo — nada a fazer';
  ELSE
    IF position('termos_lgpd' in v_def) = 0
       OR position('imagem' in v_def) = 0
       OR position('menor_responsavel' in v_def) = 0
       OR position('whatsapp' in v_def) = 0 THEN
      RAISE EXCEPTION 'CHECK de tipo divergiu do esperado (%). ABORTANDO — conferir a definição viva antes de ampliar.', v_def;
    END IF;
    ALTER TABLE public.inscricao_consentimentos
      DROP CONSTRAINT inscricao_consentimentos_tipo_check;
    ALTER TABLE public.inscricao_consentimentos
      ADD CONSTRAINT inscricao_consentimentos_tipo_check
      CHECK (tipo IN ('termos_lgpd', 'imagem', 'menor_responsavel', 'whatsapp', 'evento_termo'));
    RAISE NOTICE 'CHECK de tipo ampliado com evento_termo';
  END IF;
END $$;

COMMENT ON COLUMN public.inscricao_consentimentos.tipo IS
  'termos_lgpd · imagem · menor_responsavel (LGPD art. 14 §1º) · whatsapp (opt-in D4) · evento_termo (aceite próprio do evento, configurado em insc_eventos.termos_extra — o `texto` guarda o snapshot do que a pessoa LEU).';

-- ── Conferência (rodar À PARTE, no catálogo — nunca confiar no "success") ───
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_name = 'insc_eventos'
--    and column_name in ('exigir_endereco','exige_dados_menor','termos_extra');
--
-- select column_name from information_schema.columns
--  where table_name = 'inscricoes' and column_name like 'responsavel%';
--
-- select pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.inscricao_consentimentos'::regclass
--    and conname = 'inscricao_consentimentos_tipo_check';   -- deve citar evento_termo
--
-- Deve RECUSAR (23514):
--   update insc_eventos set termos_extra = '{"chave":"x"}'::jsonb where id = '<id>';  -- não é array
--   update inscricoes set responsavel_cpf = '123.456.789-00' where id = '<id>';       -- com máscara
--
-- Deve PASSAR (item malformado é filtrado na LEITURA, não no banco — ver o ⚠️ do
-- CHECK de termos_extra):
--   update insc_eventos set termos_extra = '[{"chave":"x"}]'::jsonb where id = '<id>';
