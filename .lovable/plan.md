

## Plano: Persistir sessões e histórico de mensagens do chat IA

### Problema
1. **Sessão não aparece na sidebar** — o `INSERT INTO agent_sessions` pode falhar silenciosamente (o catch apenas loga warning), ou a tabela pode não existir no banco. Além disso, `loadSessions()` é chamado via `sendEvent('session')` que pode disparar antes do INSERT no backend ter completado.
2. **Mensagens desaparecem ao clicar "+ Nova"** — as mensagens existem apenas no state React (`useState`), não são persistidas no banco. Ao restaurar uma sessão, só aparece "Sessão restaurada" sem o histórico real.

### Correções

**1. Backend: Garantir ordem correta (INSERT antes do sendEvent)**
- No `backend/routes/agents.js`, mover o `sendEvent('session', ...)` para DEPOIS do `await db.query(INSERT...)` e verificar se o INSERT teve sucesso antes de prosseguir. Adicionar log de erro mais explícito.

**2. Backend: Criar tabela `agent_messages` para persistir histórico**
- Nova migration `004_agent_messages.sql` com tabela:
  - `id`, `session_id` (FK para agent_sessions.id), `role` (user/assistant), `content`, `created_at`
- No endpoint `/agents/chat`, salvar a mensagem do usuário ao receber e a resposta do assistente ao finalizar o stream.

**3. Backend: Endpoint para carregar histórico de uma sessão**
- `GET /agents/sessions/:id/messages` — retorna mensagens ordenadas por `created_at`.

**4. Frontend: Carregar mensagens ao restaurar sessão**
- Em `resumeSession()`, chamar o novo endpoint para carregar o histórico real em vez de exibir apenas "Sessão restaurada".
- Em `src/api.js`, adicionar `sessionMessages: (id) => get(`/agents/sessions/${id}/messages`)`.

**5. Frontend: Garantir sidebar aberta por padrão**
- Mudar `showSessions` de `false` para `true` como estado inicial, para que as sessões fiquem sempre visíveis.

### Arquivos alterados
- `backend/migrations/004_agent_messages.sql` — nova tabela
- `backend/routes/agents.js` — persistir mensagens + novo endpoint GET messages
- `src/api.js` — adicionar `sessionMessages()`
- `src/pages/admin/AssistenteIA.jsx` — carregar histórico ao restaurar sessão, sidebar aberta por padrão

