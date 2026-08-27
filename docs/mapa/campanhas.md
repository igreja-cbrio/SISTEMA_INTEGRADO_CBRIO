# Módulo `campanhas`
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
| `/campanhas` | `src/pages/Campanhas` | 1 |
## Backend
- `backend/routes/campanhas.js`
Guard: `authorizeModule('campanhas', 1 | 2 | 3 | 4)`
<details><summary>Endpoints (26)</summary>
- `DELETE /api/campanhas/:id`
- `DELETE /api/campanhas/:id/vinculo/:vinculoId`
- `DELETE /api/campanhas/marcos/:marcoId`
- `GET /api/campanhas`
- `GET /api/campanhas/:id`
- `GET /api/campanhas/:id/agradecimentos`
- `GET /api/campanhas/:id/digito-historico`
- `GET /api/campanhas/:id/lancamentos`
- `GET /api/campanhas/:id/pendentes`
- `GET /api/campanhas/aux`
- `GET /api/campanhas/digitos`
- `GET /api/campanhas/disparos/:disparoId/envios`
- `GET /api/campanhas/segmentos`
- `POST /api/campanhas`
- `POST /api/campanhas/:id/digito`
- `POST /api/campanhas/:id/disparos`
- `POST /api/campanhas/:id/disparos/previa`
- `POST /api/campanhas/:id/marcos`
- `POST /api/campanhas/:id/status`
- `POST /api/campanhas/:id/vinculo`
- `POST /api/campanhas/agradecimentos/rodar`
- `POST /api/campanhas/disparos/:disparoId/agendar`
- `POST /api/campanhas/disparos/:disparoId/cancelar`
- `PUT /api/campanhas/:id`
- `PUT /api/campanhas/disparos/:disparoId`
- `PUT /api/campanhas/marcos/:marcoId`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/campanhaPublico.js`
- `backend/utils/digitoCampanha.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/campanhaAgradece.js`
- `backend/services/campanhaArrecadacao.js`
- `backend/services/campanhaDisparo.js`
- `backend/services/campanhaMarcos.js`
- `backend/services/notificar.js`

**Tabelas que estas rotas tocam**

- `camp_agradecimentos`
- `camp_campanhas`
- `camp_digito_historico`
- `camp_disparo_envios`
- `camp_disparos`
- `camp_marcos`
- `camp_vinculos`
- `fin_identificadores_centavo`

**RPCs**

- `app_soft_delete`

**Namespace no front (src/api.js)**

- `campanhas`

