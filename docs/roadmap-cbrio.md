# Sistema CBRio · Project View (v2)

**Período:** 10/04/2026 (início) → 16/06/2026 (hoje · 68 dias corridos · 46 dias úteis) · documento solicitado por Eduardo Gnisci (Diretor Geral)

> **v2 · 16/06/2026.** Esta é a continuação do relatório de 20/05 (40 dias / 28 dias úteis). O **Período 1** (10/04→20/05) está preservado; o **Período 2** (20/05→16/06 · 18 dias úteis) foi acrescentado com tudo que entrou desde então — com destaque para o **módulo Criativo/Marketing inteiro** (que estava em 5%), **Totem Kids**, **Bot WhatsApp**, **Next-Batismo** e uma **blindagem de segurança** (auditoria de 29 achados + correção de account-takeover).

---

## Sumário Executivo

| Métrica | Valor | Detalhe |
|---|---|---|
| **Horas gastas (acumulado · 46 dias úteis)** | **920h** | Período 1 (560h) + Período 2 (360h) · Marcos + Matheus |
| **das quais horas extras** | **184h** | Só Matheus (4h/dia extras × 46 dias) |
| **Horas restantes (dev puro)** | **~425h** | Pendências de cada módulo · caiu de ~600h |
| **Onboarding (horas extras)** | **~360h** | 15+ entregas × 28h (2h/dia × 14d) |
| **Total projetado** | **~1.705h** | Dev + onboarding · 2 devs |

### Os dois períodos lado a lado

