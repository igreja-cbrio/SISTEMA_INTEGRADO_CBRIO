-- Templates de e-mail do disparo de voluntários (2026-07-06)
-- Pedido do Matheus: poder criar templates e já ter alguns prontos de fábrica.
-- Sem PII (é modelo de texto) → sem deleted_at; templates de fábrica (is_padrao)
-- não podem ser apagados (guard no backend).
CREATE TABLE IF NOT EXISTS public.vol_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  assunto TEXT NOT NULL DEFAULT '',
  corpo_html TEXT NOT NULL DEFAULT '',
  is_padrao BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vol_email_templates IS
  'Modelos de e-mail reutilizáveis no disparo do voluntariado. is_padrao=true = template de fábrica (não apagável).';

ALTER TABLE public.vol_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY vol_email_templates_select ON public.vol_email_templates
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 1 OR public.is_super_admin());
CREATE POLICY vol_email_templates_insert ON public.vol_email_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());
CREATE POLICY vol_email_templates_update ON public.vol_email_templates
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());
CREATE POLICY vol_email_templates_delete ON public.vol_email_templates
  FOR DELETE TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());
CREATE POLICY vol_email_templates_service ON public.vol_email_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Templates de fábrica (idempotente por nome).
INSERT INTO public.vol_email_templates (nome, assunto, corpo_html, is_padrao)
SELECT v.nome, v.assunto, v.corpo, true
FROM (VALUES
  ('Lembrete de escala',
   'Você está escalado(a) neste fim de semana 🙌',
   '<p>Olá, {{nome}}!</p><p>Passando pra lembrar que você está escalado(a) para servir neste fim de semana. Sua presença faz toda a diferença! 💚</p><p>Se por algum motivo não puder, avise o quanto antes o(a) responsável da sua equipe.</p><p>Contamos com você!</p>'),
  ('Convocação de treinamento',
   'Treinamento de voluntários',
   '<p>Olá, {{nome}}!</p><p>Vamos ter um treinamento de voluntários no dia <b>[DATA]</b>, às <b>[HORÁRIO]</b>, em <b>[LOCAL]</b>.</p><p>É um momento importante de alinhamento e crescimento da nossa equipe. Confirme sua presença respondendo este e-mail.</p><p>Nos vemos lá!</p>'),
  ('Agradecimento',
   'Obrigado por servir! 💚',
   '<p>Olá, {{nome}}!</p><p>Queremos agradecer de coração pela sua dedicação servindo com a gente. Cada gesto seu abençoa muitas pessoas.</p><p>Que Deus te recompense ricamente. Seguimos juntos!</p>'),
  ('Aviso geral',
   'Comunicado aos voluntários',
   '<p>Olá, {{nome}}!</p><p>[Escreva aqui o comunicado.]</p><p>Qualquer dúvida, estamos à disposição.</p><p>Abraço!</p>')
) AS v(nome, assunto, corpo)
WHERE NOT EXISTS (
  SELECT 1 FROM public.vol_email_templates t WHERE t.nome = v.nome AND t.is_padrao = true
);
