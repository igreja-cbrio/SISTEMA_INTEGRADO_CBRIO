

## Plano: Corrigir nomes dos campos na criação de sessão

### Problema
A API da Anthropic retorna `agent_id: Extra inputs are not permitted. Did you mean 'agent'?`. Os campos corretos são `agent` e `environment`, não `agent_id` e `environment_id`.

### Correção
Em `backend/routes/agents.js`, linha 66-69, alterar:

```js
// DE:
agent_id: agentId,
environment_id: ENVIRONMENT_ID,

// PARA:
agent: agentId,
environment: ENVIRONMENT_ID,
```

### Arquivo alterado
- `backend/routes/agents.js` (2 linhas)

