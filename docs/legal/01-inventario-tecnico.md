# Inventário Técnico — Sistema de Gestão Eclesiástica

> Documento de referência para registro de Programa de Computador no INPI,
> contrato de co-titularidade, contrato de licença Igreja CBRio ↔ Titulares,
> e modelo de contrato whitelabel para futuros clientes.
>
> **Status**: Rascunho — revisar com advogado de Propriedade Intelectual antes do depósito.
>
> **Data de referência**: 2026-05-28

---

## 1. Identificação da Obra

| Campo | Valor |
|---|---|
| Tipo | Programa de Computador (Software-as-a-Service) |
| Categoria | Sistema de Gestão Integrada para Organizações Religiosas (ChurchOps / Faith-Based ERP) |
| Linguagens predominantes | TypeScript, JavaScript, SQL (PostgreSQL) |
| Modalidade de distribuição | SaaS multi-tenant com possibilidade whitelabel |
| Estágio atual | Em produção (cliente piloto: Igreja CBRio) |

## 2. Titularidade

| Titular | Participação | Documentação necessária |
|---|---|---|
| (Co-titular 1) | 50% | CPF, RG, comprovante de residência |
| Marcos Paulo (Almeida) | 50% | CPF, RG, comprovante de residência |

**Acordo de co-titularidade (a formalizar em contrato):**
- Cada co-titular pode usar, modificar, licenciar e ceder uso individualmente
- **Venda do software** (cessão total) exige consentimento dos dois
- Direito de preferência mútuo em caso de venda da participação
- Sucessão: regulamentar herança (cláusula buy-out recomendada)
- Eventual constituição de Pessoa Jurídica para comercialização whitelabel

## 3. Stack Técnico

### Frontend
- **React 18.3** + **Vite 5.4** (SPA com code-splitting via `lazyWithRetry`)
- **TypeScript 5.8** + **JavaScript** (misto)
- **Tailwind CSS 3.4** + **shadcn/ui** + **Radix UI** (23 componentes primitivos)
- **React Router 6.30** (roteamento client-side)
- **React Hook Form 7.61** + **Zod 3.25** (formulários + validação)
- **Recharts 2.15** (visualizações de dados)
- **Leaflet 1.9** + **MapLibre GL 5.23** (mapas)
- **Framer Motion 12.38** (animações)
- **html2canvas / jsPDF** (export PDF), **qrcode / html5-qrcode / @zxing** (QR codes)

### Backend
- **Node.js ≥22** com **Express 4.21**
- Arquitetura híbrida: **Vercel Serverless** (API REST) + **Railway Worker** (agentes long-running)
- **PostgreSQL 15+** via **Supabase** (cloud-managed)
- **JWT** (jsonwebtoken 9) + **bcryptjs** para autenticação
- Middlewares de segurança: **helmet**, **hpp**, **express-rate-limit**
- Processamento de documentos: **mammoth** (Word), **officeparser** (Excel), **pdf-parse**, **xlsx**, **pptxgenjs**, **docx**
- Notificações: **web-push** (PWA), **passkit-generator** (Apple Wallet / Google Pay)

### IA e Agentes
- **@anthropic-ai/sdk 0.86** — chamadas síncronas (classificação, parsing, geração)
- **@anthropic-ai/claude-agent-sdk 0.2** — agentes autônomos (Executor Financeiro)
- Modelos utilizados: Claude Opus 4.7, Claude Sonnet 4.6, Claude Haiku 4.5

### Banco de Dados
- **209 tabelas** PostgreSQL com Row-Level Security (RLS) contextual
- **322 migrations** versionadas (39.021 linhas de SQL)
- **30 tabelas** com soft-delete + audit-log imutável (conformidade LGPD)
- **541 policies RLS** ativas, **10 funções helpers** SQL com `SECURITY DEFINER`
- **8 tabelas** com triggers de auditoria de dados sensíveis (PII, salários, CPF)

### Observabilidade e Qualidade
- **Sentry** (APM, error tracking, session replay)
- **Vitest 3.2** (testes unitários) + **Playwright 1.57** (testes E2E)
- **ESLint 9.32** + **TypeScript strict mode**

## 4. Métricas do Código (referência para registro)

| Métrica | Valor |
|---|---|
| Arquivos fonte (JS/TS/JSX/TSX/SQL) | 854 |
| Linhas de código (excluindo migrations) | 167.570 |
| Linhas de SQL (migrations) | 39.021 |
| Tabelas PostgreSQL | 209 |
| Migrations versionadas | 322 |
| Endpoints REST | 1.078+ |
| Arquivos de rota backend | 64 |
| Páginas/módulos frontend | 50+ |

