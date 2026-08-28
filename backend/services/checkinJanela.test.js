// ============================================================================
// Contrato: a janela do check-in pelo supervisor é o DIA DO CULTO EM BRT
// (2026-08-25)
//
// POR QUE ESTE TESTE EXISTE
// Pedido do Matheus: supervisor faz check-in dos voluntários da área dele pelo
// app, "só nos dias de culto" — pra não ficar refém da sala de voluntários.
//
// ⚠️⚠️ A ARMADILHA QUE ELE PROTEGE. Culto de domingo 19h é 22h UTC. Das 21h BRT
// em diante o UTC já virou o dia seguinte, então comparar em UTC (ou usar
// `toISOString().slice(0,10)`) FECHA A JANELA NO MEIO DO CULTO DA NOITE —
// exatamente quando o supervisor está batendo os check-ins. Um bug desses só
// aparece em produção, num domingo à noite, com gente na porta.
// ============================================================================
const assert = require('node:assert/strict');
const { diaBRT, ehDiaDoCulto } = require('../utils/janelaCulto');

// ── diaBRT converte para a data local, não a UTC ──────────────────────────
assert.equal(diaBRT('2026-08-23T22:00:00Z'), '2026-08-23',
  'domingo 19h BRT (22h UTC) tem que ser dia 23, não 23 em UTC por sorte');
assert.equal(diaBRT('2026-08-24T01:30:00Z'), '2026-08-23',
  '22h30 BRT do domingo já é 01h30 UTC de segunda — a data BRT ainda é domingo');
assert.equal(diaBRT('2026-08-23T02:00:00Z'), '2026-08-22',
  '23h BRT do sábado é 02h UTC do domingo — a data BRT ainda é sábado');
assert.equal(diaBRT(null), null);
assert.equal(diaBRT('nao-e-data'), null);

// ⚠️⚠️ O CASO QUE MOTIVOU TUDO: culto da NOITE, supervisor batendo ponto às
// 21h30 BRT. Em UTC já é o dia seguinte; a janela tem que continuar ABERTA.
assert.equal(
  ehDiaDoCulto('2026-08-23T22:00:00Z', new Date('2026-08-24T00:30:00Z')).ok, true,
  'culto domingo 19h, agora 21h30 BRT do mesmo domingo → janela ABERTA (em UTC já virou segunda)',
);
assert.equal(
  ehDiaDoCulto('2026-08-23T22:00:00Z', new Date('2026-08-24T02:59:00Z')).ok, true,
  '23h59 BRT do domingo ainda é o dia do culto',
);
assert.equal(
  ehDiaDoCulto('2026-08-23T22:00:00Z', new Date('2026-08-24T03:01:00Z')).ok, false,
  '00h01 BRT de segunda já fechou',
);

// ── Culto da manhã, ao longo do dia ──────────────────────────────────────
const manha = '2026-08-23T11:30:00Z'; // 08h30 BRT
assert.equal(ehDiaDoCulto(manha, new Date('2026-08-23T09:00:00Z')).ok, true,
  '06h BRT do mesmo dia (antes do culto) já abre — é o dia inteiro, decisão do Matheus');
assert.equal(ehDiaDoCulto(manha, new Date('2026-08-24T01:00:00Z')).ok, true,
  '22h BRT do mesmo dia ainda abre — o preço aceito de "dia inteiro"');
assert.equal(ehDiaDoCulto(manha, new Date('2026-08-22T20:00:00Z')).ok, false,
  'véspera não abre');

// ── Fora do dia: o motivo tem que ser distinguível pra mensagem da tela ──
const fora = ehDiaDoCulto(manha, new Date('2026-05-10T15:00:00Z'));
assert.equal(fora.ok, false);
assert.equal(fora.motivo, 'fora_do_dia');
assert.equal(fora.dia, '2026-08-23', 'devolve o dia do culto pra tela dizer QUAL era');

