-- ============================================================================
-- 20260901190000_batismo_menor_sem_membro.sql
--
-- Caso Edgar/Luciana Crespo × "Betina" (01/09/2026) — correção de raiz.
--
-- O QUE ACONTECEU (cadeia completa, auditada em produção):
--   1. 23/02/2025 · Betina Pessanha Crespo (nascida 24/07/2017, criança do
--      Kids) foi batizada. A inscrição foi preenchida pela responsável
--      (Luciana Pessanha Crespo) com o CPF/telefone/e-mail DELA — padrão
--      normal de formulário de menor.
--   2. Migration 20260513200000 (seed do histórico de batismos) importou a
--      linha com o nome da CRIANÇA + contatos da MÃE.
--   3. Migration 20260515500000/510000 (backfill "batismos sem membro_id")
--      chamou fn_link_or_create_membro e CRIOU um mem_membros quimera:
--      nome da criança, CPF/telefone/e-mail da mãe.
--   4. Migration 20260716150000 (vínculo tardio por CPF) gravou a trilha
--      etapa='batismo' nesse cadastro e promoveu para membro_ativo.
--   5. 01/09/2026 · Luciana preencheu o formulário público de líderes de
--      grupos com os dados dela → o matcher (CPF/tel/e-mail, todos dela)
--      casou com a quimera → a equipe vinculou "Betina" como líder do grupo.
--
-- RAIO DE IMPACTO (medido em 01/09/2026): 90 inscrições de batismo com
-- "Responsavel:" nas observações; 57 membros com o MESMO nome da criança
-- (quimeras prováveis) e 32 linkados a cadastro de outro nome (provavelmente
-- o responsável herdando o batismo do filho). Limpeza em massa fica pra uma
-- decisão separada — esta migration corta a raiz e conserta o caso relatado.
--
-- O QUE ESTA MIGRATION FAZ:
--   1. fn_batismo_inscricao_link_membro ganha a trava de MENOR: inscrição de
--      menor de 18 anos (na data do batismo) ou marcada como criança/com
--      responsável NUNCA cria nem linka mem_membros (LGPD — mesma regra das
--      decisões kids em cultos_decisoes_pessoas: criança não entra na
--      membresia; o contato pertence ao responsável).
--   2. Data fix pontual: desliga o batismo da Betina (criança) do cadastro
--      da mãe e remove a etapa 'batismo' gravada errada na trilha dela.
--      (O cadastro 725d18a1 já foi renomeado para "Luciana Pessanha Crespo"
--      via backend em 01/09/2026 — os dados sempre foram dela.)
--
-- Idempotente: CREATE OR REPLACE + UPDATEs/DELETE com WHERE por id.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Trava de menor no trigger de batismo
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_batismo_inscricao_link_membro()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_nome_completo text;
  v_ref date;
BEGIN
  IF NEW.membro_id IS NULL THEN
    -- Menor de idade NÃO vira nem linka membro (LGPD). Os identificadores
    -- (CPF/tel/e-mail) numa inscrição de menor são do RESPONSÁVEL — linkar
    -- por eles cria membro-quimera (nome da criança + contatos do adulto)
    -- ou pendura o batismo da criança no cadastro do pai/mãe.
    v_ref := coalesce(NEW.data_batismo, CURRENT_DATE);
    IF (NEW.data_nascimento IS NOT NULL
        AND NEW.data_nascimento > (v_ref - interval '18 years'))
       OR coalesce(NEW.observacoes, '') ~* '(crian[çc]a|respons[áa]vel\s*:)' THEN
      RETURN NEW; -- segue sem membro_id · o registro do batismo fica íntegro
    END IF;

    v_nome_completo := trim(coalesce(NEW.nome, '') || ' ' || coalesce(NEW.sobrenome, ''));
    IF v_nome_completo <> '' THEN
      NEW.membro_id := public.fn_link_or_create_membro(
        NEW.cpf, NEW.telefone, NEW.email, v_nome_completo,
        'visitante',
        'batismo_inscricoes'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_batismo_inscricao_link_membro() IS
'Preenche batismo_inscricoes.membro_id via fn_link_or_create_membro. Desde 20260901190000: inscrição de MENOR (nascimento < 18 anos antes do batismo, ou observações com criança/responsável) nunca cria nem linka membro — LGPD, mesma regra das decisões kids.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Data fix · batismo da Betina (criança) desligado do cadastro da mãe
-- ─────────────────────────────────────────────────────────────────────────
-- O UPDATE dispara o trigger acima; com a trava de menor (nascida 2017),
-- o membro_id = NULL persiste — não recria quimera nem religa na mãe.
-- Os contatos (da responsável) saem dos campos de identidade e ficam
-- registrados nas observações, pra não induzir matcher nenhum de novo.
UPDATE public.batismo_inscricoes
SET membro_id = NULL,
    cpf = NULL,
    telefone = NULL,
    email = NULL,
    observacoes = coalesce(observacoes, '')
      || ' | [01/09/2026] Batismo infantil: vínculo com mem_membros removido (o cadastro linkado tinha o nome da criança com os dados da mãe — corrigido para Luciana Pessanha Crespo). Contato da responsável: tel 21994698993 · e-mail lcastelo.pessanha@gmail.com · CPF 11830996738.'
WHERE id = 'd7d34f34-514f-4f1e-bbc1-501f0a9362b2'
  AND membro_id = '725d18a1-0a80-41bf-823f-fb8ea4dd515a';

-- Trilha etapa 'batismo' gravada no cadastro da mãe pelo vínculo tardio
-- (20260716150000), mas o batismo era da filha menor. Hard delete
-- justificado: a linha nasceu no cadastro errado (não é histórico da
-- pessoa) e as agregações de 'Seguir' não filtram deleted_at de forma
-- consistente — soft-delete continuaria contando.
DELETE FROM public.mem_trilha_valores
WHERE id = 'f7ae9680-182c-405a-bb19-732d54f2c5f8'
  AND membro_id = '725d18a1-0a80-41bf-823f-fb8ea4dd515a'
  AND etapa = 'batismo';

-- NOTA: o status membro_ativo do cadastro 725d18a1 (promovido pelo batismo
-- errado) foi mantido de propósito — a Luciana é líder de grupo ativa.
