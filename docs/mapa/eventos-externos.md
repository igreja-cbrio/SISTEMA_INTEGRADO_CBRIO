# Módulo `eventos-externos`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/eventosExternos.js`
Guard: `authorizeModule('eventos-externos', 1 | 3)`
<details><summary>Endpoints (9)</summary>
- `DELETE /api/eventos-externos/:id`
- `DELETE /api/eventos-externos/:id/inscricoes/:inscricaoId`
- `GET /api/eventos-externos`
- `GET /api/eventos-externos/:id`
- `PATCH /api/eventos-externos/:id/inscricoes/:inscricaoId`
- `POST /api/eventos-externos`
- `POST /api/eventos-externos/:id/sortear`
- `POST /api/eventos-externos/upload-capa`
- `PUT /api/eventos-externos/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Tabelas que estas rotas tocam**

- `ext_eventos`
- `ext_inscricoes`
- `ext_sorteios`

**RPCs**

- `app_soft_delete`

