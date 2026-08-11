# Mudança dos cultos de domingo · contexto e plano

> **Handoff para o Marcos Paulo.** Documento vivo, escrito para outra sessão do
> Claude Code conseguir continuar sem repetir o levantamento. Tudo que está aqui
> foi **medido no banco de produção** ou lido no código — quando é suposição,
> está dito.
>
> Estado em **2026-08-05**: ⚠️ **NADA foi alterado no sistema.** Nem migration,
> nem dado, nem código. Há **5 perguntas abertas** (seção 7) que travam a
> execução — não decidir por conta.

---

## 1. O que muda, e quando

A partir da semana de **24/08/2026 (segunda)**, para que o domingo **30/08/2026**
já aconteça no formato novo, o domingo passa de **quatro para três cultos**.

| Hoje | A partir de 24/08/2026 |
|---|---|
| 08:30 | **encerra** (histórico preservado) |
| 10:00 | **09:30** — mas ver a seção 3, isto é uma LENTE, não um rename |
| 11:30 | 11:30 |
| 19:00 | 19:00 |

**O corte é 24/08 e não 30/08 de propósito.** A semana de frequência deste
sistema é **seg→dom** (`isoWeekRange` em `backend/routes/dashboardSemanal.js` —
⚠️ NÃO confundir com a semana do financeiro, que é **qua→ter** via
`fn_fin_semana_qua_ter`; as duas divergem por decisão registrada no CLAUDE.md).
Logo, a semana do domingo 30/08 começa em **24/08**, e a **quarta 26/08** cai
dentro dela — que foi o pedido explícito do Matheus: "a quarta que vem antes do
domingo do dia 30 já deve vir arquitetada na semana com horário novo".

Verificado no banco: `2026-08-30` é domingo, `2026-08-26` é quarta,
`date_trunc('week', '2026-08-30')` = `2026-08-24`.

**Só o domingo muda.** Quarta Com Deus (qua 20:00), AMI (sáb 20:00) e Bridge
(sáb 17:00) seguem intactos.

---

## 2. Estado medido (produção, 2026-08-05)

### `vol_service_types` — os 4 cultos de domingo (`recurrence_day = 0`)

| Nome | id | Hora | Cultos | 1º culto | Futuros pré-agendados |
|---|---|---|---|---|---|
| Domingo 08:30 | `6a1e566d-e335-4afe-b7f7-46abbd717944` | 08:30 | **209** | 2023-01-01 | 20 |
| Domingo 10:00 | `2fea5701-7f8e-4774-895f-3b18b23021da` | 10:00 | **106** | 2024-12-22 | 20 |
| Domingo 11:30 | `78fadd07-7a83-4bbb-b924-0726aff1901f` | 11:30 | **209** | 2023-01-01 | 20 |
| Domingo 19:00 | `389361d6-0127-4929-beed-b1a9f833551a` | 19:00 | **207** | 2023-01-01 | 20 |

⚠️ O 10:00 é **recente** (dez/2024). O 08:30 tem o histórico mais longo da casa.

### Presença média — últimos 10 domingos com dado lançado

| Culto | Domingos | Média adulto | Média adulto+kids | Peso no domingo |
|---|---|---|---|---|
| 08:30 | 10 | 161 | **174** | ~10% |
| 10:00 | 10 | 424 | **499** | ~28% |
| 11:30 | 10 | 635 | **724** | ~41% |
| 19:00 | **9** | 333 | **364** | ~21% |
| **Domingo inteiro** | — | ~1.553 | **~1.761** | 100% |

(O 19:00 tem 9 e não 10 porque falta o lançamento de 05/07/2026.)

### Dois fatos que mudam o desenho

**(a) `cultos.hora` existe e está 100% preenchida.** A tabela `cultos` tem coluna
própria `hora` (`time without time zone`), preenchida em **todas** as 731 linhas
de domingo, e sempre igual ao `recurrence_time` do tipo (0 divergências). Ou
seja: **o horário verdadeiro de cada culto passado está gravado na própria
linha**, não só derivado do tipo.

⚠️ **MAS a maior parte do código lê o `recurrence_time` do TIPO, não o
`cultos.hora`.** Contagem de ocorrências por arquivo (medida na `main` em
0b15f715 — contagem em vez de número de linha de propósito, porque linha
envelhece a cada PR):

