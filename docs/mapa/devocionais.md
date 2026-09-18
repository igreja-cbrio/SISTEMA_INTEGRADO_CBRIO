# Módulo `devocionais`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/devocionais.js`
Guard: `authorizeModule('devocionais', 1 | 2 | 3)`
<details><summary>Endpoints (7)</summary>
- `DELETE /api/devocionais/:id`
- `GET /api/devocionais`
- `GET /api/devocionais/kpis`
- `GET /api/devocionais/membro/:id`
- `GET /api/devocionais/stats`
- `POST /api/devocionais`
- `PUT /api/devocionais/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/sanitize.js`
- `backend/utils/supabase.js`

**Tabelas que estas rotas tocam**

- `kpi_indicadores_taticos`
- `kpi_krs`
- `kpi_objetivos_gerais`
- `mem_devocionais`
- `mem_membros`
- `vw_kpi_trajetoria_atual`

**RPCs**

- `app_soft_delete`

**Namespace no front (src/api.js)**

- `devocionais`

