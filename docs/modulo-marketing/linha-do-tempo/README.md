# Marketing · Linha do tempo · plano de implementação

Marcos, 25/09/2026. O protótipo aprovado ("por série") está em [`prototipo.html`](./prototipo.html)
e também como artifact: https://claude.ai/artifact/Sqxi4AL9p6mVXjU9dp7im5.

**Objetivo.** Criar uma aba nova, **Linha do tempo**, em `/marketing`, que funcione com os dados
reais:

- o ciclo criativo dos eventos chega sozinho, já com responsáveis e com uma tarefa por culto;
- o formulário cai em **Pendentes**, já com a pessoa sugerida, e o Pedro etiqueta antes de ir
  para Sistema;
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
| Formulário → Marketing | `fn_marketing_cards_solicitacao_sync`: solicitação aprovada vira `marketing_campanhas` em `triagem` | Triagem **já é** o "Pendentes". Falta a pessoa sugerida |
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
| **Institucionais** | `marketing_kanban_cards` com `origem='evento'` | 1 card por **fase do ciclo × culto** (`event_phase_id` + `culto`). Agrupado **por série** (`event_id`) → **etapa** → **faixa por culto** |
| **Sistema** | cards com `campanha.origem='solicitacao'` e campanha fora de triagem | 1 card = 1 tarefa |
| **Interno** | cards `origem='interna'` sem campanha de solicitação | Criados pelo Pedro ("+ Nova tarefa") |
| **Rotina** | `marketing_compromissos_recorrentes` × participante × semana | Fechada = linha em `marketing_rotina_execucoes` |
| **Pendentes** (só líder) | `marketing_campanhas` com `status='triagem'` | Semana = `solicitacoes.data_necessaria` (ou criação + 7 dias). Vem com `sugerido_membro_id` |

### A matriz do ciclo (Marcos, 25/09)

As etapas são as **fases reais** do ciclo (`cycle_phase_templates`). O Marketing tem tarefa em
7 delas, **as mesmas nas 3 versões**.

Onde a tabela diz "responsável", o item fica com o **Cauã** em CBRio e AMI e com a **Letícia** no
Kids.

| Fase | Responsável da tarefa | Quem vê | Subtarefas |
|---|---|---|---|
| Pré Briefing | Pedro | **Só o Pedro** | Marcar a reunião de briefing |
| Briefing | Cauã (CBRio, AMI) · Letícia (Kids) | Equipe | Registrar o conceito decidido na reunião (**texto obrigatório**) |
| Brainstorming e Conceito | Cauã · Letícia | Equipe | Defesa · MoodBoard (responsável) · Referências para redes (**Lorena**; o Pedro pode passar alguma para a Letícia) |
| Identidade e Estratégia | Cauã · Letícia | Equipe | Roteirização (**Allan**) · Logo · Cores · Tipografia · Apresentação visual (responsável) · Planejamento de redes (**Lorena**) |
| Aprovação | Pedro | **Equipe vê, só o Pedro marca** | Reunião de aprovação · Report da aprovação (**texto obrigatório**) |
| Execução Estratégica | Cauã · Letícia | Equipe | Institucional · PPT Capa · PPT Miolo · Thumbs · Telas laterais · Horários do culto · Tela generosidade (responsável) · Vídeo Instagram (**Allan**) · Conteúdos para redes: vídeo (**Allan**) e posts (**Lorena**) |
| Pré-Testes | Pedro | Equipe vê, só o Pedro marca | Acompanhar os testes do que foi produzido |

A matriz está na seed da Fase 2 (`marketing_ciclo_padroes` + `marketing_ciclo_itens_padrao`) e
o Pedro ajusta pelo Admin. Horas nascem em 0 até o Pedro preencher.

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
| Líder (Pedro) | Cada tarefa como um bloco. Na série, o cartão da etapa tem as 3 faixas CBRio/AMI/Kids. Também vê a frente **Pendentes** | Alocar, criar, editar data/itens/horas/responsável, marcar qualquer item |
| Responsável do card (`atribuido_a`) | Card com **todas** as subtarefas | Marcar qualquer item do card |
| Demais | Só os itens com `membro_id` = ele, com o contexto do card | Marcar os próprios itens |

