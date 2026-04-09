
Objetivo: fazer a sessão realmente persistir e reaparecer na lateral, mesmo após clicar em “+ Nova” ou recarregar a página.

Diagnóstico mais provável:
- O frontend já tenta listar e restaurar sessões, então o problema principal não parece mais ser só visual.
- Em `backend/routes/agents.js`, a persistência ainda falha de forma silenciosa: se salvar sessão ou mensagens der erro, o chat continua funcionando, mas nada fica gravado.
- O arquivo `backend/migrations/004_agent_messages.sql` no repositório não cria a tabela no banco por si só. Neste projeto não há runner automático de migrations; o SQL precisa existir no banco real do deploy.
- A rota de agentes usa `backend/utils/db.js` com `DATABASE_URL`. Se esse env não estiver configurado no deploy, a IA ainda responde, mas salvar/listar sessões quebra.
- Há um problema secundário de UX: `resumeSession()` fecha a sidebar e `startNewChat()` não reabre nem força refresh, o que pode parecer que “sumiu”.
- Há também um ajuste de segurança pendente: `GET /agents/sessions/:id/messages` não valida se a sessão pertence ao usuário.

Implementação proposta:
1. Garantir a estrutura no banco real
- Verificar se `agent_sessions` e `agent_messages` existem no banco do ambiente atual.
- Se faltarem, aplicar `003_agent_sessions.sql` e `004_agent_messages.sql`.
- Confirmar índice único para `agent_sessions.anthropic_session_id`.

2. Fortalecer a persistência no backend
- Refatorar `backend/routes/agents.js` para usar o client service-role já existente em `backend/utils/supabase.js` para sessões e mensagens, ou no mínimo parar de depender silenciosamente de `DATABASE_URL`.
- Se a gravação falhar, responder erro explícito em vez de seguir como se tivesse salvo.

3. Expor falhas de forma clara
- Se a sessão não puder ser persistida, enviar um evento de erro específico ao frontend.
- Mostrar aviso no chat quando a resposta aparecer, mas a conversa não tiver sido salva.

4. Ajustar a experiência da sidebar
- Em `src/pages/admin/AssistenteIA.jsx`, recarregar sessões no evento `done` e também ao clicar em “+ Nova”.
- Não esconder automaticamente a sidebar ao restaurar sessão em desktop, ou reabri-la em `startNewChat()`.
- Garantir que a sessão recém-criada continue visível na lista.

5. Corrigir a restauração com segurança
- Em `/agents/sessions/:id/messages`, validar que a sessão solicitada pertence a `req.user.userId` antes de retornar o histórico.

Arquivos previstos:
- `backend/routes/agents.js`
- `backend/utils/supabase.js` ou `backend/utils/db.js`
- `backend/migrations/003_agent_sessions.sql`
- `backend/migrations/004_agent_messages.sql`
- `src/pages/admin/AssistenteIA.jsx`

Validação final:
- Enviar uma mensagem ao Supervisor.
- Confirmar que a sessão aparece na lateral.
- Clicar em “+ Nova” e verificar que a conversa anterior continua listada.
- Reabrir a sessão e validar o histórico.
- Recarregar a página e confirmar que a sessão permanece.
- Testar o fluxo de erro para garantir que falha de persistência não fique silenciosa.
