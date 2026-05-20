# Cronograma do Sistema Integrado CBRio

> **Janela:** 10/04/2026 → 20/05/2026 (41 dias)
> **Volume:** 245 migrations · ~30 módulos · ~550 PRs/commits
> **Stack:** React 18 + Vite + Express + Supabase + Vercel

---

## Visão geral por semana

| Semana | Período | Dias úteis | Migrations | Foco principal |
|--------|---------|-----------|------------|----------------|
| 1 | 10–18/abr | 8 | 29 | Fundação · membresia, RH, voluntariado, KPIs v1 |
| 2 | 20–24/abr | 3 | 9 | Cérebro CBRio · Integração · Governança |
| 3 | 28/abr–04/mai | 5 | 31 | KPIs v2 · Processos · NEXT · Membro Modelo |
| 4 | 06–11/mai | 4 | 46 | Grupos · **Sistema OKR/NSM unificado** |
| 5 | 12–15/mai | 4 | 64 | Solicitações ADM · Online · Decisões/Pessoas |
| 6 | 18–20/mai | 3 | 53 | PCS · Permissões · Devocionais · Dashboard |
| **TOTAL** | **41 dias** | **27** | **245** | — |

---

## Semana 1 · 10–18/abr · Fundação

| Data | Entrega | Migrations |
|------|---------|------------|
| 10/04 | Setup inicial · auth, profiles, schema base | 5 |
| 13/04 | **Membresia v1** · grupos, contribuições, ministérios, parentesco, cadastros pendentes, CPF | 7 |
| 14/04 | **RH (documentos SharePoint)** · **Voluntariado v1** · foto membros · fix KPIs concluídos | 5 |
| 15/04 | Voluntariado · schedule management + profile completion | 2 |
| 16/04 | Voluntariado · unificação CPF + availability + seed service_types CBRio | 3 |
| 17/04 | **KPIs Module** · metas completo · cultos extra cols · mem_qrcodes · vol_profiles unique | 5 |
| 18/04 | **App Mobile** · tabelas | 1 |

---

## Semana 2 · 20–24/abr · Cérebro + Integração + Governança

| Data | Entrega | Migrations |
|------|---------|------------|
| 20/04 | Fix schema | 1 |
| 22/04 | **Cérebro CBRio** (sync reverso) · **Módulo Integração** · vol_team unique | 4 |
| 24/04 | **Governança** (ciclo mensal) · area_responsaveis · revision_log · gov_as_events | 4 |

---

## Semana 3 · 28/abr–04/mai · KPIs v2 + Processos + NEXT + Membro Modelo

| Data | Entrega | Migrations |
|------|---------|------------|
| 28/04 | **KPIs v2 estratégico** (consolidação) · **Processos** · **Módulo NEXT** · ouriço · INTG treinamento · 1x1 meetings | 11 |
| 29/04 | Processos seed/cleanup · indicador_agenda · **Tarefas pessoais** · kpi_fontes_auto_extras | 7 |
| 30/04 | ⭐ **Membro Modelo completo** (4 gaps da jornada) · alinhamento KPIs · OKR cascata · áreas novas | 7 |
| 04/05 | **Pessoas unificado** · Grupos refino · encontros · OKR líder · kpi_areas por perfil | 6 |

---

## Semana 4 · 06–11/mai · Grupos + Sistema OKR/NSM

| Data | Entrega | Migrations |
|------|---------|------------|
| 06/05 | **Grupos completo** · bairro/temporada · seed T1 2026 · código único · grupo_pedidos | 6 |
| 07/05 | ⭐⭐ **MARATONA · Sistema OKR/NSM Fase 1+2+6** · igrejas · diretoria geral · kpi_trajetoria · NSM completo · areas_kpi formal · dados_brutos · cálculo automático de KPIs · seed v2 pessoas | **26** |
| 08/05 | Seed 25 OKRs · KRs específicos · cascata meta institucional · push_subscriptions · kpi_tipo | 10 |
| 11/05 | **Escala 50k pessoas** (índices + views materializadas) · **NPS module** · fix triggers | 4 |

---

## Semana 5 · 12–15/mai · Solicitações + Online + Decisões/Pessoas

