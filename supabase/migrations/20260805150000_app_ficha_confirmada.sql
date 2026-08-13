-- ============================================================================
-- APP · a ficha tem que ser CONFIRMADA pela pessoa, não herdada do vínculo
-- (decisão do Marcos · 05/08/2026)
--
-- Palavras dele: "qual CPF de Pedro Paiva que cadastrou no app? Data de
-- nascimento, Sexo? Só tem email e nome. Se ele pode preencher o cadastro, pra
-- que fundir automaticamente entende? O caso do app, mesmo que o sistema ache
-- que alguém é igual, NÃO DEVE LIBERAR ACESSO; depois de preencher todos os
-- dados aí sim pode se ter 100% de certeza".
--
-- O furo que isso fecha: `GET /app/identidade/status` calculava o que "falta"
-- a partir do CADASTRO QUE O VÍNCULO ENCONTROU. Como o gatilho de `auth.users`
-- liga por e-mail + nome (sinal médio), quem caía num cadastro já completo
-- entrava no app SEM NUNCA TER PROVADO NADA — herdando CPF, nascimento e sexo
-- que outra pessoa (ou um import) preencheu.
--
-- Medido em 05/08 antes de aplicar: das 89 contas com cadastro vinculado, **9
-- passavam o gate — TODAS as 9 por herança** (confirmações reais pelo app: 0).
-- Dois casos não-staff eram gente que logou com Gmail e o vínculo achou um
-- cadastro do `grupos_import_2026`.
--
-- ⚠️ A marca fica em `profiles`, NÃO em `mem_membros`: ela responde "ESTA CONTA
-- do app preencheu a ficha", e é por conta que a régua vale. Em `mem_membros`
-- duas contas ligadas ao mesmo cadastro herdariam a confirmação uma da outra —
-- exatamente o que estamos fechando.
--
-- ⚠️ Aditiva e idempotente. NÃO reescreve o passado: as 9 contas acima vão ver
-- a tela de completar cadastro UMA vez (inclusive as do staff) — é a régua dele
-- aplicada a todo mundo, não regressão.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_ficha_confirmada_em TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.app_ficha_confirmada_em IS
  'Quando ESTA conta do app preencheu a ficha completa (nome, telefone, nascimento, CPF, sexo) pelo /app/identidade/completar. NULL = nunca confirmou: o gate do app NÃO libera, mesmo que o cadastro vinculado esteja completo (dado herdado de vínculo por e-mail+nome não é prova de identidade). Decisão do Marcos, 05/08/2026.';

-- Conferência (rodar no SQL Editor depois de aplicar):
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name = 'app_ficha_confirmada_em';
--
--   -- quantas contas o gate passa a exigir confirmação (esperado: 9 em 05/08):
--   select count(*) from public.profiles p
--    where p.membro_id is not null and p.app_ficha_confirmada_em is null;
