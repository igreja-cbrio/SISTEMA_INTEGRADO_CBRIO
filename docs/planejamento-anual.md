# Módulo Planejamento Anual · contexto e estado (2026-08-13)

Documento de contexto do módulo `planejamento-anual` — o que é, como foi
construído, decisões tomadas e o que falta. Serve pra retomar o trabalho em
qualquer sessão (humana ou do Claude) e pra onboarding da equipe.

## O que é

Ciclo anual de planejamento da CBRio, portado de um protótipo funcional do
Yago (`planejamento-cbrio-v2_5.html` · regras de negócio de referência):

```
ciclo (ano) → propostas (líder de área) → avaliação CEGA por 4 diretorias
(7 critérios 1-5 · quórum = assentos do ciclo) → decisão do Pastor
(aprovar / com ressalvas / reprovar + 1 rodada de retificação de 5 dias)
→ calendário com detecção de conflitos → publicação (5 travas + snapshot
imutável) → orçamento do ciclo (5 linhas × 12 meses · caixa livre derivado)
```

Princípio inegociável do porte: **o módulo se amolda ao sistema** (convenções,
segurança, design) — só as regras de negócio do protótipo são invioláveis.

## Status (2026-08-13)

| Fase | Entrega | Status |
|---|---|---|
| 0-1 · Reconhecimento + de-para | Plano aprovado (conselho deliberativo llm-council · 4 conselheiros + 3 revisores) | ✅ |
| 2 · Schema | Migration `20260812120000_planejamento_anual_modulo.sql` **aplicada em prod** · PR #2433 mergeado | ✅ |
| 3 · Backend | Service puro + rotas + 43 testes vitest · no PR #2434 | ✅ |
| 4 · UI | Hub `/planejamento-anual` completo · no PR #2434 | ✅ |
| 5 · Aceitação | 12 testes do spec ponta a ponta com papéis reais | ⏳ em validação |

**PR #2434** (`feat/planejamento-anual-api`): backend + UI juntos, checks
verdes, preview validado pelo Yago em andamento. Merge pendente da validação.

## Regras de negócio invioláveis (seção 4 do spec)

- **7 critérios** (ordem = hierarquia de desempate): Relevância ·
  Pertencimento · Transformação · Visão CBRio · Impacto · Custo ·
  Sustentabilidade financeira. Escala 1-5, todos obrigatórios, sem "não se
  aplica".
- **Ranking** = soma das 7 médias (máx 35) · desempate critério a critério na
  ordem do formulário · persistindo, alfabético pt-BR. Ordena a leitura, não
  corta.
- **Quórum 4/4 sem dispensa** · notas CEGAS até as 4 diretorias enviarem
  (imposto na API e na RLS, não só na tela).
- **Visibilidades**: exigência/ressalva/apontamentos → SÓ o proponente (e o
  Pastor, autor). Fundamentação dos diretores → diretores e Pastor, NUNCA o
  proponente.
- **Decisão exclusiva do Pastor** (individual ou lote) · aprovada com
  ressalvas só entra no calendário após verificação · reprovada = exigência +
  1 rodada única de retificação de 5 dias (Pastor reavalia sozinho; notas dos
  diretores preservadas; reabrir pros diretores apaga as 4 notas).
- **Conflitos**: agenda só entre naturezas IGUAIS · espaço entre QUAISQUER
  naturezas (mesmo local ≠ 'Fora da igreja' + horário sobreposto) ·
  rotina×rotina por dia da semana + meses sobrepostos · colisão confirmada
  (ambos com dia) bloqueia publicação; concentração (só mês) não · aceite
  do Pastor com justificativa, reversível.
- **5 travas de publicação**: sem quórum · sem decisão · retificação em
  andamento · ressalva não verificada · conflito confirmado não aceito.
- **Custeio derivado** (nunca declarado): sem arrecadação = integral ·
  < custo = parcial · ≥ custo = autossustentado. Líquido = custo − arrecadação.
- **3 [SUPOSIÇÃO]** do protótipo, isoladas no objeto `SUPOSICOES` do service
  (troca = 1 linha): espaço entre naturezas diferentes · ressalva verificada
  antes do calendário · rateio orçamentário uniforme.