| Arquivo | Ocorrências de `recurrence_time` |
|---|---|
| `backend/routes/totemKids.js` | 14 |
| `backend/routes/voluntariado.js` | **12** |
| `backend/routes/dashboardSemanal.js` | 9 |
| `backend/routes/kpis.js` | 6 |
| `src/pages/ministerial/voluntariado/VolTiposCulto.tsx` | 5 |
| `backend/services/onlineCollectors.js` | 5 |
| `src/components/dashboard-semanal/DashSemanalAba.jsx` | 4 |
| `backend/routes/membresia.js` | 4 |

Quem lê o `cultos.hora`: `src/components/CalendarioCultos.jsx` — e não só para
ordenar (216): ele **exibe** o horário da própria linha do culto (427, 513, 567).
Também `src/pages/ministerial/totemKids/TotemKidsCheckin.tsx` (lista de cultos do
dia, período, rótulo).

**Consequência prática:** renomear o `recurrence_time` de um tipo faria o passado
ser **exibido** com o horário novo em quase todo o sistema, mesmo com o dado
correto guardado. O Calendário seria a exceção — ele continuaria mostrando a
verdade, e a divergência entre as duas telas confundiria mais do que ajudaria.
É parte do motivo de a decisão da seção 3 ser a que é.

**(b) Os 18 cultos futuros por tipo a partir de 24/08 estão TODOS sem dado**
(`presencial_adulto = 0` e `presencial_kids = 0`). Mexer neles não destrói nada.
Isso é o fenômeno já documentado no CLAUDE.md: o ano nasce pré-agendado até
dezembro com frequência 0 (cuidado ao somar "o ano" — ver a seção do YTD).

---

## 3. ⚠️ A DECISÃO CENTRAL: duas lentes, nada de rename

O Matheus foi explícito: **não quer escolher** entre "o 10:00 vira 09:30" e "o
09:30 nasce novo". Quer **um filtro para ver as duas realidades**, e a diretoria
decide com o tempo qual caminho seguir.

- **Lente "continuidade"** — o culto das 10:00 vira o das 09:30. Uma série só,
  sem quebra, desde dez/2024.
- **Lente "separada"** — o 09:30 nasce novo; o 10:00 encerra junto com o 08:30.
  Duas séries terminam, uma começa.

### Como isso se implementa (e por que NÃO é rename)

**Criar o `Domingo 09:30` como tipo NOVO** e acrescentar uma informação de
**linhagem** dizendo que `Domingo 10:00` e `Domingo 09:30` são o mesmo assento na
grade. Com isso:

- a lente **separada** é o dado cru, sem transformação;
- a lente **continuidade** é uma agregação que junta os dois pela linhagem.

⚠️ **Renomear o 10:00 seria um caminho SEM VOLTA para a lente separada.** Foi a
recomendação inicial do Claude no PDF de decisão, e **está errada para este
requisito** — fica registrado para ninguém "simplificar" de volta para rename.
Nada de renomear `name` nem `recurrence_time` de tipo existente.

### A simplificação que isso revela

| Nível de agregação | As duas lentes divergem? |
|---|---|
| **Por culto** | **SIM** — é o único nível onde a identidade importa |
| **Por turno** (manhã/noite) | **NÃO** — mesmo turno, 3 cultos antes e 2 depois |
| **Por domingo** (dia inteiro) | **NÃO** — mesma congregação, mesmo dia |

