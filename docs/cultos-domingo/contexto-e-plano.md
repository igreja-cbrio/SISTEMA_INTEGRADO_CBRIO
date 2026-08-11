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

## 7. ⚠️ O que está ABERTO (trava a execução)

Perguntas feitas ao Matheus em 05/08 e **ainda sem resposta**. Não decidir por
conta — cada uma muda código:

1. **Quando o número precisa ser único, qual lente vale?** Gráfico aceita filtro;
   **KPI da matriz, meta e NSM não** — têm um valor só. A maioria dos coletores
   soma totais (idênticos nas duas lentes), mas qualquer indicador "por culto"
   precisa de régua fixa. *Sugestão feita:* os indicadores oficiais medem por
   **turno ou por domingo** (imunes), e a visão por culto fica como análise.
2. **Qual lente abre por padrão?** *Sugestão feita:* a **separada** (dado cru),
   com o botão de troca visível.
3. **Rótulos:** o culto novo chama "Domingo 09:30"? E a série da lente
   continuidade — "Domingo 09:30 (antes 10:00)" ou algo como "2º culto da manhã"?
4. **O 10:00 encerra no mesmo dia que o 08:30** (23/08)? — confirmar.
5. **Só domingo muda?** — confirmar (os dados dizem que sim).

---

## 8. Inventário técnico

⚠️ **EM LEVANTAMENTO.** Está rodando uma varredura multi-agente do sistema
(banco/schema, coletores de KPI, voluntariado, frontend, kids+produção,
crons+integrações), com verificação adversarial dos achados graves. Esta seção
será complementada quando ela fechar.

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

## 9. Ordem de execução proposta

1. **Migration aditiva**: cria `Domingo 09:30`, a linhagem, e a marcação de
   vigência (`encerrado_em` nos tipos que saem). Aditiva = reversível.
2. **Cultos futuros**: a partir de 24/08, remover os do 08:30 e do 10:00 e criar
   os do 09:30. ⚠️ Conferir que nenhum tem dado lançado **no momento da
   execução** (hoje não têm, mas alguém pode lançar antes).
3. **Backend**: parâmetro de lente e de agrupamento (culto/turno/domingo) nos
   endpoints de agregação.
4. **Frontend**: filtro de lente, visão por turno, visão por domingo, marca da
   data no gráfico.
5. **Satélites**: voluntariado, kids, produção, crons — conforme o inventário.

**Reversível:** 1, 3, 4. **Exige cuidado:** 2 (apagar culto futuro com dado
lançado seria perda real) e qualquer coisa que toque o plano de contas.

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
