-- Templates editáveis dos e-mails de inscrição · 2026-07-31
--
-- Pedido do Marcos: a equipe precisa editar e personalizar os e-mails das
-- inscrições sem depender de deploy.
--
-- Resolução em 3 níveis (o backend faz nesta ordem):
--   1. template do EVENTO      (evento_id preenchido)  → texto daquele retiro
--   2. template GLOBAL do tipo (evento_id NULL)        → texto padrão da casa
--   3. layout do CÓDIGO (services/inscricaoEmail.js)   → sempre existe
--
-- O nível 3 é o que garante que o recurso funciona ANTES de alguém customizar
-- qualquer coisa, e que apagar um template não deixa a pessoa sem e-mail.
--
-- ⚠️ NÃO é tabela de PII: guarda texto institucional, não dado de pessoa. Por
-- isso fica fora da whitelist de soft-delete (é config, se apaga de verdade).

CREATE TABLE IF NOT EXISTS public.insc_email_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                 TEXT NOT NULL CHECK (tipo IN ('confirmada', 'pendente', 'expirada')),
  -- NULL = global (vale pra todos os eventos). Preenchido = só daquele evento.
  evento_id            UUID REFERENCES public.insc_eventos(id) ON DELETE CASCADE,
  assunto              TEXT NOT NULL,
  corpo_html           TEXT NOT NULL,
  ativo                BOOLEAN NOT NULL DEFAULT true,
  -- Autoria como SNAPSHOT (sem FK): quem editou não pode desaparecer do
  -- registro se o profile for removido.
  atualizado_por       UUID,
  atualizado_por_nome  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.insc_email_templates IS
  'Templates editáveis dos e-mails de inscrição. Resolução: template do evento > template global > layout do código (services/inscricaoEmail.js). Config institucional, sem PII.';
COMMENT ON COLUMN public.insc_email_templates.evento_id IS
  'NULL = template global do tipo. Preenchido = override daquele evento.';
COMMENT ON COLUMN public.insc_email_templates.corpo_html IS
  'HTML do corpo, com variáveis {{nome}} {{primeiro_nome}} {{codigo}} {{evento}} {{data}} {{hora}} {{local}} {{valor}} {{forma}} {{link}} {{expira_em}}. O HTML é escrito por gente de confiança (nível 5) e vai cru; os VALORES das variáveis são escapados na renderização.';

-- ⚠️ UNIQUE(tipo, evento_id) NÃO resolve o caso global: no Postgres dois NULLs
-- são DISTINTOS, então nasceriam vários "globais" do mesmo tipo e a resolução
-- passaria a depender de sorte. Dois índices parciais é o jeito correto.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_insc_email_tpl_global
  ON public.insc_email_templates (tipo) WHERE evento_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_insc_email_tpl_evento
  ON public.insc_email_templates (tipo, evento_id) WHERE evento_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_insc_email_templates_updated ON public.insc_email_templates;
CREATE TRIGGER trg_insc_email_templates_updated
  BEFORE UPDATE ON public.insc_email_templates
  -- `fn_insc_updated_at()` (criada em 20260729000100_inscricoes_espinha.sql) é a
  -- da família deste módulo. NÃO usar `set_updated_at()`: ela é referenciada em
  -- 3 migrations do repo mas não é CRIADA em nenhuma — migration nova que
  -- dependa dela falha.
  FOR EACH ROW EXECUTE FUNCTION public.fn_insc_updated_at();

ALTER TABLE public.insc_email_templates ENABLE ROW LEVEL SECURITY;

-- Ler exige operar o módulo (nível 2): o texto é institucional, mas quem não
-- mexe em inscrições não tem o que fazer aqui.
DROP POLICY IF EXISTS insc_email_templates_select ON public.insc_email_templates;
CREATE POLICY insc_email_templates_select ON public.insc_email_templates
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('inscricoes') >= 2);

-- Escrever é nível 5: mudar o texto muda o que TODA pessoa inscrita recebe.
DROP POLICY IF EXISTS insc_email_templates_write ON public.insc_email_templates;
CREATE POLICY insc_email_templates_write ON public.insc_email_templates
  FOR ALL TO authenticated
  USING (public.current_user_module_level('inscricoes') >= 5)
  WITH CHECK (public.current_user_module_level('inscricoes') >= 5);

DROP POLICY IF EXISTS insc_email_templates_service ON public.insc_email_templates;
CREATE POLICY insc_email_templates_service ON public.insc_email_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Mudança de texto de e-mail é auditada: é comunicação institucional saindo em
-- nome da igreja.
DROP TRIGGER IF EXISTS trg_audit_insc_email_templates ON public.insc_email_templates;
CREATE TRIGGER trg_audit_insc_email_templates
AFTER INSERT OR UPDATE OR DELETE ON public.insc_email_templates
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes('tipo,evento_id,assunto,corpo_html,ativo');

-- SEM seed de propósito: tabela vazia = todos os e-mails saem no layout do
-- código. A equipe cria o template só quando quiser divergir do padrão, e o
-- botão "Restaurar padrão" da tela apaga a linha em vez de copiar texto.
