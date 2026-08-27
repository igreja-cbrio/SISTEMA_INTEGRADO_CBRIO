# Órfãos · o que nenhum módulo reivindica

<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

⚠️⚠️ **Isto não é sobra do gerador — é uma lista de risco.** O CLAUDE.md
registra como LEI que `routeKey` sem entrada no `ROUTE_MODULE_MAP` **desliga a
matriz de permissão em silêncio** (caso `links`, 17/08: a matriz dizia 2 cargos
com escrita, a API aplicava 10). Rota sem `ModuleGuard` e arquivo de rota que
nenhum módulo reivindica são exatamente os candidatos a esse buraco.

⚠️ Estar aqui **não** significa que está errado: há telas legitimamente sem
guard (públicas, totens, `/perfil`). Significa que ninguém decidiu — vale
conferir.

## Telas sem ModuleGuard (77)

| rota | arquivo | pública? |
|---|---|---|
| `/cadastro-membresia` | `src/pages/public/CadastroMembresia` | sim |
| `/onboarding/:token` | `src/pages/public/OnboardingColaborador` | sim |
| `/inscricao-batismo` | `src/pages/public/InscricaoBatismo` | sim |
| `/batismo/acesso` | `src/pages/public/BatismoAcesso` | sim |
| `/apresentacao-criancas` | `src/pages/public/ApresentacaoCriancas` | sim |
| `/evento/:slug` | `src/pages/public/EventoExterno` | sim |
| `/pagamento/:token` | `src/pages/public/PagamentoInscricao` | sim |
| `/doar` | `src/pages/public/Doar` | sim |
| `/doar/:token` | `src/pages/public/Doar` | sim |
| `/i/c/:token` | `src/pages/public/InscricaoComprovante` | sim |
| `/politica-reembolso` | `src/pages/public/PoliticaReembolso` | sim |
| `/inscricao-grupos` | `src/pages/public/InscricaoGrupos` | sim |
| `/inscricao-lideres` | `src/pages/public/InscricaoLideres` | sim |
| `/g/a/:token` | `src/pages/public/GrupoAprovarPedido` | sim |
| `/g/s/:token` | `src/pages/public/GrupoSugestaoAceite` | sim |
| `/g/f/:token` | `src/pages/public/GrupoFrequenciaMes` | sim |
| `/g/r/:token` | `src/pages/public/GrupoRenovacao` | sim |
| `/g/c/:token` | `src/pages/public/GrupoConfiraLista` | sim |
| `/e/:token` | `src/pages/public/EscalaResposta` | sim |
| `/f/a/:codigo` | `src/pages/public/FamiliaConvite` | sim |
| `/next` | `src/pages/public/InscricaoNext` | sim |
| `/next/inscrever` | `src/pages/public/InscricaoNext` | sim |
| `/next/direcionar/:token` | `src/pages/public/NextDirecionar` | sim |
| `/inscricao-voluntariado` | `src/pages/public/InscricaoVoluntariado` | sim |
| `/decisao` | `src/pages/public/DecisaoOnline` | sim |
| `/decisao/:token` | `src/pages/public/DecisaoOnline` | sim |
| `/c/:token` | `src/pages/public/DecisaoCulto` | sim |
| `/wallet` | `src/pages/public/WalletPage` | sim |
| `/motion` | `src/pages/public/Motion` | sim |
| `/novosite` | `src/pages/public/NovoSite` | sim |
| `/novosite/quem-somos` | `src/pages/public/QuemSomos` | sim |
| `/suporte` | `src/pages/public/Suporte` | sim |
| `/nps/publica/:token` | `src/pages/public/NpsPublica` | sim |
| `/censo/p/:slug` | `src/pages/public/CensoPublica` | sim |
| `/campanha/:slug` | `src/pages/public/CampanhaPublica` | sim |
| `/kids/retirada/:codigo` | `src/pages/public/KidsRetirada` | sim |
| `/auth/pc-callback` | `src/pages/auth/PcCallback` | sim |
| `/devocional` | `src/pages/devocional/DevocionalMovido` | sim |
| `/design-preview` | `src/pages/DesignPreview` | não (só logado) |
| `/atlas` | `src/pages/atlas/Atlas` | não (só logado) |
| `/atlas/fluxograma` | `src/pages/atlas/Atlas` | não (só logado) |
| `/voluntariado/totem` | `src/pages/ministerial/voluntariado/VolTotem` | não (só logado) |
| `/voluntariado/self-checkin` | `src/pages/ministerial/voluntariado/VolSelfCheckin` | sim |
| `/dashboard` | `src/pages/Dashboard` | sim |
| `/perfil` | `src/pages/Perfil` | sim |
| `/tarefas` | `src/pages/MinhasTarefas` | sim |
| `/planejamento` | `src/pages/GestaoAnual` | sim |
| `/eventos` | `src/pages/eventos/Eventos` | sim |
| `/eventos/:id` | `src/pages/eventos/EventDetail` | sim |
| `/projetos` | `src/pages/Projetos` | sim |
| `/revisao` | `src/pages/RevisaoEstrategica` | sim |
| `/revisao/:tipo/:id` | `src/pages/RevisaoDetalhe` | sim |
| `/ministerial/reconhecimento-facial` | `src/pages/ministerial/reconhecimentoFacial/ReconhecimentoFacial` | sim |
| `/wifi` | `src/pages/ministerial/Wifi` | sim |
| `/ministerial/integracao` | `src/pages/ministerial/Integracao` | sim |
| `/online` | `src/pages/ministerial/Online` | sim |
| `/assistente-ia` | `src/pages/admin/AssistenteIA` | sim |
| `/solicitacoes` | `src/pages/Solicitacoes` | sim |
| `/painel` | `src/pages/Painel` | sim |
| `/painel/nsm/pessoas` | `src/pages/PainelNsmPessoas` | sim |
| `/jornada` | `src/pages/PainelJornada` | sim |
| `/admin/notificacao-regras` | `src/pages/admin/NotificacaoRegras` | sim |
| `/admin/cruzamentos` | `src/pages/admin/CruzamentosPessoas` | sim |
| `/admin/solicitacoes-responsaveis` | `src/pages/admin/SolicitacoesResponsaveis` | sim |
| `/admin/solicitacoes-fluxo` | `src/pages/admin/SolicitacoesFluxo` | sim |
| `/admin/permissoes` | `src/pages/admin/Permissoes` | sim |
| `/admin/feedback` | `src/pages/admin/Feedback` | sim |
| `/admin/app-analytics` | `src/pages/admin/AppAnalytics` | sim |
| `/sistema` | `src/pages/sistema/Sistema` | sim |
| `/dados-brutos` | `src/pages/DadosBrutos` | sim |
| `/dashboard-semanal` | `src/pages/DashboardSemanal` | sim |
| `/monitoramento-okr` | `src/pages/MonitoramentoOkr` | sim |
| `/ata-semanal` | `src/pages/inteligencia/AtaSemanal` | sim |
| `/admin/grupos/qrcode-inscricao` | `src/pages/admin/InscricaoGruposQRCode` | sim |
| `/admin/grupos/geocode` | `src/pages/admin/GruposGeocode` | sim |
| `/admin/grupos/temporadas` | `src/pages/admin/TemporadasGrupos` | sim |
| `/suporte` | `src/pages/public/Suporte` | sim |

