const assert = require('node:assert/strict');
const { resilientFetch } = require('./resilientFetch');

function response(status, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    body: { cancel: async () => {} },
  };
}

async function run() {
  let calls = 0;
  const recovered = await resilientFetch('https://example.test/read', { method: 'GET' }, {
    dependency: 'Teste', timeoutMs: 50, maxRetries: 1, sleep: async () => {}, random: () => 0,
    fetchImpl: async () => (++calls === 1 ? response(503) : response(200)),
  });
  assert.equal(recovered.status, 200);
  assert.equal(calls, 2, 'GET temporariamente indisponivel deve repetir uma vez');

  calls = 0;
  const unsafePost = await resilientFetch('https://example.test/create', { method: 'POST' }, {
    dependency: 'Teste', maxRetries: 2, sleep: async () => {},
    fetchImpl: async () => { calls += 1; return response(503); },
  });
  assert.equal(unsafePost.status, 503);
  assert.equal(calls, 1, 'POST sem idempotencia nunca pode ser repetido');

  calls = 0;
  const safePost = await resilientFetch('https://example.test/create', {
    method: 'POST', headers: { 'X-Idempotency-Key': 'stable-key' },
  }, {
    dependency: 'Teste', maxRetries: 1, sleep: async () => {}, random: () => 0,
    fetchImpl: async () => { calls += 1; return response(calls === 1 ? 429 : 201); },
  });
  assert.equal(safePost.status, 201);
  assert.equal(calls, 2, 'POST idempotente pode repetir em falha tempor?ria');

  await assert.rejects(
    resilientFetch('https://example.test/timeout', { method: 'GET' }, {
      dependency: 'Teste lento', timeoutMs: 5, maxRetries: 0,
      fetchImpl: (_url, opts) => new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }),
    }),
    (error) => error.code === 'DEPENDENCY_TIMEOUT' && error.status === 503 && error.attempts === 1,
  );

  calls = 0;
  await assert.rejects(
    resilientFetch('https://example.test/network', { method: 'GET' }, {
      dependency: 'Teste fora do ar', maxRetries: 1, sleep: async () => {},
      fetchImpl: async () => { calls += 1; throw new Error('ECONNRESET'); },
    }),
    (error) => error.code === 'DEPENDENCY_UNAVAILABLE' && error.attempts === 2,
  );
  assert.equal(calls, 2);

  console.log('resilientFetch: 5 cenarios aprovados');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
