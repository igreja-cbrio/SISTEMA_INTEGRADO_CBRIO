# Módulo `whatsapp-admin`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/whatsapp.js`
Guard: `authorizeModule('whatsapp-admin', 3)`
<details><summary>Endpoints (12)</summary>
- `DELETE /api/whatsapp/lideres/:id`
- `GET /api/whatsapp/broadcast/destinatarios`
- `GET /api/whatsapp/coletas`
- `GET /api/whatsapp/config`
- `GET /api/whatsapp/lideres`
- `POST /api/whatsapp/broadcast`
- `POST /api/whatsapp/coletas/:id/aplicar`
- `POST /api/whatsapp/coletas/:id/rejeitar`
- `POST /api/whatsapp/lideres`
- `POST /api/whatsapp/test-disparo`
- `PUT /api/whatsapp/config`
- `PUT /api/whatsapp/lideres/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Serviços**

- `backend/services/whatsappGrupos.js`
- `backend/services/whatsappSend.js`
- `backend/services/whatsappService.js`

**Tabelas que estas rotas tocam**

- `cultos`
- `cultos_dados_submissoes`
- `profiles`
- `whatsapp_coletas`
- `whatsapp_config`
- `whatsapp_lideres`

**RPCs**

- `app_soft_delete`

