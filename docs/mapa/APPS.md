# Mapa dos apps

<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->

> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do
> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua
> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a
> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.
>
> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar
> arquivo que não existe, **vale o código**.

## App dos membros · `Aplicativo-CBRio`

| rota | arquivo | chama |
|---|---|---|
| `/anotacoes` | `app/(app)/anotacoes.tsx` | — |
| `/apresentacao-crianca` | `app/(app)/apresentacao-crianca.tsx` | `/app/apresentacao-crianca` |
| `/batismo` | `app/(app)/batismo.tsx` | — |
| `/cadastro` | `app/(auth)/cadastro.tsx` | — |
| `/cartoes` | `app/(app)/cartoes.tsx` | — |
| `/censo` | `app/(app)/censo.tsx` | `/app/censo` |
| `/completar-cadastro` | `app/(app)/completar-cadastro.tsx` | — |
| `/comprovante-doacoes` | `app/(app)/comprovante-doacoes.tsx` | — |
| `/configuracoes` | `app/(app)/configuracoes.tsx` | `/app/whatsapp-optin` |
| `/cuidados` | `app/(app)/cuidados.tsx` | — |
| `/culto-detalhe` | `app/(app)/culto-detalhe.tsx` | — |
| `/devocional` | `app/(app)/devocional.tsx` | `/app/pense-ultimo` |
| `/escala-supervisor` | `app/(app)/escala-supervisor.tsx` | — |
| `/evento` | `app/(app)/evento.tsx` | — |
| `/falar-com-a-igreja` | `app/(app)/falar-com-a-igreja.tsx` | — |
| `/fale-conosco` | `app/(app)/fale-conosco.tsx` | — |
| `/familia` | `app/(app)/familia.tsx` | — |
| `/generosidade` | `app/(app)/generosidade.tsx` | — |
| `/grupo-detalhe` | `app/(app)/grupo-detalhe.tsx` | — |
| `/grupo-editar` | `app/(app)/grupo-editar.tsx` | — |
| `/grupo-inscricoes` | `app/(app)/grupo-inscricoes.tsx` | — |
| `/grupo-membros` | `app/(app)/grupo-membros.tsx` | — |
| `/grupo-visita` | `app/(app)/grupo-visita.tsx` | — |
| `/grupos` | `app/(app)/grupos.tsx` | — |
| `/index` | `app/(app)/index.tsx` | — |
| `/inscricao-batismo` | `app/(app)/inscricao-batismo.tsx` | `/public/batismo/horarios` |
| `/inscricao-next` | `app/(app)/inscricao-next.tsx` | — |
| `/inscricoes` | `app/(app)/inscricoes.tsx` | — |
| `/jornada` | `app/(app)/jornada.tsx` | — |
| `/kids` | `app/(app)/kids.tsx` | `/app/kids/meus-filhos` `/app/kids/minhas-solicitacoes` `/app/kids/pre-checkin` |
| `/kids-filho` | `app/(app)/kids-filho.tsx` | `/app/kids/filho/:id` `/app/kids/filho/:id/foto` `/app/kids/filho/:id/foto/remover` `/app/kids/filho/:id/saude` |
| `/kids-solicitar-vinculo` | `app/(app)/kids-solicitar-vinculo.tsx` | `/app/kids/solicitar-vinculo` |
| `/login` | `app/(auth)/login.tsx` | — |
| `/menu` | `app/(app)/menu.tsx` | — |
| `/meu-grupo` | `app/(app)/meu-grupo.tsx` | `/app/meu-grupo` |
| `/modo-culto` | `app/(app)/modo-culto.tsx` | `/app/culto/agora` `/app/culto/decisao` |
| `/mural` | `app/(app)/mural.tsx` | `/app/comunicados` |
| `/next` | `app/(app)/next.tsx` | — |
| `/next-turma` | `app/(app)/next-turma.tsx` | — |
| `/notificacoes` | `app/(app)/notificacoes.tsx` | — |
| `/perfil` | `app/(app)/perfil.tsx` | — |
| `/recuperar-senha` | `app/(auth)/recuperar-senha.tsx` | — |
| `/redefinir-senha` | `app/(auth)/redefinir-senha.tsx` | — |
| `/sobre` | `app/(app)/sobre.tsx` | — |
| `/trocar-senha` | `app/(app)/trocar-senha.tsx` | — |
| `/verificar-telefone` | `app/(auth)/verificar-telefone.tsx` | — |
| `/videos` | `app/(app)/videos.tsx` | `/app/videos` |
| `/voluntariado` | `app/(app)/voluntariado.tsx` | `/app/voluntariado/escalas` `/app/voluntariado/escalas/:id/responder` |

