// ============================================================================
// Contrato: o RODÍZIO de supervisão (semana × dia × período) · 2026-08-25
//
// POR QUE ESTE TESTE EXISTE
// A Ariel mandou a lista real da casa: "1 Dom manhã / 1 Dom Noite / 2 Dom Manhã
// … / 1ª 4ª feira / 2ª 4ª feira …". É **semana do mês**, não horário de culto.
//
// ⚠️⚠️ E O CAMINHO ERRADO FOI MEDIDO ANTES DE SER ABANDONADO. Eu ia trazer os
// `times` do Planning Center pra supervisionar por horário (08:30 × 10:00 ×
// 11:30). Medido no PCO no domingo 23/08: dos 110 escalados, **102 têm só
// horário de ENSAIO** e os **8** com horário de culto têm **as QUATRO** horas.
// A dimensão não separava ninguém — teria sido trabalho grande pra um seletor
// decorativo. Este teste guarda a régua que ficou no lugar.
// ============================================================================
const assert = require('node:assert/strict');
const {
  ordinalNoMes, semanaDoRodizio, periodoDoCulto, classificarCulto, cultoCoberto,
} = require('../utils/rodizioCulto');

// ── ordinalNoMes: a ENÉSIMA ocorrência do dia-da-semana ───────────────────
// ⚠️ Não é aproximação: o 1º domingo cai entre os dias 1 e 7, o 2º entre 8 e 14,
// independente de em que dia da semana o mês começa.
assert.equal(ordinalNoMes(1), 1);
assert.equal(ordinalNoMes(7), 1);
assert.equal(ordinalNoMes(8), 2);
assert.equal(ordinalNoMes(14), 2);
assert.equal(ordinalNoMes(15), 3);
assert.equal(ordinalNoMes(22), 4);
assert.equal(ordinalNoMes(28), 4);
assert.equal(ordinalNoMes(29), 5);
assert.equal(ordinalNoMes(31), 5);

// ── 5ª semana REPETE A 1ª (decisão do Matheus, 25/08) ────────────────────
// ⚠️ Sem isto o 5º domingo ficaria SEM supervisor (a lista da Ariel só vai até
// 4), e culto órfão de supervisão é pior que supervisor repetido.
assert.equal(semanaDoRodizio(29), 1, '5ª ocorrência cai no 1º');
assert.equal(semanaDoRodizio(31), 1);
assert.equal(semanaDoRodizio(22), 4, 'a 4ª continua sendo a 4ª');

// ── período: corte em 14h BRT, espelhando o periodoSP de routes/app.js ───
assert.equal(periodoDoCulto(8), 'manha');
assert.equal(periodoDoCulto(13), 'manha');
assert.equal(periodoDoCulto(14), 'noite');
assert.equal(periodoDoCulto(19), 'noite');

// ── classificarCulto sobre datas REAIS de agosto/2026 ────────────────────
// Domingos: 2, 9, 16, 23, 30 · Quartas: 5, 12, 19, 26
const dom23manha = classificarCulto('2026-08-23T11:30:00Z'); // 08:30 BRT
assert.deepEqual(
  { dia: dom23manha.dia, periodo: dom23manha.periodo, semana: dom23manha.semana },
  { dia: 'domingo', periodo: 'manha', semana: 4 },
);
const dom23noite = classificarCulto('2026-08-23T22:00:00Z'); // 19:00 BRT
assert.equal(dom23noite.periodo, 'noite');
assert.equal(dom23noite.semana, 4);

const qua26 = classificarCulto('2026-08-26T23:00:00Z'); // 20:00 BRT
assert.equal(qua26.dia, 'quarta');
assert.equal(qua26.semana, 4);

