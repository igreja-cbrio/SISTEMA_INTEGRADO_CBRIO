

## Plano: Corrigir resposta em branco do chat IA

### Problema identificado

O backend em `backend/routes/agents.js` (linhas 166-171) parseia o stream SSE da Anthropic procurando especificamente por eventos do tipo `content_block_delta` com `delta.type === 'text_delta'`. Esse formato pertence a **Messages API**, mas o chat usa a **Sessions API** (`/v1/sessions/{id}/events`), que retorna eventos com estrutura diferente.

Como nenhum evento bate com o filtro, nenhum delta de texto e repassado ao frontend, resultando em resposta em branco.

### Correção

1. **Adicionar logging temporario dos eventos recebidos** da Anthropic para descobrir a estrutura exata dos eventos da Sessions API.
2. **Expandir o parsing de eventos** no backend para cobrir os formatos da Sessions API. Baseado na documentacao da API, os eventos provaveis sao:
   - `agent.message` ou `assistant.message` (mensagem completa)
   - `agent.message.delta` ou `text` events com conteudo parcial
   - Ou o mesmo `content_block_delta` mas com path/estrutura diferente
3. **Adicionar um `console.log` de cada evento recebido** (temporariamente) para mapear a estrutura real e garantir que o parsing funcione.
4. **Implementar um fallback generico**: se o evento tiver qualquer campo de texto reconhecivel, extrair e repassar como delta.

### Mudanca principal

Em `backend/routes/agents.js`, no bloco de parsing (linhas 158-179):

```js
// Antes: so captura content_block_delta
if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') { ... }

// Depois: captura multiplos formatos possiveis da Sessions API
// Log para debug
console.log('[AGENTS] SSE event:', JSON.stringify(event).slice(0, 300));

// Formatos da Messages API
if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
  text = event.delta.text;
}
// Formatos da Sessions API
else if (event.type === 'message_delta' && event.delta?.text) {
  text = event.delta.text;
}
else if (event.type === 'text' && event.text) {
  text = event.text;
}
// Fallback: qualquer evento com content[].text
else if (event.content) {
  const textBlock = (Array.isArray(event.content) ? event.content : [event.content])
    .find(b => b.type === 'text' && b.text);
  if (textBlock) text = textBlock.text;
}

if (text) { fullText += text; sendEvent('delta', { text }); }
```

### Arquivo alterado

- `backend/routes/agents.js` (bloco de parsing SSE, ~20 linhas)

### Resultado esperado

- O backend passa a capturar eventos de texto independente do formato exato retornado pela Sessions API.
- O log temporario permite diagnosticar rapidamente se ainda houver formatos nao cobertos.
- O frontend recebe os deltas e exibe a resposta normalmente com o indicador de digitacao.

