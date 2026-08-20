# Módulo `censo`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/censo.js`
Guard: `authorizeModule('censo', 1 | 2 | 4 | 5)`
<details><summary>Endpoints (20)</summary>
- `DELETE /api/censo/pesquisas/:id`
- `DELETE /api/censo/respostas/:id`
- `GET /api/censo/aux`
- `GET /api/censo/cobertura`
- `GET /api/censo/cuidado`
- `GET /api/censo/cuidado/resumo`
- `GET /api/censo/ia`
- `GET /api/censo/pendentes`
- `GET /api/censo/perfil`
- `GET /api/censo/pesquisas`
- `GET /api/censo/pesquisas/:id`
- `GET /api/censo/respostas`
- `GET /api/censo/respostas/:id`
- `PATCH /api/censo/cuidado/:id`
- `POST /api/censo/ia`
- `POST /api/censo/pesquisas`
- `POST /api/censo/pesquisas/:id/duplicar`
- `POST /api/censo/pesquisas/:id/status`
- `POST /api/censo/pos-processar`
- `PUT /api/censo/pesquisas/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/censoPerguntas.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/censoLeituraIA.js`
- `backend/services/censoReconciliar.js`
- `backend/services/membroMatch.js`

**Tabelas que estas rotas tocam**

- `cen_acesso_sensivel`
- `cen_cuidado`
- `cen_leitura_ia`
- `cen_pesquisa`
- `cen_resposta`
- `cen_resposta_item`
- `mem_membros`
- `vw_cen_cobertura`
- `vw_cen_cuidado_fila`
- `vw_cen_cuidado_resumo`
- `vw_cen_funil_pergunta`
- `vw_cen_item_agregado`
- `vw_cen_pesquisa_stats`
- `vw_cen_resposta_pessoa`

**Namespace no front (src/api.js)**

- `censo`

