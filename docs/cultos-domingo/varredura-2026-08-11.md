# Mudança da grade de cultos de domingo (08:30/10:00/11:30/19:00 → 09:30/11:30/19:00)
## Relatório de descoberta — síntese de 6 varreduras + verificação adversarial
**Data da varredura: 2026-08-11 · corte pretendido: segunda 2026-08-24 · primeiro domingo no formato novo: 2026-08-30**
**Nada foi editado e nenhuma escrita foi executada. Todas as consultas ao banco foram SELECT / catálogo.**

---

## RESUMO EXECUTIVO — os 7 fatos que mandam neste plano

1. **Não existe uma fonte de verdade de horário de culto. Existem quatro**, independentes e sem FK entre si:
   `vol_service_types.recurrence_time` (o catálogo) · `cultos.hora` + `cultos.nome` (**snapshots congelados** por linha) · `fin_culto_slots` (janelas de horário do **financeiro**, que roteiam dízimo/oferta para contas contábeis próprias) · `batismo_horarios` (catálogo de texto da **porta pública de batismo**). Mexer só no catálogo conserta menos de metade do sistema.

2. **Os cultos futuros já estão gravados.** 72 linhas em `cultos` (18 por tipo) de **2026-08-30 a 2026-12-27**, com `hora` e `nome` do formato **antigo**. `gerar_cultos_recorrentes` é INSERT-ONLY e dedupa por `(service_type_id, data)` **sem comparar hora** → devolve `ja_existia` e **nunca corrige**. Não há trigger que propague nome/hora do tipo para `cultos`. Boa notícia: as 72 estão **100% vazias** (todos os contadores em 0, `frequencia_lancada=false`) e com **zero filhos** nas 17 tabelas que apontam para culto.

3. **O horário 09:30 cai exatamente na fronteira das janelas financeiras.** `fin_culto_slots`: “Domingo 8:30” = 06:00→09:30 · “Domingo 10:00” = 09:30→11:00. Confirmado chamando `fin_identifica_culto` em produção para 30/08: 09:29 → conta **3.01.01.08 “Dizimos Domingo 8:30”**; 09:30 → **3.01.01.09 “Dizimo Domingo 10:00”**. O dízimo/oferta de **um único culto** parte em **duas contas contábeis**, nenhuma com o nome do culto real. É trigger automático em `fin_pix_detalhe`, sem gente no caminho.

4. **Duas superfícies com PESSOAS REAIS têm prazo antes do corte:** a porta pública de **batismo** (oferece 08:30 e 10:00 com `aberto=true`; o batismo de 23/08 é o último no formato antigo, o de **27/09 já é no formato novo** e a partir de 24/08 o formulário passa a agendar para ele) e o **bot do WhatsApp** (responde a qualquer visitante desconhecido “Domingo: 08h30, 10h00, 11h30 e 19h00”, sem IA, direto de `whatsapp_config`).

5. **O sistema de voluntariado classifica culto por PREFIXO DE TEXTO do nome, e o ramo desconhecido é DESCARTADO, não zerado.** `'Domingo 09%'` não existe em nenhuma das 5 cópias da régua. Um culto chamado “Domingo 09:30” → `bloco = NULL` → `WHERE bloco_id IS NOT NULL` → **os check-ins desaparecem do dashboard sem erro, sem log e sem virar zero visível**. Hoje ~520 check-ins já dependem dos nomes literais (`Domingo 08:30` = 325, `10:00` = 126, `11:30` = 69) e desde a semana ISO 28 essa é a via **dominante** do domingo de manhã.

6. **Renomear um tipo reescreve o rótulo do passado.** 6 views (`vw_culto_historico_anual`, `vw_dashboard_semanal`, `vw_culto_stats`, `vw_nsm_sem_dados`, `vw_fin_semana_cultos`, `vw_kids_sessao_ao_vivo`) e o módulo Produção leem `vst.name` **vivo** e agrupam por ele. `vol_service_types` **não tem nenhuma coluna de vigência** (só um `is_active` booleano sem data) — o banco não sabe versionar rótulo no tempo.

7. **Dois apps fora do ciclo de deploy do ERP** carregam a grade: o **app de membros** (`Aplicativo-CBRio`) lê `cultos.hora` **direto do Supabase com a anon key** e calcula “ao vivo” com ela; o **CBRio-Staff** tem a grade **hardcoded em string** (`index.tsx:276`). Nenhum dos dois sai no merge da `main` do ERP.

---

## 1 · INVENTÁRIO POR ÁREA (ordenado por risco)

### 1.1 · BLOQUEADORES COM PESSOAS NA PORTA (prazo antes de 24/08)

| # | Onde | O que codifica | O que quebra |
|---|---|---|---|
| **A1** | `batismo_horarios` (4 linhas) · `publicBatismo.js:113-141` (GET /horarios) e `:273-295` (POST) · `whatsappCron.js:57-84` (cron `0 21 * * *`) · `Batismos.tsx:154-262` (card) e `:293/:354/:966` (labelHorario, lista impressa) | Catálogo de texto **paralelo**, sem FK e sem `culto_id`. `08:30` label “Domingo · 08:30 (1º culto da manhã)” **aberto=true** limite 11 · `10:00` “(2º culto da manhã)” **aberto=true** limite 11 · `11:30` “(3º culto da manhã)” fechado · `19:00` fechado. O valor vira `batismo_inscricoes.horario_culto` (TEXT livre) e é o **{{2}}** do lembrete de WhatsApp da véspera | A partir de 24/08 o formulário público agenda o batismo de **27/09** oferecendo **08:30** (culto extinto) e escondendo o 11:30 (o único que sobrevive). O cron manda no dia anterior “você será batizada às 08:30”. Já houve incidente idêntico (25/07, hora fixa errada, duas pessoas responderam corrigindo). Os ordinais “1º/2º/3º culto da manhã” também ficam errados (a manhã passa a ter 2 cultos). 12 inscrições históricas em `08:30`, 27 em `10:00`; **6 pendentes em 23/08 (2 em 08:30 + 4 em 10:00) estão CORRETAS e não devem ser tocadas** |
| **A2** | `whatsapp_config.institucional->>'horarios'` (id=1) · `whatsappParser.js:117-118` (FAQ sem IA), `:132-133` (fallback), `:142` (system prompt do Haiku) · editável em `/admin/whatsapp` (`Whatsapp.jsx:674`) | String: `"Domingo: 08h30, 10h00, 11h30 e 19h00\nQuarta com Deus: 20h00\nBridge (sabado): 17h00\nAMI (sabado): 20h00"` | Bot público (21 99907-9031) responde horário errado a visitante, por **palavra-chave, sem IA**, e a IA repete fielmente porque o prompt manda “use SOMENTE as informações abaixo · NUNCA invente horário”. O filtro dispara com `culto`/`quando` soltos — já há mensagens reais sobre **batismo** que receberam despejo de horários. **É dado, sem deploy**; a janela é editar **em 24/08** (antes erra para quem vai no domingo 23) |
| **A3** | `vol_services` (PCO, `service_type_id` NULL): `Domingo - Manhã` @08:30 em **2026-08-30** (16 escalas) · `CBKIDS - Manhã Domingo` @08:30 em **30/08** (20) e **06/09** (48) | Hora do turno inteiro num `scheduled_at` ancorado em **08:30**, em 30/36 ocorrências | **84 escalas já publicadas** depois do corte com hora extinta. O voluntário abre “Minhas escalas”/painel e lê 08:30 para um culto de 09:30 → chega uma hora antes. `vol_service_types.recurrence_time` **NÃO corrige** (essas linhas não têm `service_type_id`) e um `UPDATE` em `vol_services.scheduled_at` é **revertido pelo sync horário** (`planningCenter.js:346-353`, cron `0 * * * *`). **Correção é no Planning Center**, não no banco |

### 1.2 · CRÍTICOS DE DADO SILENCIOSO (antes de 30/08)

