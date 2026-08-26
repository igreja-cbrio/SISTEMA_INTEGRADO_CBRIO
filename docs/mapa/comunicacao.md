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
<details><summary>Endpoints (25)</summary>
- `DELETE /api/comunicacao/agendamentos/:id`
- `GET /api/comunicacao/agendamentos`
- `GET /api/comunicacao/atendentes`
- `GET /api/comunicacao/automaticas`
- `GET /api/comunicacao/contatos`
- `GET /api/comunicacao/conversas/:id/sugestao-grupo`
- `GET /api/comunicacao/cron/agendamentos`
- `GET /api/comunicacao/custo`
- `GET /api/comunicacao/envios`
- `GET /api/comunicacao/envios/resumo`
- `GET /api/comunicacao/erros`
- `GET /api/comunicacao/numeros`
- `GET /api/comunicacao/tarifas`
- `GET /api/comunicacao/templates`
- `PATCH /api/comunicacao/automaticas/:id`
- `POST /api/comunicacao/agendamentos`
- `POST /api/comunicacao/atendentes`
- `POST /api/comunicacao/erros/:id/reenviar`
- `POST /api/comunicacao/numeros`
- `POST /api/comunicacao/templates/sync`
- `PUT /api/comunicacao/agendamentos/:id`
- `PUT /api/comunicacao/atendentes/:id`
- `PUT /api/comunicacao/numeros/:id`
- `PUT /api/comunicacao/tarifas/:categoria`
- `PUT /api/comunicacao/templates/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/appError.js`
- `backend/utils/cronAuth.js`
- `backend/utils/sentry.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/busca.js`
- `backend/services/comunicacaoAutomaticas.js`
- `backend/services/comunicacaoDisparosOff.js`
- `backend/services/sugestaoGrupoAgenda.js`
- `backend/services/waInbox.js`
- `backend/services/waStatusReconcile.js`
- `backend/services/waTemplates.js`
- `backend/services/whatsappFila.js`

**Tabelas que estas rotas tocam**

- `inscricao_consentimentos`
- `mem_grupos`
- `mem_membros`
- `wa_agendamentos`
- `wa_atendentes`
- `wa_mensagens`
- `wa_numeros`
- `wa_tarifas`
- `wa_templates`
- `whatsapp_envios`
- `whatsapp_lideres`
- `whatsapp_status_orfaos`

**Namespace no front (src/api.js)**

- `comunicacao`

