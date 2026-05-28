# Módulo Marketing — Método de desenvolvimento (spec-driven adaptado)

> **Contexto criado em 2026-05-27.** Marcos vai construir o módulo de Marketing
> (gestão de demandas criativas + medição de capacidade/prazo) usando spec-driven.
> Este documento define **como** vamos rodar o processo — a adaptação do framework
> `framework-desenvolvimento-spec-driven.md` (que é calibrado pra SaaS comercial
> greenfield) pra realidade de **"módulo novo dentro de um ERP que já existe"**.
> Líder da área: **Pedro Paiva** (`coordenador-marketing`, área Marketing).

---

## 1. O problema que o módulo resolve

A equipe de Marketing/Criativo recebe **mais demanda do que consegue produzir**
(artes, design, conteúdo, identidade visual de séries e da marca, fotos de culto,
vídeos temáticos). Resultado: áreas da igreja frustradas (não recebem no prazo que
precisam) e equipe frustrada (não entrega no prazo).

A ideia do módulo:

- **Prazo baseado em capacidade**, não fixo: o sistema lê as horas semanais de quem
  vai produzir e devolve um prazo realista dado a fila atual.
- **Kanban + calendário** pro líder (Pedro) ver o que cada um faz na semana e os
  espaços vazios; pro colaborador, o mesmo calendário filtrado só com as demandas dele.
- **Analytics demanda × capacidade** pra responder objetivamente: é excesso de
  demanda ou ineficiência no uso do tempo? E melhorar o feedback aos solicitantes.

---

## 2. Por que adaptar o framework (e não rodar literal)

O framework foi feito pra **produto comercial greenfield**: validação de mercado
(TAM/SAM/SOM), pricing/unit economics (LTV/CAC), Stripe/MEI, churn/MRR, Product Hunt,
política de privacidade pública. O módulo de Marketing é **interno**, num ERP que já
existe. Cerca de **40% do framework não se aplica**. Rodar ele literalmente seria
fazer cerimônia que não produz nada — o oposto do princípio "pular fase por preguiça
é caro": aqui o erro é fazer fase que não agrega.

A disciplina central do framework **continua valendo** e é o motivo de usar SDD:
> documento aprovado antes da próxima fase + decompor em specs pequenas que o
> Claude Code executa uma por vez, com revisão humana entre cada.

---

## 3. O 6º perfil — "módulo interno em ERP existente"

