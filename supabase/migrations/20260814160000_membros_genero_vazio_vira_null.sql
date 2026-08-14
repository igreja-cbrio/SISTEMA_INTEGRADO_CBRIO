-- ============================================================================
-- `mem_membros.genero` = '' passa a ser NULL (ausência tem UMA forma só)
-- ============================================================================
-- Preparo pra funcionalidade de completar o sexo (14/08/2026).
--
-- ⚠️ POR QUE isto importa e não é cosmético: "sem sexo" hoje pode ser NULL **ou**
-- string vazia, e as duas formas se comportam DIFERENTE no PostgREST. O filtro
-- `.is('genero', null)` — que é o que guarda as escritas contra sobrescrever
-- declaração alheia — **não pega** a string vazia. Resultado: quem tem `''`
-- apareceria na lista de "faltam dados" (a régua JS trata vazio como ausente) e
-- a gravação seria RECUSADA em silêncio, reportada como "já tinha sexo". A
-- pessoa ficaria na fila pra sempre, e o motivo seria invisível.
--
-- Expressar ausência de duas formas é o tipo de coisa que produz bug que só
-- aparece em produção e ninguém reproduz. Uma forma só.
--
-- Idempotente e sem perda: '' não carrega informação nenhuma.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public._bk_20260814_genero_vazio (
  membro_id   uuid PRIMARY KEY,
  valor_antigo text,
  snapshot_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bk_20260814_genero_vazio (membro_id, valor_antigo)
SELECT id, genero
  FROM public.mem_membros
 WHERE genero IS NOT NULL AND btrim(genero) = ''
ON CONFLICT (membro_id) DO NOTHING;

UPDATE public.mem_membros
   SET genero = NULL
 WHERE genero IS NOT NULL AND btrim(genero) = '';

-- ⚠️ Também normaliza o vocabulário curto que o legado gravou: a régua canônica
-- do Contrato de Inscrição é `masculino|feminino`, e M/F sobrevivendo em
-- `mem_membros` faz cada leitor precisar do tradutor. As duas formas continuam
-- ACEITAS na entrada (nenhuma porta quebra) — o que muda é o que fica gravado.
UPDATE public.mem_membros SET genero = 'masculino'
 WHERE lower(btrim(genero)) = 'm';
UPDATE public.mem_membros SET genero = 'feminino'
 WHERE lower(btrim(genero)) = 'f';

COMMIT;

-- ============================================================================
-- CONFERÊNCIA — `vazios_agora` e `curtos_agora` têm que voltar 0.
-- ============================================================================
SELECT
  (SELECT count(*) FROM public._bk_20260814_genero_vazio)                       AS vazios_normalizados,
  (SELECT count(*) FROM public.mem_membros
    WHERE genero IS NOT NULL AND btrim(genero) = '')                            AS vazios_agora,
  (SELECT count(*) FROM public.mem_membros
    WHERE lower(btrim(genero)) IN ('m', 'f'))                                   AS curtos_agora,
  (SELECT count(*) FROM public.mem_membros
    WHERE deleted_at IS NULL AND genero IS NULL)                                AS sem_sexo,
  (SELECT count(*) FROM public.mem_membros WHERE deleted_at IS NULL)            AS vivos;

-- ============================================================================
-- ROLLBACK (só os vazios · o M/F→canônico não se desfaz e nem precisa):
--   UPDATE public.mem_membros m SET genero = b.valor_antigo
--     FROM public._bk_20260814_genero_vazio b WHERE m.id = b.membro_id;
-- ============================================================================
