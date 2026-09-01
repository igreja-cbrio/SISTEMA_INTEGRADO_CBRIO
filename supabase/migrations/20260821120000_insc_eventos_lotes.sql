-- ============================================================================
-- LOTES de preço por evento (2026-08-20 · pedido do Arthur pro AMI CAMP 2027)
--
-- `insc_eventos.lotes` = [{ nome, vagas, valor_centavos }]. O lote vira SOZINHO
-- quando as vagas dele esgotam: as vagas são posições CUMULATIVAS na ordem de
-- chegada (com [50, 100, 150]: inscrições 1..50 pagam o lote 1, 51..150 o 2,
-- 151..300 o 3). A régua é `backend/utils/lotesEvento.js` (pura, no gate); a
-- posição usa a MESMA contagem da vaga (viva não-cancelada — só `cancelada`
-- devolve), então lote e "restam N vagas" nunca discordam.
--
-- ⚠️ CHECK sem subquery/função de conjunto (lei 0A000 do 20260817160000): o
-- banco garante só "é array com até 6 itens"; a forma de cada item é do
-- saneador na rota (`sanitizarLotes`) — item malformado é descartado pelos
-- leitores e degrada pra "sem lote" (valor de tabela), nunca pra preço errado.
--
-- Aditiva e idempotente. Leituras no código são isoladas/fail-soft; o que NÃO
-- tolera ausência é salvar evento pelo admin com lotes preenchidos — aplicar
-- antes do merge.
-- ============================================================================

alter table public.insc_eventos
  add column if not exists lotes jsonb not null default '[]'::jsonb;

comment on column public.insc_eventos.lotes is
  'Lotes de preço [{nome, vagas, valor_centavos}]. Vagas são posições cumulativas na ordem de chegada; a régua é backend/utils/lotesEvento.js. Lista vazia = preço único (valor_centavos).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_insc_eventos_lotes'
      and conrelid = 'public.insc_eventos'::regclass
  ) then
    alter table public.insc_eventos
      add constraint chk_insc_eventos_lotes
      check (
        case jsonb_typeof(lotes)
          when 'array' then jsonb_array_length(lotes) <= 6
          else false
        end
      );
  end if;
end $$;

-- ── Dado do Retiro AMI 2027 / AMI CAMP 2027 (mensagem do Arthur · 20/08) ──
-- Pix no nosso site: Lote 1 · 50 vagas · R$ 830 → Lote 2 · 100 · R$ 850 →
-- Lote 3 · 150 · R$ 870. O cartão é cobrado no E-Inscrição com tabela própria
-- de lá (850/880/900) — nada nosso.
-- `valor_centavos` vira R$ 870 (o preço FINAL, de tabela): se a leitura dos
-- lotes falhar algum dia, o fallback cobra o maior preço da tabela — nunca um
-- desconto silencioso.
-- ⚠️ Guardado por slug + só-onde-vazio (lotes ainda '[]').
update public.insc_eventos
   set lotes = '[
         {"nome": "Lote 1", "vagas": 50,  "valor_centavos": 83000},
         {"nome": "Lote 2", "vagas": 100, "valor_centavos": 85000},
         {"nome": "Lote 3", "vagas": 150, "valor_centavos": 87000}
       ]'::jsonb,
       valor_centavos = 87000
 where slug = 'retiro-ami-2027'
   and deleted_at is null
   and (lotes is null or lotes = '[]'::jsonb);