// ⚠️⚠️ A ARMADILHA DE FUSO, de novo e num lugar novo. Culto de domingo 19h é
// 22h UTC: em UTC o dia da semana já é SEGUNDA. Se o dia-da-semana viesse de
// `getDay()` do Date cru (fuso da máquina) ou de UTC, o culto da noite de
// domingo seria classificado como quarta-nenhuma e sairia do rodízio.
assert.equal(classificarCulto('2026-08-24T01:00:00Z').dia, 'domingo',
  '22h BRT do domingo (01h UTC de segunda) ainda é DOMINGO');
assert.equal(classificarCulto('2026-08-24T01:00:00Z').semana, 4,
  'e a semana continua a do domingo, não a do dia UTC seguinte');

// 5º domingo real: 30/08/2026
const dom30 = classificarCulto('2026-08-30T11:30:00Z');
assert.equal(dom30.semana, 1, '5º domingo é coberto pelo supervisor do 1º');
assert.equal(dom30.ordinal_real, 5, 'mas a tela precisa saber que era o 5º');

// Culto que NÃO é domingo nem quarta fica FORA do rodízio (AMI é sábado).
assert.equal(classificarCulto('2026-08-22T17:00:00Z').dia, null,
  'sábado não entra no rodízio — a lista da Ariel não cobre AMI/Bridge');

assert.equal(classificarCulto(null), null);
assert.equal(classificarCulto('nao-e-data'), null);

// ── cultoCoberto: cada eixo é curinga quando NULL ────────────────────────
const SEM_RECORTE = { culto_dia: null, culto_periodo: null, culto_semana: null };
assert.equal(cultoCoberto(SEM_RECORTE, dom23manha), true,
  'concessão sem rodízio cobre qualquer culto — é o que preserva o que já existia');
assert.equal(cultoCoberto(SEM_RECORTE, null), true,
  'e cobre até culto sem data: quem não tem recorte não é afetado por ele');

const DOM4_MANHA = { culto_dia: 'domingo', culto_periodo: 'manha', culto_semana: 4 };
assert.equal(cultoCoberto(DOM4_MANHA, dom23manha), true);
assert.equal(cultoCoberto(DOM4_MANHA, dom23noite), false, 'manhã não cobre a noite');
assert.equal(cultoCoberto(DOM4_MANHA, classificarCulto('2026-08-02T11:30:00Z')), false,
  '4ª semana não cobre o 1º domingo');
assert.equal(cultoCoberto(DOM4_MANHA, qua26), false, 'domingo não cobre quarta');

// "Todas as semanas do domingo de manhã" = semana NULL
const DOM_MANHA_SEMPRE = { culto_dia: 'domingo', culto_periodo: 'manha', culto_semana: null };
assert.equal(cultoCoberto(DOM_MANHA_SEMPRE, dom23manha), true);
assert.equal(cultoCoberto(DOM_MANHA_SEMPRE, classificarCulto('2026-08-02T11:30:00Z')), true);
assert.equal(cultoCoberto(DOM_MANHA_SEMPRE, dom23noite), false);

// Quarta é culto ÚNICO (decisão do Matheus): concessão de quarta sem período.
const QUA2 = { culto_dia: 'quarta', culto_periodo: null, culto_semana: 2 };
assert.equal(cultoCoberto(QUA2, classificarCulto('2026-08-12T23:00:00Z')), true, '2ª quarta');
assert.equal(cultoCoberto(QUA2, qua26), false, '4ª quarta não é a 2ª');

// ⚠️ Culto FORA do rodízio (AMI, sábado) só é coberto por concessão sem recorte
// de dia. Quem recebeu "1º domingo" não passa a supervisionar o AMI.
const ami = classificarCulto('2026-08-22T17:00:00Z');
assert.equal(cultoCoberto(DOM4_MANHA, ami), false);
assert.equal(cultoCoberto(SEM_RECORTE, ami), true);

// ⚠️ Recorte de rodízio + culto SEM data = NEGADO. Liberar "porque não dá pra
// saber" devolve o acesso amplo bastando um scheduled_at vazio.
assert.equal(cultoCoberto(DOM4_MANHA, null), false);
