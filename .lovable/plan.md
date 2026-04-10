

## Plan: Update backend to use `pat_dashboard_stats()` RPC

Since the function is already created in the database, the change is straightforward.

### Changes to `backend/routes/patrimonio.js`

Replace the entire `/dashboard` handler (lines 8–82) to:

1. **Primary**: Call `supabase.rpc('pat_dashboard_stats')` — no `DATABASE_URL` needed, bypasses the 1,000-row limit
2. **Fallback**: Keep the existing `pg` pool SQL aggregation as a secondary fallback in case the RPC call fails

```javascript
router.get('/dashboard', async (req, res) => {
  try {
    // Primary: RPC function (works without DATABASE_URL)
    const { data, error } = await supabase.rpc('pat_dashboard_stats');
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[PAT] Dashboard RPC falhou:', e.message);
    // Fallback: direct SQL via pg pool
    try {
      const [totais, porCategoria, porLocalizacao, inventarios] = await Promise.all([...]);
      // ... existing SQL aggregation logic ...
      res.json({...});
    } catch (e2) {
      console.error('[PAT] Dashboard fallback falhou:', e2.message);
      res.status(500).json({ error: 'Erro ao carregar dashboard patrimônio' });
    }
  }
});
```

### Files modified
- `backend/routes/patrimonio.js` — use `supabase.rpc('pat_dashboard_stats')` as primary, keep SQL as fallback

