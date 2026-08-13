# Módulo Sistema · Inventário operacional inicial

> Levantamento estático do repositório em 2026-07-29. É o baseline da Etapa 0,
> não uma afirmação de que todas as integrações estão configuradas ou saudáveis
> em produção.

## 1. Resumo

| Item | Quantidade/estado |
|---|---|
| Crons declarados no Vercel | 45 |
| Workflows GitHub Actions | 10 |
| Pipelines no monitor atual | 6 |
| Super-admin estrito | existente |
| Sentry frontend/backend | implementado, condicionado a DSN |
| Log HTTP estruturado em produção | ausente |
| Request ID transversal | ausente |
| Catálogo canônico de jobs | ausente |
| Registro canônico de execuções | ausente |
| Incidentes correlacionados | ausente |
| Retenção da telemetria mobile | não encontrada |

## 2. Fontes existentes a integrar

### Telemetria e erros

| Fonte | Conteúdo | Limitação atual |
|---|---|---|
| `app_eventos` | tela, ação, erro, ping, plataforma, versão | props arbitrárias; sem sessão/build/SO/dispositivo/retention |
| `app_erros_servidor` | HTTP 500 e exceções backend | lista plana; algumas respostas 500 têm mensagem genérica |
| Sentry frontend | exceções, tracing e replay em erro | sem release explícita encontrada |
| Sentry backend | exceções e tracing amostral | sem console interno correlacionado |
| `app_feedback` | reporte humano e status | ainda chamado “piloto”; acesso admin/diretor |

### Auditoria

| Fonte | Conteúdo |
|---|---|
| `app_audit_log` | mudanças genéricas before/after em tabelas cobertas |
| `planejamento_audit` | auditoria de planejamento |
| `revision_log` | alterações de revisão estratégica |
| `mem_merge_log` | fusões de membros |
| `kids_etiquetas_log` | eventos de etiquetas Kids |
| `agent_log` | uso e atividade dos agentes |

### Execuções e integrações

| Fonte | Integração |
|---|---|
| `wifi_sync_log` | Supabase externo de Wi-Fi |
| `vol_sync_logs` | Planning Center/voluntariado |
| `santander_sync_log` | Santander |
| `agent_runs` | agentes e watchers |
| `pag_webhook_eventos` | webhooks de pagamento |
| `solicitacao_ml_eventos` | Mercado Livre |
| `whatsapp_envios` | fila de saída WhatsApp |

### Relatórios

| Fonte | Uso pro Sistema |
|---|---|
| `scripts/system-report` | commits, PRs, custos estimados e cronograma |
| módulo `relatorios` | padrão de catálogo/exportação; dados são de negócio |
| relatórios Sentry/Vercel/GitHub | links e agregados, não cópia integral |

## 3. Crons do Vercel

### Infraestrutura e monitoramento

| Endpoint | Agenda |
|---|---|
| `/api/health` | a cada 5 min |
| `/api/monitor-automacoes/cron/checar` | diário 11:00 UTC |

### Voluntariado, Kids e pessoas

| Endpoint | Agenda |
|---|---|
| `/api/voluntariado/cron/emails` | a cada 5 min |
| `/api/voluntariado/cron/sync` | de hora em hora |
| `/api/voluntariado/cron/antecedentes` | diário |
| `/api/totem-kids/cron/age-out` | diário |
| `/api/totem-kids/cron/encerrar-vencidas` | diário |
| `/api/totem-kids/cron/resumo-kids` | de hora em hora |
| `/api/integracao/cron/gerar-cultos-recorrentes` | mensal |
| `/api/jornada/cron/refresh-papeis` | diário |

### Pagamentos e financeiro

| Endpoint | Agenda |
|---|---|
| `/api/pagamentos-webhook/cron/tick` | a cada 10 min |
| `/api/financeiro/alertas/cron-gerar` | diário |
| `/api/santander/cron/sync` | diário |

### Online e YouTube

