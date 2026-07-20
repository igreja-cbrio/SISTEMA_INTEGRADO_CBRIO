-- Promove o inbox de WhatsApp a MÓDULO próprio 'conversas' (compartilhado entre
-- áreas: Cuidados, Kids, etc.), com escopo por área na query do backend.
-- Já aplicada via MCP. Mexe em cargo_modulo_permissao + RLS → confirmar em prod.

-- 1) Catálogo de módulos
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'conversas', 'Conversas', '/conversas', 'ministerial', 168,
       'Inbox de WhatsApp da igreja · receber/responder conversas de quem não é fluxo do bot, com triagem por área',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'conversas');

-- 2) Matriz de permissão default: copia de 'cuidados' (mesmos cargos/níveis).
--    O escopo fino (só a área do usuário) é feito na query do backend.
DO $$
DECLARE base_modulo_id int; novo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'cuidados';
  SELECT id INTO novo_id        FROM public.modulos WHERE slug = 'conversas';
  IF base_modulo_id IS NOT NULL AND novo_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao
      (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo_id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
     WHERE cmp.modulo_id = base_modulo_id
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;

-- 3) Coluna de área (triagem). Nulo = "Entrada" (não triada).
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS area text;
CREATE INDEX IF NOT EXISTS idx_wa_conversas_area ON public.wa_conversas (area, last_message_at DESC) WHERE deleted_at IS NULL;

-- 4) RLS: leitura direta passa de 'cuidados' para 'conversas'
DROP POLICY IF EXISTS wa_conversas_sel ON public.wa_conversas;
CREATE POLICY wa_conversas_sel ON public.wa_conversas FOR SELECT TO authenticated
  USING (public.current_user_module_level('conversas') >= 1);
DROP POLICY IF EXISTS wa_mensagens_sel ON public.wa_mensagens;
CREATE POLICY wa_mensagens_sel ON public.wa_mensagens FOR SELECT TO authenticated
  USING (public.current_user_module_level('conversas') >= 1);
