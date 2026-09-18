# Módulo `events`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/events.js`
Guard: `authorizeModule('events', 2)`
<details><summary>Endpoints (34)</summary>
- `DELETE /api/events/:id`
- `DELETE /api/events/attachments/:attachId`
- `DELETE /api/events/risks/:riskId`
- `DELETE /api/events/simple-templates/:id`
- `DELETE /api/events/subtasks/:subId`
- `DELETE /api/events/tasks/:taskId`
- `GET /api/events`
- `GET /api/events/:eventId/attachments`
- `GET /api/events/:eventId/tasks/:taskId/attachments`
- `GET /api/events/:id`
- `GET /api/events/:id/history`
- `GET /api/events/:id/retrospective`
- `GET /api/events/:id/risks`
- `GET /api/events/categories`
- `GET /api/events/dashboard`
- `GET /api/events/simple-templates`
- `PATCH /api/events/:id/occurrences/:occId`
- `PATCH /api/events/:id/status`
- `PATCH /api/events/:id/visivel-painel-rh`
- `PATCH /api/events/risks/:riskId`
- `PATCH /api/events/simple-templates/:id/toggle`
- `PATCH /api/events/subtasks/:subId`
- `PATCH /api/events/tasks/:taskId/status`
- `POST /api/events`
- `POST /api/events/:eventId/tasks/:taskId/attachments`
- `POST /api/events/:id/apply-simple-templates`
- `POST /api/events/:id/retrospective`
- `POST /api/events/:id/risks`
- `POST /api/events/:id/tasks`
- `POST /api/events/simple-templates`
- `POST /api/events/tasks/:taskId/comments`
- `POST /api/events/tasks/:taskId/subtasks`
- `PUT /api/events/:id`
- `PUT /api/events/tasks/:taskId`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/semFalhar.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/cerebroSync.js`
- `backend/services/notificar.js`
- `backend/services/storageService.js`

**Tabelas que estas rotas tocam**

- `audit_log`
- `card_completions`
- `cycle_phase_tasks`
- `cycle_task_subtasks`
- `event_categories`
- `event_cycle_phases`
- `event_cycles`
- `event_occurrences`
- `event_reports`
- `event_retrospectives`
- `event_risks`
- `event_task_attachments`
- `event_task_comments`
- `event_task_dependencies`
- `event_task_links`
- `event_task_subtasks`
- `event_tasks`
- `events`
- `meetings`
- `pendencies`
- `simple_event_task_templates`
- `v_events_dashboard`

**Namespace no front (src/api.js)**

- `events`

