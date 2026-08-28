const assert = require('node:assert/strict');
const {
  specialistFor,
  redactSensitive,
  normalizeDiagnosis,
  safeCodeSnippet,
  runIncidentDiagnostician,
} = require('../agents/incidentDiagnostician');
const {
  DIAGNOSIS_AGENT_VERSION,
  diagnosisEventState,
  diagnosisMessage,
} = require('./systemIncidentDiagnosis');

assert.equal(specialistFor('server_error').agentType, 'incident_backend_diagnostician');
assert.equal(specialistFor('job').agentType, 'incident_automation_diagnostician');
assert.equal(specialistFor('feedback').agentType, 'incident_experience_diagnostician');
assert.equal(specialistFor('manual').agentType, 'incident_general_diagnostician');

const redacted = redactSensitive('Fale com teste@cbrio.org CPF 123.456.789-00 token abcdefghijklmnopqrstuvwxyz1234567890');
assert.ok(!redacted.includes('teste@cbrio.org'));
assert.ok(!redacted.includes('123.456.789-00'));
assert.ok(!redacted.includes('abcdefghijklmnopqrstuvwxyz1234567890'));

const diagnosis = normalizeDiagnosis({
  summary: 'Falha confirmada', probable_cause: 'Configuração ausente', classification: 'configuracao',
  confidence: 'alta', risk_level: 'alto', evidence: ['HTTP 500'], recommended_actions: ['Validar variável'],
  validation_steps: ['Executar healthcheck'], decision_required: true, decision_question: 'Autoriza rotacionar a credencial?',
});
assert.equal(diagnosis.confidence, 'alta');
assert.equal(diagnosis.decision_required, true);
assert.equal(normalizeDiagnosis({ confidence: 'certeza' }).confidence, 'baixa');

const snippet = safeCodeSnippet('backend/services/systemIncidentDiagnosis.js', 1, 2);
assert.equal(snippet.file, 'backend/services/systemIncidentDiagnosis.js');
assert.equal(safeCodeSnippet('../../segredo.js', 1), null);

const now = new Date('2026-08-11T18:00:00.000Z');
assert.equal(diagnosisEventState([], now), 'eligible');
assert.equal(diagnosisEventState([{ created_at: now.toISOString(), metadata: { agent_version: DIAGNOSIS_AGENT_VERSION, diagnosis_status: 'started' } }], now), 'running');
assert.equal(diagnosisEventState([{ created_at: now.toISOString(), metadata: { agent_version: DIAGNOSIS_AGENT_VERSION, diagnosis_status: 'completed' } }], now), 'completed');
assert.equal(diagnosisEventState([{ created_at: '2026-08-11T16:00:00.000Z', metadata: { agent_version: DIAGNOSIS_AGENT_VERSION, diagnosis_status: 'failed' } }], now), 'eligible');

const message = diagnosisMessage({ specialist: 'Especialista', diagnosis });
assert.match(message, /Decisão necessária/);
assert.match(message, /Configuração ausente/);

async function testStructuredOutputRequired() {
  let failedMessage = null;
  class AgentWithoutTool {
    static async createRun(_agentType, _triggeredBy, config) {
      assert.equal(config.mode, 'proposal_only');
      assert.equal(config.incidentId, 'inc-1');
      return {
        runId: 'run-1',
        totalCost: 0,
        call: async () => ({ toolCalls: [] }),
        complete: async () => assert.fail('Nao deve concluir sem saida estruturada'),
        fail: async (message) => { failedMessage = message; },
      };
    }
  }

  await assert.rejects(
    runIncidentDiagnostician({
      incident: { id: 'inc-1', source_type: 'job' },
      evidence: { runs: [] },
      config: { mode: 'unsafe_override' },
      AgentClass: AgentWithoutTool,
    }),
    /sem diagnostico estruturado/,
  );
  assert.match(failedMessage, /sem diagnostico estruturado/);
}

async function main() {
  await testStructuredOutputRequired();
  console.log('systemIncidentDiagnosis: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
