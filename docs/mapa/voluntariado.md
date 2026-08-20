# Módulo `voluntariado`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/agenteVoluntariado.js`
- `backend/routes/volEmails.js`
- `backend/routes/voluntariado-sync.js`
- `backend/routes/voluntariado.js`
Guard: `authorizeModule('voluntariado', 1 | 2 | 3)`
<details><summary>Endpoints (92)</summary>
- `DELETE /:id`
- `DELETE /api/voluntariado/inscricoes/:id`
- `DELETE /api/voluntariado/schedule-templates/:id`
- `DELETE /api/voluntariado/schedules/:id`
- `DELETE /templates/:id`
- `GET `
- `GET /:id`
- `GET /:id/destinatarios`
- `GET /api/agente-voluntariado`
- `GET /api/agente-voluntariado/cron/checar`
- `GET /api/voluntariado/acessos`
- `GET /api/voluntariado/acessos/cargos`
- `GET /api/voluntariado/antecedentes/pendentes`
- `GET /api/voluntariado/config`
- `GET /api/voluntariado/cron/antecedentes`
- `GET /api/voluntariado/cron/emails`
- `GET /api/voluntariado/cron/sync`
- `GET /api/voluntariado/diagnostics`
- `GET /api/voluntariado/escala-matriz`
- `GET /api/voluntariado/frequencia`
- `GET /api/voluntariado/frequencia/detalhe`
- `GET /api/voluntariado/frequencia/perfis`
- `GET /api/voluntariado/inscricoes`
- `GET /api/voluntariado/inscricoes-summary`
- `GET /api/voluntariado/inscricoes/:id/antecedentes`
- `GET /api/voluntariado/inscricoes/por-direcionada`
- `GET /api/voluntariado/kpis/taticos`
- `GET /api/voluntariado/pco-cpf-check`
- `GET /api/voluntariado/pco-schedule-debug`
- `GET /api/voluntariado/schedule-templates`
- `GET /api/voluntariado/schedule-templates/:id`
- `GET /api/voluntariado/schedule-templates/por-tipo/:serviceTypeId`
- `GET /api/voluntariado/services/:serviceId/contexto-montagem`
- `GET /api/voluntariado/services/:serviceId/escala-cobertura`
- `GET /api/voluntariado/teams-manage/mapa-pco`
- `GET /api/voluntariado/teams-manage/pendencias-pco`
- `GET /api/voluntariado/vol-cpf-coverage`
- `GET /api/voluntariado/vol-cpf-hidden-check`
- `GET /config`
- `GET /templates`
- `PATCH /api/voluntariado/antecedentes/:id`
- `PATCH /api/voluntariado/inscricoes/:id`
- `PATCH /api/voluntariado/inscricoes/:id/dados`
- `POST `
- `POST /:id/agendar`
- `POST /:id/cancelar`
- `POST /:id/enviar`
- `POST /:id/reenviar-erros`
- `POST /:id/teste`
- `POST /api/agente-voluntariado/avisar-semana`
- `POST /api/agente-voluntariado/cron/checar`
- `POST /api/agente-voluntariado/lembrar`
- `POST /api/voluntariado/acessos/criar-login`
- `POST /api/voluntariado/backfill-cpf`
- `POST /api/voluntariado/backfill-cpf-from-membro`
- `POST /api/voluntariado/backfill-emails`
- `POST /api/voluntariado/backfill-nascimento`
- `POST /api/voluntariado/frequencia/importar`
- `POST /api/voluntariado/frequencia/revincular`
- `POST /api/voluntariado/frequencia/saiu-igreja`
- `POST /api/voluntariado/frequencia/sugerir-vinculos`
- `POST /api/voluntariado/frequencia/sync-pco`
- `POST /api/voluntariado/frequencia/vincular`
- `POST /api/voluntariado/frequencia/vincular-lote`
- `POST /api/voluntariado/inscricoes/:id/antecedentes/consultar`
- `POST /api/voluntariado/inscricoes/:id/desistiu`
- `POST /api/voluntariado/inscricoes/excluir-lote`
- `POST /api/voluntariado/schedule-templates`
- `POST /api/voluntariado/schedule-templates/:id/apply`
- `POST /api/voluntariado/schedules`
- `POST /api/voluntariado/schedules/auto-fill`
- `POST /api/voluntariado/schedules/bulk`
- `POST /api/voluntariado/schedules/copy`
- `POST /api/voluntariado/schedules/desfazer-lote`
- `POST /api/voluntariado/sync`
- `POST /api/voluntariado/sync-auto`
- `POST /api/voluntariado/sync-historical`
- `POST /api/voluntariado/teams-manage/import-from-schedules`
- `POST /api/voluntariado/teams-manage/mapa-pco`
- `POST /api/voluntariado/teams-manage/sync-members-from-schedules`
- `POST /gerar-ia`
- `POST /preview`
- `POST /resolver-destinatarios`
- `POST /templates`
- `POST /upload-imagem`
- `PUT /:id`
- `PUT /api/voluntariado/config`
- `PUT /api/voluntariado/frequencia/inatividade`
- `PUT /api/voluntariado/schedule-templates/:id`
- `PUT /api/voluntariado/schedules/:id`
- `PUT /config`
- `PUT /templates/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/cpf.js`
- `backend/utils/cronAuth.js`
- `backend/utils/cursorLote.js`
- `backend/utils/exclusaoInscricaoLote.js`
- `backend/utils/pcoChave.js`
- `backend/utils/supabase.js`
- `backend/utils/vigenciaTipoCulto.js`
- `backend/utils/volCobertura.js`
- `backend/utils/volDisponibilidade.js`
- `backend/utils/volIntegradoEm.js`
- `backend/utils/volRodizio.js`
- `backend/utils/volSyncIntegrity.js`

