# Cronograma de implementação · processo em 4 fases

> Criado em 2026-07-07 a pedido do Eduardo: todo módulo pronto passa por
> **4 fases de implementação** antes de ser considerado entregue.
> Este doc evolui o `onda1-piloto.md` (plano de ondas de jun/2026) pro
> formato de fases, com **prazos por etapa** e a cadência de
> **uma novidade por semana** pra reportar na reunião de segunda-feira.

## As 4 fases

| Fase | Nome | O que é | Critério de saída |
|---|---|---|---|
| **1** | Apresentação formal | Demonstração do módulo pro dono + envolvidos: o que faz, o que muda no dia a dia, quem usa | Dono e envolvidos sabem o que existe e concordam com o fluxo |
| **2** | Treinamento de líderes | Quem opera aprende a operar (hands-on, com dado de teste ou real) | Cada operador executou o fluxo principal ao menos 1× sem ajuda |
| **3** | Avaliação de resultados e desvios | Uso real acompanhado: dado fluindo + botão **Reportar** + digest diário do agente de triagem (`/admin/feedback`) | ~2 semanas de uso sem bug crítico novo · dono usa sem suporte · desvios tratados |
| **4** | GoLive | Assinatura formal: módulo é O canal oficial (a planilha/WhatsApp paralelo morre) | Blockers técnicos do módulo fechados (gate da auditoria) + comunicação à igreja quando aplicável |

**Regras da cadência:**
- **Uma novidade por semana.** Cada segunda-feira a reunião recebe 1 marco novo
  (um GoLive, um treinamento feito, um teste rodado). Se a novidade da semana
  atrasar, a próxima **não anda** — melhor atrasar 1 do que empilhar 2.
- Fases 3 e 4 dos módulos já em uso real correm **em paralelo** ao lançamento
  das fases 1-2 dos módulos novos (a novidade da semana é sempre UMA, mas as
  avaliações continuam em background).
- A Fase 3 usa a instrumentação da Onda 0: botão Reportar em todo o app,
  sink de erros 500, tela `/admin/feedback` e o agente de triagem diário.

## Já aconteceu (contar na reunião de 13/07)

- ✅ **NPS · 1ª pesquisa real rodada no AMI** (semana de 29/06–05/07). O cano
  NPS → dados_brutos → KPI já está ligado — os resultados alimentam o indicador.
- 🔜 **Totem Kids · teste do check-in ao vivo** — quarta-feira **08/07**.
  O teste é, na prática, a Fase 2 (treinamento dos voluntários) + início da Fase 3.
- 🔜 **Voluntariado · teste do módulo com a equipe** — semana de **13–19/07**
  (adiantado do Grupo B). Cumpre F1+F2 de uma vez e abre a Fase 3 (escala real
  populando) — com isso o GoLive dele antecipa de 28/09 pra **31/08**.

## Prazos por módulo (Grupos A e B)

Legenda: ✅ = fase já cumprida de fato (uso real) · datas = janela planejada.

### Grupo A — já em uso real (formalizar Fases 3→4)

| Módulo | Dono | F1 Apresentação | F2 Treinamento | F3 Avaliação | F4 **GoLive** |
|---|---|---|---|---|---|
| Integração (+ Next/Batismo) | Alda Lorena | ✅ | ✅ | 06–17/07 | **20/07** |
| Cuidados | Marcelo Soares | ✅ | ✅ | 06–24/07 | **27/07** |
| Produção de Culto | Pedro Fernandes | ✅ | ✅ | até 31/07 | **03/08** |
| Marketing | Pedro Paiva | ✅ | ✅ | até 07/08 | **10/08** |
| Solicitações | Amaury + Yago (transversal) | **20–26/07** (staff/solicitantes) | 27/07–07/08 | até 14/08 | **17/08** |
| NPS (adiantado do Grupo C) | Marcos + líderes de área | ✅ (AMI) | — | jul (resultados → KPI) | **03/08** (vira ferramenta contínua) |

> Solicitações já é a espinha oficial pros atendentes, mas o **público
> solicitante** (a igreja/staff inteiro) nunca teve a apresentação formal —
> por isso a Fase 1 dele é de verdade, não pró-forma.