## Decisões de arquitetura (conselho · unânimes entre 3 revisores)

1. **`estado` = única coluna gravável** de status em `plan_propostas`
   (`rascunho|enviada|aprovada|aprovada_ressalvas|reprovada|retificada|arquivada`).
   `em_avaliacao`/`ranqueada`/`no_calendario` são **derivados** no service —
   nunca persistidos (anti-drift; o protótipo tinha estado×decisao divergindo).
2. **Decisões do Pastor append-only** (`plan_decisoes` · `UNIQUE(proposta,
   rodada)` parcial + `CHECK rodada IN (1,2)` — "1 rodada" é constraint
   física) · retirar do calendário = `revogada_em` (nada se apaga) · trigger
   de imutabilidade (só verificação de ressalva e revogação mudam).
3. **Publicação transacional**: `fn_plan_publicar_ciclo` (SECURITY DEFINER)
   **re-verifica as 5 travas dentro da transação** (anti-TOCTOU) e grava o
   snapshot tipado `plan_calendario_itens` (18 campos, SEM dados de mérito) ·
   trigger físico bloqueia UPDATE/DELETE (padrão closing mensal) · republicar
   = nova `publicacao_versao`.
4. **Notas cegas em 2 camadas**: RLS deny-by-default (`plan_avaliacoes`
   SELECT = own-rows; decisões/apontamentos/orçamento = super-admin only —
   qualquer autenticado fala PostgREST direto com a anon key, endpoint certo
   não basta) + projeção única por papel no backend (`projetarProposta`).
   Anti-vazamento por agregado: pré-quórum, avaliador vê só a própria nota +
   contagem n/quórum.
5. **Avaliadores = assentos POR CICLO** (`plan_ciclo_avaliadores` · quórum =
   COUNT, nunca literal 4) — não toca `setor_diretor` (semântica de
   Solicitações) nem cria cargos novos. Seed 2027: Ministerial=Arthur Serpa ·
   Criativo=Pedro Menezes · Operações=Eduardo Gnisci · **Financeiro=Pedro
   Junior (acúmulo TEMPORÁRIO da diretoria financeira)**.
6. **Datas reais** (`date` + coluna `precisao 'mes'|'dia'`) em vez dos pares
   mês/dia do protótipo — elimina a classe de bug de virada de ano e registra
   a precisão como o spec exige.
7. **Locais em `plan_locais`** (6 seedados · `gera_conflito=false` só em
   'Fora da igreja') + ponte opcional `pat_localizacao_id` (precedente
   kids_salas) — decidido após evidência de hard-delete/auto-insert em
   `pat_localizacoes`.
8. **Rateio orçamentário em centavos inteiros** com distribuição de resto —
   a soma dos meses bate EXATA com o líquido (float ingênuo vazava centavo).
9. **Nada derivável é persistido**: conflitos, ranking, rateio, custeio,
   caixa livre — tudo recomputado (únicas exceções: snapshot publicado e
   prazos congelados na criação).
10. **v1 NÃO materializa em `events`** (decisão do Yago) — snapshot já
    desenhado pra materialização futura ser job aditivo idempotente
    (`events.proposta_id`/`criacao_origem='ciclo_planejamento'` já existem).

## Papéis e permissões

- **Slug** `planejamento-anual` · matriz copiada de `planejamento` (Gestão
  Anual) + INSERT explícito pro cargo `pastor-presidente` (nível 5 +
  pode_aprovar — a matriz dele foi zerada em 20260603240000, cópia de módulo
  base não o alcança).
- **Papel na UI** (abas): Propostas = todos com módulo ≥1 · Avaliação = quem
  tem assento no ciclo · Orçamento = assento financeiro (+ Pastor lê) ·
  Pastor presidente = cargo `pastor-presidente` **OU super-admin**.
