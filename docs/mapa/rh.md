# Módulo `rh`
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
- `backend/routes/painelRh.js`
- `backend/routes/rh.js`
Guard: `authorizeModule('rh', 1 | 2 | 3 | 5 | padrão)`
<details><summary>Endpoints (95)</summary>
- `DELETE /api/events/:id`
- `DELETE /api/events/attachments/:attachId`
- `DELETE /api/events/risks/:riskId`
- `DELETE /api/events/simple-templates/:id`
- `DELETE /api/events/subtasks/:subId`
- `DELETE /api/events/tasks/:taskId`
- `DELETE /api/painel-rh/comunicados/:id`
- `DELETE /api/rh/avaliacoes/:id`
- `DELETE /api/rh/documentos/:id`
- `DELETE /api/rh/extras/:id`
- `DELETE /api/rh/ferias/:id`
- `DELETE /api/rh/funcionarios/:id`
- `DELETE /api/rh/treinamentos/:id`
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
- `GET /api/painel-rh/aniversariantes`
- `GET /api/painel-rh/comunicados`
- `GET /api/painel-rh/comunicados/admin`
- `GET /api/painel-rh/eventos`
- `GET /api/rh/acessos`
- `GET /api/rh/avaliacoes`
- `GET /api/rh/coberturas`
- `GET /api/rh/config`
- `GET /api/rh/cron/nao-pagos`
- `GET /api/rh/dashboard`
- `GET /api/rh/dashboard/series`
- `GET /api/rh/extras`
- `GET /api/rh/ferias`
- `GET /api/rh/folha/nao-vinculados`
- `GET /api/rh/funcionarios`
- `GET /api/rh/funcionarios/:id`
- `GET /api/rh/funcionarios/:id/pagamentos`
- `GET /api/rh/kpis`
- `GET /api/rh/onboarding/pendentes`
- `GET /api/rh/treinamentos`
- `PATCH /api/events/:id/occurrences/:occId`
- `PATCH /api/events/:id/status`
- `PATCH /api/events/:id/visivel-painel-rh`
- `PATCH /api/events/risks/:riskId`
- `PATCH /api/events/simple-templates/:id/toggle`
- `PATCH /api/events/subtasks/:subId`
- `PATCH /api/events/tasks/:taskId/status`
- `PATCH /api/rh/avaliacoes/:id`
- `PATCH /api/rh/extras/:id`
- `PATCH /api/rh/ferias/:id`
- `PATCH /api/rh/folha/vinculo/:transacaoId`
- `PATCH /api/rh/treinamentos-funcionarios/:id`
- `POST /api/events`
- `POST /api/events/:eventId/tasks/:taskId/attachments`
- `POST /api/events/:id/apply-simple-templates`
- `POST /api/events/:id/retrospective`
- `POST /api/events/:id/risks`
- `POST /api/events/:id/tasks`
- `POST /api/events/simple-templates`
- `POST /api/events/tasks/:taskId/comments`
- `POST /api/events/tasks/:taskId/subtasks`
- `POST /api/painel-rh/comunicados`
- `POST /api/painel-rh/comunicados/:id/arquivar`
- `POST /api/painel-rh/comunicados/:id/publicar`
- `POST /api/rh/avaliacoes`
- `POST /api/rh/avaliacoes/:id/concluir`
- `POST /api/rh/avaliacoes/:id/fatores`
- `POST /api/rh/avaliacoes/iniciar-ciclo`
- `POST /api/rh/coberturas/:id/cancelar`
- `POST /api/rh/extras`
- `POST /api/rh/folha/auto-vincular`
- `POST /api/rh/funcionarios`
- `POST /api/rh/funcionarios/:id/concluir-admissao`
- `POST /api/rh/funcionarios/:id/desligar`
- `POST /api/rh/funcionarios/:id/documentos`
- `POST /api/rh/funcionarios/:id/ferias`
- `POST /api/rh/funcionarios/:id/foto`
- `POST /api/rh/funcionarios/:id/onboarding-link`
- `POST /api/rh/funcionarios/:id/reativar`
- `POST /api/rh/onboarding/disparar`
- `POST /api/rh/onboarding/preview`
- `POST /api/rh/organograma/ia`
- `POST /api/rh/organograma/ia/aplicar`
- `POST /api/rh/treinamentos`
- `POST /api/rh/treinamentos/:id/inscrever`
- `PUT /api/events/:id`
- `PUT /api/events/tasks/:taskId`
- `PUT /api/painel-rh/comunicados/:id`
- `PUT /api/rh/config/:chave`
- `PUT /api/rh/funcionarios/:id`
- `PUT /api/rh/funcionarios/:id/gestor`
- `PUT /api/rh/treinamentos/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/cronAuth.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/cerebroSync.js`
- `backend/services/cobertura.js`
- `backend/services/notificar.js`
- `backend/services/organogramaIA.js`
- `backend/services/rhOnboardingEnvios.js`
- `backend/services/storageService.js`
- `backend/services/whatsappService.js`

**Tabelas que estas rotas tocam**

- `audit_log`
- `card_completions`
- `cargos`
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
- `fin_plano_contas`
- `fin_transacoes`
- `insc_eventos`
- `meetings`
- `pcs_criterios`
- `pcs_graus`
- `pendencies`
- `profiles`
- `rh_avaliacao_fatores`
- `rh_avaliacoes`
- `rh_cobertura`
- `rh_comunicados`
- `rh_config`
- `rh_documentos`
- `rh_escalas_extras`
- `rh_ferias_licencas`
- `rh_folha_ignorados`
- `rh_folha_snapshots`
- `rh_funcionarios`
- `rh_treinamentos`
- `rh_treinamentos_funcionarios`
- `simple_event_task_templates`
- `usuarios`
- `v_events_dashboard`
- `vw_fin_transacoes_completa`

**RPCs**

- `app_soft_delete`

**Namespace no front (src/api.js)**

- `rh`

**Onde os APPS tocam este módulo**

- CBRio-Staff: `lib/api.ts`

