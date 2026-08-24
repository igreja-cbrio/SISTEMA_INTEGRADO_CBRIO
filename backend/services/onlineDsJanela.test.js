const assert = require('node:assert/strict');
const { dsJaDeviaTerColetado } = require('./onlineCollectors');

// ⚠️ O BUG QUE MOTIVOU ESTE TESTE (24/08/2026).
// `vercel.json` roda o cron de notificações às 09:00 UTC e o
// `/api/online/cron/ds-collect` às 10:00 UTC. O verificador cobrava o DS do
// culto de ONTEM uma hora ANTES do único cron que preenche esse campo, então
// "Culto online sem dados: ... views D+1 (DS)" saía TODO DIA para TODO culto
// online — 8 notificações por culto — mesmo com a coleta funcionando (o DS
// aparecia no banco uma hora depois). Alerta que sempre grita deixa de ser
// alerta: é isso que este teste protege.

const em = (iso) => new Date(iso);

// Culto de hoje: nem existe DS ainda (o coletor é D+1).
assert.equal(dsJaDeviaTerColetado('2026-08-24', em('2026-08-24T09:00:00Z')), false,
  'culto de hoje nunca pode ser cobrado');
assert.equal(dsJaDeviaTerColetado('2026-08-24', em('2026-08-24T23:59:00Z')), false,
  'culto de hoje segue fora de cobrança até o fim do dia');

// Culto de ontem: só depois do ds-collect de D+1 (10:00 UTC).
assert.equal(dsJaDeviaTerColetado('2026-08-23', em('2026-08-24T09:00:00Z')), false,
  'ontem às 09:00 UTC (hora do cron de notificações) ainda NÃO pode ser cobrado');
assert.equal(dsJaDeviaTerColetado('2026-08-23', em('2026-08-24T09:59:00Z')), false,
  'um minuto antes do ds-collect também não');
assert.equal(dsJaDeviaTerColetado('2026-08-23', em('2026-08-24T10:00:00Z')), true,
  'na hora do ds-collect passa a valer');
assert.equal(dsJaDeviaTerColetado('2026-08-23', em('2026-08-24T13:00:00Z')), true,
  'depois do ds-collect a cobrança é legítima');

// Rede de segurança: falha real NÃO escapa, só atrasa um dia (o culto volta
// como "anteontem", que o verificador também varre).
assert.equal(dsJaDeviaTerColetado('2026-08-22', em('2026-08-24T09:00:00Z')), true,
  'anteontem é cobrado em qualquer hora — aqui a falha real aparece');
assert.equal(dsJaDeviaTerColetado('2026-08-10', em('2026-08-24T00:30:00Z')), true,
  'culto antigo é cobrado sempre');