| # | Onde | O que quebra |
|---|---|---|
| **B1** | `fin_culto_slots` (4 linhas domingo) + `fn_identifica_culto()` + trigger `tg_fin_pix_detalhe_datetime` em `fin_pix_detalhe` (`20260521160200:127-140`) · `fn_sugerir_plano_por_horario` · `financeiroV2.js:830` · `financeiroApply.js:52-58` | Fronteira **09:30** parte o culto novo entre duas contas de cultos extintos (ver fato 3). **191 PIX já classificados por slot** (124 de domingo em abril/2026, R$ 13.124,49). `service_type_slug` é TEXT solto — `vol_service_types` **não tem coluna slug**, então zero vínculo. Mudar o catálogo **não toca aqui**. `culto_slot_id` é FK de `fin_pix_detalhe` e `fin_transacoes` → **DELETE do slot é bloqueado**; o caminho é `ativo=false` |
| **B2** | `fn_dash_vol_service_no_bloco()` (gate `IMMUTABLE`) · `vw_dashboard_voluntariado` (CASE + `VALUES` com rótulo “Domingo Manhã” e `recurrence_time '08:30:00'` hardcoded) · `fn_dashboard_voluntariado_composicao` · `_resumo` · `_pessoas` · `src/pages/ministerial/voluntariado/volMatch.ts:37` | **5 cópias** da lista `'Domingo 08%'/'10%'/'11%'`, nenhuma com `09%`. `Domingo 09:30` → gate `false` e CASE `NULL` → linha descartada. `ensureServiceDoTipo` (`voluntariado.js:2263-2274`) grava `service_type_name` **a partir do nome do tipo**, então o culto novo nasce com o texto que ninguém reconhece. Fonte exclusiva do indicador Voluntariado do Dashboard Semanal (`fonteView`, 8 endpoints) e do YTD |
| **B3** | `VolRelatorios.tsx:138` via `blocoDoServico` | Bloco `null` → chave `svc:<id>` → **linha órfã**. A escala vive no serviço-turno do PCO e o check-in no culto real → o turno mostra **135 escalados / 20 presentes (15%)** se o 08:30 virar 09:30 (medido em 09/08: 56 pessoas que serviram passariam a constar como faltantes, inclusive na **chamada impressa**) |
| **B4** | 72 linhas futuras em `cultos` + `gerar_cultos_recorrentes` (INSERT-ONLY) + ausência de trigger de propagação + `cultos.hora` **fora da allowlist** do `PUT /cultos/:id` (`kpis.js:134-144`; `nome` está, `hora` não) | Sem UPDATE explícito e datado, o calendário de 30/08 em diante mostra os 4 cultos antigos com horários antigos, para sempre. Com tipo novo somado, 30/08 exibe **5 cultos** e a Integração pode lançar frequência na linha errada. Corrigir `hora` **só é possível por SQL** |
| **B5** | `escolherCultoPorRelogio` (`TotemKidsCheckin.tsx:84-89`) + `resolverSessaoCultos` (`:852`) + pré-marcação (`:1063-1066`) | Janela = `[início−30, min(início+60, abertura do próximo)]`. Hoje funciona por **acidente aritmético** (90 min entre cultos = 60+30, janelas se encostam). Com 09:30/11:30 o espaçamento vira 120 min → **buraco novo 10:30–11:00** (simulado): `atual = null`, `cultosSel` zera, e `sessoesAbertas.length === 1` faz adotar a sessão do **09:30 já encerrada**. Família que chega 10:45 tem a criança lançada no culto de 09:30. **O servidor não barra** (guarda só recusa culto de outro dia). E com 1 sessão o seletor **não é renderizado** e o aviso “falta escolher o culto” fica `false` — as 4 travas caem juntas. É a mesma classe do incidente documentado (“152 check-ins caíram no 08:30 no teste”) |
| **B6** | `GET /cultos-do-dia` (`totemKids.js:2626-2637`) — filtro **só** `has_kids`, sem `is_active`, sem `deleted_at` | Os 18 fantasmas de 08:30 aparecem no totem Kids; `TotemKidsCheckin.tsx:804-805` chama `sessoes.garantir(atual.id)` e **CRIA a sessão** no culto fantasma; ao encerrar, `fn_kids_sessao_consolida_culto` grava `presencial_kids`/`decisoes_kids` nele e o culto real fica 0. **Soft-delete NÃO resolve** (nem a rota nem `vw_culto_stats` filtram `deleted_at`; `cultos` tem 0 soft-deletadas hoje — o caminho nunca foi exercido, mas `app_soft_delete` **aceita** a tabela e responde sucesso) |
| **B7** | `has_kids` como portão duro: `TotemKidsAdmin.tsx:134` · `KidsFrequencia.tsx:45,85` · `totemKids.js:2634` (cultos-do-dia) e `:189` (permissão “líder Kids do dia”) · `integracao.js:224` → `ColetaCulto.jsx:160` · `CalendarioCultos.jsx:635` | Tipo novo nasce `has_kids=false` (default NOT NULL) e **o CRUD não aceita o campo** (`voluntariado.js:2811-2820` grava só name/description/recurrence_day/recurrence_time/color; o PUT idem + `is_active`). Efeito: **nenhuma criança pode fazer check-in no culto de 09:30**, ele não aparece na gestão de sessões, sai da comparação de frequência, o voluntário escalado não ganha a permissão do totem, e o bloco Kids da coleta não abre. **Não há caminho de UI para ligar** |
| **B8** | `CalendarioCultos.jsx:635-636` + `:717-721` (ModalCulto) | `hasKids/hasOnline = flag ?? false` e o submit **ZERA**: `presencial_kids: hasKids ? … : 0`, `decisoes_kids`, `decisoes_online`. O backend persiste 0 (`kpis.js:134-166`, guarda ignora zero). Existe escritor **sem gate**: `integracao.js:389-397` (aprovação de submissão do bot) grava `presencial_kids`/`decisoes_kids` sem checar `has_kids`. Sequência real: líder Kids reporta → coordenador aprova → Integração salva a frequência de adultos → **apaga o consolidado**, com toast de sucesso. A rede de segurança (`cron/resumo-kids`) usa a MESMA flag e também pula |
| **B9** | `membresia.js:2163-2180` + `TotemMembro.tsx:3041` e `:3099` + `membresia.js:2255` | Apresentação de bebê amarrada por `startsWith('10:00')` (“regra do Marcos 23/07 · sem escolha”). Sem 10:00 → `undefined` → fallback `ordenados[0]` = o culto **mais cedo**, que com os fantasmas é o **08:30 inexistente**. A tela diz **“às 10h”** e “no culto das 10h” em texto **hardcoded**, e o WhatsApp manda `'10:00'` fixo. Datas afetadas: 2º domingo — **13/09, 11/10, 08/11**. A tabela `apresentacao_bebes` está vazia hoje (nada a corrigir retroativamente) |
| **B10** | `isSedeCulto` (`kpiAutoCollector.js:90-93`) e `_isSedeCulto` (`painel.js:147-150`) **sem fallback por `c.nome`** (ao contrário de `isAmiCulto`/`isBridgeCulto`) + FK `cultos_service_type_id_fkey` **ON DELETE SET NULL** + `DELETE /service-types/:id` (`voluntariado.js:2833`) com botão na UI (`VolTiposCulto.tsx:152-158`) | **Apagar** o tipo 08:30 anula `service_type_id` em **209 cultos históricos** → `service_type_name` NULL → `isSedeCulto=false` → os 209 saem retroativamente de `cultos.sede_freq` (SED-21) e `sede_conv` (SED-18) e do **centro da mandala Seguir** (`painel.js:161-170`: culto não classificado não entra em sede/ami/bridge/online e o total é a soma dessas 4). Hoje há **0 cultos órfãos** — o furo é latente, e o gatilho é um botão “Remover” atrás de um `confirm()` seco. O guard da rota é `authorizeModule('membresia', 1)` = **nível de LEITURA**, alcançável por 27 cargos |
| **B11** | Hard delete do tipo — cascata completa | `vol_escala_template_tipos` **CASCADE** (o vínculo do template “Domingo manhã”, 28 itens, com o tipo) · `producao_roteiro_etapas` **CASCADE** · `producao_checklist_itens` **CASCADE** · `cultos` SET NULL (209) · `vol_services` SET NULL (5 serviços, 325 check-ins) · `dash_semana_notas` SET NULL. Um clique apaga cronograma de produção e desliga 209 cultos do histórico |

### 1.3 · ALTOS — número/rótulo errado sem erro

