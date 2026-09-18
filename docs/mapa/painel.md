# Módulo `painel`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/painel.js`
Guard: `authorizeModule('painel', 2)`
<details><summary>Endpoints (7)</summary>
- `GET /api/painel/alertas`
- `GET /api/painel/monitoramento-okr`
- `GET /api/painel/nsm/pessoas`
- `GET /api/painel/nsm/sem-dados`
- `GET /api/painel/nsm/serie`
- `GET /api/painel/serie-temporal`
- `GET /api/painel/serie-temporal/dados`
</details>

**Tabelas que estas rotas tocam**

- `batismo_inscricoes`
- `cui_acompanhamentos`
- `cui_convertidos`
- `cui_jornada180`
- `culto_producao`
- `cultos`
- `kpi_indicadores_taticos`
- `mem_contribuicoes`
- `mem_devocionais`
- `mem_grupo_membros`
- `mem_voluntarios`
- `vol_service_types`
- `vw_kpi_trajetoria_atual`
- `vw_nsm_sem_dados`

**RPCs**

- `fn_monitoramento_okr_raw`
- `fn_nsm_serie_mensal`

**Namespace no front (src/api.js)**

- `painel`

