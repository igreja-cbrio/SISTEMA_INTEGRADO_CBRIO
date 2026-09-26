# Multi-campus · documento de design (ADR)

> Status: **planejamento retomado** · Revisão: 2026-09-26
> Origem: gestão + Claude Code (2026-07-01). Alvo atualizado:
> **possível segundo campus físico em março de 2027**.

Referência viva do projeto que torna o ERP da CBRio **multi-campus** (multi-sede
física), preservando o campus atual (Sede) sem regressão. Escrito antes da
primeira migration — a Fase 0 concreta sai deste doc.

---

## 0. Retomada e plano de entrega (2026-09-26)

**Objetivo atualizado:** preparar o sistema para um possível segundo campus
físico em março de 2027. O pedido é planejar antes de implementar. Esta revisão
não aplica migrations, não altera acessos e não ativa um campus novo.

Esta seção substitui o diagnóstico e o calendário de julho abaixo. Os registros
anteriores são contexto de decisões, não prova do estado atual de produção.
Não executar os exemplos SQL históricos como se fossem migrations prontas.

### 0.1 O que foi conferido

Código auditado na `main` de setembro e catálogo do projeto Supabase de produção
`hhntwfawfnxvuobhdfkb`, por consultas somente de leitura em 26/09/2026:

| Evidência | Estado observado | Consequência |
|---|---|---|
| `igrejas` | 4 cadastros ativos: Sede, Online e duas CBAs acompanhadas | Cadastro de unidades existe; isso não comprova isolamento operacional |
| `usuario_igrejas` | 0 vínculos | Ativar o filtro agora bloquearia usuários comuns sem preparar seus acessos |
| Colunas `igreja_id` | 21 tabelas, incluindo a própria `usuario_igrejas` | Propagação parcial; não usar a estimativa antiga de “5 tabelas” |
| `pg_policies` | Nenhuma expressão menciona `igreja_id`, `campus`, `usuario_igrejas` ou `current_user_igreja_ids` | Isolamento por campus ainda não está aplicado nas policies |
| `modulos.escopo_campus` | Integração/Grupos/Kids isolados; Financeiro/RH/Patrimônio compartilhados | Preservar a decisão mais recente de operação administrativa central |
| `backend/middleware/auth.js` | Sem resolução de campus nos caminhos auditados | A API também precisa impor escopo; RLS sozinha não protege consultas com service role |
| `backend/routes/painel.js` e `dashboardSemanal.js` | Sem recorte `igreja_id`/campus nos arquivos auditados | Painéis não estão preparados para apresentar recortes independentes |
| `src/contexts`, portas públicas de Grupos/Batismo e matcher canônico | Sem seleção/propagação de campus nos caminhos auditados | Campo no banco não basta: cada ato precisa de origem validada no servidor |
| `financeiroV2.js` | Centro de custo já tem filtro/campo `campus` | Reaproveitar e auditar esse modelo; não confundir o campo existente com isolamento completo |

As 20 tabelas de negócio com `igreja_id` observadas: `batismo_inscricoes`,
`cui_acompanhamentos`, `cui_convertidos`, `cui_jornada180`, `insc_eventos`,
`int_visitantes`, `kids_pagers`, `kids_salas`, `log_compras`, `log_notas_fiscais`,
`log_pedidos`, `log_solicitacoes_compra`, `mem_grupo_membros`, `mem_grupos`,
`mem_membros`, `mem_voluntarios`, `next_inscricoes`, `nsm_eventos`,
`solicitacoes`, `totem_estacoes`.

Referências de código: migrations `20260701050000`, `20260701060000`,
`20260701070000`, `20260701080000`, `20260701090000`; `backend/utils/supabase.js`
(service role); `backend/services/membroMatch.js`; `backend/routes/publicBatismo.js`;
`backend/routes/publicGrupos.js`; `backend/routes/financeiroV2.js`.

### 0.2 Contrato que deve permanecer igual em todos os módulos

