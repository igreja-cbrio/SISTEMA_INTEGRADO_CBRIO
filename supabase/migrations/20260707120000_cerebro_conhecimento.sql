-- Assistente do sistema (Jarvis) · FASE 1 · Base de conhecimento (2026-07-07)
-- ADITIVA e SEGURA. Cria a base de conhecimento buscável por full-text que
-- alimenta o assistente (agente `supervisor`) nas perguntas de CONHECIMENTO
-- ("como faço X", "o que significa esse KPI", "o que cada módulo faz").
--
-- Diferente do Cérebro (vault do SharePoint / entidades do ERP), esta tabela
-- guarda CONTEÚDO CURADO, NÃO-PII, de ajuda/glossário do próprio sistema.
-- Por não ter PII, NÃO entra na whitelist de soft-delete; usa `ativo` boolean.
--
-- route_key: NULL = conteúdo geral (qualquer autenticado lê). Preenchido =
-- conteúdo específico de módulo; a leitura fina é feita no backend
-- (service_role + filtro por permissão em JS, igual ao cerebroSearch), e a RLS
-- abaixo é a rede de segurança (client direto só vê o geral).

CREATE TABLE IF NOT EXISTS public.cerebro_conhecimento (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte      text NOT NULL DEFAULT 'sistema',   -- sistema | glossario | faq | modulo
  titulo     text NOT NULL,
  secao      text,
  conteudo   text NOT NULL,
  route_key  text,                              -- NULL = geral; senão exige permissão no módulo
  tags       text[] NOT NULL DEFAULT '{}',
  ativo      boolean NOT NULL DEFAULT true,
  -- vetor de busca em português (título tem peso maior que o corpo)
  tsv        tsvector GENERATED ALWAYS AS (
               setweight(to_tsvector('portuguese', coalesce(titulo, '')), 'A') ||
               setweight(to_tsvector('portuguese', coalesce(secao,  '')), 'B') ||
               setweight(to_tsvector('portuguese', coalesce(conteudo, '')), 'C')
             ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cerebro_conhecimento_tsv
  ON public.cerebro_conhecimento USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_cerebro_conhecimento_ativo
  ON public.cerebro_conhecimento (ativo) WHERE ativo;

-- ── RLS (catálogo de ajuda · não-PII) ──────────────────────────────────
-- SELECT: autenticado lê o conteúdo GERAL (route_key IS NULL). Conteúdo de
-- módulo (route_key preenchido) só via backend (service_role) ou super-admin —
-- o filtro por permissão de módulo é feito no serviço conhecimentoBase.js.
ALTER TABLE public.cerebro_conhecimento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cerebro_conhecimento_select ON public.cerebro_conhecimento;
CREATE POLICY cerebro_conhecimento_select ON public.cerebro_conhecimento
  FOR SELECT TO authenticated
  USING (route_key IS NULL OR public.is_super_admin());

DROP POLICY IF EXISTS cerebro_conhecimento_write ON public.cerebro_conhecimento;
CREATE POLICY cerebro_conhecimento_write ON public.cerebro_conhecimento
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS cerebro_conhecimento_service ON public.cerebro_conhecimento;
CREATE POLICY cerebro_conhecimento_service ON public.cerebro_conhecimento
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.cerebro_conhecimento IS
  'Base de conhecimento curada (não-PII) do assistente do sistema · Fase 1. Buscada por full-text (tsv). route_key NULL = geral.';

-- ── Seed · conteúdo curado, seguro e user-facing (idempotente) ──────────
-- Reexecutar não duplica: apaga o seed anterior desta leva antes de inserir.
DELETE FROM public.cerebro_conhecimento WHERE fonte IN ('sistema', 'glossario', 'faq');

INSERT INTO public.cerebro_conhecimento (fonte, titulo, secao, conteudo, route_key, tags) VALUES

-- ═══ MAPA DO SISTEMA (o que cada módulo faz · geral, não-sensível) ═══
('sistema', 'O que é o sistema CBRio', 'Visão geral',
 'O sistema é o ERP interno da CBRio (igreja). Ele integra a operação dos ministérios com a estratégia: a tese central é que usar os módulos do dia a dia alimenta automaticamente a métrica-norte (NSM) e a matriz de ~150 KPIs (6 áreas x 5 valores). Ou seja, usar o módulo É medir. O destino final de todos os dados é o Painel (/painel).',
 NULL, ARRAY['sistema','visao-geral','erp']),

('sistema', 'Painel estratégico', 'Módulo /painel',
 'O Painel (/painel) mostra a NSM (métrica-norte), as mandalas por valor, a matriz de 6 áreas x 5 valores e os alertas críticos. É leitura para qualquer pessoa autenticada. É onde a diretoria acompanha a saúde do sistema inteiro.',
 NULL, ARRAY['painel','nsm','kpi','estrategia']),

('sistema', 'Minha Área', 'Módulo /minha-area',
 'A tela Minha Área (/minha-area) mostra os KPIs da sua própria área, agrupados por valor. É usada pelos líderes de cada área para acompanhar os indicadores pelos quais são responsáveis.',
 NULL, ARRAY['minha-area','kpi','lider']),

('sistema', 'Integração', 'Módulo /integracao',
 'A Integração registra os cultos, a frequência (presencial, kids e online) e as decisões de fé (pessoas nominais). É a equipe de Integração que lança esses números. Isso gera o denominador da NSM (as decisões), alimenta os KPIs de Seguir de todas as áreas e dispara a trilha do novo convertido.',
 NULL, ARRAY['integracao','cultos','decisoes','frequencia','batismo']),

('sistema', 'Cuidados', 'Módulo /ministerial/cuidados',
 'Cuidados cuida do encontro pastoral e da jornada de 90 dias do novo convertido (contato em ate 3 dias, batismo em ate 90 dias, Next em ate 90 dias) e do desfecho com encaminhamentos para os próximos valores (grupos, voluntariado, jornada 180). Quando a devolutiva de um encaminhamento é "engajou", o vínculo real é materializado — isso é o numerador da NSM.',
 NULL, ARRAY['cuidados','jornada','convertidos','encaminhamentos']),

('sistema', 'Grupos de conexão', 'Módulo /grupos',
 'Grupos gerencia os grupos de conexão: caixa de entrada (pedidos das próprias pessoas + encaminhados do cuidado pastoral), visitas de supervisão, pessoas e papéis. Alimenta o valor Conectar e os KPIs dos líderes.',
 NULL, ARRAY['grupos','conexao','supervisao','visitas']),

('sistema', 'Voluntariado', 'Módulo /voluntariado',
 'Voluntariado cuida dos perfis de voluntário, inscrições, escalas e do totem de check-in. Alimenta o valor Servir. O voluntário responde as próprias escalas pelo app; o cadastro nominal e a triagem são feitos pela coordenação.',
 NULL, ARRAY['voluntariado','escalas','servir','checkin']),

('sistema', 'Solicitações', 'Módulo /solicitacoes',
 'Solicitações é o backbone único entre a administração e os ministérios (TI, compras, reembolso, pagamento, reserva, manutenção, marketing, RH), com dois portões de aprovação: primeiro o diretor do setor de quem pede, depois a aprovação financeira quando envolve dinheiro. É a fonte única dos KPIs administrativos (SLA e NPS) — interação fora daqui não é medida.',
 NULL, ARRAY['solicitacoes','aprovacao','sla','compras','reembolso']),

('sistema', 'Membresia', 'Módulo /ministerial/membresia',
 'Membresia é o cadastro de membros, com detecção de duplicados e merge, faixa etária e trilha. É a base de pessoas que todos os valores cruzam.',
 NULL, ARRAY['membresia','membros','cadastro','duplicados']),

('sistema', 'Financeiro, RH, Logística e Patrimônio', 'Módulos operacionais',
 'Financeiro cuida do fluxo de caixa, DRE, contas a pagar e arrecadação. RH cuida de funcionários, documentos, férias e avaliações. Logística cuida de fornecedores, compras, notas fiscais e estoque. Patrimônio cuida dos bens da igreja. O acesso a esses módulos é restrito por permissão.',
 NULL, ARRAY['financeiro','rh','logistica','patrimonio','operacional']),

-- ═══ GLOSSÁRIO (conceitos que aparecem no sistema) ═══
('glossario', 'O que é a NSM', 'Métrica-norte',
 'NSM é a métrica-norte do sistema. Ela mede os novos convertidos que engajaram de verdade em pelo menos um dos 5 valores em ate 60 dias da decisão. O denominador é o total de decisões registradas nos cultos (janela móvel de 90 dias); o numerador é quem teve sinal real de engajamento em algum valor. A meta é 50%. O denominador NÃO é meta — é o total de decisões do período.',
 NULL, ARRAY['nsm','metrica','conversao','engajamento']),

('glossario', 'Os 5 valores da jornada', 'Valores',
 'Os 5 valores da jornada do membro são: Seguir Jesus (conversão, primeiro contato, batismo), Conectar (entrar em grupo de conexão), Investir (devocional, jornada 180), Servir (voluntariado) e Generosidade (dízimos e ofertas). A NSM e a matriz de KPIs se organizam por esses valores.',
 NULL, ARRAY['valores','jornada','seguir','conectar','investir','servir','generosidade']),

('glossario', 'O que é um KPI e a matriz de KPIs', 'KPI/OKR',
 'KPI é um indicador tático. A matriz cruza 6 áreas (Kids, Bridge, AMI, Sede, Online, CBA) com os 5 valores, resultando em cerca de 150 KPIs. Muitos são preenchidos automaticamente pela operação dos módulos; outros o líder lança o número absoluto em Dados Brutos e o sistema calcula o KPI. Cada KPI tem um status de semáforo: no alvo, atrasado ou crítico.',
 NULL, ARRAY['kpi','okr','matriz','indicador','semaforo']),

('glossario', 'O que é OKR e KR', 'KPI/OKR',
 'OKR é objetivo e resultados-chave. No sistema, cada KR (resultado-chave) é respondido pelo KPI central do indicador, sem entrada manual: o realizado vem do próprio KPI. Configurar OKRs, metas e saúde do sistema é feito em Gestão (/gestao).',
 NULL, ARRAY['okr','kr','gestao','meta']),

('glossario', 'Meta absoluta e periodicidade do KPI', 'KPI/OKR',
 'A meta institucional é sempre calculada em escala anual. Quando o KPI é semanal ou mensal, o sistema normaliza automaticamente a meta pela periodicidade (dividindo por 52 semanas, 12 meses, 4 trimestres, etc.) para não comparar o valor de uma semana com a meta do ano inteiro. Por isso um KPI semanal não fica vermelho falsamente.',
 NULL, ARRAY['meta','periodicidade','kpi','semanal','mensal']),

('glossario', 'Regra contábil dos empréstimos', 'Financeiro',
 'Empréstimo NÃO conta como receita ordinária em nenhum cálculo, KPI ou visualização de receita. Empréstimo é entrada de caixa (financiamento), não receita. Receita ordinária são dízimos, ofertas, contribuições, eventos pagos, campanhas e vendas.',
 NULL, ARRAY['financeiro','emprestimo','receita','contabil']),

-- ═══ NÍVEIS DE PERMISSÃO ═══
('glossario', 'Os níveis de permissão (0 a 5)', 'Permissões',
 'Cada pessoa tem um nível de 0 a 5 em cada módulo. 0 = sem acesso (o módulo nem aparece). 1 = ver (só leitura). 2 = ver e preencher dado bruto. 3 = ver e editar (CRUD). 4 = ver, editar e deletar. 5 = admin do módulo (configura regras, metas, deleta tudo). Além do nível, há modificadores: pode exportar (dados sensíveis/LGPD), pode aprovar (workflows) e escopo próprio (só a própria área).',
 NULL, ARRAY['permissao','nivel','acesso','cargo']),

('faq', 'Por que não vejo um módulo no menu', 'Permissões',
 'Se um módulo não aparece no seu menu, é porque o seu cargo tem nível 0 nele. O acesso vem da matriz de cargo x módulo, mais o boost por área (a sua área escala o módulo correspondente) e overrides individuais. Para mudar, um administrador ajusta a matriz em /admin/permissoes; depois você precisa sair e entrar de novo para o acesso renovar.',
 NULL, ARRAY['permissao','menu','acesso','faq']),

-- ═══ FAQ operacional (perguntas comuns · geral) ═══
('faq', 'Como lançar um culto e as decisões', 'Integração',
 'Para lançar um culto, vá em Integração (/integracao), aba Cultos, e preencha a frequência (presencial, kids e online). As decisões de fé são registradas na aba Decisões, com toggle entre "Por culto" (só os números) e "Pessoas" (o cadastro nominal de quem decidiu, com nome e telefone obrigatórios). O líder também pode reportar os números do culto pelo bot de WhatsApp, que cai numa fila de revisão.',
 NULL, ARRAY['integracao','culto','decisao','como-faco','whatsapp']),

('faq', 'Como abrir uma solicitação (compra, reembolso, TI)', 'Solicitações',
 'Abra em /solicitacoes escolhendo a categoria (TI, Compras, Reembolso, Reserva de Espaço, Serviços, Pagamento, Marketing, Férias). A sua solicitação primeiro vai para o diretor do seu setor aprovar; se envolver dinheiro (compra, reembolso, pagamento), passa também pela aprovação financeira. Você acompanha o andamento pelo quadro (kanban) e pela lista, e ao final avalia com uma nota (NPS).',
 NULL, ARRAY['solicitacoes','compra','reembolso','como-faco','aprovacao']),

('faq', 'Como um novo convertido entra na jornada', 'Cuidados',
 'Quando alguém toma uma decisão registrada na Integração, vira um convertido em Cuidados, com a responsabilidade seguindo a área do culto. A jornada tem três marcos: contato pastoral em ate 3 dias, batismo em ate 90 dias e Next em ate 90 dias. Na aba Convertidos/Primeiros passos o líder agenda o encontro pastoral e, no desfecho, encaminha a pessoa para grupos, voluntariado ou jornada 180. Cada área recebe o encaminhamento numa caixa de entrada e registra a devolutiva.',
 NULL, ARRAY['cuidados','convertido','jornada','encaminhamento','como-faco']),

('faq', 'Como funciona o assistente do sistema', 'Assistente',
 'O assistente responde perguntas sobre como o sistema funciona, o que cada módulo faz e o significado dos indicadores, usando esta base de conhecimento e os dados que você tem permissão de ver. Ele respeita as suas permissões: nunca mostra dado de um módulo ao qual você não tem acesso. Se ele não tiver a informação, ele diz que não encontrou em vez de inventar.',
 NULL, ARRAY['assistente','ia','ajuda','como-faco']);

-- Fim do seed.
