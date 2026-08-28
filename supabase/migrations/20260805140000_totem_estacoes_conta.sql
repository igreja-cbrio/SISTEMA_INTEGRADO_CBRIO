-- ============================================================================
-- Totem · a ESTAÇÃO é a CONTA DE QUIOSQUE (2026-08-05 · reorientação)
--
-- Decisão do Matheus, ao ver o desenho: as inscrições de evento vão DENTRO do
-- módulo Totem Membro (`/totem` · MENU_OPTIONS de TotemMembro.tsx), não num
-- quiosque paralelo. E o comentário no próprio MENU_OPTIONS confirma que era
-- ali o lugar: "Retiro / Contribuição / Ag. Pastoral / Voluntariado saíram do
-- menu: eram placeholders sem implementação — poda do atlas 2026-07".
--
-- Consequência prática: aquele totem **já está autenticado** por conta de
-- quiosque (`profiles.is_membro_only = true` + cargo `totem-kiosk` + override em
-- `permissoes_modulo` · migration 20260703160000). Então não há nada a parear no
-- navegador: a estação é resolvida NO SERVIDOR a partir de `req.user.id`.
--
-- ⚠️ Isso preserva a propriedade que importa: `estacao_id` continua sendo
-- ATRIBUÍDO pelo servidor, nunca declarado pelo cliente. O que sai é uma
-- credencial a mais pra gerenciar num PC de hall — e credencial que não existe
-- não pode ser copiada.
--
-- `totem_estacao_tokens` CONTINUA existindo, para um caso só: o **agente do
-- pinpad** (Fase 3), que é um serviço Windows sem sessão de usuário e por isso
-- precisa de segredo próprio. O tipo 'dispositivo' fica no CHECK como
-- vocabulário morto — não usar.
-- ============================================================================

ALTER TABLE public.totem_estacoes
  ADD COLUMN IF NOT EXISTS conta_id uuid;

-- ⚠️ LEI Nº 10: a FK vai em comando SEPARADO do ADD COLUMN. `ADD COLUMN IF NOT
-- EXISTS ... REFERENCES` pula o comando INTEIRO quando a coluna já existe, e o
-- repo fica "declarando" uma FK que o banco nunca teve.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'totem_estacoes_conta_id_fkey'
      AND conrelid = 'public.totem_estacoes'::regclass
  ) THEN
    ALTER TABLE public.totem_estacoes
      ADD CONSTRAINT totem_estacoes_conta_id_fkey
      FOREIGN KEY (conta_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL NOT VALID;
    ALTER TABLE public.totem_estacoes VALIDATE CONSTRAINT totem_estacoes_conta_id_fkey;
    RAISE NOTICE '[totem] FK totem_estacoes.conta_id criada';
  END IF;
END $$;

-- Uma conta = uma estação. Sem isso, duas estações apontando pra mesma conta
-- fariam a resolução `conta → estação` devolver qualquer uma das duas, e a
-- cobrança seria atribuída ao totem errado — silenciosamente.
CREATE UNIQUE INDEX IF NOT EXISTS totem_estacoes_conta_uk
  ON public.totem_estacoes (conta_id) WHERE conta_id IS NOT NULL;

COMMENT ON COLUMN public.totem_estacoes.conta_id IS
  'Conta de quiosque (profiles) que ESTÁ neste totem. É por aqui que o servidor resolve a estação a partir do usuário logado — o cliente nunca declara estacao_id. Uma conta = uma estação (índice único parcial).';

-- ─── Seed: as 3 contas do lounge já existem, então as estações também ──────
-- `totem1/2/3@cbrio.org` ("Totem Lounge 1/2/3") foram provisionadas pelo
-- backend/scripts/_criar_conta_totem.js. Criar as estações aqui deixa a feature
-- utilizável sem cadastro manual; `local` fica NULL de propósito (só a equipe
-- sabe onde cada PC está) e sobra pra ser preenchido na tela.
-- ⚠️ Estação sobrando não incomoda nem gasta nada, e sai por "Revogar totem".
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.email, p.name,
           'lounge-' || regexp_replace(p.email, '^totem([0-9]+)@.*$', '\1') AS codigo
      FROM public.profiles p
      JOIN public.usuarios u ON lower(u.email) = lower(p.email)
      JOIN public.cargos c   ON c.id = u.cargo_id
     WHERE c.slug = 'totem-kiosk'
       AND p.email ~ '^totem[0-9]+@'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.totem_estacoes WHERE conta_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM public.totem_estacoes WHERE codigo = r.codigo) THEN
      INSERT INTO public.totem_estacoes (codigo, nome, finalidades, conta_id)
      VALUES (r.codigo, coalesce(r.name, r.email), ARRAY['inscricoes','membro']::text[], r.id);
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '[totem] estacoes do lounge criadas: %', n;
END $$;

-- ─── Conferência (SQL Editor) ──────────────────────────────────────────────
-- select conname, convalidated from pg_constraint
--  where conname = 'totem_estacoes_conta_id_fkey';   -- convalidated = true
-- select e.codigo, e.nome, p.email, e.finalidades, e.ativo
--   from public.totem_estacoes e
--   left join public.profiles p on p.id = e.conta_id order by e.codigo;
-- select indexname from pg_indexes where indexname = 'totem_estacoes_conta_uk';
