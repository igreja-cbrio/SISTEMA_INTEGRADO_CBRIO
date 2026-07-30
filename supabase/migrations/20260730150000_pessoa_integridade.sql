-- ============================================================================
-- Integridade de PESSOA · para de fabricar cadastro sem chave e liga a FK que
-- faltava na ponte do Servir (2026-07-30)
--
-- Vem da auditoria do módulo (5 agentes, 29/07). Dois problemas independentes,
-- mesma vítima: o cadastro de pessoas.
--
-- ── PROBLEMA A · o import financeiro fabrica pessoa sem chave nenhuma ───────
-- Medido em produção: em 29/07 às 16:16 entraram **3.441 linhas** em
-- `mem_membros` com `status='contribuinte_avulso'` — 46% da base viva —, e de
-- 3.442 criadas no dia exatamente **1 tem CPF, 1 telefone, 1 e-mail**. Vieram de
-- `fin_resolver_ou_criar_contribuinte`, que casa por **nome exato normalizado**
-- e, não achando, INSERE. Isso viola a lei do Contrato de Porta ("nome sozinho
-- NUNCA identifica") por um caminho paralelo ao matcher canônico.
-- Efeito medido na fila humana: rodando a `duplicidadePolicy` real sobre a base,
-- os pares candidatos saltaram de ~525 para **~9.458**, com 94% tendo ao menos
-- um lado criado naquele dia e 9.294 sem NENHUMA chave — indecidíveis por um
-- humano. A fila que existe pra resolver duplicata ficou inutilizável.
-- E o mais revelador: **as 3.441 têm ZERO contribuição apontando pra elas**
-- (`mem_contribuicoes` → 0 · a rota que as criou grava em `fin_transacoes`).
-- Foram criadas e abandonadas.
--
-- Decisão do Marcos (30/07): *"essas pessoas não podem virar membro, vai
-- confundir a base inteira, deixa só como um nome no lançamento sem vínculo com
-- membresia"*. `fin_transacoes.membro_id` é NULLABLE e a linha já guarda
-- `nome_contraparte` — então devolver NULL entrega exatamente isso, sem perder
-- um centavo de histórico financeiro.
--
-- ── PROBLEMA B · a FK que foi escrita e nunca criada ────────────────────────
-- `vol_profiles.membresia_id` tem **123 de 307 vínculos (40%) apontando pra
-- cadastro que não existe mais** — e é a ponte do valor SERVIR
-- (`vol_profiles` → `mem_voluntarios`). Causa-raiz: a migration
-- `20260504100000_pessoas_unificado.sql:32-33` escreve
-- `ADD COLUMN IF NOT EXISTS membresia_id UUID REFERENCES mem_membros(id)`, mas a
-- coluna já existia desde `20260415200000_vol_profile_completion.sql:10` — e o
-- `IF NOT EXISTS` pula o comando INTEIRO, junto com o `REFERENCES`. FK
-- "declarada" no repo e ausente no banco. É a LEI Nº 10 do CLAUDE.md com um
-- agravante: quem lê o repo conclui que a FK existe.
-- Prova do mecanismo (não é dedução): 100% dos ponteiros mortos estão em
-- `mem_merge_log.merged_ids` — cada um é membro hard-deletado por uma das 512
-- fusões, numa tabela que `merge_membros` não conseguia ver (ele descobre os
-- filhos por FK no catálogo).
--
-- ⚠️ ORDEM IMPORTA: PARTE 3 antes da 4 (FK não é criável com órfão na tabela).
-- Reversível: PARTE 1 é CREATE OR REPLACE · PARTE 2 é soft-delete (`app_restore`
-- desfaz) · PARTE 3 preserva o histórico no `mem_merge_log`.
-- ============================================================================

SET lock_timeout = '10s';

-- ── PARTE 1 · contribuinte sem CPF não vira cadastro de pessoa ──────────────
-- Mudanças em relação à versão de 20260525190000:
--   (a) o match por NOME EXATO saiu — era ele que cruzava identidades (nome
--       igual não é a mesma pessoa; a lei da casa é explícita);
--   (b) sem CPF a função devolve NULL em vez de INSERIR;
--   (c) com CPF o comportamento é o mesmo de antes (acha, enriquece, ou cria) —
--       CPF é chave forte e dedupável, e é o caminho legítimo de reconciliar
--       contribuinte depois.
CREATE OR REPLACE FUNCTION public.fin_resolver_ou_criar_contribuinte(
  p_nome TEXT,
  p_documento TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_doc_norm TEXT;
  v_nome_norm TEXT;
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) < 3 THEN RETURN NULL; END IF;
  v_doc_norm := regexp_replace(COALESCE(p_documento, ''), '\D', '', 'g');
  IF length(v_doc_norm) <> 11 THEN v_doc_norm := NULL; END IF;  -- só CPF de 11 dígitos
  v_nome_norm := trim(p_nome);

  -- SEM CPF ⇒ não identifica e não cria. O lançamento fica com o nome em
  -- `fin_transacoes.nome_contraparte` e `membro_id` NULL (a coluna aceita).
  IF v_doc_norm IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id FROM mem_membros
   WHERE cpf = v_doc_norm AND deleted_at IS NULL
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Enriquece só onde está vazio (nunca sobrescreve dado humano).
    UPDATE mem_membros
       SET telefone = COALESCE(telefone, p_telefone),
           email    = COALESCE(email, p_email)
     WHERE id = v_id AND (telefone IS NULL OR email IS NULL);
    RETURN v_id;
  END IF;

  INSERT INTO mem_membros (nome, cpf, telefone, email, status)
  VALUES (v_nome_norm, v_doc_norm, p_telefone, p_email, 'contribuinte_avulso')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.fin_resolver_ou_criar_contribuinte(TEXT, TEXT, TEXT, TEXT) IS
  'Resolve contribuinte SÓ por CPF (11 dígitos). Sem CPF devolve NULL — contribuinte sem chave não vira cadastro de pessoa (decisão do Marcos 30/07/2026, depois de 3.441 cadastros fabricados por match de nome em 29/07). NUNCA reintroduzir match por nome: nome igual não é a mesma pessoa.';

-- ── PARTE 2 · soft-delete dos contribuintes inertes já criados ──────────────
-- Critério: `contribuinte_avulso` + SEM CPF + sem NENHUM rastro operacional.
-- O rastro é descoberto pelo CATÁLOGO (toda tabela com FK pra mem_membros),
-- porque lista fixa esquece tabela — foi assim que nasceram os ponteiros mortos.
-- ⚠️ As tabelas de LOG/IDENTIDADE ficam FORA do teste: os fantasmas têm 3.443
-- linhas em `mem_identidade_observacoes` (o registro de que foram criados), e
-- contá-las como "rastro" faria a limpeza não apagar nada. O log fica intacto —
-- ele é justamente a prova auditável de que aquele cadastro existiu.
DO $$
DECLARE
  r RECORD;
  v_n INT := 0;
  v_cand INT := 0;
  LOGS TEXT[] := ARRAY[
    'mem_identidade_observacoes', 'mem_identidade_pares', 'mem_duplicados_ignorados',
    'entradas_resolucoes', 'entradas_pares_adiados', 'identidade_pendencias',
    'mem_merge_log', 'app_audit_log'
  ];
BEGIN
  CREATE TEMP TABLE _contrib_inerte ON COMMIT DROP AS
    SELECT id FROM public.mem_membros
     WHERE deleted_at IS NULL
       AND status = 'contribuinte_avulso'
       AND cpf IS NULL;
  SELECT count(*) INTO v_cand FROM _contrib_inerte;

  FOR r IN
    SELECT c.conrelid::regclass::text AS tab, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.mem_membros'::regclass
       AND array_length(c.conkey, 1) = 1
       AND c.conrelid::regclass::text <> ALL(LOGS)
  LOOP
    EXECUTE format(
      'DELETE FROM _contrib_inerte WHERE id IN (SELECT %I FROM %s WHERE %I IS NOT NULL)',
      r.col, r.tab, r.col
    );
  END LOOP;

  UPDATE public.mem_membros
     SET deleted_at = now()
   WHERE id IN (SELECT id FROM _contrib_inerte);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RAISE NOTICE 'Contribuintes sem CPF: % candidatos · % soft-deletados por não ter rastro operacional (app_restore desfaz)', v_cand, v_n;
END $$;

-- ── PARTE 3 · os 123 vínculos de voluntário voltam pra pessoa certa ─────────
-- Segue a cadeia de fusões no `mem_merge_log` (o keep pode ter sido fundido
-- depois). Sem destino reconstruível, solta o ponteiro — o perfil de voluntário
-- continua existindo, só deixa de apontar pra um id que sumiu.
-- SIMULADO contra produção antes de escrever: os 123 resolvem, ZERO soltam.
-- ⚠️ O tratamento de unique_violation é rede de segurança: hoje NÃO existe
-- índice único em membresia_id (há 308 não-nulos e 307 distintos, ou seja um par
-- repetido já convive), e em 1 caso o destino já é apontado por outro perfil —
-- o que é o estado atual da tabela, não uma regressão desta migration.
DO $$
DECLARE
  r RECORD; v_destino UUID; v_hops INT;
  v_rep INT := 0; v_solto INT := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.membresia_id
      FROM public.vol_profiles p
     WHERE p.membresia_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.mem_membros m WHERE m.id = p.membresia_id)
  LOOP
    v_destino := r.membresia_id;
    v_hops := 0;
    WHILE v_hops < 10
      AND v_destino IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.mem_membros m WHERE m.id = v_destino)
    LOOP
      SELECT l.keep_id INTO v_destino
        FROM public.mem_merge_log l
       WHERE v_destino = ANY(l.merged_ids)
       LIMIT 1;
      v_hops := v_hops + 1;
    END LOOP;

    IF v_destino IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.mem_membros m WHERE m.id = v_destino) THEN
      UPDATE public.vol_profiles SET membresia_id = NULL WHERE id = r.id;
      v_solto := v_solto + 1;
    ELSE
      BEGIN
        UPDATE public.vol_profiles SET membresia_id = v_destino WHERE id = r.id;
        v_rep := v_rep + 1;
      EXCEPTION WHEN unique_violation THEN
        -- outro perfil já aponta pro destino: solta em vez de duplicar o vínculo
        UPDATE public.vol_profiles SET membresia_id = NULL WHERE id = r.id;
        v_solto := v_solto + 1;
      END;
    END IF;
  END LOOP;
  RAISE NOTICE 'vol_profiles · repontados: % · ponteiro solto: %', v_rep, v_solto;
