-- ============================================================================
-- Evento de inscrição · período (data_fim) + instruções gerais para download
-- 2026-08-20 · pedido do Marcos para o Retiro AMI 2027 ("AMI CAMP 2027")
--
-- 1. `data_fim` — evento de vários dias (retiro 05/02 a 10/02/2027). Até aqui
--    só existia `data` (DATE) e o período vivia em texto na descrição.
-- 2. `instrucoes_url`/`instrucoes_nome` — o arquivo de "orientações gerais" do
--    evento: depois de concluir a inscrição, a tela pergunta "deseja baixar as
--    instruções gerais?" e o e-mail de confirmação leva o arquivo anexado.
-- 3. Bucket público `evento-arquivos` — onde vivem esses documentos (orientações
--    em PDF, autorização de embarque de menor em DOCX). Público de propósito:
--    são documentos entregues a qualquer pessoa que abre o formulário, e o link
--    estável é o que o e-mail e a tela de download usam.
--    ⚠️ NUNCA subir documento com dado de pessoa neste bucket — pra isso existe
--    o `inscricao-comprovantes` (privado).
--
-- Aditiva e idempotente. O código lê as colunas novas em SELECT ISOLADO e
-- best-effort (lição do parcelas_max): sem a migration, a página pública e o
-- e-mail seguem funcionando sem o período/arquivo. ⚠️ O que NÃO tolera ausência
-- é SALVAR um evento pelo admin com esses campos preenchidos (42703) — aplicar
-- antes do merge.
-- ============================================================================

alter table public.insc_eventos
  add column if not exists data_fim date,
  add column if not exists instrucoes_url text,
  add column if not exists instrucoes_nome text;

comment on column public.insc_eventos.data_fim is
  'Último dia do evento (retiro/viagem de vários dias). NULL = evento de um dia só (vale a coluna data).';
comment on column public.insc_eventos.instrucoes_url is
  'Arquivo de instruções gerais do evento (bucket público evento-arquivos). Oferecido para download na conclusão da inscrição e anexado ao e-mail de confirmação.';
comment on column public.insc_eventos.instrucoes_nome is
  'Nome de exibição do arquivo de instruções (ex.: "AMI CAMP 2027 - Orientações gerais.pdf").';

-- Mesma régua do checkout externo: URL que vira href/anexo só entra https.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_insc_eventos_instrucoes_https'
      and conrelid = 'public.insc_eventos'::regclass
  ) then
    alter table public.insc_eventos
      add constraint chk_insc_eventos_instrucoes_https
      check (instrucoes_url is null or instrucoes_url ~* '^https://');
  end if;
end $$;

-- Bucket público de arquivos de evento (documentos SEM dado de pessoa).
-- Leitura pública é servida pela rota /object/public/ (não passa por RLS);
-- escrita só pelo backend com service_role — nenhuma policy pra authenticated,
-- de propósito.
insert into storage.buckets (id, name, public)
values ('evento-arquivos', 'evento-arquivos', true)
on conflict (id) do nothing;

-- ── Dado do Retiro AMI 2027 (de carona, porque depende das colunas acima) ──
-- Período real 05→10/02/2027 e o arquivo de Orientações Gerais (já no bucket —
-- subido em 20/08 pelo backend com service_role; o ON CONFLICT do bucket acima
-- é só o registro em migration). Guardado por slug + só-onde-vazio: se alguém
-- já tiver preenchido pela tela, a migration não sobrescreve.
update public.insc_eventos
   set data_fim = '2027-02-10',
       instrucoes_url = 'https://hhntwfawfnxvuobhdfkb.supabase.co/storage/v1/object/public/evento-arquivos/espinha/arquivos/ami-camp-2027-orientacoes-gerais.pdf',
       instrucoes_nome = 'AMI CAMP 2027 — Orientações Gerais.pdf'
 where slug = 'retiro-ami-2027'
   and deleted_at is null
   and data_fim is null
   and instrucoes_url is null;
