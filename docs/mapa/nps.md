# Módulo `nps`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/nps.js`
Guard: `authorizeModule('nps', 1)`
<details><summary>Endpoints (12)</summary>
- `DELETE /api/nps/:id`
- `GET /api/nps`
- `GET /api/nps/:id`
- `GET /api/nps/:id/respostas`
- `POST /api/nps`
- `POST /api/nps/:id/analisar`
- `POST /api/nps/:id/importar-respostas`
- `POST /api/nps/:id/notificar`
- `POST /api/nps/:id/responder`
- `POST /api/nps/gerar-perguntas`
- `POST /api/nps/importar-form`
- `PUT /api/nps/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Serviços**

- `backend/services/googleFormsParser.js`
- `backend/services/notificar.js`
- `backend/services/npsKpiSync.js`
- `backend/services/npsService.js`

**Tabelas que estas rotas tocam**

- `nps_pesquisas`
- `nps_respostas`
- `profiles`
- `vw_nps_pesquisa_stats`

**RPCs**

- `app_soft_delete`

**Namespace no front (src/api.js)**

- `nps`