1. **Pessoa única.** O matcher CPF → contato+nome → nascimento+nome continua
   canônico e global. Uma visita a outro campus não cria uma segunda pessoa.
   Campus-base, acesso de funcionário e campus do ato são informações distintas.
   A conciliação global de identidade não autoriza expor a ficha global ao operador.
2. **Campus do ato é histórico.** Presença, decisão, inscrição, escala e lançamento
   pertencem ao campus do evento/operação. Transferir o campus-base de alguém não
   move seus atos antigos. Divergência entre campus pai e filho deve ser recusada.
3. **Autorização no servidor e no banco.** Campus solicitado pelo cliente é filtro,
   não autorização. Leitura, escrita, exportação, arquivo e operação em lote devem
   intersectar módulo, nível, vínculo e campus permitidos. Configurar um módulo
   como compartilhado não remove suas regras de identidade, PII ou nível.
4. **Operação central não significa dado público.** Financeiro/RH/Patrimônio ficam
   centrais, conforme a revisão de julho. Recortes gerenciais de custo e resultado
   por campus não concedem acesso a salário, contribuição ou ficha individual.
5. **Indicadores têm universo declarado.** Cada KPI/OKR precisa indicar campus,
   período, área e população. Percentuais consolidados usam numeradores e
   denominadores; não são média simples dos percentuais das unidades. Pessoas
   únicas no consolidado exigem deduplicação, não soma dos totais locais.
6. **Calendários preservados.** Financeiro continua quarta→terça e frequência
   segunda→domingo. Acrescentar campus não pode unificar essas semanas.
7. **Ausência de campus não pode escolher uma unidade por acidente.** O fallback
   legado para Sede deve ter uma transição explícita. Antes de operar Campus 2,
   clientes antigos e rotas sem contexto precisam de tratamento testado; não
   deixar um default silencioso gravar seus dados na Sede.

### 0.3 Ordem de implementação e PRs pequenas

As faixas abaixo são janelas de planejamento, não promessa de prazo. Cada linha
se divide por módulo, endpoint e grupo de tabelas; não agrupar reescrita global de
RLS ou de todos os KPIs em uma PR. Nenhuma alteração de autorização/migration
contorna os gates do AGENTS.md.

| Etapa / janela sugerida | PRs a preparar | Evidência necessária para avançar |
|---|---|---|
| A · set/out | Inventário de tabelas, policies, grants, views/RPCs, rotas, cache, jobs, exports e contratos; matriz por módulo e dono de validação | Catálogo vivo confrontado com Git; fluxos da Sede e números de referência registrados sem exportar PII |
| B · outubro | Resolver campus permitido na API; contexto e cache por usuário/campus; preparar vínculos de acesso; testes de negação | Usuário sem vínculo falha fechado; usuário com dois campi alterna sem carregar dados do anterior; super-admin segue política explícita |
| C · out/nov | Adicionar dimensão aos atos e agregados faltantes, índices e unicidades; backfill auditável; pais/filhos consistentes | Dois cultos no mesmo horário/data coexistem; zero órfãos; dados históricos classificados sem adivinhar por nome |
| D · novembro | Ativar escopo por módulos pilotos, primeiro Cultos/Integração, depois Cuidados/Grupos/Next e Voluntariado | API com service role e acesso direto via RLS bloqueiam leitura e escrita cruzadas; regressão da Sede aprovada |
| E · nov/dez | Kids/totens, portas públicas, eventos e aplicativos; isolamentos de estações, salas e filas | Check-in, responsáveis, etiquetas, inscrições e capacidade respeitam o campus; operação simultânea validada |
| F · dez/jan | NSM/KPIs/OKRs, dados brutos, caches, painéis semanal/mensal/anual e consolidados | Agregados reconciliados com fontes; sem duplicação; filtros e exportações contam o mesmo universo |
| G · janeiro | Compras/Solicitações, Marketing/Projetos, custos por campus, RH/Patrimônio centrais e prestação de contas | Aprovações e filas chegam à equipe certa; DRE e rateios têm regra aprovada; matriz de dados sensíveis preservada |
| H · jan/fev | Notificações, WhatsApp, crons, integrações, reconciliação e observabilidade por campus | Retry/idempotência incluem a dimensão correta; um job não deixa outra unidade sem processamento; alarmes independem de IA |
| I · fevereiro | Ensaio completo com dados sintéticos, treinamento, operação paralela e plano de reversão | Pelo menos dois ciclos semanais completos, reconciliação da Sede e checklist de incidentes aprovados |
| J · março | Ativação controlada do segundo campus | Todas as etapas críticas aprovadas; nenhum acesso cruzado ou rota legada sem tratamento |

