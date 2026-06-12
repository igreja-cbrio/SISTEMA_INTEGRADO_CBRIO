# Módulo Marketing — Arquitetura emergente das decisões

> **Contexto criado em 2026-05-28.** Sketch arquitetural derivado das decisões
> fechadas em `decisoes-em-aberto.md` (D-01 a D-12 fechadas em 2026-05-28 · D-08
> reservada pra Fase 11). **Todas as 6 pendências menores resolvidas em 2026-05-28.**
> Sem código — schema/fluxos/permissões/KPIs em formato de referência. Vai alimentar
> o PRD (Fase 3), os ADRs (Fase 5) e a modelagem (Fase 6). Doc vivo · atualiza
> conforme entendimento amadurece.

---

## 1. Princípio arquitetural

Marketing **não é módulo isolado** — é uma **camada de capacidade + analytics** em
cima do backbone existente de Solicitações, com integração ao **ciclo criativo de
Eventos**, e com possibilidade de **tasks internas geradas pelo Pedro**.

Três origens de demanda alimentam o **Kanban único da equipe**:

```
┌─────────────────────┐
│  origem=solicitacao │ ── Solicitações (com solicitante, SLA, aprovação hierárquica)
└──────────┬──────────┘
           │
┌─────────────────────┐         ┌─────────────────────────┐
│  origem=evento      │ ──────▶ │ Kanban unificado da     │ ── consome ──▶ Calendário/capacidade
│  (kanban_tasks      │         │ equipe Marketing        │                  ↑
│   de Eventos)       │         │ (com etiqueta de tipo + │      compromissos recorrentes
└─────────────────────┘         │  habilidade alvo +      │       (fotos domingo, série...)
                                │  origem identificada)   │
┌─────────────────────┐         │                         │
│  origem=interna     │ ──────▶ │                         │
│  (Pedro cria direto │         └─────────────────────────┘
│   no /marketing)    │
└─────────────────────┘
```

---

## 2. Schema — delta no Solicitações (TRANSVERSAL · afeta todas as áreas)

A D-04 (aprovação hierárquica pelo diretor da área de origem) é **mudança no backbone**
— vai pra **spec 001**, antes das specs do Marketing. Afeta cozinha, manutenção,
logística, TI, RH, financeiro **e** as áreas criativas novas que entrarem.

### Colunas novas em `solicitacoes`

| Coluna | Tipo | Uso |
|---|---|---|
| `aprovacao_origem_diretor_id` | UUID FK profiles | Diretor do setor do solicitante |
| `aprovacao_origem_status` | enum | `pendente` / `aprovada` / `rejeitada` / `dispensada` |
| `aprovacao_origem_em` | timestamptz | Quando o diretor decidiu |
| `aprovacao_origem_motivo` | text | Obrigatório se `rejeitada` |
| `urgencia_decisao` | enum | `nao_aplicavel` / `pendente` / `aceita` / `recusada` |
| `urgencia_decidida_por` | UUID FK profiles | Coordenador da área alvo (ex: Pedro) |
| `urgencia_motivo_recusa` | text | Obrigatório se `recusada` |
| `urgencia_decidida_em` | timestamptz | |

### Novo status no Kanban de Solicitações

`aguardando_aprovacao_origem` — vem ANTES de `pendente`. Sequência completa do happy path:

```
nova
  → aguardando_aprovacao_origem     (diretor de origem decide)
  → pendente                        (área alvo recebe)
  → aguardando_aprovacao_financeira (se alçada exigir · já existe)
  → em_atendimento
  → aguardando_entrega
  → concluido
  → avaliado                        (NPS preenchido)
```

### Tabela `setor_diretor` (mapping da aprovação hierárquica)

```
setor_diretor
├── setor        text PRIMARY KEY     -- 'Gestão' | 'Criativo' | 'Ministerial'
├── diretor_id   uuid REFERENCES profiles(id)
├── diretor_nome text                  -- snapshot pra display
└── updated_at   timestamptz
```

**Seed final (confirmado 2026-05-28 · só 3 diretorias):**

| Setor | Diretor |
|---|---|
| Gestão | Eduardo Gnisci |
| Criativo | Pedro Menezes |
| Ministerial | Arthur Serpa |

Todo **funcionário** (`rh_funcionarios` ativo + `profiles` vinculado) precisa cair
numa dessas 3. Na implementação:
- Listar `DISTINCT profile.area` do banco.
- Mapear cada valor a uma das 3 diretorias (ex: `'Pastoral'` → Ministerial,
  `'Online'` → conforme estrutura, etc).

