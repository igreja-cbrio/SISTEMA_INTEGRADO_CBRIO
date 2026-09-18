# Módulo `batismo-leitura`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/kpis.js`
Guard: `authorizeModule('batismo-leitura', 1)`
<details><summary>Endpoints (41)</summary>
- `DELETE /api/kpis/batismos/horarios/:id`
- `DELETE /api/kpis/cultos/:id`
- `DELETE /api/kpis/cultura/pense/:id`
- `DELETE /api/kpis/decisoes-pessoas/:id`
- `GET /api/kpis/batismos`
- `GET /api/kpis/batismos/checkin/do-dia`
- `GET /api/kpis/batismos/cobertura-convertidos`
- `GET /api/kpis/batismos/config`
- `GET /api/kpis/batismos/horarios`
- `GET /api/kpis/cultos`
- `GET /api/kpis/cultos/:id/decisoes-pessoas`
- `GET /api/kpis/cultos/:id/link-decisoes`
- `GET /api/kpis/cultos/:id/voluntarios`
- `GET /api/kpis/cultos/auto-create`
- `GET /api/kpis/cultos/links-decisoes`
- `GET /api/kpis/cultura`
- `GET /api/kpis/cultura/mensal`
- `GET /api/kpis/cultura/pense`
- `GET /api/kpis/dashboard`
- `GET /api/kpis/decisoes-pessoas/buscar-membro`
- `GET /api/kpis/decisoes-pessoas/historico-importado`
- `GET /api/kpis/decisoes-pessoas/incompletos`
- `GET /api/kpis/metas`
- `GET /api/kpis/service-types`
- `PATCH /api/kpis/batismos/config`
- `PATCH /api/kpis/batismos/horarios/:id`
- `POST /api/kpis/batismos`
- `POST /api/kpis/batismos/:id/checkin`
- `POST /api/kpis/batismos/:id/foto-referencia`
- `POST /api/kpis/batismos/horarios`
- `POST /api/kpis/cultos`
- `POST /api/kpis/cultos/:id/decisoes-pessoas`
- `POST /api/kpis/cultos/auto-create`
- `POST /api/kpis/cultura/mensal`
- `POST /api/kpis/cultura/pense`
- `POST /api/kpis/cultura/pense/sync`
- `PUT /api/kpis/batismos/:id`
- `PUT /api/kpis/batismos/em-massa`
- `PUT /api/kpis/cultos/:id`
- `PUT /api/kpis/decisoes-pessoas/:id`
- `PUT /api/kpis/metas/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/cpf.js`
- `backend/utils/cronAuth.js`
- `backend/utils/cultoToken.js`
- `backend/utils/divisorMandala.js`
- `backend/utils/inscricaoMenor.js`
- `backend/utils/lentesDomingo.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/cpfReconciliar.js`
- `backend/services/kpiAutoCollector.js`
- `backend/services/membroMatch.js`
- `backend/services/notificar.js`
- `backend/services/painelCache.js`
- `backend/services/whatsappFila.js`

**Tabelas que estas rotas tocam**

- `batismo_config`
- `batismo_horarios`
- `batismo_inscricoes`
- `cultos`
- `cultos_decisoes_pessoas`
- `cultura_mensal`
- `kpi_metas`
- `mem_checkins`
- `mem_devocionais`
- `mem_grupo_membros`
- `mem_grupos`
- `mem_membros`
- `mem_trilha_valores`
- `pense_videos`
- `profiles`
- `vol_service_types`
- `vw_culto_stats`
- `vw_culto_voluntarios`
- `wifi_visitantes`

**RPCs**

- `fin_generosidade_mes`
- `kpi_servir_comunidade`