Duas exceções, definidas por `visibilidade` no card:

- **`so_lider`** (Pré-briefing): ninguém além do líder vê.
- **`lider_move`** (Aprovação, Pré-Testes): o responsável geral do culto vê a tarefa, mas só o
  líder marca.

Item com `exige_registro` só fecha com texto em `registro`. O banco recusa (CHECK).

A cor dos quadrados (vermelho/verde) e as semanas atrasadas usam só o recorte de quem está vendo.
Pendência só existe até a semana atual; o que vem depois aparece como **previsto**.

## 4. Fases

Cada fase é 1 PR. As migrations ficam em `supabase/migrations/` e o Marcos aplica, **na ordem**.

### Fase 0 · conferir o banco vivo e fechar as decisões com o Pedro (sem código)

- Rodar [`00_verificacao_banco_vivo.sql`](./00_verificacao_banco_vivo.sql) (só leitura) e colar o
  resultado. Ele confirma:
  - os tipos das tabelas feitas fora do git;
  - o nome da categoria Série;
  - os **nomes exatos das fases** (a seed da matriz usa "Pré Briefing", "Pré-Testes"…);
  - se as 12 séries de 2027 já existem como `events`. Hoje elas só estão em
    `src/pages/public/novosite/series2027.ts`;
  - os triggers vivos.
- Ainda com o Marcos/Pedro:
  - **horas** de cada subtarefa da matriz;
  - se Finalizações, Alinhamentos, Dia D e Debrief têm tarefa de Marketing;
  - o campo opcional **"formato"** no formulário, para sugerir a pessoa (ver seção 6).
- **Pronto quando:** resultado colado e respostas registradas. A matriz já está fechada
  (seção 2).

### Fase 1 · fundação de dados · `20260925100000_mkt_linha_f1_fundacao.sql`

Não muda nada que o Kanban faz hoje; só passa a gravar mais.

- **Card:**
  - `culto` (cbrio/ami/kids);
  - `prioridade` (baixa/normal/alta/urgente);
  - `visibilidade` (equipe · so_lider · lider_move);
  - `prazo_inicial` (1ª data planejada, gravada uma vez);
  - `concluido_em` (acompanha o estado);
  - `atualizado_por` (o backend grava, porque service_role não tem `auth.uid`).
- **Checklist vira subtarefa:** `membro_id`, `horas_previstas`, `prazo`, `concluido_em`,
  `concluido_por`, `exige_registro` + `registro`. O banco não deixa fechar um item de registro
  sem texto.
- **Campanha:** `culto`, `triada_em` / `triada_por` (saiu de Pendentes), `concluida_em`.
- **`marketing_card_prazo_historico`:** toda remarcação do prazo atual, com de → para e quem
  mudou.
- **Backfill:** `concluido_em` ← `entregue_em`; `prazo_inicial` ← prazo atual; `triada_em` ← 1º
  card da campanha.
- **Backend nesta fase:**
  - `PATCH /api/marketing/cards/:id` passa a gravar `atualizado_por = req.user.userId`;
  - `PATCH /checklist/:itemId` aceita que o dono do item (`membro_id`) ou o responsável do card
    marque, e grava `concluido_por` e `registro`. Em card `lider_move`, só o líder marca;
  - `POST/PATCH` do checklist aceitam `membro_id`, `horas_previstas`, `prazo` e
    `exige_registro`.
- **Pronto quando:** Kanban segue igual e a conferência do fim do arquivo volta zerada.

### Fase 2 · ciclo criativo automático, por fase × culto · `20260925110000_mkt_linha_f2_ciclo_por_culto.sql`

**Por que por fase:** as tarefas do ciclo (`cycle_phase_tasks`) vêm dos modelos do módulo Eventos
e não cobrem as fases do Marketing (Pré-briefing, Aprovação). O Marketing passa a gerar a
própria lista a partir de `event_cycle_phases` + a matriz. Assim toda série tem exatamente as
mesmas etapas nos 3 cultos.

- **Cultos:**
  - `marketing_categoria_cultos`: a seed põe Série → cbrio, ami, kids;
  - `marketing_evento_cultos`: exceção por evento (ex.: retiro só do AMI).