**Quem pode solicitar.** **Apenas funcionários** (com vínculo `rh_funcionarios`
ativo). Membros não-funcionários **não criam solicitação** (Marcos 2026-05-28:
*"membros não fazem solicitações"*). RLS bloqueia POST `/api/solicitacoes` se
`current_user_funcionario_id() IS NULL`. Não há fallback — quem não é funcionário
simplesmente não consegue abrir o formulário.

### Regras de aprovação hierárquica

1. Solicitante de setor X → busca diretor em `setor_diretor`.
2. Solicitação nasce em `aguardando_aprovacao_origem`, atribuída ao diretor.
3. **Casos que DISPENSAM aprovação** (`aprovacao_origem_status='dispensada'`):
   - Solicitante é **um dos 3 diretores** (Eduardo · Pedro Menezes · Arthur Serpa) — *Marcos 2026-05-28: "os próprios diretores pulam isso"*.
   - Solicitante é **Pr.Pedrão** ou **Pr.Juninho** — *Marcos 2026-05-28: "o pedrão e juninho pulam isso"* (regra técnica: `is_diretoria_geral=true`).
   - **Falha técnica** (sem diretor cadastrado, profile.area sem mapping conhecido) → fallback pros **super-admins** (Marcos + Matheus) + alerta — *Marcos 2026-05-28: "pode ser para os admins"*.
4. Aprovado → vai pra fila da área alvo (`pendente`).
5. Rejeitado → solicitante notificado com motivo · status `rejeitada` · **imutável** (não pode ser reaberta — *Marcos 2026-05-28: "não, não pode reabrir"* · solicitante cria nova com ajustes).

---

## 3. Schema — específico do Marketing

### `marketing_membros` (quem produz, com qual habilidade)

```
marketing_membros
├── id             uuid PRIMARY KEY
├── profile_id     uuid REFERENCES profiles(id)
├── habilidade     text  -- 'videomaker' | 'fotografo' | 'designer' | 'social_media' | 'social_media_assistente'
├── horas_semanais numeric DEFAULT 30
├── ativo          boolean DEFAULT true
├── observacao     text
├── created_at     timestamptz
├── deleted_at     timestamptz
└── UNIQUE (profile_id, habilidade)
```

Seed inicial (D-03):

| Nome | Habilidade |
|---|---|
| Allan | videomaker |
| Aline | fotografo |
| Cauã | designer |
| Lorena Pariz | social_media |
| Letícia | social_media_assistente |

Antes do seed: verificar quem já existe em `rh_funcionarios`/`profiles` (vincular por
email); criar quem faltar.

### Etiquetas (taxonomia DUPLA · Marcos 2026-05-28)

Cada card tem **duas etiquetas combinadas**: TIPO de entregável × DESTINO. Display
combinado: *"Artes · Interno"* · *"Vídeos · Institucional"* · *"Fotos · Eventos e Séries"*.

**`marketing_etiquetas_tipo`** (seed final · 8 valores):

| Slug | Nome | Habilidade padrão |
|---|---|---|
| `redes_sociais` | Redes Sociais | social_media |
| `artes` | Artes | designer |
| `pecas_fisicas` | Peças Físicas | designer |
| `mockup` | Mockup | designer |
| `videos` | Vídeos | videomaker |
| `fotos` | Fotos | fotografo |
| `impressos` | Impressos | designer |
| `identidade_marca` | Identidade da Marca | designer |

**`marketing_etiquetas_destino`** (seed final · 5 valores):

| Slug | Nome |
|---|---|
| `interno` | Interno |
| `externo` | Externo |
| `institucional` | Institucional |
| `eventos_series` | Eventos e Séries |
| `campanhas` | Campanhas |

**Schema (mesmo padrão pras duas tabelas):**

```
marketing_etiquetas_tipo / marketing_etiquetas_destino
├── id                uuid PRIMARY KEY
├── slug              text UNIQUE
├── nome              text
├── habilidade_padrao text          -- só na tabela tipo
├── esforco_medio_h   numeric       -- só na tabela tipo · começa NULL · calibra com cycle time real
├── cor               text
├── ativo             boolean
└── created_at        timestamptz
```

### `marketing_capacidade_override` (ajustes pontuais por semana)

