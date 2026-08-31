# Módulo `grupos`
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
| `/grupos` | `src/pages/ministerial/Grupos` | — |
| `/grupos/supervisao` | `src/pages/ministerial/GruposSupervisao` | — |
## Backend
- `backend/routes/grupos.js`
- `backend/routes/whatsappGrupos.js`
Guard: `authorizeModule('grupos', 1 | 2 | 3 | 4 | 5)`
<details><summary>Endpoints (102)</summary>
- `DELETE /api/grupos/:id`
- `DELETE /api/grupos/encontros/:encontroId`
- `DELETE /api/grupos/materiais/:docId`
- `DELETE /api/grupos/visitas/:visitaId`
- `GET /api/grupos`
- `GET /api/grupos/:id`
- `GET /api/grupos/:id/candidatos-adicionar`
- `GET /api/grupos/:id/encontros`
- `GET /api/grupos/:id/encontros-pendentes`
- `GET /api/grupos/:id/entradas-saidas`
- `GET /api/grupos/:id/frequencia`
- `GET /api/grupos/:id/historico-alteracoes`
- `GET /api/grupos/:id/historico-membros`
- `GET /api/grupos/:id/metricas`
- `GET /api/grupos/:id/observacoes`
- `GET /api/grupos/:id/visitas`
- `GET /api/grupos/bairros/list`
- `GET /api/grupos/buscar`
- `GET /api/grupos/duplicatas`
- `GET /api/grupos/encontros/:encontroId`
- `GET /api/grupos/entrada/cobertura`
- `GET /api/grupos/envios/historico`
- `GET /api/grupos/kpis/frequencia-grupos`
- `GET /api/grupos/kpis/lideres-treinamento`
- `GET /api/grupos/kpis/prontidao`
- `GET /api/grupos/kpis/relatorio`
- `GET /api/grupos/kpis/sem-presenca`
- `GET /api/grupos/kpis/sem-relato`
- `GET /api/grupos/kpis/taticos`
- `GET /api/grupos/kpis/temporada-metricas`
- `GET /api/grupos/kpis/temporada-series`
- `GET /api/grupos/lideres-inscricoes/list`
- `GET /api/grupos/lideres/:liderId/grupos`
- `GET /api/grupos/lideres/buscar`
- `GET /api/grupos/materiais`
- `GET /api/grupos/meu`
- `GET /api/grupos/pedidos/:pedidoId/eventos`
- `GET /api/grupos/pedidos/count`
- `GET /api/grupos/pedidos/list`
- `GET /api/grupos/pedidos/resumo`
- `GET /api/grupos/pessoas/:membroId/ficha`
- `GET /api/grupos/pessoas/:membroId/frequencia`
- `GET /api/grupos/pessoas/buscar`
- `GET /api/grupos/pessoas/papeis`
- `GET /api/grupos/pessoas/sexo/sugestoes`
- `GET /api/grupos/redes`
- `GET /api/grupos/renovacao/painel`
- `GET /api/grupos/saude/agregado`
- `GET /api/grupos/supervisao/me`
- `GET /api/grupos/temporada-inscricoes`
- `GET /api/grupos/temporadas/consolidado`
- `GET /api/grupos/temporadas/list`
- `GET /api/grupos/vinculos/duplicados`
- `GET /api/grupos/visitas/painel`
- `GET /api/whatsapp-grupos/cron/diario`
- `PATCH /api/grupos/:id/aceitando`
- `PATCH /api/grupos/encontros/:encontroId`
- `PATCH /api/grupos/participacao/:id/presenca`
- `PATCH /api/grupos/participacao/:id/sair`
- `PATCH /api/grupos/pessoas/:membroId/ficha`
- `PATCH /api/grupos/temporadas/:id`
- `PATCH /api/grupos/visitas/:visitaId`
- `PATCH /api/whatsapp-grupos/materiais/:docId/estudo-semana`
- `POST /api/grupos`
- `POST /api/grupos/:id/agenda`
- `POST /api/grupos/:id/encontros`
- `POST /api/grupos/:id/membros`
- `POST /api/grupos/:id/pedidos`
- `POST /api/grupos/:id/pessoas`
- `POST /api/grupos/:id/visitas`
- `POST /api/grupos/duplicatas/fundir`
- `POST /api/grupos/duplicatas/ignorar`
- `POST /api/grupos/geocode-batch`
- `POST /api/grupos/importar-lideres/analisar`
- `POST /api/grupos/importar-lideres/aplicar`
- `POST /api/grupos/importar-participantes`
- `POST /api/grupos/lideres-inscricoes/:id/aceitar`
- `POST /api/grupos/lideres-inscricoes/:id/promover`
- `POST /api/grupos/lideres-inscricoes/:id/recusar`
- `POST /api/grupos/lideres-inscricoes/:id/vincular`
- `POST /api/grupos/materiais`
- `POST /api/grupos/pedidos/:pedidoId/aprovar`
- `POST /api/grupos/pedidos/:pedidoId/aprovar-direto`
- `POST /api/grupos/pedidos/:pedidoId/rejeitar`
- `POST /api/grupos/pedidos/:pedidoId/sugerir`
- `POST /api/grupos/pedidos/aprovar-lote`
- `POST /api/grupos/pessoas/:membroId/pedir-dados`
- `POST /api/grupos/pessoas/sexo/colher`
- `POST /api/grupos/pessoas/sexo/confirmar`
- `POST /api/grupos/redes`
- `POST /api/grupos/renovacao/:renId/triar`
- `POST /api/grupos/renovacao/disparar`
- `POST /api/grupos/temporadas/:id/consolidar`
- `POST /api/grupos/vinculos/duplicados/resolver`
- `POST /api/whatsapp-grupos/enviar-lembretes`
- `POST /api/whatsapp-grupos/sincronizar-lideres`
- `PUT /api/grupos/:id`
- `PUT /api/grupos/:id/observacoes/:periodo`
- `PUT /api/grupos/:id/supervisor`
- `PUT /api/grupos/membros/:membroRowId/funcao`
- `PUT /api/grupos/redes/:id`
- `PUT /api/grupos/temporada-inscricoes`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/agendaGrupo.js`
- `backend/utils/cronAuth.js`
- `backend/utils/grupoOnline.js`
- `backend/utils/prontidaoCadastro.js`
- `backend/utils/supabase.js`
- `backend/utils/vinculosDuplicados.js`

**Serviços**

- `backend/services/censoDisparo.js`
- `backend/services/contatoPessoa.js`
- `backend/services/duplicidadePolicy.js`
- `backend/services/fusaoCampos.js`
- `backend/services/grupoAgendaExcecao.js`
- `backend/services/grupoAncora.js`
- `backend/services/grupoEncontroApagar.js`
- `backend/services/grupoPedidoEventos.js`
- `backend/services/grupoPessoaDireta.js`
- `backend/services/gruposAvisoApp.js`
- `backend/services/gruposDestinatarios.js`
- `backend/services/gruposEnvios.js`
- `backend/services/gruposEnviosConfig.js`
- `backend/services/gruposImporter.js`
- `backend/services/gruposWhatsapp.js`
- `backend/services/jornadaMarcadores.js`
- `backend/services/membroMatch.js`
- `backend/services/notificar.js`
- `backend/services/sexoCompletar.js`
- `backend/services/storageService.js`
- `backend/services/volVinculoIA.js`
- `backend/services/whatsappFila.js`
- `backend/services/whatsappGrupos.js`
- `backend/services/whatsappService.js`

**Tabelas que estas rotas tocam**

- `app_audit_log`
- `app_grupos_temporada`
- `cerebro_fila`
- `cui_convertidos`
- `grupo_supervisao_observacoes`
- `grupo_supervisao_visitas`
- `jornada_encaminhamentos`
- `kpi_indicadores_taticos`
- `mem_cadastros_pendentes`
- `mem_duplicados_ignorados`
- `mem_grupo_agenda_excecoes`
- `mem_grupo_documentos`
- `mem_grupo_encontro_presencas`
- `mem_grupo_encontros`
- `mem_grupo_membros`
- `mem_grupo_pedido_eventos`
- `mem_grupo_pedidos`
- `mem_grupo_renovacoes`
- `mem_grupos`
- `mem_lider_inscricoes`
- `mem_membros`
- `mem_redes`
- `mem_temporada_consolidado`
- `mem_temporadas`
- `profiles`
- `vol_profiles`
- `vw_grupos_supervisao`
- `vw_kpi_trajetoria_atual`
- `whatsapp_envios`
- `whatsapp_lideres`

**RPCs**

- `app_soft_delete`
- `atualizar_encontro_grupo`
- `fn_consolidar_temporada`
- `fn_grupos_kpis_relatorio`
- `fn_grupos_ultima_frequencia`
- `fn_temporada_metricas`
- `fn_temporada_sem_presenca`
- `fn_temporada_series`
- `incrementar_presenca_grupo`
- `merge_membros`
- `registrar_encontro_grupo`

**Namespace no front (src/api.js)**

- `grupos`