| Endpoint | Agenda |
|---|---|
| `/api/kpis/youtube/sync` | diário |
| `/api/online/cron/sync` | diário |
| `/api/online/cron/ds-collect` | diário |
| `/api/online/cron/ddus-collect` | diário |
| `/api/online/cron/subs-collect` | diário |
| `/api/online/cron/trafego-collect` | diário |
| `/api/online/cron/retencao-curva-collect` | diário |
| `/api/online/cron/sub-status-collect` | diário |
| `/api/online/cron/catch-up?limit=20` | diário |
| `/api/online/cron/engajamento-collect` | diário |
| `/api/online/cron/verificar` | diário |

### Comunicação

| Endpoint | Agenda |
|---|---|
| `/api/public/grupos/cron/frequencia-mensal` | mensal |
| `/api/public/grupos/cron/whatsapp-fila` | de hora em hora |
| `/api/comunicacao/cron/agendamentos` | de hora em hora |
| `/api/whatsapp-grupos/cron/diario` | diário |
| `/api/whatsapp-cron/aniversarios` | diário |
| `/api/whatsapp-cron/batismos-lembrete` | diário |

### Conteúdo, dados e governança

| Endpoint | Agenda |
|---|---|
| `/api/cerebro/processar` | diário |
| `/api/cerebro/sync-erp` | diário |
| `/api/governanca/cron/lembrete` | semanal |
| `/api/kpis/cultos/auto-create` | semanal |
| `/api/processos/cron/coletar` | diário; validar resíduo de módulo descontinuado |
| `/api/kpis/v2/cron/coletar` | diário |
| `/api/devocional-planos/cron/enviar-diario` | diário |
| `/api/devocional-planos/cron/lancar-semanal` | semanal |
| `/api/rh/cron/nao-pagos` | mensal |

### Wi-Fi, facial, notificações e agentes

| Endpoint | Agenda |
|---|---|
| `/api/wifi/cron/sync` | três dias por semana |
| `/api/face/cron/expurgo` | diário |
| `/api/notificacoes/cron/alerta-culto-dados` | semanal |
| `/api/agente-primeiro-contato/cron/enfileirar` | diário |
| `/api/agente-voluntariado/cron/checar` | diário |
| `/api/agente-batismo-next/cron/enfileirar` | diário |

### Achados sobre os crons

- O monitor atual observa 6 fontes, não as 45 execuções.
- Não existe um registro uniforme de `started_at/finished_at/duration/status`.
- `/api/health` ser chamado por cron não prova disponibilidade externa.
- Jobs podem retornar HTTP 200 com resultado funcional incompleto.
- Não há catálogo único de criticidade, responsável ou runbook.
- O cron de `processos` precisa ser validado porque o módulo foi descontinuado.
- Vários jobs críticos ao domingo não têm SLO específico.

## 4. GitHub Actions

| Workflow | Papel |
|---|---|
| `deploy-vercel.yml` | testes, build e deploy de produção |
| `e2e.yml` | Playwright em preview/manual |
| `online-live-monitor.yml` | monitor de culto/YouTube |
| `resumo-merge-email.yml` | resumo semanal |
| `santander-cron-sync.yml` | sincronização Santander |
| `santander-pix-realtime.yml` | PIX em alta frequência durante cultos |
| `santander-saldo-monitor.yml` | saldo periódico |
| `solicitacoes-ml-tracker.yml` | rastreio Mercado Livre |
| `system-report.yml` | custos/atividade/cronograma |
| `criar-usuarios.yml` | criação manual de usuários |

### Requisitos de integração

- registrar workflow/run/commit/branch/ambiente;
- distinguir sucesso, cancelado, skipped e falha;
- capturar duração;
- associar deploy à release;
- alertar regressão pós-deploy;
- tratar `criar-usuarios` como ação de segurança auditável;
- não expor logs/artefatos sensíveis no console.

## 5. Integrações externas identificadas

### Plataforma

