# Módulo `face`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/face.js`
Guard: `authorizeModule('face', 1 | 3)`
<details><summary>Endpoints (14)</summary>
- `DELETE /api/face/membros/:id/enroll`
- `GET /api/face/anonimos`
- `GET /api/face/cron/expurgo`
- `GET /api/face/cultos`
- `GET /api/face/membros/:id/foto`
- `GET /api/face/membros/galeria`
- `GET /api/face/presencas/lista`
- `GET /api/face/presencas/resumo`
- `POST /api/face/anonimos/:id/cadastrar`
- `POST /api/face/anonimos/:id/descartar`
- `POST /api/face/anonimos/:id/vincular`
- `POST /api/face/anonimos/importar`
- `POST /api/face/membros/:id/enroll`
- `POST /api/face/reconhecer`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/cronAuth.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/membroMatch.js`
- `backend/services/notificar.js`

**Tabelas que estas rotas tocam**

- `cultos`
- `face_anonimos`
- `face_presencas`
- `mem_membros`
- `profiles`
- `vol_service_types`

**RPCs**

- `face_anonimo_descartar`
- `face_expurgar_anonimos`
- `face_match_anonimo`
- `face_match_membro`
- `face_resolver_vincular`
- `face_save_membro`

**Namespace no front (src/api.js)**

- `face`

