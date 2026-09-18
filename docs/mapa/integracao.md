# Módulo `integracao`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Telas (ERP)
| rota | arquivo | nível |
|---|---|---|
| `/integracao/coleta` | `src/pages/ministerial/coleta/ColetaCulto` | 2 |
## Backend
- `backend/routes/integracao.js`
- `backend/routes/kpis.js`
Guard: `authorizeModule('integracao', 1 | 2 | 3)`
<details><summary>Endpoints (55)</summary>
- `DELETE /api/kpis/batismos/horarios/:id`
- `DELETE /api/kpis/cultos/:id`
- `DELETE /api/kpis/cultura/pense/:id`
- `DELETE /api/kpis/decisoes-pessoas/:id`
- `GET /api/integracao/coleta/cultos-abertos`
- `GET /api/integracao/coleta/minhas`
- `GET /api/integracao/coleta/pendentes`
- `GET /api/integracao/cron/gerar-cultos-recorrentes`
- `GET /api/integracao/dashboard`
- `GET /api/integracao/decisoes-app`
- `GET /api/integracao/historico-anual`
- `GET /api/integracao/historico-batismos`
- `GET /api/integracao/kpis/taticos`
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
- `POST /api/integracao/coleta`
- `POST /api/integracao/coleta/:id/aprovar`
- `POST /api/integracao/coleta/:id/rejeitar`
- `POST /api/integracao/decisoes-app/:id/confirmar`
- `POST /api/integracao/decisoes-app/:id/descartar`
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
- `backend/utils/isoWeek.js`
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

- `app_decisoes`
- `batismo_config`
- `batismo_horarios`
- `batismo_inscricoes`
- `cultos`
- `cultos_dados_submissoes`
- `cultos_decisoes_pessoas`
- `cultura_mensal`
- `kpi_indicadores_taticos`
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
- `vw_batismo_historico_anual`
- `vw_culto_historico_anual`
- `vw_culto_stats`
- `vw_culto_voluntarios`
- `vw_kpi_trajetoria_atual`
- `wifi_visitantes`

**RPCs**

- `fin_generosidade_mes`
- `gerar_cultos_recorrentes`
- `kpi_servir_comunidade`

**Namespace no front (src/api.js)**

- `integracao`