| Período | Dias úteis | Marcos | Matheus | Total | Evidência (git · origin/main) |
|---|---|---|---|---|---|
| **P1 · 10/04 → 20/05** | 28 | 224h | 336h | **560h** | ~830 commits · 238 migrations · ~177k linhas |
| **P2 · 20/05 → 16/06** | 18 | 144h | 216h | **360h** | 605 commits + 355 PRs (até #1071) · ~200 migrations · +163k linhas |
| **Acumulado** | **46** | **368h** | **552h** | **920h** | ~1.460 commits de conteúdo · 439 migrations no total |

### Distribuição por desenvolvedor (acumulado · 46 dias úteis)

| Dev | Regulares | Extras | Total | Detalhe |
|---|---|---|---|---|
| **Marcos Paulo** | **368h** | 0h | **368h** | 8h/dia · 46 dias úteis · sem horas extras |
| **Matheus Toscano** | **368h** | **184h** | **552h** | 8h normais + 4h extras/dia × 46 dias |
| **TOTAL** | 736h | 184h | **920h** | |

> Marcos: trabalha as 8h regulares por dia útil. Matheus: 8h regulares + 4h extras diárias (noite/madrugada). Horas arredondadas · não incluem reuniões de alinhamento. **Dias úteis do Período 2:** 19 dias seg–sex, descontando Corpus Christi (04/06, feriado municipal no Rio) → **18 dias úteis efetivos**.

### Leitura recomendada · output produzido (não tempo de relógio)

A medida mais defensável continua sendo **output equivalente**, não horas de relógio. A grande mudança do Período 2 é de **ferramenta**:

- No **Período 1**, só o Matheus operava com IA pesada (Lovable + Claude). O Marcos fazia dev manual.
- No **Período 2**, **os dois passaram a operar via Claude Code como ferramenta principal**, com autonomia de deploy ponta a ponta (branch → PR → CI Vercel → merge → produção). O multiplicador de ferramentas, que antes era só do Matheus, **agora se aplica aos dois**.

O efeito é visível no volume: **605 commits de conteúdo + 355 PRs mergeadas + ~200 migrations + ~135k linhas líquidas em 18 dias úteis** (P2), contra ~830 commits em 28 dias úteis (P1) — quase o dobro de densidade de entrega por dia. Por isso as horas-relógio **não capturam** o que foi feito: o número 360h do P2 representa **volume equivalente a muito mais que 360h de dev manual**. Conforme as IAs evoluem, esse multiplicador tende a crescer.

> Authorship bruto dos commits no P2 (origin/main): Marcos 480 · Matheus 298 · "Claude" (Claude Code, usado por ambos) 182. As horas seguem calculadas por calendário (presença), não por commit — a contagem de commits é só evidência de atividade.

---

## Período 2 · o que entrou (20/05 → 16/06)

Resumo do que foi de fato entregue/avançado neste mês, antes do detalhamento por módulo:

- **Criativo/Marketing — do zero ao ar (5% → 85%).** Módulo inteiro construído em ~25 specs + redesenho em 6 fases + consolidação em 4 abas (Kanban · Planner · Analytics · Admin), com intake por dor, triagem, campanhas/entregáveis, planner de capacidade por slots/dia, épicos de evento, checklists, upload SharePoint e 4 KPIs próprios. **Maior entrega do período.**
- **Totem Kids — substituto do Planning Center.** Check-in/checkout com etiqueta de segurança, painel ao vivo, salas, TVs de chamada de pickup, integração com pagers físicos (LRS Freedom). 660 famílias + 894 crianças importadas.
- **Bot WhatsApp.** Coleta passiva de líderes → IA (Claude Haiku) em 2 personas (institucional + coleta conversacional) → coleta por **formulário nativo (WhatsApp Flows)**. Número 21 99907-9031.
- **Jornada NSM medida de verdade (liberada 10/06 pra todos os ministérios).** 3 marcos (Batismo 90d · Next 90d · Reunião aceita) virando KPI por coorte, KRs ligados à fonte, "engajou" materializa vínculo real.
- **Cuidados reformulado (Fases 1·2·3 no ar).** Encontro pastoral + encaminhamento pra valores (Grupos/Voluntários/Jornada 180) com caixa de entrada e devolutiva por área; dashboard; aconselhamento unificado; Jornada 180 como estrutura própria de turmas.
- **Next-Batismo (novo módulo gated).** "Check de pessoas" no funil Next × Batismo × convertido → Membresia (operado pelo Kevyn). Serviço unificado de matching de membros (dedup + acha-ou-cria).
- **Solicitações oficializadas (substituem o Google Form).** Aprovação hierárquica por diretor de origem (transversal), 5 fluxos (reembolso/reserva/compras/pagamento/serviço), Kanban|Lista + filtros, **Estoque na Logística** (260 produtos, FEFO, consumo por área), NF→entrada, cotação antes do financeiro.
- **RH com gráficos e folha histórica.** Dashboard recharts (saúde do quadro + folha por mês via snapshots diários), Admissão como status do colaborador, organograma, fixes de PJ/férias, auth fail-open fechado.
- **Produção de Culto (novo módulo).** KPIs técnicos por culto + cronograma por etapas em mm:ss (Previsto × Executado), espelhando a planilha de cronograma.
- **Monitoramento OKR.** Aba que reproduz a planilha "cabeça do Juninho" (1 NSM → 9 OKRs em 4 blocos), auto-alimentada onde há fonte real.
- **OKR · KRs medidos por KPI.** KR respondido pelo KPI central, sem entrada manual; triagem de remoção dos não-mensuráveis.
- **Agente Executor Financeiro (worker Railway).** 1º agente "ativo" (propõe ações financeiras → fila de aprovação humana).
- **/novosite.** Prévia da home do novo site público (teste de layout isolado).
- **Segurança.** Auditoria multi-agente (29 achados · 4 críticos corrigidos + levas de remediação), **fix de account-takeover** (cadastro público resetava senha de conta existente) e varredura 15/06 + lockdown de RLS (PR #1026).
- **Permissões.** Juninho restrito a 3 telas, role editável na tela de Usuários, cargos de culto sem módulos de admin, acesso "só um módulo" (Produção).

---

## Legenda · status

- 🟢 **Entregue** · em produção
- 🟡 **Em curso** · parcialmente feito
- ⚪ **Pendente** · nada feito ainda
- 🔵 **Planejado** · previsto, não iniciado
- *Horas em itálico* são estimativas

---

## Entregas Intermediárias · 6 módulos macro

| # | Módulo | Progresso | Gasto (acum.) | Restante | Status |
|---|---|---|---|---|---|
| 1 | **Administração** | 90% | 240h | *~115h* | 🟢 Quase pronto |
| 2 | **Inteligência** | 82% | 175h | *~80h* | 🟡 Em curso |
| 3 | **Planejamento** | 65% | 120h | *~105h* | 🟡 Em curso |
| 4 | **Ministerial** | 88% | 215h | *~55h* | 🟢 Quase pronto |
| 5 | **Cultos** | 58% | 65h | *~40h* | 🟡 Em curso |
| 6 | **Criativo** (Marketing) | 85% | 105h | *~30h* | 🟢 Quase pronto |

> No P1 esta tabela era: Adm 75%/160h · Intel 70%/125h · Plan 60%/110h · Min 65%/115h · Cultos 25%/30h · Criativo 5%/0h. O salto do **Criativo (5%→85%)** e do **Cultos (25%→58%)** é onde mais entrou trabalho no Período 2.

---

## 1. Administração

**240h gastas · ~115h restantes · 90% concluído** *(P1: 160h/75%)*

Gestão (RH, Financeiro, Logística, Hospitalidade, Patrimônio, TI) + Solicitações + Permissões.

### Período 2 · novidades
- **Solicitações oficializadas (substituem o Google Form):** aprovação hierárquica por diretor de origem (transversal a todas as áreas), **5 fluxos** (reembolso · reserva de espaço · compras · pagamento · serviço/manutenção), histórico/linha do tempo, "Relatar Problema", SLA pausável, **Kanban | Lista + filtros** + caixa por área, **cotação antes do financeiro** (compras → logística cota → Yago aprova sobre o cotado).
- **Estoque (na Logística):** saldo derivado, validade FEFO, consumo por área, 260 produtos importados do SharePoint, atender-pela-estoque, gerar-compra do "a repor", NF escaneada → entradas (loop compra↔estoque fechado).
- **RH com gráficos:** dashboard recharts (saúde do quadro + folha salarial por mês via snapshots diários), Admissão virou status `em_admissao` com contrato na ficha, organograma como botão em Colaboradores, fixes de PJ/férias (avisa RH no retorno), aba Acessos virou coluna no Diretório, **auth fail-open fechado**.
- **Permissões:** Juninho (presidente) restrito a 3 telas, **role editável na tela de Usuários** (sem SQL), cargos de culto sem módulos de admin, padrão "acesso só a UM módulo" (Produção · André e Gabriel).
- **Patrimônio:** correção do pool-pg (não conectava no Vercel serverless).

### 1.1 RH — 60h gastas · *~35h restantes* · 🟢 Quase pronto (Marcos · Matheus)
Dashboard (recharts) · PCS · Cargos · Salários · Colaboradores · Organograma · Folha (snapshots) · Admissão · Férias/Licenças.
- Avaliações 360 (FIDS) · *~20h* · ⚪ Pendente
- Treinamentos · *~15h* · ⚪ Pendente
- Projeto "cargos RH × permissões" com a Juliana (unir estrutura de cargos + expectativas + PDI à matriz) · *retomar* · 🔵 Planejado

### 1.2 Financeiro — 22h gastas · *~80h restantes* · 🟡 Em curso (Matheus)
Lançamentos · Reembolsos · **Agente Executor Financeiro** (worker Railway · propõe → fila de aprovação).
- Integração API Santander (banco principal) · *~60h* · ⚪ Pendente (apoio dev Santander)
- Regra contábil travada: **empréstimo não é receita ordinária** (cashflow de financiamento).

### 1.3 Logística & Compras — 45h gastas · *~15h restantes* · 🟢 Quase pronto (Matheus · Marcos)
Fornecedores · Pedidos · Mercado Livre + rastreio · **Estoque (FEFO, 260 produtos)** · NF→entrada · cotação.
- WhatsApp acionar-fornecedor (`wa.me` → auto quando app Meta for Live) · *~10h* · 🔵 Adiado pelo Marcos
- Notas fiscais não-ML (API genérica) · *~12h* · ⚪ Pendente

### 1.4 Patrimônio — 18h gastas · *~5h restantes* · 🟢 Entregue (Marcos)
Bens · QR codes · Movimentações. Fix de pool-pg no `/dashboard`.

### 1.5 Hospitalidade — 14h gastas · *~12h restantes* · 🟡 Em curso (Marcos · Matheus)
Reserva de espaço · Cozinha · Manutenção (via Solicitações).
- **Projeto módulo Hospitalidade** (Manutenção + Reserva, dono Amaury): manutenção = triagem interno/externo (externo reusa a cotação) · *~15h* · 🔵 Planejado (depois de fechar a cotação).

### 1.6 TI — 5h gastas · *0h* · 🟢 Entregue (Marcos)

### 1.7 Solicitações — 55h gastas · *~10h restantes* · 🟢 Entregue (Marcos · Matheus)
Coração dos KPIs ADM. Aprovação hierárquica (Spec 001) · 5 fluxos · SLA · NPS interno · Kanban|Lista + filtros + caixa por área · cotação.
- Calendário visual de reservas (conflitos) · *~10h* · ⚪ Pendente
- Offboarding (revogar acesso) · 🔵 Adiado (trazer desenho antes · flag no `authenticate`)

### 1.8 Permissões — 36h gastas · *~12h restantes* · 🟢 Quase pronto (Marcos)
Matriz cargo×módulo · Usuários · Overrides · Boost por área · role editável na UI · menu/⌘K espelha rotas (fix de itens fantasma).
- Migrar ModuleGuard pra slugs (limpeza) · *~10h* · ⚪ Pendente

---

## 2. Inteligência

**175h gastas · ~80h restantes · 82% concluído** *(P1: 125h/70%)*

Painel CBRio · ~150 KPIs · Dashboard semanal · NPS · Minha Área · Dados Brutos · Assistente IA · OKR.

### Período 2 · novidades
- **Monitoramento OKR** (`/monitoramento-okr`): reproduz a planilha "cabeça do Juninho" (1 NSM → 9 OKRs em 4 blocos · ~25 indicadores), auto-alimentada onde há fonte real, com gráfico mensal por tático. Fix do pool-pg → RPC.
- **OKR · KRs medidos por KPI** (Frente B): KR respondido pelo KPI central, sem entrada manual; cascata geral agrega dos filhos medidos; triagem de remoção de 201 KRs não-mensuráveis (reversível).
- **Agente Executor Financeiro** (worker Railway · Claude Agent SDK): 1º agente ativo do sistema, propõe ações → humano aprova → handler aplica.
- **Engajamento de Conteúdo** (estrutura pronta no Online · YouTube Analytics).

### 2.1 Painel CBRio — 40h gastas · *~15h restantes* · 🟢 Entregue (Marcos · Matheus)
NSM · Mandalas · Matriz 6×5 · Alertas · Drill-down de KPI/pessoas · carrossel de tendências.

### 2.2 Dashboard Semanal — 22h gastas · *~12h restantes* · 🟡 Em curso (Matheus)
Substitui Power BI · indicadores + metas + gráficos. Default "semana atual" (#1071).

### 2.3 Minha Área — 12h gastas · *~6h restantes* · 🟢 Entregue (Marcos)

### 2.4 Dados Brutos — 18h gastas · *~6h restantes* · 🟢 Entregue (Marcos)

### 2.5 NPS — 16h gastas · *~40h restantes* · 🟡 Em curso (Matheus)
Aguarda módulo NPS rodar pesquisa (avaliação de voluntários, institucional, telão pós-culto).

### 2.6 Gestão (PMO) — 18h gastas · *~12h restantes* · 🟡 Em curso (Marcos)
Estrutura OKR · saúde do sistema · OKR medido por KPI.

### 2.7 Assistente IA / Cérebro CBRio — 14h gastas · *~8h restantes* · 🟡 Em curso (Matheus)
Chat IA · Cérebro SharePoint→Obsidian · agentes de auditoria. `/status` e webhook ganharam auth na leva de segurança.

---

## 3. Planejamento

**120h gastas · ~105h restantes · 65% concluído** *(P1: 110h/60%)*

Eventos · Projetos · Expansão · Planejamento Anual · Governança · Ritual · Revisão Estratégica.

### Período 2 · novidades
- **Eventos × Marketing:** ciclo criativo do evento aparece no Kanban do Marketing por fase (épicos), com padrões por fase (etiqueta+dono+esforço automáticos).
- Fix de pool-pg em `/views` e `/workload` (Projetos).

### 3.1 Eventos — 38h gastas · *~28h restantes* · 🟡 Em curso (Marcos)
Ciclo criativo · Fases · Tarefas · Documentos · KPIs por evento · integração com Marketing.

### 3.2 Projetos — 26h gastas · *~14h restantes* · 🟢 Entregue (Marcos · Matheus)

### 3.3 Expansão — 15h gastas · *~30h restantes* · 🟡 Em curso (Marcos)

### 3.4 Planejamento Anual — 12h gastas · *~10h restantes* · 🟡 Em curso (Marcos)

### 3.5 Governança — 10h gastas · *~8h restantes* · 🟡 Em curso (Marcos)

### 3.6 Ritual — 8h gastas · *~15h restantes* · 🟡 Em curso (Marcos)

### 3.7 Revisão Estratégica — 5h gastas · *0h* · 🟢 Entregue (Marcos)

### 3.8 Processos / OKR estratégico — 0h · ⚪ Descontinuado (decisão de 18/05 · `/processos` → `/eventos`)

---

## 4. Ministerial · preenchimento por valor da Jornada

**215h gastas · ~55h restantes · 88% concluído** *(P1: 115h/65%)*

Cadastro e jornada dos membros nos 5 valores (Seguir, Conectar, Investir, Servir, Generosidade).

### Período 2 · novidades
- **Jornada NSM medida de verdade (liberada 10/06 pra todos os ministérios · fim do piloto só-Integração):** 3 marcos (Batismo 90d · Next 90d · Reunião aceita) viram KPI por coorte; numerador real; "engajou" materializa vínculo; ponte do valor Servir; KPIs nativos.
- **Cuidados reformulado (Fases 1·2·3 no ar):** dashboard do pastor · encontro pastoral (data/hora/quem/compareceu) · encaminhamento pros valores (Grupos/Voluntários/Jornada 180) com caixa de entrada + devolutiva por área · aconselhamento unificado · "Próximos passos" (Convertidos+Primeiros passos fundidos) · Jornada 180 como estrutura própria de turmas.
- **Jornada do novo convertido (90 dias por área):** Contato ≤3d · Batismo ≤90d · Next ≤90d, com responsabilidade seguindo a área de culto + escalação (Marcelo Soares supervisiona de Cuidados).
- **Next-Batismo (novo módulo gated):** "check de pessoas" no funil Next × Batismo × convertido → Membresia (Kevyn opera). Serviço unificado de matching (`membroMatch`). Fases 0·1·2 no ar; grupo/servir do Next convergem pra `jornada_encaminhamentos`.
- **Bot WhatsApp:** coleta passiva → IA Haiku 2 personas → formulário nativo (WhatsApp Flows). (publish bloqueado por integridade da Meta enquanto o app não vai Live.)
- **Grupos:** aba Relatórios de KPIs, aba Encaminhados, líder em treinamento, supervisão (visitas/observações).
- **Integração:** % de ocupação de assentos na aba Frequência.
- **Batismos:** tempo de conversão até o batismo (por pessoa + média).
- **Totem Kids:** ver módulo Cultos/operacional abaixo (ferramenta do ministério infantil).

### 4.1 Integração — 35h gastas · *~6h restantes* · 🟢 Entregue (Marcos)
Cultos · Frequência · Decisões (presencial/online/Kids) · Batismos · Histórico · ocupação de assentos. Onboarding da Lorena concluído.

### 4.2 Membresia — 28h gastas · *~6h restantes* · 🟢 Entregue (Matheus · Marcos)
Cadastros · Trilha 5 valores · Jornada 180 · Duplicados · **Merge dinâmico** (`merge_membros` v2) · serviço `membroMatch` unificado.

### 4.3 Cuidados — 30h gastas · *~6h restantes* · 🟢 Entregue (Marcos · Matheus)
Reformulação completa (Fases 1·2·3) · encontro pastoral · encaminhamento + devolutiva · Jornada 180 turmas.

### 4.4 NEXT — 16h gastas · *~8h restantes* · 🟡 Em curso (Matheus)
Porta de entrada · inscrições · check-in · indicações · integra com Next-Batismo.

### 4.5 Voluntariado — 20h gastas · *~6h restantes* · 🟢 Entregue (Matheus · Marcos)
Check-in · Escalas · QR · Self-service · recebe encaminhamentos de Cuidados/Next.

### 4.6 Grupos — 22h gastas · *~8h restantes* · 🟢 Quase pronto (Matheus)
Grupos · supervisão · QR · mapa · materiais · Relatórios de KPIs · Encaminhados · pessoas/visitas.

### 4.7 Devocional — 18h gastas · *~22h restantes* · 🟡 Em curso (Matheus)
Planos · API.Bible · Haiku gera reflexão · check-in. Chave API.Bible rotacionada + movida pra env (segurança).
- Envio WhatsApp diário · *~12h* · 🟡 aguarda app Meta Live
- Trilha personalizada (múltiplos planos) · *~10h* · ⚪ Pendente

### 4.8 Notificações — 10h gastas · *~5h restantes* · 🟢 Entregue (Matheus)

---

## 5. Cultos · visualização + operação por culto

**65h gastas · ~40h restantes · 58% concluído** *(P1: 30h/25%)*

Drill-down read-only por tipo de culto + operação de Produção e Kids.

### Período 2 · novidades
- **Produção de Culto (novo módulo):** KPIs técnicos por culto (pontualidade, checklist, ocorrências) + **cronograma por etapas em mm:ss** (Previsto × Executado, soma = tempo do culto), espelhando a planilha "Cronograma Culto". Roteiro padrão 60:00 + 3:00 pós-culto.
- **Totem Kids (substituto do Planning Center):** check-in/checkout com etiqueta de segurança de 4 chars, painel ao vivo, salas, TVs de chamada de pickup (Fire TV), **integração com pagers físicos** (LRS Freedom · agente local). 660 famílias + 894 crianças importadas.
- **Online:** estrutura de Engajamento de Conteúdo (retenção/share/CTR) pronta pra YouTube Analytics.
- Rotas dos cultos saíram de `/ministerial/*` pra raiz (`/ami`, `/bridge`, `/online`, `/kids`).

### 5.1 Online (YouTube) — 27h gastas · *~12h restantes* · 🟢 Entregue (Matheus)
Canal · séries · vídeos · OAuth Analytics · DS/DDUS auto · pico live · engajamento (estrutura).

### 5.2 Produção de Culto — 18h gastas · *~8h restantes* · 🟢 Quase pronto (Marcos)
6 sub-abas (Preenchimento, Acumulado, Detalhado, Checklists, Solicitações, Desempenho) + cronograma por etapas. André + Gabriel com acesso "só Produção".

### 5.3 Totem Kids — 14h gastas · *~10h restantes* · 🟡 Em curso (Marcos)
App 100% funcional · aguarda hardware (Fire TVs) + setup Brother + culto piloto.

### 5.4 CBKids / AMI / Bridge (painéis read-only) — 6h gastas · *~10h restantes* · 🟡 Em curso (Marcos)
Páginas prontas · popular KPIs específicos + definir líderes.

### 5.5 Sede / CBA — Descartado (representados nos indicadores totais)

---

## 6. Criativo · Marketing

**105h gastas · ~30h restantes · 85% concluído** *(P1: 0h/5% — era o único módulo intocado)*

**A maior virada do Período 2.** O módulo saiu de "pendente" para "quase pronto" — construído em ~25 specs + redesenho em 6 fases + consolidação em 4 abas, mais o /novosite.

| Etapa | Horas | Status |
|---|---|---|
| **Fundação** (schema · 7 tabelas · RLS · seed equipe · matriz/boost) | 14h | 🟢 Entregue |
| **Intake por dor** (solicitante pede por dor, não por entregável) | 6h | 🟢 Entregue |
| **Triagem + Campanhas** (Pedro decide solução, cria entregáveis) | 12h | 🟢 Entregue |
| **Kanban (6 colunas, Trello-like)** + filtros + realtime | 14h | 🟢 Entregue |
| **Planner de capacidade** (slots/dia, Gantt arrastável, dias úteis) | 12h | 🟢 Entregue |
| **Épicos de evento** (ciclo criativo do /eventos por fase) | 8h | 🟢 Entregue |
| **Checklists + referências + upload SharePoint (Graph)** | 8h | 🟢 Entregue |
| **4 KPIs próprios** (prazo, lead time, throughput, demanda/capacidade) | 6h | 🟢 Entregue |
| **Analytics + Admin** (membros, etiquetas, recorrentes, overrides) | 10h | 🟢 Entregue |
| **Aprovação da campanha + revisão (1×) + NPS** | 6h | 🟢 Entregue |
| **/novosite** (prévia da home do site público · teste de layout) | 9h | 🟢 Entregue |
| Maturação dos KPIs (precisa ~1 sem de histórico real) | *~10h* | 🟡 Em curso |
| Discovery final com Pepe Menezes (refinamentos) | *~10h* | 🔵 Planejado |
| Subáreas (Produção, Adoração, Online) · estrutura nos cargos | *~10h* | 🟡 Estrutura pronta |

> Decisões-chave do redesenho (Pedro Paiva + Marcos): solicitante pede por **dor** → diretor aprova → cai na **Triagem** do Pedro → ele cria a campanha com N entregáveis (dono + duração + 2 prazos) → **planner por slots/dia** (não horas) → produção → revisão → entrega. "Kanban melhor que o Trello."

---

## Onboarding · entregas previstas (horas extras · não bloqueia dev)

Cada módulo entregue a uma pessoa-chave demanda **~2h/dia × 14 dias = 28h** de acompanhamento de 1 dev, em horas extras. **Não impede o desenvolvimento de outros módulos no período.** No Período 2 vários começaram (e novas pessoas entraram no sistema).

| # | Pessoa | Módulo | Horas | Dev | Status |
|---|---|---|---|---|---|
| 1 | Lorena Andrade | Integração | 28h | Marcos | 🟢 Concluído |
| 2 | Juliana Leão | RH | 28h | Marcos | 🟡 Em curso |
| 3 | Yago Torres | Financeiro | 28h | Matheus | 🔵 Planejado |
| 4 | Amaury | Compras / Logística / Estoque | 28h | Matheus | 🟡 Em curso |
| 5 | Erivelton | Patrimônio | 28h | Marcos | 🔵 Planejado |
| 6 | Diego Assis | TI / Solicitações | 28h | Marcos | 🔵 Planejado |
| 7 | Jéssica Salviano | Hospitalidade (cozinha/manutenção) | 28h | Marcos | 🔵 Planejado |
| 8 | Arthur Serpa | Painel CBRio + Ritual | 28h | Marcos | 🔵 Planejado |
| 9 | Eduardo Gnisci | Gestão (PMO) | 28h | Marcos | 🔵 Planejado |
| 10 | Pedro Paiva | Eventos · Marketing | 28h | Marcos | 🟡 Em curso |
| 11 | Pepe Menezes | Criativo | 28h | Matheus | 🔵 Planejado |
| 12 | Pedro Fernandes | Produção | 28h | Matheus | 🟡 Em curso |
| 13 | Renata Martins | Online | 28h | Matheus | 🔵 Planejado |
| 14 | Nélio + Natasha | Grupos | 28h | Matheus | 🟡 Em curso |
| 15 | Marcelo Soares | Cuidados / Supervisão jornada | 28h | Marcos | 🟡 Em curso |
| 16 | Kevyn | Next-Batismo | 28h | Marcos | 🟡 Em curso |
| 17 | André + Gabriel | Produção (acesso só Produção) | 28h | Marcos | 🟡 Em curso |
| 18 | Matheus + Marcelo | Membresia (piloto) | 28h | Matheus | 🟡 Em curso |
| | | **TOTAL (≈)** | **~360h restantes** | | de ~500h previstas |

---

## Apêndices · requisitos cross

### A. Segurança da Informação & LGPD

Frente que ganhou peso no Período 2:

- **Auditoria de segurança ampla (workflow multi-agente):** 29 achados confirmados (4 críticos · 13 altos · 8 médios · 4 baixos). Os **4 críticos** foram corrigidos (escalonamento de privilégio em `usuarios`, PII em timeline pastoral, hard-delete sem authorize, overload de função financeira) + **5 levas de remediação** (injeção PostgREST, soft-deletes seguros, guarda na cascata de meta, pool-pg → REST, auth em endpoints do Cérebro).
- **Account-takeover corrigido (PR #1021):** o cadastro público resetava a senha de uma conta existente (qualquer um, sabendo só o e-mail). 1º acesso virou obrigatório; `seed.js` removido; regra: rota pública nunca seta senha.
- **Varredura 15/06 + lockdown (PR #1026):** tabelas `vol_*` estavam abertas a `anon` (pior caso) → fechadas, + `mem_cadastros`, `rh_avaliacao_fatores`, Cérebro e operacionais.
- **RLS** em todas as tabelas críticas · **permissões granulares** (cargo × módulo + override + expiração) · **modificador `+E`** controla exportação de PII (CPF/telefone/financeiro) · **dados de menores (Kids)** com fluxo separado da Jornada · **audit log** em 8 tabelas sensíveis · segredos só em env do Vercel (chave API.Bible rotacionada).
- **Pendente:** revisão LGPD formal antes do go-live geral (*~16h*); fallbacks `MEM_QR_SALT`/Cérebro; soft-deletes agregados.

### B. Manutenção prevista pós go-live

- **1 mês de avaliação Painel + Dashboard semanal:** garantir que os ~150 KPIs são preenchidos e calculados certo.
- **Bugs de produção:** ~4h/semana de cada dev nos primeiros 2 meses.
- **Migração de schema:** `responsible`/`leader` (texto → UUID); soft-deletes agregados (cultos/decisões/encontros).
- **Escala:** particionamento de tabelas grandes (10k+ membros) · read replica (25k+ pessoas).

### C. Custos · horas brutas de desenvolvimento

| Período | Marcos | Matheus | Total | Comentário |
|---|---|---|---|---|
| **Regulares P1** (28d × 8h) | 224h | 224h | **448h** | 10/04 → 20/05 |
| **Extras P1** (Matheus 4h/dia) | 0h | 112h | **112h** | só Matheus · noite/madrugada |
| **Subtotal P1** | **224h** | **336h** | **560h** | ~830 commits · 238 migrations |
| **Regulares P2** (18d × 8h) | 144h | 144h | **288h** | 20/05 → 16/06 |
| **Extras P2** (Matheus 4h/dia) | 0h | 72h | **72h** | só Matheus |
| **Subtotal P2** | **144h** | **216h** | **360h** | 605 commits + 355 PRs · ~200 migrations |
| **GASTO acumulado** | **368h** | **552h** | **920h** | 46 dias úteis |
| **Estimado restante** (dev) | *~190h* | *~235h* | ***~425h*** | pendências de cada módulo |
| **Onboarding** (extras) | *~180h* | *~180h* | ***~360h*** | 15+ pessoas × 28h |
| **TOTAL projetado** | **~738h** | **~967h** | **~1.705h** | Marcos + Matheus combinados |

> O total projetado subiu de ~1.580h (P1) para ~1.705h mesmo com 360h entregues, porque o **escopo cresceu além do previsto**: o Marketing inteiro, o Totem Kids, o Bot WhatsApp, o módulo Next-Batismo e a blindagem de segurança não estavam dimensionados no relatório de 20/05. As **horas restantes de dev caíram** (de ~600h para ~425h).

### D. Stack técnica

- **Frontend:** React 18 + Vite + TypeScript/JSX + shadcn/ui + Tailwind + react-router
- **Backend:** Express.js · Vercel serverless (`api/index.js`) + **worker Railway** (Agente Executor Financeiro · Claude Agent SDK)
- **Banco:** Supabase (PostgreSQL + Auth + RLS) · **439 migrations** versionadas
- **Integrações:** YouTube Data + Analytics (OAuth), Mercado Livre, Microsoft Graph (SharePoint/Cérebro), Anthropic Claude (Haiku/Opus), **WhatsApp Cloud API + Flows**, LRS Freedom (pagers Kids), API.Bible (devocional)
- **Cron:** Vercel cron (diários) + GitHub Actions (sub-diários · ex: live monitor YouTube 5min)
- **Ferramenta de dev:** Claude Code (autonomia de deploy: branch → PR → CI Vercel → merge → produção) — adotado pelos dois devs no Período 2.

---

*Gerado em 2026-06-16 · base: `git log` de origin/main · acumulado ~1.460 commits de conteúdo + ~1.070 PRs · 439 migrations · Período 2 (20/05→16/06): 605 commits + 355 PRs, ~200 migrations, +163k linhas (líquido +135k).*

*Sistema CBRio · documento solicitado por Eduardo Gnisci (Diretor Geral) · v2 estende o relatório de 20/05/2026.*
