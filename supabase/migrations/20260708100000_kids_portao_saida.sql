-- Kids · PORTÃO DE SAÍDA (validação por código de barras · 2026-07-07)
--
-- Novo modelo de check-out (decisão do Marcos com as líderes do Kids): a
-- arquitetura do prédio é de corredor — o pai ENTRA, bipa a etiqueta (recibo)
-- num leitor na porta do corredor e segue; a professora confere na sala se o
-- código do recibo bate com a etiqueta da criança (custódia real). O scan
-- verde REGISTRA a saída no sistema (checkout_metodo='portao'). O portão é
-- não-bloqueante: scan anômalo (código já usado / de sessão antiga / não
-- reconhecido) deixa passar com aviso âmbar e fica LOGADO pra auditoria.
-- Substitui o modelo de chamadas TV/Fire Stick/pagers (código removido; as
-- tabelas kids_chamadas/kids_pagers/kids_pager_envios ficam dormentes no
-- banco — remoção fica pra uma limpeza futura, se o Marcos quiser).

-- 1) CHECK de checkout_metodo ganha o valor 'portao' (recria a constraint,
--    mesmo padrão da 20260707233000 que adicionou 'painel').
DO $$
DECLARE v_name text;
BEGIN
  SELECT con.conname INTO v_name
    FROM pg_constraint con
   WHERE con.conrelid = 'public.kids_checkins'::regclass
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%checkout_metodo%'
   LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.kids_checkins DROP CONSTRAINT %I', v_name);
    RAISE NOTICE 'kids_checkins: CHECK % recriada com o valor portao', v_name;
  END IF;
END $$;

ALTER TABLE public.kids_checkins ADD CONSTRAINT kids_checkins_checkout_metodo_check
  CHECK (checkout_metodo IN (
    'codigo_digitado', 'barcode_escaneado', 'responsavel_autorizado',
    'override_supervisor', 'checkout_forcado', 'painel', 'portao'
  ));

COMMENT ON CONSTRAINT kids_checkins_checkout_metodo_check ON public.kids_checkins IS
  'portao = saída autorizada pelo scan da etiqueta no portão do corredor (sem snapshot de responsável — a custódia é conferida na sala). painel = check-out simples pela equipe.';

-- 2) Log de TODOS os bips do portão (inclusive os anômalos, que não mudam
--    nada no check-in — são o rastro de segurança: código reusado, etiqueta
--    de sessão antiga, código desconhecido).
CREATE TABLE IF NOT EXISTS public.kids_portao_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid REFERENCES public.kids_checkins(id) ON DELETE SET NULL,
  codigo text NOT NULL,
  resultado text NOT NULL CHECK (resultado IN ('ok', 'ja_retirada', 'fora_de_sessao', 'nao_reconhecido')),
  crianca_nome text,          -- snapshot pra auditoria legível
  detalhe text,               -- ex.: hora da retirada anterior no ja_retirada
  criado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kids_portao_scans_created
  ON public.kids_portao_scans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kids_portao_scans_checkin
  ON public.kids_portao_scans (checkin_id);

COMMENT ON TABLE public.kids_portao_scans IS
  'Todo bip do leitor no portão de saída do Kids. ok = registrou a saída (checkout metodo portao). Os demais resultados NÃO alteram o check-in (portão não-bloqueante) — servem de auditoria: ja_retirada = código já usado (possível dupla retirada), fora_de_sessao = etiqueta de culto antigo, nao_reconhecido = código inexistente/ilegível.';

-- RLS · log imutável: leitura pra quem tem kids>=1; escrita só pelo backend
-- (service_role). Sem UPDATE/DELETE pra authenticated (trilha de auditoria).
ALTER TABLE public.kids_portao_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kids_portao_scans_select ON public.kids_portao_scans;
CREATE POLICY kids_portao_scans_select ON public.kids_portao_scans
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS kids_portao_scans_service ON public.kids_portao_scans;
CREATE POLICY kids_portao_scans_service ON public.kids_portao_scans
  FOR ALL TO service_role USING (true) WITH CHECK (true);
