-- ============================================================================
-- entradas_pares_adiados · faxina dos ponteiros mortos + as 2 FKs que faltavam
-- (2026-08-14)
--
-- A tabela guarda o "não tenho certeza" da fila de duplicidades das Entradas
-- (`par_key` + os dois membros + a marca-d'água de confiança). As duas colunas
-- de membro nasceram **sem FOREIGN KEY**, e é a lei nº 10 das regras de
-- segurança: `merge_membros` descobre os filhos a repontar pelo CATÁLOGO
-- (`pg_constraint`) e faz HARD delete do absorvido — tabela sem FK é invisível
-- pra ele e acumula ponteiro pra cadastro que não existe mais, em silêncio.
--
-- Medido antes de escrever: **590 linhas · 187 com ponteiro pra cadastro
-- inexistente** (175 delas ainda ativas, sem `reativado_em`). Outras 9 apontam
-- pra cadastro SOFT-deletado — essas NÃO são órfãs (a linha existe, e FK aceita
-- linha soft-deletada; é o corolário da lei nº 10). 0 linhas com coluna nula.
--
-- ⚠️ ON DELETE **CASCADE**, não SET NULL. A regra geral do projeto é SET NULL,
-- mas aqui vale a exceção JÁ DOCUMENTADA de `mem_duplicados_ignorados` ("par de
-- dedup · sem sentido sem o membro"): esta linha É um par. Com um dos lados
-- fundido o par deixou de existir, e uma linha com metade nula só ocuparia a
-- `par_key` e bloquearia o adiamento de um par de verdade.
--
-- ⚠️ CONSEQUÊNCIA DECLARADA: fundir A em B passa a APAGAR o "adiei A×C". Está
-- certo — B×C é outro par e merece decisão própria — mas quem adiou A×C não vai
-- reencontrar aquele adiamento.
--
-- ⚠️ Hard delete aqui é legítimo: a tabela não tem `deleted_at`, não está na
-- whitelist `app_soft_deletable_tables()` e não é PII (é marcador de triagem).
-- O par volta pra fila sozinho, que é o comportamento correto quando o
-- adiamento aponta pra alguém que não existe.
--
-- ⚠️ A FK trava `mem_membros` (a tabela mais quente do sistema) pelo tempo do
-- ADD CONSTRAINT. Por isso: NOT VALID primeiro (não escaneia) e VALIDATE em
-- comando separado (lock mais fraco). **Não aplicar em domingo de culto.**
--
-- Idempotente.
-- ============================================================================

-- 1. Faxina dos ponteiros mortos. Rede de segurança OBRIGATÓRIA antes do
--    ADD CONSTRAINT: a criação da FK não pode depender de a lógica de limpeza
--    ter sido perfeita (lição da 20260730120000, que morreu com 23503).
DELETE FROM public.entradas_pares_adiados a
 WHERE (a.membro_a_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.mem_membros m WHERE m.id = a.membro_a_id))
    OR (a.membro_b_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.mem_membros m WHERE m.id = a.membro_b_id));

-- 2. As duas FKs, em bloco PRÓPRIO guardado por pg_constraint.
--    ⚠️ NUNCA dentro de `ADD COLUMN IF NOT EXISTS ... REFERENCES`: quando a
--    coluna já existe o comando é pulado INTEIRO, REFERENCES incluído, e o repo
--    passa a declarar uma integridade que o banco nunca teve (caso
--    vol_profiles.membresia_id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'entradas_pares_adiados_membro_a_id_fkey'
       AND conrelid = 'public.entradas_pares_adiados'::regclass
  ) THEN
    ALTER TABLE public.entradas_pares_adiados
      ADD CONSTRAINT entradas_pares_adiados_membro_a_id_fkey
      FOREIGN KEY (membro_a_id) REFERENCES public.mem_membros(id) ON DELETE CASCADE
      NOT VALID;
    ALTER TABLE public.entradas_pares_adiados
      VALIDATE CONSTRAINT entradas_pares_adiados_membro_a_id_fkey;
    RAISE NOTICE 'FK de membro_a_id criada e validada.';
  ELSE
    RAISE NOTICE 'FK de membro_a_id já existe.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'entradas_pares_adiados_membro_b_id_fkey'
       AND conrelid = 'public.entradas_pares_adiados'::regclass
  ) THEN
    ALTER TABLE public.entradas_pares_adiados
      ADD CONSTRAINT entradas_pares_adiados_membro_b_id_fkey
      FOREIGN KEY (membro_b_id) REFERENCES public.mem_membros(id) ON DELETE CASCADE
      NOT VALID;
    ALTER TABLE public.entradas_pares_adiados
      VALIDATE CONSTRAINT entradas_pares_adiados_membro_b_id_fkey;
    RAISE NOTICE 'FK de membro_b_id criada e validada.';
  END IF;
END $$;

COMMENT ON TABLE public.entradas_pares_adiados IS
  'Pares "não tenho certeza" da fila de duplicidades (Entradas). ⚠️ As 2 colunas de membro têm FK ON DELETE CASCADE desde 2026-08-14 (lei nº 10): sem elas o merge_membros não enxergava a tabela e ela acumulava ponteiro pra cadastro apagado. CASCADE e não SET NULL porque a linha É um par — mesma exceção de mem_duplicados_ignorados.';
