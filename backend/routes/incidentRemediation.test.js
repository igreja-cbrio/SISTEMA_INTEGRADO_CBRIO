const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { traduzErroUmPaiUmaMae } = require('../utils/kidsResponsavel');

test('registra /catalogo antes da rota dinâmica de links', () => {
  const source = fs.readFileSync(path.join(__dirname, 'links.js'), 'utf8');
  const catalogo = source.indexOf("router.get('/catalogo'");
  const dinamica = source.indexOf("router.get('/:id'");

  assert.notEqual(catalogo, -1);
  assert.notEqual(dinamica, -1);
  assert.ok(catalogo < dinamica, '/catalogo não pode ser capturado como :id');
});

test('traduz conflito de pai ou mãe para erro de negócio', () => {
  const result = traduzErroUmPaiUmaMae({
    code: '23505',
    message: 'Esta criança já tem uma mãe cadastrada. Cada criança tem só uma mãe e um pai.',
  });

  assert.deepEqual(result, {
    status: 400,
    error: 'Esta criança já tem uma mãe cadastrada. Cada criança tem só uma mãe e um pai.',
  });
});

test('merge de crianças usa o tradutor antes de responder 500', () => {
  const source = fs.readFileSync(path.join(__dirname, 'totemKids.js'), 'utf8');
  const start = source.indexOf("router.post('/criancas/merge'");
  const end = source.indexOf("// GET /api/totem-kids/criancas/:id", start);
  const handler = source.slice(start, end);

  assert.match(handler, /traduzErroUmPaiUmaMae\(e\)/);
  assert.match(handler, /res\.status\(t\.status\)/);
});

test('diagnóstico de jobs consulta apenas colunas existentes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'systemIncidentDiagnosis.js'), 'utf8');

  assert.doesNotMatch(source, /result_summary/);
  assert.match(source, /input_count,output_count,discarded_count/);
});
