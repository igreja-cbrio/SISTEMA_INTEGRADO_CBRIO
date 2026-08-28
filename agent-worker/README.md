# CBRio · Agent Worker

Worker de agentes long-running da CBRio. Roda **fora** do Vercel (Railway)
porque agentes via Claude Agent SDK precisam de processo persistente e
timeout maior que o limite de 10s das serverless functions.

## Arquitetura

```
┌──────────────┐         POST /run/:agentType         ┌──────────────────┐
│   Vercel     │ ───────── HMAC-SHA256 ─────────────▶ │  Railway Worker  │
│  /api/agents │                                       │   (este repo)    │
└──────────────┘                                       │                  │
                                                       │  cron 3x/dia     │
┌──────────────┐                                       │  (9h/14h/19h SP) │
│   Supabase   │ ◀─── service_role (RLS bypass) ───── │                  │
│ agent_runs   │     read fin_* tables                 │  Agent SDK loop  │
│ agent_steps  │     write agent_queue (pending)       │  + MCP tools     │
│ agent_queue  │                                       │  + SKILL.md      │
└──────────────┘                                       └──────────────────┘
       ▲
       │ humano aprova via /assistente-ia
       │ backend aplica via applyQueueAction
```

## Agente disponivel

- **financeiro_executor** · varre fila de classificacao, contas a pagar
  pendentes, reembolsos e alertas; propoe acoes pra fila pra humano
  aprovar. **Nunca aplica nada direto.**

Proximos modulos suportados pela mesma estrutura (a plugar): membresia,
cuidados, eventos, voluntariado, etc.

## Estrutura

```
agent-worker/
├── src/
│   ├── server.ts                  HTTP server + HMAC auth + scheduler boot
│   ├── scheduler.ts               node-cron 3x/dia
│   ├── supabase.ts                client service_role
│   ├── hmac.ts                    HMAC-SHA256 sign/verify
│   ├── agents/
│   │   └── financeiroExecutor.ts  Agent SDK loop pro modulo financeiro
│   ├── skills/financeiro/
│   │   └── SKILL.md               Regras de dominio (injetadas no system prompt)
│   └── tools/
│       ├── financeiroRead.ts      Tools MCP read-only (listar_*, buscar_*, verificar_*)
│       └── financeiroPropose.ts   Tools MCP que gravam em agent_queue como pending
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Variaveis de ambiente

| Var | Obrigatoria | Descricao |
|---|---|---|
| `ANTHROPIC_API_KEY` | sim | Chave da Anthropic |
| `SUPABASE_URL` | sim | URL do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Service role (bypass RLS) |
| `AGENT_WORKER_HMAC_SECRET` | sim | Compartilhado com o Vercel pra autenticar inbound |
| `PORT` | nao | Default 8080 |
| `TZ` | nao | Default America/Sao_Paulo |
| `SCHEDULER_ENABLED` | nao | `1` pra ligar cron · `0` desliga |
| `FINANCEIRO_MODEL` | nao | Default `claude-sonnet-4-6` |
| `AGENT_MAX_TURNS` | nao | Default 20 |
| `CRON_SECRET` | **para o relatorio** | Mesmo segredo do Vercel · autentica o POST de envio do relatorio no backend |
| `APP_BASE_URL` | **para o relatorio** | Ex. `https://cbrio.org` · sem ela o relatorio e montado mas NAO enviado (a rodada fica `failed`) |
| `KPI_RELATORIO_EMAIL` | nao | Destinatario · default `gestao@cbrio.com.br` |
| `KPI_RELATORIO_MODEL` | nao | Default `claude-sonnet-4-6` |
| `KPI_RELATORIO_MAX_TURNS` | nao | Default 60 (o relatorio le muito mais que um watcher) |

No Vercel, configure:
- `AGENT_WORKER_URL` · ex: `https://cbrio-agent-worker.up.railway.app`
- `AGENT_WORKER_HMAC_SECRET` · mesmo valor do Railway

## Deploy no Railway

1. Criar novo Project no Railway, escolher "Deploy from GitHub repo"
2. Apontar pra este repo, **Root Directory = `agent-worker`**
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Setar todas as envs acima
6. Adicionar dominio publico (Settings > Networking > Generate Domain)
7. No Vercel, adicionar `AGENT_WORKER_URL` e `AGENT_WORKER_HMAC_SECRET`
8. Testar `GET <dominio>/health` · deve retornar `{ok: true, ...}`

## Testar localmente

```bash
cd agent-worker
cp .env.example .env
# edita .env com keys reais
npm install
npm run dev
```

Disparar rodada manual:
```bash
SECRET="$(grep AGENT_WORKER_HMAC_SECRET .env | cut -d= -f2)"
BODY='{"config":{"trigger":"manual"}}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -X POST http://localhost:8080/run/financeiro_executor \
  -H "Content-Type: application/json" \
  -H "X-Agent-Signature: $SIG" \
  -d "$BODY"
```

## Custo esperado

Sonnet 4.6 em ciclo financeiro:
- ~15-20 turnos por execucao
- ~20-40k tokens input (read tools retornam JSON), ~3-5k output
- ~$0.08-0.15 por execucao
- 3 execucoes/dia × 30 dias = ~$10/mes

## Observabilidade

- `agent_runs` · 1 linha por execucao com tokens/custo/status/summary
- `agent_steps` · 1 linha por turno do agente (resposta + tool_calls)
- `agent_queue` · 1 linha por proposta gerada
- Stdout no Railway · log estruturado de cada cron disparado

Pra ver historico no app: `/assistente-ia` > tab "Auditoria" filtra
por agent_type=`module_financeiro_executor`.