```
marketing_capacidade_override
├── id                uuid PRIMARY KEY
├── membro_id         uuid REFERENCES marketing_membros(id)
├── semana_inicio     date           -- segunda-feira
├── horas_disponiveis numeric        -- override (ex: férias, evento atípico)
├── motivo            text
└── UNIQUE (membro_id, semana_inicio)
```

### `marketing_compromissos_recorrentes` (slot fixo · D-13, esboço pra Fase 6)

```
marketing_compromissos_recorrentes
├── id          uuid PRIMARY KEY
├── membro_id   uuid REFERENCES marketing_membros(id)
├── dia_semana  smallint  -- 0..6 (dom..sáb)
├── hora_inicio time
├── duracao_h   numeric
├── descricao   text       -- "cobertura culto domingo 10h"
├── ativo       boolean
└── deleted_at  timestamptz
```

Recorrentes **consomem capacidade ANTES** de qualquer atribuição de demanda. Modelagem
fina na Fase 6.

**Seed inicial (Marcos 2026-05-28 · valores preliminares · Pedro/Marcos refinam via UI):**

| Membro | Dia | Hora início | Duração | Descrição |
|---|---|---|---|---|
| Aline | Domingo (0) | 08:30 | ~6h | Foto dos cultos (08:30 · 10:00 · 11:30 · 19:00) |
| Allan | Quarta (3) | a definir com ele | **~4h (média · variável)** | Gravação de vídeos |
| Lorena Pariz | Seg-Sáb (1-6) | a definir com ela | **3h/dia** | Atendimento de redes sociais + postagens |

Cauã (designer) e Letícia (social_media_assistente) **não têm recorrente fixo** —
ficam livres pra demanda pontual.

**Editável pela UI** (Marcos 2026-05-28: *"faça um lugar que eu possa mudar isso
posteriormente quando for bater com o Pedro Paiva"*). A **spec 010** (admin do
módulo) inclui CRUD de `marketing_compromissos_recorrentes` direto na plataforma —
Pedro/Marcos ajustam hora/duração sem migration nova. O seed acima é só ponto de
partida.

### `marketing_kanban_cards` (cards da equipe · 3 origens)

```
marketing_kanban_cards
├── id                   uuid PRIMARY KEY
├── origem               text CHECK (origem IN ('solicitacao','evento','interna'))
├── solicitacao_id       uuid REFERENCES solicitacoes(id)    -- se origem=solicitacao
├── evento_task_id       uuid REFERENCES kanban_tasks(id)    -- se origem=evento
├── titulo               text
├── etiqueta_tipo_id     uuid REFERENCES marketing_etiquetas_tipo(id)     -- opcional em origem=interna
├── etiqueta_destino_id  uuid REFERENCES marketing_etiquetas_destino(id)  -- opcional em origem=interna
├── atribuido_a          uuid REFERENCES marketing_membros(id)             -- opcional em origem=interna
├── prazo_preliminar     timestamptz  -- D-07 · calculado no intake
├── prazo_confirmado     timestamptz  -- preenchido por Pedro · editável a qualquer momento
├── estado               text DEFAULT 'fila'  -- fila | em_producao | aguardando_solicitante | concluido
├── estado_atualizado_em timestamptz           -- timestamps por estado = cycle time
├── tem_revisao          boolean DEFAULT false -- D-14 · máx 1 revisão · vai pro fim da fila
├── ordem_fila           bigserial             -- pra "ir pro fim da fila" quando revisão pedida
├── entregue_em          timestamptz
├── created_at           timestamptz
├── deleted_at           timestamptz
└── CHECK por origem (FK correto)
```

### `marketing_entregaveis` (D-09 · SharePoint)

```
marketing_entregaveis
├── id                 uuid PRIMARY KEY
├── card_id            uuid REFERENCES marketing_kanban_cards(id)
├── sharepoint_path    text
├── sharepoint_item_id text       -- ID do item no Graph API
├── nome_arquivo       text
├── tipo_mime          text
├── tamanho_bytes      bigint
├── enviado_por        uuid REFERENCES profiles(id)
├── enviado_em         timestamptz
└── deleted_at         timestamptz
```

Upload via Microsoft Graph (mesma stack do Cérebro CBRio). Solicitante baixa via aba
de Solicitações (signed URL ou link direto · validar RLS da biblioteca).

---

## 4. Fluxo completo (happy path) — exemplo

**Pr.Wesley pede uma arte do retiro X.**