Modelo de sequência por módulo: contrato e testes → schema aditivo → backfill
com relatório → API compatível → RLS revisada → UI/app → observação e reconciliação.
A ativação fica separada da instalação de estruturas. Enquanto só houver Sede em
operação, preparar o segundo campus não deve alterar os números da Sede.

### 0.4 Cobertura ponta a ponta

| Frente | O que precisa ser tratado | Teste de aceite específico |
|---|---|---|
| Cultos/Integração/Produção | Agenda local, tipos/horários, decisões, frequência, cancelamento e materialização | Mesma data/hora em duas sedes sem colisão nem dupla geração |
| Pessoas/portas de entrada | Matching global, campus-base, origem do ato, contatos secundários e fila de identidade | CPF já existente em outra unidade não duplica nem expõe sua ficha |
| Cuidados/Jornada/Grupos/Next/Batismo | Encaminhamentos, equipes, agenda, vagas, inscrição e mudança de unidade | Pessoa visita outra unidade e mantém histórico e encaminhamento rastreáveis |
| Kids/estações | Responsáveis, sala, turma, capacidade, etiqueta, pager e display | Token de uma estação não acessa salas ou crianças fora de seu escopo |
| Voluntariado | Times locais/compartilhados, escala, concessões e check-in | Líder escala apenas equipes autorizadas; visita não duplica voluntário |
| Apps de membros e Staff | Campus ativo, identidade, cache, deep links, notificações e versões antigas | Troca de campus não reutiliza dados antigos; deep link valida contexto no servidor |
| Eventos/inscrições/pagamentos | Dono do evento, locais participantes, capacidades e inscrição global/local | Evento da rede não dobra inscrição nem receita ao consolidar |
| NSM/KPIs/OKRs | Fonte, meta, período, dimensão, unicidade, materializações e drilldown | Número do card bate com pessoas/atos do recorte; consolidado documenta deduplicação |
| Financeiro/contas/relatórios | Operação central; atribuição analítica, rateios, transferências e consolidação | Transferência interna não vira receita nova; valores reconciliam com o razão |
| RH/Patrimônio | Gestão central, lotação/movimentação e responsáveis por ID | Gestor local não ganha acesso à folha ou ao patrimônio fora da concessão |
| Solicitações/Compras/Logística | Campus solicitante, atendimento central/local, alçadas, estoque e SLA | Aprovação cruza equipes autorizadas; entrega e estoque têm unidade inequívoca |
| Marketing/Projetos/Planejamento/Governança | Escopo institucional/local, responsáveis, calendário e prestação de contas | Projeto compartilhado aparece no consolidado uma vez, com participações declaradas |
| Online/Devocionais/Cérebro | Conteúdo institucional versus sinais de participação e documentos restritos | Conteúdo compartilhado não abre dados individuais ou pastorais a outro campus |
| Jobs/WhatsApp/notificações | Destinatários, partição de filas, retry, rate limit e limites de execução | Falha numa unidade não trava nem duplica trabalho das demais |
| Auditoria/arquivos/BI | Logs, exports, PDFs, links assinados, busca, storage e snapshots | Mesmo arquivo/dado continua protegido fora da tela e em acesso por ID |

### 0.5 Decisões que precisam ser fechadas antes do código correspondente

- Horários/tipos de culto próprios por sede versus catálogo institucional com
  configuração local; quem pode criar exceções.
- Regra de transferência e atuação em vários campi para pessoas, líderes e times,
  incluindo quando manter ou encerrar vínculos antigos.
- Rateio gerencial e metas de campus com Financeiro/RH centrais: dimensão analítica
  por ato, centros de custo e visão permitida à liderança local.
