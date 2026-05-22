/**
 * Script: criar-managed-agent-api-designer.js
 *
 * Cria um Anthropic Managed Agent chamado "API Designer" via SDK.
 * Equivalente a `ant beta:agents create ...` mas em código, usando o
 * `@anthropic-ai/sdk` já instalado em backend/package.json.
 *
 * Pré-requisitos:
 *   - ANTHROPIC_API_KEY no ambiente
 *   - SDK >= 0.86.1 (já presente em backend/package.json)
 *
 * Uso:
 *   cd backend
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/criar-managed-agent-api-designer.js
 *
 *   Ou com .env:
 *   node -r dotenv/config scripts/criar-managed-agent-api-designer.js
 *
 * Após criar, o script imprime o `agent_id` e a `version`. Guarde esses
 * valores para iniciar sessões depois com `client.beta.sessions.create({
 *   agent: agent_id, environment_id, ... })`.
 *
 * Idempotência: o nome "API Designer" não é único na API; cada execução
 * cria um novo registro. Antes de rodar de novo, confira a listagem
 * (`client.beta.agents.list()`) ou pegue o ID existente em vez de
 * recriar.
 */

const Anthropic = require('@anthropic-ai/sdk').default;

const AGENT_NAME = 'API Designer';
const AGENT_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a senior API designer specializing in REST and GraphQL architectures. When given a task, analyze business domain models and client requirements, then design APIs following API-first principles: resource-oriented architecture, proper HTTP semantics, consistent naming, and comprehensive OpenAPI 3.1 specifications.

Cover authentication patterns (OAuth 2.0, JWT, API keys), versioning strategies (URI, header, content-type), pagination (cursor, page-based, limit/offset), webhooks, bulk operations, and error handling with consistent formats and actionable messages. Optimize for developer experience — generate request/response examples, error catalogs, and SDK guidance.

For GraphQL, address type system design, query complexity, mutation patterns, subscriptions, and federation. Always ensure backward compatibility, define deprecation policies, and include rate limiting and cache control headers. Deliver complete OpenAPI specs, Postman collections, and migration guides.`;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERRO: variável de ambiente ANTHROPIC_API_KEY ausente.');
    process.exit(1);
  }

  const client = new Anthropic();

  console.log(`Criando Managed Agent "${AGENT_NAME}" (model=${AGENT_MODEL})...`);

  // O SDK adiciona o header beta `managed-agents-2026-04-01` automaticamente
  // para todas as chamadas em client.beta.agents.*
  const agent = await client.beta.agents.create({
    name: AGENT_NAME,
    model: AGENT_MODEL,
    system: SYSTEM_PROMPT,
    tools: [
      { type: 'agent_toolset_20260401' },
    ],
  });

  console.log('\nAgente criado com sucesso.\n');
  console.log(`  agent_id : ${agent.id}`);
  console.log(`  version  : ${agent.version}`);
  console.log(`  name     : ${agent.name}`);
  console.log(`  model    : ${typeof agent.model === 'string' ? agent.model : agent.model.id}`);
  console.log(`\nGuarde o agent_id em config/.env para reutilizar em sessões.`);
  console.log(`Console: https://platform.claude.com/workspaces/default/agents/${agent.id}`);
}

main().catch((err) => {
  if (err && err.status) {
    console.error(`\nFalha na API (HTTP ${err.status}): ${err.message}`);
    if (err.error) console.error(JSON.stringify(err.error, null, 2));
  } else {
    console.error('\nErro inesperado:', err);
  }
  process.exit(1);
});
