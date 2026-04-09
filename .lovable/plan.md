

## Plano: Corrigir resposta em branco do chat IA (duas causas)

### Problemas identificados

**1. Frontend: bolha do assistente invisível (causa principal visual)**
Em `src/pages/admin/AssistenteIA.jsx` linha 355, o background da bolha do assistente é:
```js
background: `${C.border}40`
```
Onde `C.border = 'var(--cbrio-border)'`. Isso gera CSS inválido: `var(--cbrio-border)40`. O navegador não consegue interpretar, a bolha fica sem fundo, e o texto pode ficar invisível contra o fundo da página (texto da mesma cor que o background). **Esta é provavelmente a razão pela qual a resposta aparece "em branco" — o texto está lá, mas invisível.**

**2. Backend: junção incorreta de data lines SSE**
Em `backend/routes/agents.js` linha 237:
```js
handleSsePayload(dataLines.join('\n'));
```
Se um evento SSE tiver múltiplas linhas `data:`, elas são concatenadas com `\n` e passadas como uma string só para `JSON.parse`. Isso pode quebrar o parsing de JSON, resultando em nenhum texto extraído.

### Correções

**Arquivo 1: `src/pages/admin/AssistenteIA.jsx`**
- Linha 355: trocar `background: \`${C.border}40\`` por uma cor válida com opacidade, ex: `background: 'var(--cbrio-card)'` ou usar um valor hexadecimal sólido.

**Arquivo 2: `backend/routes/agents.js`**
- Linhas 236-238 e 250-252: em vez de `dataLines.join('\n')`, processar cada `data:` line individualmente com `handleSsePayload`, pois cada uma pode ser um JSON independente.

### Mudanças exatas

```js
// AssistenteIA.jsx linha 355 — de:
background: `${C.border}40`, color: C.text,
// para:
background: C.card, color: C.text, border: `1px solid ${C.border}`,
```

```js
// agents.js linhas 236-238 — de:
if (dataLines.length) {
  handleSsePayload(dataLines.join('\n'));
}
// para:
for (const dl of dataLines) {
  handleSsePayload(dl);
}
```

(Mesma mudança no bloco do tail chunk, linhas 250-252.)

### Resultado esperado
- A bolha do assistente fica visível com fundo sólido (cor do card) e borda sutil.
- O parser SSE do backend processa corretamente cada linha `data:` como JSON individual.
- A resposta do Supervisor aparece em streaming no chat.

