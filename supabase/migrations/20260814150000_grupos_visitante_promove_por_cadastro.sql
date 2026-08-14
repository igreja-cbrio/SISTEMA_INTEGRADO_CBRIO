-- ============================================================================
-- Grupos · visitante deixa de ser visitante quando TEM OS DADOS, não quando
--          aparece no encontro
-- ============================================================================
-- Régua do Matheus (13/08/2026), completando a decisão de `20260814120000`:
--
--   "quem o líder realmente identifica como visitante, deve ser visitante."
--   "só não vai ser visitante aquele de quem tivermos os dados completos (os
--    mesmos que pedimos no momento da inscrição) — ou seja, se a pessoa se
--    inscrever ela já é membro. Se um visitante for, ele vai ser visitante, e
--    aí o líder deve ter o papel de ver se ele começa a ser frequentador,
--    pegar os dados dele, e aí ele já entra na categoria de membro."
--
-- ⚠️⚠️ O QUE ESTAVA ERRADO: a declaração do líder durava até a PRIMEIRA CHAMADA.
--
--   1. O líder registra o visitante do encontro (`POST /public/grupos/grupo/
--      frequencia/visitante`) → o vínculo nasce `funcao='visitante'`. Correto.
--   2. Ele marca a presença desse visitante — que é EXATAMENTE o motivo de ter
--      registrado a pessoa (o endpoint existe pra ela "aparecer na chamada").
--   3. `registrar_encontro_grupo` incrementa `mem_grupo_membros.presencas` →
--      `tg_grupo_auto_membro` dispara e converte visitante → frequentador.
--
--   Ou seja: o sistema apagava a leitura do líder no primeiro encontro em que a
--   pessoa aparecia. O trigger foi criado em 23/07 pra promover o NOVO ENTRANTE
--   (que naquela época nascia visitante por default da coluna). Desde
--   `20260814120000` ninguém mais nasce visitante — só quem o líder DECLARA —
--   então o único efeito que sobrou pra ele era desfazer essa declaração.
--
-- A REGRA NOVA: presença não promove ninguém. Quem promove é o CADASTRO ficar
-- completo — que é o gesto do "pegar os dados dele".
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Sai a promoção por presença
--
-- ⚠️ Dropo o TRIGGER e deixo a função `fn_grupo_auto_membro` existindo, com
-- COMMENT de depreciação: religar é recriar o trigger (1 comando), e apagar a
-- função tornaria o caminho de volta mais difícil do que precisa ser.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_grupo_auto_membro ON public.mem_grupo_membros;

COMMENT ON FUNCTION public.fn_grupo_auto_membro() IS
  'DEPRECIADA em 13/08/2026 — SEM TRIGGER. Promovia visitante → frequentador na '
  '1ª presença (regra de 23/07, quando o novo entrante nascia visitante). Como '
  '`visitante` passou a ser DECLARADO pelo líder, promover por presença apagava '
  'a declaração dele no primeiro encontro. Quem promove agora é o cadastro ficar '
  'completo (tg_grupo_visitante_vira_participante). NÃO recriar o trigger sem '
  'falar com o Matheus.';

