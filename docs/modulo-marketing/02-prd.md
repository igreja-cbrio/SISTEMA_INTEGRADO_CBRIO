# Módulo Marketing — PRD (Product Requirements Document)

> **Status:** v1.0 · 2026-05-28
> **Pré-requisito:** decisões fechadas em `decisoes-em-aberto.md` · arquitetura em `arquitetura-emergente.md`
> **Próxima fase:** Fase 4 — Design e UX (`03-design-ux.md`)

---

## 1. Resumo executivo

### 1.1 Em uma frase
Sistema interno de gestão de demandas criativas com prazo baseado em capacidade real
da equipe de Marketing/Criativo da CBRio.

### 1.2 Em um parágrafo
O módulo Marketing organiza, prioriza e mede as demandas criativas (artes, design,
conteúdo, identidade visual, fotos, vídeos) produzidas pela equipe (Pedro Paiva ·
Allan · Aline · Cauã · Lorena Pariz · Letícia). É **uma camada de capacidade +
analytics** em cima do backbone existente de Solicitações — que ganha **aprovação
hierárquica pelo diretor de origem** como pré-requisito transversal —, integra com
o ciclo criativo de Eventos, e permite **tasks internas geradas pelo coordenador
(Pedro)**. O prazo é calculado a partir da capacidade semanal real (não fixo), o
Kanban consolida 3 origens (solicitação · evento · interna), e o analytics responde
objetivamente *"excesso de demanda ou ineficiência?"*.

### 1.3 Princípios não-negociáveis

1. **Tempo é medido pelos timestamps do Kanban**, nunca por apontamento manual.
2. **Prazo nasce do cálculo de capacidade**, nunca fixo. Pedro confirma no MVP.
3. **Solicitante NÃO entra no módulo Marketing** — acompanha pela aba de Solicitações que já existe.
4. **Apenas funcionários solicitam** (vínculo `rh_funcionarios` ativo). Membros não solicitam.
5. **Aprovação hierárquica obrigatória** (diretor de origem) — exceto 3 diretores + 2 pastores seniores.
6. **Revisão é exceção, não regra** — máximo 1 por solicitação, vai pro fim da fila.
7. **Arquivos entregues vivem no SharePoint**, banco só guarda referência.
8. **Tudo metrificado alimenta OKR de marketing** (Marcos 2026-05-28).

---

## 2. Personas e jobs

### 2.1 Pedro Paiva · Coordenador
**JTBD:** *"Quando a fila enche, quero ver onde cada um está e quanto espaço sobra,
pra alocar e responder prazo realista sem perder ninguém da equipe na sobrecarga."*
**Pain:** pedidos por WhatsApp/corredor · zero visão consolidada · não consegue
defender prazo real pro solicitante · sem dado pra mostrar pra diretoria.

### 2.2 Produtores (Allan · Aline · Cauã · Lorena Pariz · Letícia)
**JTBD:** *"Quando começo a semana, quero ver só o que tenho que entregar nessa
semana, sem me preocupar com a fila inteira."*
**Pain:** demandas chegam por canais diferentes · prioridade obscura · retrabalho
por briefing ruim.

### 2.3 Líder de área solicitante (Mariane · Arthur Cecconi · Lillian · Renata · pastores)
**JTBD:** *"Quando preciso de uma arte, quero saber até quando fica pronta e onde
está meu pedido, sem precisar perguntar."*
**Pain:** pede sem saber se vai dar tempo · sem visibilidade do status · frustração.

### 2.4 Diretor de origem (Eduardo · Pedro Menezes · Arthur Serpa)
**JTBD:** *"Aprovo pedidos do meu setor com contexto suficiente pra decidir rápido."*
**Risco específico do Arthur:** 80% das demandas vêm das áreas de culto → potencial
gargalo nele (monitorar via analytics de tempo médio de aprovação).

### 2.5 Anti-persona · Membro comum
**Não é cliente.** Sem `rh_funcionarios` ativo não solicita. Marcos 2026-05-28:
*"membros não fazem solicitações"*.

