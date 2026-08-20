# Módulo `cerebro`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/cerebro.js`
Guard: `authorizeModule('cerebro', 1)`
<details><summary>Endpoints (6)</summary>
- `GET /api/cerebro/status`
- `GET /api/cerebro/webhook`
- `POST /api/cerebro/backfill/:entityType`
- `POST /api/cerebro/subscriptions`
- `POST /api/cerebro/sync-now/:entityType/:id`
- `POST /api/cerebro/webhook`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/cronAuth.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/cerebroProcessor.js`
- `backend/services/cerebroSync.js`
- `backend/services/storageService.js`

**Tabelas que estas rotas tocam**

- `cerebro_config`
- `cerebro_fila`
- `cerebro_stats`
- `cerebro_sync_fila`
- `mem_contribuicoes`

