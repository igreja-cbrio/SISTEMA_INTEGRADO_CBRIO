# Marketing · Linha do tempo · plano de implementação

Marcos, 25/09/2026. O protótipo aprovado ("por série") está em [`prototipo.html`](./prototipo.html)
e também como artifact: https://claude.ai/artifact/Sqxi4AL9p6mVXjU9dp7im5.

**Objetivo.** Criar uma aba nova, **Linha do tempo**, em `/marketing`, que funcione com os dados
reais:

- o ciclo criativo dos eventos chega sozinho, já com responsáveis e com uma tarefa por culto;
- o formulário cai em **Sistema** ou em **Sem responsável**;
- cada pessoa vê a própria tela;
- toda conclusão fica gravada com data, para os indicadores de atraso.

Se a equipe adotar, o Kanban sai (Fase 6).

---

## 1. O que já existe e vamos aproveitar

| Peça da linha do tempo | Já existe no sistema | O que falta |
|---|---|---|
| Ciclo criativo do evento | `cycle_phase_templates` (11 fases, offsets em **dias**) → `activateCycleForEvent` (`backend/routes/cycles.js:191`) cria `event_cycle_phases` + `cycle_phase_tasks` | Ativação é **manual** (checkbox). Planejamento Anual materializa o evento **sem** ativar o ciclo |
| Tarefa de marketing do ciclo | Trigger `fn_marketing_cards_cycle_phase_sync` espelha `cycle_phase_tasks` (area=marketing) em `marketing_kanban_cards` | **1 card por tarefa**, sem culto. Status do ciclo sobrescreve o card (e `em_andamento` nunca casa) |
| Responsável por fase | `marketing_ciclo_padroes` (categoria × fase → dono) | Não tem culto |
| Subtarefas | `marketing_card_checklist` (texto, feito) | Sem dono, horas, data de conclusão |
| Formulário → Marketing | `fn_marketing_cards_solicitacao_sync`: solicitação aprovada vira `marketing_campanhas` em `triagem` | Triagem **já é** o "Sem responsável". Falta a regra opcional que manda direto para Sistema |
| Triagem do Pedro | `POST /api/marketing/campanhas/:id/cards` (cria entregável com dono e datas) | Horas e checklist por pessoa no mesmo passo |
| Rotina | `marketing_compromissos_recorrentes` + participantes | Marcar a semana como feita |
| Capacidade | `marketing_membros.horas_semanais` + `marketing_capacidade_override` | Planner em **horas** (hoje é em slots/dia) |
| Datas para atraso | `entregue_em` (só a 1ª entrega), `estado_atualizado_em` | Conclusão de verdade, 1º prazo planejado, histórico de remarcação, saída da triagem |

⚠ `events`, `event_categories`, `event_cycles`, `event_cycle_phases`, `cycle_phase_tasks`,
`cycle_phase_templates` e `adm_task_templates` **não têm CREATE no git** (foram criadas à mão).
Por isso existe a Fase 0.

## 2. Como cada frente sai do banco

Semana = domingo a sábado (semana 1 de 2027 = 01/01–02/01). A semana de uma tarefa é a do seu
**prazo atual**:

```
coalesce(data_fim, prazo_producao, prazo_confirmado, prazo_preliminar)
```

Essa regra vive em `fn_marketing_card_prazo_atual`.

| Frente | Linhas | Regra |
|---|---|---|
| **Institucionais** | `marketing_kanban_cards` com `origem='evento'` | Agrupado **por evento/série** (`cycle_phase_tasks.event_id`) → **etapa** (`event_cycle_phases.nome_fase`) → **faixa por culto** (`culto`) |
| **Sistema** | cards com `campanha.origem='solicitacao'` e campanha fora de triagem | 1 card = 1 tarefa |
| **Interno** | cards `origem='interna'` sem campanha de solicitação | Criados pelo Pedro ("+ Nova tarefa") |
| **Rotina** | `marketing_compromissos_recorrentes` × participante × semana | Fechada = linha em `marketing_rotina_execucoes` |
| **Sem responsável** (só líder) | `marketing_campanhas` com `status='triagem'` | Semana = `solicitacoes.data_necessaria` (ou criação + 7 dias) |