| # | Onde | O que quebra |
|---|---|---|
| **C1** | `fin_plano_contas` — 8 contas com horário no nome, **6.828 transações** (`3.01.01.08 Dizimos Domingo 8:30` 602 tx R$ 497.759,25 · `3.01.02.08 Oferta Domingo 8:30` 1.055 · `3.01.01.09 Dizimo Domingo 10:00` 182 · `3.01.02.09 Oferta 10:00` 112 · +11:30 e Noite). `vw_fin_dre_mensal` lê `pc.nome` **ao vivo**; `fin_transacoes` **não tem snapshot do rótulo** | Renomear reescreve a DRE de 2024/2025 (1.657 tx só nas contas “8:30”, últimas em **2026-08-04** — não é conta morta). Não renomear deixa o dinheiro do 09:30 caindo em contas “8:30”/“10:00” para sempre. **Decisão contábil, não técnica** — e existe uma terceira via (conta nova + `aceita_lancamento=false` na antiga) |
| **C2** | 6 views que rotulam por `vst.name` vivo, com `GROUP BY` pelo nome: `vw_culto_historico_anual`, `vw_dashboard_semanal` (+`vst.recurrence_time`), `vw_culto_stats`, `vw_nsm_sem_dados`, `vw_fin_semana_cultos` (**100% viva, sem snapshot nenhum**), `vw_kids_sessao_ao_vivo` | Rename relabela retroativamente. Medido: `vw_culto_historico_anual` para o id do 08:30 devolve 2023 (53 cultos/10.972), 2024 (52/16.706), 2025 (52/11.094), 2026 (52/6.264) — **um único UPDATE em `name` relabela 209 cultos / 45.036 presenças**. O front indexa **por nome** (`HistoricoCultos.tsx:61-72`, `VisualizacaoFrequencia.tsx:117-128`) → nome novo idêntico a existente **funde séries em silêncio** |
| **C3** | `producao.js:656` + `:721/728/735/742/749/757` + `:889` → `Producao.jsx:936-948` | Módulo Produção agrupa **tudo** (tabela “Por tipo de culto”, série do gráfico, pontualidade, aderência, estouro por etapa) pela **string** `service_type_name`. Rename → histórico do 08:30 **migra para a série 09:30 e se soma ao novo**: média por etapa e aderência passam a misturar dois horários com previstos diferentes. Tipo novo → 2 séries, 2 cores, 2 legendas, métricas do 09:30 reiniciando de zero |
| **C4** | `kpi_calcular_valor_auto` ramos `cultos.sede_freq/conv` (`LOWER(vst.name) LIKE 'domingo%'`, nome **vivo**) **vs** `_kpi_agregar_dado` área sede (`cultos.nome NOT LIKE '%ami%'/'%sabado%'/'%bridge%'/'%online%'`, **snapshot**) | Duas engines para o MESMO KPI, com fontes diferentes. Hoje a divergência é **0** (98.564 nas duas em 2025) e **98.564 × 1,30 = 128.133,20 = exatamente o `meta_valor_absoluto` de SED-21** — prova de que a meta vem do engine2 e o realizado do engine1, e que os dois são **divididos um pelo outro** na `vw_kpi_trajetoria_atual`. Rename fora do prefixo “domingo” ou DELETE do tipo → divergência de **−11.094 (−11,3%)** entre numerador e denominador |
| **C5** | `dashboardSemanal.js:164-192` (média por tipo) e `:241-251` (`mediaGeral`/`variacao_pct`) | A média histórica é das semanas 1..N do ano corrente. De 30/08 em diante o total de **3 cultos** é comparado com a média de semanas de **4 cultos** → `variacao_pct` nasce negativo e fica negativo o resto de 2026, por composição. Medido: `mediaGeral` cai de **2057 → 1861** ao remover o 08:30. Tipo novo → `media` = o próprio valor da semana → a barra reporta **0,0% de variação** num culto sem histórico |
| **C6** | `dashboard_metas` — 5 linhas, **todas** com `service_type_id NULL` | Metas globais calibradas com 4 cultos: frequência semanal **2.081** (média real 2.028 → margem de 2,6%, **menor que o culto que sai**), anual 105.870, freq_total mensal 11.670 e aceitações 54 (= exatamente maio/2026, mês-base de 4 cultos), kids semanal 261. Nenhuma quebra tecnicamente; **todas ficam erradas em silêncio** e o gauge âmbar de setembro será lido como queda de frequência |
| **C7** | `/ytd` (`dashboardSemanal.js:1044-1081`) + `YtdAcumuladoCard.jsx:19-39` | Total absoluto cai e **média por culto sobe** (+7,6% sem redistribuição, +19,0% com redistribuição total) por mudança de grade. O `Delta` pinta qualquer `pct >= 0` de verde com `TrendingUp` → sobe uma seta de crescimento rotulada “na média vs 2025”. `comDado` é gated por `v > 0`, então os fantasmas não entram na média (só em `noParticipante`/`noPeriodo`, exibido como “N sem lançamento”) |
| **C8** | 13 pontos de `.eq('service_type_id', …)`: `dashboardSemanal.js:160,175,444,492,580,684,771,834,1041,1261,1535` · `painel.js:1698,1706` · `kpis.js:97` | Tipo NOVO → YoY por culto devolve `tem_dado:false` para 2024/2025, `/culto/:id/historico` devolve `serie: []`, `/mensal` não desenha anos anteriores, `/metas/sugerir` sugere meta sem base. A UI é honesta (mostra lacuna, pula o Δ%) — o sintoma é **série que desaparece**, não número falso. E “Todos” passa a somar 3 séries onde somava 4, **sem marcação nenhuma na resposta** (`/yoy` devolve só `{ano,total,tem_dado}`). Isso **já acontece hoje** com o 10:00 (2023 = 3 tipos, 2025 = 4) |
| **C9** | `kpis.js:571-601` (POST `/kpis/cultos/auto-create`, cron `5 3 * * 0`) | Pré-checagem por `(service_type_id, data, hora)` **vs** o UNIQUE real `(service_type_id, data)`. Se `recurrence_time` mudar e a linha existir com hora antiga, o pré-check erra o alvo → INSERT → **23505** → `skippedItems` → **HTTP 200**. Falha silenciosa toda semana. O comentário da rota (`:531`) afirma um `ON CONFLICT` que **não existe**. Também filtra `has_online_stream=true` |
| **C10** | `notificacaoGenerator.js:1299-1327` (cron `0 14 * * *`) | Culto fantasma com `has_online=true` gera `online_culto_sem_metricas` **1× por dia por 2 dias** (janela rolante `[hoje-7,hoje)` do outro alerta; aqui `[anteontem, ontem]`), com fan-out para **16 admins** (0 regras configuradas). Já dispara hoje: 80 notificações em 09-10/08. O ramo `online_decisoes_a_confirmar` **não** dispara (`decisoes_online` tem default 0, nunca NULL — 0 registros desse tipo no histórico) |
| **C11** | `fn_wifi_processar_vinculos()` passo 3 (`recurrence_time ± 30/120 min`, **`recurrence_time` VIVO**) + `wifiSync.js:116` + cron `0 2 * * 0,1,4` · `fn_wifi_cultos` rotula por `st.name` vivo | Fantasma de 08:30 continua candidato (a função **não filtra `is_active`**): ~**20 logins/domingo** entre 08:00 e 08:59 (218 dos 310 do 1º culto estão nessa faixa) iriam para um culto que não acontece. E rename relabela os 209 cultos no módulo WiFi. ⚠️ **A parte “218 logins ficam órfãos” e “a sobreposição aumenta” foi REFUTADA** — ver §6 |
| **C12** | `Aplicativo-CBRio/lib/cultos.ts:18-27` + `components/home/ProximosCultos.tsx:59-79,207` | O app de membros lê `cultos.hora` **direto do Supabase** (anon key, sem backend) e `grep recurrence_time` no app **não retorna nada**. Com só o catálogo mudado, a Home mostra **10:00** e marca “ao vivo” das 10:00 às 12:00 (`DURACAO_CULTO_MIN=120`) enquanto o culto real é 09:30–11:30 — **30 min de defasagem**, e o card do horário real aparece riscado como “passado”. Cache SWR de 10 min com chave que vira sozinha (não é bloqueador) |
| **C13** | `CBRio-Staff/app/(app)/(tabs)/index.tsx:276` | `'8h30 · 10h · 11h30 · 19h'` **hardcoded**, único hit no app inteiro, card **sem gate** (todo usuário vê na home). Repo **separado** (`igreja-cbrio/CBRio-Staff`) → **não sai no deploy do ERP**, exige OTA. Hoje está CERTO; a mudança o torna errado |
| **C14** | `DashSemanalAba.jsx:878-886` (`shortLabel`) + `:216/:230` | O rótulo do gráfico é `Dom ${recurrence_time}` — **hora viva**, ignorando a hora escrita no nome. Rename/retimagem relabela ~106 semanas do 10:00 nas 3 abas do Dashboard Semanal, e `shortLabel` é a **chave do merge multi-indicador**. Se nome e `recurrence_time` divergirem, nome e rótulo discordam na mesma linha |
| **C15** | `Producao.jsx:40` (`CORES_CULTO`) + `:936-947` + `:983-984` | Cor **posicional**, indexada pela ordem de primeira aparição nos dados do período. Já hoje o mesmo culto tem 3 cores diferentes conforme o chip (medido: “Domingo 19:00” = idx 0 em 365d, 1 em 90d, 3 em 30d). E `cultosSel` guarda o **nome**: seleção obsoleta → `hide` em todas as linhas → **gráfico vazio sem explicação** (não há reset ao trocar o chip, e o componente não desmonta) |
| **C16** | `dashboardSemanal.js:79-86` (`GET /cultos`) e `kpis.js:76-84` filtram `.eq('is_active', true)`; **as views não filtram** | `is_active=false` tira o tipo do **dropdown** de filtro, mas os cultos históricos **continuam somando** em “Todos” (LEFT JOIN sem `is_active`). Consequência: o histórico do 08:30 deixa de ser **filtrável isoladamente**. É trade-off da desativação, e precisa ser aceito explicitamente |
| **C17** | `vol_escala_template_tipos` — template “Domingo manhã” (28 itens) ligado aos 3 tipos de manhã | Tipo novo nasce **sem template ligado** e **não existe UI de vínculo** template↔tipo → a escala do primeiro domingo novo sai vazia. E o `VolTemplatesEscala.tsx:186-189` renderiza o badge com curto-circuito (`st ? … : null`) → UUID morto **desaparece do card** em silêncio; o editor **não filtra `is_active`** (`:113`), então um 08:30 desativado continua selecionável |

### 1.4 · MÉDIOS / COSMÉTICOS QUE ENGANAM

