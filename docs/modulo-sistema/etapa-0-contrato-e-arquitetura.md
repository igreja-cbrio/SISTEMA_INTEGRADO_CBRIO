# Módulo Sistema · Etapa 0

> Status: proposta de contrato e arquitetura — nenhuma tela, rota ou tabela do
> módulo foi implementada nesta etapa.
>
> Data-base da auditoria: 2026-07-29
> Código auditado: `fc4633ce` (`codex/arquitetura-inscricoes-f35`, 1 commit à
> frente da referência local de `origin/main`)

## 1. Decisão de produto

O módulo **Sistema** será o command center de operação, observabilidade,
segurança e governança técnica do ecossistema CBRio.

Ele não será:

- uma pasta para reunir qualquer tela administrativa;
- um substituto dos módulos ministeriais ou de negócio;
- um visualizador irrestrito de payloads, segredos ou PII;
- um lugar em que todo operador de domingo precise ser super-admin;
- um segundo Sentry, Vercel, Supabase ou GitHub implementado dentro do ERP.

O módulo agrega sinais dessas fontes, dá contexto CBRio, cria incidentes,
atribui responsáveis e mantém a memória operacional.

### Regra de ouro

Todo incidente relevante deve resultar em pelo menos um destes resultados:

1. um check automático permanente;
2. uma melhoria de instrumentação;
3. uma alteração de runbook;
4. uma barreira preventiva;
5. uma decisão registrada de risco aceito.

## 2. Usuários e acesso

### Usuário principal

Super-admin técnico/operacional presente em `app_super_admins`.

### Usuários indiretos

- diretoria: recebe relatórios executivos sanitizados, sem acesso ao console;
- donos de módulo: recebem alertas e incidentes do seu domínio;
- operadores: usam superfícies operacionais próprias, com permissão de módulo;
- DPO/jurídico: participa das decisões e revisões sobre biometria, retenção e
  tratamento de dados;
- desenvolvedores: investigam erros, releases, integrações e regressões.

### Contrato de autorização

- Toda rota frontend de `/sistema` usa `SuperAdminGuard`.
- Todo endpoint backend usa `authenticate` + `requireSuperAdmin`.
- Não existe bypass por `role=admin` ou `role=diretor`.
- Ações de alto impacto exigem reautenticação/confirmação reforçada, motivo e
  registro de auditoria.
- A leitura dos próprios logs sensíveis também deve ser auditada.
- Relatórios para não-super-admin são produtos derivados e sanitizados, nunca
  acesso indireto ao console.

## 3. Fronteiras por domínio

| Domínio | Dentro de Sistema | Fora de Sistema |
|---|---|---|
| Feedback | triagem, incidente, SLA, correlação com erro/release | conversa funcional do módulo dono |
| Web/API | uso, disponibilidade, erros, performance, release | dashboards ministeriais e de negócio |
| Mobile | estabilidade, uso, versão, dispositivo, push, rede | funcionalidades do app do membro |
| Wi-Fi | sync, integração, matching, conflitos, retenção, auditoria | acompanhamento pastoral e presença |
| Facial | configuração, saúde, consentimento, expurgo, auditoria | câmera e operação de entrada |
| Automações | catálogo, execução, falha, retry, responsável | lógica de negócio executada pelo job |
| Dados | integridade transversal, crescimento, migrations, backup | correção operacional na tela dona |
| Relatórios | estabilidade, adoção, incidentes, custos e operação | relatórios ministeriais/financeiros |
| Configuração | flags, kill-switches, alertas, retenção | cadastro funcional de cada módulo |

### Regra para Wi-Fi e facial

Sistema administra a **plataforma e sua governança**. Os módulos ministeriais
consomem somente visões derivadas, justificadas e com o menor dado necessário.

## 4. Mapa funcional aprovado para planejamento

### 4.1 Visão geral

- saúde de Web, API, Android e iOS;
- incidentes ativos e usuários afetados;
- erros e regressões após release;
- automações atrasadas ou paradas;
- integrações desconectadas;
- filas represadas;
- qualidade de dados;
- banco, storage, autenticação e backups;
- último deploy e versão em produção;
- custos atuais e tendência.

### 4.2 Web & API

- usuários e sessões;
- telas e jornadas;
- erros frontend agrupados;
- erros backend agrupados;
- taxa de erro por rota;
- latência p50, p95 e p99;
- endpoints lentos;
- navegadores e dispositivos;
- Core Web Vitals;
- releases e comparação antes/depois;
- testes sintéticos de jornadas críticas.

### 4.3 Mobile

Subabas obrigatórias: **Android** e **iOS**.

Métricas comuns:

- usuários, sessões e instalações;
- versão/build e adoção;
- crash-free users e crash-free sessions;
- erros por release;
- startup e desempenho;
- falha de rede/API;
- autenticação;
- push e deep link;
- jornada abandonada;
- online/offline;
- SO e dispositivo.

Específico Android:

- crashes percebidos pelo usuário;
- ANRs;
- renderização lenta;
- fabricantes/modelos;
- Android Vitals e versão na Play Store.