O Apêndice B do framework lista perfis (pessoal, comercial pequeno/sério, enterprise,
cliente terceiro) mas **não tem o nosso**. O mais próximo ("projeto pessoal: pular
0/1/2/7") corta errado — porque a gente **precisa** de um discovery enxuto (1) e
**não pode** pular modelagem de dados (6) nem autorização (7). Regra do 6º perfil:

| Princípio | Aplicação |
|---|---|
| Arquitetura é herdada | Stack já decidida (React+Express+Supabase). Fase 5 vira só ADRs do módulo |
| Sem aparato comercial | Cortar Fases 0/2 (validação de mercado, pricing, unit economics, fiscal) |
| Discovery vira interno | Fase 1 = entrevistar Pedro + equipe + solicitantes, não estranhos |
| Dados e autz continuam críticos | Fases 6 e 7 são onde mora o risco — não pular |
| Integração > greenfield | Modelo tem que casar com tabelas e módulos que já existem |

---

## 4. Realidade do CBRio que muda o jogo (ler antes do PRD)

Levantamento no repo em 2026-05-27. **Isto reposiciona o projeto:**

- **Solicitações JÁ EXISTE** (não é futuro). Backbone administrativo da migration
  `20260512130000_solicitacoes_backbone_reset.sql`: SLA por área, kanban com status,
  NPS pós-conclusão, audit log, alçadas financeiras. **Porém** o enum `area_adm_resp`
  tem 8 áreas **operacionais** (reserva_espaco, cozinha, manutencao, logistica_estoque,
  logistica_compras, ti, rh, financeiro) — **Marketing/Criativo não está nelas.**
- **KPIs `ADM-C-*`** (3 SLA + 3 NPS pra produção/adoração/marketing) já estão seedados
  e calculando NULL porque **não há solicitação criativa ainda** (ver fix
  `20260519140000_recalcular_adm_criativo.sql`). O sistema já espera que demanda
  criativa flua por Solicitações e gere SLA + NPS.
- **Eventos** já tem ciclo criativo com áreas (marketing inclusa), kanban (`kanban_tasks`)
  e scoring de documentos (entrega no prazo / aprovação / qualidade). Pedro Paiva já
  entra no kanban de Eventos filtrado pela área dele (`coordenador-marketing × eventos`
  nível 3 + escopo_proprio).

**Decisão central que isso cria** (vai pro discovery + vira ADR):
1. O módulo Marketing **estende** o backbone de Solicitações pra áreas criativas, ou
   é um intake próprio que segue o mesmo padrão?
2. Como a demanda criativa **de evento** (que já vive no ciclo criativo de Eventos) se
   relaciona com a demanda **avulsa** (campanha, arte de série, post)? Uma fila só ou
   duas fontes que o calendário de capacidade consolida?

A boa notícia: muito da fundação (intake estruturado, SLA, NPS, kanban) **já existe**.
O que o módulo adiciona de novo é a camada de **capacidade/prazo realista + calendário
por pessoa + analytics demanda × capacidade**.

---

## 5. Mapa fase a fase

| Fase | No framework (SaaS comercial) | Pro módulo Marketing |
|---|---|---|
| 0 Validação | TAM/SAM/SOM, disposição a pagar | **Cortar** → o problema já é real e sentido |
| 1 Discovery | 10-15 entrevistas com estranhos | **Adaptar — fase crítica** → discovery interno (Pedro + equipe + solicitantes). Destrava as estimativas |
| 2 Negócio | pricing, unit economics, fiscal | **Cortar ~tudo** → sobra "como medimos sucesso" → alimenta OKR |
| 3 PRD | completa | **Manter — coração** → features faseadas, princípios, excluídos, glossário |
| 4 Design/UX | identidade + flows + telas | **Enxugar** → herda design system CBRio (#00B39D, shadcn); foca flows (intake, kanban, 2 calendários, "aguardando solicitante") |
| 5 Arquitetura | stack + ADRs de hosting/auth | **Reduzir** → stack herdada; 3-5 ADRs do módulo (seção 6) |
| 6 Dados | completa | **Manter — crítica** → integra `profiles`(UUID)/Solicitações/Eventos/OKR; RLS líder × colaborador |
| 7 Segurança | LGPD full, DPA, incidentes | **Reduzir** → RLS + audit + LGPD-lite (fotos de culto/pessoas); pluga em Permissões |
| 8 Specs | completa | **Manter — nunca pular** → specs pequenas dentro do repo CBRio |
| 9 Implementação | loop Claude Code | **Manter** → branch dedicada, PR+merge, CLAUDE.md a cada commit |
| 10 Lançamento | Product Hunt, Stripe prod | **Adaptar** → rollout interno gradual: piloto equipe do Pedro → algumas áreas → todas |
| 11 Operação | MRR/CAC/LTV/churn | **Adaptar** → monitora os próprios KPIs (lead time, % no prazo, demanda × capacidade) → alimenta OKR |

---

## 6. Decisões ancoradas em líderes de mercado (viram ADRs na Fase 5)

Marcos definiu: **seguir os líderes de mercado**. Cada decisão aberta vira um ADR
(contexto / decisão / alternativas / consequências) ancorado na referência:

1. **Apontamento de tempo** → derivar dos **timestamps do Kanban**, não manual.
   *(Kanban flow metrics — Businessmap/ProKanban.)* Designer rejeita ponto manual e o
   dado nasce podre; cycle time automático é mais honesto.
2. **Prazo** → **baseado em capacidade**, humano-no-loop no começo (Pedro confirma a
   data sugerida), evoluindo pra **forecasting por throughput** ("85% de chance até X").
   *(Float / Resource Guru / Runn / Kanban flow metrics.)*
3. **Intake** → **request queue** com formulário tipado + roteamento + aprovação.
   *(Adobe Workfront / Wrike.)* Reaproveita o que Solicitações já faz.
4. **Triagem** → prioridade explícita + **raia rápida** com capacidade reservada pro
   urgente. *(Creative Operations playbook.)*
5. **Estado "aguardando solicitante"** → separa o relógio da equipe do relógio do
   solicitante. *(Proofing do Wrike.)* Maior ROI político: prova que o atraso não foi
   da equipe quando o solicitante sumiu.

---

## 7. Onde moram docs, specs e git

- **Docs**: `docs/modulo-marketing/` — este (00), discovery (01),
  **decisões em aberto** (`decisoes-em-aberto.md`, doc vivo de tracking),
  e depois PRD (02), design, ADRs, modelagem, decomposição.
- **Specs**: dentro do próprio repo CBRio, respeitando o workflow existente.
- **Git**: branch dedicada (sugestão `marcos-marketing` ou `claude/modulo-marketing`),
  PR + merge, CLAUDE.md atualizado a cada commit (feedback persistente do Marcos).
- **Regras de segurança do projeto são lei** (ver CLAUDE.md): RLS contextual (nunca
  `USING(true)` em PII), `deleted_at` + whitelist `app_soft_deletable_tables()`,
  responsáveis sempre UUID FK pra `profiles`, audit log em colunas sensíveis,
  integração com o sistema de notificações.

---

## 8. Sequência de execução

```
discovery interno (Fase 1)         ← roteiro em 01-roteiro-discovery-interno.md
        ↓  (Marcos roda · Claude consolida)
PRD (Fase 3)                       ← features faseadas, decide Solicitações-vs-próprio
        ↓
design lean (4) + ADRs (5)         ← as 5 decisões da seção 6
        ↓
modelagem de dados (6)             ← integra Solicitações/Eventos/profiles/OKR
        ↓
autorização + audit (7)            ← RLS líder × colaborador × solicitante
        ↓
decomposição em specs (8)          ← 20-50 specs pequenas
        ↓
implementação (9)                  ← loop Claude Code, 1 spec por sessão
        ↓
rollout interno gradual (10)       ← piloto → áreas → todas
        ↓
operação (11)                      ← KPIs do módulo alimentam o OKR/NSM
```

**Estado em 2026-05-28 · TODOS OS DOCUMENTOS DE SPEC PRONTOS.** Decisões D-01 a
D-14 fechadas (D-08 reservada pra Fase 11). Arquitetura emergente em
`arquitetura-emergente.md`. **Spec 001** é transversal no Solicitações (aprovação
hierárquica pelo diretor do setor de origem · vinda da D-04) e precede as specs
específicas do Marketing.

Documentos da spec-driven completos:
- `00-metodo-spec-driven-adaptado.md` (este)
- `01-roteiro-discovery-interno.md` (roteiro · usado informalmente em 2026-05-28)
- `decisoes-em-aberto.md` (14 decisões + 6 pendências menores · todas fechadas)
- `arquitetura-emergente.md` (sketch arquitetural · schema · fluxos · permissões · KPIs · contexto operacional)
- `02-prd.md` (Fase 3 · PRD com 14 features must-have)
- `03-design-ux.md` (Fase 4 · 7 fluxos + 7 telas + design system herdado)
- `04-adrs.md` (Fase 5 · 12 ADRs)
- `05-modelagem-dados.md` (Fase 6 · schema SQL completo · D-13 e D-14 fechadas)
- `06-seguranca-autorizacao.md` (Fase 7 · RLS por tabela · LGPD-lite)
- `07-decomposicao-specs.md` (Fase 8 · 15 specs detalhadas com escopo e critérios)

**Próximo passo (Fase 9 · implementação):** Claude Code roda a spec 001 (transversal
no Solicitações) primeiro, depois 002-015 conforme dependência. Cada spec = 1 PR
em branch dedicada · CLAUDE.md atualizado a cada commit.