## 5. Módulos do Sistema (escopo funcional)

### 5.1 Núcleo Estratégico
1. **Dashboard Executivo** — KPIs consolidados, gráficos, ritmo
2. **Painel CBRio** — visão macro: NSM, mandalas, matriz Valor × Área
3. **Minha Área** — painel filtrado por escopo do líder
4. **Planejamento Estratégico** — ciclos OKR, planos de ação
5. **Ritual Mensal** — agenda institucional, celebrações
6. **Revisão Estratégica** — bimestral, drill-down de causa-decisão
7. **Governança** — ciclo mensal (OKR → DRE → KPI → Conselho)

### 5.2 Ministerial
8. **Integração** — coleta de cultos (presencial/online/kids + decisões)
9. **Cuidados** — acompanhamento pastoral, jornada 180 dias
10. **Online** — métricas YouTube (audiência, views, séries)
11. **Kids** — ministério infantil + check-in via QR code (Totem)
12. **AMI** — ministério adolescentes
13. **Bridge** — transição jovens adultos
14. **Sede** — célula adultos
15. **NEXT** — porta de entrada novos convertidos
16. **Voluntariado** — recrutamento, escalas, histórico
17. **Membresia** — inscrições, contribuições, jornada de membro
18. **Grupos** — pequenos grupos, encontros, supervisão hierárquica

### 5.3 Operacional
19. **Eventos** — calendário, ciclos criativos, KPIs de operação
20. **Projetos** — kanban, gantt, timeline, responsáveis UUID
21. **Expansão** — plantação de novas unidades, marcos
22. **RH** — funcionários, folha, férias, treinamentos, PCS
23. **Financeiro** — DRE, fluxo de caixa, contas pagar/receber, classificação automática
24. **Logística** — recursos, materiais, estoque
25. **Patrimônio** — bens, espaços, manutenção
26. **Solicitações** — fluxo administrativo com SLA + NPS

### 5.4 Dados e IA
27. **Dados Brutos** — entrada de KPIs operacionais
28. **NPS** — pesquisas, análise, vinculação
29. **Assistente IA** — chat contextual, Managed Agents
30. **Cérebro CBRio** — classificação automática de documentos (SharePoint → Obsidian)
31. **Fila de Aprovação** — queue de ações propostas por agentes autônomos

### 5.5 Administração
32. **Permissões** — matriz cargo × módulo × área com overrides
33. **Usuários** — gestão de pessoas, cargos, áreas
34. **WhatsApp** — webhook + coleta passiva de dados via texto livre
35. **Notificações** — regras automáticas por evento/módulo

### 5.6 Devocional
36. **Devocionais** — planos diários, integração API.Bible, tracking de jornada
37. **Totem Membro** — check-in via QR (presença, doação, NPS)
38. **Totem Kids** — check-in infantil com impressão de etiquetas (Brother QL-820NWB)

### 5.7 Públicas (sem login)
39. **Cadastro de Membresia**, **Inscrição Voluntariado**, **Inscrição Batismo**, **Inscrição Grupos**, **Inscrição NEXT**, **NPS Pública**, **Apple Wallet / Google Pay**

## 6. Diferenciais Técnicos (relevantes para valoração de IP)

### 6.1 Sistema OKR/NSM com Cascata Automática
Arquitetura proprietária de rollup hierárquico em 4 níveis (Documento → Área → Evento → Institucional), com:
- **NSM** (Northern Star Metric) calculada em tempo real via triggers SQL
- **Matriz Valor × Área** (5 valores × 6 áreas = ~150 KPIs distribuídos)
- **Trajetória de meta** (checkpoints intermediários) com normalização por periodicidade
- **Comparação YoY** (year-over-year) automática para KPIs semanais
- **Sistema de jornada de pessoas** (Seguir, Conectar, Investir, Servir, Generosidade)

### 6.2 Cérebro CBRio
Agente de IA que monitora SharePoint via Microsoft Graph Delta Query, classifica documentos com Claude Haiku, e gera notas estruturadas em vault Obsidian. Inclui:
- Detecção automática de novos arquivos
- Extração de texto multi-formato (PDF, Word, Excel, PowerPoint, imagens)
- Classificação contextual com prompt customizado e regras canônicas no SharePoint
- Geração de wikilinks e tags hierárquicas
- Cache de processamento, controle de custo e fila com retry