**A complexidade das duas realidades fica contida na visão por culto.** Nos
níveis de turno e de domingo, as duas lentes dão o mesmo número — o que também
explica por que a visão por turno responde direto a pergunta do Matheus ("como
era com 3 cultos de manhã e como fica com 2"): o turno é o recorte que sobrevive
à mudança.

---

## 4. O problema das médias (é aritmética, não bug)

Mesmo público, denominador menor:

| | Cultos | Público do domingo | Média por culto |
|---|---|---|---|
| Hoje | 4 | ~1.761 | **~440** |
| A partir de 30/08 | 3 | ~1.761 | **~587** |

**A média por culto sobe ~33% sem uma pessoa nova entrar.** Sem marcar o corte,
o gráfico de setembro parece crescimento que não houve.

Isto conversa com a lição já registrada no CLAUDE.md na seção do YTD: *"Total
absoluto e MÉDIA POR CULTO andam sempre juntos"* — o nº de cultos no mesmo
período subiu ano a ano porque a igreja abriu horários (154 em 2023 → 199 em
2026). Agora ele **desce**, pela primeira vez, e a distorção inverte de sinal.

**Imune à mudança:** total absoluto, frequência por domingo, frequência por
turno. **Sobe de verdade (e é informação útil):** ocupação de assentos — o mesmo
público em 3 cultos deixa cada culto mais cheio; serve para avaliar se o 11:30,
que já faz ~724, tem folga.

---

## 5. Taxonomia de TURNO — reusar, não inventar

O turno **já existe** no sistema, criado para o voluntariado na migration
`20260705140000_checkin_nome_e_regua_cultos.sql`:

| Bloco | id | Dia | Hora âncora |
|---|---|---|---|
| Domingo Manhã | `b10c0000-0000-0000-0000-000000000001` | 0 | 08:30 |
| Domingo Noite | `b10c0000-0000-0000-0000-000000000002` | 0 | 19:00 |
| Quarta | `b10c0000-0000-0000-0000-000000000003` | 3 | 20:00 |
| AMI | `b10c0000-0000-0000-0000-000000000004` | 6 | 20:00 |
| Bridge | `b10c0000-0000-0000-0000-000000000005` | 6 | 17:00 |

É por isso que, no Dashboard Semanal, clicar em "Domingo Manhã" abre os cultos
das 08:30/10:00/11:30 dentro (`DashSemanalAba.jsx:904`, `dashboardSemanal.js:394`).

⚠️ **A hora âncora do bloco "Domingo Manhã" é 08:30** — o culto que vai encerrar.
Conferir se ela é usada só para ordenação/rótulo ou se alguma régua depende dela.

⚠️ O CLAUDE.md registra que `vw_dashboard_voluntariado` agrega por **bloco**, e
que esses ids **não são** os de `vol_service_types` — por isso o filtro de culto
não vale naquela view. Não confundir as duas chaves.

---

## 6. O que está DECIDIDO

1. O **08:30 encerra, não é excluído**. Os 209 cultos continuam no histórico, nos
   gráficos anuais e nas comparações. A série termina em 23/08/2026.
2. **Criar o `Domingo 09:30` como tipo novo.** Nenhum tipo existente é renomeado.
3. **Linhagem explícita** ligando `Domingo 10:00` → `Domingo 09:30`, para
   sustentar a lente "continuidade".
4. **Filtro de lente** (continuidade × separada) nos gráficos por culto.
5. **Visão por turno** reusando os blocos da seção 5.
6. **Visão por domingo** como visualização adicional — **não** como número
   principal (pedido explícito).
7. **A data da mudança marcada nos gráficos** (24/08/2026), para análise histórica.
8. Último domingo no formato antigo: **23/08**. Primeiro no novo: **30/08**.

---

## 7. Decisões do Matheus (respondidas em 2026-08-05)

As 5 perguntas que travavam a execução foram respondidas. **Estas são decisões do
dono do produto — não reabrir sem ele:**

1. **Indicadores oficiais (KPI da matriz, meta, NSM) medem por turno ou por
   domingo** — os níveis imunes à mudança. ✅ Concordado.
   ⚠️ **MAS**: o **Dashboard Semanal** e a **Frequência da Integração** precisam
   **também** ter análise **por culto**. Ou seja: por culto continua existindo
   como ANÁLISE nessas duas telas (com a lente), e não é o que alimenta
   indicador oficial.
2. **Abre na lente SEPARADA** (dado cru), com o botão de troca visível.
3. **Nome do culto novo: "Domingo 09:30"** — mesmo padrão de sempre.
   **O rótulo da lente continuidade fica a critério de quem implementa**, desde
   que dê para entender. *Proposta:* legenda **"Domingo 09:30 (era 10:00)"** e o
   botão da lente com os textos **"Cultos separados"** × **"10:00 e 09:30 como o
   mesmo culto"** — nomeia o que a lente faz, em vez de usar jargão.
4. **O 10:00 encerra no mesmo dia que o 08:30**: último domingo dos dois é
   **23/08/2026**. ✅ Confirmado.
5. **Só o domingo muda.** ✅ Confirmado.

**Processo, pedido explicitamente:** ⚠️ **nada é implementado antes de o plano ser
validado**, e **toda etapa deve ser alinhada com o Matheus E com o Marcos Paulo**
para as duas frentes não conflitarem no mesmo arquivo.

---

## 8. Inventário técnico

✅ **VARREDURA CONCLUÍDA (2026-08-11).** 6 dimensões · 113 achados · **53
confirmados** e **14 refutados** em verificação adversarial contra o código e o
banco vivos. **Relatório íntegro: `docs/cultos-domingo/varredura-2026-08-11.md`
(371 linhas) — é a fonte, leia antes de executar.** Resumo do que ele muda:

### 8.1 Existem QUATRO fontes de horário de culto, sem FK entre si

Mexer só no catálogo conserta menos da metade do sistema:

| Fonte | O que é |
|---|---|
| `vol_service_types.recurrence_time` | o catálogo |
| `cultos.hora` + `cultos.nome` | **snapshots congelados** por linha |
| `fin_culto_slots` | janelas de horário do **financeiro**, que roteiam dízimo/oferta para contas contábeis |
| `batismo_horarios` | catálogo de texto da **porta pública de batismo** |

### 8.2 ⚠️ Três itens com PESSOAS REAIS e prazo ANTES de 24/08

- **Batismo público** — oferece 08:30 e 10:00 como `aberto=true`. A partir de
  24/08 o formulário agenda o batismo de **27/09** (já no formato novo)
  oferecendo um culto extinto, e o cron da véspera manda "você será batizada às
  08:30". **As 6 inscrições de 23/08 estão CORRETAS e não devem ser tocadas.**
- **Bot do WhatsApp** — responde "Domingo: 08h30, 10h00, 11h30 e 19h00" a
  qualquer visitante, **por palavra-chave, sem IA**, direto de `whatsapp_config`.
  É dado, sem deploy: a janela é editar **em 24/08**.
- **84 escalas de voluntário já publicadas** para 30/08 e 06/09 ancoradas em
  08:30. ⚠️ **Elas vivem no Planning Center** (`vol_services` com
  `service_type_id` NULL) — um UPDATE no banco é **revertido pelo sync horário**.
  A correção é **no PCO**, não no banco.

### 8.3 ⚠️ O 09:30 cai exatamente na fronteira das janelas financeiras

`fin_culto_slots`: "Domingo 8:30" = 06:00→09:30 · "Domingo 10:00" = 09:30→11:00.
Testado em produção com `fin_identifica_culto` para 30/08: **09:29 → conta
`3.01.01.08 Dizimos Domingo 8:30`; 09:30 → `3.01.01.09 Dizimo Domingo 10:00`**.
O dízimo de **um único culto** parte em **duas contas de cultos extintos**, por
trigger automático, sem gente no caminho. `fin_culto_slots` **tem que ser
recortado** independente de qualquer decisão de nome.

### 8.4 ⚠️ O voluntariado DESCARTA o culto desconhecido (não zera)

A régua é **prefixo de texto do nome**, em **5 cópias**
(`fn_dash_vol_service_no_bloco`, `vw_dashboard_voluntariado`,
`fn_dashboard_voluntariado_composicao`, `_resumo`, `_pessoas`, mais
`volMatch.ts:37`). Nenhuma tem `'Domingo 09%'`. Culto novo → bloco `NULL` →
`WHERE bloco_id IS NOT NULL` → **os check-ins desaparecem do dashboard sem erro,
sem log e sem virar zero visível**. ~520 check-ins já dependem dos nomes
literais.

**Consequência para a ORDEM: a correção da régua vai ao ar ANTES de o tipo
existir.** Se o tipo nascer primeiro, os check-ins do primeiro domingo somem.

### 8.5 ⚠️ O tipo novo nasce quebrado se for criado pela UI

`POST /service-types` **descarta** `has_kids`, `has_online`,
`has_online_stream`, `presencial_label` e `meta_duracao_min`. Sem `has_kids=true`,
**nenhuma criança consegue fazer check-in no culto principal de domingo** — e
**não existe caminho de UI para ligar depois**. Logo: o tipo novo **precisa**
nascer por SQL/migration.

### 8.6 Outros achados que mudam decisão

- **72 cultos futuros** (30/08→27/12) já gravados com hora/nome antigos.
  `gerar_cultos_recorrentes` é **INSERT-ONLY** e dedupa por `(service_type_id,
  data)` **sem comparar hora** → nunca corrige. `cultos.hora` está **fora da
  allowlist** do `PUT /cultos/:id` → só dá para corrigir por SQL.
- **Totem Kids**: com 09:30/11:30 o espaçamento vira 120 min e abre um **buraco
  novo 10:30–11:00** onde a criança é lançada na sessão do 09:30 **já
  encerrada** — e as 4 travas da tela caem juntas. Hoje funciona por acidente
  aritmético (90 min = 60+30).
- **Cultos fantasma** aparecem no totem Kids (`/cultos-do-dia` filtra só
  `has_kids`) e a tela **cria sessão** neles; ao encerrar, o consolidado vai pro
  culto fantasma e o real fica 0. **Soft-delete não resolve.**
- **Apresentação de bebês** amarrada a `startsWith('10:00')` → sem 10:00 cai no
  culto **mais cedo** (o fantasma 08:30), com texto "às 10h" hardcoded. Datas:
  **13/09, 11/10, 08/11**.
- **8 contas contábeis** com horário no nome e **6.828 transações**;
  `vw_fin_dre_mensal` lê o nome **ao vivo** e não há snapshot do rótulo.
- **Dois apps fora do deploy do ERP**: app de membros lê `cultos.hora` direto
  pelo Supabase (anon key) e o **CBRio-Staff tem a grade hardcoded**
  (`index.tsx:276`) — exige **OTA**, não sai no merge.
- 🔴 **ACHADO DE SEGURANÇA**: `DELETE /service-types/:id` é guardado por
  `authorizeModule('membresia', 1)` = **nível de LEITURA**, alcançável por 27
  cargos, atrás de um `confirm()` seco. Um clique **anula `service_type_id` em
  209 cultos** (FK SET NULL → saem retroativamente dos KPIs e do centro da
  mandala) e **apaga em CASCADE** o roteiro de produção, o checklist e o vínculo
  do template de escala. Corrigir o guard é item da Fase 1.
- **`bloco_servico` é armadilha de correção falsa** (D1): 0 leitores, não é
  criada por migration nenhuma (drift), e tem `COMMENT` descrevendo a semântica
  desejada. **Preencher no 09:30 é no-op comprovado** — a minha proposta da
  seção 9.2 de usá-la como chave de turno exige **escrever os leitores do
  zero**, não é "só preencher".
- **Refutados** (não usar como verdade): os crons do `online-live-monitor`
  **não** precisam mudar (09:30 já está coberto); as cores do voluntariado já
  colidem hoje (~94% cai no fallback), logo cor nunca foi identidade ali; e
  parte do achado do WiFi caiu na verificação.

Áreas que a varredura precisa cobrir, e por que cada uma é suspeita:

- **Voluntariado** — o Matheus citou explicitamente: "os voluntários marcam o
  horário que vão servir". Escalas futuras (`vol_schedules`) apontando para o
  08:30/10:00 depois de 24/08 ficariam órfãs.
- **Geração de cultos** — a função `gerar_cultos_recorrentes` e os 18 cultos
  futuros por tipo já materializados até dez/2026.
- **KPI/NSM** — coletores que distinguem culto por **nome** (`isAmiCulto`,
  `isBridgeCulto` e afins em `backend/services/kpiAutoCollector.js`) e as views
  `vw_dashboard_semanal` / `vw_culto_stats` / `vw_culto_historico_anual`.
- **Kids** — `kids_sessoes` por culto e a régua de "sessão do culto atual", que
  usa janela de horário (ver a LEI do check-in v5 no CLAUDE.md).
- **Produção** — `producao_roteiro_etapas` é roteiro **por `service_type_id`**;
  um tipo novo nasce sem roteiro.
  ⚠️ **E a FK é `ON DELETE CASCADE`** (`20260602140000_producao_culto_fundacao.sql:98`):
  apagar um `vol_service_types` **apaga o roteiro dele em cascata**. É mais um
  motivo, agora estrutural, para o 08:30 ser **encerrado e nunca deletado** —
  conferir se outras filhas de `vol_service_types` também são CASCADE antes de
  qualquer limpeza (auditar no catálogo `pg_constraint`, não no arquivo).
- **Crons** — `.github/workflows/online-live-monitor.yml` tem **janelas de
  horário em UTC codificadas no cron** que cobrem os cultos da manhã.
- **Plano de contas** — existem contas nomeadas por horário de culto:
  `3.01.01.08 Dizimos Domingo 8:30`, `3.01.01.09 Dizimo Domingo 10:00`,
  `3.01.02.08 Oferta Domingo 8:30`, `3.01.02.09 Oferta 10:00`. Decidir com o
  financeiro (não renomear conta contábil por conta própria).
- **Frontend** — `CORES_CULTO` e mapas nome→cor: um culto novo aparece **sem
  cor** se não for cadastrado.

---

## 9. ⚠️ Duas armadilhas descobertas no schema (leia antes do plano)

### 9.1 `is_active` NÃO serve para encerrar o 08:30

`vol_service_types.is_active` já existe, e a tentação óbvia é `is_active = false`
no 08:30. **Não funciona**, porque leituras HISTÓRICAS filtram por ele:

| Onde | O que acontece se `is_active = false` |
|---|---|
| `backend/routes/dashboardSemanal.js:84` | o 08:30 **desaparece do Dashboard Semanal**, histórico incluído |
| `backend/routes/kpis.js:81` e `:544` | idem nos KPIs |
| `backend/routes/voluntariado.js:2301` | sai da lista de cultos de domingo de manhã |

Isso é o oposto do requisito ("o histórico do 08:30 deve ser preservado").

**A causa raiz:** hoje `is_active` responde **duas perguntas diferentes** com um
booleano — *"este culto ainda acontece?"* (agendamento futuro) e *"este culto deve
aparecer em análise histórica?"* (leitura do passado). Enquanto nenhum culto tinha
encerrado, as duas respostas coincidiam. **Esta mudança é a primeira vez que elas
divergem** — e é o coração técnico do trabalho.

**Solução:** vigência por DATA (`vigente_de` / `vigente_ate`), e cada leitura
escolhe a pergunta certa:
- **listar cultos que existem/existiram** (gráfico, KPI, histórico) → **não filtra
  vigência**; o recorte é a data do culto;
- **oferecer slot para agendar / gerar culto novo / escalar voluntário** → filtra
  **vigente na data em questão**.

`is_active` fica como está (todos `true`) para não quebrar nada, e passa a
significar só "tipo não foi arquivado". ⚠️ **Não sobrecarregar `is_active` de novo.**

### 9.2 `bloco_servico` existe, tem o formato certo — e está MORTO

`vol_service_types.bloco_servico` já contém `'dom_manha'` nos três cultos da manhã
e `NULL` no 19:00 / Quarta / Bridge / AMI. **Nenhuma linha de código lê essa
coluna** (grep em `backend/` e `src/`: zero ocorrências).

Ou seja: o turno que o Dashboard Semanal mostra no voluntariado **não vem daqui** —
vem dos blocos `b10c0000-…` da migration `20260705140000`. Existem, portanto, **dois
vocabulários de turno** no sistema, um deles dormente.

**Decisão proposta:** usar `bloco_servico` como chave de turno da frequência
(está na mesma tabela do tipo, dispensa join) e **completá-la** (`dom_noite` no
19:00, e os demais), mantendo os **rótulos idênticos** aos do voluntariado
("Domingo Manhã", "Domingo Noite") para não haver dois nomes para a mesma coisa na
cara do usuário. A unificação dos dois mecanismos é dívida técnica **fora do
escopo** desta mudança — anotar, não resolver agora.

---

## 10. Plano de execução

Cada fase diz o que faz, onde, o risco e como verificar. **Nada começa antes da
validação do plano** (pedido do Matheus).

⚠️ **ESTE PLANO FOI ESCRITO ANTES DA VARREDURA E ESTÁ INCOMPLETO.** A ordem
detalhada, com datas e reversibilidade item a item, está no **§5 do
`varredura-2026-08-11.md`** — use aquela. As correções que a varredura impôs
sobre o que está escrito abaixo:

1. **A ordem inverte:** o **código vai ao ar ANTES de qualquer mudança de dado**
   (21–23/08), em especial a régua do voluntariado (§8.4). Meu plano original
   colocava migration na Fase 1 — errado.
2. **O tipo novo nasce por SQL com todas as flags** (§8.5), nunca pela UI.
3. **Quatro pré-requisitos** sem os quais "criar tipo novo" fica **pior** que
   retimar: as flags, o nome no padrão `"Domingo 09:30"` (exigido por
   `isSedeCulto`, pelos 2 ramos de `kpi_calcular_valor_auto` e pela regex do
   pager), a régua do voluntariado antes do tipo, e o vínculo em
   `vol_escala_template_tipos` (senão a escala de 30/08 sai vazia).
4. **`fin_culto_slots` e `batismo_horarios` entram no escopo** — meu plano nem
   os mencionava.
5. **`is_active=false` É o mecanismo correto** para tirar o culto do check-in e
   do dropdown (D15 confirma), mas **não limpa linha já materializada** e tem o
   trade-off do §C16 (o histórico do 08:30 deixa de ser filtrável isoladamente),
   que precisa ser aceito por escrito. Ver 9.1 — o ponto sobre leitura histórica
   segue valendo.
6. **Fazer o UPDATE das 72 linhas em LOTES**: o trigger `cultos_recalc_kpis` é
   `FOR EACH ROW`.

### Fase 0 · Alinhamento (antes de tocar em código)

Combinar com o **Marcos Paulo** quem mexe em quê, porque as duas frentes
disputam os mesmos arquivos: `dashboardSemanal.js`, `DashSemanalAba.jsx`,
`kpis.js`, `voluntariado.js`. Sugestão: uma frente por vez nesses quatro, com PRs
pequenas e sequenciais em vez de uma PR grande.

### Fase 1 · Migration aditiva (reversível)

1. Colunas de vigência em `vol_service_types`: `vigente_de date`, `vigente_ate date`
   (ambas NULL = "sempre valeu / ainda vale").
2. Coluna de linhagem: `linhagem_key text`.
   ⚠️ **Texto, não FK.** Um `sucessor_id uuid REFERENCES vol_service_types(id)`
   exigiria FK (lei nº 10) e cairia direto na armadilha documentada do
   `ADD COLUMN IF NOT EXISTS … REFERENCES`, que engole a constraint quando a
   coluna já existe. `linhagem_key` também é usável direto como `GROUP BY`.
3. Novo tipo **"Domingo 09:30"**: `recurrence_day = 0`, `recurrence_time = '09:30'`,
   `presencial_label = 'Sede'`, `has_kids = true`, `has_online = true`,
   `bloco_servico = 'dom_manha'`, `vigente_de = '2026-08-24'`, cor nova (as
   ocupadas: `#00B39D` 08:30 · `#10b981` 10:00 · `#3b82f6` 11:30 · `#8b5cf6` 19:00).
4. `vigente_ate = '2026-08-23'` no **08:30** e no **10:00**.
5. `linhagem_key`: o **10:00 e o 09:30** recebem a mesma chave (ex.:
   `'dom_2o_manha'`). O 08:30 recebe a sua própria; 11:30 e 19:00 idem.
6. Completar `bloco_servico`: `dom_noite` no 19:00 (e os demais tipos), com os
   rótulos batendo com os do voluntariado.

**Verificar:** conferir no **catálogo** (`information_schema` / `pg_constraint`),
não no arquivo — lição registrada. **Reverter:** dropar as 2 colunas e o tipo novo
(que ainda não tem culto).

### Fase 2 · Cultos futuros (a fase que exige mais cuidado)

A partir de **2026-08-24**: apagar os cultos do 08:30 e do 10:00, criar os do 09:30.

⚠️ **Reconferir na hora da execução que nenhum tem dado lançado.** Hoje são 18 por
tipo, todos zerados — mas alguém pode lançar antes. A query de guarda tem de rodar
**na transação**, não no dia anterior. Se houver dado, **parar e perguntar**.

⚠️ `gerar_cultos_recorrentes` precisa **respeitar a vigência**, senão o próximo
cron recria o 08:30. Ler a função antes de mexer.

⚠️ Conferir se apagar culto futuro tem cascata (kids_sessoes, culto_producao,
vol_schedules). **Auditar no catálogo.**

**Não reversível** se apagar culto com dado. Reversível enquanto zerado (basta
regerar).

### Fase 3 · Backend: lente e agrupamento

Parâmetros novos nos endpoints de agregação: `lente = separada | continuidade` e
`agrupar = culto | turno | domingo`.

- `separada` → agrupa por `service_type_id` (dado cru, **padrão**)
- `continuidade` → agrupa por `coalesce(linhagem_key, id::text)`
- `turno` → agrupa por `bloco_servico`
- `domingo` → agrupa por `data`

Endpoints: `dashboardSemanal.js` (resumo / mensal / ytd / série), a frequência da
Integração, e as séries do `painel.js`.

⚠️ **Remover o filtro `is_active` das leituras históricas** (`dashboardSemanal.js:84`,
`kpis.js:81`, `kpis.js:544`) — ver 9.1. É a mudança mais delicada do backend,
porque hoje ela é o que esconde tipo arquivado; conferir caso a caso o que cada
uma quis dizer com `is_active`.

⚠️ Cap de 1000 do PostgREST: qualquer leitura nova de `cultos` usa paginação.

### Fase 4 · Frontend

- **Dashboard Semanal** e **Frequência da Integração**: seletor de lente
  (`Cultos separados` × `10:00 e 09:30 como o mesmo culto`) + seletor de
  agrupamento (Culto / Turno / Domingo). Por culto **continua existindo** nas duas
  telas — pedido explícito.
- **Marca da data** em **24/08/2026** nos gráficos de série (`ReferenceLine` do
  recharts, que o projeto já usa para o alvo de 60 min na Produção).
- `CORES_CULTO` e mapas nome→cor: acrescentar o 09:30, senão a série nasce **sem
  cor** (armadilha já registrada no CLAUDE.md: cor fora do array do
  `ChartGradients` renderiza barra vazia e o build não pega).

### Fase 5 · Satélites

Conforme o inventário da seção 8. Os que já sei que precisam de atenção:

- **Voluntariado** — `voluntariado.js:2301` lista os cultos de domingo de manhã com
  `recurrence_day = 0 AND is_active AND recurrence_time < '14:00'`. A régua do
  `< 14:00` **pega o 09:30 sozinha** (bom), mas o `is_active` volta a ser problema
  se ele for usado para encerrar. Escalas futuras precisam ser conferidas.
- **Produção** — o 09:30 nasce **sem roteiro**; decidir se copia o do 10:00.
- **Kids** — janela de sessão do culto atual.
- **Crons** — janelas em UTC do `online-live-monitor.yml`.
- **Plano de contas** — contas nomeadas por horário. **Decisão do financeiro**, não
  nossa.

### Ordem sugerida e reversibilidade

| Fase | Reversível? |
|---|---|
| 1 · migration aditiva | **Sim** (dropar colunas + tipo sem culto) |
| 2 · cultos futuros | **Sim enquanto zerados**; não, se houver dado lançado |
| 3 · backend | **Sim** (parâmetro novo, comportamento antigo é o padrão) |
| 4 · frontend | **Sim** |
| 5 · satélites | caso a caso |

**Fases 1, 3 e 4 podem ir para produção antes de 24/08 sem efeito visível** — o
tipo novo não tem culto, e a lente separada reproduz exatamente o comportamento
atual. Isso permite validar em produção **antes** da virada, que é o oposto de
virar tudo no dia.

---

## 10. Armadilhas conhecidas deste repositório que se aplicam aqui

Lições já registradas no CLAUDE.md que valem exatamente para esta mudança:

- **Cultos pré-agendados com frequência 0** inflam qualquer soma "do ano" e o
  denominador de "cultos com dado". Ver a seção do YTD: o corte é **por DIA**,
  não por mês fechado nem por ano inteiro.
- **Semana de frequência é seg→dom; a do financeiro é qua→ter.** Divergem de
  propósito. Mexer numa não deve mexer na outra.
- **Cap de 1000 linhas do PostgREST** — qualquer leitura de `cultos` que possa
  passar disso precisa de `fetchAll`/paginação; `.in()` sempre em lotes ≤200.
- **Índice funcional só é usado se a query repetir a expressão idêntica** — vale
  se alguma consulta nova filtrar por hora/data derivada.
- **`ADD COLUMN IF NOT EXISTS ... REFERENCES` engole a FK** quando a coluna já
  existe. Se a linhagem for coluna com FK, criar a constraint em bloco próprio e
  **auditar no catálogo**, não no arquivo da migration.
- **Migration numerada** — conferir colisão antes (já houve `160000` ocupado).
- **Teste vermelho bloqueia deploy** (gate de Vitest + contratos). Teste novo
  aqui tem de ser determinístico: **nada de depender da hora da execução** — foi
  o que mordeu no `faixaEtaria.test.ts`.