<details><summary>lib/ que fala com a API</summary>

| arquivo | chama |
|---|---|
| `components/anim/AnimatedBell.tsx` |  |
| `components/anim/AnimatedCard.tsx` |  |
| `components/anim/AnimatedCountdown.tsx` |  |
| `components/anim/AnimatedShortcut.tsx` |  |
| `components/anim/Breathing.tsx` |  |
| `components/anim/HeartPulse.tsx` |  |
| `components/anim/HeartRefresh.tsx` |  |
| `components/anim/Skeleton.tsx` |  |
| `components/app/ErrorBoundary.tsx` |  |
| `components/app/PortaoAtualizacao.tsx` |  |
| `components/auth/BiometriaLock.tsx` |  |
| `components/auth/CadastroGate.tsx` |  |
| `components/brand/CbrioHeart.tsx` |  |
| `components/brand/SplashPulse.tsx` |  |
| `components/cartao/AddToWalletButton.tsx` |  |
| `components/cartao/HolographicCard.tsx` |  |
| `components/cartao/HoloTicket.tsx` |  |
| `components/censo/CampoCenso.tsx` |  |
| `components/censo/FormCenso.tsx` |  |
| `components/generosidade/CheckoutWebView.tsx` |  |
| `components/generosidade/GenerosidadeTexto.tsx` |  |
| `components/generosidade/SucessoDoacao.tsx` |  |
| `components/grupos/ModalAgendaEncontro.tsx` | `/app/grupos/` |
| `components/home/Carrossel.tsx` |  |
| `components/home/ProximosCultos.tsx` |  |
| `components/inscricoes/BotaoCompartilhar.tsx` |  |
| `components/inscricoes/FormScaffold.tsx` |  |
| `components/inscricoes/SeusDados.tsx` |  |
| `components/onboarding/Onboarding.tsx` |  |
| `components/ui/BottomBar.tsx` |  |
| `components/ui/Button.tsx` |  |
| `components/ui/CalendarioBR.tsx` |  |
| `components/ui/Checkbox.tsx` |  |
| `components/ui/CodeInput.tsx` |  |
| `components/ui/ComingSoon.tsx` |  |
| `components/ui/Dialogo.tsx` |  |
| `components/ui/EmptyState.tsx` |  |
| `components/ui/ErrorState.tsx` |  |
| `components/ui/GlassCard.tsx` |  |
| `components/ui/GruposMapa.tsx` |  |
| `components/ui/Input.tsx` |  |
| `components/ui/PhoneInput.tsx` |  |
| `components/ui/ScreenBackground.tsx` |  |
| `components/ui/SecaoRecolhivel.tsx` |  |
| `components/ui/SocialButton.tsx` |  |
| `components/ui/TecladoSeguro.tsx` |  |
| `components/ui/TopBar.tsx` |  |
| `components/voluntariado/Disponibilidade.tsx` |  |
| `lib/api.ts` | `/app/eventos` `/app/eventos/:id/inscrever` `/app/eventos/minhas` `/app/familia` `/app/familia/aceitar` `/app/familia/convite` `/app/familia/convite-info` `/app/familia/vinculo/:id` `/app/grupos/:id` `/app/grupos/:id/agenda` `/app/grupos/:id/ajuda` `/app/grupos/:id/encontros` `/app/grupos/:id/encontros/:id` `/app/grupos/:id/foto` `/app/grupos/:id/materiais` `/app/grupos/:id/membros` `/app/grupos/:id/membros/:id/funcao` `/app/grupos/:id/membros/:id/sair` `/app/grupos/:id/membros/:id/transferir` `/app/grupos/:id/visitas` `/app/grupos/meus` `/app/grupos/pedidos/:id/aprovar` `/app/grupos/pedidos/:id/rejeitar` `/app/grupos/pedidos/count` `/app/identidade/completar` `/app/identidade/confirmar` `/app/identidade/por-cpf` `/app/identidade/status` `/app/inscricoes` `/app/inscricoes/portas` `/app/membro/foto` `/app/membro/perfil` `/app/meu-grupo/:id/sair` `/app/next/encontros/:id/checkin` `/app/next/encontros/:id/presenca` `/app/next/inscrever` `/app/next/me` `/app/next/papel` `/app/next/turmas/:id` `/app/versao` `/app/voluntariado/escala` `/app/voluntariado/escala-pool` `/app/voluntariado/escala/:id` `/app/voluntariado/escala/servicos` `/app/voluntariado/indisponibilidade` `/app/voluntariado/indisponibilidade/:id` `/app/voluntariado/indisponibilidades` `/app/voluntariado/me` `/app/voluntariado/supervisor` `/app/voluntariado/voluntario/:id/detalhe` `/public/grupos/buscar` `/public/voluntariado/form-opcoes` |
| `lib/applePay.ts` |  |
| `lib/applyFontScale.ts` |  |
| `lib/apresentacaoCrianca.ts` |  |
| `lib/batismo.ts` |  |
| `lib/biometria.ts` |  |
| `lib/buscaTexto.ts` |  |
| `lib/cache.ts` |  |
| `lib/cadastroAberto.ts` |  |
| `lib/cadastroEmAndamento.ts` |  |
| `lib/canalRealtime.ts` |  |
| `lib/capaGrupo.ts` |  |
| `lib/cartaoQr.ts` |  |
| `lib/carteira.ts` |  |
| `lib/censoApi.ts` |  |
| `lib/censoForm.ts` |  |
| `lib/compartilharInscricao.ts` |  |
| `lib/contribuicoes.ts` |  |
| `lib/convite.ts` |  |
| `lib/cultos.ts` | `/app/culto/agora` |
| `lib/dataBRT.ts` |  |
| `lib/descartarRascunho.ts` |  |
| `lib/destaques.ts` |  |
| `lib/devocional.ts` |  |
| `lib/devocionalShare.ts` |  |
| `lib/dialogosNativos.ts` |  |
| `lib/disponibilidade.ts` |  |
| `lib/escalas.ts` |  |
| `lib/eventos.ts` |  |
| `lib/falhaDeLeitura.ts` |  |
| `lib/features.ts` |  |
| `lib/ficha.ts` |  |
| `lib/fonts.ts` |  |
| `lib/grupos.ts` |  |
| `lib/hierarquia.ts` |  |
| `lib/homeCultos.ts` |  |
| `lib/i18n.ts` |  |
| `lib/inscricaoPayload.ts` |  |
| `lib/inscricoes.ts` |  |
| `lib/inscricoesStatus.ts` |  |
| `lib/jornada.ts` |  |
| `lib/marcadoresJornada.ts` |  |
| `lib/meusPedidos.ts` |  |
| `lib/motivoPush.ts` |  |
| `lib/nav.ts` |  |
| `lib/navegacao.ts` |  |
| `lib/notifTap.ts` |  |
| `lib/onboarding.ts` |  |
| `lib/papelGrupo.ts` |  |
| `lib/portaUnica.ts` |  |
| `lib/preferenciaPagamento.ts` |  |
| `lib/proximoBatismo.ts` |  |
| `lib/proximoEncontro.ts` |  |
| `lib/push.ts` |  |
| `lib/pushLotes.ts` |  |
| `lib/resumoEscalas.ts` |  |
| `lib/stripeCheckout.ts` |  |
| `lib/supabase.ts` |  |
| `lib/teclado.ts` |  |
| `lib/telefone.ts` |  |
| `lib/telemetria.ts` |  |
| `lib/temporadaGrupos.ts` | `/public/grupos/app-inscricao` |
| `lib/translations.ts` |  |
| `lib/useAdminGrupo.ts` | `/app/grupos/papel` |
| `lib/useMembro.ts` |  |
| `lib/useNextSync.ts` |  |
| `lib/useNotificacoes.ts` |  |
| `lib/useVoluntariadoSync.ts` |  |
| `lib/validators.ts` |  |
| `lib/versaoApp.ts` |  |
| `lib/visitaSupervisao.ts` |  |
| `lib/volStatus.ts` |  |
| `lib/voluntariadoMe.ts` |  |
| `lib/wallet.ts` |  |

