# Módulo `governanca`
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
| `/governanca` | `src/pages/governanca/Governanca` | 1 |
| `/governanca/:sigla` | `src/pages/governanca/RitualPage` | 1 |
## Backend
- `backend/routes/governanca.js`
Guard: `authorizeModule('governanca', 1 | 3)`
<details><summary>Endpoints (34)</summary>
- `DELETE /api/governanca/docs/:id`
- `DELETE /api/governanca/meetings/:id`
- `DELETE /api/governanca/tasks/:id`
- `GET /api/governanca/analise`
- `GET /api/governanca/cron/lembrete`
- `GET /api/governanca/cycles`
- `GET /api/governanca/cycles/:id`
- `GET /api/governanca/deliberacoes`
- `GET /api/governanca/docs/:id/download`
- `GET /api/governanca/kpi-objetivos`
- `GET /api/governanca/meetings`
- `GET /api/governanca/meetings/:id`
- `GET /api/governanca/meetings/:id/docs`
- `GET /api/governanca/memoria`
- `GET /api/governanca/relatorio/:sigla`
- `GET /api/governanca/tipos`
- `GET /api/governanca/types`
- `PATCH /api/governanca/docs/:id`
- `PATCH /api/governanca/meetings/:id`
- `PATCH /api/governanca/memoria/:id`
- `PATCH /api/governanca/tasks/:id`
- `PATCH /api/governanca/types/:id`
- `POST /api/governanca/cron/rotina-email`
- `POST /api/governanca/cycles`
- `POST /api/governanca/cycles/generate-year`
- `POST /api/governanca/meetings`
- `POST /api/governanca/meetings/:id/apply-templates`
- `POST /api/governanca/meetings/:id/docs`
- `POST /api/governanca/meetings/:id/extrair-deliberacoes`
- `POST /api/governanca/meetings/:id/gerar-pauta`
- `POST /api/governanca/meetings/:id/tasks`
- `POST /api/governanca/memoria/gerar`
- `POST /api/governanca/relatorio/:sigla/observacoes`
- `POST /api/governanca/types`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/cronAuth.js`
- `backend/utils/pagination.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/email.js`
- `backend/services/governancaIA.js`
- `backend/services/notificar.js`
- `backend/services/sharepointGovernanca.js`

**Tabelas que estas rotas tocam**

- `cultos`
- `expansion_milestones`
- `fin_contas`
- `fin_contas_pagar`
- `fin_reembolsos`
- `fin_transacoes`
- `governance_cycles`
- `governance_meeting_docs`
- `governance_meeting_types`
- `governance_meetings`
- `governance_memoria`
- `governance_task_templates`
- `governance_tasks`
- `kpi_metas`
- `kpi_objetivos_gerais`
- `mem_devocionais`
- `mem_grupo_membros`
- `mem_membros`
- `patrimonio_bens`
- `project_kpis`
- `project_risks`
- `project_tasks`
- `projects`
- `rh_funcionarios`
- `vw_doacoes_mensal`

**RPCs**

- `app_soft_delete`
- `kpi_servir_comunidade`

**Namespace no front (src/api.js)**

- `governanca`

