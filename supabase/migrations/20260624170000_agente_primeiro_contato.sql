-- ============================================================
-- Agente de Primeiro Contato (piloto · jornada do convertido)
-- ============================================================
-- O agente detecta convertido novo SEM primeiro contato pastoral, atribui a um
-- responsável NOMINAL (líder da área), rascunha uma mensagem de WhatsApp e
-- coloca numa FILA DE REVISÃO. O líder revisa e envia em 1 toque (wa.me) — o
-- agente NÃO envia sozinho (modo seguro). Registra aceito/ignorado p/ aprender.
--
-- PII (referencia pessoa convertida + mensagem com nome). Segue o padrão:
-- deleted_at + RLS contextual + service_role. ⚠️ Antes do deploy, registrar a
-- tabela na whitelist app_soft_deletable_tables() (não regerada aqui p/ não
-- clobberar a lista viva — ver NOTA no fim).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cui_primeiro_contato_fila (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convertido_id uuid NOT NULL REFERENCES public.cui_convertidos(id) ON DELETE CASCADE,
  area text,
  responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  responsavel_nome text,
  -- rascunho gerado pelo agente (Haiku) · editável pelo líder antes de enviar
  mensagem_rascunho text,
  telefone text,                 -- snapshot do telefone do convertido (p/ o wa.me)
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviado','contato_feito','ignorado','expirado')),
  prazo date,
  enviado_em timestamptz,
  enviado_por uuid REFERENCES auth.users(id),
  -- aprendizagem: 'aceitou' (enviou como veio), 'editou', 'ignorou'
  feedback text,
  agente_versao text DEFAULT 'primeiro-contato-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT cui_pcf_um_por_convertido UNIQUE (convertido_id)
);

CREATE INDEX IF NOT EXISTS idx_cui_pcf_pendente
  ON public.cui_primeiro_contato_fila (status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cui_pcf_area
  ON public.cui_primeiro_contato_fila (area, status) WHERE deleted_at IS NULL;

ALTER TABLE public.cui_primeiro_contato_fila ENABLE ROW LEVEL SECURITY;

-- Equipe de Cuidados (visão geral) OU o líder da área da conversão lê a fila.
DROP POLICY IF EXISTS cui_pcf_select ON public.cui_primeiro_contato_fila;
CREATE POLICY cui_pcf_select ON public.cui_primeiro_contato_fila
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('cuidados') >= 1
    OR (area IS NOT NULL AND public.current_user_module_level(area) >= 1)
    OR public.is_super_admin()
  );

-- Marca enviado/feito/ignorado: Cuidados>=2 ou líder da área>=2.
DROP POLICY IF EXISTS cui_pcf_update ON public.cui_primeiro_contato_fila;
CREATE POLICY cui_pcf_update ON public.cui_primeiro_contato_fila
  FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('cuidados') >= 2
    OR (area IS NOT NULL AND public.current_user_module_level(area) >= 2)
    OR public.is_super_admin()
  )
  WITH CHECK (true);

-- Delete só super-admin.
DROP POLICY IF EXISTS cui_pcf_delete ON public.cui_primeiro_contato_fila;
CREATE POLICY cui_pcf_delete ON public.cui_primeiro_contato_fila
  FOR DELETE TO authenticated USING (public.is_super_admin());

-- Backend (service_role) enfileira e atualiza.
DROP POLICY IF EXISTS cui_pcf_service ON public.cui_primeiro_contato_fila;
CREATE POLICY cui_pcf_service ON public.cui_primeiro_contato_fila
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.cui_primeiro_contato_fila IS
  'Fila de revisão do Agente de Primeiro Contato: convertidos sem contato pastoral, com responsável atribuído + mensagem rascunhada p/ envio em 1 toque pelo líder. Modo seguro (humano envia).';

-- ⚠️ NOTA (fazer antes do deploy): registrar 'cui_primeiro_contato_fila' na
-- whitelist public.app_soft_deletable_tables() (CREATE OR REPLACE lendo a lista
-- VIVA — não regerar de cabeça p/ não remover entradas existentes).
