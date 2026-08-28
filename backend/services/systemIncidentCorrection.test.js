const assert = require('node:assert/strict');
const test = require('node:test');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const {
  CORRECTION_AGENT_VERSION,
  completedDiagnosisEvent,
  correctionEventState,
  correctionEligibility,
  correctionTaskRow,
} = require('./systemIncidentCorrection');
const { DIAGNOSIS_AGENT_VERSION } = require('./systemIncidentDiagnosis');

const diagnosis = {
  summary: 'Falha ao salvar o cadastro',
  probable_cause: 'Tratamento ausente para resposta vazia',
  classification: 'codigo',
  confidence: 'alta',
  risk_level: 'baixo',
  evidence: ['A rota retorna 500 no mesmo ponto'],
  decision_required: false,
  recommended_actions: ['Validar a resposta antes de acessar os campos'],
  validation_steps: ['Executar o teste unitario da rota'],
};

test('seleciona o diagnostico concluido mais recente', () => {
  const first = { created_at: '2026-08-18T10:00:00Z', metadata: { agent_version: DIAGNOSIS_AGENT_VERSION, diagnosis_status: 'completed', diagnosis: { ...diagnosis, summary: 'antigo' } } };
  const latest = { created_at: '2026-08-18T11:00:00Z', metadata: { agent_version: DIAGNOSIS_AGENT_VERSION, diagnosis_status: 'completed', diagnosis } };
  assert.equal(completedDiagnosisEvent([first, latest]), latest);
});

test('nao duplica proposta registrada na timeline', () => {
  assert.equal(correctionEventState([{ metadata: { agent_version: CORRECTION_AGENT_VERSION, correction_status: 'proposed' } }]), 'proposed');
  assert.equal(correctionEventState([]), 'eligible');
});

test('aceita apenas diagnostico de baixo ou medio risco sem decisao pendente', () => {
  const incident = { source_type: 'server_error' };
  assert.deepEqual(correctionEligibility(incident, diagnosis), { eligible: true, reason: 'eligible' });
  assert.equal(correctionEligibility(incident, { ...diagnosis, risk_level: 'alto' }).reason, 'risk_too_high');
  assert.equal(correctionEligibility(incident, { ...diagnosis, confidence: 'baixa' }).reason, 'confidence_too_low');
  assert.equal(correctionEligibility(incident, { ...diagnosis, decision_required: true }).reason, 'decision_required');
  assert.equal(correctionEligibility({ source_type: 'security' }, diagnosis).reason, 'source_not_supported');
});

test('cria tarefa deterministica aguardando aprovacao humana', () => {
  const task = correctionTaskRow({ id: 'incident-1', title: 'Erro no cadastro', severity: 'error' }, diagnosis);
  assert.equal(task.id, 'incident-1');
  assert.equal(task.classe, 'dev');
  assert.equal(task.status, 'aguardando_aprovacao');
  assert.equal(task.gate, 'G1');
  assert.equal(task.prioridade, 'alta');
  assert.match(task.descricao, /sem merge ou deploy automatico/i);
  assert.match(task.diagnostico, /Validacao obrigatoria/);
});
