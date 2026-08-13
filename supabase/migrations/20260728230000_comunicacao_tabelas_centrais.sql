-- Módulo Comunicação · C3 — tabelas centrais + catálogo do módulo.
-- Números, templates (com sync do catálogo da Meta), programadas/recorrência,
-- atendentes (com escala/horário · decisão do Matheus) e tarifas (custo).
-- Aditiva/idempotente. Frontend nunca escreve direto (backend service role);
-- leitura autenticada gated pelo módulo 'comunicacao'.

-- ── Números de envio (V1 = 1 número · remetente por param já pronto no waSender)
CREATE TABLE IF NOT EXISTS public.wa_numeros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id text UNIQUE NOT NULL,   -- id da Meta (não é o número em si)
  rotulo text,                            -- ex.: 'Institucional +55 21 99907-9031'
  waba_id text,
  is_default boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Templates (espelho do catálogo da Meta + metadados nossos)
CREATE TABLE IF NOT EXISTS public.wa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,                     -- nome exato na Meta
  idioma text NOT NULL DEFAULT 'pt_BR',
  categoria text,                         -- MARKETING | UTILITY | AUTHENTICATION
  status_meta text,                       -- APPROVED | REJECTED | PENDING | ...
  componentes jsonb,                      -- estrutura crua da Meta (body/botões)
  params_body integer,                    -- nº de {{n}} no body (derivado no sync)
  modulo text,                            -- dono lógico (app/grupos/next/kids/...)
  exemplo text,                           -- texto de exemplo renderizado
  env_var text,                           -- env legado que apontava pra ele (rastreio da migração)
  ativo boolean NOT NULL DEFAULT true,
  sincronizado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nome, idioma)
);

-- ── Programadas / recorrência (V1: audiência salva de telefones · os crons
--    fixos do vercel.json migram um a um em fases futuras)
CREATE TABLE IF NOT EXISTS public.wa_agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  template_nome text,                     -- template (proativo) OU
  texto text,                             -- texto (só janela 24h · raro)
  params jsonb NOT NULL DEFAULT '[]'::jsonb,
  audiencia jsonb NOT NULL,               -- {tipo:'telefones', telefones:[...]} (V1)
  quando timestamptz,                     -- disparo único
  recorrencia text CHECK (recorrencia IN ('diaria','semanal','mensal')),
  dia_semana integer CHECK (dia_semana BETWEEN 0 AND 6),
  dia_mes integer CHECK (dia_mes BETWEEN 1 AND 31),
  hora time,                              -- hora local (BRT) do disparo recorrente
  ativo boolean NOT NULL DEFAULT true,
  ultimo_disparo timestamptz,
  criado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_agendamentos_conteudo CHECK (template_nome IS NOT NULL OR texto IS NOT NULL),
  CONSTRAINT wa_agendamentos_quando CHECK (quando IS NOT NULL OR recorrencia IS NOT NULL)
);

-- ── Atendentes do chat (cadastro + áreas + escala/horário)
CREATE TABLE IF NOT EXISTS public.wa_atendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  areas text[] NOT NULL DEFAULT '{}',     -- áreas que atende (vazio = todas)
  horarios jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{dia:0-6, inicio:'09:00', fim:'18:00'}]
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Tarifas da Meta por categoria de conversa (editável · custo estimado)
CREATE TABLE IF NOT EXISTS public.wa_tarifas (
  categoria text PRIMARY KEY,             -- marketing | utility | authentication | service
  tarifa numeric NOT NULL,                -- R$ por conversa iniciada
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.wa_tarifas (categoria, tarifa) VALUES
  ('marketing', 0.35), ('utility', 0.04), ('authentication', 0.04), ('service', 0)
ON CONFLICT (categoria) DO NOTHING;

-- ── RLS (padrão: service_role tudo · leitura autenticada por módulo)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wa_numeros','wa_templates','wa_agendamentos','wa_atendentes','wa_tarifas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_service') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', t || '_service', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_select') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.current_user_module_level(''comunicacao'') >= 1);', t || '_select', t);
    END IF;
  END LOOP;
END $$;

-- ── Catálogo do módulo + matriz (copia de 'conversas' · o menu/rota chegam no C4)
-- O catálogo tem UNIQUE(nome) e existe uma linha LEGADA morta
-- (nome='Comunicação', slug NULL, inativa, 0 permissões — verificado):
-- reaproveita ela; senão insere.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'comunicacao') THEN
    IF EXISTS (SELECT 1 FROM public.modulos WHERE nome = 'Comunicação' AND slug IS NULL) THEN
      UPDATE public.modulos
         SET slug = 'comunicacao', rota = '/comunicacao', categoria = 'ministerial',
             ordem = 169, ativo = true,
             descricao = 'Central de WhatsApp: números, templates, envios, programadas, atendentes e relatórios'
       WHERE nome = 'Comunicação' AND slug IS NULL;
    ELSE
      INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
      VALUES ('comunicacao', 'Comunicação', '/comunicacao', 'ministerial', 169,
              'Central de WhatsApp: números, templates, envios, programadas, atendentes e relatórios', true);
    END IF;
  END IF;
END $$;

DO $$
DECLARE base_id int; novo_id int;
BEGIN
  SELECT id INTO base_id FROM public.modulos WHERE slug = 'conversas';
  SELECT id INTO novo_id FROM public.modulos WHERE slug = 'comunicacao';
  IF base_id IS NOT NULL AND novo_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo_id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
     WHERE cmp.modulo_id = base_id
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;