- Supabase: Postgres, Auth, Storage e RLS;
- Vercel: frontend, API serverless e crons;
- GitHub: código, PRs, workflows e Pages;
- Sentry: erros, performance e replay;
- Railway: agent-worker;
- Supabase externo do Wi-Fi.

### Comunicação e conteúdo

- WhatsApp Cloud API/Meta;
- Microsoft Graph/SharePoint/e-mail;
- Resend;
- web push/VAPID;
- Expo push;
- YouTube Data/Analytics OAuth;
- API.Bible;
- ElevenLabs;
- OpenAI;
- Anthropic.

### Financeiro e operação

- Santander;
- Asaas;
- Mercado Livre;
- Planning Center;
- Infosimples;
- Apple Wallet;
- Google Wallet.

### Mobile

- app Android/iOS externo a este repositório;
- Google Play/Android Vitals ainda sem adaptador identificado;
- App Store/MetricKit ainda sem adaptador identificado.

## 6. Controles de acesso atuais

| Controle | Estado |
|---|---|
| `app_super_admins` | existente |
| `is_super_admin()` no banco | existente |
| `requireSuperAdmin` backend | existente |
| `SuperAdminGuard` frontend | existente |
| Analytics mobile estrito | sim |
| Feedback estrito | não; admin/diretor |
| Monitor de automações | e-mail único hardcoded |
| Wi-Fi/facial | matriz de módulo, não super-admin |

Para o novo módulo, todas as APIs agregadoras e configurações técnicas serão
super-admin. Espelhos sanitizados podem usar a permissão do módulo consumidor.

## 7. Riscos registrados

| Risco | Severidade inicial | Tratamento proposto |
|---|---|---|
| consentimento facial sem prova versionada do titular | crítico | portão DPO antes de expansão |
| telemetria `props` arbitrária | alto | schema/whitelist e sanitização |
| ausência de retenção para `app_eventos` | alto | política + expurgo |
| ausência de request ID | alto | middleware transversal |
| crons sem execução canônica | alto | `system_job_runs` |
| logs de produção HTTP ausentes | médio | logging estruturado amostral |
| monitor baseado só em recência | alto | heartbeat de execução e efeito |
| acesso de feedback diferente de super-admin | médio | migrar para incidente/sistema |
| custos estimados em localStorage/config | médio | competência e valores auditados |
| Wi-Fi contém CPF, telefone, IP e MAC | alto | minimização, retenção e acesso auditado |
| logs fragmentados | médio | adapters/views, sem big-bang |
| falta de release explícita no Sentry | alto | release/commit/environment |

## 8. Dados que não devem ser centralizados

- bodies completos de requisição;
- tokens, cookies e secrets;
- imagens/embeddings faciais;
- conteúdo pastoral;
- comprovantes e documentos;
- mensagens privadas completas;
- dados financeiros detalhados sem finalidade;
- cópia integral de logs de fornecedores.

Sistema guarda metadados, correlações, agregados e links controlados para a
fonte autorizada.

## 9. Pendências organizacionais

| Pendência | Dono sugerido | Bloqueia |
|---|---|---|
| aprovar SLOs | gestão + devs + donos de jornada | alertas definitivos |
| nomear donos de integrações | gestão | escalonamento |
| política biométrica | DPO/jurídico | facial completo |
| retenção de telemetria/auditoria | DPO + devs | expurgos definitivos |
| confirmar repo/stack mobile | responsável mobile | instrumentação Android/iOS |
| liberar fontes externas read-only | gestão/devops | adapters completos |
| definir custo real por fornecedor | financeiro/gestão | FinOps real |

## 10. Próximo incremento técnico

A Etapa 1 deve começar pela fundação:

1. slug e shell `/sistema`;
2. autorização estrita ponta a ponta;
3. catálogo de serviços/jobs/integrações;
4. `request_id`;
5. releases;
6. registro canônico de execuções;
7. adapters somente leitura das fontes atuais;
8. retenção e sanitização;
9. dashboard mínimo de saúde.

Nenhuma migração de Wi-Fi, facial ou relatórios de negócio deve acontecer antes
dessa fundação.
