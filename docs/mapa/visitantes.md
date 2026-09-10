# Módulo `visitantes`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/visitantes.js`
Guard: `authorizeModule('visitantes', 1 | 2 | 3 | 4)`
<details><summary>Endpoints (10)</summary>
- `DELETE /api/visitantes/:id`
- `GET /api/visitantes`
- `GET /api/visitantes/:id`
- `GET /api/visitantes/cuidados`
- `GET /api/visitantes/locais`
- `GET /api/visitantes/resumo`
- `GET /api/visitantes/voucher/:codigo`
- `PATCH /api/visitantes/:id`
- `PATCH /api/visitantes/cuidados/:id`
- `POST /api/visitantes/voucher/:codigo/resgatar`
</details>

**Tabelas que estas rotas tocam**

- `vis_visitas`

**RPCs**

- `app_soft_delete`

**Namespace no front (src/api.js)**

- `visitantes`

