-- ============================================================================
-- Escala por CULTO · `vol_schedules.culto_id` (2026-09-03)
--
-- Pedido do Marcos, comparando a nossa "Montar escala" com o Planning Center
-- Services: *"o importante é o horário ficar vinculado a culto pra não ter
-- problema de mudança de horário não alterar nomes de times"*. O gatilho foi
-- real: o culto da manhã era 08:30 e virou 09:30 na semana de 24/08.
--
-- ⚠️⚠️ O PROBLEMA QUE ISTO RESOLVE, E ELE É ESTRUTURAL: hoje a escala está
-- pendurada no PLANO DO PLANNING CENTER (`vol_schedules.service_id` →
-- `vol_services`), não no NOSSO culto. Medido em 03/09: **6.526 escalas, e
-- 100% delas em serviços com nome do PCO** (`Domingo - Manhã` 1.626 ·
-- `Quarta Com Deus` 1.520 · `CBKIDS - Manhã Domingo` 964 · `Domingo - Noite`
-- 930 · `CBKIDS - Noite Domingo` 445 · `Culto AMI` 399 · `Culto BRIDGE` 346 ·
-- `CBKIDS - Quarta-feira` 230 · `AMI` 54 · `GC 12 HORAS` 12). **ZERO** estão
-- nos nossos tipos por horário. Era o acoplamento mais profundo com o Services
-- — mais profundo que times ou posições.
--
-- ⚠️⚠️ A SEMÂNTICA DO NULL É O DESENHO, NÃO UMA OMISSÃO.
--   NULL           = a escala vale para TODOS os horários do bloco do culto.
--   culto_id setado = a escala vale só para AQUELE horário.
-- É o `Split Team` do Services numa coluna: numa equipe que repete gente, João
-- fica NULL (toca nos dois) e Maria fica no 11:30. Isto é o que dispensa criar
-- a dimensão `service_times` e o que evita duplicar a LITURGIA — o domingo de
-- manhã é o MESMO culto repetido (mesma ordem de culto, mesmo template), e
-- duplicá-lo faria os dois roteiros divergirem no primeiro ajuste.
--
-- ⚠️⚠️ POR QUE O BACKFILL É NULL EM 100% — e por que isso é a VERDADE, não
-- preguiça. Existe um casamento tentador: 299 dos 343 `vol_services` batem
-- EXATO em data+hora (BRT) com uma linha de `cultos`. Usá-lo seria um erro
-- silencioso: `Domingo - Manhã` está gravado com o horário do PRIMEIRO culto
-- (12:30Z = 09:30 BRT), então o casamento diria "esta escala é das 09:30"
-- quando o plano cobre a manhã INTEIRA. Mentiria em 1.626 escalas com cara de
-- acerto. Nenhuma escala existente foi feita para um horário específico ⇒ NULL
-- descreve exatamente o que elas são.
--
-- ⚠️ A CONSTRAINT NÃO MUDA, de propósito. `vol_schedules_pc_unique` é
-- `UNIQUE NULLS NOT DISTINCT (service_id, planning_center_person_id,
-- team_name, position_name, slot_seq)`. `culto_id` fica FORA dela porque
-- "serve os dois horários" se expressa com NULL, não com duas linhas — e o
-- caso de duas linhas explícitas da mesma pessoa/posição em horários
-- diferentes já é resolvido pelo `slot_seq`, que está na chave. Entrar na
-- chave agora quebraria o `ON CONFLICT` de 5 colunas do sync do PCO
-- (`routes/voluntariado.js` e `services/planningCenter.js`), que é justamente
-- o vínculo que precisa continuar vivo enquanto a migração é time a time.
--
-- ⚠️ `ON DELETE SET NULL` e não CASCADE: culto apagado não pode apagar o
-- histórico de quem serviu. A escala volta a valer para o bloco, que é o
-- comportamento de hoje — degradação para o estado anterior, nunca perda.
--
-- ⚠️ O check-in sobrevive sem tocar em nada: `vol_check_ins` (2.375 linhas)
-- tem `schedule_id`, então herda o culto pela escala. Só o check-in
-- `is_unscheduled` fica em nível de bloco, e isso é aceitável — ele já não
-- tem escala para herdar.
--
-- ⚠️ NÃO entra aqui, de propósito (uma tabela por colagem): o mesmo `culto_id`
-- em `vol_escala_culto_itens` (o ALVO/denominador, 1.447 linhas). Sem ele a
-- cobertura por horário ainda não existe — o alvo continua por bloco, que é o
-- caso "não-split" e está correto. É o passo seguinte.
-- ============================================================================

ALTER TABLE public.vol_schedules
  ADD COLUMN IF NOT EXISTS culto_id UUID REFERENCES public.cultos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vol_schedules.culto_id IS
  'Horário específico em que esta escala vale. NULL = vale para TODOS os horários do bloco do culto (o caso "não-split": a mesma pessoa serve as duas celebrações da manhã). É o Split Team do Planning Center numa coluna. As 6.526 escalas anteriores a 2026-09-03 nasceram NULL de propósito: 100% delas estavam penduradas no plano CONSOLIDADO do PCO (ex. "Domingo - Manhã"), que cobre a manhã inteira — nenhuma foi feita para um horário específico.';

-- Índice para o caminho novo: "quem está escalado NESTE culto" (o app e a
-- cobertura por horário). Parcial porque a esmagadora maioria das linhas é
-- NULL e essas nunca são buscadas por culto.
CREATE INDEX IF NOT EXISTS vol_schedules_culto_idx
  ON public.vol_schedules(culto_id)
  WHERE culto_id IS NOT NULL;
