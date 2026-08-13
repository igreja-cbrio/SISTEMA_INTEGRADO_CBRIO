-- ════════════════════════════════════════════════════════════════════════════
--  NOTIFICAÇÃO DE GRUPO VAI PRO DONO DO GRUPO — e robô nunca é avisado
--
--  Pedido do Matheus (10/08/2026): "as notificações de grupos devem chegar
--  apenas para os seus respectivos responsáveis... preciso que isso seja para
--  todos".
--
--  A causa era o FALLBACK de `resolverDestinatarios()`: sem lista nomeada em
--  `notificacao_regras`, o envio ia para TODOS os profiles admin/diretor.
--  Treze módulos têm lista; `grupos` nunca teve.
--
--  Medido em 21 dias, antes: 10.914 notificações de `grupos` para 18 pessoas,
--  **9.637 não lidas (88%)** e **4.762 escritas para contas-robô**.
--
--  Esta migration faz as duas coisas que são DADO (o resto é código):
--   1. marca as contas de serviço, para o fallback deixar de avisar robô;
--   2. cadastra a coordenação de grupos, para o fallback deixar de ser "todo
--      mundo com cargo alto".
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Contas de serviço ──────────────────────────────────────────────────
-- ⚠️ COLUNA, não padrão de e-mail. As contas de agente têm role `diretor`
-- porque precisam do bypass de autorização para trabalhar — não há como
-- distinguí-las por papel. `agente.%` é convenção de nome, e regra presa a nome
-- de e-mail quebra no dia em que alguém batizar um robô de outro jeito.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_servico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_servico IS
  'Conta de serviço (agente de IA, QA, integração) — nunca recebe notificação. Ver services/notificar.js.';

-- Backfill das contas de serviço que existem hoje. Por e-mail porque é o que
-- existe para identificá-las AGORA; daqui pra frente quem manda é a coluna.
UPDATE profiles
   SET is_servico = true
 WHERE is_servico = false
   AND (email LIKE 'agente.%@cbrio.org' OR email = 'qa.e2e@cbrio.org');

-- ── 2 · Coordenação de grupos ──────────────────────────────────────────────
-- Natasha Litwinczuk (`assistente-ministerial`, nível 3/3 no módulo `grupos`)
-- recebe o que NÃO tem líder com conta de sistema — decisão do Matheus.
--
-- ⚠️ A conta certa é a INSTITUCIONAL. Ela tem duas: `natasha.litwinczuk@cbrio.org`
-- (acesso ao sistema) e `natasha.lit.faria@gmail.com` (`is_membro_only`, o app do
-- membro). A tabela `notificacoes` é lida pelo ERP e pelo app do staff; escrever
-- para a conta só-membro produziria linha que ela nunca abre.
INSERT INTO notificacao_regras (modulo, profile_id, ativo)
SELECT 'grupos', p.id, true
  FROM profiles p
 WHERE p.email = 'natasha.litwinczuk@cbrio.org'
   AND NOT EXISTS (
     SELECT 1 FROM notificacao_regras r
      WHERE r.modulo = 'grupos' AND r.profile_id = p.id
   );