As etapas da visão "por série" são as **fases reais** do ciclo (Pré Briefing → Briefing →
Brainstorming e Conceito → Identidade e Estratégia → Aprovação → Execução Estratégica →
Pré-Testes → Finalizações → Alinhamentos → Dia D → Debrief). As 7 etapas do protótipo eram
ilustrativas.

**Ordem das séries.** A série com a pendência mais próxima (mais antiga) fica em cima. Série sem
nada em aberto some quando "Esconder semanas sem pendência" está marcado.

## 3. Quem vê o quê

A segurança continua como está: a equipe inteira pode ler os cards. O que muda é o **recorte da
tela**, e quem faz esse recorte é o endpoint da linha do tempo.

⚠ Nível de módulo **não distingue o Pedro da equipe**: o `AREA_MODULO_BOOST` dá nível 5 a todo
mundo da área Marketing. Por isso:

- **Líder** = `marketing_membros.habilidade = 'coordenador'`, ou `role` admin/diretor.
- **Membro** = o `marketing_membros.id` de quem está logado (`meuMembroId`).

| Perfil | Vê no quadro | Pode fazer |
|---|---|---|
| Líder (Pedro) | Cada tarefa como um bloco. Na série, o cartão da etapa tem as 3 faixas CBRio/AMI/Kids. Também vê a frente **Sem responsável** | Alocar, criar, editar data/itens/horas/responsável, marcar qualquer item |
| Responsável do card (`atribuido_a`) | Card com **todas** as subtarefas | Marcar qualquer item do card |
| Demais | Só os itens com `membro_id` = ele, com o contexto do card | Marcar os próprios itens |

A cor dos quadrados (vermelho/verde) e as semanas atrasadas usam só o recorte de quem está vendo.
Pendência só existe até a semana atual; o que vem depois aparece como **previsto**.

## 4. Fases

Cada fase é 1 PR. As migrations ficam em `supabase/migrations/` e o Marcos aplica, **na ordem**.

### Fase 0 · conferir o banco vivo e fechar as decisões com o Pedro (sem código)

- Rodar [`00_verificacao_banco_vivo.sql`](./00_verificacao_banco_vivo.sql) (só leitura) e colar o
  resultado. Ele confirma:
  - os tipos das tabelas feitas fora do git;
  - o nome da categoria Série;
  - quantas tarefas de marketing cada fase tem;
  - se as 12 séries de 2027 já existem como `events`. Hoje elas só estão em
    `src/pages/public/novosite/series2027.ts`;
  - os triggers vivos.
- Com o Pedro:
  - a **lista de subtarefas por etapa × culto**, com quem faz e quantas horas (vira
    `marketing_ciclo_itens_padrao`);
  - se alguma etapa é **uma só** para os 3 cultos (ex.: briefing);
  - quais áreas, se alguma, vão **direto** para alguém sem passar por ele (`marketing_roteamento`).
- **Pronto quando:** resultado colado e as 3 respostas do Pedro registradas.

### Fase 1 · fundação de dados · `20260925100000_mkt_linha_f1_fundacao.sql`

Não muda nada que o Kanban faz hoje; só passa a gravar mais.

- **Card:**
  - `culto` (cbrio/ami/kids);
  - `prazo_inicial` (1ª data planejada, gravada uma vez);
  - `concluido_em` (acompanha o estado);
  - `atualizado_por` (o backend grava, porque service_role não tem `auth.uid`).
- **Checklist vira subtarefa:** `membro_id`, `horas_previstas`, `prazo`, `concluido_em`,
  `concluido_por`.