| # | Onde | Efeito |
|---|---|---|
| D1 | `vol_service_types.bloco_servico` (`'dom_manha'` nos 3 da manhã) | **Coluna morta**: 0 leitores em código, 0 em views/funções/policies/índices, e **não é criada por nenhuma migration** (drift). Mas tem `COMMENT` em produção descrevendo exatamente a semântica desejada → **armadilha de correção falsa**: preencher no 09:30 é no-op comprovado |
| D2 | `vw_fin_culto_ativo` (`20260521250000:21-48`) compara `CURRENT_TIME`/`CURRENT_DATE` com o banco em **UTC** | Bug pré-existente: às 09:00 do Rio a aba “Culto ao Vivo” já diz que o culto ativo é o 11:30. **Armadilha**: quem ajustar `fin_culto_slots` e conferir por essa aba vai concluir que “consertou” algo que nunca esteve certo |
| D3 | `producao.js:192` envia `meta_duracao_min: c.meta_duracao_min ?? 60`, mas `vw_culto_stats` **não expõe** essa coluna | Sempre `undefined` → sempre 60. Hoje invisível (os 7 tipos têm meta=60). Se o 09:30 tiver duração-alvo diferente, o card semanal cobra 60 e o KPI mensal cobra a meta real |
| D4 | `has_online` **vs** `has_online_stream` (defaults **opostos**: false / true) | `has_online` é lido pelo live-monitor, backfill de vídeo, verificador e form público de decisão online; `has_online_stream` pelo auto-create e pelo app de membros. Tipo novo com só uma marcada → metade do pipeline online o ignora **em silêncio** (`liveMonitor` devolve `reason: 'fora_de_janela'`, que **aponta a causa errada**) |
| D5 | `dashboardSemanal.js:1808` e `:1939` (prompts de IA) | “Tipos: Domingo 08:30/10:00/11:30/19:00 … Capacidade do templo: 1050 lugares” declarado como **fato do schema**, com instrução “use SOMENTE estas tabelas/colunas”. O modelo passa a gerar indicadores e SQL sobre um culto morto |
| D6 | `.github/workflows/online-live-monitor.yml:15-20` e `santander-pix-realtime.yml:8` | Comentários com a grade antiga. ⚠️ **Os crons NÃO precisam mudar** — 09:30 está coberto (janela abre 09:00 BRT = 12:00 UTC, e `0 11-15 * * 0` inclui 12). O disparo de UTC 11 vira desperdício (sai por “3× fora_de_janela”). A janela do PIX **melhora** |
| D7 | `NovoSite.tsx:171` (`08:30 · 10:00 · 11:30 · 19:00`) — página **pública** · `Integracao.tsx:152-153` (texto de ajuda) | Única superfície que fala com quem está **fora** do sistema. Severidade técnica baixa, prioridade operacional alta |
| D8 | 3 cópias de `TYPE_COLORS`/`SVC_COLORS` por nome literal (`VolMeuPainel.tsx:298`, `VolDisponibilidade.tsx:8`, `VolMinhaDisponibilidade.tsx:9`), fallback `'#00B39D'` | `Domingo 09:30` **herda exatamente a cor do 08:30**. ⚠️ Verificado: **~94% das linhas já caem no fallback hoje** (`Quarta Com Deus` vs chave `'Quarta com Deus'`, `Culto AMI` vs `'AMI'`) e a colisão já é visível — a cor **nunca foi identidade** ali. `vol_service_types.color` já tem os hexes certos e é ignorado |
| D9 | 3 capacidades divergentes: `capacidades.ts:9` (1050) · `DashSemanalAba.jsx:129-133` (1050 hardcoded, não importa a lib) · `vw_culto_stats` (**÷1300**) | A capacidade não muda com horário, mas a mudança **expõe** a divergência: 3 réguas reportam saltos diferentes. Pior: o gauge agregado divide o total da **semana** por 1050 (capacidade de **um** culto) → semanas pré e pós-corte não são comparáveis |
| D10 | `VolTiposCulto.tsx:71-80,109-113` — “Gerar 2026 inteiro” (`handleGenerate(2026)`) | Único gesto de UI para popular a agenda do tipo novo, e opera no **ano inteiro** → fabrica domingos de 09:30 **retroativos** (jan–ago). Sem seletor de janela. Contrapartida verificada: o botão é **no-op** nas datas com serviço do PCO (33 dos 52 domingos bloqueados até 06/09) e o toast diria “19 culto(s) gerado(s)” — número plausível e por isso mais enganoso que zero |
| D11 | `dash_semana_notas.service_type_id` uuid **SEM FK** (3 linhas de domingo) · `face_presencas.culto_id` e `fin_arrecadacao.culto_id` idem (vazias para domingo hoje) | Viola a lei nº 10. Se o tipo/culto for deletado, ponteiro morto silencioso — mesmo mecanismo dos 58 órfãos do Next |
| D12 | `TotemKidsPainel.tsx:122` (`nome?.match(/\d{2}:\d{2}/)`) | O chip de horário do pager sai por **regex no nome snapshot**, ao lado de um card que usa o nome **vivo** → a mesma tela mostra dois horários. E o nome novo **precisa** ter HH:MM com dois dígitos: “Domingo 9:30” **não casa** e o chip desaparece sem erro |
| D13 | 3 migrations de carga histórica (`20260625150000`, `20260626120000`, `20260626130000`) casam culto por `recurrence_time = TIME '08:30:00'` dentro de `IF v_culto IS NOT NULL` | Já aplicadas. Se o `recurrence_time` mudar, em replay/banco novo elas viram **no-op silencioso** e o cronograma real de 07/06 não é carregado |
| D14 | `_periodoDia`/`_periodoKey`/`periodoDoHorario` — régua manhã/tarde/noite **triplicada** em 3 arquivos; `imprimir.ts` / etiquetas com exemplos `'Domingo 10:00'` (`EditarEtiquetaModal.tsx:76`, `TotemKidsTesteEtiqueta.tsx:161`, `DesignPreview.tsx:353`) | Não quebram (09:30 e 11:30 caem em ‘manha’). Ficam como fragilidade e como exemplo mentiroso na tela de quem imprime etiqueta |
| D15 | `voluntariado.js:2277-2287` (`/cultos-manha`: `recurrence_day=0 AND is_active=true AND recurrence_time < '14:00'`) | **Genérico — absorve o 09:30 sozinho, sem deploy.** É por isso que o culto novo aparece no checkbox e gera check-in normalmente **enquanto desaparece do dashboard** (B2). Também é a prova de que `is_active=false` é o mecanismo correto para tirar o 08:30 do check-in — e o `length > 1` das 3 telas (`VolCheckin:48`, `VolSelfCheckin:77`, `VolTotem:634`) continua verdadeiro com 2 cultos |

---

## 2 · AS DECISÕES QUE SÓ O DONO PODE TOMAR

### Decisão 1 (a que trava tudo) — **quem é o 09:30?**

Isto **não é** uma escolha de implementação: define o rótulo de 3 anos de histórico, define qual conta contábil recebe o dinheiro e define se as comparações ano-a-ano por culto sobrevivem. **11:30 e 19:00 mantêm seus ids em qualquer cenário** — a decisão é sobre **um slot só**.

| Opção | O que é | Ganha | Perde (o custo real) |
|---|---|---|---|
| **A · Retimar um tipo existente** (`UPDATE name='Domingo 09:30', recurrence_time='09:30'` num id atual; o outro vira `is_active=false`) | O 09:30 herda um `service_type_id` que já existe | Série contínua: YoY por culto, `/culto/:id/historico`, `/metas/sugerir`, filtros e os 13 `.eq(service_type_id)` continuam funcionando. Herda `has_kids`/`has_online`/`presencial_label='Sede'`/`color`/`meta_duracao_min` — **elimina de uma vez B7, B8, D4 e o template de escala (C17)**. Cria zero cultos órfãos | **Reescreve o rótulo do passado** nas 6 views (C2) — o gráfico ano-a-ano passa a afirmar que existia culto às 09:30 em 2023/2024. **`cultos.hora` (snapshot) passa a discordar de `recurrence_time` na MESMA linha**, e as duas ficam expostas lado a lado (`vw_culto_stats`, MiniCard da Produção, chip do pager Kids). No Produção o histórico do slot antigo **se soma** à série do 09:30 e contamina média por etapa/aderência (C3). Dispara C9 (o 23505 semanal do auto-create). Contraria o requisito escrito “gráficos e dados refletem o horário novo **a partir do corte**” |
| **B · Criar tipo NOVO 09:30** e `is_active=false` nos dois que saem | Identidade nova para grade nova | **Histórico mantém o rótulo verdadeiro** — “Domingo 08:30” continua sendo 08:30 em 2023, e o corte fica honesto sem tocar em nenhuma linha antiga. Não dispara o 23505 do auto-create. Compatível com `isSedeCulto`, `_kpi_agregar_dado` e o filtro genérico `/cultos-manha` desde que o nome comece com “Domingo” | **Fragmenta a série por id** (C8): YoY por culto vazio para 2024/2025, `/culto/:id/historico` vazio, `/metas/sugerir` sem base. **Obriga** INSERT explícito de `has_kids=true, has_online=true, has_online_stream=true, presencial_label='Sede', meta_duracao_min` — o CRUD **não aceita** e, sem isso, **nenhuma criança faz check-in no culto de 09:30** (B7). Obriga ligar o template de escala (C17). O 08:30 sai do dropdown de filtro (C16) |
| **C · Datar vigência** (coluna de vigência em `vol_service_types` + rótulo por período nas 6 views + `fin_culto_slots` com vigência + `fn_identifica_culto` recebendo data) | O correto | Histórico com rótulo verdadeiro **e** série contínua. Resolve a classe inteira do bug, inclusive a próxima mudança de horário | Migration + recriação de 6 views (uma delas com `UNION` grande) + mudança de assinatura de função financeira + os objetos do voluntariado. **Não cabe até 24/08** e ninguém consome vigência hoje |