| Data | Entrega | Migrations |
|------|---------|------------|
| 12/05 | ⭐ **Solicitações backbone admin** (SLA · áreas · alçadas) · **KPIs ADM operacionais** · agent_tables · **OKR criativo** · cultura mensal · culto NPS p/ Seguir | 18 |
| 13/05 | NPS culto tipo · profile.kpi_valores · unifica dados_brutos · **Grupos hierarquia/supervisão** · OKR engajamento online · NEXT origem lista · seed batismos histórico · vol inscrições individuais · **cuidados devocional jornada180** · líderes grupos auto | 17 |
| 14/05 | **Módulo Online schema** · service_type modal config · visitantes cultos recorrentes · ami_sabado unique · KPIs Online · ⭐ **KPIs trigger realtime SQL** · **online_oauth_tokens** · report_email · vw_culto/batismo_historico_anual | 17 |
| 15/05 | **cultos_decisoes_pessoas** · Solicitações enum/SLA novas áreas · decisões data_nasc · ⭐ **meta absoluta cascata** · NSM decisões/cultos sem dados · promover voluntários batizados · **normalizar meta por periodicidade** | 12 |

---

## Semana 6 · 18–20/mai · PCS + Permissões + Devocionais + Dashboard

| Data | Entrega | Migrations |
|------|---------|------------|
| 18/05 | ⭐ **Módulo PCS (RH)** · **Membros Duplicados** (merge) · **Planejamento Anual** · decisões Kids/cutoff · ⭐⭐ **Reunião Permissões com Marcos** (matriz 25 cargos × 30 módulos) · Planejamento litúrgicos | 11 |
| 19/05 | ⭐⭐ **MARATONA · Módulo Devocionais completo** (Matheus · planos, IA, membro auth, envios WhatsApp) · permissões refinadas (lider-ministerial uniforme, boost por área, Alda→Lorena, expansão zero) · **Online OAuth coleta automática** (5 métricas YouTube) · cuidados convertidos completo · sync profiles→usuarios · atribuir cargos em massa · Solicitações ML tracking · notificações realtime · cultos observações · batismos categoria/camisa/deficiência · PCS 2026 atualizado | **34** |
| 20/05 | **Dashboard Semanal** (módulo da reunião de diretoria) · ⭐ **Módulos Kids/AMI/Bridge** drill-down · organograma criativo · áreas cultos · foto funcionário | 8 |

---

## Inventário de Módulos com Duração

| # | Módulo | Início | Última iteração | Duração |
|---|--------|--------|-----------------|---------|
| 1 | Auth/Profiles | 10/04 | em manutenção | 41d |
| 2 | Membresia | 13/04 | 18/05 (duplicados) | 35d |
| 3 | RH (docs/SharePoint) | 14/04 | 20/05 (foto) | 36d |
| 4 | Voluntariado | 14/04 | 15/05 (promover) | 31d |
| 5 | KPIs v1 | 17/04 | substituído por v2 (28/04) | 11d |
| 6 | App Mobile | 18/04 | — | 1d |
| 7 | Cérebro CBRio | 22/04 | em manutenção | 28d |
| 8 | Integração | 22/04 | 19/05 | 27d |
| 9 | Governança | 24/04 | — | 1d |
| 10 | KPIs v2 (estratégico) | 28/04 | 15/05 (normalizar) | 17d |
| 11 | Processos | 28/04 | descontinuado 18/05 | 20d |
| 12 | NEXT | 28/04 | 13/05 (origem lista) | 15d |
| 13 | Tarefas pessoais | 29/04 | — | 1d |
| 14 | Membro Modelo | 30/04 | 14/05 (cascata seguir) | 14d |
| 15 | Pessoas unificado | 04/05 | em uso | 16d |
| 16 | Grupos | 13/04 → refino 04/05 | 13/05 (hierarquia) | ~30d |
| 17 | **Sistema OKR/NSM** ⭐ | 07/05 (Fase 1+2+6) | 19/05 | 12d |
| 18 | Push subscriptions | 08/05 | — | 1d |
| 19 | Escala 50k | 11/05 | — | 1d |
| 20 | NPS | 11/05 | 13/05 (culto tipo) | 2d |
| 21 | Solicitações ADM | 12/05 | 19/05 (ML tracking) | 7d |
| 22 | OKR Criativo | 12/05 | — | 1d |
| 23 | Módulo Online (YouTube) | 14/05 | 19/05 (5 métricas) | 5d |
| 24 | Decisões/Pessoas (CPF) | 15/05 | 18/05 (Kids/cutoff) | 3d |
| 25 | PCS (RH cargos/salários) | 18/05 | 19/05 (2026) | 1d |
| 26 | Membros Duplicados | 18/05 | — | 1d |
| 27 | Planejamento Anual | 18/05 | — | 1d |
| 28 | **Permissões (matriz)** ⭐ | 18/05 | 20/05 (organograma) | 2d |
| 29 | Devocionais | 19/05 | em construção | 1d (inicial) |
| 30 | Online OAuth + 5 métricas YT | 18/05 (tokens) | 19/05 | 2d |
| 31 | Dashboard Semanal | 20/05 | — | 1d |
| 32 | Kids/AMI/Bridge drill-down | 20/05 | — | 1d |

