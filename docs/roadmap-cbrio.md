# Sistema CBRio · Project View

**Período:** 10/04/2026 (início) → 20/05/2026 (hoje · 40 dias) · documento solicitado por Eduardo Gnisci (Diretor Geral)

---

## Sumário Executivo

| Métrica | Valor | Detalhe |
|---|---|---|
| **Horas gastas (40 dias)** | **560h** | 829 commits · 28 dias úteis · Marcos + Matheus |
| **das quais horas extras** | **112h** | Só Matheus (4h/dia extras × 28 dias) |
| **Horas restantes (estimativa)** | **~600h** | Pendências + módulos novos |
| **Onboarding (horas extras)** | **~420h** | 15 entregas × 28h (2h/dia × 14d) |
| **Total projetado** | **~1.580h** | Dev + onboarding · 2 devs |

### Distribuição por desenvolvedor (40 dias · 28 dias úteis)

| Dev | Commits | Regulares | Extras | Total | Detalhe |
|---|---|---|---|---|---|
| **Marcos Paulo** | 330 | **224h** | 0h | **224h** | 8h/dia · 28 dias úteis · sem horas extras |
| **Matheus Toscano** | 500 | **224h** | **112h** | **336h** | 8h normais + 4h extras/dia × 28 dias |
| **TOTAL** | 830 | 448h | 112h | **560h** | |

> Marcos: trabalhou apenas as 8h regulares por dia útil. Matheus: 8h regulares + 4h extras diárias (mencionou trabalhar de madrugada/noite). Commits do "Claude" e "gpt-engineer-app[bot]" (Lovable) atribuídos ao Matheus conforme orientação. Horas arredondadas · não incluem reuniões de alinhamento.

### Leitura recomendada · output produzido (não tempo presente)

A medida mais defensável é **output equivalente**, não horas de relógio:
- **Marcos · 224h de output** (dev manual · 8h/dia × 28 dias úteis · ritmo manual)
- **Matheus · 336h de output** (8h manuais + 4h equivalentes via IA em paralelo · 28 dias úteis)

A produtividade por hora é praticamente idêntica entre os dois (295 vs 337 linhas/hora · 1,47 vs 1,49 commits/hora). A diferença está no **multiplicador de ferramentas**: Matheus opera Lovable + Claude em paralelo, gerando volume equivalente a mais horas de dev manual em menos tempo de presença real. Por isso o número 336h **não significa "Matheus enrolado mais tempo"**, e sim **"Matheus entregou volume equivalente a 336h de dev manual"**.

Conforme as IAs evoluem, esse multiplicador tende a crescer · o número 336h pode subir sem necessariamente aumentar o tempo de presença.

---

## Legenda · status

- 🟢 **Entregue** · em produção
- 🟡 **Em curso** · parcialmente feito
- ⚪ **Pendente** · nada feito ainda
- 🔵 **Planejado** · previsto, não iniciado
- *Horas em itálico* são estimativas

---

## Entregas Intermediárias · 6 módulos macro

| # | Módulo | Progresso | Gasto | Restante | Status |
|---|---|---|---|---|---|
| 1 | **Administração** | 75% | 160h | *175h* | 🟡 Em curso |
| 2 | **Inteligência** | 70% | 125h | *110h* | 🟡 Em curso |
| 3 | **Planejamento** | 60% | 110h | *120h* | 🟡 Em curso |
| 4 | **Ministerial** | 65% | 115h | *80h* | 🟡 Em curso |
| 5 | **Cultos** | 25% | 30h | *55h* | 🟡 Em curso |
| 6 | **Criativo** (Marketing) | 5% | 0h | *120h* | ⚪ Pendente |

---

## 1. Administração

**160h gastas · ~175h restantes · 75% concluído**

Gestão (RH, Financeiro, Logística, Hospitalidade, Patrimônio, TI) + Solicitações + Permissões. Cobertura ampla, refinamento em andamento.

### 1.1 RH — 45h gastas · *50h restantes* · 🟡 Em curso (Marcos · Matheus)

Dashboard · PCS · Cargos · Salários · Colaboradores · Organograma · Folha · Avaliações 360 · Treinamentos · Férias · Licenças · Onboarding Juliana

