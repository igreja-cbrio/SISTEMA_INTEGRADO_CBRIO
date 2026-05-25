-- Padroes a ignorar automaticamente na fila de classificacao
-- (movimentacoes internas do banco · nao sao receita nem despesa real)
CREATE TABLE IF NOT EXISTS public.fin_padroes_ignorar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  pattern TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.fin_padroes_ignorar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_padroes_ignorar_select ON public.fin_padroes_ignorar;
CREATE POLICY fin_padroes_ignorar_select ON public.fin_padroes_ignorar
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('financeiro') >= 1);

DROP POLICY IF EXISTS fin_padroes_ignorar_write ON public.fin_padroes_ignorar;
CREATE POLICY fin_padroes_ignorar_write ON public.fin_padroes_ignorar
  FOR ALL TO authenticated
  USING (public.current_user_module_level('financeiro') >= 3)
  WITH CHECK (public.current_user_module_level('financeiro') >= 3);

DROP POLICY IF EXISTS fin_padroes_ignorar_service ON public.fin_padroes_ignorar;
CREATE POLICY fin_padroes_ignorar_service ON public.fin_padroes_ignorar
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed iniciais
INSERT INTO public.fin_padroes_ignorar (nome, pattern, descricao)
VALUES
  ('CONTAMAX', '%CONTAMAX%', 'Aplicação/Resgate automático Santander · movimentação interna'),
  ('APLICACAO_AUTOMATICA', '%APLICACAO AUTOMATICA%', 'Aplicação automática genérica'),
  ('RESGATE_AUTOMATICO', '%RESGATE AUTOMATICO%', 'Resgate automático genérico')
ON CONFLICT DO NOTHING;

-- Trigger atualizada · checa padroes ANTES de criar fila
CREATE OR REPLACE FUNCTION public.tg_fila_auto_classificar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s RECORD;
  v_combinado TEXT;
BEGIN
  IF NEW.ja_classificado = true THEN RETURN NEW; END IF;

  v_combinado := COALESCE(NEW.memo, '') || ' ' || COALESCE(NEW.nome_contraparte, '');
  IF EXISTS (
    SELECT 1 FROM fin_padroes_ignorar
    WHERE ativo = true AND v_combinado ILIKE pattern
  ) THEN
    NEW.ja_classificado := true;
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM fin_fila_classificacao WHERE lancamento_bruto_id = NEW.id) THEN RETURN NEW; END IF;
  SELECT * INTO s FROM aplicar_classificacao_lancamento(NEW.id);
  INSERT INTO fin_fila_classificacao (
    lancamento_bruto_id, status,
    sugestao_plano_contas_id, sugestao_centro_custo_id, sugestao_membro_id,
    sugestao_confianca, sugestao_origem, sugestao_explicacao
  )
  VALUES (
    NEW.id, 'pendente',
    s.plano_contas_id, s.centro_custo_id, s.membro_id,
    s.confianca, s.origem, s.explicacao
  );
  RETURN NEW;
END;
$$;
