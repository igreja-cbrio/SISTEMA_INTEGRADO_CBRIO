const assert = require('node:assert/strict');
const { maxSilenceHours, summarizeJobSlo } = require('./systemJobSlo');

const now = new Date('2026-08-11T12:00:00.000Z');
const policy = { ownerLabel: 'Tecnologia' };
const jobs = [
  { id: 'health', name: 'health', path: '/health', schedule: '*/5 * * * *', category: 'platform', alertPolicy: policy },
  { id: 'bank', name: 'bank', path: '/bank', schedule: '0 5 * * *', category: 'finance', alertPolicy: policy },
  { id: 'hourly', name: 'hourly', path: '/hourly', schedule: '0 * * * *', category: 'data', alertPolicy: policy },
  { id: 'weekly', name: 'weekly', path: '/weekly', schedule: '0 10 * * 1', category: 'data', alertPolicy: policy },
];
const rows = [
  { job_id: 'health', status: 'success', effect_status: 'confirmed', started_at: '2026-08-11T11:55:00.000Z' },
  { job_id: 'bank', status: 'failed', effect_status: 'failed', started_at: '2026-08-11T05:00:00.000Z' },
  { job_id: 'bank', status: 'failed', effect_status: 'failed', started_at: '2026-08-10T05:00:00.000Z' },
];

const result = summarizeJobSlo(jobs, rows, { now, windowHours: 48 });
assert.equal(maxSilenceHours('*/5 * * * *'), 1);
assert.equal(maxSilenceHours('0 * * * *'), 3);
assert.equal(maxSilenceHours('0 10 * * 1'), null);
assert.equal(result.jobsBreached, 1);
assert.equal(result.jobsMissing, 1);
assert.equal(result.items.find((item) => item.jobId === 'health').state, 'healthy');
assert.equal(result.items.find((item) => item.jobId === 'bank').state, 'breached');
assert.equal(result.items.find((item) => item.jobId === 'hourly').state, 'missing');
assert.equal(result.items.find((item) => item.jobId === 'weekly').state, 'unproven');

console.log('systemJobSlo: ok');
