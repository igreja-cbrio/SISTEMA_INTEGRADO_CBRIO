# Módulo `kids`
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
| `/ministerial/totem-kids` | `src/pages/ministerial/totemKids/TotemKidsCheckin` | — |
| `/ministerial/kids` | `src/pages/ministerial/totemKids/KidsHub` | — |
| `/ministerial/totem-kids/criancas` | `src/pages/ministerial/totemKids/GestaoCriancas` | — |
| `/ministerial/totem-kids/frequencia` | `src/pages/ministerial/totemKids/KidsFrequencia` | — |
| `/ministerial/totem-kids/voluntarios` | `src/pages/ministerial/totemKids/VoluntariosKids` | — |
| `/ministerial/totem-kids/voluntariado-inscricoes` | `src/pages/ministerial/totemKids/VoluntariadoInscricoesKids` | — |
| `/ministerial/totem-kids/estoque` | `src/pages/ministerial/totemKids/EstoqueKids` | — |
| `/ministerial/totem-kids/batismos` | `src/pages/ministerial/totemKids/BatismosKids` | — |
| `/ministerial/totem-kids/apresentacao` | `src/pages/ministerial/totemKids/ApresentacaoCriancas` | — |
| `/ministerial/totem-kids/checkout` | `src/pages/ministerial/totemKids/TotemKidsCheckout` | — |
| `/ministerial/totem-kids/portao` | `src/pages/ministerial/totemKids/TotemKidsPortao` | — |
| `/ministerial/totem-kids/painel` | `src/pages/ministerial/totemKids/TotemKidsPainel` | — |
| `/ministerial/totem-kids/teste-etiqueta` | `src/pages/ministerial/totemKids/TotemKidsTesteEtiqueta` | — |
| `/ministerial/totem-kids/decisoes` | `src/pages/ministerial/totemKids/TotemKidsDecisoes` | — |
| `/ministerial/totem-kids/decisoes-registro` | `src/pages/ministerial/totemKids/KidsDecisoesRegistro` | — |
| `/ministerial/totem-kids/vinculos` | `src/pages/ministerial/totemKids/TotemKidsVinculos` | — |
| `/ministerial/totem-kids/configuracoes` | `src/pages/admin/totemKids/TotemKidsAdmin` | — |
| `/kids` | `src/pages/ministerial/PainelKids` | — |
## Backend
- `backend/routes/totemKids.js`
Guard: `authorizeModule('kids', 1 | 2 | 3 | 4 | 5)`
<details><summary>Endpoints (120)</summary>
- `DELETE /api/totem-kids/apresentacoes/:id`
- `DELETE /api/totem-kids/atendimentos/:id`
- `DELETE /api/totem-kids/ausentes/:criancaId/contato`
- `DELETE /api/totem-kids/criancas/:criancaId/responsaveis/:membroId`
- `DELETE /api/totem-kids/criancas/:id/foto`
- `DELETE /api/totem-kids/estoque/:id`
- `DELETE /api/totem-kids/kids-equipe/membro/:id`
- `DELETE /api/totem-kids/responsaveis/:id`
- `DELETE /api/totem-kids/salas/:id`
- `GET /api/totem-kids/aniversariantes`
- `GET /api/totem-kids/apresentacoes`
- `GET /api/totem-kids/auditoria/overrides`
- `GET /api/totem-kids/ausentes`
- `GET /api/totem-kids/batismos`
- `GET /api/totem-kids/batismos/todos`
- `GET /api/totem-kids/cadastros-novos`
- `GET /api/totem-kids/checkin/aberto`
- `GET /api/totem-kids/checkin/codigo/:codigo`
- `GET /api/totem-kids/checkins-abertos/buscar`
- `GET /api/totem-kids/comparativo-mes`
- `GET /api/totem-kids/criancas`
- `GET /api/totem-kids/criancas/:id`
- `GET /api/totem-kids/criancas/:id/analise-frequencia`
- `GET /api/totem-kids/criancas/:id/aniversario-impressoes`
- `GET /api/totem-kids/criancas/:id/atendimentos`
- `GET /api/totem-kids/criancas/:id/irmaos`
- `GET /api/totem-kids/criancas/:id/jornada`
- `GET /api/totem-kids/criancas/buscar`
- `GET /api/totem-kids/criancas/duplicados`
- `GET /api/totem-kids/criancas/modelo-importacao`
- `GET /api/totem-kids/cron/age-out`
- `GET /api/totem-kids/cron/encerrar-vencidas`
- `GET /api/totem-kids/cron/resumo-kids`
- `GET /api/totem-kids/cultos-do-dia`
- `GET /api/totem-kids/dashboard`
- `GET /api/totem-kids/decisoes/fila/:id/candidatos`
- `GET /api/totem-kids/decisoes/historico/:criancaId`
- `GET /api/totem-kids/decisoes/registro`
- `GET /api/totem-kids/decisoes/resumo-por-crianca`
- `GET /api/totem-kids/edit-senha/status`
- `GET /api/totem-kids/estoque`
- `GET /api/totem-kids/etiqueta-config`
- `GET /api/totem-kids/frequencia-sistema`
- `GET /api/totem-kids/historico/crianca/:id`
- `GET /api/totem-kids/kids-equipe`
- `GET /api/totem-kids/kids-equipe/buscar`
- `GET /api/totem-kids/kids-equipe/membro/:volProfileId/ficha`
- `GET /api/totem-kids/pagers-em-uso`
- `GET /api/totem-kids/pagers/conferencia`
- `GET /api/totem-kids/pagers/cultos`
- `GET /api/totem-kids/painel/ao-vivo`
- `GET /api/totem-kids/painel/dia`
- `GET /api/totem-kids/painel/sala/:id`
- `GET /api/totem-kids/portao/scans`
- `GET /api/totem-kids/pre-checkin/codigo/:codigo`
- `GET /api/totem-kids/responsavel-familia`
- `GET /api/totem-kids/salas`
- `GET /api/totem-kids/salas/localizacoes-kids`
- `GET /api/totem-kids/sem-checkin`
- `GET /api/totem-kids/sessoes`
- `GET /api/totem-kids/sessoes/:id/criancas-presentes`
- `GET /api/totem-kids/sessoes/atual`
- `GET /api/totem-kids/vinculo-solicitacoes`
- `GET /api/totem-kids/vinculo-solicitacoes/:id`
- `GET /api/totem-kids/voluntariado-inscricoes`
- `PATCH /api/totem-kids/apresentacoes/:id`
- `PATCH /api/totem-kids/batismos/:id`
- `PATCH /api/totem-kids/checkin/:id`
- `PATCH /api/totem-kids/checkin/:id/pager`
- `PATCH /api/totem-kids/checkin/:id/pager-devolvido`
- `PATCH /api/totem-kids/criancas/:criancaId/responsaveis/:membroId`
- `PATCH /api/totem-kids/criancas/:id`
- `PATCH /api/totem-kids/criancas/:id/inativar`
- `PATCH /api/totem-kids/decisoes/fila/:id`
- `PATCH /api/totem-kids/estoque/:id`
- `PATCH /api/totem-kids/membro/:id`
- `PATCH /api/totem-kids/salas/:id`
- `PATCH /api/totem-kids/salas/:id/localizacao`
- `PATCH /api/totem-kids/voluntariado-inscricoes/:id`
- `POST /api/totem-kids/ausentes/:criancaId/contato`
- `POST /api/totem-kids/checkin`
- `POST /api/totem-kids/checkin/:id/reabrir`
- `POST /api/totem-kids/checkin/lote`
- `POST /api/totem-kids/checkout`
- `POST /api/totem-kids/codigos-reservados`
- `POST /api/totem-kids/criancas`
- `POST /api/totem-kids/criancas/:id/atendimentos`
- `POST /api/totem-kids/criancas/:id/foto`
- `POST /api/totem-kids/criancas/:id/responsaveis`
- `POST /api/totem-kids/criancas/:id/responsavel-rapido`
- `POST /api/totem-kids/criancas/:id/tornar-frequentador`
- `POST /api/totem-kids/criancas/importar`
- `POST /api/totem-kids/criancas/merge`
- `POST /api/totem-kids/edit-senha`
- `POST /api/totem-kids/edit-senha/verificar`
- `POST /api/totem-kids/estoque/:id/patrimonio`
- `POST /api/totem-kids/etiqueta-config/logo`
- `POST /api/totem-kids/etiqueta-config/logo/remover`
- `POST /api/totem-kids/etiquetas-log`
- `POST /api/totem-kids/familia-revisar`
- `POST /api/totem-kids/kids-equipe/membro`
- `POST /api/totem-kids/painel/checkout-todos`
- `POST /api/totem-kids/portao/scan`
- `POST /api/totem-kids/pre-checkin/:id/consumir`
- `POST /api/totem-kids/responsaveis/:membroId/foto`
- `POST /api/totem-kids/resumo/exemplo`
- `POST /api/totem-kids/salas`
- `POST /api/totem-kids/salas/:id/logo`
- `POST /api/totem-kids/salas/:id/logo/remover`
- `POST /api/totem-kids/salas/:salaId/estoque`
- `POST /api/totem-kids/salas/sincronizar-patrimonio`
- `POST /api/totem-kids/sessoes`
- `POST /api/totem-kids/sessoes/:id/abrir`
- `POST /api/totem-kids/sessoes/:id/encerrar`
- `POST /api/totem-kids/sessoes/encerrar-vencidas`
- `POST /api/totem-kids/sessoes/garantir`
- `POST /api/totem-kids/sessoes/trocar-periodo`
- `POST /api/totem-kids/vinculo-solicitacoes/:id/aprovar`
- `POST /api/totem-kids/vinculo-solicitacoes/:id/rejeitar`
- `PUT /api/totem-kids/etiqueta-config`
</details>