| Subetapa | Horas | Status |
|---|---|---|
| Dashboard de funcionários ativos/inativos | 6h | 🟢 Entregue |
| Lista de colaboradores + filtros | 4h | 🟢 Entregue |
| Organograma visual | 5h | 🟢 Entregue |
| Folha salarial + custo mensal | 5h | 🟢 Entregue |
| PCS · Plano de Cargos e Salários (graus, critérios, progressões) | 14h | 🟢 Entregue |
| Férias / licenças / dia extra | 6h | 🟢 Entregue |
| Foto funcionário + avatar | 3h | 🟢 Entregue |
| Avaliações 360 (FIDS) | *~20h* | ⚪ Pendente |
| Módulo de treinamentos | *~16h* | ⚪ Pendente |
| Onboarding Juliana (RH) ajustes finais | *~14h* | ⚪ Pendente |

### 1.2 Financeiro — 20h gastas · *80h restantes* · 🟡 Em curso (Matheus)

Contas a pagar/receber · Reembolsos · Vencimentos · API bancária (Santander)

| Subetapa | Horas | Status | Nota |
|---|---|---|---|
| Lançamentos básicos (entradas/saídas) | 10h | 🟢 Entregue | |
| Reembolsos via Solicitações (PIX/transferência + comprovante) | 10h | 🟢 Entregue | |
| Integração API Santander (banco principal) | *~60h* | ⚪ Pendente | Apoio dev Santander |
| Outras APIs bancárias | *~20h* | ⚪ Pendente | |

### 1.3 Logística & Compras — 25h gastas · *30h restantes* · 🟡 Em curso (Matheus · Marcos)

Fornecedores · Pedidos · Notas fiscais · Mercado Livre · Rastreio · WhatsApp

| Subetapa | Horas | Status | Nota |
|---|---|---|---|
| Dashboard de logística + fornecedores | 5h | 🟢 Entregue | |
| Pedidos via Solicitações (categoria compras) | 5h | 🟢 Entregue | |
| Integração Mercado Livre (9/10 compras) | 10h | 🟢 Entregue | |
| Tracking ML auto (cron 15min) | 5h | 🟢 Entregue | |
| WhatsApp Business (cadastro número + integração) | *~16h* | 🟡 Em curso | Aguarda número |
| Notas fiscais não-ML (API genérica) | *~12h* | ⚪ Pendente | |
| Teste vinculação compras → solicitações | *~2h* | 🟡 Em curso | Feito, sem teste |

### 1.4 Patrimônio — 18h gastas · *5h restantes* · 🟢 Entregue (Marcos)

Bens · QR codes · Movimentações

| Subetapa | Horas | Status |
|---|---|---|
| Lista de bens + categoria + localização | 8h | 🟢 Entregue |
| QR code + scanner mobile | 5h | 🟢 Entregue |
| Movimentações (de→para, responsável, data) | 5h | 🟢 Entregue |
| Decidir manter ou remover aba "Inventário" | *~5h* | 🟡 Em curso |

### 1.5 Hospitalidade — 12h gastas · *10h restantes* · 🟡 Em curso (Marcos · Matheus)

Secretaria (reserva espaço) · Cozinha · Manutenção

| Subetapa | Horas | Status |
|---|---|---|
| Reserva de espaço via Solicitações | 6h | 🟢 Entregue |
| Categoria cozinha (eventos) via Solicitações | 3h | 🟢 Entregue |
| Categoria manutenção via Solicitações | 3h | 🟢 Entregue |
| Calendário visual de reservas (conflitos) | *~10h* | ⚪ Pendente |

### 1.6 TI — 5h gastas · *0h restantes* · 🟢 Entregue (Marcos)

Chamados via Solicitações

### 1.7 Solicitações — 35h gastas · *15h restantes* · 🟢 Entregue (Marcos · Matheus)

Coração dos KPIs ADM · 8+ categorias · SLA · NPS interno · Kanban

