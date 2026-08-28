const assert = require('node:assert/strict');
const {
  monthKey,
  normalizeHttpsUrl,
  normalizeCostInput,
  summarizeCostEntries,
} = require('./systemFinOps');

assert.equal(monthKey('2026-08-03'), '2026-08');
assert.equal(monthKey('2026-13'), null);
assert.equal(normalizeHttpsUrl('https://billing.example.com/invoice/1'), 'https://billing.example.com/invoice/1');
assert.equal(normalizeHttpsUrl('http://inseguro.local'), null);

const normalized = normalizeCostInput({
  provider_key: 'OpenAI', competence: '2026-08', cost_type: 'usage', amount: '12.50',
  currency: 'USD', fx_rate_to_brl: '5.4', status: 'actual', source_type: 'invoice',
}, { email: 'admin@cbrio.org' });
assert.equal(normalized.provider_key, 'openai');
assert.equal(normalized.competence, '2026-08-01');
assert.equal(normalized.amount, 12.5);

const summary = summarizeCostEntries([
  { provider_key: 'openai', competence: '2026-08-01', status: 'actual', amount_brl: 67.5 },
  { provider_key: 'openai', competence: '2026-08-01', status: 'estimated', amount_brl: 100 },
  { provider_key: 'vercel', competence: '2026-07-01', status: 'actual', amount_brl: -10 },
], [
  { provider_key: 'openai', name: 'OpenAI', budget_monthly_brl: 200 },
  { provider_key: 'vercel', name: 'Vercel', budget_monthly_brl: 100 },
]);
assert.deepEqual(summary.totals, { estimated: 100, accrued: 0, actual: 57.5 });
assert.equal(summary.monthlyBudget, 300);
assert.equal(summary.entriesCount, 3);

assert.throws(() => normalizeCostInput({ provider_key: 'x', competence: 'agora', amount: 1 }), /Competência/);
assert.throws(() => normalizeCostInput({ provider_key: 'x', competence: '2026-08', amount: -1 }), /Valor/);

console.log('systemFinOps.test.js: ok');