---

## Estimativa de Custo por Semana

> **Aviso:** os valores abaixo são **estimativas heurísticas** baseadas em volume de trabalho (migrations + PRs) e padrões típicos de uso do Claude Code. **Não são números reais de billing** — esses só podem ser verificados em [console.anthropic.com → Usage](https://console.anthropic.com/settings/usage).
>
> **Base da estimativa:**
> - PR/migration média = 50k–150k tokens (input + output)
> - Modelo dominante: Claude Sonnet 4.x (≈ $3 input / $15 output per Mtok)
> - Prompt caching reduz ~70% do custo em sessões longas
> - Maratonas (26+ migrations/dia) somam contexto pesado, custo por unidade sobe ~20%
> - PR médio sem caching: ~$0,80–$2,50 · com caching agressivo: ~$0,30–$1,00

| Semana | Período | Migrations | PRs (estimativa) | Custo estimado (USD) | Custo estimado (BRL ~5,00) |
|--------|---------|------------|------------------|----------------------|-----|
| 1 | 10–18/abr | 29 | ~40 | **$30 – $70** | R$ 150 – R$ 350 |
| 2 | 20–24/abr | 9 | ~15 | **$12 – $25** | R$ 60 – R$ 125 |
| 3 | 28/abr–04/mai | 31 | ~45 | **$35 – $75** | R$ 175 – R$ 375 |
| 4 | 06–11/mai | 46 | ~70 | **$60 – $130** | R$ 300 – R$ 650 |
| 5 | 12–15/mai | 64 | ~95 | **$80 – $180** | R$ 400 – R$ 900 |
| 6 | 18–20/mai | 53 | ~80 | **$75 – $160** | R$ 375 – R$ 800 |
| **TOTAL** | **41 dias** | **245** | **~345** | **$292 – $640** | **R$ 1.460 – R$ 3.200** |

### Picos de custo

| Data | Migrations | Custo estimado | Motivo |
|------|-----------|----------------|--------|
| 07/05 | 26 | $30–$60 | Maratona Sistema OKR/NSM (Fase 1+2+6) |
| 19/05 | 34 | $40–$80 | Maratona Devocionais + Permissões + Online OAuth |
| 12/05 | 18 | $20–$45 | Solicitações ADM + KPIs operacionais |
| 13/05 | 17 | $20–$40 | Refinos múltiplos (Grupos, NEXT, voluntariado) |
| 14/05 | 17 | $20–$40 | Módulo Online + KPIs trigger realtime |

### Como validar com os números reais

1. Acesse [console.anthropic.com](https://console.anthropic.com)
2. Vá em **Settings → Usage** ou **Billing**
3. Filtre o período de 10/04/2026 a 20/05/2026
4. Compare por semana com a tabela acima

---

## Picos de Produtividade (objetivos)

- **07/05** · 26 migrations · Sistema OKR/NSM completo
- **19/05** · 34 migrations · Devocionais + permissões + Online OAuth
- **12/05** · 18 migrations · Solicitações + KPIs ADM
- **13/05 / 14/05** · 17 migrations cada · refinos de Grupos/Online/KPIs

**Média:** ~9 migrations por dia útil · pico de **34/dia** em 19/05.

---

## Resumo executivo

- **41 dias corridos** (27 dias úteis)
- **30+ módulos** entregues ponta a ponta
- **245 migrations** aplicadas em Supabase
- **~345 PRs** mergeados em `main`
- **Custo estimado total:** **US$ 290–640** (R$ 1.460–3.200)
- **Picos de marathon:** 07/05 (NSM) e 19/05 (Devocionais)
- **Tecnologia central:** React + Supabase + Vercel · cascata SQL real-time pra KPIs

> Dúvidas sobre algum módulo específico ou querendo detalhamento técnico de uma data? Consulte o `CLAUDE.md` na raiz do repo.