| Subetapa | Horas | Status |
|---|---|---|
| Schema com SLA + áreas responsáveis + categorias | 10h | 🟢 Entregue |
| Backend CRUD + triggers SLA realtime | 10h | 🟢 Entregue |
| UI Kanban + filtros + minhas solicitações | 8h | 🟢 Entregue |
| NPS pós-conclusão (badge + cron lembrete) | 5h | 🟢 Entregue |
| ML tracking + WhatsApp notify (stub feature flag) | 2h | 🟢 Entregue |
| Calendário visual de reservas | *~10h* | ⚪ Pendente |
| Dashboard de urgência frequente | *~5h* | ⚪ Pendente |

### 1.8 Permissões — 30h gastas · *20h restantes* · 🟡 Em curso (Marcos)

Matriz cargo×módulo · Usuários · Overrides · Boost por área

| Subetapa | Horas | Status |
|---|---|---|
| Schema · cargos, módulos, matriz, overrides | 8h | 🟢 Entregue |
| Middleware authorizeModule + cache 5min | 5h | 🟢 Entregue |
| Boost por área · 1 cargo + N áreas dão admin no módulo | 4h | 🟢 Entregue |
| UI /admin/permissoes · Matriz + Usuários (cargo, áreas, overrides) | 10h | 🟢 Entregue |
| Sync profiles→usuarios + ROLE_MAP limpeza | 3h | 🟢 Entregue |
| Atribuição cargos em massa + cargos novos (coord adoração/produção/online) | *~10h* | 🟡 Em curso |
| Migrar ModuleGuard pra slugs (limpeza) | *~10h* | ⚪ Pendente |

---

## 2. Inteligência

**125h gastas · ~110h restantes · 70% concluído**

Painel CBRio · ~150 KPIs · Dashboard semanal · NPS · Minha Área · Dados Brutos · Assistente IA. Estrutura completa, validação pós-uso em andamento.

### 2.1 Painel CBRio — 35h gastas · *20h restantes* · 🟢 Entregue (Marcos · Matheus)

NSM · Mandalas · Matriz 6×5 · Alertas · Drill-down de KPI/pessoas

| Subetapa | Horas | Status |
|---|---|---|
| NSM + 3 segmentados (CBRio, Online, CBA) | 5h | 🟢 Entregue |
| Carrossel de 6 mandalas (5 valores + visão geral) | 5h | 🟢 Entregue |
| Matriz Valor × Área 6×5 colorida + drill-down célula | 6h | 🟢 Entregue |
| Carrossel de tendências temporais (5 valores) | 5h | 🟢 Entregue |
| Top 3 alertas críticos | 3h | 🟢 Entregue |
| Drill-down de KPI individual (/painel/kpi/:id) | 6h | 🟢 Entregue |
| Lista de pessoas NSM (camada 4) | 5h | 🟢 Entregue |
| Validação pós-implementação (1 mês de avaliação) | *~20h* | 🟡 Em curso |

### 2.2 Dashboard Semanal — 20h gastas · *15h restantes* · 🟡 Em curso (Matheus)

Substitui Power BI · indicadores semanais + metas + tipos de gráfico

| Subetapa | Horas | Status |
|---|---|---|
| Dashboard semanal (substitui Power BI) | 10h | 🟢 Entregue |
| Filtros por indicador, semana, acumulado mensal | 4h | 🟢 Entregue |
| Aba "Metas" pra diretoria (alto nível, sem operacional) | 6h | 🟢 Entregue |
| Criar indicador com IA (descrição → indicador) | *~8h* | 🟡 Em curso |
| Unificar metas (dashboard ↔ /gestao) | *~7h* | ⚪ Pendente |

### 2.3 Minha Área — 12h gastas · *8h restantes* · 🟢 Entregue (Marcos)

KPIs filtrados pela área/valor do líder

### 2.4 Dados Brutos — 18h gastas · *8h restantes* · 🟢 Entregue (Marcos)

Líder preenche número absoluto · sistema calcula KPI · ~35 tipos seedados

### 2.5 NPS — 16h gastas · *40h restantes* · 🟡 Em curso (Matheus)

Pesquisas geradas por IA · análise automática · 5 contextos KPI

| Subetapa | Horas | Status |
|---|---|---|
| Schema · pesquisas + respostas + sync KPI | 5h | 🟢 Entregue |
| IA Haiku gera perguntas + análise sentimento | 6h | 🟢 Entregue |
| NPS Culto · contexto + KPIs CULTO-NPS-* | 5h | 🟢 Entregue |
| Avaliação de voluntários (NPS específico) | *~12h* | ⚪ Pendente |
| Avaliação institucional geral | *~12h* | ⚪ Pendente |
| Apresentação telão (QR pra preencher pós-culto) | *~16h* | ⚪ Pendente |