- **Super-admin vê tudo** (decisão do Yago 2026-08-13 · "o módulo não pode
  fugir à regra do sistema") — gate `ehPastorOuSuper` em
  `backend/routes/planejamentoAnual.js` usa `isSuperAdminEmail`
  (`app_super_admins` · cache 5 min).
- Anti-tamper: a diretoria da avaliação vem do ASSENTO do usuário, nunca do
  body · envio de proposta valida a janela NO SERVIDOR.

## Mapa de arquivos

| Camada | Arquivo |
|---|---|
| Migration | `supabase/migrations/20260812120000_planejamento_anual_modulo.sql` (13 tabelas `plan_*` + RPC + RLS + seeds) |
| Regras puras | `backend/services/planejamentoAnualRegras.js` (SEM supabase · `SUPOSICOES` no topo) |
| Rotas | `backend/routes/planejamentoAnual.js` (`/api/planejamento-anual` · ~30 endpoints) + `ROUTE_MODULE_MAP` em `backend/middleware/auth.js` + mount em `backend/server.js` |
| Testes | `src/test/planejamentoAnualRegras.test.ts` (43 testes · 12 de aceitação + regressões dos bugs do protótipo) |
| UI | `src/pages/planejamentoAnual/` (`PlanejamentoAnual.jsx` hub · `PropostasTab` · `AvaliacaoTab` · `OrcamentoTab` · `PastorTab` com 6 sub-abas · `comum.jsx`) |
| API client | namespace `planejamentoAnual` em `src/api.js` |
| Integrações | rota+guard em `src/App.tsx` · menu em `AppShell.jsx` (grupo Planejamento) · `command-search.tsx` · `NotificacaoRegras.jsx` · linha em `e2e/tests/smoke-all-modules.spec.ts` |

## Estado de validação (temporário · LIMPAR depois)

- **Ciclo 2028 = TESTE** (quórum 1 · Yago único avaliador) — arquivar/apagar
  após a Fase 5.
- **Yago em `app_super_admins` = TEMPORÁRIO** (notes marca "remover após
  Fase 5") — reverter com
  `UPDATE app_super_admins SET ativo = false WHERE email = 'yago.torres@cbrio.org';`
- Ciclo 2027 = real (assentos oficiais · janelas fechadas · sem propostas).

## Pendências e follow-ups

1. **Fase 5 · aceitação**: rodar os 12 testes do spec ponta a ponta no
   preview com papéis reais (cegueira com 3/4 via chamada crua · devolutivas ·
   travas isoladas · publicação/divergência) + merge do #2434.
2. **Limpezas pós-validação** (acima).
3. **Confirmar as 3 [SUPOSIÇÃO]** com o Pastor/Marcos — troca barata em
   `SUPOSICOES`.
4. **Confirmar o de-para de assentos com o Marcos** (Operações=Eduardo ·
   Financeiro=Pedro Junior temporário).
5. **Materialização em `events`** na publicação — decisão adiada (ganchos
   prontos no banco).
6. **Notificação periódica** em `notificacaoGenerator.js` (prazo de
   retificação vencendo · ressalvas com prazo) — imediatas já existem.
7. Cron/lembrete: `planejamento_ciclos` (dormente da PR-A antiga) marcada
   como superseded — drop futuro exige aprovação explícita.
8. Pós-merge em prod: bust de cache de permissões + relogin dos afetados.

## Lições aprendidas neste porte

- A trava de CI da main ("Qualidade · tipos e testes" · `tsc -b` + vitest)
  entrou durante o desenvolvimento — **sempre rodar `npm run typecheck` +
  `npm test` antes de push** (o build do Vite NÃO checa tipos).
- Branch longa envelhece: mergear a main na branch periodicamente.
- Arquivo compartilhado de UI com JSX precisa extensão `.jsx` (build quebra
  em `.js`).
- URL do GitHub com body gigante (quick_pull) congela o renderer — usar
  `?expand=1` e deixar a descrição vir do commit.

## Processo (como este módulo é tocado)

Fluxo por fases com aprovação do Yago em cada gate. Migrations: SQL colado no
chat → Yago aplica no SQL Editor → confirma → PR → preview Vercel → merge.
Decisões de arquitetura/schema passam pelo conselho deliberativo
(`llm-council`). Preview por PR é o ambiente de validação (sem dev local).
