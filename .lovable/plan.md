

## Problem

The Supabase client defaults to returning a maximum of **1,000 rows** per query. The `pat_bens` table has **4,264 rows**, so the dashboard endpoint only processes 1,000 rows, resulting in incorrect totals for everything: item counts, value totals, and category/location breakdowns.

**Displayed**: 1,000 items / R$ 1.137.543,21
**Actual**: 4,264 items / R$ 13.428.055,66

## Solution

Modify `backend/routes/patrimonio.js` to use a **database-level aggregation** approach instead of fetching all rows and computing in JavaScript. This is both more correct and more efficient.

### Changes to `backend/routes/patrimonio.js`

Replace the dashboard endpoint to use the `pg` pool for SQL aggregation queries instead of fetching all rows via the Supabase JS client:

```sql
-- Total counts and value by status
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'ativo') as ativos,
  COUNT(*) FILTER (WHERE status = 'manutencao') as manutencao,
  COUNT(*) FILTER (WHERE status = 'baixado') as baixados,
  COUNT(*) FILTER (WHERE status = 'extraviado') as extraviados,
  COALESCE(SUM(valor_aquisicao), 0) as valor_total
FROM pat_bens;

-- Counts by category
SELECT COALESCE(c.nome, 'Sem categoria') as nome, COUNT(*) as qtd
FROM pat_bens b LEFT JOIN pat_categorias c ON b.categoria_id = c.id
GROUP BY c.nome;

-- Counts by location
SELECT COALESCE(l.nome, 'Sem localização') as nome, COUNT(*) as qtd
FROM pat_bens b LEFT JOIN pat_localizacoes l ON b.localizacao_id = l.id
GROUP BY l.nome;

-- Open inventories count
SELECT COUNT(*) as total FROM pat_inventarios WHERE status = 'em_andamento';
```

This uses the `query` function from `backend/utils/supabase.js` (which uses the `pg` Pool) to run SQL directly, bypassing the 1000-row limit entirely and being far more efficient.

**Alternative quick fix**: Add `.range(0, 99999)` to the Supabase query, but SQL aggregation is the proper solution.

### Files modified
- `backend/routes/patrimonio.js` — rewrite the `/dashboard` handler to use SQL aggregation via the `pg` pool

No frontend changes needed — the response shape stays the same.