### 2.6 Gestão (PMO) — 15h gastas · *15h restantes* · 🟡 Em curso (Marcos)

Estrutura OKR · saúde do sistema · líderes em pendência

### 2.7 Assistente IA / Cérebro CBRio — 9h gastas · *10h restantes* · 🟡 Em curso (Matheus)

Chat IA + agentes auditoria + processamento SharePoint→Obsidian

| Subetapa | Horas | Status |
|---|---|---|
| Chat IA com documentos da igreja | 5h | 🟢 Entregue |
| Cérebro · SharePoint → notas Obsidian (Haiku) | 4h | 🟡 Em curso |
| Agentes de auditoria (membresia, financeiro, etc) | *~10h* | 🟡 Em curso |

---

## 3. Planejamento

**110h gastas · ~120h restantes · 60% concluído**

Eventos (ciclo criativo + KPIs) · Projetos · Expansão · Planejamento Anual · Governança · Ritual · Revisão Estratégica.

### 3.1 Eventos — 35h gastas · *30h restantes* · 🟡 Em curso (Marcos)

Ciclo criativo · Fases · Tarefas · Documentos · KPIs por evento

| Subetapa | Horas | Status |
|---|---|---|
| Schema · eventos + ciclos + fases + tarefas + subtarefas | 10h | 🟢 Entregue |
| UI Lista + Kanban + Gantt + Home | 15h | 🟢 Entregue |
| Templates por categoria de evento | 5h | 🟢 Entregue |
| KPIs operacionais (score documento → área → evento) | 5h | 🟢 Entregue |
| Filtro kanban por área (coord-marketing, etc) | *~5h* | 🟡 Em curso |
| Teste com Criativo (Pedro Paiva) | *~10h* | 🟡 Em curso |
| Approvals + workflow aprovação documentos | *~15h* | ⚪ Pendente |

### 3.2 Projetos — 25h gastas · *15h restantes* · 🟢 Entregue (Marcos · Matheus)

Lista · Kanban · Gantt · Detalhe · Tarefas · Riscos · Orçamento

### 3.3 Expansão — 15h gastas · *30h restantes* · 🟡 Em curso (Marcos)

Marcos estratégicos · cascata de impacto · até 2029

### 3.4 Planejamento Anual — 12h gastas · *10h restantes* · 🟡 Em curso (Marcos)

Ciclo de propostas · workflow aprovação · filtro de ano

### 3.5 Governança — 10h gastas · *8h restantes* · 🟡 Em curso (Marcos)

Ciclo mensal (OKR → DRE → KPI → Conselho)

### 3.6 Ritual — 8h gastas · *15h restantes* · 🟡 Em curso (Marcos)

Revisão mensal diretoria · 5 nominais · causa-decisão-resp-próximo passo

### 3.7 Revisão Estratégica — 5h gastas · *5h restantes* · 🟢 Entregue (Marcos)

Edição direta de projetos/marcos · cascata de impacto · log

### 3.8 Processos / OKR estratégico — 0h · *0h* · ⚪ Descontinuado

> Decisão da reunião de permissões (2026-05-18): módulo Processos foi removido. Rota `/processos` redireciona pra `/eventos`.

---

## 4. Ministerial · preenchimento por valor da Jornada

**115h gastas · ~80h restantes · 65% concluído**

Cadastro e jornada dos membros nos 5 valores (Seguir, Conectar, Investir, Servir, Generosidade).

### 4.1 Integração — 30h gastas · *10h restantes* · 🟢 Entregue (Marcos)

Cultos · Frequência · Decisões (presencial/online/Kids) · Batismos · Histórico