-- ----------------------------------------------------------------------------
-- 2) "Dados completos" = os campos que a INSCRIÇÃO pede
--
-- ⚠️ Espelha `backend/utils/prontidaoCadastro.js` (a régua da fila de cadastros,
-- que por sua vez espelha o Contrato de Inscrição): nome completo sem
-- abreviação · CPF com DV · telefone · e-mail · nascimento plausível · sexo.
--
-- ⚠️ DUAS diferenças CONSCIENTES em relação àquele arquivo, as duas porque ele
-- avalia `mem_cadastros_pendentes` (uma submissão) e aqui avaliamos
-- `mem_membros` (a pessoa):
--
--   · `aceita_termos` FICA DE FORA. Termo é prova de consentimento de UMA porta,
--     não atributo do cadastro — e o visitante que o líder cadastrou à mão nunca
--     vai ter um. Exigi-lo tornaria impossível justamente o caminho que o
--     Matheus descreveu (o líder pega os dados e a pessoa vira participante).
--   · telefone confere 10-11 DÍGITOS (a régua do Contrato de Inscrição), não a
--     `telefoneAlcancavel` do JS, que também exige DDD real + o 9 do celular.
--     Aquela é régua de ENVIO (a mensagem chega?), e a pergunta aqui é de
--     CADASTRO (temos o dado?). Divergem só em telefone com DDD inexistente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_nome_completo_pessoa(p text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  -- 2+ tokens e nenhum token com menos de 2 letras ("Maria M. Silva" reprova:
  -- o Contrato de Inscrição proíbe abreviação).
  SELECT COALESCE((
    SELECT count(*) >= 2 AND bool_and(length(replace(t, '.', '')) >= 2)
      FROM unnest(regexp_split_to_array(btrim(regexp_replace(COALESCE(p, ''), '\s+', ' ', 'g')), ' ')) AS t
     WHERE t <> ''
  ), false)
$$;

COMMENT ON FUNCTION public.fn_nome_completo_pessoa(text) IS
  'Nome completo sem abreviação (2+ tokens, nenhum com menos de 2 letras). '
  'Espelho SQL de nomeCompleto() em backend/utils/prontidaoCadastro.js.';

CREATE OR REPLACE FUNCTION public.fn_membro_cadastro_completo(
  p_nome       text,
  p_cpf        text,
  p_telefone   text,
  p_email      text,
  p_nascimento date,
  p_genero     text
) RETURNS boolean
LANGUAGE sql STABLE AS $$   -- STABLE, não IMMUTABLE: usa current_date
  SELECT public.fn_nome_completo_pessoa(p_nome)
     AND public.fn_cpf_dv_valido(p_cpf)
     AND length(regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g')) BETWEEN 10 AND 11
     AND COALESCE(p_email, '') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     AND p_nascimento IS NOT NULL
     AND p_nascimento <= current_date
     AND p_nascimento > (current_date - interval '120 years')
     AND lower(btrim(COALESCE(p_genero, ''))) IN ('masculino', 'feminino', 'm', 'f')
$$;

COMMENT ON FUNCTION public.fn_membro_cadastro_completo(text, text, text, text, date, text) IS
  'A pessoa tem os dados que a inscrição pede? (nome completo · CPF com DV · '
  'telefone 10-11 dígitos · e-mail · nascimento plausível · sexo). Espelha '
  'backend/utils/prontidaoCadastro.js SEM aceita_termos (termo é prova de porta, '
  'não atributo do cadastro).';

-- ----------------------------------------------------------------------------
-- 3) O gesto de "pegar os dados" promove sozinho
--
-- ⚠️⚠️ Só na TRANSIÇÃO incompleto → completo. Se disparasse sempre que o cadastro
-- estivesse completo, qualquer atualização futura (o censo corrigindo um
-- telefone, por exemplo) promoveria visitantes de grupos que a pessoa só visitou
-- uma vez. Comparando OLD e NEW, o gatilho é o dado CHEGAR — que é o gesto que
-- o Matheus descreveu.
--
-- ⚠️ Corolário aceito: quem JÁ tinha cadastro completo antes de o líder
-- registrá-la como visitante continua visitante (nada muda no cadastro dela, o
-- trigger não dispara). É o comportamento conservador certo — a declaração do
-- líder vale — e o líder resolve num clique pela função, se for o caso.
--
-- ⚠️ `AFTER UPDATE OF <6 colunas>`: `mem_membros` é a tabela mais quente do
-- sistema. Sem a cláusula OF, todo UPDATE dela pagaria esta checagem.
--
-- ⚠️ Bloco protegido: falha aqui vira WARNING e NUNCA aborta a atualização do
-- cadastro. Escrituração nossa não pode impedir a operação principal — a mesma
-- lição do gatilho de auth.users (a pessoa não conseguia criar conta).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_grupo_visitante_vira_participante()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.fn_membro_cadastro_completo(new.nome, new.cpf, new.telefone, new.email, new.data_nascimento, new.genero)
     AND NOT public.fn_membro_cadastro_completo(old.nome, old.cpf, old.telefone, old.email, old.data_nascimento, old.genero)
  THEN
    BEGIN
      UPDATE public.mem_grupo_membros
         SET funcao = 'frequentador'
       WHERE membro_id  = new.id
         AND funcao     = 'visitante'
         AND saiu_em    IS NULL
         AND deleted_at IS NULL;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'fn_grupo_visitante_vira_participante(%): %', new.id, SQLSTATE;
    END;
  END IF;
  RETURN NULL;   -- AFTER trigger: retorno é ignorado
END;
$$;

COMMENT ON FUNCTION public.fn_grupo_visitante_vira_participante() IS
  'Quando o cadastro da pessoa passa de INCOMPLETO para COMPLETO, os vínculos '
  'de grupo dela que estão como visitante viram frequentador. É o "pegar os '
  'dados dele" do Matheus (13/08/2026). Só na transição — nunca em toda '
  'atualização de cadastro completo.';

DROP TRIGGER IF EXISTS tg_grupo_visitante_vira_participante ON public.mem_membros;
CREATE TRIGGER tg_grupo_visitante_vira_participante
  AFTER UPDATE OF nome, cpf, telefone, email, data_nascimento, genero
  ON public.mem_membros
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_grupo_visitante_vira_participante();

COMMIT;

-- ============================================================================
-- CONFERÊNCIA — rode e me mande.
--
-- `promocao_por_presenca_ativa` TEM que voltar 0: é o trigger que apagava a
-- leitura do líder. `promocao_por_cadastro_ativa` tem que voltar 1.
--
-- `visitantes_hoje` deve ser 0 agora (as duas levas anteriores zeraram) e vai
-- subir conforme os líderes registrarem visitantes de encontro — o que passa a
-- ser o comportamento CERTO, não um resíduo a limpar.
-- ============================================================================
SELECT
  (SELECT count(*) FROM pg_trigger
    WHERE tgname = 'tg_grupo_auto_membro' AND NOT tgisinternal)                   AS promocao_por_presenca_ativa,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname = 'tg_grupo_visitante_vira_participante' AND NOT tgisinternal)   AS promocao_por_cadastro_ativa,
  (SELECT count(*) FROM public.mem_grupo_membros
    WHERE funcao = 'visitante' AND saiu_em IS NULL AND deleted_at IS NULL)        AS visitantes_hoje,
  -- Prova viva da régua nova, sem escrever nada: quantos dos membros vivos
  -- passariam no teste de "dados completos" hoje.
  (SELECT count(*) FROM public.mem_membros
    WHERE deleted_at IS NULL
      AND public.fn_membro_cadastro_completo(nome, cpf, telefone, email, data_nascimento, genero)) AS membros_com_cadastro_completo,
  (SELECT count(*) FROM public.mem_membros WHERE deleted_at IS NULL)              AS membros_vivos;

-- ============================================================================
-- ROLLBACK (volta a promover por presença):
--
--   DROP TRIGGER IF EXISTS tg_grupo_visitante_vira_participante ON public.mem_membros;
--   CREATE TRIGGER tg_grupo_auto_membro
--     BEFORE INSERT OR UPDATE OF presencas, funcao ON public.mem_grupo_membros
--     FOR EACH ROW EXECUTE FUNCTION public.fn_grupo_auto_membro();
-- ============================================================================
