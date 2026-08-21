# Módulo `inscricoes-totem`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/inscricoes.js`
Guard: `authorizeModule('inscricoes-totem', 1)`
<details><summary>Endpoints (54)</summary>
- `DELETE /api/inscricoes/email-templates/:tipo`
- `DELETE /api/inscricoes/eventos/:id`
- `DELETE /api/inscricoes/eventos/:id/beneficios/:beneficioId`
- `DELETE /api/inscricoes/eventos/:id/checkin/:inscricaoId`
- `DELETE /api/inscricoes/eventos/:id/inscricoes/:inscricaoId`
- `DELETE /api/inscricoes/eventos/:id/inscricoes/:inscricaoId/bolsa`
- `GET /api/inscricoes/app/eventos`
- `GET /api/inscricoes/app/eventos/:id/inscricoes`
- `GET /api/inscricoes/areas`
- `GET /api/inscricoes/email-templates`
- `GET /api/inscricoes/eventos`
- `GET /api/inscricoes/eventos/:id`
- `GET /api/inscricoes/eventos/:id/beneficios`
- `GET /api/inscricoes/eventos/:id/checkin`
- `GET /api/inscricoes/eventos/:id/checkin/buscar`
- `GET /api/inscricoes/eventos/:id/checkin/historico`
- `GET /api/inscricoes/eventos/:id/inscricoes`
- `GET /api/inscricoes/eventos/:id/inscricoes/:inscricaoId/comprovantes`
- `GET /api/inscricoes/eventos/:id/resumo`
- `GET /api/inscricoes/pagamento-saude`
- `GET /api/inscricoes/portas`
- `GET /api/inscricoes/qrs`
- `GET /api/inscricoes/series`
- `GET /api/inscricoes/totem/eventos`
- `GET /api/inscricoes/totens`
- `GET /api/inscricoes/totens/contas`
- `GET /api/inscricoes/unificadas`
- `GET /api/inscricoes/unificadas/dashboard`
- `GET /api/inscricoes/unificadas/pessoas`
- `PATCH /api/inscricoes/eventos/:id/inscricoes/:inscricaoId`
- `PATCH /api/inscricoes/qrs/:id/reativar`
- `PATCH /api/inscricoes/qrs/:id/revogar`
- `PATCH /api/inscricoes/totens/:id`
- `POST /api/inscricoes/email-templates/preview`
- `POST /api/inscricoes/email-templates/teste`
- `POST /api/inscricoes/eventos`
- `POST /api/inscricoes/eventos/:id/beneficios`
- `POST /api/inscricoes/eventos/:id/checkin`
- `POST /api/inscricoes/eventos/:id/inscricoes/:inscricaoId/bolsa`
- `POST /api/inscricoes/eventos/:id/inscricoes/:inscricaoId/comprovantes/:comprovanteId/aceitar`
- `POST /api/inscricoes/eventos/:id/inscricoes/:inscricaoId/comprovantes/:comprovanteId/recusar`
- `POST /api/inscricoes/eventos/:id/inscricoes/excluir-lote`
- `POST /api/inscricoes/eventos/:id/nova-edicao`
- `POST /api/inscricoes/eventos/:id/sortear`
- `POST /api/inscricoes/totem/eventos/:id/inscrever`
- `POST /api/inscricoes/totens`
- `POST /api/inscricoes/totens/:id/pareamento`
- `POST /api/inscricoes/totens/:id/revogar`
- `POST /api/inscricoes/totens/tokens/:tokenId/revogar`
- `POST /api/inscricoes/upload-arquivo`
- `POST /api/inscricoes/upload-capa`
- `PUT /api/inscricoes/email-templates/:tipo`
- `PUT /api/inscricoes/eventos/:id`
- `PUT /api/inscricoes/series/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/campoKey.js`
- `backend/utils/checkoutExterno.js`
- `backend/utils/exclusaoInscricaoLote.js`
- `backend/utils/lotesEvento.js`
- `backend/utils/pagination.js`
- `backend/utils/sanitize.js`
- `backend/utils/supabase.js`
- `backend/utils/totemCerco.js`

**Serviços**

- `backend/services/appPush.js`
- `backend/services/email.js`
- `backend/services/inscricaoComprovante.js`
- `backend/services/inscricaoContagem.js`
- `backend/services/inscricaoContrato.js`
- `backend/services/inscricaoEmail.js`
- `backend/services/inscricaoPortas.js`
- `backend/services/pagamentos.js`
- `backend/services/totemEstacao.js`

**Tabelas que estas rotas tocam**

- `app_push_tokens`
- `areas`
- `cargos`
- `insc_beneficios`
- `insc_checkin_eventos`
- `insc_checkins`
- `insc_comprovantes`
- `insc_email_templates`
- `insc_eventos`
- `insc_pagamentos`
- `insc_qr_tokens`
- `insc_series`
- `insc_sorteios`
- `inscricoes`
- `mem_temporadas`
- `next_turmas`
- `profiles`
- `totem_estacao_tokens`
- `totem_estacoes`
- `usuarios`
- `vw_insc_pagamento_estado`
- `vw_inscricoes_unificadas`

**RPCs**

- `app_soft_delete`
- `fn_insc_checkin_desfazer`
- `fn_insc_checkin_marcar`
- `fn_insc_portas_resumo`