- Atendimento e alçadas de solicitações: local, central ou híbrido por categoria.
- Público dos formulários/eventos da rede, capacidade e pagamento por unidade.
- Destino de dados, estações e jobs quando uma unidade é inativada.

Essas decisões complementam o que já foi acordado; não reabrem automaticamente
pessoa única, operação central de Financeiro/RH/Patrimônio ou isolamento de PII.

### 0.6 Critérios de segurança, corte e reversão

- Matriz de testes com usuário Sede, usuário Campus 2, usuário multi-campus,
  membro comum e administrador; cobrir leitura, escrita, IDs adivinhados,
  exportação, storage e chamadas diretas sem a UI.
- Testar service role através da API e RLS com anon/authenticated separadamente.
  Um teste verde em uma camada não comprova a outra.
- Comparar coortes e somas antes/depois com snapshots agregados; divergência deve
  ter explicação do domínio, não ser resolvida alterando a meta ou arredondamento.
- Toda PR de schema traz SQL completo, pré-condições, verificação e compatibilidade
  com a versão anterior. Não retirar policies protetoras para “destravar” a entrega.
- Reversão de UI/código não desfaz o campus dos atos já gravados. Depois de operar
  duas unidades, não voltar para leitores/escritores sem escopo: bloquear a função
  afetada ou corrigir mantendo o isolamento.
- A ativação de Campus 2 precisa de aprovação explícita de escopo e acessos.
  Nenhum dado real de menores, pastoral ou financeiro será usado em demonstração
  externa ou exportado para ferramenta de avaliação de IA.

### 0.7 Método e limitações desta retomada

Foram consultados Git e catálogo vivo, sem alteração de dados. As duas novas
revisões dos conselheiros falharam por falta de créditos do workspace; não há
consenso nem revisão por pares concluída desta versão. A priorização acima é
proposta técnica para revisão da gestão, não autorização de mudanças de RLS.

---

## 1. Objetivo e contexto

A CBRio considera abrir um **2º campus físico em março de 2027**. O sistema inteiro (banco, backend, frontend web, app mobile) precisa ganhar
a **ótica de campus**: cada unidade opera seus próprios cultos, grupos e
voluntariado, preservando o cadastro único de pessoas. Financeiro/RH/Patrimônio
permanecem centrais; a **diretoria enxerga o consolidado** de toda a rede.

**A natureza do projeto:** isto **não** é "adicionar uma coluna". É, no essencial,
um projeto de **isolamento de dados via RLS** — garantir que a liderança de um
campus **nunca** leia PII, financeiro ou dados de menores de outro campus. O
trabalho pesado e o risco estão na reescrita das policies RLS, não no schema.

---

## 2. Decisões travadas (gestão · 2026-07-01)

| # | Decisão | Escolha |
|---|---|---|
| 1 | **Modelo de membro** | Um **campus-base** por pessoa (`mem_membros.igreja_id`). Sem M:N de membro. |
| 2 | **Visibilidade entre campi** | **Configurável por módulo**: cada módulo é `isolado` ou `compartilhado`. |
| 3 | **Financeiro/RH** | **Separado por campus + consolidado** para a diretoria. |
| 4 | **Tipo do 2º campus** | **Nova sede física** (`tipo='sede'`). |

⚠️ Distinção essencial derivada da decisão #1: **pertencer** a um campus (membro)
≠ **ter acesso** a um campus (staff/liderança). Membro é campus-base único; o
**escopo de acesso** de um usuário pode abranger vários campi (líder regional,
diretoria). Por isso `usuario_igrejas` (acesso) é **M:N**, separado do
`mem_membros.igreja_id` (pertencimento).

---

## 3. Registro histórico de julho (superado pela auditoria da seção 0)

