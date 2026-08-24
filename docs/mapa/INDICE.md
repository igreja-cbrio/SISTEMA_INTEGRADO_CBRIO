# Mapa do sistema · índice

<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

**Leia isto ANTES de investigar onde algo mora.** Uma linha por módulo; a página
de cada um tem rotas, arquivos, endpoints, réguas e tabelas.

| módulo | telas | backend | página |
|---|---|---|---|
| **ami** | `/ami` | — | [ami](ami.md) |
| **apresentacoes** | — | `apresentacoes.js` | [apresentacoes](apresentacoes.md) |
| **batismo** | `/batismo` | — | [batismo](batismo.md) |
| **bridge** | `/bridge` | — | [bridge](bridge.md) |
| **censo** | — | `censo.js` | [censo](censo.md) |
| **cerebro** | — | `cerebro.js` | [cerebro](cerebro.md) |
| **comunicacao** | `/comunicacao` | `comunicacao.js` | [comunicacao](comunicacao.md) |
| **conversas** | — | `waInbox.js` | [conversas](conversas.md) |
| **cuidados** | `/ministerial/cuidados` | `cuidados.js` `nextConvite.js` | [cuidados](cuidados.md) |
| **eventos-externos** | — | `eventosExternos.js` | [eventos-externos](eventos-externos.md) |
| **expansao** | `/expansao` | — | [expansao](expansao.md) |
| **face** | — | `face.js` | [face](face.md) |
| **financeiro** | — | `financeiro.js` `financeiroV2.js` | [financeiro](financeiro.md) |
| **governanca** | `/governanca` `/governanca/:sigla` | `governanca.js` | [governanca](governanca.md) |
| **grupos** | `/grupos` `/grupos/supervisao` | `grupos.js` `whatsappGrupos.js` | [grupos](grupos.md) |
| **inscricoes** | `/inscricoes` `/inscricoes/evento/:id` `/inscricoes/evento/:id/checkin` … | `inscricoes.js` | [inscricoes](inscricoes.md) |
| **inscricoes-totem** | — | `inscricoes.js` | [inscricoes-totem](inscricoes-totem.md) |
| **integracao** | `/integracao/coleta` | `integracao.js` | [integracao](integracao.md) |
| **kids** | `/ministerial/totem-kids` `/ministerial/kids` `/ministerial/totem-kids/criancas` … | `totemKids.js` | [kids](kids.md) |
| **links** | — | `links.js` | [links](links.md) |
| **logistica** | — | `logistica.js` | [logistica](logistica.md) |
| **marketing** | `/marketing` `/marketing/kanban` `/marketing/planner` … | `batismoFotos.js` `comunicados.js` | [marketing](marketing.md) |
| **membresia** | — | `jornada.js` `lgpd.js` | [membresia](membresia.md) |
| **membros** | — | `membresia.js` `pessoas.js` | [membros](membros.md) |
| **membros-financeiro** | — | `membresia.js` | [membros-financeiro](membros-financeiro.md) |
| **membros-totem** | — | `membresia.js` | [membros-totem](membros-totem.md) |
| **next-batismo** | `/entradas` | `nextBatismo.js` | [next-batismo](next-batismo.md) |
| **nps** | — | `nps.js` | [nps](nps.md) |
| **painel-area** | — | `painelArea.js` | [painel-area](painel-area.md) |
| **patrimonio** | — | `patrimonio.js` | [patrimonio](patrimonio.md) |
| **planejamento-anual** | `/planejamento-anual` | — | [planejamento-anual](planejamento-anual.md) |
| **producao** | `/producao` | `producao.js` | [producao](producao.md) |
| **propostas** | `/propostas` | `propostas.js` | [propostas](propostas.md) |
| **relatorios** | — | `relatorios.js` | [relatorios](relatorios.md) |
| **rh** | — | `events.js` `painelRh.js` | [rh](rh.md) |
| **santander** | — | `santander.js` | [santander](santander.md) |
| **totem-membro** | `/totem` | — | [totem-membro](totem-membro.md) |
| **voluntariado** | — | `agenteVoluntariado.js` `volEmails.js` | [voluntariado](voluntariado.md) |
| **whatsapp-admin** | — | `whatsapp.js` | [whatsapp-admin](whatsapp-admin.md) |
| **wifi** | — | `wifi.js` | [wifi](wifi.md) |

## Apps

Telas dos apps e o que cada uma chama: [APPS.md](APPS.md)

## Réguas puras (o que já existe pronto)

Antes de escrever régua nova, conferir se já existe uma:

`backend/utils/` tem **95** arquivos, **86** com teste.

<details><summary>Lista completa</summary>