- **Campanha:** `culto`, `triada_em` / `triada_por` (saiu do Sem responsável), `concluida_em`.
- **`marketing_card_prazo_historico`:** toda remarcação do prazo atual, com de → para e quem
  mudou.
- **Backfill:** `concluido_em` ← `entregue_em`; `prazo_inicial` ← prazo atual; `triada_em` ← 1º
  card da campanha.
- **Backend nesta fase:**
  - `PATCH /api/marketing/cards/:id` passa a gravar `atualizado_por = req.user.userId`;
  - `PATCH /checklist/:itemId` aceita que o dono do item (`membro_id`) ou o responsável do card
    marque, e grava `concluido_por`;
  - `POST/PATCH` do checklist aceitam `membro_id`, `horas_previstas` e `prazo`.
- **Pronto quando:** Kanban segue igual e a conferência do fim do arquivo volta zerada.

### Fase 2 · ciclo criativo automático e por culto · `20260925110000_mkt_linha_f2_ciclo_por_culto.sql`

- **`marketing_categoria_cultos`:** a seed põe Série → cbrio, ami, kids.
- **`marketing_evento_cultos`:** exceção por evento (ex.: retiro só do AMI).
- **`marketing_ciclo_padroes` ganha `culto`.** A seed põe, em todas as fases de marketing da
  Série, o **Cauã** como responsável geral de CBRio e AMI e a **Letícia** no Kids.
- **`marketing_ciclo_itens_padrao`:** as subtarefas de cada etapa × culto, com dono e horas.
  - Aqui entram "Roteiro → Allan" em CBRio/AMI e "Post nas redes → Lorena" no Kids.
  - O conteúdo vem da Fase 0 e o Pedro mantém pelo Admin.
- **Trigger reescrito:** cada tarefa de marketing do ciclo vira **1 card por culto**, já com
  responsável e checklist.
  - O ciclo só **fecha** o card; o andamento é do Marketing.
  - Isso conserta o card que voltava para "fila" a cada edição do evento.
- **Volta:** quando os 3 cards de culto de uma tarefa terminam, a `cycle_phase_tasks` vira
  `concluida` sozinha. O módulo Eventos enxerga.
- **`fn_marketing_ciclo_gerar_cultos(event_id)`:** backfill dos eventos futuros. O card antigo
  vira o do 1º culto e os outros nascem.
- **Backend nesta fase (ativação automática):**
  - `POST /api/events` e `POST /planejamento-anual/propostas/:id/materializar` chamam
    `activateCycleForEvent` quando a categoria tem `cycle_phase_templates`.
  - O evento com data alterada já recalcula o ciclo (`PUT /api/events/:id`, `events.js:251`).
  - Script único para cadastrar/ativar as 12 séries de 2027 se a Fase 0 mostrar que não existem.
- **Admin:** a aba Padrões de `/marketing/admin` ganha coluna culto e a lista de subtarefas
  padrão.
- **Pronto quando:** ativar o ciclo de uma série de teste gera 3 cards por tarefa de marketing,
  com dono e checklist certos. Cauã sem nada no Kids e Letícia sem nada em CBRio/AMI.

### Fase 3 · aba Linha do tempo (leitura + marcar) · `20260925120000_mkt_linha_f3_checklist_e_rotina.sql`

- **Migration:**
  - o checklist fecha o card quando tudo está feito e reabre (`producao`) quando alguém desmarca;
  - `marketing_rotina_execucoes` (rotina da semana);
  - índices.
  - ⚠ Aplicar **junto com o deploy desta fase**, porque o fechamento pelo checklist também vale
    no Kanban.
- **Backend:** `backend/routes/marketingLinha.js`, montado em `/api/marketing/linha`:
  - `GET /?ano=2027` → semanas, frentes, séries → etapas → faixas → itens, **já recortado pelo
    perfil** (seção 3). Responde `perfil`, `status` dos quadrados e `semanas_atrasadas`.
  - `PATCH /itens/:id` → marca/desmarca subtarefa (dono, responsável ou líder).
  - `PUT /rotina/:compromissoId/:semanaInicio` e `DELETE` → fecha/reabre a rotina da semana.
