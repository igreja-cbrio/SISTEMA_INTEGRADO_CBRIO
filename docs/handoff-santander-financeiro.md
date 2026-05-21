# Handoff · Integração Santander + Módulo Financeiro (2026-05-21)

Status do projeto até este ponto + próximos passos imediatos. Pra retomar
em outro chat, basta abrir esse arquivo e dizer "continue daqui".

---

## Estado atual · resumo de 1 linha

**Santander OAuth conectado em produção. Saldo aparece. Falta validar limite
de cheque especial (PR #611 em deploy), confirmar anomalia do "invested
amount" negativo, testar upload OFX/PIX e disparar primeiro sync via API.**

---

## PRs do dia (em ordem cronológica)

| PR | Título | Status |
|---|---|---|
| #581 | Santander Open Banking base + Estrutura fiscal (plano contas + engine OFX/PIX) | ✅ Mergeada |
| #591 | Dashboard redesign + cron Santander + notificações + backfill | ✅ Mergeada |
| #597 | Fix React #310 no DashboardOverview (hooks antes do return) | ✅ Mergeada |
| #600 | Fix SantanderTab mostrar erro real quando OAuth falha | ✅ Mergeada |
| #601 | Fix mTLS via undici.Agent + dispatcher (resolve 403 Access Denied) | ✅ Mergeada |
| #605 | Inclui body do Santander na mensagem de erro 4xx/5xx | ✅ Mergeada |
| #606 | Parser de erro lê formato underscore (_errors[]) | ✅ Mergeada |
| #607 | Zero-padding na conta (formato 4+12 dígitos) · resolve 422 | ✅ Mergeada |
| #610 | Exibe limite de cheque especial + tooltips | ✅ Mergeada (estava lendo do endpoint errado) |
| #611 | Busca limite via /accounts (/balances não tem) | ⏳ Aberta · aguardando deploy Vercel |

Todas as migrations aplicadas no Supabase. Lista completa:

- `20260521150000_santander_integracao.sql` (6 tabelas Santander)
- `20260521160000_fin_plano_contas_centros.sql` (110 contas + 81 centros)
- `20260521160100_fin_identificadores_e_culto_slots.sql` (3 identificadores + 7 slots)
- `20260521160200_fin_lancamentos_brutos_e_pix.sql`
- `20260521160300_fin_regras_classificacao.sql`
- `20260521160400_fin_transacoes_v2_fks.sql`
- `20260521160500_mem_membros_cnpj.sql`
- `20260521170000_fin_identificadores_plano_opcional.sql`
- `20260521240000_santander_overdraft.sql`

---

## Configuração já aplicada no Vercel (9 envs Santander)

```
SANTANDER_AMBIENTE=producao
SANTANDER_CLIENT_ID=<configurado>
SANTANDER_CLIENT_SECRET=<configurado>
SANTANDER_APPLICATION_KEY=<mesmo valor do CLIENT_ID>
SANTANDER_CERT_PEM_BASE64=<base64 do cbrio-santander.crt>
SANTANDER_KEY_PEM_BASE64=<base64 do cbrio-santander.key>
SANTANDER_AGENCIA=3957
SANTANDER_CONTA=130004222
SANTANDER_CNPJ_TITULAR=07023068000135
```

Certificado e-CNPJ ICP-Brasil válido até 20/05/2027, registrado no Portal do
Desenvolvedor Santander em produção.

Aplicação Santander criada em **produção** (não homologação).

---

## Arquitetura entregue

### 1. Integração Santander Open APIs

- `backend/services/santander/httpClient.js` · mTLS via undici.Agent + dispatcher
- `backend/services/santander/contasService.js` · saldo, extrato, limite via /accounts
- `backend/services/santander/comprovantesService.js` · file_request + bulk
- `backend/routes/santander.js` · REST endpoints
- `backend/routes/santanderCron.js` · sync diário protegido por CRON_SECRET
- `.github/workflows/santander-cron-sync.yml` · cron diário 09:00 UTC

### 2. Estrutura fiscal CBRio

- **Plano de contas** (`fin_plano_contas`) · 110 contas hierárquicas, seed completo do RTF
- **Centros de custo** (`fin_centros_custo`) · 81 centros (Barra + Recreio)
- **Identificadores de centavo** (`fin_identificadores_centavo`) · ,17 Templo, ,22 Bazar, ,31 Ação Social
- **Slots de culto** (`fin_culto_slots`) · 7 slots (Dom 8:30/10/11:30/19, Qua 20, AMI Sab, Bridge Sab)
- **Regras de classificação** (`fin_regras_classificacao`) · regex memo, CNPJ, palavra-chave

### 3. Engine de classificação

`backend/services/financeiroClassificador.js` · 5 camadas (ordem):
1. Identificador de centavo (config UI)
2. Memória histórica (mesma contraparte/valor 2+ vezes)
3. Regras explícitas (regex / CNPJ / palavra-chave)
4. Match OFX × PIX detalhe (enriquece hora + identifica culto)
5. (Futuro) Claude Haiku pra ambíguos

### 4. Parsers

- `backend/services/ofxParser.js` · OFX SGML/XML, encoding 1252, extrai CPF/CNPJ
- `backend/services/pixExtratoParser.js` · Excel/CSV, decodifica End-to-End ID PIX (UTC → BRT)

### 5. UI `/admin/financeiro` (11 abas)

Dashboard · Contas · Transações · Contas a Pagar · Reembolsos · DRE · Banco Santander · Semana qua-ter · Importar extratos · Fila de classificação · Estrutura fiscal

Dashboard novo (PR #591) · cards estilo Card shadcn + framer-motion + 4 atalhos com badges + 4 KPIs com variação % + gráfico Fluxo de Caixa (barras receita vs despesa 12 meses) + Distribuição de Despesas (barras horizontais) + Transações Recentes (tabela com badges) + Contas bancárias (grid).

### 6. Notificações financeiro (cron diário)

Em `notificacaoGenerator.js → gerarNotificacoesFinanceiro`:
- Contas a pagar vencendo (3 dias)
- Contas a pagar vencidas
- Reembolsos pendentes >5d
- Fila de classificação ≥20 itens
- Lançamentos brutos sem classificar >7d
- Sem upload de extrato >10d

---

## Decisões importantes / gotchas

### End-to-End ID PIX

Estrutura: `E[ISPB 8][YYYY][MM][DD][HH][MI][suffix 11]` · total 32 chars.
A hora vem em **UTC** · subtrai 3h pra BRT. A coluna "Data" do Excel está
em BRT, mas o **dia no ID está em UTC**. Quando PIX cai depois das 21h BRT
(= 00h+ UTC), o dia no ID adianta 1. Pra evitar bug, **datetime é reconstruído
inteiramente a partir do ID** (não confiar na coluna Data do Excel).

### mTLS + undici (PR #601)

Node 18+ usa `undici` por baixo do `fetch`. **Não aceita `agent`** · só
`dispatcher`. Bug original: `https.Agent` era passado mas ignorado · request
ia sem mTLS · Akamai do Santander rejeitava com 403.

### Conta com zero-padding (PR #607)

Santander exige: `{branch 4 dígitos}.{accountNumber 12 dígitos}`. CONTA da
CBRio "130004222" precisa virar "000130004222". Helpers `padAgencia()` e
`padConta()` em `contasService.js` aplicam padding na hora de chamar a API.
ENVs `SANTANDER_AGENCIA` e `SANTANDER_CONTA` ficam com valores "naturais".

### automaticallyInvestedAmount negativo (a investigar)

Saldo retornado pelo Santander em produção:
```json
{
  "availableAmount": "-8054.38",
  "blockedAmount": "0.00",
  "automaticallyInvestedAmount": "-15474.21"
}
```

Available negativo confere com cheque especial. **Mas invested negativo é
estranho** · esperado seria positivo (= quanto está investido) ou zero.
Pode ser:
1. Bug do Santander retornando sinal trocado
2. Saldo devedor da ContaMax (improvável)
3. Aplicação automática antecipada não liquidada

**Pendente**: confirmar no app Santander se realmente tem R\$ 15.474,21
investidos. Se sim, sinal está trocado · aplicar `Math.abs()` no campo.

### Endpoint /balances tem só 3 campos

Confirmado via `santander_saldo_snapshot.raw_response`. Limite de cheque
especial vem em `/accounts` (PR #611 já implementa).

### Regra dos hooks React (PR #597)

`useMemo` precisa vir ANTES de qualquer early return. Padrão sempre.

### Parser de erro Santander

Formato underscore: `{_errorCode, _message, _details, _errors: [{_code, _field, _message}]}`.
PR #606 cobre ambos formatos (underscore e camelCase).

---

## Pendências imediatas (próximos passos)

### 1. Aguardar PR #611 deploy + mergear

Vai mostrar 3 cards de overdraft (limite contratado/usado/disponível) **SE**
o endpoint `/accounts` retornar o campo. Se não retornar, conta provavelmente
não tem limite contratado ou está em outro produto.

### 2. Confirmar `automaticallyInvestedAmount` negativo

Comparar com app Santander. Se for bug do banco, abrir PR com `Math.abs()`.

### 3. Configurar GitHub Actions secrets

Em `github.com/igreja-cbrio/SISTEMA_INTEGRADO_CBRIO/settings/secrets/actions`:
- `CRON_SECRET` · mesmo valor da env `CRON_SECRET` no Vercel
- `APP_BASE_URL` · `https://cbrio.org`

Sem isso, workflow `santander-cron-sync.yml` sobe verde mas com warning
(sync não executa).

### 4. Testar upload OFX + Excel PIX (mesmo período)

**Arquivos atuais do Marcos não se sobrepõem em período:**
- OFX `extratopj13_05_2026...ofx` cobre 04-13/05/2026
- Excel PIX `excel_export...xlsx` cobre 17-21/05/2026

Pra testar matching de verdade, exportar do internet banking Santander
**os 2 do mesmo período** (ex: últimos 30 dias).

Fluxo de teste:
1. `/admin/financeiro` → aba **Importar extratos**
2. Sobe Excel PIX primeiro (sem precisar de conta)
3. Sobe OFX (precisa selecionar conta Santander cadastrada)
4. Esperado: `X matched com PIX · Y classificados automaticamente`
5. Aba **Fila de classificação** · revisar sugestões

Se ainda não tem conta Santander cadastrada em `/admin/financeiro` → aba
Contas, cadastrar com:
- Nome: `Santander Ag 3957 C/C 13000422-2`
- Banco: `Santander`
- Tipo: `corrente`

### 5. Primeiro sync API Santander

Quando os secrets do GitHub Actions estiverem configurados, posso disparar
manualmente via:
- `gh workflow run santander-cron-sync.yml` (via MCP)
- Ou no GitHub Actions: workflow "Santander · Sync extrato (diario)" → "Run workflow"

Resultado esperado: puxar últimos 3 dias de extrato direto pra
`fin_lancamentos_brutos`, rodar matching + classificação.

---

## Como retomar em outro chat

1. Abrir novo chat
2. Colar/anexar este arquivo (`docs/handoff-santander-financeiro.md`)
3. Dizer:
   > "Estou continuando trabalho do módulo Santander + Financeiro CBRio.
   > Lê o handoff em `docs/handoff-santander-financeiro.md` e me ajuda a
   > seguir das pendências imediatas. Próximo passo prioritário é
   > [escolher 1-5 acima]."

O Claude do novo chat tem acesso ao CLAUDE.md do projeto (que tem o contexto
geral do CBRio ERP) + este arquivo (que tem o contexto específico do
financeiro/Santander) e deve continuar sem precisar reaprender nada.

---

## Arquivos críticos pra revisar se houver dúvida

- `backend/services/santander/httpClient.js` · mTLS, OAuth, callApi
- `backend/services/santander/contasService.js` · saldo, extrato, limite
- `backend/services/financeiroClassificador.js` · 5 camadas de classificação
- `backend/routes/financeiroV2.js` · dashboard/overview, backfill
- `backend/routes/santanderCron.js` · sync diário
- `src/pages/admin/financeiro/DashboardOverview.jsx` · dashboard novo
- `src/pages/admin/financeiro/SantanderTab.jsx` · aba Banco Santander
- `src/pages/admin/financeiro/ImportarExtratos.jsx` · upload OFX/PIX
- `src/pages/admin/financeiro/FilaClassificacao.jsx` · revisão
- `CLAUDE.md` · contexto geral do projeto CBRio