| régua | teste |
|---|---|
| `backend/utils/acessibilidadeBatismo.js` | `src/test/acessibilidadeBatismo.test.ts` |
| `backend/utils/agendaGrupo.js` | `src/test/agendaGrupo.test.ts` |
| `backend/utils/agradecimento.js` | `src/test/agradecimento.test.ts` |
| `backend/utils/alcadaCompra.js` | `src/test/alcadaCompra.test.ts` `src/test/alcadaCompras.test.ts` |
| `backend/utils/alcadaCompras.js` | `src/test/alcadaCompras.test.ts` |
| `backend/utils/appError.js` | `backend/middleware/errorHandler.test.js` |
| `backend/utils/appPushDestino.js` | `src/test/appPushDestino.test.ts` |
| `backend/utils/appRateLimit.js` | `src/test/appRateLimit.test.ts` |
| `backend/utils/apresentacaoHistorico.js` | `src/test/apresentacaoHistorico.test.ts` |
| `backend/utils/avisoAgregado.js` | `src/test/avisoAgregado.test.ts` |
| `backend/utils/avisoEscala.js` | `src/test/avisoEscala.test.ts` |
| `backend/utils/avisoGrupoApp.js` | `src/test/avisoGrupoApp.test.ts` `src/test/avisoSaidaGrupo.test.ts` |
| `backend/utils/batismoHorario.js` | `src/test/batismoHorario.test.ts` |
| `backend/utils/campoKey.js` | `src/test/campoKey.test.ts` |
| `backend/utils/camposCondicionais.js` | `src/test/camposCondicionais.test.ts` |
| `backend/utils/camposContato.js` | `src/test/saneamentoInscricaoApp.test.ts` `src/test/telefoneCodigoPais.test.ts` |
| `backend/utils/censoCampoCadastro.js` | `src/test/censoCampoCadastro.test.ts` |
| `backend/utils/censoConvite.js` | `src/test/censoConvite.test.ts` |
| `backend/utils/censoPerguntas.js` | `src/test/censoFormEspelho.test.ts` `src/test/censoPerguntas.test.ts` `src/test/censoQuestionario2026.test.ts` |
| `backend/utils/censoPrefill.js` | `src/test/censoPrefill.test.ts` |
| `backend/utils/censoRespostaToken.js` | `src/test/censoRespostaToken.test.ts` |
| `backend/utils/censoToken.js` | `src/test/censoRespostaToken.test.ts` `src/test/censoToken.test.ts` |
| `backend/utils/censoVocabulario.js` | — |
| `backend/utils/checkoutExterno.js` | `src/test/checkoutExterno.test.ts` |
| `backend/utils/corsPolicy.js` | `backend/middleware/errorHandler.test.js` |
| `backend/utils/cpf.js` | — |
| `backend/utils/criancaApresentacao.js` | `src/test/cultoApresentacao.test.ts` |
| `backend/utils/cronAuth.js` | — |
| `backend/utils/cultoJanela.js` | `src/test/cultoJanela.test.ts` |
| `backend/utils/cultoToken.js` | `src/test/cultoToken.test.ts` |
| `backend/utils/cursorLote.js` | `src/test/cursorLote.test.ts` |
| `backend/utils/dadosDoCadastro.js` | `backend/services/membroMatchInsert.test.js` `src/test/portasAlinhadas.test.ts` |
| `backend/utils/dadosSensiveisPessoa.js` | `src/test/dadosSensiveisPessoa.test.ts` |
| `backend/utils/decendioComparativo.js` | `src/test/decendioComparativo.test.ts` |
| `backend/utils/desativarMembro.js` | `src/test/desativarMembro.test.ts` |
| `backend/utils/divisorMandala.js` | `src/test/divisorMandala.test.ts` |
| `backend/utils/entradaGrupoApp.js` | `src/test/entradaGrupoApp.test.ts` |
| `backend/utils/escalaToken.js` | `src/test/escalaToken.test.ts` |
| `backend/utils/exclusaoInscricaoLote.js` | `src/test/exclusaoInscricaoLote.test.ts` |
| `backend/utils/grupoCapaApp.js` | `src/test/grupoCapaApp.test.ts` |
| `backend/utils/grupoEdicaoApp.js` | `src/test/grupoEdicaoApp.test.ts` |
| `backend/utils/gruposToken.js` | `src/test/gruposToken.test.ts` |
| `backend/utils/inscricaoMenor.js` | `src/test/inscricaoMenor.test.ts` |
| `backend/utils/isoWeek.js` | — |
| `backend/utils/jornadaMarcadores.js` | `src/test/jornadaMarcadores.test.ts` |
| `backend/utils/jornadaTempo.js` | `src/test/engajouOutroValor.test.ts` `src/test/jornadaTempo.test.ts` |
| `backend/utils/kidsFrequencia.js` | `src/test/kidsFrequencia.test.ts` |
| `backend/utils/kidsResponsavel.js` | `backend/routes/incidentRemediation.test.js` |
| `backend/utils/lentesDomingo.js` | `src/test/lentesDomingo.test.ts` |
| `backend/utils/linkInscricaoApp.js` | `src/test/linkInscricaoApp.test.ts` |
| `backend/utils/lotesEvento.js` | `src/test/lotesEvento.test.ts` |
| `backend/utils/marketingCores.js` | `src/test/marketingCores.test.ts` |
| `backend/utils/marketingOcupacao.js` | `src/test/marketingOcupacao.test.ts` |
| `backend/utils/marketingSemanas.js` | `src/test/marketingSemanas.test.ts` |
| `backend/utils/marketingSolicitante.js` | `src/test/marketingSolicitante.test.ts` |
| `backend/utils/membrosPagina.js` | `src/test/membrosPagina.test.ts` |
| `backend/utils/mlAvisoEntrega.js` | `src/test/mlAvisoEntrega.test.ts` |
| `backend/utils/moduloDaAreaEvento.js` | `src/test/moduloDaAreaEvento.test.ts` |
| `backend/utils/nfeArquivo.js` | `src/test/nfeArquivo.test.ts` |
| `backend/utils/nfeXml.js` | `src/test/nfeXml.test.ts` |
| `backend/utils/onlineDiag.js` | `src/test/onlineDiag.test.ts` |
| `backend/utils/pagination.js` | — |
| `backend/utils/paresDuplicados.js` | `src/test/paresDuplicados.test.ts` |
| `backend/utils/patrimonioDepreciacao.js` | — |
| `backend/utils/pcoChave.js` | `src/test/pcoChave.test.ts` |
| `backend/utils/periodoYtd.js` | `src/test/periodoYtd.test.ts` |
| `backend/utils/prontidaoCadastro.js` | `src/test/cadastroPessoaCompleto.test.ts` `src/test/prontidaoCadastro.test.ts` |
| `backend/utils/pushLotes.js` | `src/test/pushLotes.test.ts` |
| `backend/utils/remetenteEmail.js` | `src/test/remetenteEmail.test.ts` |
| `backend/utils/resilientFetch.js` | — |
| `backend/utils/respostaEscala.js` | `src/test/respostaEscala.test.ts` |
| `backend/utils/rhOnboardingProntidao.js` | `src/test/rhOnboardingProntidao.test.ts` |
| `backend/utils/rpcsCliente.js` | `src/test/rpcsCliente.test.ts` |
| `backend/utils/saneamentoInscricaoApp.js` | `src/test/saneamentoInscricaoApp.test.ts` |
| `backend/utils/sanitize.js` | — |
| `backend/utils/saudeCrianca.js` | `src/test/portasAlinhadas.test.ts` |
| `backend/utils/sentry.js` | `backend/middleware/errorHandler.test.js` `backend/services/systemWebOps.test.js` |
| `backend/utils/sexoDeclarado.js` | `src/test/sexoDeclarado.test.ts` |
| `backend/utils/storagePath.js` | `src/test/storagePath.test.ts` |
| `backend/utils/supabase.js` | `src/test/anexosLogArquivos.test.ts` `src/test/appIdentidadePreencher.test.ts` `src/test/censoJaRespondeu.test.ts` `src/test/jornadaPiiGuard.test.ts` `src/test/notificarRegraPorTipo.test.ts` `src/test/pagamentosReemissao.test.ts` `src/test/routeModuleMap.test.ts` |
| `backend/utils/supervisorArea.js` | `src/test/supervisorArea.test.ts` |
| `backend/utils/telefoneVoluntario.js` | `src/test/telefoneVoluntario.test.ts` |
| `backend/utils/totemCerco.js` | `src/test/totemCerco.test.ts` |
| `backend/utils/trechoCep.js` | `src/test/trechoCep.test.ts` |
| `backend/utils/vigenciaTipoCulto.js` | `src/test/vigenciaTipoCulto.test.ts` |
| `backend/utils/vinculoMlSolicitacao.js` | `src/test/vinculoMlSolicitacao.test.ts` |
| `backend/utils/vinculosDuplicados.js` | `src/test/vinculosDuplicados.test.ts` |
| `backend/utils/volCobertura.js` | `src/test/volCobertura.test.ts` |
| `backend/utils/volDisponibilidade.js` | `src/test/volDisponibilidade.test.ts` |
| `backend/utils/volIntegradoEm.js` | `src/test/volIntegradoEm.test.ts` |
| `backend/utils/volRodizio.js` | `src/test/volRodizio.test.ts` |
| `backend/utils/volSyncIntegrity.js` | `src/test/volSyncIntegrity.test.ts` `src/test/volSyncStatus.test.ts` `src/test/voluntariadoSync.test.js` |
| `backend/utils/whatsappModulo.js` | `src/test/whatsappModulo.test.ts` `src/test/whatsappOrigem.test.ts` |
| `backend/utils/whatsappOrigem.js` | `src/test/whatsappOrigem.test.ts` |
| `backend/utils/workerHmac.js` | — |

</details>

