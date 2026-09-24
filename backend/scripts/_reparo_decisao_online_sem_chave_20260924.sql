-- ============================================================================
-- Tira da MEMBRESIA os cadastros-fantasma nascidos de decisão ONLINE lançada à
-- mão · pedido do Matheus em 24/09/2026
--
--   "essas pessoas que vem do online, sem cpf e dado nenhum, preciso que vc
--    remova dos membros, esta poluindo."
--
-- O QUE SÃO: a coordenação do Online assiste ao culto no YouTube e lança à mão
-- quem escreve no CHAT que está aceitando Jesus. O formulário EXIGE telefone,
-- então ela preenche "00000000000", e no campo NOME vai o @handle do YouTube —
-- a única coisa que ela tem. Cada lançamento desses cria um `mem_membros`.
-- Medido em 24/09: 12 cadastros, criados em 14/09 (8) e 21/09 (4).
--
-- ⚠️⚠️ SOFT-DELETE, e SÓ do `mem_membros`. A DECISÃO DE FÉ É REAL e fica:
-- `cultos_decisoes_pessoas`, `cui_convertidos` (a fila pastoral, onde a Renata
-- já trabalhou), `mem_trilha_valores` e `nsm_eventos` ficam INTACTOS. Medido:
-- todas as FKs para `mem_membros` são SET NULL e o soft-delete nem as toca.
-- O que sai é a linha da lista de Membresia — que é o que foi pedido.
--
-- ⚠️ O @handle NÃO se perde: está gravado igual em `mem_membros.nome`,
-- `cultos_decisoes_pessoas.nome` E `cui_convertidos.nome` (conferido nos 12).
--
-- ⚠️⚠️ `cui_convertidos.membro_id` NÃO é solto (não vira NULL), e é decisão:
-- `garantirMembro()` em `routes/cuidados.js:1559` só chama o matcher quando
-- `membro_id` está vazio. Soltar o ponteiro faria o fantasma RENASCER no dia em
-- que alguém direcionasse a pessoa pro Next ou pro batismo.
--
-- ⚠️ Os indicadores NÃO se movem, e isto foi MEDIDO, não suposto:
--   · `recalcular_nsm()` lê `cui_convertidos` (filtrando o `deleted_at` DELA) e
--     nunca olha `mem_membros.deleted_at` — o denominador não muda;
--   · `fn_nsm_sinais_engajados` devolve `{}` para os 12 (nenhum tem sinal de
--     engajamento), então eles nunca estiveram no numerador.
--
-- Reversível: `select app_restore('mem_membros', '<id>')`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASSO 1 · quem entra (rodar sozinho ANTES — é o dry-run)
-- ----------------------------------------------------------------------------
-- São TRÊS sinais somados (a lei de 17/08: critério único pega gente real):
--   1. PROCEDÊNCIA — o cadastro nasceu de uma decisão `tipo_decisao='online'`;
--   2. SEM CHAVE — sem CPF, sem e-mail com FORMA de e-mail, sem telefone
--      alcançável. ⚠️ "e-mail com forma", não "e-mail preenchido": nos 2 mais
--      recentes a coordenação passou a pôr o handle no campo e-mail
--      (`@wil66lobo`, `@lorenjacksonde`), e `email IS NOT NULL` os deixaria
--      passar;
--   3. SEM ENGAJAMENTO — nenhum vínculo além das 5 tabelas que a própria
--      decisão cria. Quem entrou em grupo, se batizou ou ganhou login foi
--      reencontrado e NÃO é fantasma.
create or replace view public._tmp_online_sem_chave as
select m.id, m.nome, m.telefone, m.email, m.created_at
from public.mem_membros m
where m.deleted_at is null
  and exists (
    select 1 from public.cultos_decisoes_pessoas d
    where d.membro_id = m.id and d.deleted_at is null and d.tipo_decisao = 'online'
  )
  -- sem chave de contato nenhuma
  and m.cpf is null
  and coalesce(m.email, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  and (
    m.telefone is null
    or length(regexp_replace(m.telefone, '\D', '', 'g')) not in (10, 11)
    or m.telefone ~ '^(.)\1+$'
  )
  -- sem nenhum sinal de que a pessoa foi reencontrada
  and not exists (select 1 from public.mem_grupo_membros x where x.membro_id = m.id)
  and not exists (select 1 from public.batismo_inscricoes x where x.membro_id = m.id)
  and not exists (select 1 from public.next_matriculas x where x.membro_id = m.id)
  and not exists (select 1 from public.mem_voluntarios x where x.membro_id = m.id)
  and not exists (select 1 from public.mem_contribuicoes x where x.membro_id = m.id)
  and not exists (select 1 from public.profiles x where x.membro_id = m.id)
  and not exists (select 1 from public.inscricoes x where x.membro_id = m.id)
  and not exists (select 1 from public.vol_profiles x where x.membresia_id = m.id);

select * from public._tmp_online_sem_chave order by nome;

-- ----------------------------------------------------------------------------
-- PASSO 2 · backup ANTES de escrever
-- ----------------------------------------------------------------------------
-- ⚠️ A foto nasce no schema `backups`, NUNCA no `public` (lei de 16/09): o
-- PostgREST publica o `public` e a cópia herdaria a superfície de API da tabela
-- viva sem herdar política nenhuma.
create table backups._bk_20260924_online_sem_chave as
select m.* from public.mem_membros m
join public._tmp_online_sem_chave t on t.id = m.id;

select count(*) as linhas_no_backup from backups._bk_20260924_online_sem_chave;

-- ----------------------------------------------------------------------------
-- PASSO 3 · o soft-delete (pela RPC da casa, nunca UPDATE cru)
-- ----------------------------------------------------------------------------
select t.nome, public.app_soft_delete('mem_membros', t.id::text, null) as ok
from public._tmp_online_sem_chave t
order by t.nome;

-- ----------------------------------------------------------------------------
-- PASSO 4 · conferência (no CATÁLOGO, nunca no "success: true")
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.mem_membros
     where deleted_at is null and active and (nome like '@%' or telefone = '00000000000')) as fantasmas_na_membresia,
  (select count(*) from public.cui_convertidos cv
     join backups._bk_20260924_online_sem_chave b on b.id = cv.membro_id
    where cv.deleted_at is null) as fila_pastoral_preservada,
  (select count(*) from public.cultos_decisoes_pessoas d
     join backups._bk_20260924_online_sem_chave b on b.id = d.membro_id
    where d.deleted_at is null) as decisoes_preservadas,
  (select count(*) from public.nsm_eventos n
     join backups._bk_20260924_online_sem_chave b on b.id = n.membro_id) as nsm_preservado;
-- esperado: 0 · 12 · 12 · 12

drop view public._tmp_online_sem_chave;