Específico iOS:

- crashes e hangs;
- diagnósticos MetricKit;
- memória, energia e startup;
- modelos de iPhone/iPad;
- versão publicada e rollout na App Store.

### 4.4 Incidentes & Feedback

- caixa única para feedback, erro e alerta;
- agrupamento/deduplicação;
- severidade;
- impacto e usuários afetados;
- responsável;
- SLA;
- status e timeline;
- comentários e anexos;
- request/session/release correlacionados;
- regressão;
- PR/deploy de correção;
- post-mortem;
- check permanente criado.

O nome “Feedback do piloto” é descontinuado quando essa aba entrar em produção.

### 4.5 Automações & Integrações

- catálogo único;
- agendamento e próxima execução;
- começo, fim e duração de cada execução;
- sucesso, falha, parcial, ignorado ou cancelado;
- itens lidos/criados/alterados/ignorados;
- sequência de falhas;
- retry;
- responsável e runbook;
- dependências;
- alertas;
- execução manual auditada;
- pausa/kill-switch auditado.

### 4.6 Dados & Auditoria

- placeholders/fantasmas;
- duplicidades e conflitos de identidade;
- integridade referencial de negócio;
- migrations e drift;
- crescimento de tabelas e storage;
- backup e teste de restauração;
- mudanças de permissão e super-admin;
- exports de dados;
- eventos de autenticação/autorização;
- trilha transversal de mudanças;
- acessos a biometria;
- retenções e expurgos.

### 4.7 Facial & Wi-Fi

- estado da integração;
- último sync;
- qualidade do matching;
- conflitos para revisão;
- limiares configurados;
- base legal/consentimentos;
- revogações;
- retenção e expurgo;
- volume e crescimento;
- acessos auditados;
- alertas técnicos.

### 4.8 Relatórios & Custos

- digest operacional diário;
- relatório executivo semanal;
- estabilidade por release;
- adoção Web/Android/iOS;
- incidentes e cumprimento de SLA;
- automações e integrações;
- segurança e auditoria;
- qualidade de dados;
- capacidade e crescimento;
- custos por fornecedor/competência;
- deploys, commits, PRs e entregas.

### 4.9 Configurações

- super-admins;
- responsáveis por serviço;
- roteamento de alertas;
- feature flags;
- kill-switches;
- retenção;
- amostragem;
- níveis de logging;
- limites de alerta;
- catálogo de superfícies e integrações;
- ambientes;
- status de secrets sem revelar valores.

## 5. Contrato de observabilidade

### 5.1 Identificadores de correlação

Todo evento novo deve aceitar ou produzir:

- `event_id`;
- `request_id`;
- `trace_id`, quando disponível;
- `session_id`, pseudonimizado;
- `release`;
- `environment`;
- `surface`: `web_publico`, `web_erp`, `api`, `android`, `ios`, `worker`;
- `module`;
- `user_id`, apenas quando necessário e permitido.

O `request_id` deve ser devolvido no header da resposta e aparecer nos erros
apresentados ao usuário, sem expor detalhes internos.

### 5.2 Vocabulário de eventos

Categorias distintas:

| Categoria | Finalidade | Exemplos |
|---|---|---|
| `operational` | saúde e diagnóstico | integração offline, fila represada |
| `application_error` | defeito de software | exceção, HTTP 500, crash, ANR |
| `performance` | desempenho | API lenta, startup lento |
| `security` | eventos de segurança | login falho, 403, rate limit |
| `audit` | ação atribuível | export, permissão, exclusão, configuração |
| `business_process` | falha de jornada | webhook pago sem liberar inscrição |
| `data_quality` | integridade | CPF conflitante, placeholder novo |
| `job_run` | execução agendada | cron iniciou/falhou/concluiu |

### 5.3 Severidade

- `info`: operação esperada relevante;
- `warning`: degradação sem interrupção importante;
- `error`: funcionalidade falhou ou exige intervenção;
- `critical`: indisponibilidade, risco de dados, segurança ou domingo em risco.

Severidade não deve ser inferida apenas do status HTTP. Impacto, alcance,
recorrência e criticidade da jornada participam do cálculo.

### 5.4 Estados de incidente

`novo → reconhecido → investigando → mitigado → resolvido → monitorado`

Estados terminais adicionais: `duplicado`, `não_reproduzido`, `risco_aceito`.

## 6. Contrato mínimo de execução de jobs

Cada cron, workflow ou worker deve produzir um registro com:

- chave estável;
- origem (`vercel`, `github`, `railway`, `supabase`, `manual`);
- schedule;
- `started_at`, `finished_at`, `duration_ms`;
- status;
- tentativa;
- contadores;
- erro sanitizado;
- release;
- responsável;
- link para runbook;
- `triggered_by`, quando manual.

O sucesso deve representar a conclusão do efeito esperado. Um HTTP 200 que
retorna `{ok:false}` ou uma execução parcial não pode ser classificado como
sucesso.

## 7. Segurança, privacidade e LGPD

