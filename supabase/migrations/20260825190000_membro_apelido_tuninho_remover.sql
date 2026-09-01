-- ============================================================================
-- Apelido "Tuninho" REMOVIDO de ANTONIO MARCO PEREIRA (2026-08-25)
--
-- Correção de DADO pedida pelo Marcos: *"o antonio marco pereira não é o
-- tuninho, pode tirar esse filtro dele de apelido"*.
--
-- O apelido foi semeado pela `20260730170000_membros_apelido.sql`, na leva da
-- busca sem acento. O caso que originou aquela leva foi a Patrícia não achando
-- o grupo do "Antônio" porque o cadastro está grafado sem acento ("ANTONIO
-- MARCO PEREIRA") — e ISSO continua resolvido: quem conserta é a busca
-- acento-insensível, que não depende de apelido nenhum. O "Tuninho" era o
-- extra, e o extra estava errado.
--
-- ⚠️⚠️ EFEITO MEDIDO EM PRODUÇÃO (25/08, antes de escrever): "Tuninho" é o
-- ÚNICO apelido de toda a base (1 linha em `mem_membros.apelido`). Depois desta
-- migration a coluna fica 100% vazia — e é o estado correto: apelido é dado que
-- a equipe cadastra caso a caso pela Membresia, nunca em massa por migration.
-- A coluna, o índice e a régua de busca por apelido FICAM (são infraestrutura,
-- e voltam a valer no primeiro apelido que alguém cadastrar de verdade).
--
-- ⚠️ Os outros Antônios NÃO são tocados — nenhum deles tem apelido, então não
-- há o que preservar além de não mexer. Medido: 19 Antônios vivos, 3 deles
-- liderando grupo (Aroldo Antonio Ramos Cartolano · ANTONIO MARCO PEREIRA ·
-- Fernando Antônio manhanini) e só o do meio com apelido.
--
-- ⚠️⚠️ A MIGRATION ORIGINAL NÃO É EDITADA (migration aplicada não se reescreve).
-- Num replay do banco do zero, a de 30/07 semeia e esta remove logo depois — a
-- ordem cronológica entrega o estado final certo sem tocar no passado.
--
-- ⚠️ `mem_membros.apelido` NÃO está entre as colunas auditadas pelo
-- `audit_log_changes` (que cobre cpf/status/deleted_at/nome/email/telefone),
-- então esta remoção não deixa trilha em `app_audit_log`. É por isso que o
-- porquê está escrito aqui e no CLAUDE.md.
-- ============================================================================

DO $$
DECLARE
  v_afetados int;
BEGIN
  -- ⚠️ Três cercas, e cada uma existe por um motivo:
  --  · o NOME  → não alcança nenhum outro cadastro;
  --  · o APELIDO ser exatamente "Tuninho" → se alguém já corrigiu o apelido
  --    dele à mão para outra coisa, a correção humana é preservada (mesma
  --    política de "não sobrescrever edição humana" do censo);
  --  · `apelido IS NOT NULL` → torna a 2ª execução um no-op silencioso.
  UPDATE public.mem_membros
     SET apelido = NULL
   WHERE upper(btrim(nome)) = 'ANTONIO MARCO PEREIRA'
     AND apelido IS NOT NULL
     AND upper(btrim(apelido)) = 'TUNINHO';

  GET DIAGNOSTICS v_afetados = ROW_COUNT;

  -- ⚠️⚠️ Apagar apelido de MAIS DE UMA pessoa é o único estrago possível aqui
  -- (haveria duplicata do mesmo nome). Aborta e devolve tudo em vez de seguir.
  IF v_afetados > 1 THEN
    RAISE EXCEPTION 'ABORTADO: % cadastros de ANTONIO MARCO PEREIRA com apelido "Tuninho" — esperado no máximo 1. Conferir duplicata na fila de Entradas antes de rodar.', v_afetados;
  END IF;

  IF v_afetados = 1 THEN
    RAISE NOTICE 'OK: apelido "Tuninho" removido de ANTONIO MARCO PEREIRA.';
  ELSE
    RAISE NOTICE 'Nada a fazer: nenhum cadastro de ANTONIO MARCO PEREIRA com apelido "Tuninho" (já removido, apelido corrigido à mão ou nome grafado diferente).';
  END IF;
END $$;

-- Conferência (roda junto e não escreve nada): esperado 0 linhas.
SELECT id, nome, apelido
  FROM public.mem_membros
 WHERE apelido IS NOT NULL;