> **✅ FASE 0 CONCLUÍDA (2026-07-01)** — migration `20260701050000` aplicada em
> produção: `usuario_igrejas` + helper `current_user_igreja_ids()` +
> `modulos.escopo_campus` (18 isolados / 34 compartilhados). **Correção do
> diagnóstico abaixo:** a tabela `igrejas` **NÃO** está com `USING(true)` —
> verificado em prod, as policies de escrita já são super-admin (read
> autenticado / write super-admin / service), então esse "fix" era desnecessário.
> Resta a Fase 0b (`req.user.igrejas[]` no `auth.js`) — foi adiada para junto da
> Fase 2, quando as policies/rotas realmente consumirem o escopo (evita query
> por request sem consumidor).

Diagnóstico original (fundação **~30% pronta e majoritariamente decorativa**):

**✅ Existe:**
- Tabela `public.igrejas` (`20260507100000_fase1_igrejas.sql`): `id` UUID, `nome`,
  `slug`, `tipo` CHECK `('sede','online','cba_acompanhada')`, `pastor_responsavel_id`,
  `cidade`, `estado`, `ativa`. Seed: `...0001` = **CBRio Sede**, `...0002` =
  **CBRio Online**. Sem CBA real.
- `igreja_id` em **~5 tabelas apenas**: `mem_membros`, `int_visitantes`,
  `nsm_eventos`, `kids_salas`, `kids_pagers` (default Sede `...0001`).
- **NSM segmentada** (`nsm_estado.segmento_tipo` aceita `central|igreja_tipo|igreja_id|area|custom`).
  Seeds atuais por `igreja_tipo`: central, cbrio (`tipo=sede`), online, cba.

**❌ Falta:**
- `igreja_id` em **~205+ tabelas** (cultos, grupos, voluntários, decisões,
  `dados_brutos`, `kpi_*`, financeiro e RH inteiros, eventos, projetos, solicitações).