**Recomendação: opção B (tipo novo), com os 4 pré-requisitos nomeados abaixo — e não a A.**

O motivo é o requisito do próprio pedido: *“o histórico precisa continuar existindo; gráficos e dados passam a refletir o horário novo a partir do corte.”* A opção A cumpre a primeira metade **quebrando a segunda**: ela faz o passado passar a se apresentar com o horário novo, e nas telas isso é **invisível como mudança** — quem olhar o gráfico de 2024 vai simplesmente acreditar. Pior: a contradição fica gravada dentro da mesma linha (`hora` = 08:30 · rótulo = 09:30) e há telas que mostram os dois campos a duas linhas de distância, o que produz “bug irreproduzível” eterno. As perdas da opção B são de **comparabilidade** (uma série que começa em 30/08) — visíveis, explicáveis e **recuperáveis depois**. As perdas da A são de **veracidade do registro**, e não são recuperáveis sem alguém lembrar quem era quem.

**Pré-requisitos da opção B — sem os 4, ela é pior que a A:**
1. O tipo novo **precisa** nascer por SQL/migration com `has_kids=true, has_online=true, has_online_stream=true, presencial_label='Sede', meta_duracao_min=<decidido>, color=<nova>` (o `POST /service-types` descarta esses campos). **Sem `has_kids`, o check-in Kids do culto principal de domingo é impossível.**
2. O nome **precisa** começar com `"Domingo "` e ter `HH:MM` com dois dígitos → **“Domingo 09:30”**. Isso é exigido por `isSedeCulto`, pelos dois ramos de `kpi_calcular_valor_auto`, pelo filtro negativo de `_kpi_agregar_dado` e pela regex do chip do pager. `"Celebração 09:30"` ou `"Domingo 9:30"` quebram em silêncio.
3. `'Domingo 09%'` **precisa** entrar nas 5 cópias da régua de voluntariado (B2) **antes** de o tipo existir. Se o tipo nascer primeiro, os check-ins do primeiro domingo somem sem erro.
4. `vol_escala_template_tipos` precisa receber a linha (template “Domingo manhã” × tipo novo), senão a escala de 30/08 sai vazia.

**Se o dono preferir a opção A** (é uma escolha legítima se a continuidade do YoY por culto valer mais que o rótulo histórico), então três condições não-negociáveis: **(i)** retimar o **10:00** (`2fea5701…`), nunca o 08:30 — relabela 106 linhas desde dez/2024 em vez de 209 desde jan/2023, e é o culto de média 443 (contra 196 do 08:30), o que minimiza a distorção de `media`/`variacao` do dashboard; **(ii)** o nome novo mantém o prefixo “Domingo”; **(iii)** o relabel retroativo é aceito **por escrito**, e o `UPDATE` das 72 linhas futuras (nome + hora) entra na **mesma transação** — senão nome e hora discordam.

### Decisão 2 — plano de contas do financeiro (C1)
Três caminhos, todos com custo, **nenhum é decisão de código**: (a) renomear 8:30→9:30 → reescreve o rótulo de 1.657 transações históricas na DRE; (b) não fazer nada → dinheiro do 09:30 cai em contas “8:30”/“10:00” para sempre; (c) **conta NOVA para o horário novo + `aceita_lancamento=false` na antiga, mantendo `ativo=true`** → preserva a história com rótulo verdadeiro e rotula o futuro certo. **Recomendo (c)**, com aval do Yago/Alberto e alinhamento com o sistema contábil externo (que alimenta essas contas por `codigo_legado`). **Independente da decisão de nome, `fin_culto_slots` TEM que ser recortado** (B1) — é o que roteia o dinheiro futuro e não segue o catálogo.

### Decisão 3 — a apresentação de bebês passa a ser em qual culto? (B9)
A regra de 23/07 era “SEMPRE 10:00, sem escolha”. O 10:00 deixa de existir e **nenhum** dos vizinhos é obviamente o herdeiro. Sem essa resposta, qualquer código novo é chute — e o fallback atual escolhe o culto mais cedo **em silêncio**. Datas afetadas: 13/09, 11/10, 08/11.

### Decisão 4 — a expectativa é redistribuição ou queda? (C5, C6, C7)
Se **redistribuição** (mesma gente em 3 cultos), as metas de total não mudam e o que muda é só a média por culto — e aí o corte precisa ser **rotulado** nos gráficos. Se **queda**, o desconto medido é −196/semana na frequência, −1.168/mês no freq_total, −5/mês nas aceitações, −19/semana no kids. **Não recalibrar meta com base híbrida**: só a partir de outubro/2026 existe um mês inteiro de grade nova.

### Decisão 5 — batismo: fechar preventivamente ou abrir o 09:30 já? (A1)
Recomendo: **após a cerimônia de 23/08**, `aberto=false` em 08:30 **e** 10:00 (soft-delete NÃO — o label é resolvido do catálogo vivo e o histórico perde o rótulo), e só então abrir a linha nova com o horário decidido e os ordinais corrigidos. Público vendo “nenhum horário disponível” é infinitamente melhor que agendar gente para um horário inexistente.

---

## 3 · MIGRATION vs DADO vs CÓDIGO

### 3.1 · Precisa de MIGRATION (SQL versionado, `CREATE OR REPLACE` / aditivo)
| Objeto | O que muda | Reversível? |
|---|---|---|
| `fn_dash_vol_service_no_bloco` | `+ 'Domingo 09%'` no ramo manhã | Sim (CREATE OR REPLACE de volta) |
| `vw_dashboard_voluntariado` | `+ 'Domingo 09%'` no CASE **e** `recurrence_time` do bloco `…001` de `'08:30:00'` → `'09:30:00'`. ⚠️ **Capturar a definição VIVA** (`pg_get_viewdef`), nunca copiar do arquivo `20260705140000` (drift) | Sim |
| `fn_dashboard_voluntariado_composicao` | `+ 'Domingo 09%'` no CASE (o gate não rotula) | Sim |
| `fin_culto_slots` | **UPDATE de dado**, mas dentro de migration por rastreabilidade: `ativo=false` no slot que sai + recorte das janelas de `dia_semana=0` para três, **sem buraco nem sobreposição** (09:30 → 06:00–11:00 · 11:30 → 11:00–14:00 · Noite → 14:00–04:00+1) | Sim (guardar o estado anterior) |
| `vol_service_types` | INSERT do tipo novo com **todas** as flags (opção B) **ou** UPDATE de name+recurrence_time (opção A) + `is_active=false` nos que saem | Sim |
| `cultos` | UPDATE/DELETE das 72 linhas futuras (`data >= '2026-08-30'`) | **DELETE não é reversível** — fazer backup em JSON antes (estão vazias, mas o registro do agendamento se perde) |
| `vol_escala_template_tipos` | INSERT do vínculo template × tipo novo | Sim |
| `fin_plano_contas` | Conta nova + `aceita_lancamento=false` (se a decisão 2 for (c)) | Sim |
| **Opcional, recomendado** | `vol_service_types.sucede_service_type_id` (aditiva, nullable, FK) — registra a sucessão no banco em vez de na cabeça de alguém, e é o que torna a continuidade do YoY **recuperável depois** | Sim |
| **Follow-up (não no corte)** | `DROP INDEX cultos_service_type_data_hora_uniq` (redundante e não documentado, veio de `migrations_manual/20260420_cultos_unique.sql`); vigência em `fin_culto_slots`; `agrupamento_kpi`/classificação por chave em vez de prefixo | — |

### 3.2 · É só DADO (sem deploy, editável por tela ou UPDATE)
- **`whatsapp_config.institucional->>'horarios'`** → `/admin/whatsapp` → aba Configuração → campo “Horários de culto”. **É a única superfície onde a transição pode ser EXPLICADA ao público** (texto ponte). Conferir depois no banco, não pelo toast.
- **`batismo_horarios`** → `/integracao` → card “Horários do batismo”. ⚠️ **A tela só abre/fecha e ajusta limite** (`Batismos.tsx:154-262`); **não cria horário nem edita label**. O backend já tem `POST /kpis/batismos/horarios` e `PATCH` de label, e `api.js:3226` já tem o `create` — **falta o botão**. Ou entra 1 pedaço de UI, ou é INSERT/UPDATE.
- **`vol_service_types.is_active`** → `PUT /voluntariado/service-types/:id` aceita `is_active`, mas **a UI não manda o campo** (só exibe badge). É UPDATE ou 1 Switch novo.
- **Planning Center**: hora dos planos `Domingo - Manhã` (plan `90926558`, 30/08) e `CBKIDS - Manhã Domingo` (`90756297` 30/08, `90756298` 06/09) → 09:30. O sync horário propaga sozinho para `vol_services.scheduled_at`; as 84 escalas **não se movem** (o vínculo é por `service_id`, que não muda).
- **`dashboard_metas`** (5 linhas) → aba Metas do Dashboard Semanal, com `rotulo` como único campo livre para registrar a base.

