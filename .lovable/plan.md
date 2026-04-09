

## Plano: Botão "Atualizar" com refresh forçado na aba Rastreio

### Situação atual
- Já existe um botão "🔄 Atualizar" na linha 1278, mas ele chama `loadShipments()` que usa `ml.shipments()` — sem `?refresh=1`
- A função `ml.shipments()` em `src/api.js` não aceita parâmetros

### Alterações

**1. `src/api.js`** — aceitar parâmetro opcional:
```js
shipments: (params) => get('/ml/shipments' + (params ? '?' + new URLSearchParams(params) : '')),
```

**2. `src/pages/admin/logistica/Logistica.jsx`** — criar função de refresh forçado:
- Adicionar `loadShipmentsForced()` que chama `ml.shipments({ refresh: 1 })`
- O botão "Atualizar" existente na linha 1278 passa a chamar `loadShipmentsForced`
- O auto-refresh e o `useEffect` inicial continuam usando `loadShipments()` (com cache)
- Na tela vazia (linha 1267-1273), adicionar um botão "Tentar novamente" que também força refresh

