

## Problema

Sem `DATABASE_URL` configurada no Vercel, a query via `pg` Pool falha. O fallback usa o cliente Supabase com `.range(0, 99999)`, mas o Supabase tem um limite server-side de 1.000 linhas na API REST que não pode ser ultrapassado pelo cliente JS.

## Solução

Criar uma **função RPC (database function)** no Supabase que faz a agregação SQL diretamente no banco, e chamá-la via `supabase.rpc()` no backend. Isso elimina a dependência de `DATABASE_URL` e do `pg` Pool.

### 1. Criar função RPC no banco (migration)

```sql
CREATE OR REPLACE FUNCTION pat_dashboard_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'totalBens', (SELECT COUNT(*)::int FROM pat_bens),
    'ativos', (SELECT COUNT(*)::int FROM pat_bens WHERE status = 'ativo'),
    'manutencao', (SELECT COUNT(*)::int FROM pat_bens WHERE status = 'manutencao'),
    'baixados', (SELECT COUNT(*)::int FROM pat_bens WHERE status = 'baixado'),
    'extraviados', (SELECT COUNT(*)::int FROM pat_bens WHERE status = 'extraviado'),
    'valorTotal', (SELECT COALESCE(SUM(valor_aquisicao), 0)::numeric FROM pat_bens),
    'porCategoria', (
      SELECT json_object_agg(nome, qtd) FROM (
        SELECT COALESCE(c.nome, 'Sem categoria') as nome, COUNT(*)::int as qtd
        FROM pat_bens b LEFT JOIN pat_categorias c ON b.categoria_id = c.id
        GROUP BY c.nome
      ) sub
    ),
    'porLocalizacao', (
      SELECT json_object_agg(nome, qtd) FROM (
        SELECT COALESCE(l.nome, 'Sem localização') as nome, COUNT(*)::int as qtd
        FROM pat_bens b LEFT JOIN pat_localizacoes l ON b.localizacao_id = l.id
        GROUP BY l.nome
      ) sub
    ),
    'inventariosAbertos', (SELECT COUNT(*)::int FROM pat_inventarios WHERE status = 'em_andamento')
  )
$$;
```

### 2. Atualizar `backend/routes/patrimonio.js`

Reescrever o endpoint `/dashboard` para:
1. **Primário**: chamar `supabase.rpc('pat_dashboard_stats')` — funciona sem `DATABASE_URL`
2. **Fallback**: manter a query via `pg` Pool caso o RPC falhe (para quando `DATABASE_URL` estiver disponível)

```javascript
router.get('/dashboard', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('pat_dashboard_stats');
    if (error) throw error;
    res.json(data);
  } catch (e) {
    // fallback via pg pool se disponível
    try {
      const [totais, ...] = await Promise.all([...]);
      res.json({...});
    } catch (e2) {
      res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
  }
});
```

### Arquivos modificados
- **Migration SQL** — criar função `pat_dashboard_stats()`
- **`backend/routes/patrimonio.js`** — usar `supabase.rpc()` como método primário

### Resultado esperado
Dashboard mostrará os **4.264 bens** e **R$ 13.428.055,66** corretamente, sem depender de `DATABASE_URL`.

