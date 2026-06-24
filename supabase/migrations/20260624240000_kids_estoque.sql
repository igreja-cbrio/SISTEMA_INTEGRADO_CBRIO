-- Kids · Estoque por sala (2026-06-24)
-- A Mari Gaia controla, por sala, o que TEM e o que DEVERIA ter (qtd_esperada vs
-- qtd_atual) — tipo um controle de patrimônio, mas por quantidade. Itens
-- duráveis podem ser "registrados no patrimônio" (cria um pat_bem na categoria
-- Kids + localização da sala, e guarda pat_bem_id aqui) → comunicação com o
-- módulo de Patrimônio, com a TAG Kids. Sem PII (são itens, não pessoas).

CREATE TABLE IF NOT EXISTS public.kids_estoque (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_id       uuid NOT NULL REFERENCES public.kids_salas(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  categoria     text,                              -- Mobiliário | Brinquedos | Material | Higiene | Outro
  unidade       text NOT NULL DEFAULT 'un',
  qtd_esperada  integer NOT NULL DEFAULT 0,
  qtd_atual     integer NOT NULL DEFAULT 0,
  pat_bem_id    uuid REFERENCES public.pat_bens(id) ON DELETE SET NULL,
  observacao    text,
  ativo         boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_kids_estoque_sala
  ON public.kids_estoque (sala_id) WHERE deleted_at IS NULL;

ALTER TABLE public.kids_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kids_estoque_select ON public.kids_estoque;
CREATE POLICY kids_estoque_select ON public.kids_estoque
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS kids_estoque_insert ON public.kids_estoque;
CREATE POLICY kids_estoque_insert ON public.kids_estoque
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 2);

DROP POLICY IF EXISTS kids_estoque_update ON public.kids_estoque;
CREATE POLICY kids_estoque_update ON public.kids_estoque
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 2)
  WITH CHECK (public.current_user_module_level('kids') >= 2);

DROP POLICY IF EXISTS kids_estoque_delete ON public.kids_estoque;
CREATE POLICY kids_estoque_delete ON public.kids_estoque
  FOR DELETE TO authenticated USING (public.current_user_module_level('kids') >= 3 OR public.is_super_admin());

DROP POLICY IF EXISTS kids_estoque_service ON public.kids_estoque;
CREATE POLICY kids_estoque_service ON public.kids_estoque
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tag "Kids" no Patrimônio (categoria) — usada ao registrar item no patrimônio.
INSERT INTO public.pat_categorias (nome, icone)
SELECT 'Kids', 'baby'
WHERE NOT EXISTS (SELECT 1 FROM public.pat_categorias WHERE lower(nome) = 'kids');

COMMENT ON TABLE public.kids_estoque IS 'Estoque por sala do Kids (qtd esperada vs atual) · liga ao Patrimônio via pat_bem_id.';
