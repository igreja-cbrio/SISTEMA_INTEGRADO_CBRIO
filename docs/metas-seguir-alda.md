# Reunião com Alda Lorena · Metas Seguir a Jesus

**Data sugerida:** 18/05/2026
**Participantes:** Marcos Paulo · Alda Lorena (líder Integração)
**Objetivo:** definir metas absolutas por período para os 15 KPIs do valor "Seguir a Jesus" + alinhar nomes/responsáveis

---

## Como preencher

- A coluna **"Indicador novo"** tem uma sugestão · marca **OK** se concorda, ou rabisca o nome que ela usa no dia a dia.
- A coluna **"Meta semanal/mensal"** tem uma sugestão minha baseada no que está sendo coletado hoje · serve só de referência. **A meta da Alda manda.** Se ela falar "30% acima da média", você converte na hora.
- A coluna **"Baseline atual"** já tem o último valor registrado no sistema (quando aplicável) · ajuda Alda a calibrar se a meta dela é ambiciosa ou conservadora.
- Em **"Responsável"**, coloca o nome completo + email da pessoa que cuida daquele indicador no dia a dia (pode ser ela mesma em vários).

---

## Tabela principal · 15 KPIs com coletor automático

| KPI       | Indicador atual (vai sair) | Indicador novo (sugestão) | Periodicidade | Baseline atual | Meta por período (sugestão) | Meta da Alda | Responsável |
|-----------|----------------------------|---------------------------|---------------|----------------|-----------------------------|--------------|-------------|
| **SED-21** | % crescimento da frequência em relação a semana anterior | Frequência Sede (presencial adultos) | semanal | ~2.069 | 2.500 | | Alda Lorena |
| **SED-18** | % crescimento de conversões em relação a semana anterior | Decisões Sede (presencial + online ligadas a cultos sede) | semanal | ~16 | 25 | | |
| **SED-20** | % crescimento de batismos em relação ao último evento | Batismos Sede | mensal | ~8 | 15 | | |
| **BRG-01** | % crescimento da frequência em relação a semana anterior | Frequência Bridge | semanal | sem dado | 100 | | |
| **BRG-02** | % crescimento de conversões em relação a semana anterior | Decisões Bridge | semanal | sem dado | 5 | | |
| **BRG-21** | % crescimento de batismos em relação ao último evento | Batismos Bridge | mensal | sem dado | 5 | | |
| **ONL-11** | % crescimento da frequência em relação a semana anterior | Audiência Online (pico ao vivo) | semanal | ~1.615 | 2.000 | | |
| **ONL-13** | % crescimento de conversões em relação a semana anterior | Decisões Online | semanal | ~3 | 10 | | |
| **ONL-14** | % crescimento de batismos em relação ao último evento | Batismos via Online | mensal | sem dado | 3 | | |
| **KIDS-01** | % crescimento da frequência em relação a semana anterior | Frequência Kids | semanal | ~290 | 400 | | |
| **KIDS-03** | % crescimento de batismos em relação ao último evento | Batismos Kids | mensal | sem dado | 5 | | |
| **AMI-01** | % crescimento da frequência em relação a semana anterior | Frequência AMI | semanal | ~154 | 220 | | |
| **AMI-02** | % crescimento de conversões em relação a semana anterior | Decisões AMI | semanal | ~1 | 3 | | |
| **AMI-04** | % crescimento de batismos em relação ao último evento | Batismos AMI | mensal | sem dado | 5 | | |
| **CBA-01** | % crescimento de batismos em relação ao último evento | Batismos CBA (igrejas acompanhadas) | mensal | sem dado | ? | | |

---

## KPIs especiais · decisão da Alda

Esses 12 KPIs também são "Seguir a Jesus" mas precisam de **decisão estrutural** antes de definir meta. Sugiro deixar pra próxima rodada · só ouvir o que ela acha agora.

### NEXT (curso de novos · 4 áreas)

| KPI | Atual | Pergunta pra Alda |
|-----|-------|-------------------|
| AMI-03 | % crescimento freq Next AMI | Vocês contam **inscritos** ou **quem completa o curso**? Periodicidade real é semanal ou por ciclo (a cada N semanas)? |
| BRG-04 | % crescimento freq Next Bridge | Mesma pergunta |
| KIDS-12 | % crescimento freq Next Kids | Mesma pergunta |
| SED-23 | % crescimento freq Next Sede | Mesma pergunta · este aqui Marcos já tem ideia do que medir? |