---

## 3. Features — MVP

### 3.1 Must-have

| # | Feature | Hipótese | Métrica de sucesso |
|---|---|---|---|
| **F-01** | Aprovação hierárquica no Solicitações (TRANSVERSAL) | Liderança precisa controlar o que entra na fila | 100% das novas solicitações passam por aprovação ou dispensa válida |
| **F-02** | Equipe modelada (`marketing_membros` + habilidades) | Atribuição por habilidade reduz tempo de roteamento | 5 perfis vinculados antes do go-live |
| **F-03** | Etiquetas duplas (tipo × destino) | Classificação dupla melhora analytics e roteamento | ≥ 90% dos cards com ambas etiquetas |
| **F-04** | Kanban unificado com 3 origens | Capacidade real só faz sentido contando tudo | 100% das demandas no Kanban |
| **F-05** | Estimativa preliminar de prazo no intake | Expectativa real desde o primeiro segundo | Estimativa vs confirmado: erro mediano ≤ 30% |
| **F-06** | Calendário de capacidade (líder e colaborador) | Visualização > planilha | Pedro abre ≥ 3×/semana |
| **F-07** | Estado "aguardando solicitante" | Separa relógio equipe × solicitante | Tempo médio explícito nos KPIs |
| **F-08** | Sugestão de revisão (1x · fim da fila) | Preserva cultura "pediu→entregou" | < 20% das demandas viram revisão |
| **F-09** | Anexo de entregáveis (SharePoint via Graph) | Arquivos onde já moram no CBRio | Upload bem-sucedido > 95% |
| **F-10** | Compromissos recorrentes (Aline dom · Allan qua · Lorena diário) | Consumir capacidade antes de demanda nova | Recorrentes aparecem no calendário no go-live |
| **F-11** | Urgência com aceite/recusa do Pedro | Urgência só vale se Pedro acolher | Motivo registrado em 100% das recusas |
| **F-12** | Admin do módulo (CRUD membros/etiquetas/recorrentes/overrides) | Pedro ajusta sem migration | Pedro edita recorrentes sem ajuda do dev |
| **F-13** | KPIs auto-coletados (`MKT-*` + alimenta `ADM-C-*`) | Dado real destrava conversa demanda × capacidade | 4 KPIs novos calculando após semana 2 |
| **F-14** | Notificações integradas (10 eventos) | Mantém todo mundo informado sem perguntar | 0 reclamações de "não soube" em retro 90d |

### 3.2 Nice-to-have (no MVP, se sobrar tempo)
- Sugestão automática de habilidade alvo no intake (baseada em etiqueta tipo).
- Drag-and-drop de cards entre dias no calendário.
- Templates de briefing por etiqueta.

### 3.3 Explicitamente EXCLUÍDAS do MVP

- **Forecasting automático de prazo (D-08)** — humano-no-loop sempre. Revisita Fase 11.
- **Modo pico fev/mai** — analytics conhece, tratamento especial não.
- **Apontamento manual de horas pelos produtores** — derivar do Kanban basta.
- **Escalação automática se diretor demora >24h** — monitora, não automatiza ainda.
- **App mobile nativo** — web responsivo é suficiente.
- **Notificação push externa (WhatsApp/SMS)** — só in-app.
- **Chat dentro do card** — comentários ficam no Solicitações (origem da demanda).
- **Dashboard de "urgência frequente"** — já está pendente no Solicitações, aproveitar quando for feito.

---

## 4. Roadmap pós-MVP

### 4.1 v1.1 (3 meses após MVP)
- Forecasting automático (D-08) se gatilho de 8 semanas + CV ≤ 30% atingido.
- Modo pico fev/mai com capacidade extra reservada.
- Templates de briefing por etiqueta.
- Drag-and-drop no calendário.

### 4.2 v1.2+ (6-12 meses)
- Escalação automática se aprovação parar.
- Sugestão de auto-atribuição por histórico de habilidade × etiqueta.

