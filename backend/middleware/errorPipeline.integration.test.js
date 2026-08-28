const assert = require('node:assert/strict');

process.env.VERCEL = '1';
process.env.NODE_ENV = 'test';

const app = require('../server');

async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const corsResponse = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://origem-nao-autorizada.example' },
    });
    assert.equal(corsResponse.status, 403);
    assert.equal(corsResponse.headers.get('x-request-id')?.length > 7, true);
    assert.deepEqual(await corsResponse.json(), {
      error: 'Origem não permitida.',
      code: 'ORIGIN_NOT_ALLOWED',
      request_id: corsResponse.headers.get('x-request-id'),
    });

    const invalidJsonResponse = await fetch(`${baseUrl}/api/telemetry/web-vitals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://cbrio.org',
      },
      body: '{json inválido',
    });
    assert.equal(invalidJsonResponse.status, 400);
    assert.deepEqual(await invalidJsonResponse.json(), {
      error: 'JSON inválido.',
      code: 'INVALID_JSON',
      request_id: invalidJsonResponse.headers.get('x-request-id'),
    });

    console.log('errorPipeline.integration.test.js: ok');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