// Serviço sem data não pode ser confundido com "fora do dia": a tela precisa
// dizer "esse culto não tem data" em vez de mandar o supervisor voltar noutro dia.
assert.equal(ehDiaDoCulto(null, new Date('2026-08-23T15:00:00Z')).motivo, 'sem_data');

// ── Horário de verão: o Brasil não tem desde 2019, e o offset é estável ──
// Se um dia voltar, `toLocaleDateString` com timeZone continua correto (é o
// motivo de NÃO usar offset fixo -03:00 na comparação).
assert.equal(diaBRT('2026-01-15T02:00:00Z'), '2026-01-14',
  'janeiro (verão) segue -03:00 e a conversão continua pela timeZone, não por offset fixo');

// ══════════════════════════════════════════════════════════════════════════
// Guarda ESTÁTICA: as rotas de check-in do app chamam JANELA **e** ESCOPO
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠️⚠️ O endpoint `POST /app/voluntariado/checkin` JÁ EXISTIA com o furo de
// 18/08 intacto: conferia `areas.length` — a PORTA — e depois registrava
// presença de QUALQUER pessoa, em QUALQUER culto, de QUALQUER dia. Supervisor de
// Louvor batia ponto do Kids num culto de três meses atrás.
//
// Exercitar as rotas de verdade exigiria banco, e o gate roda sem banco — então
// é guarda estática, sobre o código SEM comentário (o próprio conserto cita
// `cultoEhHoje` em prosa; casar no texto cru passaria com a chamada apagada).
const fs = require('node:fs');
const path = require('node:path');

function semComentarios(js) {
  const s = String(js).replace(/\r\n?/g, '\n');
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const rotas = semComentarios(fs.readFileSync(path.join(__dirname, '..', 'routes', 'app.js'), 'utf8'));

// Recorta cada rota de check-in até o fim do seu handler.
function corpoDaRota(re) {
  const m = re.exec(rotas);
  assert(m, `não achei a rota (${re}) — se ela mudou de forma, este teste precisa acompanhar`);
  return rotas.slice(m.index, m.index + 6000);
}

const post = corpoDaRota(/router\.post\('\/voluntariado\/checkin'/);
assert(/cultoEhHoje\(/.test(post),
  'o POST de check-in tem que chamar cultoEhHoje: sem a janela, presença de culto antigo entra hoje e a frequência aceita retroativo sem trilha');
assert(/checkinSobSupervisao\(/.test(post),
  'o POST de check-in tem que chamar checkinSobSupervisao: sem o escopo, supervisor de uma área bate ponto de outra — o furo de 18/08 um nível abaixo');

const del = corpoDaRota(/router\.delete\('\/voluntariado\/checkin\/:id'/);
assert(/cultoEhHoje\(/.test(del),
  'o DELETE tem que checar a janela: desfazer fora do dia é reescrever frequência passada');
assert(/checkinSobSupervisao\(/.test(del),
  'o DELETE tem que checar o escopo — um DELETE só com o id seria a porta dos fundos do endpoint inteiro (lição do escalaSobSupervisao: vale pra MOVER e REMOVER)');
assert(/audit_log/.test(del),
  'o DELETE tem que deixar trilha em audit_log: é hard delete (os uniques são parciais) e sem trilha a presença desaparece sem autor');

// ⚠️ A janela vale pra TODO MUNDO, inclusive quem tem `geral`: a restrição é da
// OPERAÇÃO ("só nos dias de culto"), não do escopo de área. Se a chamada de
// janela ficasse dentro de um `if (!supervisionaTudo(...))`, o curinga furaria.
const janelaNoPost = post.slice(0, post.indexOf('cultoEhHoje('));
assert(!/if \(!supervisionaTudo\([^)]*\)\) \{[^}]*$/.test(janelaNoPost),
  'a checagem de janela não pode estar aninhada num if de supervisionaTudo — ela vale para o curinga também');
