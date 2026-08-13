-- ============================================================================
-- Cruzar conversa ↔ disparo sem depender de sorte (12/08/2026)
--
-- Pedido do Matheus: na aba Conversas, saber de QUAL disparo a pessoa veio.
--
-- ⚠️⚠️ `whatsapp_envios.telefone` guarda O QUE O CHAMADOR PASSOU, não uma forma
-- canônica. Medido em 12/08 nas 1.558 linhas: **1.074 em dígitos puros e 484
-- (31%) COM FORMATAÇÃO** (tamanho 14/15, tipo "(21) 98668-7406"). Um filtro
-- `telefone like '%98687406'` casaria só as primeiras e perderia 31% **em
-- silêncio** — a tela diria "não veio de disparo nenhum" para quem recebeu.
--
-- A coluna gerada normaliza no BANCO, então o filtro passa a ser `=` sobre uma
-- forma estável, com índice. Oito dígitos é o que sobra depois de DDI e DDD, e é
-- o mesmo recorte já usado no cruzamento de falha de entrega (03/08).
-- ⚠️ STORED e não VIRTUAL: é coluna de FILTRO, e virtual não é indexável.
-- ⚠️ Não substitui a conferência em JS (`chaveTelefone` dos dois lados): número
-- curto demais geraria tail parcial, e casar por 4 dígitos ligaria pessoas
-- diferentes. Aqui é só o que o banco consegue filtrar barato.
--
-- APLICADA em produção em 12/08/2026 (via MCP) · conferida no catálogo:
--   1.558/1.558 linhas com tel8 de 8 dígitos · índice presente.
-- ============================================================================
alter table public.whatsapp_envios
  add column if not exists tel8 text
  generated always as (right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8)) stored;

comment on column public.whatsapp_envios.tel8 is
  'Últimos 8 dígitos do telefone (gerada). Chave de cruzamento conversa↔disparo: a coluna telefone guarda formas diferentes (com e sem 55, com e sem máscara), então comparar cru perde ~31% das linhas.';

create index if not exists idx_whatsapp_envios_tel8
  on public.whatsapp_envios (tel8, criado_em desc);

-- ⚠️ O PostgREST precisa recarregar o schema pra enxergar a coluna nova:
--   notify pgrst, 'reload schema';

-- Conferência (rodar à parte):
--   select count(*) total, count(*) filter (where length(tel8)=8) com_tail from whatsapp_envios;
--   select * from pg_indexes where indexname = 'idx_whatsapp_envios_tel8';
