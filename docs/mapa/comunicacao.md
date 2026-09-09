# Módulo `comunicacao`
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
| `/comunicacao` | `src/pages/Comunicacao` | — |
## Backend
- `backend/routes/comunicacao.js`
Guard: `authorizeModule('comunicacao', 1 | 3 | 4 | 5)`
<details><summary>Endpoints (39)</summary>
- `DELETE /api/comunicacao/agendamentos/:id`
- `GET /api/comunicacao/agendamentos`
- `GET /api/comunicacao/atendentes`
- `GET /api/comunicacao/automaticas`
- `GET /api/comunicacao/bot-ia/areas`
- `GET /api/comunicacao/bot-ia/config`
- `GET /api/comunicacao/bot-ia/resumo`
- `GET /api/comunicacao/conexao`
- `GET /api/comunicacao/contatos`
- `GET /api/comunicacao/conversas/:id/sugestao-grupo`
- `GET /api/comunicacao/cron/agendamentos`
- `GET /api/comunicacao/custo`
- `GET /api/comunicacao/dashboard`
- `GET /api/comunicacao/envios`
- `GET /api/comunicacao/envios/resumo`
- `GET /api/comunicacao/equipe`
- `GET /api/comunicacao/erros`
- `GET /api/comunicacao/numeros`
- `GET /api/comunicacao/tarifas`
- `GET /api/comunicacao/templates`
- `PATCH /api/comunicacao/automaticas/:id`
- `POST /api/comunicacao/agendamentos`
- `POST /api/comunicacao/atendentes`
- `POST /api/comunicacao/bot-ia/simular`
- `POST /api/comunicacao/envios/agora`
- `POST /api/comunicacao/envios/previa`
- `POST /api/comunicacao/erros/:id/reenviar`
- `POST /api/comunicacao/numeros`
- `POST /api/comunicacao/templates/sync`
- `POST /api/comunicacao/templates/testar`
- `PUT /api/comunicacao/agendamentos/:id`
- `PUT /api/comunicacao/atendentes/:id`
- `PUT /api/comunicacao/bot-ia/areas/:area`
- `PUT /api/comunicacao/bot-ia/config`
- `PUT /api/comunicacao/conexao`
- `PUT /api/comunicacao/equipe/:area`
- `PUT /api/comunicacao/numeros/:id`
- `PUT /api/comunicacao/tarifas/:categoria`
- `PUT /api/comunicacao/templates/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/appError.js`
- `backend/utils/botIaRegras.js`
- `backend/utils/comunicacaoDashboard.js`
- `backend/utils/conexaoWhatsapp.js`
- `backend/utils/cronAuth.js`
- `backend/utils/equipeAtendimento.js`
- `backend/utils/janelaPeriodo.js`
- `backend/utils/novoEnvio.js`
- `backend/utils/sentry.js`
- `backend/utils/supabase.js`
- `backend/utils/whatsappModulo.js`

**Serviços**

- `backend/services/botIaResposta.js`
- `backend/services/busca.js`
- `backend/services/comunicacaoAutomaticas.js`
- `backend/services/comunicacaoDisparosOff.js`
- `backend/services/sugestaoGrupoAgenda.js`
- `backend/services/waEquipe.js`
- `backend/services/waInbox.js`
- `backend/services/waStatusReconcile.js`
- `backend/services/waTemplates.js`
- `backend/services/whatsappFila.js`
- `backend/services/whatsappTesteDisparo.js`

**Tabelas que estas rotas tocam**

- `areas`
- `camp_campanhas`
- `inscricao_consentimentos`
- `mem_grupos`
- `mem_membros`
- `profiles`
- `wa_agendamentos`
- `wa_atendentes`
- `wa_bot_areas`
- `wa_conversas`
- `wa_equipe_atendimento`
- `wa_mensagens`
- `wa_numeros`
- `wa_tarifas`
- `wa_templates`
- `whatsapp_coletas`
- `whatsapp_config`
- `whatsapp_envios`
- `whatsapp_lideres`
- `whatsapp_status_orfaos`

**Namespace no front (src/api.js)**

- `comunicacao`

