-- ============================================================================
-- VISITANTES · porta pública `/visitante` (QR nos cartazes) · 2026-09-09
-- ============================================================================
-- Pedido do Marcos (09/09/2026): "o número de visitantes é importante e nós não
-- contamos mais eles". QR nos locais da igreja (lounge · banheiro ·
-- estacionamento · templo) → a pessoa preenche nome + WhatsApp + CPF → recebe
-- um VOUCHER da cafeteria → depois do culto recebe a pesquisa de satisfação
-- (1 a 5 + comentário) no WhatsApp → e entra em Próximos passos etiquetada
-- como visitante.
--
-- ⚠️⚠️ POR QUE UMA TABELA PRÓPRIA, E NÃO `cui_convertidos` COM TAG.
-- `cui_convertidos` é o DENOMINADOR da NSM (fn recalcular_nsm · "convertidos da
-- coorte, 90d") e a base de contagem de convertidos em kpiAutoCollector,
-- painel, next e online (21 arquivos leem a tabela). Visitante não é
-- convertido: pô-lo lá com etiqueta derrubaria o NSM e inflaria "decisões" em
-- todo relatório que não filtrasse a tag. A lei do módulo já dizia isso desde
-- 25/06/2026: "convertido nasce SEMPRE do culto, nunca no Cuidados".
-- A lista de Próximos passos passa a MOSTRAR as duas fontes (a tela junta);
-- os KPIs continuam lendo só a de convertidos.
--
-- A PESSOA nasce pelo matcher canônico (`fn_link_or_create_membro`, status
-- 'visitante') — a visita guarda o `membro_id` com FK, como toda tabela que
-- aponta pra `mem_membros` (lei nº 10 · `merge_membros` acha os filhos pelo
-- catálogo).
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · A visita
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vis_visitas (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id                 uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  -- culto que a pessoa estava vivendo (régua `services/cultoDeAgora.js`).
  -- Snapshot de nome/data porque a lista de Próximos passos lê isso direto.
  culto_id                  uuid REFERENCES public.cultos(id) ON DELETE SET NULL,
  culto_nome                text,
  culto_data                date,
  -- o que a pessoa digitou (snapshot · o cadastro vivo é mem_membros)
  nome                      text NOT NULL,
  telefone                  text NOT NULL,          -- só dígitos, 10–11
  cpf                       text NOT NULL,          -- só dígitos, 11 (chave do "não pega duas vezes")
  -- onde estava o QR · lista FECHADA (lei de 24/08: opção que vira dado não vive no cliente)
  local                     text NOT NULL DEFAULT 'outro'
                            CHECK (local IN ('lounge','banheiro','estacionamento','templo','outro')),
  -- voucher da cafeteria
  voucher_codigo            text,                   -- 6 chars · alfabeto sem O/0/I/1 · NULL quando não há direito
  voucher_status            text NOT NULL DEFAULT 'emitido'
                            CHECK (voucher_status IN ('emitido','resgatado','repetido')),
  voucher_resgatado_em      timestamptz,
  voucher_resgatado_por     uuid,                   -- profiles.id de quem entregou (sem FK · snapshot)
  voucher_resgatado_por_nome text,
  -- pesquisa de satisfação (WhatsApp após o culto)
  whatsapp_optin            boolean NOT NULL DEFAULT false,
  pesquisa_enviada_em       timestamptz,          -- carimbo de dedup (também quando expira)
  pesquisa_status           text NOT NULL DEFAULT 'pendente'
                            CHECK (pesquisa_status IN ('pendente','enviada','expirada','respondida','sem_optin')),
  pesquisa_nota             smallint CHECK (pesquisa_nota BETWEEN 1 AND 5),
  pesquisa_comentario       text,
  pesquisa_respondida_em    timestamptz,
  -- acompanhamento em Próximos passos (mesmo vocabulário de cui_convertidos)
  primeiro_contato_status   text,
  primeiro_contato_em       timestamptz,
  primeiro_contato_por      uuid,
  responsavel_atendimento   text,
  observacoes               text,
  -- rastro
  ip_origem                 text,
  user_agent                text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);

COMMENT ON TABLE public.vis_visitas IS
  'Visitas registradas pela porta pública /visitante (QR nos cartazes · 09/09/2026). Uma linha por preenchimento; a pessoa vive em mem_membros (matcher, status visitante). Voucher da cafeteria + pesquisa de satisfação via WhatsApp + acompanhamento em Próximos passos. NÃO é convertido: fica FORA de cui_convertidos de propósito (denominador da NSM).';
COMMENT ON COLUMN public.vis_visitas.voucher_status IS
  'emitido = tem código pra resgatar · resgatado = a cafeteria entregou · repetido = este CPF já recebeu voucher numa visita anterior (sem código)';

CREATE INDEX IF NOT EXISTS idx_vis_visitas_cpf        ON public.vis_visitas (cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vis_visitas_telefone   ON public.vis_visitas (telefone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vis_visitas_created    ON public.vis_visitas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vis_visitas_membro     ON public.vis_visitas (membro_id);
CREATE INDEX IF NOT EXISTS idx_vis_visitas_culto      ON public.vis_visitas (culto_id);
-- ⚠️ Código único entre os VIVOS. É parcial de propósito: o resgate faz UPDATE
-- condicional (`voucher_status='emitido'`), nunca ON CONFLICT — então a regra do
-- índice não-parcial pra upsert não se aplica aqui.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vis_visitas_voucher
  ON public.vis_visitas (voucher_codigo) WHERE voucher_codigo IS NOT NULL AND deleted_at IS NULL;
-- Fila da pesquisa: só quem tem opt-in e ainda não recebeu.
CREATE INDEX IF NOT EXISTS idx_vis_visitas_pesquisa_pendente
  ON public.vis_visitas (created_at) WHERE whatsapp_optin AND pesquisa_enviada_em IS NULL AND deleted_at IS NULL;

-- updated_at
CREATE OR REPLACE FUNCTION public.tg_vis_visitas_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_vis_visitas_updated_at ON public.vis_visitas;
CREATE TRIGGER trg_vis_visitas_updated_at
  BEFORE UPDATE ON public.vis_visitas
  FOR EACH ROW EXECUTE FUNCTION public.tg_vis_visitas_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 1b · Ledger de consentimento: `porta` ganha 'visitante'
--
-- ⚠️ Patch DINÂMICO sobre a definição VIVA do CHECK (lei da whitelist, 17/08):
-- reescrever a lista estática apagaria em silêncio qualquer porta que outra
-- migration tenha acrescentado depois de 14/08 ('decisao' foi a última que
-- conhecemos — mas "que conhecemos" é exatamente o problema).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def    text;
  v_vals   text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public' AND t.relname = 'inscricao_consentimentos'
     AND c.conname = 'inscricao_consentimentos_porta_check';

  IF v_def IS NULL THEN
    RAISE NOTICE 'inscricao_consentimentos_porta_check não existe — nada a fazer';
    RETURN;
  END IF;
  IF v_def LIKE '%''visitante''%' THEN
    RETURN; -- já tem
  END IF;

  -- extrai todos os literais 'xxx' da definição viva + acrescenta a porta nova
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_vals
    FROM regexp_matches(v_def, '''([a-z_]+)''', 'g') AS m;
  v_vals := array_append(v_vals, 'visitante');

  EXECUTE 'ALTER TABLE public.inscricao_consentimentos DROP CONSTRAINT inscricao_consentimentos_porta_check';
  EXECUTE format(
    'ALTER TABLE public.inscricao_consentimentos ADD CONSTRAINT inscricao_consentimentos_porta_check CHECK (porta = ANY (%L::text[]))',
    v_vals
  );
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · Soft-delete · whitelist é UNION sobre o que está VIVO (lei de 17/08)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_lista TEXT[];
BEGIN
  SELECT array_agg(DISTINCT t ORDER BY t) INTO v_lista
    FROM (
      SELECT unnest(public.app_soft_deletable_tables()) AS t
      UNION SELECT 'vis_visitas'
    ) x;
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() '
    'RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::TEXT[] $f$',
    v_lista
  );
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3 · RLS · o backend usa service_role; a porta pública NUNCA escreve como anon
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vis_visitas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vis_visitas_select ON public.vis_visitas;
CREATE POLICY vis_visitas_select ON public.vis_visitas FOR SELECT TO authenticated
  USING (public.current_user_module_level('visitantes') >= 1
      OR public.current_user_module_level('cuidados') >= 1);

DROP POLICY IF EXISTS vis_visitas_insert ON public.vis_visitas;
CREATE POLICY vis_visitas_insert ON public.vis_visitas FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('visitantes') >= 3);

DROP POLICY IF EXISTS vis_visitas_update ON public.vis_visitas;
CREATE POLICY vis_visitas_update ON public.vis_visitas FOR UPDATE TO authenticated
  USING (public.current_user_module_level('visitantes') >= 2
      OR public.current_user_module_level('cuidados') >= 3)
  WITH CHECK (public.current_user_module_level('visitantes') >= 2
      OR public.current_user_module_level('cuidados') >= 3);

DROP POLICY IF EXISTS vis_visitas_delete ON public.vis_visitas;
CREATE POLICY vis_visitas_delete ON public.vis_visitas FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS vis_visitas_service ON public.vis_visitas;
CREATE POLICY vis_visitas_service ON public.vis_visitas FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 4 · Módulo `visitantes` + matriz copiada de `cuidados`
--
-- Módulo PRÓPRIO porque é unidade de permissão: quem resgata voucher no balcão
-- da cafeteria não precisa (nem deve) ver a ficha pastoral do Cuidados. A
-- matriz nasce igual à do Cuidados; a equipe da cafeteria entra por override
-- individual ou por cargo em /admin/permissoes (nível 2 = resgatar).
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'visitantes', 'Visitantes', '/visitantes', 'ministerial', 169,
       'Visitantes · QR nos cartazes, voucher da cafeteria, pesquisa de satisfação e acompanhamento', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'visitantes');

