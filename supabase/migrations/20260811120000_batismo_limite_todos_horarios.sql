-- ============================================================================
-- BATISMO · o limite de 11 vale nos QUATRO horários (2026-08-11)
--
-- Pedido do Marcos: *"em outra sessão o Claude me disse que você não usa os
-- limites de pessoas por culto no batismo, pode ver isso? No sistema, caso um
-- horário esteja cheio, liberar apenas o outro. O limite é 11 pessoas."*
--
-- Ele estava certo pela METADE, e a metade que faltava é a pior:
--
--   · o mecanismo EXISTE (`batismo_horarios.limite` + `GET /horarios`, que já
--     esconde do seletor o horário lotado), e 08:30 e 10:00 têm limite 11;
--   · **11:30 e 19:00 estavam com `limite` NULO** = sem teto nenhum;
--   · e o `POST /inscrever` **não conferia nada** — o limite era só enfeite de
--     tela. Prova no banco: **28/06 às 10:00 teve 12 inscritos num limite de 11.**
--
-- A trava no servidor entra no código (`publicBatismo.js` · 409
-- `horario_lotado`); esta migration fecha a outra metade, que é DADO.
--
-- ⚠️ `limite` NULO continua significando "sem teto" no código, de propósito — é
-- como a coordenação abre um horário sem limite. O que muda aqui é que os quatro
-- horários do domingo passam a declarar o teto que a igreja de fato pratica.
--
-- ⚠️ IDEMPOTENTE e CONSERVADORA: só preenche onde está NULO. Se alguém já tiver
-- ajustado um horário pra outro número, este arquivo **não** o sobrescreve —
-- decisão de capacidade é da equipe do batismo, não deste script.
-- ============================================================================

update public.batismo_horarios
   set limite = 11
 where limite is null
   and deleted_at is null;

comment on column public.batismo_horarios.limite is
  'Vagas por horário. NULO = sem teto (decisão da coordenação). '
  'Conferido no POST /api/public/batismo/inscrever desde 11/08/2026 — antes disso '
  'era só exibição, e 28/06/2026 às 10:00 fechou com 12 inscritos num limite de 11.';

-- ── Conferência (rodar depois; o SQL Editor não mostra RAISE NOTICE) ────────
-- select horario, label, limite from public.batismo_horarios
--  where deleted_at is null order by horario;
-- Esperado: 08:30 · 10:00 · 11:30 · 19:00 — todos com limite = 11.
