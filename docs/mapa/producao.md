# Módulo `producao`
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
| `/producao` | `src/pages/ministerial/Producao` | 1 |
## Backend
- `backend/routes/producao.js`
Guard: `authorizeModule('producao', 1 | 2 | 3)`
<details><summary>Endpoints (21)</summary>
- `DELETE /api/producao/checklist-itens/:id`
- `DELETE /api/producao/ocorrencias/:id`
- `DELETE /api/producao/roteiro-etapas/:id`
- `GET /api/producao/acumulado`
- `GET /api/producao/checklist-itens`
- `GET /api/producao/culto/:id`
- `GET /api/producao/desempenho`
- `GET /api/producao/pendencias`
- `GET /api/producao/roteiro-etapas`
- `GET /api/producao/semana`
- `GET /api/producao/service-types`
- `PATCH /api/producao/checklist-itens/:id`
- `PATCH /api/producao/ocorrencias/:id/solicitacao`
- `PATCH /api/producao/roteiro-etapas/:id`
- `PATCH /api/producao/service-types/:id/meta`
- `POST /api/producao/checklist-itens`
- `POST /api/producao/culto/:id/ocorrencias`
- `POST /api/producao/roteiro-etapas`
- `PUT /api/producao/culto/:id`
- `PUT /api/producao/culto/:id/checklist`
- `PUT /api/producao/culto/:id/etapas`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Serviços**

- `backend/services/notificar.js`
- `backend/services/painelCache.js`

**Tabelas que estas rotas tocam**

- `area_solicitacoes_responsaveis`
- `culto_producao`
- `culto_producao_checklist`
- `culto_producao_etapas`
- `culto_producao_ocorrencias`
- `cultos`
- `kpi_indicadores_taticos`
- `producao_checklist_itens`
- `producao_roteiro_etapas`
- `solicitacoes`
- `vol_service_types`
- `vw_culto_stats`
- `vw_kpi_trajetoria_atual`

**Namespace no front (src/api.js)**

- `producao`