| Subetapa | Horas | Status |
|---|---|---|
| Schema cultos + decisões + batismos + triggers | 10h | 🟢 Entregue |
| Calendário semanal de cultos (mobile-friendly) | 5h | 🟢 Entregue |
| Modal adaptativo (presencial/online/Kids/Bridge/AMI) | 5h | 🟢 Entregue |
| Aba Decisões (toggle Por culto / Pessoas + CPF) | 5h | 🟢 Entregue |
| Cadastro flexível (CPF/nascimento opcionais) | 3h | 🟢 Entregue |
| Cutoff de gaps históricos (2026-05-18) | 2h | 🟢 Entregue |
| Onboarding com Lorena (Integração) finalização | *~10h* | 🟡 Em curso |

### 4.2 Membresia — 25h gastas · *10h restantes* · 🟢 Entregue (Matheus · Marcos)

Cadastros · Trilha 5 valores · Jornada 180 · Duplicados · Merge

| Subetapa | Horas | Status |
|---|---|---|
| Schema membros + famílias + trilha valores | 8h | 🟢 Entregue |
| Aba Duplicados · detecção + merge_membros() | 5h | 🟢 Entregue |
| Jornada 180 cadastros + encontros | 5h | 🟢 Entregue |
| Foto membro + scanner ID | 4h | 🟢 Entregue |
| Importação CSV histórico | 3h | 🟢 Entregue |
| Promover órfãos · cadastros pendentes | *~10h* | 🟡 Em curso |

### 4.3 Cuidados — 15h gastas · *8h restantes* · 🟢 Entregue (Marcos · Matheus)

Capelania · Aconselhamento · Jornada 180 acompanhamentos · Convertidos

### 4.4 NEXT — 12h gastas · *10h restantes* · 🟡 Em curso (Matheus)

Porta de entrada · inscrições · check-in · indicações

### 4.5 Voluntariado — 18h gastas · *10h restantes* · 🟢 Entregue (Matheus · Marcos)

Check-in · Escalas · QR codes · Self-service

### 4.6 Grupos — 15h gastas · *10h restantes* · 🟡 Em curso (Matheus)

Grupos de conexão · supervisão · QR · mapa · materiais

### 4.7 Devocional — 15h gastas · *25h restantes* · 🟡 Em curso (Matheus)

Planos · API.Bible · Haiku gera reflexão · check-in · WhatsApp envio

| Subetapa | Horas | Status | Nota |
|---|---|---|---|
| Schema · planos + itens + check-in mem_devocionais | 5h | 🟢 Entregue | |
| Geração IA (Haiku) · prompt com texto bíblico completo | 5h | 🟢 Entregue | |
| UI /devocional/hoje + login membro | 5h | 🟢 Entregue | |
| Sync RH → mem_membros (todos funcionários acessam) | 1h | 🟢 Entregue | |
| Envio WhatsApp diário (feature flag) | *~12h* | 🟡 Em curso | Aguarda credenciais Meta |
| Trilha personalizada · múltiplos planos por pessoa | *~10h* | ⚪ Pendente | |
| Métricas (engajamento · streak · semana) | *~3h* | 🟡 Em curso | |

### 4.8 Notificações — 10h gastas · *5h restantes* · 🟢 Entregue (Matheus)

Push web · cron diário · regras por módulo · realtime

---

## 5. Cultos · visualização de dados por culto

**30h gastas · ~55h restantes · 25% concluído**

Drill-down read-only de indicadores filtrados por tipo de culto. Preenchimento via Integração. AMI/Kids/Bridge/Online; Sede e CBA são representados pelos indicadores totais.

### 5.1 Online (YouTube) — 25h gastas · *15h restantes* · 🟢 Entregue (Matheus)

Canal · séries · vídeos · OAuth Analytics · DS/DDUS auto · pico live

| Subetapa | Horas | Status |
|---|---|---|
| Schema · canal_snapshot + series + videos | 5h | 🟢 Entregue |
| Sync YouTube Data API (séries = playlists) | 5h | 🟢 Entregue |
| OAuth + Analytics API · pico, DS, DDUS auto | 8h | 🟢 Entregue |
| UI redesign mobile + cards de série | 5h | 🟢 Entregue |
| Métricas avançadas (retenção, share, CTR) | *~12h* | 🟡 Em curso |
| Status assinaturas + tráfego por vídeo | *~3h* | 🟡 Em curso |

### 5.2 CBKids — 2h gastas · *8h restantes* · 🟡 Em curso (Marcos)

Indicadores do ministério infantil (read-only)

