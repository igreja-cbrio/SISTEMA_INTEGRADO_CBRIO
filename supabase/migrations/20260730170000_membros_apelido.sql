-- ============================================================================
-- mem_membros.apelido — "como a pessoa é conhecida na igreja"
--
-- Motivo (caso real · domingo 2026-07-30): a Patrícia tentou se inscrever no
-- grupo do "Antônio" e NENHUM pedido dela existe no banco — ela não conseguiu
-- concluir. O líder está cadastrado como "ANTONIO MARCO PEREIRA" (sem acento) e
-- a busca do formulário público era acento-SENSÍVEL, então quem digitava
-- "Antônio" (a grafia correta) não achava o grupo. Além disso, ele é conhecido
-- na igreja como "Tuninho" — e não havia como buscar por apelido.
--
-- Esta migration é ADITIVA e IDEMPOTENTE: 1 coluna nullable, sem FK, sem
-- constraint nova, sem tabela nova. Nada além do formulário de grupos lê a
-- coluna, e o backend a consulta em SELECT ISOLADO best-effort (se esta
-- migration ainda não tiver sido aplicada, a busca de grupos segue funcionando
-- sem apelido em vez de quebrar pra todo mundo — lição do `parcelas_max`).
--
-- NOTA de numeração: o timestamp 20260730160000 já está ocupado
-- (20260730160000_next_dia_sessao_real_e_semana.sql), então esta migration usa
-- 170000 — colisão de número é uma armadilha conhecida do repo (quem aplica à
-- mão roda "a do número X" e esquece a gêmea).
-- ============================================================================

ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS apelido text;

COMMENT ON COLUMN public.mem_membros.apelido IS
  'Como a pessoa é conhecida na igreja (ex.: "Tuninho" para Antonio Marco Pereira). '
  'ENTRA NA BUSCA PÚBLICA DE GRUPOS POR LÍDER (backend/routes/publicGrupos.js: '
  'GET /buscar e GET /lideres/buscar) e é exibido como "Nome (Apelido)" no cartão '
  'do grupo. NÃO substitui o nome real: mem_membros.nome continua sendo o nome '
  'cadastrado, e é ele que aparece em documento, etiqueta e relatório. '
  'Preenchido pela equipe no formulário de edição do membro na Membresia.';

-- ── Seed do caso que motivou a feature ──────────────────────────────────────
-- Descobre o id por NOME (sem hardcodar UUID não confirmado). Idempotente: a
-- 2ª execução não casa nada porque `apelido IS NULL` deixa de ser verdadeiro —
-- e um apelido corrigido à mão depois NUNCA é sobrescrito por esta migration.
-- ⚠️ NÃO adicionar outros apelidos aqui: apelido é dado que a equipe cadastra
-- pela Membresia, caso a caso, não em massa por migration.
DO $$
DECLARE
  v_afetados int;
BEGIN
  UPDATE public.mem_membros
     SET apelido = 'Tuninho'
   WHERE upper(btrim(nome)) = 'ANTONIO MARCO PEREIRA'
     AND apelido IS NULL
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_afetados = ROW_COUNT;
  RAISE NOTICE 'apelido "Tuninho" aplicado em % cadastro(s) de ANTONIO MARCO PEREIRA', v_afetados;

  IF v_afetados = 0 THEN
    RAISE NOTICE 'Nenhum cadastro atualizado (já tinha apelido, nome grafado diferente ou cadastro soft-deletado) — conferir na Membresia.';
  END IF;
END $$;
