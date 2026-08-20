# Módulo `conversas`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/waInbox.js`
Guard: `authorizeModule('conversas', 1 | 2 | 3)`
<details><summary>Endpoints (23)</summary>
- `DELETE /api/wa-inbox/mensagens-prontas/:id`
- `DELETE /api/wa-inbox/setores/:id`
- `GET /api/wa-inbox/areas`
- `GET /api/wa-inbox/colaboradores`
- `GET /api/wa-inbox/conversas`
- `GET /api/wa-inbox/conversas/:id/mensagens`
- `GET /api/wa-inbox/conversas/:id/perfil`
- `GET /api/wa-inbox/mensagens-prontas`
- `GET /api/wa-inbox/nao-lidas`
- `GET /api/wa-inbox/resumo-areas`
- `GET /api/wa-inbox/setores`
- `GET /api/wa-inbox/templates`
- `PATCH /api/wa-inbox/conversas/:id`
- `PATCH /api/wa-inbox/mensagens-prontas/:id`
- `POST /api/wa-inbox/conversas/:id/anexo`
- `POST /api/wa-inbox/conversas/:id/ler`
- `POST /api/wa-inbox/conversas/:id/responder`
- `POST /api/wa-inbox/conversas/:id/transferir`
- `POST /api/wa-inbox/conversas/abrir`
- `POST /api/wa-inbox/conversas/nova`
- `POST /api/wa-inbox/mensagens-prontas`
- `POST /api/wa-inbox/setores`
- `PUT /api/wa-inbox/setores/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/sanitize.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/notificar.js`
- `backend/services/waInbox.js`
- `backend/services/whatsappOrigemConversa.js`
- `backend/services/whatsappService.js`

**Tabelas que estas rotas tocam**

- `areas`
- `batismo_inscricoes`
- `conversas_setores`
- `mem_grupo_membros`
- `mem_membros`
- `next_inscricoes`
- `profiles`
- `vol_profiles`
- `vol_team_members`
- `vw_next_formado_pessoa`
- `wa_conversas`
- `wa_mensagens`
- `wa_mensagens_prontas`
- `wa_templates`
- `whatsapp_envios`

**RPCs**

- `conversas_profiles_da_area`