- **Frontend:**
  - `src/pages/marketing/MarketingLinhaDoTempo.jsx` + `src/pages/marketing/linha/`, com estas
    peças:
    - `useCanvasPanZoom` (pan, scroll-zoom, pinça, "ajustar", "ir para hoje", igual ao
      `/atlas/fluxograma`);
    - `QuadroFrentes`;
    - `CartaoEtapa` (3 faixas);
    - `CartaoTarefa`;
    - `ModalTarefa` (briefing, pedido original, horas do liderado).
  - Aba **Linha do tempo** no `MarketingNav` e rota `/marketing/linha-do-tempo` em
    `src/App.tsx`.
- **Pronto quando:**
  - Pedro, Cauã e Letícia abrem a aba e cada um vê o próprio recorte;
  - marcar um item some do quadro e grava `concluido_em`.

### Fase 4 · Sem responsável + editor do Pedro · `20260925130000_mkt_linha_f4_roteamento_formulario.sql`

- **Migration:** `marketing_roteamento` (área de quem pediu → pessoa, **nasce vazia**).
  `fn_marketing_cards_solicitacao_sync` passa a mandar direto para Sistema quando há regra. Sem
  regra continua em triagem (= Sem responsável).
- **Backend** (só líder):
  - `POST /linha/sem-responsavel/:campanhaId/alocar` → cria o card (dono, data), o checklist
    (item · quem faz · horas) e grava o "o que você espera" em `descricao`.
    - Reaproveita a régua de `POST /campanhas/:id/cards` (`marketing.js:2480`).
    - A campanha vira `ativa`, e o trigger grava `triada_em`.
  - `POST /linha/tarefas` → nova tarefa Interno ou Sistema.
  - `PATCH /linha/tarefas/:id` → editar título, data, responsável, briefing e itens (inclui
    adicionar e remover).
  - `GET|PUT /linha/roteamento` → regras de roteamento (Admin).
  - Notificações: `marketing_card_atribuido` para o dono, já existente, e
    `marketing_prazo_ajustado` para o solicitante quando a data muda.
- **Frontend:**
  - frente **Sem responsável** e editor com carga da semana ao vivo, calculada no front a partir
    do `GET /linha/carga`;
  - "+ Nova tarefa" e "Editar" no modal;
  - o modal Responsabilidades mostra a matriz real (`marketing_ciclo_padroes` + itens padrão).
- **Pronto quando:** um pedido novo pelo formulário aparece em Sem responsável. O Pedro aloca, a
  pessoa recebe a notificação e vê a tarefa na tela dela.

### Fase 5 · Planner em horas + atraso · `20260925140000_mkt_linha_f5_views_atraso.sql`

- **Migration:**
  - `vw_marketing_prazos`: por card, dias de atraso contra o prazo atual e contra o 1º plano, e
    nº de remarcações. Card sem prazo **não** conta como "no prazo", o que corrige o viés do
    MKT-PRAZO de hoje.
  - `vw_marketing_triagem`: horas até o Pedro alocar.
- **Backend:** `GET /linha/carga?inicio&fim` → horas por pessoa × semana, contra a capacidade:
  - soma `horas_previstas` dos itens (item sem dono conta para o responsável do card);
  - soma `duracao_h` da rotina;
  - capacidade = `marketing_capacidade_override.horas_disponiveis` da semana, ou
    `marketing_membros.horas_semanais`.
- **Frontend:** aba Planner da linha do tempo (pessoa × semana, amarelo > 85%, vermelho > 100%).
  O planner de slots atual fica até a Fase 6.
