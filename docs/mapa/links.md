# Módulo `links`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/links.js`
Guard: `authorizeModule('links', 1 | 4 | 5)`
<details><summary>Endpoints (7)</summary>
- `DELETE /api/links/:id`
- `GET /api/links`
- `GET /api/links/:id`
- `GET /api/links/catalogo`
- `POST /api/links`
- `POST /api/links/para-destino`
- `PUT /api/links/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Serviços**

- `backend/services/inscricaoPortas.js`

**Tabelas que estas rotas tocam**

- `cen_pesquisa`
- `ext_eventos`
- `insc_eventos`
- `link_curto`
- `link_curto_acesso`
- `link_curto_destino_hist`
- `vw_link_curto_stats`

**Namespace no front (src/api.js)**

- `links`

