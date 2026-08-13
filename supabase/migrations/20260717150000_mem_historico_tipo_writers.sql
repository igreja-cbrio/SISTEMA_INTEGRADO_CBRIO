-- ============================================================================
-- mem_historico · writers alinhados ao schema VIVO (2026-07-17)
--
-- DRIFT git↔prod descoberto na prática (warnings do backfill de voluntários):
-- em prod, mem_historico tem uma coluna `tipo text NOT NULL` com CHECK
-- (mem_historico_tipo_check) que NENHUMA migration do repo criou — e por isso
-- TODOS os writers do backend/SQL (que nunca enviavam `tipo`) falhavam em
-- silêncio: a tabela estava VAZIA em prod. Sondagem: o CHECK aceita 'outro'.
--
-- Este arquivo:
--   1. Alinha ambientes novos (ADD COLUMN IF NOT EXISTS tipo · sem NOT NULL
--      nem CHECK, porque a definição completa do CHECK de prod é desconhecida —
--      writers novos sempre enviam 'outro').
--   2. Recria fn_link_or_create_membro com `tipo` no rastro criado_auto
--      (mesma versão da 20260717120000 + o campo).
-- Os writers JS (cpfReconciliar, membresia, totemKids) foram corrigidos no
-- mesmo PR. Lição repetida do CLAUDE.md: validar contra o schema vivo, não
-- contra o arquivo da migration.
-- ============================================================================

ALTER TABLE public.mem_historico ADD COLUMN IF NOT EXISTS tipo text;

COMMENT ON COLUMN public.mem_historico.tipo IS
  'Categoria do registro. Em prod existe CHECK (mem_historico_tipo_check · criado fora das migrations) — writers automáticos usam ''outro'' e carregam a ação no prefixo [acao] da descrição.';

CREATE OR REPLACE FUNCTION public.fn_link_or_create_membro(
  p_cpf text,
  p_telefone text,
  p_email text,
  p_nome text,
  p_status_inicial text DEFAULT 'visitante',
  p_fonte text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_membro_id uuid;
  v_cpf text;
  v_tel text;
  v_email text;
BEGIN
  v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_tel := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  -- 1) CPF exato (só vivos · normalizado dos dois lados)
  IF v_cpf IS NOT NULL AND length(v_cpf) = 11 THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
       AND active = true AND deleted_at IS NULL
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 2) Telefone + NOME compatível (antes ligava por telefone SOZINHO —
  --    família compartilha o número · política membroMatch). Sem nome, não
  --    liga por telefone.
  IF v_tel IS NOT NULL AND length(v_tel) >= 10 AND p_nome IS NOT NULL AND trim(p_nome) <> '' THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND deleted_at IS NULL
       AND regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = v_tel
       AND public.fn_identidade_nomes_compativeis(nome, p_nome)
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 3) E-mail + NOME compatível quando há nome (sem nome, mantém o legado
  --    e-mail sozinho · mesmo contrato do membroMatch)
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND deleted_at IS NULL
       AND lower(trim(email)) = v_email
       AND (p_nome IS NULL OR trim(p_nome) = '' OR public.fn_identidade_nomes_compativeis(nome, p_nome))
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.mem_membros (nome, cpf, telefone, email, status, active, created_at, updated_at)
    VALUES (
      trim(p_nome),
      v_cpf,
      nullif(p_telefone, ''),
      v_email,
      coalesce(p_status_inicial, 'visitante'),
      true,
      now(),
      now()
    )
    RETURNING id INTO v_membro_id;
  EXCEPTION WHEN unique_violation THEN
    -- Corrida no CPF: religa no vencedor
    IF v_cpf IS NOT NULL THEN
      SELECT id INTO v_membro_id FROM public.mem_membros
       WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
         AND deleted_at IS NULL
       LIMIT 1;
    END IF;
    IF v_membro_id IS NULL THEN RAISE; END IF;
    PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
    RETURN v_membro_id;
  END;

  -- Rastro de auditoria: o schema VIVO exige `tipo` (NOT NULL + CHECK que
  -- aceita 'outro'). Handler específico AVISA em vez de falhar mudo.
  BEGIN
    INSERT INTO public.mem_historico (membro_id, tipo, descricao, created_at)
    VALUES (
      v_membro_id,
      'outro',
      '[criado_auto] Criado automaticamente via ' || coalesce(p_fonte, 'fluxo'),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_link_or_create_membro: rastro criado_auto não gravado (%)', SQLERRM;
  END;

  RETURN v_membro_id;
END;
$$;

COMMENT ON FUNCTION public.fn_link_or_create_membro(text, text, text, text, text, text) IS
  'Link-ou-cria mem_membros. Política do membroMatch (20260716160000): CPF → telefone+NOME → e-mail(+NOME quando há nome) · nunca telefone sozinho · só cadastros vivos · corrida 23505 religa. Registra contato divergente em mem_contatos (20260717120000) e rastro criado_auto com tipo ''outro'' (schema vivo · 20260717150000).';

-- ----------------------------------------------------------------------------
-- Conferência (depois de alguns dias):
--   SELECT tipo, left(descricao, 30), count(*) FROM mem_historico
--    GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10;   -- deve começar a popular
-- ============================================================================
