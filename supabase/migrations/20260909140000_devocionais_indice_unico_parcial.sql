-- ============================================================================
-- A04 · mem_devocionais · o índice único não enxerga o soft-delete
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ
--   Torna `uq_mem_devocionais_dia` PARCIAL: ele passa a valer só para as
--   linhas vivas (`WHERE deleted_at IS NULL`).
--
-- O QUE MUDA EM PRODUÇÃO
--   Só a definição do índice. Nenhuma linha é alterada.
--
-- POR QUE
--   O índice foi criado em `20260430130000_membro_modelo_completo.sql:59` como
--   `CREATE UNIQUE INDEX uq_mem_devocionais_dia ON mem_devocionais
--    (membro_id, data_devocional, tipo)` — sem predicado. Nenhuma das 928
--   migrations o tornou parcial depois.
--
--   Enquanto o DELETE de devocional era FÍSICO, isso não tinha consequência.
--   O lote 6 da varredura trocou por soft-delete (a tabela está na whitelist
--   de `app_soft_deletable_tables` desde 20260521180000 e apagar sem trilha
--   viola a lei da casa). A partir daí, a linha apagada CONTINUA ocupando a
--   chave: remover o próprio devocional de hoje e tentar salvar outro no mesmo
--   dia e tipo bate em 23505 — numa tela cuja lista está vazia, porque a lista
--   passou a filtrar `deleted_at`. O dia ficaria trancado para sempre.
--
--   O código do lote 6 já contorna isso: no 23505 ele procura a linha morta e
--   RESSUSCITA em vez de recusar. Este arquivo é a correção estrutural, que
--   torna o contorno desnecessário. Os dois convivem sem problema: depois
--   daqui, o insert simplesmente não colide mais, e o ramo de ressurreição
--   deixa de ser alcançado (fica como rede, sem custo).
--
--   ⚠️ Não há ordem obrigatória entre este arquivo e o deploy do lote 6.
--   O contorno funciona sem o índice, e o índice funciona sem o contorno.
--
-- RISCO: baixo, e medido em 09/09/2026.
--   `mem_devocionais` tem 43 linhas, TODAS vivas (0 soft-deletadas), e ZERO
--   chaves `(membro_id, data_devocional, tipo)` duplicadas entre as vivas —
--   então a recriação do índice não pode falhar por violação. Em 43 linhas o
--   `CREATE UNIQUE INDEX` é instantâneo, e por isso não uso `CONCURRENTLY`
--   (que aliás não roda dentro de transação, e o SQL Editor sempre abre uma).
--
--   Depois desta mudança, duas linhas soft-deletadas com a mesma chave passam
--   a poder coexistir. É o comportamento desejado: histórico de apagados não é
--   restrição de unicidade.
--
-- ⚠️ NÃO USE `begin;`/`commit;` — o SQL Editor já abre a transação.
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PASSO 0 · RODE SOZINHO. Confere que a recriação não pode falhar.
-- Esperado: `duplicadas_entre_vivas` = 0. Se vier qualquer coisa > 0, PARE e
-- me avise — significa que o índice de hoje já foi contornado de algum jeito.
-- ---------------------------------------------------------------------------
select count(*) filter (where deleted_at is null)     as vivas,
       count(*) filter (where deleted_at is not null) as soft_deletadas,
       (select count(*) from (
          select membro_id, data_devocional, tipo
          from   public.mem_devocionais
          where  deleted_at is null
          group  by 1, 2, 3
          having count(*) > 1
        ) d)                                          as duplicadas_entre_vivas
from   public.mem_devocionais;

-- ---------------------------------------------------------------------------
-- PASSO 1 · APLICA.
-- ---------------------------------------------------------------------------
set local lock_timeout = '5s';

drop index if exists public.uq_mem_devocionais_dia;

create unique index if not exists uq_mem_devocionais_dia
  on public.mem_devocionais (membro_id, data_devocional, tipo)
  where deleted_at is null;

comment on index public.uq_mem_devocionais_dia is
  'Um devocional por membro/dia/tipo, contando SO as linhas vivas. Virou parcial em 09/09/2026 (varredura, achado A04): sem o predicado, a linha soft-deletada continuava ocupando a chave e trancava o dia depois de a pessoa apagar o proprio registro.';

-- ---------------------------------------------------------------------------
-- PASSO 2 · CONFERÊNCIA. É a prova. Esperado: uma linha, e o `indexdef` tem
-- que terminar com `WHERE (deleted_at IS NULL)`.
-- ---------------------------------------------------------------------------
select indexname, indexdef
from   pg_indexes
where  schemaname = 'public'
  and  tablename = 'mem_devocionais'
order  by 1;
