# Módulo `santander`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/santander.js`
Guard: `authorizeModule('santander', 3 | padrão)`
<details><summary>Endpoints (36)</summary>
- `DELETE /api/santander/comprovantes/:paymentId/vincular`
- `GET /api/santander/boletos`
- `GET /api/santander/boletos/:id`
- `GET /api/santander/boletos/health`
- `GET /api/santander/bulk`
- `GET /api/santander/bulk/:orderId`
- `GET /api/santander/comprovantes`
- `GET /api/santander/comprovantes-local`
- `GET /api/santander/comprovantes/:paymentId/pdf-url`
- `GET /api/santander/contas`
- `GET /api/santander/extrato`
- `GET /api/santander/health`
- `GET /api/santander/log`
- `GET /api/santander/pagamentos`
- `GET /api/santander/pagamentos/:id`
- `GET /api/santander/pagamentos/health`
- `GET /api/santander/pix-api/diagnostico`
- `GET /api/santander/pix-cob`
- `GET /api/santander/pix-cob/:txid`
- `GET /api/santander/pix-cob/health`
- `GET /api/santander/pix/culto-atual`
- `GET /api/santander/saldo`
- `GET /api/santander/saldo/historico`
- `GET /api/santander/sync-extrato-historico`
- `PATCH /api/santander/boletos/:id/cancelar`
- `PATCH /api/santander/pagamentos/:id/cancelar`
- `PATCH /api/santander/pix-cob/:txid/cancelar`
- `POST /api/santander/boletos`
- `POST /api/santander/bulk`
- `POST /api/santander/comprovantes/:paymentId/baixar`
- `POST /api/santander/comprovantes/:paymentId/vincular`
- `POST /api/santander/importar-historico`
- `POST /api/santander/pagamentos`
- `POST /api/santander/pagamentos/parse`
- `POST /api/santander/pix-cob`
- `POST /api/santander/sync-extrato-fila`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/documentoBr.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/financeiroClassificador.js`

**Tabelas que estas rotas tocam**

- `fin_contas`
- `fin_lancamentos_brutos`
- `fin_uploads`
- `santander_boletos`
- `santander_bulk_orders`
- `santander_comprovantes`
- `santander_pagamentos`
- `santander_pix_cob`
- `santander_sync_log`
- `vw_fin_culto_ao_vivo`

**Namespace no front (src/api.js)**

- `santander`