```
1. Wesley abre /solicitacoes/nova
   ├── tipo: 'arte_simples'
   ├── área alvo: Marketing
   ├── descrição + briefing anexo
   └── data necessária: 2026-06-15

2. Sistema mostra ESTIMATIVA PRELIMINAR (D-07)
   └── "estimativa preliminar: 5 dias úteis"  (lê capacidade × tipo)

3. Submit → solicitação criada
   ├── Wesley pertence ao setor Ministerial (via profile.area mapeada)
   ├── aprovacao_origem_status = 'pendente'
   ├── aprovacao_origem_diretor_id = Arthur Serpa
   └── kanban status = 'aguardando_aprovacao_origem'

4. Arthur Serpa notificado
   ├── Acessa Solicitações > aba "Aprovar"
   ├── Aprova → status='aprovada' → vai pro Marketing (status='pendente')
   └── OU Rejeita com motivo → solicitante notificado, fim (não reabre)

5. Pedro Paiva notificado (fila Marketing)
   ├── Vê novo card no kanban Marketing (origem=solicitacao, etiqueta=arte_simples)
   ├── Atribui ao Cauã (designer)
   ├── Confirma prazo (ou ajusta) → prazo_confirmado
   └── Wesley notificado: "prazo confirmado: DD/MM"

6. Cauã trabalha
   ├── Move card pra 'em_producao' (timestamp = início do cycle time)
   ├── Produz
   └── Move pra 'aguardando_solicitante' + envia preview → Wesley notificado

7. Wesley revisa
   ├── Aprova → Cauã anexa arquivo final (SharePoint, marketing_entregaveis)
   │            → status='concluido' → sistema solicita NPS (D-12)
   └── Sugere revisão (botão · só 1 vez · NÃO é padrão · só se necessário)
       → tem_revisao=true · card volta pra 'em_producao'
       → ordem_fila atualizada pro FIM da fila (despriorizado · Marcos 2026-05-28)
       → botão "Sugerir revisão" some (não pode mais pedir nesta solicitação)

8. NPS preenchido → status='avaliado' → KPIs ADM-C-* + MKT-* alimentados
```

### Variantes

- **Wesley marca urgente** → no passo 5 Pedro tem "Aceitar urgência" / "Recusar com motivo".
  Aceitar = raia rápida (prioridade alta). Recusar = motivo registrado, fluxo normal, solicitante notificado.
- **Origem evento** → card nasce no kanban Marketing quando ciclo criativo de Eventos
  é ativado (template auto). Pedro atribui igual.
