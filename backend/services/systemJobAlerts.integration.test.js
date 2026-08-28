const assert = require('node:assert/strict');
const { evaluateJobAlert } = require('./systemJobAlerts');

function fakeDb({ runs = [], activeIncident = null, insertError = null } = {}) {
  const calls = [];

  class Query {
    constructor(table) {
      this.table = table;
      this.operation = 'read';
      this.payload = null;
    }

    select() { return this; }
    eq() { return this; }
    in() { return this; }
    order() { return this; }
    limit() { return this; }
    insert(payload) { this.operation = 'insert'; this.payload = payload; calls.push({ table: this.table, operation: 'insert', payload }); return this; }
    update(payload) { this.operation = 'update'; this.payload = payload; calls.push({ table: this.table, operation: 'update', payload }); return this; }

    result() {
      if (this.table === 'system_job_runs') return { data: runs, error: null };
      if (this.table === 'app_super_admins') return { data: [{ email: 'root@cbrio.org' }], error: null };
      if (this.table === 'profiles') return { data: [{ id: 'profile-root', email: 'root@cbrio.org' }], error: null };
      return { data: null, error: null };
    }

    maybeSingle() { return Promise.resolve({ data: activeIncident, error: null }); }
    single() {
      if (this.operation === 'insert' && insertError) return Promise.resolve({ data: null, error: insertError });
      return Promise.resolve({ data: { id: activeIncident?.id || 'incident-new' }, error: null });
    }

    then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); }
  }

  return {
    calls,
    from(table) { return new Query(table); },
  };
}

(async () => {
  const failedRun = {
    jobId: 'vercel:/api/pagamentos-webhook/cron/tick',
    status: 'failed', effectStatus: 'failed', requestId: 'req-failure',
  };
  const failureRows = [
    { status: 'failed', effect_status: 'failed', request_id: 'req-failure' },
    { status: 'warning', effect_status: 'failed', request_id: 'req-previous' },
  ];
  const openedDb = fakeDb({ runs: failureRows });
  const notifications = [];
  const opened = await evaluateJobAlert(failedRun, {
    db: openedDb,
    notify: async (payload) => { notifications.push(payload); return 1; },
  });
  assert.equal(opened.action, 'opened');
  assert.equal(opened.failures, 2);
  assert.equal(openedDb.calls.some((call) => call.operation === 'insert'), true);
  assert.deepEqual(notifications[0].targetIds, ['profile-root']);

  const recoveryDb = fakeDb({
    activeIncident: { id: 'incident-open', status: 'investigando' },
    runs: [
      { status: 'success', effect_status: 'confirmed' },
      { status: 'success', effect_status: 'confirmed' },
    ],
  });
  const recovered = await evaluateJobAlert({ ...failedRun, status: 'success', effectStatus: 'confirmed' }, {
    db: recoveryDb,
    notify: async () => 1,
  });
  assert.equal(recovered.action, 'resolved');
  assert.equal(recoveryDb.calls.find((call) => call.operation === 'update').payload.status, 'resolvido');

  const raceDb = fakeDb({ runs: failureRows, insertError: { code: '23505', message: 'duplicate' } });
  const deduplicated = await evaluateJobAlert(failedRun, { db: raceDb, notify: async () => 1 });
  assert.equal(deduplicated.reason, 'race_deduplicated');

  console.log('systemJobAlerts.integration.test.js: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
