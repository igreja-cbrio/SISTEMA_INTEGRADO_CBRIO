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
// ⚠️ A forma cresceu em 25/08 com o RODÍZIO (semana × dia × período). O que
// importa aqui é o contrato: string[] vira concessão SEM recorte nenhum — todos
// os eixos NULL. Se um eixo novo entrar sem NULL por padrão, a compatibilidade
// com `escalaResposta` (que passa string[]) quebra em silêncio.
// Em 24/09 entraram `papel` (default 'lider' — quem tinha concessão editava) e
// `team_id` (NULL = escopo por área, como sempre foi).
assert.deepEqual(normalizarConcessoes(['geral']), [{
  area: 'geral', papel: 'lider', team_id: null, position_id: null, culto_dia: null, culto_periodo: null, culto_semana: null,
}]);


// ══════════════════════════════════════════════════════════════════════════
// PAPÉIS + ESCOPO POR TIME + DIA DO CULTO (24/09/2026 · pedido do Marcos)
// ══════════════════════════════════════════════════════════════════════════
const { soEditores, somenteLeitura, papelMaior, cultoNoEscopo } = require('../utils/supervisorArea');
const BANDA_ID = 'cccccccc-0000-0000-0000-000000000001';
const KIDS_ID = 'cccccccc-0000-0000-0000-000000000002';
const BANDA = { id: BANDA_ID, name: 'Banda', area: 'Louvor' };
const KIDS = { id: KIDS_ID, name: 'Kids', area: 'KIDS' };
const DOM1_MANHA = { dia: 'domingo', periodo: 'manha', semana: 1 };
const QUA2 = { dia: 'quarta', periodo: 'noite', semana: 2 };
const SAB = { dia: 'sabado', periodo: 'noite', semana: 4 };

// ── Escopo por TIME ─────────────────────────────────────────────────────
const LIDER_BANDA = [{ area: 'louvor', team_id: BANDA_ID, papel: 'lider' }];
assert.equal(equipeSupervisionada(BANDA, LIDER_BANDA), true, 'líder da Banda vê a Banda');
assert.equal(equipeSupervisionada(KIDS, LIDER_BANDA), false, 'líder da Banda não vê o Kids');
assert.equal(equipeSupervisionada({ id: 'outro', name: 'Coral', area: 'Louvor' }, LIDER_BANDA), false,
  'time é time: outro time da MESMA área não entra — senão "líder da Banda" viraria "líder do Louvor"');
assert.equal(podeSupervisionar(LIDER_BANDA, { area: 'Louvor', team_id: BANDA_ID, position_id: null, culto: DOM1_MANHA }), true);
assert.equal(podeSupervisionar(LIDER_BANDA, { area: 'Louvor', team_id: KIDS_ID, position_id: null, culto: DOM1_MANHA }), false);
assert.equal(podeSupervisionar(LIDER_BANDA, { area: 'Louvor', position_id: null, culto: DOM1_MANHA }), false,
  'alvo SEM team_id é negado pra concessão de time — omitir o id não pode abrir a porta');
assert.equal(supervisionaTudo(LIDER_BANDA), false);
assert.equal(supervisionaTudo([{ area: 'geral', team_id: BANDA_ID }]), false,
  'geral COM time é recorte — não é o curinga');
assert.deepEqual(subareasNaArea(LIDER_BANDA, 'Louvor', BANDA_ID), [], 'time inteiro = sem recorte de subárea');
assert.deepEqual(subareasNaArea([{ area: 'louvor', team_id: BANDA_ID, position_id: OFERTORIO }], 'Louvor', BANDA_ID), [OFERTORIO]);
assert.deepEqual(subareasNaArea([{ area: 'louvor', team_id: BANDA_ID, position_id: OFERTORIO }], 'Louvor', KIDS_ID), [],
  'a subárea de um time não recorta OUTRO time');

// ── Escopo por CULTO = dia da semana (geral + culto_dia) ─────────────────
const LEITOR_DOMINGO = [{ area: 'geral', culto_dia: 'domingo', papel: 'leitor' }];
assert.equal(equipeSupervisionada(BANDA, LEITOR_DOMINGO), true, 'quem lê o domingo vê toda equipe (o recorte é por culto)');
assert.equal(podeSupervisionar(LEITOR_DOMINGO, { area: 'Louvor', team_id: BANDA_ID, culto: DOM1_MANHA }), true);
assert.equal(podeSupervisionar(LEITOR_DOMINGO, { area: 'Louvor', team_id: BANDA_ID, culto: QUA2 }), false, 'quarta não é domingo');
assert.equal(podeSupervisionar([{ area: 'geral', culto_dia: 'sabado' }], { area: 'AMI', team_id: KIDS_ID, culto: SAB }), true, 'sábado é dia de culto');
assert.equal(podeSupervisionar([{ area: 'geral', culto_dia: 'sabado' }], { area: 'AMI', team_id: KIDS_ID, culto: DOM1_MANHA }), false);
assert.equal(cultoNoEscopo(LEITOR_DOMINGO, DOM1_MANHA), true);
assert.equal(cultoNoEscopo(LEITOR_DOMINGO, QUA2), false);
assert.equal(cultoNoEscopo(LIDER_BANDA, QUA2), true, 'concessão sem recorte de culto alcança qualquer culto');
assert.equal(cultoNoEscopo(LEITOR_DOMINGO, null), false, 'culto sem data não dá pra afirmar');

// ── Papéis ──────────────────────────────────────────────────────────────
assert.equal(soEditores(LEITOR_DOMINGO).length, 0, 'leitor não escreve');
assert.equal(soEditores(LIDER_BANDA).length, 1);
assert.equal(soEditores(['geral']).length, 1, 'string[] (legado) é líder');
assert.equal(soEditores([{ area: 'geral' }]).length, 1, 'sem papel = líder (as 37 concessões de antes)');
assert.equal(somenteLeitura(LEITOR_DOMINGO), true);
assert.equal(somenteLeitura([...LEITOR_DOMINGO, ...LIDER_BANDA]), false, 'basta UMA que escreve');
assert.equal(somenteLeitura([]), false, 'sem concessão não é "só leitura" — é "nenhuma"');
assert.equal(papelMaior([]), null);
assert.equal(papelMaior(LEITOR_DOMINGO), 'leitor');
assert.equal(papelMaior([...LEITOR_DOMINGO, ...LIDER_BANDA]), 'lider');
assert.equal(papelMaior([{ area: 'geral' }]), 'admin', 'geral sem recorte É o admin, mesmo sem a coluna dizer');
assert.equal(papelMaior([{ area: 'produção', papel: 'admin' }]), 'admin');
assert.equal(normalizarConcessoes([{ area: 'geral', papel: 'chefe' }])[0].papel, 'lider', 'papel desconhecido cai em líder, não em leitor nem em admin');

console.log('supervisorSubarea.test.js OK (papéis · time · dia do culto)');
