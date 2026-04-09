
Objetivo

- Corrigir o erro de validação na criação da sessão do chat IA do Supervisor.

Do I know what the issue is?

- Yes.

O que eu identifiquei

- Revisei os arquivos envolvidos no fluxo: `backend/routes/agents.js`, `backend/config/managedAgents.js`, `src/api.js`, `src/lib/api-base.js` e `src/pages/admin/AssistenteIA.jsx`.
- O frontend está chamando `/api/agents/chat` corretamente; o erro vem do backend ao criar a sessão na Anthropic.
- O código atual em `backend/routes/agents.js` envia:
```js
{
  agent: agentId,
  environment: ENVIRONMENT_ID,
}
```
- A documentação oficial da Anthropic para Managed Agents / Sessions usa:
```json
{
  "agent": "...",
  "environment_id": "..."
}
```
- Então o problema exato é este: o payload está misturando nomes de campos. `agent` está correto, mas `environment` está errado. O campo certo é `environment_id`.
- Isso bate exatamente com o erro do screenshot: `environment: Extra inputs are not permitted. Did you mean 'environment_id'?`

Plano de correção

1. Ajustar `backend/routes/agents.js` no bloco de criação da sessão (`POST https://api.anthropic.com/v1/sessions`).
2. Trocar apenas `environment` por `environment_id`.
3. Manter `agent` como está. Não mudar para `agent_id`, porque a própria documentação mostra que o short form correto é `agent`.
4. Adicionar um comentário curto nesse trecho para evitar regressão futura, já que a API é assimétrica (`agent` + `environment_id`).
5. Validar o fluxo completo após a alteração:
   - abrir Assistente IA,
   - enviar uma mensagem ao Supervisor,
   - confirmar que a sessão é criada,
   - confirmar que o banner vermelho some,
   - confirmar que a resposta começa a chegar via streaming.

Arquivo que precisa mudar

- `backend/routes/agents.js`

Arquivos revisados, mas sem necessidade de mudança para este erro

- `backend/config/managedAgents.js`
- `src/api.js`
- `src/lib/api-base.js`
- `src/pages/admin/AssistenteIA.jsx`

Mudança exata

```js
// de
body: JSON.stringify({
  agent: agentId,
  environment: ENVIRONMENT_ID,
})

// para
body: JSON.stringify({
  agent: agentId,
  environment_id: ENVIRONMENT_ID,
})
```

Observação importante de teste

- Seu screenshot está em `crmcbrio.vercel.app`, então se você estiver testando nessa instância externa, será necessário redeploy após a correção.
- Se testar no preview do Lovable, a validação deve refletir a versão atual do projeto.

Resultado esperado

- O erro vermelho de validação na criação da sessão desaparece.
- O chat do Supervisor passa da etapa de criação de sessão e segue para a resposta em streaming.
- Se surgir outro erro depois disso, ele já será da próxima etapa (`/sessions/{id}/events`), não mais da criação da sessão.
