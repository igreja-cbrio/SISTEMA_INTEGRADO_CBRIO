# Módulo `membros`
<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## Backend
- `backend/routes/membresia.js`
- `backend/routes/pessoas.js`
Guard: `authorizeModule('membros', 1 | 2)`
<details><summary>Endpoints (93)</summary>
- `DELETE /api/membresia/cadastros/:id`
- `DELETE /api/membresia/checkins/:id`
- `DELETE /api/membresia/contribuicoes/:id`
- `DELETE /api/membresia/escalas/:id`
- `DELETE /api/membresia/familias/:id`
- `DELETE /api/membresia/grupos/:id`
- `DELETE /api/membresia/membros/:id`
- `DELETE /api/membresia/ministerios/:id`
- `DELETE /api/membresia/vinculos/:id`
- `GET /api/membresia/cadastros`
- `GET /api/membresia/cadastros/kpis`
- `GET /api/membresia/cadastros/pode-aprovar`
- `GET /api/membresia/censo/cobertura`
- `GET /api/membresia/censo/disparo/preview`
- `GET /api/membresia/censo/disparo/preview-email`
- `GET /api/membresia/censo/disparo/resultado`
- `GET /api/membresia/censo/faltantes`
- `GET /api/membresia/checkins`
- `GET /api/membresia/contribuicoes`
- `GET /api/membresia/contribuicoes/kpis`
- `GET /api/membresia/cpf-lookup/:cpf`
- `GET /api/membresia/duplicados`
- `GET /api/membresia/escalas`
- `GET /api/membresia/exclusoes`
- `GET /api/membresia/familias`
- `GET /api/membresia/geocode-cep`
- `GET /api/membresia/grupos`
- `GET /api/membresia/grupos/:id`
- `GET /api/membresia/identidade-pendencias`
- `GET /api/membresia/kpis`
- `GET /api/membresia/membros`
- `GET /api/membresia/membros/:id`
- `GET /api/membresia/membros/:id/censo`
- `GET /api/membresia/membros/:id/inscricoes`
- `GET /api/membresia/membros/:id/possiveis-duplicados`
- `GET /api/membresia/membros/:id/reconhecimento-facial`
- `GET /api/membresia/membros/:id/timeline`
- `GET /api/membresia/membros/:id/vinculos`
- `GET /api/membresia/membros/:id/wifi`
- `GET /api/membresia/membros/pagina`
- `GET /api/membresia/merge-log`
- `GET /api/membresia/ministerios`
- `GET /api/membresia/ministerios/:id`
- `GET /api/membresia/orfaos-stats`
- `GET /api/membresia/qr-lookup/:token`
- `GET /api/membresia/totem/apresentacao-bebe/status`
- `GET /api/membresia/totem/next/status`
- `GET /api/pessoas/lookup`
- `PATCH /api/membresia/cadastros/:id`
- `PATCH /api/membresia/grupo-membros/:id/sair`
- `PATCH /api/membresia/membros/:id/familia`
- `PATCH /api/membresia/trilha/:id`
- `PATCH /api/membresia/voluntarios/:id/sair`
- `POST /api/membresia/cadastros/:id/aprovar`
- `POST /api/membresia/cadastros/:id/confirmar-whatsapp`
- `POST /api/membresia/cadastros/:id/rejeitar`
- `POST /api/membresia/cadastros/aprovar-lote`
- `POST /api/membresia/censo/disparo`
- `POST /api/membresia/checkins`
- `POST /api/membresia/contribuicoes`
- `POST /api/membresia/duplicados/ignorar`
- `POST /api/membresia/escalas`
- `POST /api/membresia/familias`
- `POST /api/membresia/grupos`
- `POST /api/membresia/grupos/:id/membros`
- `POST /api/membresia/historico`
- `POST /api/membresia/identidade-pendencias/:id/confirmar-cpf`
- `POST /api/membresia/identidade-pendencias/:id/ligar-inscricao`
- `POST /api/membresia/identidade-pendencias/:id/status`
- `POST /api/membresia/identidade-pendencias/ligar-lote`
- `POST /api/membresia/membros`
- `POST /api/membresia/membros/:id/foto`
- `POST /api/membresia/membros/:id/mesma-familia`
- `POST /api/membresia/membros/:id/vinculos`
- `POST /api/membresia/membros/merge`
- `POST /api/membresia/ministerios`
- `POST /api/membresia/promover-orfaos`
- `POST /api/membresia/totem/apresentacao-bebe`
- `POST /api/membresia/totem/grupos/:id/entrar`
- `POST /api/membresia/totem/membros/:id/foto`
- `POST /api/membresia/totem/next/informacoes`
- `POST /api/membresia/totem/next/inscrever`
- `POST /api/membresia/trilha`
- `POST /api/membresia/voluntarios`
- `POST /api/pessoas/find-or-create`
- `PUT /api/membresia/contribuicoes/:id`
- `PUT /api/membresia/escalas/:id`
- `PUT /api/membresia/familias/:id`
- `PUT /api/membresia/grupos/:id`
- `PUT /api/membresia/membros/:id`
- `PUT /api/membresia/ministerios/:id`
- `PUT /api/membresia/totem/membros/:id`
- `PUT /api/membresia/voluntarios/:id`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/cpf.js`
- `backend/utils/criancaApresentacao.js`
- `backend/utils/dadosSensiveisPessoa.js`
- `backend/utils/membrosPagina.js`
- `backend/utils/prontidaoCadastro.js`
- `backend/utils/sanitize.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/censoDisparo.js`
- `backend/services/cerebroSync.js`
- `backend/services/cpfReconciliar.js`
- `backend/services/duplicidadePolicy.js`
- `backend/services/fusaoCampos.js`
- `backend/services/grupoPedidoEventos.js`
- `backend/services/gruposAvisoApp.js`
- `backend/services/gruposDestinatarios.js`
- `backend/services/identidadeProgressiva.js`
- `backend/services/inscricaoContrato.js`
- `backend/services/inscricaoOrfas.js`
- `backend/services/jornadaMarcadores.js`
- `backend/services/membroMatch.js`
- `backend/services/notificar.js`
- `backend/services/storageService.js`
- `backend/services/waInbox.js`
- `backend/services/whatsappFila.js`

**Tabelas que estas rotas tocam**

- `app_solicitacoes_exclusao`
- `apresentacao_bebes`
- `batismo_inscricoes`
- `cen_acesso_sensivel`
- `cen_resposta`
- `cen_resposta_item`
- `cui_acompanhamentos`
- `cui_convertidos`
- `cui_jornada180`
- `cultos`
- `cultos_decisoes_pessoas`
- `entradas_resolucoes`
- `ext_inscricoes`
- `face_presencas`
- `identidade_pendencias`
- `inscricoes`
- `int_visitantes`
- `jornada_encaminhamentos`
- `kids_criancas`
- `kids_responsaveis`
- `mem_cadastros_pendentes`
- `mem_censo_convites`
- `mem_checkins`
- `mem_contribuicoes`
- `mem_devocionais`
- `mem_duplicados_ignorados`
- `mem_escalas`
- `mem_familias`
- `mem_grupo_membros`
- `mem_grupo_pedidos`
- `mem_grupos`
- `mem_historico`
- `mem_membros`
- `mem_merge_log`
- `mem_ministerios`
- `mem_qrcodes`
- `mem_temporadas`
- `mem_trilha_valores`
- `mem_vinculos_familiares`
- `mem_voluntarios`
- `membresia_aprovadores`
- `next_encontros`
- `next_inscricoes`
- `next_matriculas`
- `next_turmas`
- `profiles`
- `vol_check_ins`
- `vol_inscricoes`
- `vol_profiles`
- `vol_schedules`
- `vol_team_members`
- `vw_censo_campanha`
- `vw_insc_pagamento_estado`
- `vw_membros_duplicados`
- `vw_membros_orfaos_stats`
- `vw_pessoas_papeis`
- `wifi_conexoes`
- `wifi_visitantes`

**RPCs**

- `app_soft_delete`
- `fn_membro_tem_atividade`
- `merge_membros`

