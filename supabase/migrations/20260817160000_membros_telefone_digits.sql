-- ============================================================================
-- mem_membros.telefone_digits · a forma COMPARÁVEL do telefone (2026-08-17)
--
-- O QUE ISTO CONSERTA
-- O matcher canônico procura candidato por telefone com
-- `telefone.ilike.%<digitos>%`. A coluna `telefone` guarda o que cada porta/
-- import gravou, em formatos MISTOS — e um valor mascarado NUNCA contém a
-- sequência de dígitos pura: `21996137099` não é substring de `(21)99613-7099`.
-- Resultado: o dedup por telefone é CEGO em quase um quarto da base.
--
-- MEDIDO EM PRODUÇÃO (17/08 · 3.597 vivos com telefone):
--   · 840 (23%) gravados COM máscara · 29 com código de país 55
--   · 201 grupos de 2+ cadastros no MESMO telefone canônico
--   · **84 desses grupos têm FORMAS diferentes** → o `ilike` não cruza
--   · **35 pares com o nome normalizado IDÊNTICO** dentro do mesmo telefone —
--     duplicata quase certa que o matcher deveria ter visto na criação
--
-- Caso que fecha o argumento (Fabio Moura · 2 cadastros vivos):
--   be523ea0  Fabio Moura  cpf 19002762755  tel "(21) 97965-1112"  15/05
--   b4a0fb02  Fabio Moura  cpf 01212666720  tel "21979651112"      23/06
-- Mesmo nome, mesmo nascimento (1972-01-25), MESMO e-mail e o MESMO telefone —
-- e CPFs diferentes (um dos dois está errado). O 2º cadastro nasceu porque o
-- matcher não conseguiu ver o telefone do 1º.
--
-- ⚠️ POR QUE COLUNA GERADA, e não normalizar os 840 valores
-- Normalizar o dado conserta hoje e não impede a reincidência: basta um import
-- novo, ou um caminho de escrita que eu não audite, e o furo reabre EM SILÊNCIO.
-- A coluna gerada é sempre verdadeira, se mantém sozinha (sem trigger), é
-- indexável e o PostgREST a filtra com `.eq()` como qualquer coluna. E ela NÃO
-- TOCA no que a pessoa digitou: `telefone` continua exatamente como está, que é
-- o que a tela exibe e o que o histórico registra.
--
-- ⚠️ Espelha `utils/camposContato.tirarCodigoPaisTelefone`: tira o `55` SÓ
-- quando o resto ainda é telefone completo (12–13 dígitos). Isso não é
-- preciosismo — **DDD 55 é Santa Maria/RS**, e um `replace(^55)` cru destruiria
-- todo número legítimo de lá. Mudou a régua no JS? Muda aqui.
--
-- ⚠️ Coluna gerada STORED reescreve a tabela e pega ACCESS EXCLUSIVE em
-- `mem_membros`, a tabela mais quente do sistema. São ~4 mil linhas (rápido),
-- mas **não aplicar em domingo de culto**.
--
-- Idempotente.
-- ============================================================================

ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS telefone_digits text
  GENERATED ALWAYS AS (
    CASE
      WHEN length(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g')) BETWEEN 12 AND 13
       AND left(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), 2) = '55'
        THEN substr(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), 3)
      ELSE nullif(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), '')
    END
  ) STORED;

-- Índice parcial: só linha VIVA com telefone interessa ao matcher, e é o mesmo
-- recorte que ele consulta (`.is('deleted_at', null)`).
CREATE INDEX IF NOT EXISTS idx_mem_membros_telefone_digits
  ON public.mem_membros (telefone_digits)
  WHERE telefone_digits IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.mem_membros.telefone_digits IS
  'Telefone em dígitos, sem código de país (55 removido só quando o resto tem 12–13 dígitos — DDD 55 é Santa Maria/RS). Coluna GERADA: não escrever nela. Existe porque `telefone` guarda formatos mistos (23% mascarados em 17/08) e `ilike %digitos%` não casa valor mascarado, deixando o dedup por telefone cego. Espelha utils/camposContato.tirarCodigoPaisTelefone — mudou lá, muda aqui.';

-- ============================================================================
-- Conferência (rodar depois de aplicar · o resultado importa, não o "success"):
--
--   select count(*) filter (where telefone_digits is not null) as com_digits,
--          count(*) filter (where telefone is not null)        as com_telefone
--     from public.mem_membros where deleted_at is null;
--   -- os dois números têm que bater (todo telefone rende dígitos)
--
--   select telefone, telefone_digits from public.mem_membros
--    where id in ('be523ea0-...','b4a0fb02-...');  -- o caso Fabio Moura
--   -- as 2 formas diferentes têm que produzir o MESMO telefone_digits
-- ============================================================================