- **Matriz:**
  - `marketing_ciclo_padroes` ganha `culto` e `visibilidade`: responsável e quem vê, por fase.
    Fase sem linha não gera tarefa;
  - `marketing_ciclo_itens_padrao`: subtarefas com quem faz, horas e `exige_registro`.
  - A seed grava a matriz da seção 2, procurando as pessoas pelo nome e avisando o que faltar.
- **Gerador:** trigger em `event_cycle_phases`.
  - Quando a fase nasce, nascem as tarefas (1 por culto), com responsável, visibilidade, datas
    da fase e checklist.
  - Quando o Dia D muda, as datas acompanham, exceto nas tarefas que alguém já remarcou à mão.
- **Espelho antigo** (`cycle_phase_tasks` → card):
  - pula eventos por culto, para não duplicar;
  - para de fazer o card andar para trás;
  - aceita `em_andamento` com underscore.
- **Volta:** quando as 3 tarefas de culto de uma fase terminam, as `cycle_phase_tasks` de
  marketing daquela fase ficam `concluida`. O módulo Eventos enxerga.
- **`fn_marketing_ciclo_gerar_evento(event_id, substituir_espelho)`:** backfill das séries
  futuras. O `true` soft-deleta os cards antigos ainda abertos do evento.
- **Backend nesta fase (ativação automática):**
  - `POST /api/events` e `POST /planejamento-anual/propostas/:id/materializar` chamam
    `activateCycleForEvent` quando a categoria tem `cycle_phase_templates`;
  - `PUT /api/events/:id` já recalcula as fases quando a data muda (`events.js:251`), e o
    trigger leva as tarefas junto;
  - script único para cadastrar/ativar as 12 séries de 2027 se a Fase 0 mostrar que não
    existem.
- **Admin:** a aba Padrões de `/marketing/admin` ganha culto, visibilidade e a lista de
  subtarefas (com horas).
- **Pronto quando:** ativar o ciclo de uma série de teste gera 7 fases × 3 cultos, com a matriz
  certa.
  - O Pré-briefing aparece só para o Pedro.
  - O Cauã não tem nada no Kids e a Letícia não tem nada em CBRio/AMI.

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

### Fase 4 · Pendentes + editor do Pedro · `20260925130000_mkt_linha_f4_pendentes_sugestao.sql`

Toda solicitação passa pelo Pedro, mesmo quando é óbvio para quem vai (post → Lorena).

- **Migration:** a campanha ganha `sugerido_membro_id`, gravado quando a solicitação chega:
  - caminho: formato pedido → `marketing_etiquetas_tipo.habilidade_padrao` → a única pessoa
    ativa com essa habilidade;
  - não atribui nada sozinho;
  - não existe roteamento direto para Sistema.
- **Backend** (só líder):
  - `POST /linha/pendentes/:campanhaId/alocar` → cria o card e o checklist.
    - **Exige** responsável (já vem a sugestão), **prioridade**, **descrição do que ele quer** e
      **horas** por item.
    - Reaproveita a régua de `POST /campanhas/:id/cards` (`marketing.js:2480`).
    - A campanha vira `ativa`, e o trigger grava `triada_em`.
  - `POST /linha/tarefas` → nova tarefa Interno ou Sistema.
  - `PATCH /linha/tarefas/:id` → editar título, data, responsável, prioridade, descrição e itens
    (inclui adicionar e remover).
  - Notificações: `marketing_card_atribuido` para o dono, já existente, e
    `marketing_prazo_ajustado` para o solicitante quando a data muda.
- **Frontend:**
  - frente **Pendentes**, com o editor já pré-preenchido e a carga da semana ao vivo;
  - "+ Nova tarefa" e "Editar" no modal;
  - o modal Responsabilidades mostra a matriz real.
  - Formulário: campo **opcional** "que formato você imagina?", se aprovado (seção 6).
- **Pronto quando:** um pedido novo cai em Pendentes com a pessoa sugerida. O Pedro etiqueta e
  aloca, e a pessoa vê a tarefa na tela dela com a descrição e as horas.

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
  - tempo em Pendentes;
  - carga > capacidade por pessoa.