### 7.1 Dados proibidos em logs

- senha;
- token, cookie ou segredo;
- chave de API;
- conexão de banco;
- número completo de cartão/conta;
- CPF, telefone ou e-mail sem necessidade explícita;
- conteúdo pastoral;
- imagem facial ou embedding em payload de log;
- body/query arbitrários;
- documentos e comprovantes.

### 7.2 Sanitização

- whitelist de propriedades por evento;
- limites de tamanho;
- remoção de CR/LF e conteúdo executável;
- mascaramento consistente;
- hash/pseudônimo para correlação sem identidade direta;
- `beforeSend` comum nas superfícies Sentry;
- teste automatizado de vazamento de secrets/PII.

### 7.3 Retenção inicial proposta

Valores finais dependem de validação do DPO:

| Dado | Retenção proposta |
|---|---|
| telemetria bruta de uso | 90 dias |
| agregados anônimos | 24 meses |
| erro com contexto técnico | 180 dias |
| execução de automação | 12 meses |
| incidente/post-mortem | 5 anos |
| evento de segurança | 12 meses |
| trilha de auditoria sensível | 5 anos |
| biometria anônima | prazo mínimo operacional aprovado pelo DPO |
| consentimento/revogação | vigência legal definida pelo DPO |

### 7.4 Portão biométrico

Antes de expandir reconhecimento facial:

- parecer e dono DPO definidos;
- termo versionado;
- prova de aceite do titular/responsável;
- finalidade e base legal;
- revogação;
- expurgo verificável;
- trilha de quem acessou/alterou;
- teste de falso positivo/negativo;
- plano de incidente biométrico.

Checkbox de operador não é evidência suficiente de consentimento do titular.

## 8. SLOs iniciais propostos

Estes números são hipóteses da Etapa 0 e precisam ser aprovados antes de virarem
alertas.

| Jornada | Indicador | Alvo inicial |
|---|---|---|
| login ERP/app | disponibilidade mensal | 99,5% |
| APIs autenticadas principais | sucesso excluindo 4xx esperados | 99,5% |
| check-in Kids durante janela de culto | disponibilidade | 99,9% |
| check-in de inscrições | disponibilidade em evento ativo | 99,9% |
| webhook de pagamento | processamento confirmado | 99,9% |
| fila WhatsApp | itens sem atraso além do SLA | 99% |
| crons críticos | execuções no prazo | 99% |
| Web ERP | p95 de resposta API | até 1,5 s |
| mobile | crash-free users | ≥ 99,5% |
| Android | user-perceived ANR | abaixo do limiar do Android Vitals |

Alertas devem usar janelas e tolerância para evitar fadiga. Ausência de dado
deve aparecer como `desconhecido`, nunca como `saudável`.

## 9. Decisões de arquitetura para a Etapa 1

### Reaproveitar

- `app_super_admins`;
- `requireSuperAdmin` e `SuperAdminGuard`;
- Sentry frontend/backend;
- `app_feedback`;
- `app_erros_servidor`;
- `app_eventos`;
- `app_audit_log`;
- logs especializados existentes;
- `monitorAutomacoes` como protótipo;
- dashboard `system-report` como fonte de atividade/custos.

### Criar

- catálogo canônico de serviços, jobs e integrações;
- registro canônico de execuções;
- registro de releases;
- incidentes e timeline;
- eventos estruturados/correlacionados;
- configuração versionada e auditada;
- prova de consentimento biométrico.

### Não criar

- clone do Sentry;
- armazenamento de secrets;
- cópia integral de logs de fornecedores;
- nova lógica ministerial para Wi-Fi/facial;
- novo builder genérico de relatórios de negócio.

## 10. Dependências externas

- acesso de leitura às APIs/exports necessários de Vercel, GitHub, Sentry,
  Supabase, Railway, Google Play e App Store;
- identificação do repositório e stack do app mobile;
- confirmação das versões publicadas Android/iOS;
- definição de responsáveis por integração;
- decisão DPO para biometria e retenção;
- inventário real de ambientes (`production`, `preview`, `development`).

Nenhuma dessas dependências bloqueia a fundação da Etapa 1, mas bloqueia a
cobertura completa do console.

## 11. Critérios de saída da Etapa 0

- [x] propósito e fronteira definidos;
- [x] mapa funcional inicial;
- [x] contrato de super-admin;
- [x] taxonomia de eventos;
- [x] contrato mínimo de jobs;
- [x] regras iniciais de segurança e retenção;
- [x] riscos de Wi-Fi/facial registrados;
- [x] SLOs propostos;
- [x] inventário técnico inicial;
- [ ] responsáveis humanos confirmados;
- [ ] SLOs aprovados;
- [ ] política biométrica aprovada pelo DPO;
- [ ] repositório/stack mobile confirmado;
- [ ] acesso às fontes externas confirmado;

Os cinco itens pendentes são decisões/coordenações. A implementação da fundação
da Etapa 1 pode começar sem esperar todos, desde que facial e mobile nativo não
sejam considerados concluídos.