### 4.3 Não vai entrar
- Time-tracking manual por produtor.
- Marketing como módulo standalone fora do Solicitações.

---

## 5. Priorização (RICE + MoSCoW)

A ordem efetiva é definida por **dependência técnica** (Fase 8), não só score:

- **Must** — todas F-01 a F-14 entram no MVP.
- **Should** — Nice-to-have (§3.2) entram se sobrar tempo.
- **Could** — v1.1 do roadmap.
- **Won't** — §4.3.

---

## 6. Requisitos não-funcionais

| Categoria | Requisito |
|---|---|
| Performance | Calendário < 500ms p95 · submit < 1s · volume 5-10/sem é baixo |
| Segurança | LGPD-lite (fotos) · RLS contextual · Auth herdada Supabase |
| Acessibilidade | WCAG AA herdado · keyboard-navegável (Kanban e calendário) |
| i18n | PT-BR apenas |
| Dispositivos | Desktop primeiro · mobile responsivo |
| Resiliência | Upload com retry exponencial · soft-delete |

---

## 7. Métricas de sucesso

### 7.1 Lançamento (30 dias)
- 100% das demandas novas via módulo (zero WhatsApp/corredor).
- Pedro adotou o Kanban (≥ 80% dos cards mudam de estado).
- 0 incidentes de RLS.

### 7.2 Validação de MVP (90 dias)
- `MKT-PRAZO` ≥ 80% (% no prazo).
- `MKT-LEAD` ≤ 7 dias mediano.
- Cycle time consistente em ≥ 80% dos cards.
- `ADM-C-NPS` começa a ter dado.

### 7.3 KPIs no OKR
- Alimenta 4 KPIs `MKT-*` novos + 6 `ADM-C-*` existentes.

---

## 8. Riscos e dependências

### 8.1 Dependências externas
- **Microsoft Graph (SharePoint)** — fallback: retry exponencial + degradação graciosa.
- `notificacaoGenerator.js` — interno, baixo risco.

### 8.2 Riscos de produto
- **Gargalo no Arthur Serpa** — 80% das demandas passam por ele.
- **Resistência à aprovação hierárquica** — usuários acostumados a pedir direto.
- **Estimativa preliminar errada gerando frustração** quando Pedro reduz no confirmado.

### 8.3 Riscos técnicos
- Mudança transversal no Solicitações (spec 001) pode quebrar fluxo existente — testes obrigatórios.
- Etiquetas duplas podem virar complexidade combinatorial na UI — simplificar.

---

## 9. Glossário

| Termo | Definição |
|---|---|
| Card | Unidade de trabalho no Kanban. Linkado a solicitação, task de evento ou criado direto pelo Pedro. |
| Etiqueta tipo | Categoria do entregável (Artes · Vídeos · Fotos · etc · 8 valores). |
| Etiqueta destino | Contexto (Interno · Externo · Institucional · etc · 5 valores). |
| Habilidade | Atributo do produtor (videomaker · fotografo · designer · social_media · social_media_assistente). |
| Compromisso recorrente | Slot fixo de capacidade consumido toda semana. |
| Diretor de origem | Diretor do setor do solicitante (Eduardo · Pedro Menezes · Arthur Serpa). |
| Raia rápida | Fila priorizada pra urgências aceitas pelo Pedro. |
| Aguardando solicitante | Estado onde o relógio da equipe para porque a bola está com o solicitante. |
| Spec transversal | Spec que mexe em backbone compartilhado (Solicitações). |
| Cycle time | Tempo entre `em_producao` (start) e `entregue_em`. |

---

## 10. Validação

- [x] Personas refletem realidade conversada com Marcos (2026-05-28)
- [x] Features MVP < 15 (são 14 must-have)
- [x] Features excluídas explícitas
- [x] Priorização justificada
- [x] Métricas mensuráveis
- [x] Riscos identificados
- [x] Glossário completo
- [ ] Aprovado pra Fase 4

Marcos aprova esta versão em: ___ (data)
