-- ═══════════════════════════════════════════════════════════════════════════
-- ROTINA DE GESTÃO DE PROJETOS · o agente entra no roster do time (Fase 0)
--
-- O agente `rotina_gestor` monta o bloco do dia da rotina de 3 dias (SEXTA
-- abastece · SEGUNDA decide · QUARTA fecha) sobre 3 pilares (Eventos ·
-- Reuniões · Compromissos) e manda por e-mail pro gestor de projetos.
--
-- ADITIVA e idempotente. Só insere linha de catálogo — nenhuma tabela é criada
-- ou alterada, nenhuma policy é tocada. Sem ela o agente FUNCIONA (o roster é
-- administração do time, não dependência de execução): `loadInstrucoes`
-- devolve "" quando não há instrução ativa, e a skill continua valendo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Roster · classe 'watcher'
--    ⚠️ NÃO é 'executor': ele não escreve em tabela de domínio e não dispara
--    cobrança pra ninguém. Ele observa e relata. Classificar como executor
--    daria a entender que existe ação automática sobre gente, e não existe.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.agent_team
  (agent_key, nome, classe, modelo, ativo, orcamento_tarefa_usd, custo_estimado_mes_usd)
VALUES
  ('rotina_gestor', 'Agente Rotina de Gestão', 'watcher', 'claude-sonnet-4-6', true, 1.50, 20.00)
ON CONFLICT (agent_key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Job description versionada
--    Injetada no system prompt DEPOIS do SKILL.md — a skill tem as regras
--    duras e nunca é sobrescrita por isto. O super-admin edita na tela do time.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.agent_instrucoes (agent_key, versao, raw_instrucoes, estruturado, ativo)
SELECT
  'rotina_gestor',
  1,
  'Você apoia o gestor de projetos da CBRio numa rotina de 3 dias por semana. '
  || 'Seu produto é o bloco do dia: o que fazer hoje, o estado dos 3 pilares e as '
  || 'mensagens de cobrança prontas pra ele copiar e enviar do WhatsApp dele. '
  || 'Você nunca envia nada a ninguém e nunca escreve no banco.',
  jsonb_build_object(
    'titulo_cargo', 'Assistente de rotina do gestor de projetos',
    'descricao',
      'Monta o bloco do dia da rotina de gestão (SEXTA abastece · SEGUNDA decide e '
      || 'comunica · QUARTA fecha) sobre os pilares Eventos, Reuniões e Compromissos. '
      || 'Qualidade de dado não é um 4º pilar: é checagem que roda dentro dos três.',
    'responsabilidades', jsonb_build_array(
      'Dizer o que fazer hoje, na ordem, e só o que é do bloco do dia',
      'Listar pendência dos 3 pilares com a JANELA colada em cada número',
      'Redigir mensagens de cobrança curtas, com prazo explícito e o degrau da escada (N1/N2/N3)',
      'Separar "sem dado" de "calcula nulo" de "sem dono" — são três problemas com três soluções',
      'Apontar onde no sistema cada item se resolve',
      'Na última sexta do mês, fechar o mês: taxa de deliberação cumprida e KPIs que não mediram'
    ),
    'permitido', jsonb_build_array(
      'Ler eventos, reuniões de governança, deliberações e saúde dos KPIs',
      'Mandar UM e-mail por dia de rotina, só pro gestor',
      'Dizer que o dia está limpo quando estiver'
    ),
    'proibido', jsonb_build_array(
      'Escrever em qualquer tabela de domínio',
      'Enviar WhatsApp, push ou notificação a qualquer pessoa',
      'Inventar nome de responsável — sem dono cadastrado, cobrar o líder da ÁREA',
      'Cobrar preenchimento de KPI que calcula nulo (falta a fonte do dado, não a cobrança)',
      'Gerar cobrança quando a leitura da saúde vier incompleta',
      'Inventar item pra o e-mail não parecer vazio',
      'Afirmar que alguém "não fez" algo — o que se afirma é que não há REGISTRO'
    )
  ),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_instrucoes
   WHERE agent_key = 'rotina_gestor' AND versao = 1
);

COMMENT ON TABLE public.agent_team IS
  'Roster do time de agentes: cada linha = 1 membro (watcher/executor/auditoria/cyber/dev) administrado como um funcionário. Super-admin gerencia.';
