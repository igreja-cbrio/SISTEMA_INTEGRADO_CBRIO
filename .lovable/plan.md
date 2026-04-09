

## Plano: Implementar Agentes Managed Anthropic no CBRio ERP

### Resumo

Integrar os 15 Managed Agents da Anthropic (14 módulos + Supervisor) ao sistema, adicionando um chat interativo com streaming na página Assistente IA, mantendo a infraestrutura existente de auditorias.

### Arquitetura

```text
Frontend (AssistenteIA.jsx)
  ├── Tab "Chat IA" (NOVO) — chat streaming com seletor de módulo
  └── Tab "Auditorias" (EXISTENTE) — runs, findings, scores

Backend (agents.js)
  ├── POST /chat — SSE streaming via Anthropic Sessions API (beta)
  ├── GET /sessions — lista sessões do usuário
  ├── DELETE /sessions/:id — encerra sessão
  └── (existentes: /run, /runs, /stats, /scores, etc.)
```

### Implementação

**1. Novo arquivo `backend/config/managedAgents.js`**
- Mapa com os 15 agent IDs + environment ID `env_01UMJ12N3YjCfoyLyEKL4xcu`
- Helper `getAgentId(module)` que retorna o agent ID ou supervisor como fallback

**2. Atualizar `backend/routes/agents.js`** — 3 novos endpoints:

- `POST /chat` (SSE):
  - Recebe `{ message, module, sessionId }`
  - Se não tem `sessionId`, cria sessão via `client.beta.sessions.create()` com agent do módulo
  - Injeta contexto do banco (via `agentContext.buildContext`) na mensagem do usuário
  - Faz streaming via `client.beta.sessions.events.stream()` + `events.send()`
  - Envia tokens via SSE (`data: { type, text, sessionId }`)
  - Persiste sessão no Supabase (`agent_sessions`)
  - Usa headers: `anthropic-version: 2023-06-01`, beta: `managed-agents-2026-04-01`

- `GET /sessions` — lista sessões do usuário atual
- `DELETE /sessions/:id` — remove sessão

**3. Atualizar `src/api.js`** — novos métodos:
```js
agents.chat({ message, module, sessionId }) // retorna Response (SSE stream)
agents.sessions()
agents.deleteSession(id)
```
O método `chat` usa `fetch` direto (não `request()`) para poder ler o stream SSE.

**4. Refatorar `src/pages/admin/AssistenteIA.jsx`** — adicionar Tab "Chat IA":
- Duas tabs: "Chat IA" e "Auditorias"
- Chat com: seletor de módulo (supervisor/rh/financeiro/etc), campo de input, mensagens com markdown rendering (`react-markdown`), streaming token-by-token
- Sidebar com histórico de sessões
- Todo o código existente de auditorias permanece intacto na tab "Auditorias"

**5. Tabela `agent_sessions`** (migração SQL):
```sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  anthropic_session_id TEXT NOT NULL,
  agent_module TEXT NOT NULL DEFAULT 'supervisor',
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Dependência
- Instalar `@anthropic-ai/sdk` no backend (ou usar `fetch` direto para a API REST)
- Instalar `react-markdown` no frontend

### Variáveis de ambiente
- `ANTHROPIC_API_KEY` — já existe

### Arquivos alterados
- `backend/config/managedAgents.js` (novo)
- `backend/routes/agents.js` (novos endpoints)
- `src/api.js` (novos métodos)
- `src/pages/admin/AssistenteIA.jsx` (tabs + chat)
- Migração SQL para `agent_sessions`