DO $$
DECLARE base_id INT;
BEGIN
  SELECT id INTO base_id FROM public.modulos WHERE slug = 'cuidados';
  IF base_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.cargo_modulo_permissao
    (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
    CROSS JOIN public.modulos novo
   WHERE cmp.modulo_id = base_id AND novo.slug = 'visitantes'
  ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5 · A pesquisa NASCE DESLIGADA (lei de 12/08 do Matheus · mesmo desenho do
--     `convertido_boas_vindas`): liga pelo switch em Comunicação → Envios →
--     Automáticos quando o template `visitante_pesquisa_satisfacao` estiver
--     aprovado na Meta. Sem PR.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE public.whatsapp_config
   SET disparos_off = disparos_off || '["visitante_pesquisa"]'::jsonb
 WHERE id = 1
   AND NOT (disparos_off @> '["visitante_pesquisa"]'::jsonb);

-- Conferência (rodar depois, no catálogo — nunca no {"success":true}):
--   SELECT column_name FROM information_schema.columns WHERE table_name='vis_visitas' ORDER BY ordinal_position;
--   SELECT policyname FROM pg_policies WHERE tablename='vis_visitas';
--   SELECT slug, ordem FROM public.modulos WHERE slug='visitantes';
--   SELECT count(*) FROM public.cargo_modulo_permissao cmp JOIN public.modulos m ON m.id=cmp.modulo_id WHERE m.slug='visitantes';
--   SELECT disparos_off FROM public.whatsapp_config WHERE id=1;
