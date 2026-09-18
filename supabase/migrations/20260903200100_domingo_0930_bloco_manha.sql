-- ============================================================================
-- O `Domingo 09:30` ficou FORA do bloco da manhã (2026-09-03 · conserto de dado)
--
-- ⚠️⚠️ O BUG, medido em 03/09: `vol_service_types.bloco_servico = 'dom_manha'`
-- está em `Domingo 08:30`, `Domingo 10:00` e `Domingo 11:30` — mas **não** no
-- `Domingo 09:30`, que foi criado no corte de 24/08 (script
-- `backend/scripts/corte-cultos-domingo-20260824.sql`) e não recebeu a coluna.
--
-- Resultado: o bloco da manhã hoje é {08:30, 10:00, 11:30}, e os dois primeiros
-- **encerraram em 23/08**. Depois da vigência, sobra só o 11:30 — ou seja, para
-- a régua `utils/blocoCulto.js` a manhã de domingo tem UMA celebração, quando
-- tem DUAS (09:30 e 11:30). Sem este conserto o time `split_por_horario` nunca
-- consegue dividir a manhã, que é justamente o caso que motivou tudo.
--
-- ⚠️ RISCO ZERO de regressão: `bloco_servico` **não tem nenhum consumidor** no
-- código hoje (conferido com git grep em `backend/` e `src/`: zero
-- ocorrências). Ela era coluna dormente e passa a ser a chave do bloco a partir
-- desta leva.
--
-- ⚠️⚠️ NÃO usar `consolidacao_key` nem `linhagem_key` para isto — as duas TÊM
-- consumidor vivo (`utils/lentesDomingo.js`, `routes/dashboardSemanal.js`) e
-- significam SÉRIE TEMPORAL, não simultaneidade:
--   · `linhagem_key`     = "o 10:00 VIROU 09:30" (continuidade · Matheus);
--   · `consolidacao_key` = "08:30 + 10:00 no passado × o 09:30 novo, somados
--                           por SEMANA" (Pr. Juninho).
-- O `consolidacao_key` do 09:30 é `domingo-0930` e agrupa os horários EXTINTOS;
-- usá-lo como bloco diria que a manhã tem três celebrações, duas mortas.
--
-- Idempotente: `WHERE bloco_servico IS DISTINCT FROM 'dom_manha'`.
-- ============================================================================

UPDATE public.vol_service_types
   SET bloco_servico = 'dom_manha',
       updated_at = now()
 WHERE name = 'Domingo 09:30'
   AND bloco_servico IS DISTINCT FROM 'dom_manha';

COMMENT ON COLUMN public.vol_service_types.bloco_servico IS
  'BLOCO de celebrações que rodam a MESMA liturgia no mesmo dia (ex. dom_manha = 09:30 + 11:30). É a chave de utils/blocoCulto.js: template e ordem de culto são ÚNICOS por bloco, e a escala pode ser por celebração nos times com split_por_horario. ⚠️ NÃO confundir com linhagem_key ("o 10:00 virou 09:30") nem com consolidacao_key (soma por semana dos horários substituídos) — essas duas são série temporal e têm consumidor vivo em utils/lentesDomingo.js.';
