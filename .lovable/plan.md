

## Plano: Cache em memória para shipments do ML

### Problema
A rota `GET /shipments` faz até 50+ chamadas à API do ML (1 para orders + 1 por shipment), o que é lento e pode atingir rate limits.

### Solução
Adicionar um cache em memória simples no topo de `backend/routes/ml.js`:
- Um objeto `{ data, timestamp }` para o resultado de `/shipments`
- TTL de 5 minutos (300s) — se o cache ainda for válido, retorna direto
- Parâmetro opcional `?refresh=1` para forçar bypass do cache
- Cache invalidado ao desconectar ML (`POST /disconnect`)

### Arquivo alterado
- `backend/routes/ml.js` — adicionar variável de cache no topo e lógica de verificação no `GET /shipments` e `POST /disconnect`

### Detalhes técnicos
- Cache simples em variável (adequado para Vercel serverless — cada cold start limpa naturalmente)
- Sem dependências externas

