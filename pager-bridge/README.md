# CBRio Pager Bridge

Agente local que liga a fila de chamadas de pager do **Totem Kids** ao
transmissor físico **LRS Freedom (T7470)** via rede (protocolo **LRSN · XML
sobre TCP**). Roda num PC ou Raspberry da recepção, na **mesma rede** do
transmissor.

## Como funciona

```
Checkout/pickup no Totem Kids (web)
   → backend enfileira em kids_pager_envios (status=pendente)
Pager Bridge (este agente · na recepção)
   → GET  /api/totem-kids/pager/bridge/fila        (bearer token)
   → abre TCP no Freedom e manda <PageRequest pager="2;NUMERO" .../>
   → POST /api/totem-kids/pager/bridge/envios/:id/resultado
Pager da família vibra 📳
```

- Só faz conexões de **saída** (HTTPS pro backend + TCP pro Freedom na LAN).
- **Não** usa a chave service_role nem abre porta de entrada no PC.
- Autentica no backend por **bearer token** (`PAGER_BRIDGE_TOKEN`), que precisa
  ser idêntico ao configurado no backend (Vercel).

## Instalação

```bash
cd pager-bridge
cp .env.example .env      # edite os valores
npm start                 # requer Node 18+
```

Para testar **sem o transmissor**, rode com `DRY_RUN=1` no `.env` — ele só
loga o que enviaria.

## Variáveis (.env)

| Variável | Descrição |
|---|---|
| `API_BASE_URL` | URL do backend, com `/api` (ex.: `https://app.cbrio.org/api`) |
| `PAGER_BRIDGE_TOKEN` | Token secreto · **igual** ao do backend |
| `LRS_HOST` | IP do Freedom na rede local (use IP fixo) |
| `LRS_PORT` | Porta do serviço NetPage/LRSN (padrão 5000 · **confirmar**) |
| `LRS_MESSAGE` | Alerta enviado ao coaster (padrão `Flash5Min`) |
| `POLL_MS` | Intervalo de polling da fila (padrão 3000ms) |
| `DRY_RUN` | `1` para simular sem hardware |

## Rodar como serviço (Windows)

Use o Agendador de Tarefas (ao iniciar a sessão) ou o `pm2`:

```bash
npm i -g pm2
pm2 start index.js --name pager-bridge
pm2 save
```

## ⚠️ Confirmar com a LRS

A porta TCP do serviço NetPage/LRSN no Freedom precisa estar habilitada e
acessível na LAN. Se o paging local pela Ethernet não estiver liberado (alguns
firmwares só usam a Ethernet pro SMS em nuvem), será necessário habilitar o
NetPage ou usar um transmissor de integração (TX-7471). O comando LRSN em si
já está implementado aqui.