- **Indicadores:** registrar pelo catálogo (ler `project_catalogo_indicadores_v3` antes).
  Candidatos:
  - % de tarefas entregues até o prazo, por frente e por culto;
  - atraso médio;
  - remarcações por tarefa;
  - tempo em Sem responsável;
  - carga > capacidade por pessoa.

### Fase 6 · piloto e saída do Kanban

- **4 semanas** com Pedro, Cauã, Letícia, Lorena e Allan usando a Linha do tempo como tela
  principal. O Kanban continua no ar, lendo os mesmos cards; não há migração de dados.
- **Critério para desligar o Kanban:**
  - a equipe fecha as tarefas pela linha do tempo, com `concluido_por` preenchido em ≥ 90% das
    conclusões;
  - o Pedro aloca pelo Sem responsável;
  - ninguém pede o Kanban de volta.
- **Desligar:**
  - remover a aba e a rota `/marketing/kanban` (redirect para a linha do tempo);
  - apagar `MarketingKanban.jsx`, `useArrastoKanban.js` e `MarketingEpicos.jsx`;
  - rodar o build na worktree para não sobrar import pendurado.

## 5. Ordem de aplicação e o que muda em cada uma

| # | Migration | Quando aplicar | Muda comportamento visível? |
|---|---|---|---|
| 1 | `20260925100000_mkt_linha_f1_fundacao` | Antes do PR da Fase 1 | Não |
| 2 | `20260925110000_mkt_linha_f2_ciclo_por_culto` | Com o PR da Fase 2, **depois** da Fase 0 | Sim: série passa a gerar 3 cards por tarefa. O ciclo não "desanda" mais o card |
| 3 | `20260925120000_mkt_linha_f3_checklist_e_rotina` | Com o deploy da Fase 3 | Sim: checklist completo fecha o card (também no Kanban) |
| 4 | `20260925130000_mkt_linha_f4_roteamento_formulario` | Com a Fase 4 | Não, até existir regra em `marketing_roteamento` |
| 5 | `20260925140000_mkt_linha_f5_views_atraso` | Com a Fase 5 | Não (só views) |

Todas as tabelas novas: RLS ligada, policy só para `service_role`, `REVOKE ALL` de `anon` e
`authenticated`. O front nunca lê essas tabelas direto.

## 6. Em aberto

1. **Subtarefas e horas por etapa × culto** (Fase 0, com o Pedro). Sem isso os cards nascem
   com dono, mas com checklist vazio.
2. **Etapa única para os 3 cultos?** Se sim, a etapa ganha um card sem culto
   (`marketing_evento_cultos` não se aplica a ela) e a faixa única aparece no cartão da etapa.
   Isso precisa de uma coluna `por_culto` em `cycle_phase_templates` ou em
   `marketing_ciclo_padroes`, fora destas migrations.
3. **Séries 2027 como eventos.** Se a Fase 0 mostrar que não existem, cadastrar pelo
   Planejamento Anual (que passa a ativar o ciclo) ou por script.
4. **Aline sem login.** Itens de fotografia no nome dela não têm quem marque. O responsável do
   card marca por ela, como hoje.

## 7. Riscos

- **Fechamento automático pelo checklist (Fase 3)** muda o Kanban: card com checklist completo
  vai sozinho para Concluído.
  - A notificação de entrega ao solicitante (`marketing_card_entregue`) é do backend e **não**
    sai pelo trigger. O `PATCH /linha/itens/:id` precisa disparar quando o card fechar.
  - Conferir no piloto se o Pedro quer revisão antes. Se quiser, o gatilho vai para `revisao` em
    vez de `concluido`.
- **Volta para o ciclo (Fase 2)** conclui `cycle_phase_tasks` automaticamente. Avisar quem
  acompanha o módulo Eventos.
- **Tabelas fora do git:** se a Fase 0 mostrar tipo diferente do esperado (ex.: `prazo`
  timestamptz), ajustar os casts da Fase 2 antes de aplicar.