## Arquivos de rota que nenhum módulo reivindica (78)

- `backend/routes/agentTasks.js`
- `backend/routes/agenteBatismoNext.js`
- `backend/routes/agentePrimeiroContato.js`
- `backend/routes/agents.js`
- `backend/routes/app.js`
- `backend/routes/appAnalytics.js`
- `backend/routes/arquivei.js`
- `backend/routes/ataSemanal.js`
- `backend/routes/auth.js`
- `backend/routes/authPlanningCenter.js`
- `backend/routes/bible.js`
- `backend/routes/coberturas.js`
- `backend/routes/completions.js`
- `backend/routes/cycles.js`
- `backend/routes/dadosBrutos.js`
- `backend/routes/dashboard.js`
- `backend/routes/dashboardSemanal.js`
- `backend/routes/devocionais.js`
- `backend/routes/devocionalMembro.js`
- `backend/routes/devocionalPlanos.js`
- `backend/routes/encaminhamentos.js`
- `backend/routes/estrategia.js`
- `backend/routes/expansion.js`
- `backend/routes/feedback.js`
- `backend/routes/gestao.js`
- `backend/routes/kpis.js`
- `backend/routes/kpisV2.js`
- `backend/routes/meetings.js`
- `backend/routes/ml.js`
- `backend/routes/monitorAutomacoes.js`
- `backend/routes/next.js`
- `backend/routes/notificacoes.js`
- `backend/routes/nsm.js`
- `backend/routes/occurrences.js`
- `backend/routes/online.js`
- `backend/routes/pagamentosWebhook.js`
- `backend/routes/painel.js`
- `backend/routes/pcs.js`
- `backend/routes/permissoes.js`
- `backend/routes/planejamento.js`
- `backend/routes/planejamentoAnual.js`
- `backend/routes/processos.js`
- `backend/routes/projects.js`
- `backend/routes/publicApresentacao.js`
- `backend/routes/publicBatismo.js`
- `backend/routes/publicCampanha.js`
- `backend/routes/publicCenso.js`
- `backend/routes/publicDecisaoCulto.js`
- `backend/routes/publicDecisaoOnline.js`
- `backend/routes/publicDevocional.js`
- `backend/routes/publicEventoExterno.js`
- `backend/routes/publicFamilia.js`
- `backend/routes/publicGenerosidade.js`
- `backend/routes/publicGrupos.js`
- `backend/routes/publicMembresia.js`
- `backend/routes/publicNext.js`
- `backend/routes/publicNps.js`
- `backend/routes/publicRhOnboarding.js`
- `backend/routes/publicVolEmail.js`
- `backend/routes/publicVoluntariado.js`
- `backend/routes/publicWhatsapp.js`
- `backend/routes/redirecionador.js`
- `backend/routes/reports.js`
- `backend/routes/revisoes.js`
- `backend/routes/ritual.js`
- `backend/routes/santanderCron.js`
- `backend/routes/sistema.js`
- `backend/routes/sistemaV1.js`
- `backend/routes/solicitacoes.js`
- `backend/routes/staff.js`
- `backend/routes/strategic.js`
- `backend/routes/systemTelemetry.js`
- `backend/routes/tarefas.js`
- `backend/routes/tasks.js`
- `backend/routes/totem.js`
- `backend/routes/tutorial.js`
- `backend/routes/whatsappAutoRoutes.js`
- `backend/routes/whatsappCron.js`
