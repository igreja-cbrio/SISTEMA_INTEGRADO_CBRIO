-- ============================================================================
-- Grupo de WhatsApp pra DÚVIDAS do evento (2026-08-21 · pedido do Marcos pro
-- AMI CAMP 2027: "caso alguém queira tirar dúvida antes ou depois de se
-- inscrever")
--
-- `insc_eventos.whatsapp_duvidas_url` aparece como link nas DUAS telas
-- públicas: na página do evento (antes de pagar — cobre a escolha Pix×cartão,
-- o formulário e a tela de sucesso, que dividem o mesmo cabeçalho) e na página
-- de pagamento (depois de se inscrever, pago ou não).
--
-- ⚠️ NÃO confundir com `msg_whatsapp` (o texto de DIVULGAÇÃO que o admin copia
-- com {link}) nem com envio: isto é um link de ENTRADA em grupo, exibido, nunca
-- disparado.
--
-- Aditiva e idempotente; leitura no código é isolada/fail-soft. Salvar evento
-- pelo admin com o campo preenchido exige a coluna — aplicar antes do merge.
-- ============================================================================

alter table public.insc_eventos
  add column if not exists whatsapp_duvidas_url text;

comment on column public.insc_eventos.whatsapp_duvidas_url is
  'Link de convite do grupo de WhatsApp de dúvidas do evento (exibido na página pública e na de pagamento). NULL = sem grupo.';

-- Mesma régua dos outros links que viram href público: só https.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_insc_eventos_whatsapp_duvidas_https'
      and conrelid = 'public.insc_eventos'::regclass
  ) then
    alter table public.insc_eventos
      add constraint chk_insc_eventos_whatsapp_duvidas_https
      check (whatsapp_duvidas_url is null or whatsapp_duvidas_url ~* '^https://');
  end if;
end $$;

-- Dado do AMI CAMP 2027 (link mandado pelo Marcos em 21/08) · só-onde-vazio.
update public.insc_eventos
   set whatsapp_duvidas_url = 'https://chat.whatsapp.com/GI8sRZYJhhO3sRDjrZgIaE?mode=gi_t'
 where slug = 'retiro-ami-2027'
   and deleted_at is null
   and whatsapp_duvidas_url is null;
