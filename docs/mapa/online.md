# Módulo `online`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Telas (ERP)
| rota | arquivo | nível |
|---|---|---|
| `/online` | `src/pages/ministerial/Online` | — |
## Backend
- `backend/routes/online.js`
Guard: `authorizeModule('online', 3)`
<details><summary>Endpoints (39)</summary>
- `GET /api/online/aceitacoes`
- `GET /api/online/cron/backfill-cultos`
- `GET /api/online/cron/catch-up`
- `GET /api/online/cron/ddus-collect`
- `GET /api/online/cron/ds-collect`
- `GET /api/online/cron/engajamento-collect`
- `GET /api/online/cron/live-monitor`
- `GET /api/online/cron/retencao-curva-collect`
- `GET /api/online/cron/sub-status-collect`
- `GET /api/online/cron/subs-collect`
- `GET /api/online/cron/sync`
- `GET /api/online/cron/trafego-collect`
- `GET /api/online/cron/verificar`
- `GET /api/online/cultos-metricas`
- `GET /api/online/dashboard`
- `GET /api/online/debug/analytics-test`
- `GET /api/online/debug/canais-autorizados`
- `GET /api/online/engajamento`
- `GET /api/online/link-membresia`
- `GET /api/online/oauth/authorize`
- `GET /api/online/oauth/callback`
- `GET /api/online/oauth/status`
- `GET /api/online/qr-cultos`
- `GET /api/online/series`
- `GET /api/online/series/:id`
- `POST /api/online/coletar/backfill-cultos`
- `POST /api/online/coletar/backfill-range`
- `POST /api/online/coletar/catch-up`
- `POST /api/online/coletar/ddus`
- `POST /api/online/coletar/ds`
- `POST /api/online/coletar/engajamento`
- `POST /api/online/coletar/live`
- `POST /api/online/coletar/retencao-curva`
- `POST /api/online/coletar/sub-status`
- `POST /api/online/coletar/subs`
- `POST /api/online/coletar/trafego`
- `POST /api/online/comunidade-mensal`
- `POST /api/online/oauth/disconnect`
- `POST /api/online/sync`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/cronAuth.js`
- `backend/utils/decisaoToken.js`
- `backend/utils/linkInscricaoApp.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/notificacaoGenerator.js`
- `backend/services/onlineCollectors.js`
- `backend/services/youtubeAnalytics.js`
- `backend/services/youtubeCollector.js`

**Tabelas que estas rotas tocam**

- `cui_convertidos`
- `cultos`
- `cultura_mensal`
- `kpi_indicadores_taticos`
- `online_canal_snapshot`
- `online_engajamento`
- `online_oauth_tokens`
- `online_video_retencao_curva`
- `online_video_trafico`
- `online_videos`
- `vw_culto_stats`
- `vw_kpi_trajetoria_atual`
- `vw_online_oauth_status`
- `vw_online_series_kpi`

**Namespace no front (src/api.js)**

- `online`

