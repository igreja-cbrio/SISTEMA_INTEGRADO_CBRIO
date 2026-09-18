# Módulo `projects`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/projects.js`
Guard: `authorizeModule('projects', 2)`
<details><summary>Endpoints (32)</summary>
- `DELETE /api/projects/:id`
- `DELETE /api/projects/budget/:itemId`
- `DELETE /api/projects/kpis/:kpiId`
- `DELETE /api/projects/risks/:riskId`
- `DELETE /api/projects/subtasks/:subId`
- `DELETE /api/projects/tasks/:taskId`
- `GET /api/projects`
- `GET /api/projects/:id`
- `GET /api/projects/:id/retrospective`
- `GET /api/projects/categories`
- `GET /api/projects/dashboard`
- `GET /api/projects/views/workload`
- `PATCH /api/projects/budget/:itemId`
- `PATCH /api/projects/kpis/:kpiId`
- `PATCH /api/projects/milestones/:mId/status`
- `PATCH /api/projects/phases/:phaseId`
- `PATCH /api/projects/risks/:riskId`
- `PATCH /api/projects/subtasks/:subId`
- `PATCH /api/projects/tasks/:taskId/status`
- `POST /api/projects`
- `POST /api/projects/:id/budget`
- `POST /api/projects/:id/kpis`
- `POST /api/projects/:id/milestones`
- `POST /api/projects/:id/phases`
- `POST /api/projects/:id/retrospective`
- `POST /api/projects/:id/risks`
- `POST /api/projects/:id/tasks`
- `POST /api/projects/tasks/:taskId/comments`
- `POST /api/projects/tasks/:taskId/subtasks`
- `PUT /api/projects/:id`
- `PUT /api/projects/milestones/:mId`
- `PUT /api/projects/tasks/:taskId`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Serviços**

- `backend/services/cerebroSync.js`

**Tabelas que estas rotas tocam**

- `project_budget_items`
- `project_categories`
- `project_kpis`
- `project_milestones`
- `project_phases`
- `project_retrospectives`
- `project_risks`
- `project_task_comments`
- `project_task_subtasks`
- `project_tasks`
- `projects`
- `v_projects_dashboard`

**RPCs**

- `app_soft_delete`

**Namespace no front (src/api.js)**

- `projects`