</details>

## App do staff · `CBRio-Staff`

| rota | arquivo | chama |
|---|---|---|
| `/aprovar` | `app/(app)/(tabs)/aprovar.tsx` | — |
| `/batismo/[id]` | `app/(app)/batismo/[id].tsx` | — |
| `/batismo/novo` | `app/(app)/batismo/novo.tsx` | — |
| `/batismos` | `app/(app)/batismos.tsx` | — |
| `/coleta-aprovar` | `app/(app)/coleta-aprovar.tsx` | — |
| `/coleta-culto` | `app/(app)/coleta-culto.tsx` | — |
| `/culto/[id]` | `app/(app)/culto/[id].tsx` | `/dashboard-semanal/culto/:id/historico` |
| `/documentos` | `app/(app)/documentos.tsx` | `/staff/me/documentos` |
| `/escanear-nota` | `app/(app)/escanear-nota.tsx` | — |
| `/evento-inscritos/[id]` | `app/(app)/evento-inscritos/[id].tsx` | — |
| `/grupo-detalhe/[id]` | `app/(app)/grupo-detalhe/[id].tsx` | — |
| `/grupo-inscricoes` | `app/(app)/grupo-inscricoes.tsx` | — |
| `/index` | `app/(app)/(tabs)/index.tsx` | — |
| `/inscricoes` | `app/(app)/inscricoes.tsx` | — |
| `/kids` | `app/(app)/kids.tsx` | — |
| `/kids-apresentacoes` | `app/(app)/kids-apresentacoes.tsx` | — |
| `/kids-batismos` | `app/(app)/kids-batismos.tsx` | — |
| `/kids-sala/[id]` | `app/(app)/kids-sala/[id].tsx` | — |
| `/login` | `app/(auth)/login.tsx` | — |
| `/membresia` | `app/(app)/membresia.tsx` | — |
| `/membro/[id]` | `app/(app)/membro/[id].tsx` | — |
| `/menu` | `app/(app)/(tabs)/menu.tsx` | — |
| `/meus-bugs` | `app/(app)/meus-bugs.tsx` | — |
| `/meus-dados` | `app/(app)/meus-dados.tsx` | — |
| `/next` | `app/(app)/next.tsx` | `/next/dashboard` `/next/eventos` |
| `/next-turma/[id]` | `app/(app)/next-turma/[id].tsx` | — |
| `/notificacoes` | `app/(app)/notificacoes.tsx` | `/notificacoes` `/notificacoes/:id/ler` `/notificacoes/ler-todas` |
| `/notificacoes-config` | `app/(app)/notificacoes-config.tsx` | — |
| `/paineis` | `app/(app)/(tabs)/paineis.tsx` | `/dashboard-semanal/media-mes` `/dashboard-semanal/resumo-semana` `/dashboard-semanal/semanal` |
| `/perfil` | `app/(app)/perfil.tsx` | `/staff/me` `/staff/me/foto` |
| `/qr` | `app/(app)/qr.tsx` | — |
| `/reportar-bug` | `app/(app)/reportar-bug.tsx` | — |
| `/rh` | `app/(app)/rh.tsx` | — |
| `/rh/[id]` | `app/(app)/rh/[id].tsx` | — |
| `/rh/editar` | `app/(app)/rh/editar.tsx` | — |
| `/rh/ferias` | `app/(app)/rh/ferias.tsx` | — |
| `/solicitacao/[id]` | `app/(app)/solicitacao/[id].tsx` | `/solicitacoes/:id/timeline` |
| `/solicitacao/nova` | `app/(app)/solicitacao/nova.tsx` | — |
| `/solicitacoes` | `app/(app)/(tabs)/solicitacoes.tsx` | — |
| `/tarefas` | `app/(app)/tarefas.tsx` | — |
| `/voluntariado` | `app/(app)/voluntariado.tsx` | — |
| `/voluntariado/escala/[serviceId]` | `app/(app)/voluntariado/escala/[serviceId].tsx` | — |