### Grupo B — precisam das Fases 1-2 de verdade

| Módulo | Dono | F1 Apresentação | F2 Treinamento | F3 Avaliação | F4 **GoLive** |
|---|---|---|---|---|---|
| Totem Kids | Mariane Gaia | ✅ | **08/07** (teste check-in) | jul–ago (cultos piloto) | **31/08** ⚠️ gate: hardware (Fire TVs + Brother) |
| Voluntariado | Coordenação de voluntários | **13–19/07** (junto do teste) | **13–19/07** (teste do módulo com a equipe) | 20/07–28/08 (escala real populando) | **31/08** |
| Grupos | Pr. Nélio + Natasha | **03–09/08** (supervisores) | **10–23/08** (turmas de líderes · ~100 pessoas) | 24/08–11/09 (coleta real de frequência) | **14/09** |
| Membresia | Matheus + Marcelo | ✅ | 24–30/08 | set | **14/09** |

## Agenda semanal — a novidade de cada segunda

| Reunião | Novidade da semana anterior | Também em andamento |
|---|---|---|
| **13/07** | NPS rodou no AMI + resultado do teste de check-in do Kids (qua 08/07) | Integração e Cuidados em avaliação formal · **teste do Voluntariado nesta semana** |
| **20/07** | 🏁 **GoLive Integração** (1º GoLive do processo) + resultado do teste do Voluntariado (F1+F2) | Apresentação de Solicitações marcada |
| **27/07** | 🏁 **GoLive Cuidados** + Solicitações apresentada ao staff (F1 feita) | Produção fechando avaliação · Voluntariado: escala real populando |
| **03/08** | 🏁 **GoLive Produção** + NPS: resultados do AMI no KPI | Treinamento de Solicitações rodando |
| **10/08** | 🏁 **GoLive Marketing** + Grupos: apresentação pros supervisores (F1) | — |
| **17/08** | 🏁 **GoLive Solicitações** + Grupos: 1ª turma de treinamento de líderes | Voluntariado em avaliação (escala real) |
| **24/08** | Grupos: 2ª turma treinada | Kids em cultos piloto · Voluntariado fechando avaliação |
| **31/08** | 🏁 **GoLive Totem Kids** (se hardware ok) + 🏁 **GoLive Voluntariado** + Grupos: coleta real começou | Membresia: treinamento |
| **07/09** ⚠️ feriado | (reunião desloca) Grupos em avaliação de coleta | — |
| **14/09** | 🏁 **GoLive Grupos** + 🏁 **GoLive Membresia** — fecha os Grupos A e B | — |
| **21/09** | Planejar Onda 3 (Financeiro · RH · Eventos/Projetos · Governança) | — |

## Gate técnico do GoLive (herdado da auditoria · não trava fases 1-3)

Checar no GoLive de cada módulo se algum destes o afeta (lista viva no
`onda1-piloto.md` § "Gate pra abrir pra igreja"):

- Soft-deletes agregados em KPI (`cultos`, `kpi_indicadores_taticos`,
  `cultos_decisoes_pessoas`, `mem_grupo_encontros`, `mem_devocionais`,
  `mem_familias`) — afeta GoLive de **Integração** e **Grupos**.
- `_kpi_agregar_dado` ignora área no baseline — afeta KPIs de **Integração**.
- Baixos: `MEM_QR_SALT` fallback (Membresia) · cron `voluntariado-sync`
  não timing-safe (Voluntariado).
- **Totem Kids:** hardware (6 Fire TV Sticks + Brother no Windows do totem)
  + pagers LRS (porta TCP/NetPage + `PAGER_BRIDGE_TOKEN`).

## Fora deste ciclo (Onda 3 · a partir de out/2026)

Financeiro (Yago) · RH (Ju) · Eventos/Projetos (PMO) · Governança
(fechando reunião a reunião) · Painel/NSM/Jornada (read-only — pode ser
apresentado à diretoria junto de qualquer GoLive como vitrine).

> Atualizar este doc toda segunda após a reunião: marcar a novidade
> entregue, ajustar datas se algo atrasou (lembrando a regra: atrasou 1,
> a fila anda 1).