### Fase 6 · piloto e saída do Kanban

- **4 semanas** com Pedro, Cauã, Letícia, Lorena e Allan usando a Linha do tempo como tela
  principal. O Kanban continua no ar, lendo os mesmos cards; não há migração de dados.
- **Critério para desligar o Kanban:**
  - a equipe fecha as tarefas pela linha do tempo, com `concluido_por` preenchido em ≥ 90% das
    conclusões;
  - o Pedro aloca pelos Pendentes;
  - ninguém pede o Kanban de volta.
- **Desligar:**
  - remover a aba e a rota `/marketing/kanban` (redirect para a linha do tempo);
  - apagar `MarketingKanban.jsx`, `useArrastoKanban.js` e `MarketingEpicos.jsx`;
  - rodar o build na worktree para não sobrar import pendurado.

## 5. Ordem de aplicação e o que muda em cada uma

| # | Migration | Quando aplicar | Muda comportamento visível? |
|---|---|---|---|
| 1 | `20260925100000_mkt_linha_f1_fundacao` | Antes do PR da Fase 1 | Não |
| 2 | `20260925110000_mkt_linha_f2_ciclo_por_culto` | Com o PR da Fase 2, **depois** da Fase 0 | Sim: série passa a gerar 7 fases × 3 cultos pela matriz. O ciclo não faz o card andar para trás |
| 3 | `20260925120000_mkt_linha_f3_checklist_e_rotina` | Com o deploy da Fase 3 | Sim: checklist completo fecha o card (também no Kanban) |
| 4 | `20260925130000_mkt_linha_f4_pendentes_sugestao` | Com a Fase 4 | Não (só grava a sugestão) |
| 5 | `20260925140000_mkt_linha_f5_views_atraso` | Com a Fase 5 | Não (só views) |

Todas as tabelas novas: RLS ligada, policy só para `service_role`, `REVOKE ALL` de `anon` e
`authenticated`. O front nunca lê essas tabelas direto.

## 6. Em aberto

1. **Horas das subtarefas.** A matriz nasce com 0h e o Pedro preenche pelo Admin, ou o Marcos
   passa agora.
2. **Fases depois do Pré-Testes** (Finalizações, Alinhamentos Operacionais Finais, Dia D,
   Debrief): o Marketing tem tarefa? Hoje não geram nada.
3. **Pré-Testes:** ficou como a Aprovação (equipe vê, só o Pedro marca). Confirmar.
4. **"Conteúdos para redes (Allan e Lorena)"** virou 2 itens, um de cada. **"PPT Miolo Thumbs"**
   virou PPT Miolo + Thumbs. Confirmar.
5. **Sugestão da pessoa depende de o formulário dizer o formato.** Hoje ele pede a dor, não a
   peça (decisão do Pedro em 30/05).
   - Proposta: campo opcional "que formato você imagina? (post, vídeo, arte, não sei)", usado
     só para pré-preencher.
   - Sem ele, o Pendente chega sem sugestão e o Pedro escolhe.
6. **Séries 2027 como eventos.** Se a Fase 0 mostrar que não existem, cadastrar pelo
   Planejamento Anual (que passa a ativar o ciclo) ou por script.
7. **Aline sem login.** Itens de fotografia no nome dela não têm quem marque. O responsável do
   card marca por ela, como hoje.

## 7. Riscos

- **Fechamento automático pelo checklist (Fase 3)** muda o Kanban: card com checklist completo
  vai sozinho para Concluído.
  - A notificação de entrega ao solicitante (`marketing_card_entregue`) é do backend e **não**
    sai pelo trigger. O `PATCH /linha/itens/:id` precisa disparar quando o card fechar.
  - Conferir no piloto se o Pedro quer revisão antes. Se quiser, o gatilho vai para `revisao` em
    vez de `concluido`.
- **Volta para o ciclo (Fase 2)** conclui as `cycle_phase_tasks` de marketing da fase automaticamente. Avisar quem
  acompanha o módulo Eventos.
- **Tabelas fora do git:** se a Fase 0 mostrar tipo diferente do esperado (ex.: `prazo`
  timestamptz), ajustar os casts da Fase 2 antes de aplicar.
