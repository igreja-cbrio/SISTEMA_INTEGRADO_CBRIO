-- ============================================================================
-- PUSH · de qual APP EXPO veio cada token (07/08/2026)
--
-- ⚠️⚠️ O QUE ISTO CONSERTA: **nenhuma notificação push jamais foi entregue**.
-- Medido em `system_mobile_push_tickets` hoje (07/08):
--     1.820 tickets · ticket_status='ok' → **0** · 'error' → 1.801
--     `PUSH_TOO_MANY_EXPERIENCE_IDS` → 1.773 · erro mais recente: HOJE 20:02
--
-- A Expo devolve, literalmente: "All push notification messages in the same
-- request must be for the same project." A tabela `app_push_tokens` recebe
-- token de DOIS apps Expo diferentes (o de membros e o CBRio Staff, ambos na
-- org `cbrio` e apontando pro MESMO Supabase). Os dois remetentes juntam todos
-- os tokens num request só, e a Expo **recusa o lote inteiro** — não só as
-- linhas estranhas. Por isso o iOS também nunca recebeu nada, apesar dos 30
-- tokens válidos.
--
-- ⚠️ A tabela não tinha como distinguir os dois apps: `push_tokens.sql` tem
-- apenas token/user_id/membro_id/platform/updated_at. `platform` diz iOS ou
-- Android — nunca de qual APP. Esta coluna é a peça que faltava.
--
-- ⚠️ NÃO APAGA NADA. As 30 linhas existentes ficam com `projeto_id` NULL, e o
-- remetente passa a mandar token de projeto DESCONHECIDO **um por request** —
-- um request com uma mensagem só não tem como ter "experience ids demais".
-- É correto desde o primeiro envio e se cura sozinho: o app de membros
-- reescreve o próprio token a cada volta do background (desde o OTA de hoje),
-- então em poucos dias a maioria já estará carimbada e volta pro lote de 100.
-- Apagar os tokens seria mais rápido e cego: quem não abrisse o app ficaria
-- sem push sem ninguém saber.
-- ============================================================================

alter table public.app_push_tokens
  add column if not exists projeto_id text;

comment on column public.app_push_tokens.projeto_id is
  'projectId do EAS que emitiu o token (Constants.expoConfig.extra.eas.projectId). '
  'NULL = token antigo, de app que ainda não carimba. A Expo RECUSA O REQUEST '
  'INTEIRO quando tokens de projetos diferentes vão juntos, então o remetente '
  'agrupa por esta coluna antes de enviar. Ver system_mobile_push_tickets.';

-- O remetente agrupa por projeto antes de montar o lote.
create index if not exists app_push_tokens_projeto_idx
  on public.app_push_tokens (projeto_id);

-- ⚠️ A policy de escrita do dono já cobre a coluna nova (`for all`), então o app
-- consegue carimbar sem mudança de RLS. Confirmar que continua valendo:
--   push_tokens_proprio: using/with check (auth.uid() = user_id)
