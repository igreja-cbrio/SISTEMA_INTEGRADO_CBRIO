-- ============================================================================
-- Kids · dá PRAZO às visitantes que nasceram sem ele (as "visitantes eternas")
-- 20/08/2026 · pedido do Matheus
-- ============================================================================
-- O QUE ESTAVA ERRADO
--   `kids_criancas.visitante` tem DEFAULT true, e o cadastro de visitante só sai
--   da lista de ativas por uma das duas portas:
--     · PROMOÇÃO — ganha check-in suficiente e vira frequentadora;
--     · PRAZO — passa de `data_limite` e a varredura
--       `inativarVisitantesVencidos` a inativa.
--
--   ⚠️ Os CINCO pontos do código que criam criança visitante gravavam SEM
--   `data_limite` (totem walk-in ×2, app, membresia/totem de membro e a porta
--   pública de apresentação). Sem prazo, a varredura nunca as alcança — o filtro
--   dela é `data_limite < hoje`. Resultado: visitante que nunca volta fica ATIVA
--   para sempre, poluindo a contagem de crianças e a lista de quem "não está
--   vindo". Medido em 20/08: **23 assim**.
--
-- O código já foi corrigido nos 5 pontos (mesma leva). Isto conserta o passado.
--
-- ⚠️ O PRAZO É CONTADO DO ÚLTIMO SINAL DE VIDA, não de hoje: dar 4 semanas a
--   partir de agora a quem apareceu uma vez em março seria estender o cadastro
--   por mais um mês sem motivo. A base é o último check-in; sem nenhum, é a data
--   do cadastro.
--
-- ⚠️ NÃO INATIVA NINGUÉM AQUI. Só preenche o prazo. Quem já estiver vencido é
--   inativado pela varredura normal, na próxima carga do totem, com o motivo
--   dela ("Visitante não retornou") — não com um motivo inventado por esta
--   migration. Assim o efeito é auditável pelo caminho de sempre.
-- ============================================================================

DO $$
DECLARE
  v_sem_prazo int;
  v_ajustadas int;
  v_ja_vencidas int;
BEGIN
  SELECT count(*) INTO v_sem_prazo
    FROM public.kids_criancas
   WHERE ativo AND deleted_at IS NULL AND visitante AND data_limite IS NULL;

  IF v_sem_prazo = 0 THEN
    RAISE NOTICE 'Nenhuma visitante sem prazo — nada a fazer';
    RETURN;
  END IF;

  WITH base AS (
    SELECT k.id,
           COALESCE(
             (SELECT max(c.checkin_at::date) FROM public.kids_checkins c
               WHERE c.crianca_id = k.id AND c.deleted_at IS NULL),
             k.created_at::date
           ) AS ultimo_sinal
      FROM public.kids_criancas k
     WHERE k.ativo AND k.deleted_at IS NULL AND k.visitante AND k.data_limite IS NULL
  )
  UPDATE public.kids_criancas k
     SET data_limite = b.ultimo_sinal + INTERVAL '28 days',
         updated_at  = now()
    FROM base b
   WHERE k.id = b.id
     -- ⚠️ Guarda de corrida: só onde AINDA está nulo. Se o código novo já
     -- preencheu (a leva sobe junto), não sobrescreve.
     AND k.data_limite IS NULL;

  GET DIAGNOSTICS v_ajustadas = ROW_COUNT;

  SELECT count(*) INTO v_ja_vencidas
    FROM public.kids_criancas
   WHERE ativo AND deleted_at IS NULL AND visitante AND data_limite < CURRENT_DATE;

  RAISE NOTICE 'visitantes sem prazo: % · prazo preenchido em: % · já vencidas (a varredura inativa na próxima carga do totem): %',
    v_sem_prazo, v_ajustadas, v_ja_vencidas;
END $$;

COMMENT ON COLUMN public.kids_criancas.data_limite IS
  'Prazo do cadastro de VISITANTE (4 semanas). ⚠️ OBRIGATÓRIO em toda visitante: '
  'sem prazo ela nunca é promovida (não tem check-in) nem inativada (a varredura '
  'exige prazo vencido) — vira visitante eterna, e eram 23 assim em 20/08/2026. '
  '⚠️ ROLANTE desde 20/08: renovado a cada check-in, o que é o que torna viável a '
  'régua de promover no 3º dia (ver backend/utils/kidsVisitante.js). '
  'Frequentadora NÃO tem prazo — promover limpa esta coluna.';
