# Módulo `cuidados`
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
| `/ministerial/cuidados` | `src/pages/ministerial/Cuidados` | — |
## Backend
- `backend/routes/cuidados.js`
- `backend/routes/nextConvite.js`
Guard: `authorizeModule('cuidados', 1 | 2 | 3)`
<details><summary>Endpoints (34)</summary>
- `DELETE /api/cuidados/atendimento-comentarios/:id`
- `DELETE /api/cuidados/convertidos/:id`
- `DELETE /api/cuidados/pedidos/:id`
- `DELETE /api/cuidados/responsaveis/:id`
- `DELETE /api/cuidados/visitas/:id`
- `GET /api/cuidados/agregado`
- `GET /api/cuidados/atendimentos/:refTipo/:refId/comentarios`
- `GET /api/cuidados/buscar-membro`
- `GET /api/cuidados/convertidos`
- `GET /api/cuidados/convertidos/atendentes`
- `GET /api/cuidados/jornada-convertidos`
- `GET /api/cuidados/pedidos`
- `GET /api/cuidados/trilha`
- `GET /api/cuidados/visitas`
- `GET /api/cuidados/visitas-pendentes`
- `GET /api/next-convite/config`
- `GET /api/next-convite/pendentes`
- `PATCH /api/cuidados/convertidos/:id`
- `PATCH /api/cuidados/pedidos/:id`
- `PATCH /api/cuidados/visitas/:id`
- `POST /api/cuidados/agregado`
- `POST /api/cuidados/atendimentos/:refTipo/:refId/comentarios`
- `POST /api/cuidados/convertidos/:id/agendar-encontro`
- `POST /api/cuidados/convertidos/:id/cancelar-encontro`
- `POST /api/cuidados/convertidos/:id/desfecho`
- `POST /api/cuidados/convertidos/:id/direcionar`
- `POST /api/cuidados/convertidos/:id/registrar-contato`
- `POST /api/cuidados/criar-membro`
- `POST /api/cuidados/pedidos`
- `POST /api/cuidados/pedidos/atender`
- `POST /api/cuidados/visitas`
- `POST /api/next-convite/enviar`
- `POST /api/next-convite/marcar`
- `PUT /api/next-convite/config`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/dadosSensiveisPessoa.js`
- `backend/utils/jornadaTempo.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/cerebroSync.js`
- `backend/services/cuidadosPedidos.js`
- `backend/services/marcosConvertido.js`
- `backend/services/membroMatch.js`
- `backend/services/notificar.js`
- `backend/services/whatsappFila.js`
- `backend/services/whatsappService.js`

**Tabelas que estas rotas tocam**

- `app_inscricoes`
- `batismo_inscricoes`
- `cargos`
- `cui_acompanhamentos`
- `cui_atendimento_comentarios`
- `cui_atendimentos_agregado`
- `cui_convertidos`
- `cui_pedidos`
- `cui_responsaveis`
- `cui_visitas`
- `dados_brutos`
- `jornada_encaminhamentos`
- `mem_membros`
- `next_convite_config`
- `next_inscricoes`
- `next_matriculas`
- `profiles`
- `usuarios`

**RPCs**

- `app_soft_delete`

**Namespace no front (src/api.js)**

- `cuidados`