- **Origem interna** → Pedro cria direto do `/marketing` (**NÃO** passa por
  Solicitações · confirmado por Marcos 2026-05-28: *"ele cria task direto no
  marketing não em solicitações"*). Sem solicitante externo, sem SLA contratual.
  **Etiqueta e atribuição opcionais** no formulário interno — Pedro pode preencher
  ou deixar em branco pra alocar depois (Marcos 2026-05-28: *"não precisa deixar
  obrigatório, mas ele deve poder colocar a etiqueta e atribuir a algum dos seus
  colaboradores"*). Card vai pro mesmo kanban e consome capacidade igual.

---

## 5. Permissões consolidadas (D-11)

| Perfil | Cargo | Acesso ao módulo Marketing | Como acompanha demandas |
|---|---|---|---|
| Pedro Paiva | `coordenador-marketing` + área Marketing | nível 5 (admin · `AREA_MODULO_BOOST`) | tudo · calendário consolidado · analytics |
| Allan/Aline/Cauã/Lorena Pariz/Letícia | `assistente-marketing` + área Marketing | nível 3 (escopo_proprio · também via boost) | sua semana · fila geral read-only |
| Arthur Serpa | `diretor-ministerial` | nível 1 (read) | analytics (sem editar) · aprova solicitações ministeriais via Solicitações |
| Diretoria geral (5 nominais) | varia | nível 1 (read) | analytics |
| Solicitante (qualquer funcionário) | varia (precisa `rh_funcionarios` ativo) | **0 (não acessa o módulo)** | aba de Solicitações que já existe |
| Membro comum (sem vínculo RH) | `membro` | 0 | **não solicita** (Marcos 2026-05-28: *"membros não fazem solicitações"*) |

Usa `AREA_MODULO_BOOST['marketing'] = 'marketing'` (mesmo padrão de kids/ami/bridge/online).

---

## 6. Notificações (D-12 final · + 3 da aprovação hierárquica)

| Evento | Destinatário(s) |
|---|---|
| Nova solicitação aguardando aprovação | Diretor de origem |
| Aprovada pelo diretor de origem | Solicitante + responsável da área alvo |
| Rejeitada pelo diretor de origem | Solicitante (com motivo) |
| Prazo confirmado pelo coordenador alvo | Solicitante |
| Urgência aceita | Solicitante |
| Urgência recusada | Solicitante (com motivo) |
| Mudança de status | Solicitante + responsável |
| "Aguardando solicitante" há 24h | Solicitante |
| Concluído → pede NPS | Solicitante |
| SLA estourando em 24h | Coordenador alvo + responsável |

Integra com `notificacaoGenerator.js` (padrão do CBRio).

---

## 7. KPIs (D-06 · todos alimentam OKR de marketing)

KPIs `ADM-C-*` já seedados (3 SLA + 3 NPS pra produção/adoração/marketing) passam a
ter dado real assim que o módulo entrar no ar.

KPIs novos propostos:

| Slug | Nome | Periodicidade | Fonte automática |
|---|---|---|---|
| `MKT-PRAZO` | % de demandas no prazo acordado | semanal | `entregue_em ≤ prazo_confirmado` / total entregues |
| `MKT-DEM-CAP` | Razão demanda/capacidade | semanal | Σ(esforco_medio_h da fila) / Σ(horas disponíveis - recorrentes) |
| `MKT-LEAD` | Lead time médio | semanal | avg(`entregue_em - created_at`) |
| `MKT-THROUGHPUT` | Throughput semanal | semanal | count cards entregues na semana |

Implementação técnica: registrar em `kpi_indicadores_taticos` com
`area='marketing'`, `fonte_auto='marketing.<slug>'`, coletor em
`kpiAutoCollector.js`, trigger SQL pra recalcular real-time. Valores na matriz NSM:
a definir com Marcos (provavelmente `valores='{}'` — não entra na mandala, fica em
`/minha-area`).

---

## 8. Primeira spec: estender o Solicitações (TRANSVERSAL · anterior às do Marketing)

**Spec 001 (proposta) · "Aprovação hierárquica pelo diretor da área de origem no Solicitações"**

Escopo:
- Migration: novas colunas em `solicitacoes`, novo status, tabela `setor_diretor` + seed (só 3 linhas: Gestão→Eduardo, Criativo→Pedro Menezes, Ministerial→Arthur Serpa).
- Listar `DISTINCT profile.area` do banco e atribuir cada valor a uma das 3 diretorias (parte da migration · documentar mapeamento).
- Backend: lógica de roteamento da aprovação · regras de dispensa (3 diretores + Pedrão + Juninho + fallback super-admins) · endpoints aprovar/rejeitar.
- **RLS na criação**: POST `/api/solicitacoes` exige `current_user_funcionario_id() IS NOT NULL` (apenas funcionários solicitam · Marcos 2026-05-28).
- Frontend: aba "Pendências de aprovação" pro diretor de origem · badge no card · fluxo visual.
- Notificações: 3 novas regras (`notificacaoGenerator.js`).
- Testes: aprovação normal · rejeição (imutável) · dispensa por diretor · dispensa por `is_diretoria_geral` · fallback super-admins · **bloqueio de membro não-funcionário** (POST rejeitado se sem `funcionario_id`).

Esforço estimado: M-L (mudança coesa e testável independente).

**Depois disso**, as specs específicas do Marketing começam (002+):

| # | Spec | Esforço estimado |
|---|---|---|
| 002 | Schema Marketing (`marketing_membros`, `marketing_etiquetas`, `marketing_kanban_cards`, `marketing_entregaveis`, `marketing_capacidade_override`) | M |
| 003 | Seed da equipe inicial + verificação/criação em `rh_funcionarios`/`profiles` | S |
| 004 | Backend: rotas do módulo + cálculo de prazo preliminar + cycle time tracking | M-L |
| 005 | Frontend Kanban Marketing (3 origens · etiquetas tipo+destino · atribuição · formulário de task interna do Pedro · **edição livre do card pelo coordenador a qualquer momento**) | L |
| 006 | Calendário de capacidade (líder vs colaborador) | L |
| 007 | Estado `aguardando_solicitante` + integração no fluxo · **botão "Sugerir revisão" (1x · vai pro fim da fila)** | S-M |
| 008 | Upload SharePoint (Microsoft Graph) + visualização no Solicitações | M |
| 009 | KPIs novos (`MKT-*`) + coletores + integração OKR | M |
| 010 | **Admin do módulo** · CRUD `marketing_membros` (habilidade, horas semanais) + etiquetas tipo/destino (esforço médio editável) + `marketing_compromissos_recorrentes` (hora/duração editáveis pelo Pedro) + `marketing_capacidade_override` (férias / pico) | M |
| 011+ | Raia rápida (urgência aceita) · analytics gargalo Arthur Serpa · modo pico fev/mai · ... | a decompor |

Decomposição completa na Fase 8.

---

## 9. Pendências menores

### Resolvidas em 2026-05-28

1. ✅ **Mapeamento setor → diretor.** Apenas 3 diretorias: Gestão→Eduardo,
   Criativo→Pedro Menezes, Ministerial→Arthur Serpa. Todo funcionário se enquadra
   numa das 3. Na implementação, mapear cada `DISTINCT profile.area` do banco a
   uma das 3.
2. ✅ **Pastores seniores (Pr.Pedrão, Pr.Juninho).** Pulam aprovação
   (`is_diretoria_geral=true`), igual aos 3 diretores.
3. ✅ **Diretor de origem ausente/de férias.** Fallback pros super-admins (Marcos
   + Matheus).
4. ✅ **Pedro cria task interna.** Etiqueta e atribuição **opcionais** (não
   obrigatórias), mas ele pode preencher. **Cria direto em `/marketing`, NÃO em
   Solicitações.**
5. ✅ **Solicitação rejeitada pode ser reaberta?** **Não.** Solicitante cria nova
   com ajustes.

### Também resolvida em 2026-05-28

6. ✅ **Membros não-funcionários que solicitam.** **Não acontece.** Marcos: *"membros
   não fazem solicitações"*. Apenas funcionários (`rh_funcionarios` ativo) criam
   solicitação. RLS bloqueia POST `/api/solicitacoes` se
   `current_user_funcionario_id() IS NULL`.

**Todas as pendências estratégicas estão fechadas.** Próximo bloqueio do PRD: dado
do discovery interno pra calibrar taxonomia + esforço + recorrentes.

---

## 10. Contexto operacional (Marcos 2026-05-28)

Inputs informais do Marcos · alimentam o dimensionamento e o PRD.

**Volume.** ~**5-10 demandas/semana** (incluindo internas que o Pedro mesmo cria).
Volume baixo — módulo é mais sobre **organização** do que sobre escala. Não precisa
otimizar pra 100+/semana.

**80% da demanda vem das áreas de culto** (AMI, Kids, Sede, Bridge, Online).
Implicação: a maioria das solicitações passa pelo **Arthur Serpa** (diretor
ministerial) na aprovação hierárquica. ⚠️ Monitorar **possível gargalo no Arthur** —
se demora pra aprovar, atrasa a fila inteira do marketing. Tratar em analytics
(tempo médio do Arthur aprovando) e considerar regra de **escalação automática** se
ficar parado >24h (Fase 11).

**Picos sazonais.** Concentrados em **fevereiro e maio** — retiro do AMI, retiro do
Genesis e aniversário da igreja. Capacidade da equipe enche nesses meses. MVP não
trata especial; pra Fase 11, considerar "modo pico" com capacidade extra reservada.

**Cultura de revisão.** Praticamente inexistente (Marcos: *"geralmente nenhuma, é
pedido, é respondido, acaba aí"*). D-14 fechada antecipadamente: máximo 1 revisão
por solicitação, só se houver necessidade real, e vai pro fim da fila quando
solicitada. Não é padrão de processo. Isso favorece briefing melhor de início.

**Edição livre pelo coordenador.** Pedro pode editar qualquer campo do card em
qualquer estado (etiquetas tipo/destino, atribuição, prazo, descrição). Alterações
vão pro audit log padrão do projeto.

**Equipe pequena com recorrentes definidos.** Aline (domingo · foto) + Allan
(quarta · vídeo) + Lorena Pariz (diário · social). Cauã e Letícia ficam livres pra
demanda. O cálculo de capacidade subtrai os recorrentes antes de oferecer slot pra
solicitação nova.

---

*Próximo doc da série: `02-prd.md` (Fase 3). Bloqueios estratégicos limpos · só
falta calibrar hora_inicio/duracao_h dos recorrentes em conversa rápida com a equipe.*