END $$;

-- ── PARTE 4 · a FK que a migration de maio achou que tinha criado ───────────
-- Rede de segurança antes do ALTER: a criação da FK não pode depender de a
-- PARTE 3 ter sido perfeita.
DO $$
DECLARE v_n INT := 0;
BEGIN
  UPDATE public.vol_profiles p SET membresia_id = NULL
   WHERE p.membresia_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.mem_membros m WHERE m.id = p.membresia_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RAISE NOTICE 'Rede de segurança: % ponteiro(s) morto(s) solto(s) antes da FK', v_n;
  END IF;
END $$;

ALTER TABLE public.vol_profiles
  DROP CONSTRAINT IF EXISTS vol_profiles_membresia_id_fkey;
ALTER TABLE public.vol_profiles
  ADD CONSTRAINT vol_profiles_membresia_id_fkey
  FOREIGN KEY (membresia_id) REFERENCES public.mem_membros(id) ON DELETE SET NULL;

-- ── Conferência ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_base INT; v_contrib INT; v_orf INT; v_vinc INT;
BEGIN
  SELECT count(*) INTO v_base FROM public.mem_membros WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_contrib FROM public.mem_membros
   WHERE deleted_at IS NULL AND status = 'contribuinte_avulso';
  SELECT count(*) INTO v_vinc FROM public.vol_profiles WHERE membresia_id IS NOT NULL;
  SELECT count(*) INTO v_orf FROM public.vol_profiles p
   WHERE p.membresia_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.mem_membros m WHERE m.id = p.membresia_id);
  RAISE NOTICE 'Base viva: % (era 7.487) · contribuinte_avulso vivos: % (era 3.563) · vol_profiles com vínculo: % · órfãos: % (esperado 0)',
    v_base, v_contrib, v_vinc, v_orf;
END $$;
