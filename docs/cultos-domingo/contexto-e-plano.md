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

### 7.1 As 5 decisões do §2 da varredura (respondidas em 2026-08-11)

O conjunto de decisões está **COMPLETO**. Nenhuma delas é para ser reaberta por
quem implementa.

**D1 · Quem é o 09:30?** → **tipo NOVO + linhagem** (a varredura chama de "opção
B", e é o que o desenho das duas lentes exige). ⚠️ Com os **4 pré-requisitos** do
§2 da varredura — sem eles, a opção B fica **pior** que retimar.

**D2 · Plano de contas** → **conta NOVA para o horário novo +
`aceita_lancamento=false` na antiga, mantendo `ativo=true`**. Preserva a DRE de
2024/2025 com o rótulo verdadeiro e rotula o futuro certo.
⚠️ **Pendência de alinhamento (não bloqueio técnico):** essas contas são
alimentadas pelo **sistema contábil externo** via `codigo_legado`. Precisa do
"ok" do **financeiro** e de quem opera o contábil, senão a conta nova nasce sem
correspondente do outro lado e a conciliação passa a divergir.
⚠️ **Independente desta decisão, `fin_culto_slots` TEM que ser recortado** — é ele
que roteia o dinheiro futuro, e ele **não segue o catálogo**.

**D3 · Apresentação de bebês** → **09:30 primário, com overflow para 11:30 por
limite** (a decisão do Marcos Paulo do §11.1). ⚠️ **RESOLVIDO — ver §12.1.**
Houve um conflito: esta sessão havia registrado **11:30** (o Matheus respondeu
"segundo culto da manhã", e na grade nova o segundo é o 11:30). Apresentado o
conflito, **o Matheus optou pela decisão do Marcos Paulo**. Vale o 09:30.
Datas afetadas: **13/09, 11/10, 08/11**.
⚠️ Hoje a regra é `startsWith('10:00')` e o fallback pega o culto **mais cedo em
silêncio** — trocar por 11:30 tem de ser explícito, e o texto "às 10h" está
**hardcoded** em duas telas e no WhatsApp.

**D4 · Redistribuição ou queda?** → **REDISTRIBUIÇÃO** (preferência/expectativa do
Matheus). Consequências para o sistema:
- as **metas de total NÃO mudam** (`dashboard_metas`, 5 linhas, todas globais);
- o que muda é a **média por culto**, e por isso o corte de **24/08/2026 precisa
  estar marcado** nos gráficos;
- ⚠️ **NÃO recalibrar meta agora.** Só em **outubro/2026** existe um mês inteiro
  na grade nova; recalibrar com base híbrida produz meta que não descreve nem um
  formato nem o outro. Até lá, anotar o corte no `rotulo` da meta.
- ⚠️ Se na prática houver queda, o medidor de setembro fica âmbar e **vai ser lido
  como igreja encolhendo**. A margem é apertada: meta semanal **2.081** contra
  média real **2.028** = folga de **2,6%**, menor que o culto que sai.

**D5 · Batismo** → **fechar 08:30 e 10:00 (`aberto=false`, NUNCA soft-delete)
após a cerimônia de 23/08** e **adicionar os horários novos**.
- ⚠️ **O rótulo passa a ser só o horário** ("Domingo · 09:30"), **sem os ordinais
  "1º/2º/3º culto da manhã"**. Decisão do Matheus, e é a mais robusta: ordinal
  quebra a cada mudança de grade, horário não.
- **Assumido** (corrigir se estiver errado): abrir **09:30 e 11:30**, espelhando o
  padrão atual de duas opções com limite 11 cada.
- ⚠️ **As 6 inscrições pendentes de 23/08 (2 em 08:30 + 4 em 10:00) estão CORRETAS
  e não devem ser tocadas.**
- ⚠️ Conferir se sobrou inscrição `pendente` para **27/09** nos horários velhos, e
  reagendar **antes de 26/09**, quando o cron do lembrete dispara.

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

---

## 11 · Decisões de 11/08 — Marcos Paulo (+ pedidos do Pr. Juninho)

> Registrado pela sessão do Marcos Paulo em 11/08, depois de ler este doc e a
> varredura inteiros. Fecha as Decisões 1, 3 e 5 do §2 da varredura; a 2 segue
> aberta COM PRAZO; a 4 fica no default do plano (não recalibrar antes de
> outubro). Verificações novas citadas aqui foram medidas em produção /
> `origin/main` em 11/08.

### 11.1 Eventos especiais (batismo, apresentação de bebês, ativações): **09:30 primário; overflow para 11:30 por limite**

- **Batismo**: o overflow já é automático no auto-serviço — o GET público
  esconde horário lotado (`publicBatismo.js:126-131`) e o POST recusa com 409
  no limite (`:282-289`; o caminho do totem idem em `kpis.js:901-925`). Falta:
  criar a linha **09:30** em `batismo_horarios` (⚠️ a tela admin NÃO cria
  horário — o `POST /kpis/batismos/horarios` existe sem botão; SQL ou um botão
  novo), fechar 08:30/10:00 após a cerimônia de 23/08 (§5 F2) e corrigir os
  ordinais dos labels.
- **Limite medido em produção (11/08): 11** nos dois horários abertos (a
  memória do Marcos era 8 — prevalece o medido). ⚠️ 11:30 e 19:00 estão com
  `limite = NULL` = **sem limite, nunca lota** — ao abrir o 11:30 como
  overflow, definir limite explícito, senão a regra nunca "fecha a torneira".
- ⚠️ **Buraco descoberto na verificação**: inscrição de batismo **via APP**
  entra por fan-out (`app_inscricoes` → trigger → `batismo_inscricoes`) **sem
  `horario_culto` e sem validar limite** — não conta na lotação e não é
  barrada. Entra no escopo (ou o app passa a mandar horário, ou a equipe
  realoca essas linhas manualmente).
- **Apresentação de bebês: SEM limite por enquanto → a regra vira "sempre
  09:30"** (decisão do Marcos 11/08). Implementar o helper já com limite
  `NULL = ilimitado` (mesma semântica do batismo) para o overflow 11:30 virar
  só mudança de dado no futuro. Escopo confirmado pela verificação: **3 portas
  de escrita divergentes hoje** — totem (`membresia.js:2296-2313`, prefere
  10:00 com fallback no culto mais cedo), app (`app.js:4798-4803`, pega o
  culto de menor id) e formulário público (grava em `apresentacao_criancas`,
  sem culto) — convergem num helper único; + `GET /status` devolvendo o
  horário calculado, os 2 textos "às 10h"/"no culto das 10h" do
  `TotemMembro.tsx:3049/:3107` e o `{{4}}` do WhatsApp
  (`membresia.js:2383-2388`) dinâmicos. ⚠️ Conferir na Meta se o corpo do
  template `apresentacao_bebes_confirmacao` menciona "10h" fora do parâmetro
  (se sim, é template `_v2`). Prazo: **13/09** (primeira apresentação afetada).

### 11.2 Plano de contas (Decisão 2): segue aberta, **com deadline 20/08 e fallback combinado**

Vamos conversar com o financeiro. Mas o recorte de `fin_culto_slots` acontece
em 24/08 de qualquer jeito e o slot novo precisa apontar para alguma conta:
**sem resposta até 20/08, fallback interino = slot do 09:30 apontando para as
contas do 10:00**, registrado como temporário. O que não pode é chegar 24/08
sem resposta e sem fallback (dízimo partindo em duas contas extintas, §8.3).

### 11.3 Pedidos do Pr. Juninho (dashboard)

1. **Lente "consolidação"**: nas médias do Dash Semanal, opção de ver
   **08:30+10:00 SOMADOS no passado vs o 09:30** — para medir se a
   consolidação perdeu ou ganhou gente. Não conflita com as duas lentes já
   decididas: é uma **terceira**, e muda o desenho num ponto — em vez de UMA
   `linhagem_key`, o mecanismo precisa de **duas chaves de agrupamento**
   (continuidade: 10:00+09:30 · consolidação: 08:30+10:00+09:30) ou uma
   tabelinha de lentes. ⚠️ Pegadinha verificada no código: na média histórica
   (média em JS por chave, `dashboardSemanal.js`), as linhas de 08:30 e 10:00
   da MESMA semana têm de ser **somadas por semana ANTES de entrar na média**,
   senão a média da série consolidada sai pela metade. Rótulo explícito
   ("08:30+10:00 somados") + marca de 24/08 no gráfico.
2. **% de ocupação sempre visível ao lado da frequência total de domingo** —
   os dois recortes imunes à aritmética do denominador.

### 11.4 Indicador novo: ocupação sobre lugares OFERECIDOS (Marcos)

`presencial_adulto ÷ (capacidade × nº de cultos VIGENTES no período)` — mede
otimização do espaço, não lotação: hoje ~37,0% (1.553/4.200), vira ~49,3%
(÷3.150) com o mesmo público. Regras de nascimento:

- **Capacidade oficial = 1050** (decisão do Marcos 11/08: é a contagem do
  térreo, "e nós não somamos" o nível de cima). Os **1300** dormentes em
  `vw_culto_stats` não são a régua — não usar.
- ⚠️ Pré-requisito: **fonte única de capacidade** (tabela/config; hoje 1050
  está hardcoded em ≥6 pontos — constante no backend, telas, função SQL do
  OKR, prompt de IA — e não existe tabela). Todo leitor passa a ler de lá,
  inclusive o gauge atual, que divide o total da SEMANA pela capacidade de UM
  culto (quebrado; este indicador é o conserto dele).
- Numerador SÓ `presencial_adulto` (kids tem salas e régua próprias — 250);
  denominador conta cultos **vigentes**, nunca os pré-agendados com 0; sempre
  pareado com o total absoluto + marca de 24/08; rótulo com a janela na frase
  ("X% dos 3.150 lugares ofertados no domingo").

### 11.5 Catálogo central de cultos = **projeto de SETEMBRO** (não entra no corte)

Visão do Marcos: um lugar único com todos os cultos (ativos e inativos) de onde
TUDO deriva — adicionar/inativar ali propaga pelo sistema. É o remédio para o
diagnóstico do §8.1/§B2 (e é a "opção C" da Decisão 1, que não cabe até 24/08 —
o corte sai como planejado, que já planta vigência+linhagem+flags). Teto
realista: ~80% automático (matar a régua de texto em 5 cópias, gerar
`fin_culto_slots`/`batismo_horarios`/texto do bot a partir do catálogo,
endpoint de grade para os apps) + **checklist gerado** dos satélites externos
(PCO, contabilidade, template na Meta, OTA dos apps). A tela de Tipos de Culto
do voluntariado é o embrião — assumir, blindar (F1 já corrige o guard do
DELETE) e crescer, em vez de criar uma segunda coisa escondida.

### 11.6 Divisão de frentes (Fase 0)

- **Matheus**: dono de `dashboardSemanal.js` / `DashSemanalAba.jsx` / `kpis.js`
  / `voluntariado.js` — as lentes (incluindo a consolidação do Juninho, 11.3)
  entram no desenho dele (Fases 1/3/4).
- **Marcos Paulo**: bebês + batismo (`membresia.js`, `app.js`,
  `publicBatismo.js`, `TotemMembro.tsx`) + o buraco do batismo via app + OTA
  do CBRio-Staff (25–29/08) + conferência do app de membros pós-corte. O
  indicador de ocupação ofertada (capacidade→dado + gauge) é PR separada,
  sequenciada DEPOIS da F1, coordenada porque toca `DashSemanalAba`.
- Metas: não recalibrar antes de outubro (mantido — Decisão 4 no default).

---

## 12 · ⚠️ CONFLITO A RESOLVER entre Matheus e Marcos Paulo (11/08, fim do dia)

> Registrado pela sessão do **Matheus** depois do commit `a69be1d5`. As duas
> sessões responderam as mesmas decisões **em paralelo** e divergem em UMA.
> ⚠️ **Não implementar a apresentação de bebês até isto ser resolvido entre os
> dois** — e nenhuma das duas respostas está errada, elas partem de premissas
> diferentes.

### 12.1 ✅ RESOLVIDO — Apresentação de bebês: vale **09:30** (a do Marcos Paulo)

> **Resolução (Matheus, 11/08, depois de ver o conflito): "pode seguir com o que
> o Marcos Paulo decidiu."** Vale **09:30 primário, com overflow para 11:30 por
> limite**. Como bebês não têm limite hoje, na prática é **sempre 09:30** — e o
> helper deve nascer já com a semântica `limite NULL = ilimitado` (a mesma do
> batismo), para que ligar o overflow no futuro seja **só mudança de dado**.
>
> ⚠️ O registro do conflito abaixo fica **de propósito**: ele documenta que a
> frase "segundo culto da manhã" é ambígua neste contexto, e é o tipo de
> ambiguidade que reaparece na próxima mudança de grade.

**Histórico do conflito (para leitura, não para decidir):**

| Quem | Decisão | Raciocínio registrado |
|---|---|---|
| **Marcos Paulo** (§11.1) | **09:30 primário**, overflow 11:30 por limite | Trata como "evento especial": 09:30 é o primário da manhã e, como bebês **não têm limite** hoje, a regra vira "sempre 09:30" |
| **Matheus** (§7.1 · D3) | **11:30** | Respondeu "segundo culto da manhã"; na grade nova a manhã tem **dois** cultos, então o segundo é o 11:30 — e é o maior da casa (~724) |

**A origem da divergência é uma ambiguidade real na frase "segundo culto da
manhã":** o Matheus foi perguntado explicitamente e confirmou **11:30**, mas na
grade ANTIGA o "segundo culto da manhã" era o **10:00** — cujo lugar o 09:30
herda. Quem pensa em continuidade de slot chega no 09:30; quem conta os cultos da
grade nova chega no 11:30.

**O que NÃO muda com a resolução** (pode ser implementado já): o helper único que
substitui as **3 portas de escrita divergentes** (totem, app, formulário público),
o `GET /status` devolvendo o horário calculado, os 2 textos "às 10h" hardcoded no
`TotemMembro.tsx` e o `{{4}}` do WhatsApp — tudo isso é necessário nos dois
cenários. **Só o valor do horário-alvo fica pendente**, e é 1 linha.

**Prazo real: 13/09** (primeira apresentação afetada). Não é urgente hoje, mas
precisa de uma conversa entre os dois — não de uma escolha minha.

### 12.2 Plano de contas: a Decisão 2 **foi respondida** pelo Matheus

O §11.2 registra a D2 como "segue aberta com deadline 20/08". Depois disso, o
**Matheus respondeu**: **conta NOVA para o horário novo + `aceita_lancamento=false`
na antiga, mantendo `ativo=true`** (§7.1 · D2). Isso **supera** o "aberta".

⚠️ **O fallback interino do §11.2 continua valendo como rede**: o recorte de
`fin_culto_slots` acontece em 24/08 de qualquer jeito, e se o **financeiro** não
confirmar a conta nova até 20/08, o slot do 09:30 aponta interinamente para as
contas do 10:00, registrado como temporário. A decisão está tomada; o que falta é
o "ok" do financeiro e de quem opera o contábil externo (`codigo_legado`).

### 12.3 Decisão 4 saiu do default: **redistribuição**

O §11.3/§11.4 deixou a D4 "no default do plano". O **Matheus respondeu
explicitamente: redistribuição** (§7.1 · D4). Consequência prática: as metas de
total **não mudam**, o corte de 24/08 **tem** de estar marcado nos gráficos, e
segue valendo **não recalibrar antes de outubro** — que era justamente o default.
Ou seja: a resposta **confirma** o comportamento planejado e acrescenta a
expectativa registrada por escrito, útil para ler setembro.

### 12.4 A terceira lente do Pr. Juninho muda o mecanismo de linhagem

O §11.3 registra o pedido de uma lente de **consolidação** (08:30+10:00 somados no
passado × 09:30). Isso **não conflita** com as duas lentes decididas, mas
invalida uma premissa do meu desenho da §3: **uma única `linhagem_key` não
expressa três agrupamentos**.

O mecanismo passa a precisar de **duas chaves** (continuidade: 10:00+09:30 ·
consolidação: 08:30+10:00+09:30) ou de uma tabelinha de lentes. ⚠️ Quem
implementar a Fase 1 deve ler o §11.3 **antes** de criar a coluna — nascer com uma
chave só significa refazer a migration.

### 12.5 Estado do conjunto de decisões

| Decisão | Estado |
|---|---|
| D1 · quem é o 09:30 | ✅ fechada (tipo novo + linhagem) |
| D2 · plano de contas | ✅ fechada (conta nova + `aceita_lancamento=false`) · ⏳ aguarda "ok" do financeiro, com fallback combinado |
| D3 · apresentação de bebês | ✅ fechada — **09:30** primário, overflow 11:30 por limite (conflito resolvido em favor da decisão do Marcos Paulo) |
| D4 · redistribuição ou queda | ✅ fechada (redistribuição) |
| D5 · batismo | ✅ fechada (fechar após 23/08 + abrir novos; **rótulo = só o horário, sem ordinais**) |

⚠️ **Ainda pendente antes de qualquer implementação:** validação do plano pelo
Matheus, o alinhamento da Fase 0 entre as duas frentes (as duas sessões acabaram
de escrever no MESMO arquivo em paralelo — a prova de que a Fase 0 não é
formalidade), e a correção das 84 escalas no **Planning Center**, que não é código.

---

## 13 · ESTRATÉGIA DE EXECUÇÃO — aprovada pelo Marcos Paulo em 12/08 ("modo piloto")

> Registrado pela sessão do Marcos Paulo. Ele decidiu **antecipar a implementação
> inteira** para não "mudar tudo e testar no mesmo dia": tudo vai ao ar esta
> semana, a parte VISÍVEL fica atrás de um véu que só ele e o Matheus enxergam,
> os dois testam com dados reais, e no dia 24 o destrave é um flip — não um
> deploy. **Divisão revista por decisão dele (12/08): a sessão do Claude
> implementa TODOS os lotes, inclusive os 4 arquivos do dash, em PRs pequenos e
> sequenciais** — Matheus acompanha por aqui e pelos PRs; qualquer objeção dele
> tem prioridade (este arquivo continua sendo o canal).

### 13.1 As três camadas (o que fica onde)

| Camada | Tratamento | Por quê |
|---|---|---|
| **Fixes da Fase 1** (régua voluntariado + 'Domingo 09%', totem Kids, guards, isSedeCulto) | **Abertos, sem véu** | São invisíveis por natureza — não mudam nada enquanto o tipo 09:30 não existe. Véu aqui só criaria o risco de esquecer de destravar (e régua em view SQL nem tem como ser gateada por usuário). |
| **UI nova** (seletores de lente, agrupamento, ocupação ofertada, marca de 24/08) | **Atrás do véu**: flag no banco (default OFF); com OFF, só super-admin (`is_super_admin()`) vê | Testável com dado real de domingo (17/08) sem ninguém mais ver. No dia 24: **1 UPDATE** liga pra todos — zero deploy de domingo. Rollback = desligar. |
| **Dado do corte** (tipo 09:30, is_active=false nos 2, 72 cultos, fin_culto_slots, batismo_horarios, whatsapp_config) | **Script ÚNICO ensaiado** (dry-run + backups + invariantes §4.2), executado em 24/08 | Dado não tem permissão: o tipo novo aparece pra todo mundo assim que existe (a régua `< 14:00` o absorve sozinha). O dia 24 continua sendo o interruptor — mas vira "rodar 1 script revisado", não "escrever coisas". |

### 13.2 Cronograma revisto

| Quando | O quê |
|---|---|
| 12–15/08 | Lotes no ar: (1) bebês 09:30 · (2) Fase 1 fixes abertos · (3) migration aditiva (vigência + **2 chaves**: `linhagem_key` E `consolidacao_key` — ver §12.4) + flag do véu · (4) lentes + ocupação atrás do véu |
| Dom 17/08 | **Ensaio geral**: Marcos + Matheus testam lentes/ocupação com os dados reais do domingo, atrás do véu. Limite honesto: consolidação e ocupação testam por completo (usam histórico); a lente continuidade só diverge da separada com dado pós-corte |
| 18–20/08 | Correções do ensaio · ok do financeiro (D2 · fallback = contas do 10:00) · script do corte escrito, revisado, dry-run |
| 23/08 (pós-cerimônia) | `batismo_horarios` (fechar 08:30/10:00 · abrir 09:30 e 11:30, limite 11, rótulo sem ordinais) + hora dos planos no PCO |
| 24/08 | Rodar o script + **ligar a flag** + invariantes §4.2 |
| 25–29/08 | OTA do CBRio-Staff · PR cosmético (§5 F4.2) |
| 30/08 | Verificação de campo §4.3 (o que nenhum ensaio cobre: totem no buraco 10:30–11:00, continuidade com dado novo) |

### 13.3 O que o ensaio de 17/08 NÃO cobre (fica pro dia 30)

Lente continuidade divergindo (precisa de dado do 09:30) · totem Kids em sessão
real de 09:30 · sync do PCO pós-mudança de hora · fluxo financeiro do slot novo.
A verificação de campo do §4.3 permanece obrigatória.

---

## 14 · ENSAIO DO CORTE — rodado em 18/08 (resultado)

> Registrado pela sessão do Matheus. O ensaio do `corte-cultos-domingo-20260824.sql`
> foi executado de verdade (`v_executar = false`, bloco revertido, contra a base de
> produção). **Rollback conferido nas 2 execuções**, em 11 indicadores.

⚠️ **Correção de data no §13.2:** ele diz "Dom 17/08", mas **17/08/2026 foi
SEGUNDA**. O domingo era **16/08**. As outras datas do cronograma estão certas e
conferidas: 23/08 domingo (cerimônia de batismo) · **24/08 segunda (o corte)** ·
**30/08 domingo (o primeiro no formato novo)**.

### 14.1 ⚠️⚠️ O achado: o corte estouraria o `statement_timeout` (PR #2559)

`cultos` tem **DOIS gatilhos ROW-level** — `cultos_recalc_kpis`
(`trg_kpi_recalcular_culto`) e `cultos_recalcular_nsm`
(`tg_nsm_recalcular_pos_culto`). Cronometrado com `clock_timestamp()` dentro do
bloco revertido: **INSERT 1,258 s · DELETE 2,440 s, por linha.**

18 inserts + 36 deletes ⇒ **~110 s só nesse trecho**, antes dos 5 backups, do
patch da view e das 10 invariantes. E `statement_timeout` da sessão é **2 min** ⇒
o corte ia ficar no fio e provavelmente por cima, **abortando no dia 24** (com
rollback, seguro — mas sem fazer o trabalho, sob pressão de tempo).

**Conserto:** `SET statement_timeout = '10min'` como statement **SEPARADO antes**
do bloco (o `DO` é UMA instrução, então `SET LOCAL` dentro dele não vale para ele
mesmo). ⚠️ **Não rodar o script por cliente com timeout curto** — o MCP do
Supabase aborta antes (2 tentativas, as duas revertidas): é **SQL Editor**.
⚠️ **NÃO desligar os gatilhos** para acelerar: as 54 linhas são futuras e todas
zero, nenhum KPI/NSM mudaria de valor, mas suprimir gatilho na tabela mais quente
do sistema é decisão de gente.

**Régua que passa disto:** operação em LOTE sobre `cultos` custa **~1–2,5 s POR
LINHA**. Todo script/backfill futuro que mexa em dezenas de cultos tem de orçar
isso — o custo não está na tabela (é pequena), está nos dois recálculos.

### 14.2 O que o ensaio validou

| Item | Resultado |
|---|---|
| Lote 2 (régua aceita `Domingo 09:30`) | ✅ |
| Lote 3 (colunas + `cultos_config`) | ✅ |
| Tipos `08:30`/`10:00` acháveis pelo nome exato | ✅ |
| Slot `domingo-10h` presente | ✅ |
| **Bloqueadores** (culto futuro com dado/satélite) | **0** de 36 |
| Cultos 09:30 a criar · a remover | **18** · **36** |
| Vínculos de template de escala herdados do 10:00 | **1** (não cai no AVISO) |
| Apresentações de bebê a repontar | **0** (rede de segurança inerte) |
| Backup `kpi_registros` (SED-18/SED-21) | 382 linhas |
| Órfãos (`service_type_id IS NULL`) | **0**, e a invariante exige que não cresça |

**A fronteira financeira, medida ao vivo** — o motivo do passo 5 existir:

| PIX às | cai HOJE no slot |
|---|---|
| 09:29 | Domingo 8:30 |
| 09:30 · 10:59 | Domingo 10:00 |
| 11:00 | Domingo 11:30 |

Ou seja: sem o recorte, a oferta de um culto das 09:30 se parte entre **DOIS
slots de cultos extintos**. As invariantes do script cobrem exatamente isso.

### 14.3 Descartados como causa (medidos, não supostos)

- **Lock do `CREATE OR REPLACE VIEW`**: sondado com `LOCK … NOWAIT` → **livre**.
  Não era contenção de leitura do dashboard.
- **`DELETE` cascateando para filhas sem índice**: 3 filhas de `cultos` não têm
  índice em `culto_id` (`cui_convertidos` 397 · `kids_pco_presencas` 147 ·
  `app_decisoes` ~0) — pequenas, não são o gargalo. Ficam anotadas.

### 14.4 Consertado junto

O fallback do `.env` no `_corte_cultos_domingo_ensaio.cjs` apontava para
`~/SISTEMA_INTEGRADO_CBRIO/backend`, e o checkout principal é `~/Documents/…` —
rodando de uma worktree (que nasce sem `.env`, gitignored) ele morria em "não
encontrados" com o arquivo existindo no principal. Passou a tentar os dois e a
dizer ONDE procurou + que é opcional. ⚠️ Os outros 2 `.cjs` de `backend/scripts/`
têm o **mesmo** erro e não foram tocados.

### 14.5 Pendente, e de quem é

| O quê | Quem | Quando |
|---|---|---|
| Ler o resumo `ENSAIO OK — …` colando o script no SQL Editor | Matheus/MP | antes de 24/08 |
| ⏳ **ok do financeiro na conta nova (D2)** — sem ele o slot 9:30 nasce com as contas do 10:00 | Matheus | **deadline 20/08** |
| Batismo + hora dos planos no PCO (84 escalas não se movem) | Matheus | 23/08, pós-cerimônia |
| `v_executar := true` + rodar no SQL Editor + invariantes | os dois | 24/08 |
| OTA do CBRio-Staff (grade hardcoded) | Matheus | 25–29/08 |
| Verificação de campo §4.3 | os dois | 30/08 |

⚠️ **O véu não é "só o Marcos e o Matheus": são 4 contas** — `infra@`,
`marcospaulo.almeida@`, `matheus.toscano@` e **`yago.torres@`** (o gate é
`isSuperAdminEmail` contra `app_super_admins`). E **`gestao@cbrio.com.br` NÃO
está na lista** — quem abrir o Dashboard Semanal com esse login não vê o card.

---

## 15 · D2 RESPONDIDA e o PCO RE-MEDIDO (18/08)

### 15.1 D2 · conta nova, criada (o ok do financeiro saiu em 18/08)

Decisão do Matheus: **conta NOVA, não reuso** — a receita do 09:30 fica separada
da do 10:00 na DRE, e as contas do 8:30/10:00 ficam com o histórico.

| código | nome | uuid |
|---|---|---|
| `3.01.01.10` | Dizimos Domingo 9:30 | `08019a7a-b59d-4cd5-97d9-c0d8d7c8a37d` |
| `3.01.02.10` | Ofertas Domingo 9:30 | `fffb0e2a-65cd-42cc-baf5-30288ae03b30` |

Já preenchidas em `v_conta_dizimo_0930`/`v_conta_oferta_0930` — **o fallback
interim não é mais usado**. Criadas na convenção das irmãs (nível 4 · natureza
`ordinaria` · `aceita_lancamento=true`).

⚠️ **`ordem` empata de propósito** (311 e 321, as dos irmãos do 10:00): a sequência
global é **densa** (301…321) e não havia inteiro livre entre o dízimo 10:00 (311) e
o cabeçalho OFERTAS (312). Não há unique em `ordem` — só em `codigo` — e empatar
deixa cada conta ao lado do próprio grupo **sem reescrever nenhuma linha
existente**. O consumidor (`financeiroV2.js:50`) ordena só por `ordem`; renumerar
teria tocado ~10 contas contábeis para ganhar nada.

⚠️⚠️ **`aceita_lancamento=false` nas contas VELHAS ficou FORA do dia 24, de
propósito.** Faz parte da D2, mas a oferta do culto de **23/08** costuma ser
conciliada dias depois — travar a conta em 24/08 recusaria a classificação do
último domingo do formato antigo. Quem já impede lançamento novo no horário
extinto é o **slot** (`ativo=false`, passo 5). Fazer quando a conciliação de 23/08
fechar: **decisão de data do Matheus, não do script.**

### 15.2 PCO · a migração não dispensa corrigir os 3 planos

Matheus (18/08): *"estamos migrando de lá, então vamos começar a levar em conta
apenas o que tá registrado no nosso sistema"*. **O destino está certo, mas hoje o
sync ainda é o dono das linhas futuras do voluntariado** — medido:

| | |
|---|---|
| `vol_services` com data ≥ 24/08 | **9**, e **todos os 9** vieram do PCO |
| escalas penduradas neles | **189** |
| serviços de MANHÃ ≥ 30/08 | 4, **todos** `service_type_id IS NULL` (PCO-only) |
| hora deles | **08:30** |
| escalas de manhã afetadas | **106** (16+16+26 em 30/08 · 48 em 06/09) |

⚠️⚠️ **Consertar no banco NÃO resolve:** no ramo PCO-only o
`executarSyncCompleto` (`planningCenter.js:375`) faz upsert de `scheduled_at` pelo
`planning_center_id`, então o cron horário **reverte o update em até 60 min**.
Quando o serviço é INTERNO (`service_type_id` preenchido) o sync só liga o
`plan_id` e não encosta na hora — não é o caso destes 4.

⚠️ **O que NÃO depende disso** (e é o que o Lote 2 garantiu): a régua do turno
classifica por **NOME** (`Domingo - Manhã`), não por hora ⇒ Dashboard Semanal,
bloco e contagem de check-in ficam **certos sem nenhuma ação**. O que fica errado
é a **hora que o voluntário vê** nas 106 escalas — e o lembrete de escala no
WhatsApp sai com ela.

⇒ Decisão do Matheus: **corrigir os 3 planos no PCO** (`Domingo - Manhã` 90926558
30/08 · `CBKIDS - Manhã Domingo` 90756297 30/08 e 90756298 06/09) → 09:30. As
escalas não se movem (vínculo por `service_id`).

⚠️ **Enquanto o sync existir, o PCO continua sendo dono de `vol_services`
futuros.** "Levar em conta só o nosso sistema" no voluntariado exige, além de
desligar o cron, um caminho para os serviços nascerem AQUI — que hoje não existe.
Isso é a migração, não o corte de 24/08.