| Subetapa | Horas | Status |
|---|---|---|
| Página PainelArea (componente reusável) | 1h | 🟢 Entregue |
| Migration módulo kids + matriz · boost por área | 1h | 🟢 Entregue |
| Popular KPIs específicos (decisões kids, frequência, batismos) | *~5h* | ⚪ Pendente |
| Definir líder + onboarding | *~3h* | ⚪ Pendente |

### 5.3 AMI — 2h gastas · *8h restantes* · 🟡 Em curso (Marcos)

Indicadores do culto AMI (adolescentes/jovens)

### 5.4 Bridge — 1h gasta · *14h restantes* · 🟡 Em curso (Marcos)

Indicadores do culto Bridge (transição)

| Subetapa | Horas | Status |
|---|---|---|
| Módulo criado · página pronta | 1h | 🟢 Entregue |
| Popular KPIs Bridge (nenhum ativo hoje) | *~10h* | ⚪ Pendente |
| Definir líder + onboarding | *~4h* | ⚪ Pendente |

### 5.5 Sede / CBA — Descartado

Não terão módulo próprio · representados nos indicadores totais.

### 5.6 Futuro · menu agregado "Cultos" — *10h* — 🔵 Planejado

Submenu lateral com 4 cultos · idéia levantada na conversa.

---

## 6. Criativo · Marketing

**0h gastas · ~120h restantes · 5% concluído**

Único módulo praticamente intocado · vamos definir com Pepe Menezes (Diretor Criativo) o que precisa antes de desenvolver.

| Etapa | Horas | Status | Responsável |
|---|---|---|---|
| **Discovery** (definir requisitos com Pepe + Pedro Paiva) | *~10h* | 🔵 Planejado | Marcos |
| **Campanhas · Calendário editorial** | *~30h* | ⚪ Pendente | — |
| **Banco de criativos** (peças entregues) | *~25h* | ⚪ Pendente | — |
| **KPIs marketing** (engajamento social, alcance, conversão) | *~25h* | ⚪ Pendente | — |
| **Integração com fluxo de Solicitações** (job criativo) | *~20h* | ⚪ Pendente | — |
| **Subáreas** (Produção, Adoração, Online) · estrutura nos cargos já criados | *~10h* | 🟡 Estrutura pronta | Marcos |

---

## Onboarding · 15 entregas previstas (horas extras · não bloqueia dev)

Cada módulo entregue a uma pessoa-chave demanda **2h/dia × 14 dias = 28h** de acompanhamento de 1 dev (Marcos ou Matheus), em horas extras do expediente. **Não impede desenvolvimento de outros módulos no período.**

| # | Pessoa | Módulo | Horas | Dev acompanhando | Status |
|---|---|---|---|---|---|
| 1 | Lorena Andrade | Integração | 28h | Marcos | 🟡 Em curso |
| 2 | Juliana Leão | RH | 28h | Marcos | 🔵 Planejado |
| 3 | Yago Torres | Financeiro | 28h | Matheus | 🔵 Planejado |
| 4 | Amaury | Compras (Logística) | 28h | Matheus | 🔵 Planejado |
| 5 | Erivelton | Patrimônio | 28h | Marcos | 🔵 Planejado |
| 6 | Diego Assis | TI / Solicitações | 28h | Marcos | 🔵 Planejado |
| 7 | Jéssica Salviano | Hospitalidade (cozinha/manutenção) | 28h | Marcos | 🔵 Planejado |
| 8 | Arthur Serpa | Painel CBRio + Ritual | 28h | Marcos | 🔵 Planejado |
| 9 | Eduardo Gnisci | Gestão (PMO) | 28h | Marcos | 🔵 Planejado |
| 10 | Pedro Paiva | Eventos · Marketing | 28h | Marcos | 🟡 Em curso |
| 11 | Pepe Menezes | Cultos · Criativo | 28h | Matheus | 🔵 Planejado |
| 12 | Pedro Fernandes | Produção | 28h | Matheus | 🔵 Planejado |
| 13 | Renata Martins | Online | 28h | Matheus | 🔵 Planejado |
| 14 | Nélio (Grupos) | Grupos | 28h | Matheus | 🔵 Planejado |
| 15 | Líder NEXT (a definir) | NEXT | 28h | Matheus | 🔵 Planejado |
| | | **TOTAL** | **420h** | | |

