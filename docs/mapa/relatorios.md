# Módulo `relatorios`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/relatorios.js`
Guard: `authorizeModule('relatorios', 1)`
<details><summary>Endpoints (3)</summary>
- `GET /api/relatorios/dados`
- `GET /api/relatorios/tipos`
- `GET /api/relatorios/xlsx`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Tabelas que estas rotas tocam**

- `batismo_inscricoes`
- `cultos`
- `cultos_decisoes_pessoas`
- `mem_grupo_membros`
- `mem_membros`
- `vol_check_ins`

**Namespace no front (src/api.js)**

- `relatorios`