### 3.3 · É CÓDIGO (PR no ERP)
| Arquivo:linha | Mudança | Prioridade |
|---|---|---|
| `volMatch.ts:37` | `+ m(/^domingo 09/)`, **mantendo** `08`/`10` (histórico) | **antes de 30/08** |
| `TotemKidsCheckin.tsx:84-89` | fechar o buraco 10:30–11:00 **pela antecedência do próximo**, nunca esticando o `_fim` do anterior (esticar joga a chegada de 10:45 no culto de 09:30 — é o bug carimbado como comportamento) | **antes de 30/08** |
| `TotemKidsCheckin.tsx:852` + `:1946/:1994/:2844/:3043` | não adotar a única sessão aberta quando `cultoAtualId === null` e a janela dela já fechou; trocar os gates `> 1` por `> 1 \|\| !cultoAtualId` | **antes de 30/08** |
| `totemKids.js:2631-2634` | `+ is_active` no embed e `+ .is('deleted_at', null)`; e guard em `POST /sessoes/garantir` | **antes de 30/08** |
| `CalendarioCultos.jsx:717-721` | trocar `: 0` por spread condicional (**omitir**, não zerar) — a tela não sabe quem mais escreveu ali | **antes de 30/08** |
| `integracao.js:389-397` | recusar/avisar submissão `ambiente='kids'` em culto com `has_kids=false` | alta |
| `membresia.js:2172` + `:2255` + `TotemMembro.tsx:3041,3099` | constante única para o horário da apresentação; tela derivada do `GET /totem/apresentacao-bebe/status` (que já devolve `recurrence_time`); **omitir** o horário quando não houver culto correspondente | antes de 13/09 |
| `kpiAutoCollector.js:90-93` · `painel.js:147-150` · `painelArea.js:55-59` | fallback por `c.nome` no `isSedeCulto` (espelhando `isAmiCulto`) | alta (blinda contra órfão) |
| `voluntariado.js:2833` + `VolTiposCulto.tsx` | 409 no DELETE quando há culto vinculado; **`authorizeModule('voluntariado', 5)`** nas rotas de escrita de `/service-types` (hoje herdam `membresia,1` = leitura); expor `has_kids`/`has_online`/`presencial_label`/`is_active` no form | alta |
| `kpis.js:576-582` | pré-checagem por `(service_type_id, data)` — a chave real do UNIQUE; e falha audível em vez de 200 com `skippedItems` | alta |
| `dashboardSemanal.js:241-246` | restringir `totaisPorSemana` aos `service_type_id` presentes na semana exibida (mesmo padrão do `excluirKids`) → `variacao_pct` volta a medir gente, não grade | alta |
| `dashboardSemanal.js` `/ytd` (`avisos`) e `YtdAcumuladoCard` (`Delta`) | aviso de corte de grade quando o período atravessa 24/08 + estado neutro (cinza) para o `delta_media_pct` | média |
| `Producao.jsx:936-948,983-984` + `producao.js:656,889` | cor e chave por **identidade** (`service_type_id`/`cultos.hora`), não por índice nem por nome; poda de `cultosSel` obsoleto + “Mostrar todos” | média |
| `DashSemanalAba.jsx:878-886` | derivar o `hhmm` do NOME quando houver, `time` só como fallback | média |
| `notificacaoGenerator.js` / `onlineCollectors.js:1068` | bucket “Outros” visível em vez de `ELSE NULL` descartado; motivo distinto de `fora_de_janela` quando a causa é `has_online=false` | média |
| `NovoSite.tsx:171` · `Integracao.tsx:152-153` · `dashboardSemanal.js:1808,1939` · comentários dos 2 workflows · `EditarEtiquetaModal.tsx:76` etc. | textos/comentários/prompts | junto |
| **`CBRio-Staff/app/(app)/(tabs)/index.tsx:276`** | **repo separado + OTA (`eas update`)**, publicar entre 25/08 e 29/08 | **crítico de esquecimento** |
| **Testes de regressão** (gate de deploy roda Vitest) | `blocoDoServico('Domingo 09:30') === 'Domingo Manhã'` **e** `'Domingo 08:30'` idem (guarda anti-remoção do histórico); `escolherCultoPorRelogio` exportada e pura com “agora” **injetado**, exigindo zero buraco entre cultos do mesmo período; classificação de todo `vol_service_types` ativo por exatamente um de sede/ami/bridge. **Mutation-testar cada um** | alta |

---

## 4 · RISCOS DE REGRESSÃO — o que quebra em silêncio e como detectar

### 4.1 · Os 8 modos de falha silenciosa (nenhum gera erro, log ou zero visível)

1. **Descarte por `ELSE NULL` + `WHERE IS NOT NULL`** (voluntariado): a linha **desaparece**, não vira zero. Um total menor não parece bug. **Já engole hoje** 5 nomes fora da régua (`RETIRO AMI 2026`, `Culto de Natal 2025`, `GC 12 HORAS`…) que passaram só porque têm 0 check-ins.
2. **Snapshot × vivo na mesma linha**: `cultos.hora`=10:00 e `service_type_name`=Domingo 09:30 renderizados a duas linhas de distância (MiniCard da Produção, chip do pager Kids). Vira “bug irreproduzível”.
3. **Fallback que escolhe sozinho**: `ordenados[0]` da apresentação de bebês; `sessoesAbertas[0]` do totem Kids; `metodos[0]`… Regra de negócio explícita substituída por decisão técnica, sem log.
4. **HTTP 200 com erro no corpo**: `skippedItems` do auto-create engole o 23505 semanal.
5. **Rótulo vivo reescrevendo o passado**: nenhuma tela avisa que o gráfico de 2023 mudou de nome.
6. **Denominador mudando sem a fórmula mudar**: média por culto sobe, ocupação semanal cai, `variacao_pct` fica negativo — tudo por composição.
7. **Cultos fantasma com 0**: entram em `noPeriodo`, em “N culto(s) Sede”, viram barra zerada, alimentam 2 notificações/dia e podem receber sessão Kids + consolidação.
8. **`?? false` em flag ausente**: `hasKids`/`hasOnline` NULL → o modal conclui “não tem kids” e **grava 0**, apagando o consolidado do totem/bot.

### 4.2 · Consultas de detecção (todas somente-leitura)

**Cultos órfãos (deve ser sempre 0 — é 0 hoje em 1.184 linhas):**
```sql
SELECT count(*) FROM cultos WHERE service_type_id IS NULL;
```

**Snapshot discordando do catálogo (0 hoje em 731 linhas de domingo; após o corte deve haver exatamente 2 horas distintas por tipo alterado):**
```sql
SELECT vst.name, c.hora, count(*), min(c.data), max(c.data)
  FROM cultos c JOIN vol_service_types vst ON vst.id = c.service_type_id
 WHERE vst.recurrence_day = 0 GROUP BY 1,2 ORDER BY 1,2;
```

**Nome do culto discordando do prefixo do tipo (invariante = 0 hoje; se der > 0, é a quantidade de histórico com rótulo contraditório):**
```sql
SELECT count(*) FROM cultos c JOIN vol_service_types vst ON vst.id = c.service_type_id
 WHERE c.nome NOT ILIKE vst.name || '%';
```

**Voluntariado — nenhuma linha de domingo pode sair `false`:**
```sql
SELECT s.service_type_name, count(*) AS checkins,
       public.fn_dash_vol_service_no_bloco(s.service_type_name) AS entra_no_bloco
  FROM vol_check_ins c JOIN vol_services s ON s.id = c.service_id
 GROUP BY 1,3 ORDER BY 2 DESC;
```
E o teste direto da régua: `SELECT public.fn_dash_vol_service_no_bloco('Domingo 09:30');` → deve ser `true`.

**Financeiro — a fronteira 09:30 (nenhum resultado pode voltar “Domingo 8:30” nem “Domingo 10:00”):**
```sql
SELECT h, (SELECT nome FROM fin_culto_slots s
            WHERE s.id = fin_identifica_culto(('2026-08-30 '||h)::timestamp)) AS slot
  FROM (VALUES ('08:00'),('09:29'),('09:30'),('10:59'),('11:00'),('19:15')) v(h);
```