---

## Apêndices · requisitos cross

### A. Segurança da Informação & LGPD

- **RLS (Row-Level Security)** habilitado em todas as tabelas críticas (Supabase). Backend usa service-role · escrita controlada por middleware.
- **Permissões granulares**: cargo × módulo + override individual + expiração. Auditável.
- **Modificadores LGPD**: `+E` (pode exportar) controla exportação de CPF, telefone e dados financeiros. Sem isso, dados sensíveis bloqueados na UI.
- **Dados de menores (Kids)**: decisões de crianças cadastradas com dados do responsável; fluxo separado da Jornada (não impacta NSM, evita criação automática de membro).
- **OAuth YouTube**: refresh_token guardado em `online_oauth_tokens` com RLS service_role only. State HMAC anti-CSRF.
- **WhatsApp Business**: pendente · credenciais Meta sob feature flag (`WHATSAPP_ENABLED`).
- **Senhas/tokens**: nada hardcoded · só em variáveis de ambiente do Vercel.
- **Audit trail**: `revision_log` (revisão estratégica), `governance_meetings` (atas), `mem_merge_log` (snapshot pré-merge de duplicados).

> **Reforço sugerido:** revisão LGPD formal antes do go-live geral. Estimado *~16h* de auditoria interna.

### B. Manutenção prevista pós go-live

- **1 mês de avaliação Painel + Dashboard semanal** (mencionado na reunião): garantir que os 150 KPIs estão sendo preenchidos corretamente e calculados como esperado.
- **Bugs de produção**: ~4h/semana de cada dev nos primeiros 2 meses (estimativa).
- **Migração de schema futura**: planejada quando colunas `responsible`/`leader` em `projects` migrarem de texto livre pra UUID.
- **Particionamento de tabelas grandes** (mem_contribuicoes ~600k/ano): planejado pra quando passar 10k+ membros.
- **Read replica do Supabase**: planejado pra quando crescer 25k+ pessoas.

### C. Custos · horas de desenvolvimento (base: 28 dias úteis)

| Período | Marcos | Matheus | Total | Comentário |
|---|---|---|---|---|
| **Regulares** (28 dias × 8h) | 224h | 224h | **448h** | 10/04 → 20/05 |
| **Horas extras** (Matheus 4h/dia) | 0h | 112h | **112h** | Só Matheus · noite/madrugada |
| **40 dias gastos · subtotal** | **224h** | **336h** | **560h** | Commits 829 |
| **Estimado restante** (dev puro) | *~250h* | *~350h* | ***~600h*** | Pendências de cada módulo + Criativo do zero |
| **Onboarding** (horas extras) | *~210h* | *~210h* | ***~420h*** | 15 pessoas × 28h cada · não bloqueia dev |
| **TOTAL projetado** | **~684h** | **~896h** | **~1.580h** | Marcos + Matheus combinados |

> Marcos: 8h/dia em dias úteis · backend + integrações + UI principal · sem horas extras. Matheus: 8h regulares + 4h extras/dia (noite/madrugada) · Lovable + Claude AI + UI complementar + integrações externas (YouTube, ML, devocional). Onboarding pós go-live é tratado como horas extras de ambos. Não inclui reuniões de alinhamento.

### D. Stack técnica

- **Frontend**: React 18 + Vite + TypeScript/JSX (misto) + shadcn/ui + Tailwind + react-router
- **Backend**: Express.js · Vercel serverless (`api/index.js`)
- **Banco**: Supabase (PostgreSQL + Auth + RLS) · 238 migrations versionadas em 40 dias
- **Integrações**: YouTube Data + Analytics API (OAuth), Mercado Livre API, Microsoft Graph (SharePoint/Cérebro), Anthropic Claude (Haiku) para IA, WhatsApp Cloud API (planejado)
- **Cron**: Vercel cron (diários) + GitHub Actions (sub-diários · ex: live monitor YouTube 5min)

---

*Gerado em 2026-05-20 · base: `git log` de 10/04 a 20/05 · 829 commits · 238 migrations · ~177k linhas adicionadas*

*Sistema CBRio · documento solicitado por Eduardo Gnisci (Diretor Geral)*
