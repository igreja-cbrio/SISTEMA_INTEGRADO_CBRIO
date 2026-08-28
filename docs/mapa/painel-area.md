# Módulo `painel-area`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/painelArea.js`
Guard: `authorizeModule('painel-area', 1 | 3)`
<details><summary>Endpoints (5)</summary>
- `GET /api/painel-area/:area`
- `GET /api/painel-area/:area/pessoas`
- `GET /api/painel-area/:area/pessoas/:id`
- `GET /api/painel-area/:area/series`
- `POST /api/painel-area/:area/nps`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/supabase.js`

**Tabelas que estas rotas tocam**

- `dados_brutos`
- `kpi_indicadores_taticos`
- `mem_familias`
- `mem_grupo_membros`
- `mem_membros`
- `mem_trilha_valores`
- `mem_voluntarios`
- `rh_funcionarios`
- `tipos_dado_bruto`
- `vw_culto_stats`
- `vw_kpi_trajetoria_atual`

