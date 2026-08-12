-- ============================================================================
-- Presença do NEXT por mês · a partir da CHAMADA dos encontros (11/08/2026)
--
-- Pedido do Matheus, na aba NEXT do Dashboard Semanal: "a presença do next seja
-- inputada de forma automática, a partir da presença das pessoas."
--
-- ⚠️ O automático estava lendo a camada APOSENTADA. `next_inscricoes.check_in_at`
-- + `next_eventos` é o modelo anterior ao cutover de turmas (17/06/2026), cuja
-- última data é 2026-04 — por isso mai/2026 em diante aparecia "sem dado" e
-- jun/jul precisaram ser digitados na mão. A chamada real vive em
-- `next_presencas` (matrícula × encontro), que tem dado até hoje.
--
-- ⚠️⚠️ E o número muda para BAIXO no histórico, de propósito: o legado contava
-- LINHAS (participações — a mesma pessoa nos 2 encontros do mês contava 2), e a
-- pergunta do painel é "quantas PESSOAS estiveram presentes". set/2025 eram 44
-- linhas de 31 pessoas. Aqui conta pessoa.
--
-- ⚠️ Identidade: `membro_id` quando existe; senão a própria matrícula (151 de
-- 1.998 não têm membro). Sem chave não dá pra unir duas matrículas da mesma
-- pessoa — e contar 2 é menos grave que fundir gente diferente.
-- ⚠️ Matrícula soft-deletada FICA DE FORA (regra da casa): a equipe apaga
-- tipicamente duplicata/teste, e contá-la infla a frequência com linha que o
-- módulo /next já não mostra.
-- ⚠️ Encontro sem data também fica de fora — não há mês a que atribuir (1 linha).
-- ⚠️ Medido antes de escrever: a união com a camada legada é IDÊNTICA a esta
-- view em todos os meses (o backfill de 20260729190000 já subiu o legado), então
-- ler só daqui não perde histórico nenhum.
-- ============================================================================
create or replace view public.vw_next_presenca_mes as
select
  to_char(en.data, 'YYYY-MM') as ano_mes,
  count(distinct coalesce(m.membro_id::text, 'mat:' || p.matricula_id::text)) as pessoas,
  count(*) as presencas
from public.next_presencas p
join public.next_encontros en on en.id = p.encontro_id and en.data is not null
left join public.next_matriculas m on m.id = p.matricula_id
where p.presente
  and m.deleted_at is null
group by 1;

comment on view public.vw_next_presenca_mes is
  'Presença do NEXT por mês, contada em PESSOAS (não em participações), a partir da chamada dos encontros (next_presencas). Fonte do card "Presentes no NEXT por mês" do Dashboard Semanal. Substituiu a leitura de next_inscricoes.check_in_at, que é a camada aposentada no cutover de turmas de 17/06/2026.';

-- Acesso só pelo backend (service_role), como as demais views de painel.
revoke all on public.vw_next_presenca_mes from anon, authenticated;

-- Conferência (rodar à parte):
--   select * from pg_views where viewname = 'vw_next_presenca_mes';
--   select ano_mes, pessoas, presencas from vw_next_presenca_mes order by ano_mes desc limit 12;
