# Módulo `marketing`
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
| `/marketing` | `src/pages/marketing/MarketingDashboard` | 1 |
| `/marketing/kanban` | `src/pages/marketing/MarketingKanban` | 1 |
| `/marketing/planner` | `src/pages/marketing/MarketingPlanner` | 1 |
| `/marketing/admin` | `src/pages/marketing/MarketingAdmin` | 5 |
| `/marketing/analytics` | `src/pages/marketing/MarketingAnalytics` | 1 |
| `/marketing/app` | `src/pages/marketing/MarketingApp` | 1 |
| `/marketing/generosidade` | `src/pages/marketing/MarketingGenerosidade` | 1 |
## Backend
- `backend/routes/batismoFotos.js`
- `backend/routes/comunicados.js`
- `backend/routes/destaques.js`
- `backend/routes/marketing.js`
Guard: `authorizeModule('marketing', 1 | 3 | 5)`
<details><summary>Endpoints (78)</summary>
- `DELETE /api/batismo-fotos/:data/fotos/:nome`
- `DELETE /api/comunicados/:id`
- `DELETE /api/destaques/:id`
- `DELETE /api/marketing/admin/ciclo-padroes/:id`
- `DELETE /api/marketing/admin/membros/:id`
- `DELETE /api/marketing/admin/overrides/:id`
- `DELETE /api/marketing/admin/recorrentes/:id`
- `DELETE /api/marketing/campanhas/:id`
- `DELETE /api/marketing/cards/:id`
- `DELETE /api/marketing/checklist/:itemId`
- `DELETE /api/marketing/entregaveis/:id`
- `GET /api/batismo-fotos`
- `GET /api/batismo-fotos/:data/fotos`
- `GET /api/comunicados`
- `GET /api/destaques`
- `GET /api/marketing/admin/ciclo-padroes`
- `GET /api/marketing/admin/ciclo-padroes/categorias`
- `GET /api/marketing/admin/ciclo-padroes/fases`
- `GET /api/marketing/admin/etiquetas/destino`
- `GET /api/marketing/admin/etiquetas/tipo`
- `GET /api/marketing/admin/membros`
- `GET /api/marketing/admin/overrides`
- `GET /api/marketing/admin/recorrentes`
- `GET /api/marketing/analytics/aprovacoes-origem`
- `GET /api/marketing/analytics/kpis`
- `GET /api/marketing/campanhas`
- `GET /api/marketing/campanhas/:id`
- `GET /api/marketing/capacidade-dia`
- `GET /api/marketing/cards`
- `GET /api/marketing/cards/:id`
- `GET /api/marketing/cards/:id/checklist`
- `GET /api/marketing/cards/:id/entregaveis`
- `GET /api/marketing/ciclo-criativo`
- `GET /api/marketing/compromissos-recorrentes`
- `GET /api/marketing/dashboard`
- `GET /api/marketing/dashboard/fase/:faseId`
- `GET /api/marketing/entregaveis/:id/download`
- `GET /api/marketing/etiquetas`
- `GET /api/marketing/fila/posicao/:cardId`
- `GET /api/marketing/generosidade`
- `GET /api/marketing/kanban`
- `GET /api/marketing/membros`
- `GET /api/marketing/planner`
- `PATCH /api/marketing/admin/ciclo-padroes/:id`
- `PATCH /api/marketing/admin/etiquetas/destino/:id`
- `PATCH /api/marketing/admin/etiquetas/tipo/:id`
- `PATCH /api/marketing/admin/membros/:id`
- `PATCH /api/marketing/admin/overrides/:id`
- `PATCH /api/marketing/admin/recorrentes/:id`
- `PATCH /api/marketing/campanhas/:id`
- `PATCH /api/marketing/cards/:id`
- `PATCH /api/marketing/cards/:id/aprovar-entrega`
- `PATCH /api/marketing/cards/:id/decidir-urgencia`
- `PATCH /api/marketing/cards/:id/sugerir-revisao`
- `PATCH /api/marketing/checklist/:itemId`
- `PATCH /api/marketing/ciclo-criativo/batch`
- `POST /api/batismo-fotos/:data/fotos`
- `POST /api/comunicados`
- `POST /api/comunicados/:id/arquivar`
- `POST /api/comunicados/:id/publicar`
- `POST /api/comunicados/upload-foto`
- `POST /api/destaques`
- `POST /api/destaques/:id/imagem`
- `POST /api/marketing/admin/ciclo-padroes`
- `POST /api/marketing/admin/ciclo-padroes/aplicar`
- `POST /api/marketing/admin/etiquetas/destino`
- `POST /api/marketing/admin/etiquetas/tipo`
- `POST /api/marketing/admin/membros`
- `POST /api/marketing/admin/overrides`
- `POST /api/marketing/admin/recorrentes`
- `POST /api/marketing/campanhas/:id/aprovar`
- `POST /api/marketing/campanhas/:id/cards`
- `POST /api/marketing/campanhas/:id/revisar`
- `POST /api/marketing/cards`
- `POST /api/marketing/cards/:id/checklist`
- `POST /api/marketing/cards/:id/entregaveis`
- `PUT /api/comunicados/:id`
- `PUT /api/destaques/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/marketingCores.js`
- `backend/utils/marketingOcupacao.js`
- `backend/utils/marketingSemanas.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/campanhaArrecadacao.js`
- `backend/services/marketingGenerosidade.js`
- `backend/services/marketingSolicitante.js`
- `backend/services/notificar.js`
- `backend/services/sharepointMarketing.js`

**Tabelas que estas rotas tocam**

- `app_destaques`
- `batismo_inscricoes`
- `comunicados`
- `cycle_phase_tasks`
- `cycle_phase_templates`
- `event_categories`
- `event_cycle_phases`
- `event_cycles`
- `fin_plano_contas`
- `fin_transacoes`
- `fin_uploads`
- `kpi_valores_calculados`
- `marketing_campanhas`
- `marketing_capacidade_override`
- `marketing_card_checklist`
- `marketing_ciclo_padroes`
- `marketing_compromissos_recorrentes`
- `marketing_entregaveis`
- `marketing_etiquetas_destino`
- `marketing_etiquetas_tipo`
- `marketing_kanban_cards`
- `marketing_membros`
- `marketing_recorrentes_participantes`
- `profiles`
- `solicitacoes`
- `vw_fin_decendio`

**RPCs**

- `app_soft_delete`
- `fn_marketing_aplicar_padroes_ciclo`

**Namespace no front (src/api.js)**

- `marketing`