- Qualquer filtro de campus na RLS. A própria `igrejas` está com `USING(true)
  WITH CHECK(true)` (viola a regra #1 de segurança do `CLAUDE.md`).
- Helper `current_user_igreja_ids()`.
- `igreja_id` no `auth.js`/JWT (grep = **zero** menções a igreja/campus/sede).
- Seletor/contexto de campus no frontend e no app (zero).

⚠️ O "visão 5 campus" citado no `CLAUDE.md` é **preparo de performance** (escala
50k · views materializadas, cache, índices), **não** funcionalidade multi-campus.

---

## 4. Modelo de dados escolhido

**Shared schema + `igreja_id` + RLS por campus** (single database, single schema,
linha carimbada com o campus). Descartado schema-por-campus (multiplicaria as ~541
policies × N e quebraria os consolidados NSM/DRE) e banco-por-campus (idem, pior).

### 4.1 Pertencimento vs acesso
- `mem_membros.igreja_id` → **campus-base** do membro (já existe).
- `usuario_igrejas (usuario_id, igreja_id, papel)` → **escopo de acesso** M:N.
  Super-admin e diretoria geral = todos os campi (curto-circuito, como
  `is_super_admin()`).

### 4.2 Tabelas isoladas vs compartilhadas
A decisão #2 ("configurável por módulo") vira uma coluna
**`modulos.escopo_campus`** (`'isolado' | 'compartilhado'`). A RLS lê essa config
via helper: módulo isolado → filtra por `current_user_igreja_ids()`; compartilhado
→ sem filtro de campus.

Mapa **efetivo** (decidido pela gestão em 2026-07-01, já aplicado em
`modulos.escopo_campus`):

| Escopo | Módulos |
|---|---|
| **Isolado** (leva `igreja_id`) | integracao, cultos, cuidados, grupos, voluntariado, membresia, next, online, ami, bridge, logistica (compras), solicitacoes, dados-brutos, kids, producao, minha-area |
| **Compartilhado** (sem `igreja_id`) | **patrimonio** (bem é da igreja · direcionamento por setor), **financeiro**, **rh** (Central · um DRE/folha pra rede), catálogos (`modulos`, `cargos`, `areas`, `vol_service_types`), plano de contas, matriz `cargo_modulo_permissao`, eventos, comunicados, marketing, cerebro, expansao/planejamento |

> ⚠️ Revisões da gestão (2026-07-01) vs. as decisões iniciais: **Patrimônio** e
> **Financeiro/RH** viraram **Central** (a decisão #3 "separado+consolidado" foi
> revista para Central). **Compras/Logística** é **por campus** (cada setor faz o
> próprio pedido; fornecedores seguem como catálogo compartilhado).

### 4.3 Membro é multi-campus por natureza
O membro tem campus-base, mas o **ato** carimba o campus onde ocorreu: uma
contribuição, decisão ou check-in leva o `igreja_id` do **evento/culto**, não
necessariamente o campus-base da pessoa (ex.: membro da Sede que doa visitando o
Campus 2). Regra: **transação/decisão/presença = campus do ato**; cadastro do
membro = campus-base.

### 4.4 Financeiro/RH (revisão da decisão #3)

A proposta inicial de separar a operação foi revista em julho: Financeiro/RH
permanecem centrais, como registra `20260701090000_multicampus_fase1_leva4_fin_rh_central.sql`
e como foi confirmado em `modulos.escopo_campus` em 26/09/2026. Recortes gerenciais
por campus, rateios e prestação de contas precisam do contrato analítico da
seção 0; não acrescentar isolamento operacional a essas tabelas por inferência.

---

## 5. Mudanças estruturais específicas (armadilhas confirmadas)

1. **`cultos` · UNIQUE**: `uniq_culto_service_data UNIQUE (service_type_id, data)`
   (`20260514110000`) **quebra** com duas sedes no mesmo slot/data. Vira
   `UNIQUE (igreja_id, service_type_id, data)`. `gerar_cultos_recorrentes` passa a
   materializar por campus.
2. **NSM · segmento por campus**: com **duas sedes físicas** (ambas `tipo='sede'`),
   o segmento atual `cbrio` (`{"tipo":"sede"}`) juntaria as duas. Migrar os campi
   presenciais para `segmento_tipo='igreja_id'` (o schema já aceita) — semear 1
   segmento por campus. `recalcular_nsm()` v3 e `_kpi_agregar_dado` ganham
   parâmetro `igreja_id` (mesmo padrão do `area`).
3. **`kpi_*`/`dados_brutos` agregados**: adicionar `igreja_id` exige varrer **todo
   read-site e função SQL** com filtro novo (senão o KPI de um campus soma o outro).
   É o maior gargalo de tempo da Fase 1.
4. **Cultos recorrentes**: os `vol_service_types` são catálogo compartilhado (o
   slot "Domingo 10:00" é o mesmo conceito); a **instância** (`cultos`) é que é por
   campus. Confirmar se cada campus terá seus próprios horários ou herda o catálogo.
5. **App mobile / comunicados / push / totem kids**: hoje assumem 1 unidade —
   ganham dimensão de campus na Fase 3.

---

## 6. RLS · padrão das policies

Helper novo (segue o padrão `STABLE SECURITY DEFINER SET search_path = public`):

```sql
CREATE OR REPLACE FUNCTION public.current_user_igreja_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_super_admin() OR public.is_diretoria_geral() THEN
      ARRAY(SELECT id FROM public.igrejas WHERE ativa)
    ELSE
      ARRAY(SELECT igreja_id FROM public.usuario_igrejas WHERE usuario_id = auth.uid())
  END
$$;
```

Policy de tabela isolada (soma o campus aos helpers `current_user_*` existentes —
não os substitui):

```sql
CREATE POLICY <tab>_select ON public.<tab>
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      igreja_id = ANY (public.current_user_igreja_ids())
      AND public.current_user_module_level('<slug>') >= 1
    )
  );
```

---

## 7. Plano de testes (portão de go-live)

Suíte de **não-vazamento** obrigatória no CI antes de o Campus 2 entrar em prod:

- **(a)** Usuário do Campus 2 (via anon key, RLS no caminho) **NÃO** lê
  membro/contribuição/decisão/RH/PII do Campus 1 — testar por módulo isolado.
- **(b)** NSM e DRE **separados** por campus; consolidado só para diretoria.
- **(c)** Dois cultos no mesmo slot/data (um por campus) **coexistem**.
- **(d)** Cron da NSM e coletores de KPI **particionam** por campus (não somam
  entre campi).
- **(e)** Backfill: **zero** `igreja_id` órfão/nulo em tabela isolada; histórico
  100% atribuído à Sede.
- **(f)** Teste de regressão do Campus 1: números da Sede **inalterados**
  pós-migração.
- **(g)** CI falha em qualquer policy `TO public`/`USING(true)` em tabela com PII
  (guarda estrutural — captura regressão de RLS, ver incidente `vol_*`).

---

## 8. Roadmap histórico (Jul → Dez 2026 · substituído pela seção 0.3)

| Fase | Janela | Entregas | Pré-req |
|---|---|---|---|
| **0 · Fundação** ✅ | ~~Jul (1ª quinz.)~~ **feito 2026-07-01** | `usuario_igrejas` + `current_user_igreja_ids()` + `escopo_campus` em `modulos` (migration `20260701050000`, em prod). `igrejas` já estava travada (fix desnecessário). `req.user.igrejas[]` no `auth.js` movido p/ Fase 2 | — |
| **1 · Propagar `igreja_id`** 🟡 | 2026-07-01 (levas 1-4, em prod) | ✅ Feito nas tabelas isoladas não-agregadas: `cui_*`, batismo, next, `mem_grupos`, `mem_grupo_membros`, `mem_voluntarios`, `solicitacoes`, `log_*` (compras). Financeiro/RH/patrimônio ficaram **centrais** (sem `igreja_id`). **Falta o grupo C** (agregadas: `cultos`, `cultos_decisoes_pessoas`, `kpi_*`, `dados_brutos`, `mem_contribuicoes` + o `UNIQUE` novo do `cultos`) — exige varredura de read-sites/funções SQL antes de filtrar. | Fase 0 |
| **2 · RLS por campus + CI** | Set → Out | Reescrever policies por campus (via `escopo_campus`) + suíte de não-vazamento no CI. **PORTÃO: Campus 2 não vai a prod antes daqui** | Fase 1 completa |
| **3 · Experiência multi-campus** | Nov → meados Dez | NSM/KPIs por campus + consolidado, mandala com seletor de campus, app/push/comunicados por campus, dashboards comparativos + 2 semanas de estabilização/treino | Fase 2 |

Regra de ouro: **reservar metade do calendário para a Fase 2** (RLS + testes) — é
o gargalo real, não o volume de código.

---

## 9. Riscos e armadilhas

- **Vazamento entre campi (crítico)**: RLS sem campus + boost de área daria acesso
  global à liderança do Campus 2. Nunca liberar antes da Fase 2 testada.
- **Backfill cego**: toda linha sem campus vira "Sede" — correto para histórico,
  **errado** se rodado antes de o Campus 2 ter dados.
- **Nunca mexer em RLS sob pressão de prazo** (por isso o Campus 2 chega no fim do
  ano, com Fase 2 pronta).
- **Drift git↔prod**: as migrations deste projeto precisam ser aplicadas em prod na
  ordem, com o SQL colado na conversa (regra do `CLAUDE.md`).

---

## 10. Questões em aberto (decidir antes/durante a Fase 1)

1. Cada campus terá **horários de culto próprios** ou herda o catálogo
   `vol_service_types` compartilhado?
2. Quando um campus é **inativado**, o que acontece com seus dados (retenção)?
3. **Solicitações/aprovações** (SLA, alçadas) são por campus ou a diretoria
   administrativa é única para a rede?
4. **Cérebro/SharePoint** e **notificações** ganham dimensão de campus ou seguem
   institucionais?
5. Lista definitiva de `escopo_campus` por módulo (a tabela da seção 4.2 é
   proposta — validar com a gestão).

---

## Nota de método

Este documento nasceu de uma deliberação da skill `llm-council` (4 conselheiros:
arquitetura de dados, risco/migração, pragmático/prazo, inventário factual). Os
fatos do estado atual (seção 3) e as armadilhas (seção 5) foram **verificados
contra o repo**, não apenas relatados. Os conselheiros são o mesmo modelo base —
a convergência reduz pontos cegos de enquadramento, não é prova independente;
decisões contábeis/segurança devem ser validadas pela gestão.
