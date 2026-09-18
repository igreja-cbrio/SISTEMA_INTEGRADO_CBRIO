-- ============================================================================
-- Apresentação de crianças · FOTO da criança pro telão do culto
-- 2026-09-16 · pedido do Marcos
--
--   "gostaria que tivesse uma opção de adicionar foto da criança nesse
--    formulário e que aparecesse o arquivo para download na ficha, a ideia é
--    passar a foto durante o culto."
--
-- ⚠️⚠️ COLUNA PRÓPRIA DA INSCRIÇÃO, e não `kids_criancas.foto_storage_path`.
-- Aquela é a foto de IDENTIFICAÇÃO do check-in do Kids (103 das 4.550 crianças
-- têm), com consentimento próprio (`foto_consentimento_em/por/versao`). A mãe
-- que manda uma foto pro telão do culto NÃO foi avisada de que ela passaria a
-- identificar a criança na entrega do Kids — escrever lá dentro alargaria, em
-- silêncio, o uso que ela autorizou. Finalidades diferentes, colunas diferentes.
--
-- ⚠️ A autorização é o ATO + o TEXTO do campo ("será exibida no telão durante o
-- culto"), por decisão do Marcos em 16/09: sem caixa de aceite pra esta foto.
-- `foto_enviada_em` é o carimbo desse ato — não um consentimento à parte.
-- A caixa `imagem` que já existia no formulário (fotos que a IGREJA tira e
-- publica nas mídias) CONTINUA: é outro uso, e 1 das 16 famílias usou pra
-- recusar.
-- ============================================================================

ALTER TABLE public.apresentacao_criancas
  ADD COLUMN IF NOT EXISTS foto_storage_path text,
  ADD COLUMN IF NOT EXISTS foto_enviada_em   timestamptz,
  ADD COLUMN IF NOT EXISTS foto_enviada_por  uuid;

-- ⚠️ `ADD COLUMN IF NOT EXISTS ... REFERENCES` ENGOLE a FK quando a coluna já
-- existe (lição de 30/07 · `vol_profiles.membresia_id`, repetida em 15/09 no
-- `presente_por`): o comando inteiro é pulado, REFERENCES incluído. FK à parte.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.apresentacao_criancas'::regclass
       AND contype = 'f'
       AND conname = 'apresentacao_criancas_foto_enviada_por_fkey'
  ) THEN
    ALTER TABLE public.apresentacao_criancas
      ADD CONSTRAINT apresentacao_criancas_foto_enviada_por_fkey
      FOREIGN KEY (foto_enviada_por) REFERENCES public.profiles(id) ON DELETE SET NULL;
    RAISE NOTICE 'FK foto_enviada_por criada';
  END IF;
END $$;

COMMENT ON COLUMN public.apresentacao_criancas.foto_storage_path IS
  'Caminho no bucket PRIVADO kids-documentos da foto que a família mandou para o telão do culto. Servida só por URL assinada (30 min) em rota autenticada do Kids. NÃO confundir com kids_criancas.foto_storage_path, que é a foto de identificação do check-in.';
COMMENT ON COLUMN public.apresentacao_criancas.foto_enviada_em IS
  'Quando a foto foi enviada. É o carimbo do ato que vale como autorização (o campo do formulário diz que a foto será exibida no telão do culto).';
COMMENT ON COLUMN public.apresentacao_criancas.foto_enviada_por IS
  'Preenchido só quando quem subiu foi a equipe, pela ficha do Kids (profiles.id). NULL = veio da própria família pelo formulário público.';

-- ── Conferência (rodar DEPOIS, no SQL Editor) ───────────────────────────────
-- select column_name from information_schema.columns
--   where table_name = 'apresentacao_criancas'
--     and column_name in ('foto_storage_path','foto_enviada_em','foto_enviada_por');
