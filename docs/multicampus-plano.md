# Multi-campus · documento de design (ADR)

> Status: **implementação em andamento · PR aberta** · Revisão: 2026-09-26
> Origem: gestão + Claude Code (2026-07-01). Alvo atualizado:
> **possível segundo campus físico em março de 2027**.

Referência viva do projeto que torna o ERP da CBRio **multi-campus** (multi-sede
física), preservando o campus atual (Sede) sem regressão. Escrito antes da
primeira migration — a Fase 0 concreta sai deste doc.

---

## Continuidade da implementação (2026-09-26)

Pedido atual: implementar o suporte multicampus e manter a PR aberta para
continuação por Codex ou Claude. A autorização é de implementação; não ativar
Campus 2, aplicar migrations em produção ou mergear esta PR durante o trabalho.

- Branch remota: `codex/multicampus-implementacao`.
- Worktree inicial: `/Users/MatheusToscano/Documents/wt-multicampus-implementacao`.
- Base inicial: `d081d6116` (main). Não trabalhar na checkout antiga do diretório
  principal: ela pertence a outra tarefa e contém alterações preservadas.
- Documento canônico de escopo: este arquivo, seção 0. Demais seções antigas são
  históricas quando conflitarem com a auditoria de setembro.
- Não incluir a avaliação 360 (#2959): é outra entrega, aguardando aprovação.
- Fazer commits e pushes a cada bloco validado; atualizar este checkpoint e a
  descrição da PR com evidência e pendências, sem declarar multicampus concluído
  enquanto houver módulos, canais ou migrações não cobertos.

### Estado recuperável · checkpoint de implementação

- PR aberta: https://github.com/igreja-cbrio/SISTEMA_INTEGRADO_CBRIO/pull/3067.
- [x] Branch isolada e inventário executável: `node backend/scripts/multicampus-inventario.cjs`.
  `--check` deve falhar enquanto houver lacunas; isso não é um teste unitário quebrado.
  Snapshot de metadados sem PII em `backend/scripts/multicampus/catalogo-20260926.json`:
  546 tabelas e 1.362 policies consultadas em produção. Código tem referências extras,
  chamadas dinâmicas e fontes históricas; os números dos dois inventários diferem.
- [x] Contexto de campus por request, separado do objeto de autenticação cacheado.
  Bootstrap `/api/campus/contexto`, vínculo explícito, negação sem acesso, nenhum
  `role=admin/diretor` genérico concede todos os campi.
- [x] Contexto frontend, seletor, nova QueryClient/árvore por usuário+campus,
  cancelamento de requests e streams, descarte de respostas antigas. Públicos
  `/public/*` não herdam o campus selecionado na área privada.
- [x] Administração `/admin/campi`: busca de usuários e vínculos; gravação atômica
  com auditoria. Sem botão para ativar isolamento nem criação de unidade.
- [x] Estado persistido de implantação e bloqueio de regressão ao modo legado.
  **Ensaio e ativo exigem evidência de TODAS as frentes**. Não usar ensaio em
  produção como atalho para testar dados reais com RLS/RPCs ainda incompletas.
- [x] Piloto Cultos: chave por campus, agenda local, herança de campus nas decisões,
  matcher global preservado, fan-out para Cuidados/NSM carimbado, view invoker,
  capacidade configurável e exclusão lógica atômica. Rotas certificadas no server:
  GET/POST `/api/kpis/cultos`, PUT/DELETE `/api/kpis/cultos/:id`, GET/POST
  `/api/kpis/cultos/:id/decisoes-pessoas`. Parâmetro `:id` só aceita UUID.
- [x] Primeiros destinos: RLS nominal em membros, convertidos, eventos NSM e trilha;
  leitura própria preservada, campus dos atos independente do campus-base.
- [x] Cron de agenda paginado por campus, contagem agregada sem truncamento,
  falhas parciais explícitas e repetição idempotente.
- [x] Agenda e banner do culto atual no app usam consultas por campus e projeção
  pública; resolução de membro confirmada sem fallback por contato.
- [x] Filhos nominais de Cuidados e contatos protegidos por RLS do pai; oito
  leituras de Cuidados revisadas. Escritas e painéis ainda não certificados.
- [x] Next: quatro leituras e 17 escritas com campus; criação/presença/exclusão
  atômicas, transferência preserva histórico e cron exige unidade explícita.
  Painéis, direcionamentos e outros endpoints continuam pendentes.
- [x] Grupos: dimensão/RLS e funções de relatório por campus preparadas e testadas;
  integração das rotas ainda em andamento. NPS sem origem não vira dado local.
- [x] Notificações aceitam contexto explícito e intersectam destinos; dados
  sensíveis não vão para destinatário de outro campus. Migração dos demais
  produtores e armazenamento de notificações ainda pendente.
- [ ] Demais destinos (`cui_*`, `nsm_*`, membros), views/RPCs e acessos
  diretos precisam do isolamento completo. Piloto NÃO significa Cultos aprovado
  para dados reais do Campus 2 enquanto estes consumidores não estiverem seguros.
- [ ] Restante de Integração, Grupos, Next, Voluntariado, Kids, Batismo e portas
  públicas; apps Membros/Staff; armazenamentos, jobs, notificações e exports.
- [ ] Agregados/KPIs/NSM/consolidados e operação administrativa central.
- [ ] Testes de integração completos, reconciliação histórica e ensaio de ativação.

### Checkpoint adicional · Next e Batismo (27/09/2026)

- Next agora tem 11 leituras e 21 escritas certificadas no catálogo do servidor.
  Conclusão pessoal pode ser global, mas a RPC só recebe IDs de atos locais e
  devolve booleanos; observações de aulas manuais permanecem por campus.
  Migration `20260927080000_multicampus_next_sinais.sql` exige tabela manual vazia
  (confirmada por consulta somente de leitura). Se houver novo histórico, aborta
  exigindo mapa explícito; não executar ignorando essa pré-condição.
- Batismo: catálogo/ocupação paginados por campus e reserva transacional
  `fn_campus_batismo_reservar`; erro de página não vira vaga disponível.
  Admin: listagem, horários (listar/criar/editar), listagem do check-in diário,
  criação e edição de inscrições já usam contexto e consultas locais.
  Inscrição sem evento/horário permanece sem reserva; atribuição posterior usa
  a RPC atômica. Identidade passa pelo matcher global, sem falha silenciosa.
- SQL Batismo: `20260927050000_multicampus_batismo.sql` aditiva e
  `20260927070000_multicampus_batismo_reserva.sql` service-only. A assinatura
  da reserva inclui `p_inscrito_por` opcional, preenchido pelo servidor no admin.
  `backend/scripts/multicampus/cutover-batismo.sql` fica FORA da sequência de
  migrations: trocar PK antiga por data só após todos os consumidores adaptados.
- Integração SQL: fixture derivada de 60 tabelas do schema vivo executa 11
  migrations em sequência; 8 cenários passaram. Teste real PostgreSQL 17 com
  duas conexões confirmou a disputa pela última vaga. Limitações do ensaio
  estão nos testes (biometria/storage, triggers laterais e agregados não cobertos).
- Ainda pendentes no Batismo: cobertura de convertidos, config por campus,
  armazenamento/fotos e cutover. Status em massa e exclusão de horários agora
  usam RPCs atômicas (`20260927110000_multicampus_batismo_admin.sql`);
  check-in valida identidade do ato local e detecta edição concorrente. Não liberar a frente toda por essas rotas.
- Kids está em implementação nos mesmos arquivos/branch. Não considerar
  arquivos não commitados como certificados até a validação e checkpoint.

Kids — checkpoint SQL de 27/09/2026:
- `20260927090000_multicampus_kids.sql` preserva uma criança global, adiciona
  `kids_crianca_campi` (vínculo explícito, desativação por `ativo`) e dimensão nos
  atos/estações/filas. Backfill de vínculo usa presença/atendimento, nunca o campus
  do responsável. Primeiro ato válido em preparação cria o vínculo atomicamente;
  depois do ensaio exige vínculo anterior. Crianças sem atos precisam reconciliação.
- `20260927100000_multicampus_kids_operacoes.sql` instala check-in atômico com
  responsável canônico autorizado, pais do mesmo campus, capacidade, extras e
  consumo de código reservado. Código continua globalmente único. Consolidação
  e decisões respeitam o campus do culto; RPCs globais ambíguas ficam restritas à
  preparação. Checkout está na `20260927130000_multicampus_kids_checkout.sql`.
- `campusKidsSql.test.ts` executa schema, índices e triggers reais, junto às
  migrations anteriores. Cobertura inclui responsável global, duas unidades,
  RLS, rollback dos extras, código, capacidade e checkout com chamadas/pager.
  Concorrência real de Kids ainda requer validação fora do PGlite.
- Integração descobriu outro índice global vivo em Cultos:
  `cultos_service_type_data_hora_uniq`. A migration 210000 também o converte para
  campus; regressão comprova mesmo dia/horário em duas unidades, inclusive culto
  sem tipo. Não corrigir o teste artificialmente variando horário por unidade.
- Pendências explícitas Kids: vínculo infantil canônico com `mem_membros` (não
  existe no schema vivo; não inventar match fraco); reconciliação de crianças sem
  atos; PIN/configuração/etiqueta por campus; reserva offline, lotes familiares,
  override/manual, token de estação/display, app público, sincronização PCO,
  storage/fotos e agregados. Nomes de salas/estações mantêm unicidade global até
  revisar consumidores legados. Configurações singleton deixam de ser legíveis
  diretamente por autenticados fora da preparação. Nenhuma cobertura completa
  ou ativação decorre destes testes.

Migrations preparadas, **não aplicadas**:
1. `20260926200000_multicampus_contexto_e_ativacao.sql`: configuração, gate de
   ativação, helper e administração de vínculos. Deve preceder qualquer deploy
   deste backend/frontend; configuração ausente falha fechada com 503.
2. `20260926210000_multicampus_cultos_agenda.sql`: piloto Cultos. Replacements de
   triggers partem das definições vivas capturadas em 26/09; não substituir por
   versões antigas das migrations. Backfill recusa uma segunda sede ativa.

3. `20260926220000_multicampus_destinos_decisao.sql`: isolamento nominal dos
   quatro destinos iniciais e campus de origem nos marcos da trilha.

4. `20260926230000_multicampus_cuidados_filhos.sql`: filhos nominais, J180,
   comentários e contatos; não certifica agregados/RPCs.

5. `20260927000000_multicampus_next.sql`: dimensão e integridade Next.
6. `20260927010000_multicampus_grupos.sql`: dimensão/RLS Grupos e matcher SQL
   com campus explícito; assinatura legada preservada somente em preparação.
7. `20260927020000_multicampus_next_operacoes.sql`: operações Next atômicas.
8. `20260927030000_multicampus_cuidados_operacoes.sql`: exclusão lógica com
   campus e ampliação aditiva da whitelist instalada.
9. `20260927040000_multicampus_grupos_relatorios.sql`: RPCs Grupos por campus,
   views invoker, dimensão nos consolidados e origem dos dados brutos de NPS.


10. `20260927050000_multicampus_batismo.sql`: preparação aditiva do batismo.
    UUID canônico de evento, campus, vínculos de inscrição por evento/horário,
    RPCs locais e RLS restritiva. **Preserva PK(data) e índice global de horário.**
11. `20260927070000_multicampus_batismo_reserva.sql`: reserva tipada atômica,
    idempotência por UUID, edição sem contar a própria vaga e bloqueio por
    evento/horário. Matcher canônico e autorização da porta continuam no backend.

Batismo — decisão de transição (27/09/2026): inspeção somente leitura do banco
confirmou PK `data`, nenhuma FK externa/view dependente, RPC de datas global e
índice de horário global. Histórico tinha zero inscrições fora da Sede, zero
datas sem evento e zero horários sem catálogo. A fase aditiva não permite ainda
mesma data em dois campi. `backend/scripts/multicampus/cutover-batismo.sql` fica
FORA das migrations automáticas: exige preparação, cobertura completa e marcador
`batismo-cutover-revisado`. Só promover após adaptar consumidores, rever FKs e
obter aprovação para trocar a PK. IDs são canônicos; campos legados permanecem
sincronizados e nenhum cadastro de pessoa é duplicado por campus.

Validação do batismo: 10 testes PostgreSQL/PGlite passaram (incluem o cutover
isolado), e teste local PostgreSQL 17 com duas conexões reais confirmou a última
vaga serializada: primeira reserva confirma, segunda aguarda e falha por falta
de vaga. Nenhuma migration foi aplicada em produção. RPC de edição recebe o
registro completo validado, não um patch parcial: backend deve compor valores
atuais antes da chamada para não limpar campos opcionais. Consentimento,
check-in e auditoria não são editáveis pelo payload da reserva.

Portas de batismo (checkpoint 27/09): público oferece catálogo de sedes ativas
em `/public/batismo/campi`; campus explícito por slug/UUID em horários e envio,
com ausência permitida só na preparação. Catálogo entrega IDs de evento/horário;
handler compartilhado usa reserva transacional e matcher global no público.
App usa somente `/app/campus/batismo/horarios` e
`/app/campus/batismo/inscricoes`, com vínculo confirmado `profiles.membro_id`,
sem resolver por e-mail, metadados ou ID enviado pelo cliente. Consentimento
canônico obrigatório; sem fallback da data calculada e sem grupo WhatsApp global
fora de preparação. Não certificar `/app/inscricoes` inteiro nem os endpoints de
fotos/acesso públicos, que permanecem pendentes. Validação: 70 testes de serviço,
handler, UI e regressão passaram, além dos testes SQL. Nenhum efeito em produção.

App: PR rascunho https://github.com/igreja-cbrio/Aplicativo-CBRio/pull/178,
branch `codex/multicampus-app`, worktree `../wt-app-multicampus`. Depende deste
backend; não publicar OTA antes das migrations e endpoints correspondentes.
Staff: PR https://github.com/igreja-cbrio/CBRio-Staff/pull/24, worktree
`../wt-staff-multicampus`, branch `codex/multicampus-staff`. Transporte/contexto
e caches implementados (commit `5f2133f`), sem OTA: TypeScript, 97 testes e
export Android/iOS passaram. Falta validação visual com backend de ensaio.
Endpoints próprios de RH permanecem centrais.

Validação do terceiro checkpoint em preparação: 278 testes multicampus em
27 arquivos passaram; Next chegou a 136 testes específicos e de regressão
aprovados depois da transferência segura. App #178: 450 testes, TypeScript,
i18n, 110/110 mutantes e export Android/iOS passaram. CI/preview do ERP inicial
verdes. Suíte completa do estado ampliado em execução; registrar o resultado
antes de fechar o próximo checkpoint. Nenhuma validação libera produção.

Próxima ação ao retomar: conferir diff/CI desta branch e começar pelos destinos
RLS/RPC do piloto; o guard global bloqueia superfícies ainda não certificadas em
ensaio/ativo. **Não ampliar allowlist para fazer uma tela funcionar sem filtrar
suas consultas, filhos, arquivos e produtores.** Preservar a PR aberta.

---

## 0. Retomada e plano de entrega (2026-09-26)

**Objetivo atualizado:** preparar o sistema para um possível segundo campus
físico em março de 2027. O diagnóstico abaixo foi preparado antes da implementação. A execução atual
está registrada no checkpoint acima; nenhuma migration foi aplicada em produção.

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
