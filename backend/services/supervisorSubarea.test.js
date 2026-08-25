// ============================================================================
// Contrato: a supervisão recorta por ÁREA **e SUBÁREA** (2026-08-25)
//
// POR QUE ESTE TESTE EXISTE
// Pedido do Matheus: "preciso das subáreas também — se eu escolher Integração,
// deve aparecer ofertório, estacionamento etc". Subárea = `vol_positions`.
//
// ⚠️⚠️ ISTO É PERMISSÃO. A lição de 18/08 (registrada em utils/supervisorArea)
// é que a trava existia só como PORTA: quem fosse supervisor de qualquer coisa
// montava escala de TODAS as áreas. O recorte de subárea reabre exatamente essa
// classe de furo um nível abaixo — por isso cada regra abaixo tem um caso.
// ============================================================================
const assert = require('node:assert/strict');
const {
  supervisionaTudo, podeSupervisionar, subareasNaArea, equipeSupervisionada, normalizarConcessoes,
} = require('../utils/supervisorArea');

const OFERTORIO = 'aaaaaaaa-0000-0000-0000-000000000001';
const ESTACIONA = 'aaaaaaaa-0000-0000-0000-000000000002';
const RECEP_KIDS = 'bbbbbbbb-0000-0000-0000-000000000003';

// ── Curinga: 'geral' sem subárea supervisiona tudo ─────────────────────────
assert.equal(supervisionaTudo([{ area: 'geral', position_id: null }]), true);
assert.equal(podeSupervisionar([{ area: 'geral', position_id: null }], { area: 'KIDS', position_id: RECEP_KIDS }), true,
  'geral sem recorte alcança qualquer área/subárea');

// ⚠️⚠️ 'geral' COM subárea NÃO é curinga. Seria "todas as áreas, mas só o
// Ofertório" — tratar como tudo devolveria o bug de 18/08 pela porta dos fundos.
assert.equal(supervisionaTudo([{ area: 'geral', position_id: OFERTORIO }]), false,
  "geral + subárea não pode ser lido como 'supervisiona tudo'");

// ── Concessão de ÁREA INTEIRA: alcança qualquer subárea dela ───────────────
const areaToda = [{ area: 'Integração', position_id: null }];
assert.equal(podeSupervisionar(areaToda, { area: 'Integração', position_id: OFERTORIO }), true);
assert.equal(podeSupervisionar(areaToda, { area: 'Integração', position_id: ESTACIONA }), true);
assert.equal(podeSupervisionar(areaToda, { area: 'Integração', position_id: null }), true,
  'área inteira alcança até item sem subárea definida');
assert.equal(podeSupervisionar(areaToda, { area: 'KIDS', position_id: RECEP_KIDS }), false,
  'área inteira NÃO atravessa pra outra área');

// ── Concessão de SUBÁREA: alcança só ela ───────────────────────────────────
const soOfertorio = [{ area: 'Integração', position_id: OFERTORIO }];
assert.equal(podeSupervisionar(soOfertorio, { area: 'Integração', position_id: OFERTORIO }), true);
assert.equal(podeSupervisionar(soOfertorio, { area: 'Integração', position_id: ESTACIONA }), false,
  'supervisor do Ofertório não mexe no Estacionamento');

// ⚠️⚠️ O FURO QUE O ID FECHA. Nome de posição REPETE entre áreas: "Recepção"
// existe em Integração E em KIDS, "Cuidados" em AMI/Bridge/Voluntariado. Se a
// comparação fosse por nome, conceder "Recepção da Integração" liberaria o Kids.
assert.equal(podeSupervisionar(soOfertorio, { area: 'KIDS', position_id: OFERTORIO }), false,
  'mesmo id de subárea em OUTRA área não passa — a área é conferida antes');

// ⚠️ Alvo SEM subárea resolvível é NEGADO pra quem tem concessão de subárea.
// Liberar "porque não dá pra saber" devolve o acesso amplo bastando um
// position_id vazio na linha — a mesma lei da equipe sem área.
assert.equal(podeSupervisionar(soOfertorio, { area: 'Integração', position_id: null }), false,
  'item sem subárea não é liberado pra concessão de subárea');

// ── Acúmulo: duas subáreas da mesma área ──────────────────────────────────
const duas = [
  { area: 'Integração', position_id: OFERTORIO },
  { area: 'Integração', position_id: ESTACIONA },
];
assert.equal(podeSupervisionar(duas, { area: 'Integração', position_id: OFERTORIO }), true);
assert.equal(podeSupervisionar(duas, { area: 'Integração', position_id: ESTACIONA }), true);
assert.deepEqual(subareasNaArea(duas, 'Integração').sort(), [OFERTORIO, ESTACIONA].sort());

// Curinga na mesma área ANULA o recorte (a pessoa tem a área inteira).
assert.deepEqual(subareasNaArea([...duas, { area: 'Integração', position_id: null }], 'Integração'), [],
  'concessão de área inteira convive com as de subárea e vence — sem recorte');

// ── Nível de EQUIPE ignora subárea de propósito ───────────────────────────
// Quem supervisiona só o Ofertório precisa VER a equipe Integração pra chegar
// na vaga dele; o corte fino é no item, não no container.
assert.equal(equipeSupervisionada({ area: 'Integração' }, soOfertorio), true,
  'a equipe da área continua visível pra quem tem só uma subárea dela');
assert.equal(equipeSupervisionada({ area: 'KIDS' }, soOfertorio), false);
assert.equal(equipeSupervisionada({ area: null }, soOfertorio), false,
  'equipe SEM área não pertence a ninguém — lei preexistente, intocada');

// ── Acento e caixa não podem virar brecha ────────────────────────────────
assert.equal(podeSupervisionar([{ area: 'integracao', position_id: null }], { area: 'Integração', position_id: OFERTORIO }), true,
  'a comparação de área é sem acento e sem caixa (chaveArea)');

// ── Compatibilidade: o contrato ANTIGO (string[]) segue valendo ───────────
// `escalaResposta.js` passa string[] de propósito (é notificação, não permissão).
assert.equal(supervisionaTudo(['geral']), true, 'string[] antigo ainda funciona');
assert.equal(podeSupervisionar(['Integração'], { area: 'Integração', position_id: ESTACIONA }), true,
  'string[] equivale a concessão de área inteira');
assert.deepEqual(normalizarConcessoes(['geral']), [{ area: 'geral', position_id: null }]);