**Saída esperada:** decisão de **o que conta como uma unidade** (1 inscrito, 1 graduado, 1 sessão dada) → daí volto e crio coletor.

### Conversões Kids/CBA (sem coletor hoje)

| KPI | Atual | Pergunta |
|-----|-------|----------|
| KIDS-02 | % crescimento decisões Kids | Como vocês registram decisões no Kids hoje · pelo culto principal ou tem cadastro separado por classe? |
| CBA-02 | % crescimento conversões CBA | Igrejas acompanhadas reportam decisões via planilha? Frequência (semanal/mensal)? |
| ONL-12 | % crescimento freq Next Online | Existe Next no Online ou é apenas presencial? |

### NPS por culto (escala invertida)

| KPI | Atual | Status |
|-----|-------|--------|
| CULTO-NPS-AMI | NPS Culto · AMI | já em escala 0-100 (NPS), só faltam coletas |
| CULTO-NPS-BRIDGE | NPS Culto · Bridge | idem |
| CULTO-NPS-SEDE | NPS Culto · Sede | idem |
| CULTO-NPS-ONLINE | NPS Culto · Online | idem |
| CULTO-NPS-KIDS | NPS Culto · CBKids | idem |
| AMI-25, BRG-24, KIDS-23, ONL-25, SED-26 | % respostas positivas | duplicado com NPS · vale unificar |

**Pergunta pra Alda:** "Você quer reaproveitar os NPS-CULTO-* (1 por área) e desativar os AMI-25/BRG-24/etc.?"

---

## Sub-responsáveis por área (preciso de nome + email)

Pra eu linkar `responsavel_id` no banco (UUID via `profiles.id`). Se a pessoa não tem login ainda, mando o convite depois.

| Área | Responsável atual | Sugestão de sub-líder (preencher com Alda) |
|------|-------------------|--------------------------------------------|
| Sede | Alda | |
| Bridge | Alda | |
| AMI | Alda | |
| Online | Alda | |
| Kids | Alda | |
| CBA | Alda | |

---

## Roteiro sugerido pra abrir a reunião

1. **Contexto rápido** (2 min) · "Alda, o sistema agora tem os indicadores ligados aos dados que vc registra no culto. Falta a gente definir a meta de cada um até dezembro/2026 · em vez de % de crescimento, vamos cravar o número-alvo direto."

2. **Tabela linha a linha** (10 min) · passa cada KPI, lê o nome novo + a meta sugerida, pergunta:
   - "Esse nome reflete o que vc acompanha?"
   - "Esse alvo faz sentido pra você?"

3. **NEXT** (3 min) · "Tem 4 indicadores de Next que ainda estão genéricos. Vc me ajuda a definir o que conta?"

4. **Sub-responsáveis** (3 min) · "Quem é a pessoa que olha esse número toda segunda? Algumas áreas você pode estar acumulando · vamos ver se cabe delegar."

5. **Encerramento** · vc tira foto da planilha preenchida ou anexa o arquivo. Manda pra mim que eu faço a migration única (rename + meta + responsável) e mergeo.

---

## Dicas pra extrair número da Alda quando ela hesitar

- "Qual o número que você gostaria de ver toda **segunda-feira de manhã** pra saber se a semana foi boa?"
- "Se você fosse fazer uma promessa pro Pr. Pedrão sobre esse indicador até **dezembro**, qual seria?"
- "Quando a CBRio teve seu **melhor mês**, esse número foi quanto?" · meta = melhor histórico + ambição
- Se ela travar, propõe duas faixas: **conservadora** (10% acima da média atual) e **ambiciosa** (30%) · ela escolhe entre as duas

---

## Próximo passo (eu)

Quando vc me mandar a tabela preenchida, eu vou:

1. Criar migration única que:
   - Renomeia `kpi_indicadores_taticos.indicador` dos 15 KPIs com o nome novo
   - Define `meta_valor_absoluto` com a meta semanal × 52 (ou mensal × 12) pra view dividir corretamente
   - Linka `lider_funcionario_id` (responsável) via `rh_funcionarios.id`
2. Atualizar CLAUDE.md com a nova nomenclatura
3. Fixar o bug do fallback `meta_valor_absoluto IS NULL` → `sem_meta` (some o 5383% do ONL-11)
4. Abrir PR + você roda migration + mergeio