### 6.3 Agente Executor Financeiro
Primeiro agente "ativo" do sistema (vs. agentes apenas relatoriais), implementado com:
- **Claude Agent SDK** rodando como worker persistente no Railway
- **13 ferramentas customizadas** (9 read-only + 4 propose)
- **Fila de aprovação humana** (`agent_queue`) — toda mutation passa por review
- **Idempotência**, respeito a fechamento mensal, anti-invenção
- Cron 3x/dia (9h/14h/19h SP) com custo controlado (~US$10/mês)

### 6.4 Bot WhatsApp com Parser de IA
Webhook Meta Cloud API + parser Claude Haiku que transforma texto livre de líderes em estrutura tipada:
- Identificação de líder por telefone E.164
- Parser de "intent + módulo + dados + confiança"
- Fluxo review-before-apply (mesma fila de aprovação humana)
- HMAC-SHA256 para segurança do webhook

### 6.5 Sistema de Permissões Granular
Modelo cargo × módulo × área com:
- **30 módulos** × **25 cargos** = 750 células de matriz default
- **Override individual** por usuário (com expiração temporal)
- **Boost por área** (`AREA_MODULO_BOOST`) — líder de área ganha nível 5 automático
- **Escopo próprio** (`escopo_proprio`) — filtra dados por área do usuário
- **Super-admin whitelist** auditável (`app_super_admins`)
- **6 níveis** (0-5) de acesso por módulo
- **Cache de 5min** com invalidação automática em write + endpoint manual de bust

### 6.6 Conformidade LGPD by Design
- **Soft-delete obrigatório** em 30 tabelas com PII
- **Audit log imutável** (`app_audit_log`) com triggers em 8 tabelas críticas
- **RLS contextual** por escopo (próprio dado, área, módulo, super-admin)
- **Helpers SQL `SECURITY DEFINER`** para evitar recursão de policies
- **FKs convertidas CASCADE → SET NULL** (21 FKs) — preserva histórico mesmo em delete

### 6.7 Totem Kids
Sistema completo de check-in infantil com hardware integrado:
- Impressão de etiquetas em Brother QL-820NWB (Code128)
- Código de segurança alfabético de 4 chars (32^4 únicos)
- Display em TVs (Fire TV) chamando responsáveis
- TTS pt-BR para chamadas automáticas
- Trigger automático para atualização de KPIs de culto

## 7. Integrações Externas

| Serviço | Finalidade | Modelo |
|---|---|---|
| Anthropic Claude API | Classificação, parsing, geração, agentes | SaaS pago |
| Supabase | PostgreSQL + Auth + RLS + Storage | SaaS pago |
| Microsoft Graph API | SharePoint + OneDrive (Cérebro) | OAuth2 |
| Meta Cloud API (WhatsApp) | Webhook recebimento + envio | Business Account |
| YouTube Data + Analytics API | Métricas de cultos online | OAuth2 |
| Planning Center Online | Sync músicas, usuários, planos | API key |
| API.Bible | Textos bíblicos para devocionais | API key |
| Santander OFX | Sincronização bancária | OFX 1.0.3 |
| Sentry | APM e error tracking | SaaS pago |
| Railway | Hosting do worker de agentes | PaaS |
| Vercel | Hosting frontend + serverless | PaaS |

## 8. Histórico do Projeto

- **Início do desenvolvimento**: anterior ao histórico Git atual (repositório foi reinicializado)
- **Janela Git atual**: 2026-05-26 a 2026-05-28 (73 commits)
- **Estado**: em produção contínua na Igreja CBRio
- **Próximo marco**: preparação para whitelabel (este documento)

## 9. Aspectos Legais Já Endereçados

- **Auditoria de Segurança**: realizada em 2026-05-21 (documentada em `docs/SEGURANCA_RUNBOOK.md`)
- **Política de RLS**: definida com regras absolutas no `CLAUDE.md` (lei do projeto)
- **Audit trail**: sistema imutável de log para todas as mudanças em dados sensíveis
- **Soft-delete**: substitui hard-delete em todas as tabelas com PII (LGPD art. 18)

## 10. Pendências Antes do Depósito INPI

- [ ] Definir nome-produto definitivo (sem usar "CBRio")
- [ ] Constituir Pessoa Jurídica (LTDA ou SLU) com os 2 titulares como sócios 50/50
- [ ] Contrato de co-titularidade (PF) assinado e reconhecido em cartório
- [ ] Contrato de cessão de direitos: titulares PF → PJ recém-criada
- [ ] Contrato de licença Igreja CBRio ↔ PJ (cliente piloto)
- [ ] Pesquisa de anterioridade de marca no INPI (nome + logo)
- [ ] Identidade visual completa do produto whitelabel
- [ ] Modelo de contrato whitelabel para futuros clientes
- [ ] Verificação de licenças open-source utilizadas (auditoria de dependências)