**Duas engines de KPI Sede (diferença hoje = 0; se deixar de ser 0, a classificação quebrou):**
```sql
-- engine1 (usada pelo realizado)
SELECT COALESCE(SUM(c.presencial_adulto),0) FROM cultos c
  LEFT JOIN vol_service_types vst ON c.service_type_id = vst.id
 WHERE (LOWER(vst.name) LIKE 'domingo%' OR LOWER(vst.name) = 'quarta com deus')
   AND c.data >= '2025-01-01' AND c.data < '2026-01-01';
-- engine2 (usada pela meta) — mesmo período, deve dar o MESMO número (98564)
SELECT COALESCE(SUM(presencial_adulto),0) FROM cultos
 WHERE data BETWEEN '2025-01-01' AND '2025-12-31'
   AND lower(nome) NOT LIKE '%ami%' AND lower(nome) NOT LIKE '%sabado%'
   AND lower(nome) NOT LIKE '%sábado%' AND lower(nome) NOT LIKE '%bridge%'
   AND lower(nome) NOT LIKE '%online%';
```

**Kids — dado consolidado prestes a ser zerado pelo próximo save:**
```sql
SELECT c.id, c.data, c.nome, c.presencial_kids, c.decisoes_kids, c.decisoes_online
  FROM cultos c JOIN vol_service_types st ON st.id = c.service_type_id
 WHERE (st.has_kids = false AND (c.presencial_kids > 0 OR c.decisoes_kids > 0))
    OR (st.has_online = false AND c.decisoes_online > 0)
 ORDER BY c.data DESC;
```

**Flags do tipo novo (as 3 linhas de domingo têm de ser idênticas):**
```sql
SELECT name, recurrence_time, is_active, has_kids, has_online, has_online_stream,
       presencial_label, meta_duracao_min, color
  FROM vol_service_types WHERE recurrence_day = 0 ORDER BY recurrence_time;
```

**Grade efetiva do check-in da manhã (deve devolver exatamente 09:30 e 11:30):**
```sql
SELECT id, name, recurrence_time FROM vol_service_types
 WHERE recurrence_day = 0 AND is_active = true AND recurrence_time < '14:00:00'
 ORDER BY recurrence_time;
```

**Fantasmas remanescentes:**
```sql
SELECT count(*) FROM cultos
 WHERE service_type_id = '6a1e566d-e335-4afe-b7f7-46abbd717944'
   AND data >= '2026-08-30' AND deleted_at IS NULL;  -- deve ser 0 após o passo
```

### 4.3 · Verificação de campo no primeiro domingo (30/08)
- Totem Kids às **08:50, 09:35, 10:45 e 11:15**: o chip “Registrando em:” tem de dizer **09:30** nos dois primeiros e **11:30** nos dois últimos; não pode haver momento sem culto.
- Voluntariado: soma de `voluntariado` em `vw_dashboard_voluntariado` na semana ISO de 30/08 **igual** ao `count(DISTINCT pessoa)` bruto dos check-ins do dia.
- Produção: contar quantas entradas de legenda aparecem para o domingo de manhã na aba Detalhado (filtro padrão **90d**, que atravessa o corte).
- Online: `online_pico > 0` e `youtube_video_id` preenchido no culto de 09:30 (se vier NULL, o suspeito nº 1 é `has_online=false`).
- Financeiro: um PIX de domingo de manhã na semana seguinte — conferir em qual `culto_slot_id`/conta caiu.

---

## 5 · ORDEM DE EXECUÇÃO SUGERIDA

> **Reversibilidade:** ✅ = reversível com 1 comando · ⚠️ = reversível com backup/retrabalho · 🔴 = **irreversível ou caro de desfazer**

### FASE 0 — decisões e backups (até 20/08) · ✅
0.1 Decisões 1 a 5 do §2, **por escrito**. Sem a Decisão 1 nada abaixo pode começar.
0.2 Backups de leitura: `_bk_20260824_kpi_registros_sede` (SED-18/21 — 382 registros, **100% `origem='auto'`, portanto 100% sobrescrevíveis**), JSON das 72 linhas futuras de `cultos`, estado atual de `fin_culto_slots` e `batismo_horarios`.
0.3 Registrar os números de referência **antes** (para auditoria depois): YTD 2026 até 11/08 `culto=todos` = **324,5/culto sobre 200 cultos**; domingo isolado **408,6/culto sobre 127**; 08:30 isolado **195,8/culto, 32 cultos, total 6.264**; `mediaGeral` semanal **2057**; engine1 = engine2 = **98.564** em 2025.

### FASE 1 — código no ar ANTES de qualquer mudança de dado (21–23/08) · ✅
1.1 PR único com: as 3 correções SQL do voluntariado (`+ 'Domingo 09%'` + `recurrence_time` do bloco) **e** `volMatch.ts:37` — **juntos**, senão card e drill-down discordam.
1.2 Correções do Kids: janela (`escolherCultoPorRelogio`), fallback de sessão vencida, `is_active`/`deleted_at` em `/cultos-do-dia`, guard no `garantir`, spread condicional no ModalCulto.
1.3 Fallback por `c.nome` no `isSedeCulto`/`_isSedeCulto`/`painelArea`; 409 + `authorizeModule('voluntariado',5)` no DELETE de tipo; pré-checagem do auto-create por `(tipo,data)`.
1.4 Testes de regressão (mutation-testados) + rodar o gate.
1.5 Publicar. **Nada de dado mudou ainda — se algo der errado, é revert de PR.**

### FASE 2 — Planning Center e batismo (23–24/08, **após a cerimônia de 23/08**) · ✅
2.1 **PCO**: hora dos planos de 30/08 e 06/09 → 09:30. Verificar no domingo seguinte que `vol_services.scheduled_at` chegou a 09:30 e que as 84 escalas mantiveram o mesmo `service_id`.
2.2 **`batismo_horarios`**: fechar 08:30 e 10:00 (`aberto=false`, **nunca soft-delete**), criar/abrir o horário decidido com ordinais corrigidos. Conferir `GET /api/public/batismo/horarios`.
2.3 Conferir com a equipe se sobrou inscrição `pendente` para 27/09 nos horários velhos (janela entre 24/08 e a correção) e reagendar antes de 26/09, quando o cron dispara.

### FASE 3 — o corte propriamente dito (24/08, numa janela combinada) · ⚠️/🔴
> **A ordem interna importa: is_active ANTES de limpar linha, senão o cron recria.**

3.1 `vol_service_types`: INSERT do tipo novo **com todas as flags** (opção B) · `is_active=false` nos que saem. **NUNCA DELETE.** ✅
3.2 `vol_escala_template_tipos`: INSERT do vínculo. ✅
3.3 As 72 linhas futuras de `cultos` (`data >= '2026-08-30'`): remover as dos tipos que saem (com as guardas de “tudo zerado + sem satélite”, conferidas **no momento da execução**, não em 11/08) e materializar o 09:30. 🔴 *(as linhas estão vazias, mas o DELETE não volta — backup do 0.2 é obrigatório)*
  ⚠️ Fazer em **lotes**: o trigger `cultos_recalc_kpis` é **FOR EACH ROW** — um UPDATE em 731 linhas dispara 731 recálculos numa transação.
3.4 `fin_culto_slots`: recorte das 3 janelas de domingo + `ativo=false` no slot que sai (**não DELETE** — é FK de `fin_pix_detalhe`/`fin_transacoes`). ⚠️ E **não reprocessar PIX antigo depois disso** enquanto não houver vigência: sairia com o formato novo carimbado em domingo velho.
3.5 `fin_plano_contas` conforme a Decisão 2. ⚠️
3.6 `whatsapp_config` → horários novos (ou texto ponte). ✅
3.7 Conferir **no catálogo e nos dados** (as consultas do §4.2), nunca no `{"success": true}`.

### FASE 4 — o que só chega por outro canal (25–29/08) · ✅
4.1 **OTA do CBRio-Staff** (`index.tsx:276` → `'9h30 · 11h30 · 19h'`; `eas update` no canal de produção). **Item de checklist com dono nomeado — não sai no merge do ERP.**
4.2 PR cosmético/estrutural: `NovoSite.tsx`, texto de ajuda da Integração, prompts de IA, comentários dos workflows, exemplos das etiquetas, cores/chaves da Produção, `shortLabel`, avisos de corte no `/ytd`.
4.3 App de membros: se a opção B foi seguida, ele já lê `cultos.hora` correto das linhas novas — **conferir na Home** que o card mostra 09:30 e que “ao vivo” bate.

### FASE 5 — primeiro domingo (30/08) e pós (31/08–15/09)
5.1 Verificação de campo do §4.3, com alguém acompanhando o totem Kids na virada 10:30–11:00.
5.2 Rodar as consultas de invariante e comparar com os números do 0.3.
5.3 `dashboard_metas`: **não recalibrar ainda** — anotar o corte no `rotulo`. Recalibrar só a partir de outubro (setembro inteiro em grade nova).
5.4 Apresentação de bebês: corrigir antes de **13/09**.
5.5 Batismo: conferir o lembrete de **26/09** antes de sair.