**Serviços**

- `backend/services/agenteVoluntariado.js`
- `backend/services/antecedentesCriminais.js`
- `backend/services/cerebroSync.js`
- `backend/services/cpfReconciliar.js`
- `backend/services/email.js`
- `backend/services/escalaAviso.js`
- `backend/services/escalaResposta.js`
- `backend/services/jornadaMarcadores.js`
- `backend/services/membroMatch.js`
- `backend/services/notificar.js`
- `backend/services/planningCenter.js`
- `backend/services/solicitacoesMlTracker.js`
- `backend/services/volCheckinResolver.js`
- `backend/services/volEmailIa.js`
- `backend/services/volEmailSender.js`
- `backend/services/volInscricaoStatus.js`
- `backend/services/volNomeFiltro.js`
- `backend/services/volVinculoIA.js`
- `backend/services/voluntariadoFreqPCO.js`
- `backend/services/voluntariadoSync.js`
- `backend/services/whatsappFila.js`

**Tabelas que estas rotas tocam**

- `cargos`
- `kpi_indicadores_taticos`
- `mem_membros`
- `profiles`
- `usuarios`
- `vol_availability`
- `vol_background_checks`
- `vol_config`
- `vol_email_config`
- `vol_email_disparo_destinatarios`
- `vol_email_disparos`
- `vol_email_templates`
- `vol_escala_culto_itens`
- `vol_escala_template_item_pessoas`
- `vol_escala_template_itens`
- `vol_escala_template_liderancas`
- `vol_escala_template_tipos`
- `vol_escala_templates`
- `vol_inatividade`
- `vol_inscricoes`
- `vol_inscritos`
- `vol_pco_mapa`
- `vol_profiles`
- `vol_schedules`
- `vol_services`
- `vol_servicos_historico`
- `vol_sync_logs`
- `vol_team_members`
- `vol_teams`
- `vw_kpi_trajetoria_atual`
- `vw_vol_frequencia`

**RPCs**

- `app_soft_delete`

**Namespace no front (src/api.js)**

- `voluntariado`

