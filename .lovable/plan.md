

## Diagnóstico: Por que a resposta continua em branco

### Os agentes são reais ou esqueletos?

Os agentes **existem de verdade** na plataforma Anthropic — cada um tem um ID real (ex: `agent_011CZtnVwVDPjxu4cJgm9ne2` para o Supervisor). O backend **injeta contexto real do banco de dados** na mensagem antes de enviar (dados de RH, financeiro, patrimônio, etc. via `buildContext()`). Então eles não são esqueletos — o problema é que **não conseguimos ver a resposta** porque o parser SSE não está capturando o formato correto dos eventos.

### Causa raiz

Não sabemos o formato exato dos eventos SSE que a Anthropic Sessions API retorna. O parser tenta vários formatos, mas nenhum funciona. Os `console.log` de debug foram adicionados, mas rodam no Vercel — precisamos ver os logs lá, ou trazer essa informação para o frontend.

### Plano de correção (abordagem de diagnóstico + fallback)

**1. Adicionar modo debug no frontend** — mostrar os eventos SSE brutos no console do navegador para diagnóstico imediato:

```js
// No backend, repassar TODOS os eventos SSE brutos ao frontend
// Adicionar um evento 'debug' que envia o payload raw
sendEvent('raw', { payload: jsonStr.slice(0, 500) });
```

**2. Fallback não-streaming** — se o stream não gerar texto, fazer uma segunda chamada usando a Messages API padrão (não Sessions API) como fallback, que tem formato bem documentado:

```js
// Se fullText estiver vazio após o stream, tentar Messages API diretamente
if (!fullText) {
  const fallbackRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPromptForModule,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  const fallbackData = await fallbackRes.json();
  const text = fallbackData.content?.[0]?.text;
  if (text) sendEvent('delta', { text });
}
```

**3. Frontend: capturar e exibir eventos raw** para debug temporário:

```js
// No sendMessage, tratar evento 'raw' para log no console
if (event.type === 'raw') {
  console.log('[CHAT DEBUG] Raw SSE:', event.payload);
}
```

### Arquivos alterados

- `backend/routes/agents.js` — adicionar envio de evento `raw` + fallback Messages API
- `src/pages/admin/AssistenteIA.jsx` — logar eventos `raw` no console

### Resultado esperado

- Com o fallback Messages API, o chat **sempre** terá uma resposta, mesmo que o stream da Sessions API falhe.
- Os eventos `raw` no console do navegador permitirão diagnosticar o formato exato da Sessions API para corrigir o parser definitivamente.
- Os agentes responderão com contexto real do sistema (dados de RH, financeiro, etc.).