### O que **não** é para fazer
- ❌ Não usar “Remover” em tipo de culto (B10/B11).
- ❌ Não confiar em `is_active=false` para limpar linha já materializada, nem em soft-delete para esconder culto do totem/Produção (nem a rota nem `vw_culto_stats` filtram `deleted_at`).
- ❌ Não re-rodar `gerar_cultos_recorrentes` esperando correção (é INSERT-ONLY).
- ❌ Não usar “Gerar 2026 inteiro” (D10) — gera domingos retroativos.
- ❌ Não tocar em `cultos.nome`/`hora`/`vol_services.service_type_name`/`horario_culto`/`culto_label` **anteriores ao corte** — são o snapshot que preserva o histórico.
- ❌ Não tocar nas 6 inscrições de batismo de 23/08.
- ❌ Não dropar `cultos_service_type_data_hora_uniq` **durante** a migração (é remover a rede quando ela serve).
- ❌ Não “consertar” `bloco_servico` (D1) achando que resolve o voluntariado.

---

## 6 · HONESTIDADE SOBRE O QUE CAIU NA VERIFICAÇÃO E O QUE NÃO FOI VERIFICADO

### 6.1 · Achados que caíram (13) — **não usar como verdade**
| Alegação | Por que caiu |
|---|---|
| “A tela de classificação vai exibir ‘Domingo 8:30 · PIX em 30/08 09:00’ com confiança 0,90 e ser aceita sem conferência” | Errou o lugar. Pela fila o extrato não tem domingo (0 de 4.778) e a hora é 10:xx de lote → cai em “Em Geral” 0.60. O risco real é o **trigger** com o instante real do PIX (B1) — no dado, não na tela |
| “`cultos.nome` preserva o histórico nas telas” | **Invertido**: o padrão do front é `service_type_name \|\| nome` → o rótulo **vivo** vence e o passado é reetiquetado. Também não há “duas verdades na mesma linha” pelo `\|\|` — a divergência é entre camadas |
| “`vw_culto_stats` produz linha autocontraditória visível no PainelArea” | PainelArea só renderiza o snapshot. O risco real está em `producao.js` agrupando por nome vivo (C3) e em `vw_fin_semana_cultos` (100% viva) |
| “`vol_service_types_name_unique` é trava de ordenação e exige nome temporário” | `'Domingo 09:30'` não está ocupado; 11:30 e 19:00 mantêm nome → não há cadeia. O risco real é o **oposto**: **não existe UNIQUE em `(recurrence_day, recurrence_time)`**, então dois tipos ativos às 09:30 são aceitos e `gerar_cultos_recorrentes` criaria **dois cultos no mesmo domingo** com nome idêntico, sem violar nada |
| WiFi: “218 logins ficam órfãos” + “a sobreposição aumenta” | Os 218 são frequentadores do 08:30 (não early-birds) e vão logar a partir de 09:00; a faixa órfã só **desloca** de 07:00–07:59 para 08:00–08:59 (62 logins já órfãos hoje). E a sobreposição **cai** de 120 para 30 min. Os números “97 visitantes / 23 CPFs” foram computados sob contrafactual inválido — **não usar** |
| “`vw_fin_semana_cultos` multiplica a receita por nº de cultos e qualquer agregado muda de valor” | O mecanismo acusado é código morto (`culto_slot_id` NULL em 157.618 linhas) e **não existe view dependente nem consumidor que some**. Sobra o sintoma de exibição (`receita_total` do dia repetido por culto, `ticket` inflado), pré-existente |
| “SED-21/SED-18 ficam vermelhos por mudança de grade” | **Já estão** vermelhos/críticos (32 de 34 semanas de 2026 abaixo da meta) por meta de +30% sobre 2025. E o 08:30 é **12,1%** do presencial de domingo (195,8/culto, o **menor** culto), não ~25%; o coletor soma **pessoas**, não cultos → a queda esperada é ~zero se houver redistribuição. Agir aqui como se a grade fosse a causa levaria a mexer em meta/histórico pelo motivo errado |
| Backfill de vídeo do YouTube “re-data retroativamente e cross-linka a live do 08:30” | **0 cultos passados sem `youtube_video_id`** nos 180 dias; a live do 08:30 nunca começou ≥09:00 (máx 08:43). O risco real é o **espelho**: se a linha do **08:30** for retimada para 09:30, todo culto 08:30 ainda NULL passa a ancorar em 09:30 e a live das 10:00 vira a mais próxima |
| “`has_online_stream` ausente no CRUD deixa o tipo invisível ao cron” | O default é `NOT NULL DEFAULT **true**`. O erro possível é o inverso (tipo sem transmissão entrando na coleta) |
| “‘Gerar 2026 inteiro’ é no-op justamente em 30/08 e 06/09 e o check-in não acha o culto” | `/cultos-manha` lê `vol_service_types` e `ensureServiceDoTipo` materializa no check-in → o 09:30 aparece assim que o TIPO existir. O toast diria “**19** culto(s)”, não 0. E o pulo do PCO é comportamento correto |
| “O alerta de culto sem dados cobra o Marcelo por 3 canais, para sempre” | `apurarCultosPendentes` lança antes de notificar (coluna `decisoes` inexistente) — **0 notificações em 8 segundas**. Risco **latente**: o dia em que alguém corrigir a coluna, a cobrança fantasma acorda. E a janela é rolante (~18 cobranças, não perpétua) |
| “O live-monitor grava a live do pré-culto no fantasma de 08:30 e bloqueia o 09:30 por 1:1” | Antecedência máxima observada 9–11 min (precisaria de >30); o sort DESC entrega o culto certo às 09:00; há recovery de pico via Analytics; e a guarda 1:1 **não é absoluta** (4 domingos em produção com 2 cultos no mesmo `video_id` — problema pré-existente, sem relação com esta mudança) |
| Flow do WhatsApp / `aplicarColetaFlow` | **0 coletas com `fonte='flow'`**, 0 `nfm_reply`, 6 registros de `flow_fail: Integrity requirements not met` (última 20/07). Defeito **latente**, não quebra ativa; e o caminho de texto rebusca o culto no momento de aplicar e devolve 422 claro |

### 6.2 · O que **não** foi verificado (limites honestos deste relatório)
- **Nenhum teste em staging/preview.** Tudo é análise estática do repo + leitura do banco de produção. Nenhuma tela foi aberta, nenhum fluxo executado.
- **Valores de env na Vercel**: `WHATSAPP_BATISMO_HORA` (é o `{{2}}` das **578 inscrições legadas sem `horario_culto`** — se alguém trocou para “08:30”, o lembrete sai errado para esse grupo; pelo commit `70e0a13b` o default era “19h”), `WHATSAPP_TEMPLATE_*` (só a **presença** de `WHATSAPP_TEMPLATE_BATISMO` foi confirmada), `WHATSAPP_ESTUDO_DIA`, `PUBLIC_FORM_RATE_LIMIT_MAX`. Não foi feito `env pull`.
- **Discrepância não resolvida**: `vercel crons ls` apareceu como **45** numa leitura e **47** noutra, em momentos diferentes da varredura. O ponto verificado é que **nada foi truncado** e os crons citados estão registrados; a contagem exata deve ser reconferida antes do corte.
- **Planning Center**: não sei se a hora dos planos de 30/08 e 06/09 **pode** ser editada por nós nem quem tem a permissão. Isso é pré-requisito de A3 e não é código.
- **CBRio-Staff**: não inspecionei o canal de OTA nem a configuração de `eas`; assumi `eas update` no canal de produção.
- **As 72 linhas futuras foram medidas em 11/08.** “Todas vazias, zero filhos” pode deixar de ser verdade até 24/08 (o totem, o WiFi e o face escrevem em dia de culto). **Reconferir no momento da execução**, incluindo as 4 tabelas **sem FK** (`face_presencas`, `face_anonimos.ultimo_culto_id`, `fin_arrecadacao`, `int_visitantes`), que nenhuma constraint protege.
- **`meta_duracao_min` do formato novo**: decisão pendente, e o bug D3 significa que o card semanal ignora a meta por tipo de qualquer forma.
- **A migração/consolidação de séries históricas** (juntar 08:30+10:00 numa série só) foi descartada por análise: `uniq_culto_service_data (service_type_id, data)` garante **106 colisões** (todo domingo desde 22/12/2024 tem os dois), e cada linha carrega `presencial_adulto`/decisões/`online_ds` próprios. Não testei nenhum caminho de merge.
- **Não avaliei** o módulo de inscrições/pagamentos, nem se algum evento da espinha (`insc_eventos`) usa horário de domingo — ficou fora do escopo das 6 dimensões.
- **RLS**: verificado que **nenhuma policy** é sensível a nome/horário/`recurrence_*` e que a escrita em `cultos` é exclusiva de `service_role`. **Não é preciso bust de cache de permissões** para esta mudança.
- **Achados adjacentes reais, fora do escopo, que apareceram e precisam de dono próprio**: 4 domingos com dois cultos compartilhando o mesmo `youtube_video_id` (pico/DS contados em dobro); `vw_fin_transacoes_completa.culto_nome` sempre NULL (`culto_slot_id` nunca preenchido em `fin_transacoes`) → o caminho `temFiltro` do financeiro devolve receita 0 por culto em silêncio; `vw_culto_stats` sem filtro de `deleted_at` afetando 10+ leitores (o item “soft-deletes AGREGADOS pendentes” do CLAUDE.md); guard de leitura (`membresia,1`) em rotas de escrita de `/service-types`.