<details><summary>lib/ que fala com a API</summary>

| arquivo | chama |
|---|---|
| `components/kids/EditarInscricaoSheet.tsx` |  |
| `components/LockScreen.tsx` |  |
| `components/ui/BackHeader.tsx` |  |
| `components/ui/Glass.tsx` |  |
| `components/ui/MenuRow.tsx` |  |
| `components/ui/SectionLabelFit.tsx` |  |
| `components/ui/Select.tsx` |  |
| `components/ui/States.tsx` |  |
| `components/ui/TabBarIcon.tsx` |  |
| `lib/api.ts` | `/app/grupos/:id/membros` `/app/grupos/meus` `/app/grupos/papel` `/app/grupos/pedidos` `/app/grupos/pedidos/:id/aprovar` `/app/grupos/pedidos/:id/rejeitar` `/app/grupos/pedidos/count` `/app/tarefas` `/app/tarefas/:id` `/app/voluntariado/checkin` `/app/voluntariado/escala` `/app/voluntariado/escala-pool` `/app/voluntariado/escala/:id` `/app/voluntariado/escala/:id/checkins` `/app/voluntariado/escala/servicos` `/app/voluntariado/supervisor` `/app/voluntariado/voluntario/:id/detalhe` `/dashboard-semanal/resumo-semana` `/financeiro-v2/dashboard/semana` `/financeiro-v2/dashboard/semana-completa${ref ` `/inscricoes/app/eventos` `/inscricoes/app/eventos/:id/inscricoes` `/inscricoes/eventos/:id/inscricoes/excluir-lote` `/integracao/coleta/:id/aprovar` `/integracao/coleta/:id/rejeitar` `/integracao/coleta/pendentes` `/kpis/batismos` `/kpis/batismos${status ` `/kpis/batismos/:id` `/kpis/batismos/config` `/kpis/batismos/horarios` `/kpis/batismos/horarios/:id` `/logistica/compras/escanear` `/membresia/cadastros` `/membresia/cadastros/:id/aprovar` `/membresia/cadastros/:id/rejeitar` `/membresia/cadastros/aprovar-lote` `/membresia/cadastros/kpis` `/membresia/cadastros/pode-aprovar` `/membresia/membros/:id` `/membresia/membros/pagina` `/next/dashboard` `/next/encontros/:id/presencas` `/next/eventos` `/next/lista-espera` `/next/matriculas` `/next/matriculas/:id` `/next/turmas` `/next/turmas${status ` `/next/turmas/:id` `/notificacoes` `/notificacoes/count` `/rh/ferias` `/rh/ferias/:id` `/rh/funcionarios` `/rh/funcionarios${busca ` `/rh/funcionarios/:id` `/rh/funcionarios/:id/ferias` `/rh/funcionarios/:id/pagamentos` `/solicitacoes` `/solicitacoes/:id/aprovar-origem` `/solicitacoes/:id/rejeitar-origem` `/solicitacoes/meu-papel` `/solicitacoes/sla-defs` `/staff/bugs` `/staff/dados-pessoais` `/staff/push-token` `/totem-kids/apresentacoes` `/totem-kids/apresentacoes/:id` `/totem-kids/batismos` `/totem-kids/batismos/:id` `/totem-kids/batismos/todos` `/totem-kids/checkin/:id` `/totem-kids/checkout` `/totem-kids/painel/ao-vivo${sessaoId ` `/totem-kids/painel/dia` `/totem-kids/painel/sala/:id${sessaoId ` `/totem-kids/sessoes` |
| `lib/atalhosHome.ts` |  |
| `lib/batismos.ts` |  |
| `lib/cacheUsuario.ts` |  |
| `lib/dataHora.ts` |  |
| `lib/destinoPush.ts` |  |
| `lib/gradeCulto.ts` |  |
| `lib/homeSinais.ts` |  |
| `lib/indicadores.ts` |  |
| `lib/membresia.ts` |  |
| `lib/permissoes.ts` | `/auth/my-permissions` |
| `lib/push.ts` |  |
| `lib/qr.ts` | `/staff/me/qr` |
| `lib/rh.ts` |  |
| `lib/semana.ts` |  |
| `lib/supabase.ts` |  |
| `lib/theme.ts` |  |
| `lib/useStaffMe.ts` | `/staff/me` |

</details>

