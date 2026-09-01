# Módulo `wifi`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/wifi.js`
Guard: `authorizeModule('wifi', 1 | 3)`
<details><summary>Endpoints (9)</summary>
- `GET /api/wifi/alertas`
- `GET /api/wifi/cron/sync`
- `GET /api/wifi/cultos`
- `GET /api/wifi/pessoas`
- `GET /api/wifi/pessoas/:cpf`
- `GET /api/wifi/resumo`
- `GET /api/wifi/semanas`
- `GET /api/wifi/servicos`
- `POST /api/wifi/sync`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/appError.js`
- `backend/utils/cronAuth.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/wifiSync.js`

**Tabelas que estas rotas tocam**

- `vol_service_types`
- `wifi_sync_log`

**RPCs**

- `fn_wifi_alertas`
- `fn_wifi_cultos`
- `fn_wifi_pessoa`
- `fn_wifi_pessoas`
- `fn_wifi_resumo`
- `fn_wifi_semanas`

**Namespace no front (src/api.js)**

- `wifi`