**Réguas puras (backend/utils)**

- `backend/utils/cadastrosKids.js`
- `backend/utils/cronAuth.js`
- `backend/utils/janelaPeriodo.js`
- `backend/utils/kidsConversaoFila.js`
- `backend/utils/kidsFrequencia.js`
- `backend/utils/kidsResponsavel.js`
- `backend/utils/kidsSituacao.js`
- `backend/utils/kidsVisitante.js`
- `backend/utils/supabase.js`

**Serviços**

- `backend/services/membroMatch.js`
- `backend/services/notificar.js`
- `backend/services/volInscricaoStatus.js`
- `backend/services/whatsappFila.js`
- `backend/services/whatsappSend.js`
- `backend/services/whatsappService.js`

**Tabelas que estas rotas tocam**

- `apresentacao_criancas`
- `batismo_inscricoes`
- `cultos`
- `cultos_decisoes_pessoas`
- `kids_atendimentos`
- `kids_checkins`
- `kids_codigos_reservados`
- `kids_conversoes_import`
- `kids_criancas`
- `kids_estoque`
- `kids_etiqueta_config`
- `kids_etiquetas_log`
- `kids_pco_presencas`
- `kids_portao_scans`
- `kids_pre_checkins`
- `kids_responsaveis`
- `kids_salas`
- `kids_sessoes`
- `kids_totem_config`
- `kids_vinculo_solicitacoes`
- `mem_familias`
- `mem_historico`
- `mem_membros`
- `pat_bens`
- `pat_categorias`
- `pat_localizacoes`
- `profiles`
- `vol_background_checks`
- `vol_check_ins`
- `vol_inscricoes`
- `vol_positions`
- `vol_profiles`
- `vol_service_types`
- `vol_team_members`
- `vol_teams`
- `vw_kids_criancas_presentes_sessao`
- `vw_kids_decisoes_historico_crianca`
- `vw_kids_decisoes_resumo_crianca`
- `vw_kids_historico_crianca`
- `vw_kids_sessao_ao_vivo`

**RPCs**

- `app_soft_delete`
- `fn_kids_ausentes_consecutivos`
- `fn_kids_gerar_codigo_seguranca`
- `fn_kids_reservar_codigos`
- `fn_registrar_contato`
- `merge_kids_criancas`

