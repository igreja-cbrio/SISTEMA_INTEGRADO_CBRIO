# Módulo `propostas`
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
| `/propostas` | `src/pages/Propostas` | 1 |
## Backend
- `backend/routes/propostas.js`
Guard: `authorizeModule('propostas', 1 | 2 | 5)`
<details><summary>Endpoints (30)</summary>
- `DELETE /api/propostas/:id`
- `DELETE /api/propostas/anexos/:anexoId`
- `DELETE /api/propostas/config/criterios/:id`
- `GET /api/propostas`
- `GET /api/propostas/:id`
- `GET /api/propostas/:id/avaliacao`
- `GET /api/propostas/:id/historico`
- `GET /api/propostas/:id/pos-evento`
- `GET /api/propostas/aux`
- `GET /api/propostas/avaliar`
- `GET /api/propostas/config/areas`
- `GET /api/propostas/config/aux`
- `GET /api/propostas/config/ciclos`
- `GET /api/propostas/config/ciclos/:id/criterios`
- `GET /api/propostas/config/ciclos/:id/parametros`
- `GET /api/propostas/mural`
- `POST /api/propostas`
- `POST /api/propostas/:id/anexos`
- `POST /api/propostas/:id/avaliacao`
- `POST /api/propostas/:id/deliberar`
- `POST /api/propostas/:id/pos-evento`
- `POST /api/propostas/:id/transicao`
- `POST /api/propostas/config/ciclos`
- `POST /api/propostas/config/ciclos/:id/consolidar`
- `POST /api/propostas/config/ciclos/:id/criterios`
- `PUT /api/propostas/:id`
- `PUT /api/propostas/config/areas/:areaId`
- `PUT /api/propostas/config/ciclos/:id`
- `PUT /api/propostas/config/ciclos/:id/parametros`
- `PUT /api/propostas/config/criterios/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Serviços**

- `backend/services/anexosLogArquivos.js`
- `backend/services/notificar.js`

**Tabelas que estas rotas tocam**

- `areas`
- `events`
- `profiles`
- `projects`
- `prop_anexo`
- `prop_area_diretor`
- `prop_atividade`
- `prop_avaliacao`
- `prop_avaliacao_nota`
- `prop_ciclo`
- `prop_criterio`
- `prop_deliberacao`
- `prop_desembolso`
- `prop_indicador`
- `prop_log`
- `prop_parametro`
- `prop_pos_evento`
- `prop_proposta`
- `prop_risco`
- `prop_snapshot`

**RPCs**

- `app_soft_delete`
- `fn_prop_transicionar`

**Namespace no front (src/api.js)**

- `propostas`

