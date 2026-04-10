

## Problem

The dashboard de Patrimônio está carregando infinitamente. O código no backend (`backend/routes/patrimonio.js`) já foi corrigido para usar agregação SQL via `pg` Pool, mas o problema persiste.

**Causa provável**: O Vercel executa o backend como serverless function. O `pg` Pool com `max: 10` e `connectionTimeoutMillis: 5000` pode estar falhando silenciosamente em ambiente serverless — conexões persistentes (pool) não funcionam bem em serverless, onde cada invocação pode ser um cold start.

Além disso, a query pode estar dando timeout ou erro de conexão, e o `catch` retorna 500, mas o frontend pode não estar tratando o erro adequadamente, ficando em "Carregando..." infinitamente.

## Solution

### 1. Fix pg Pool para ambiente serverless (`backend/utils/supabase.js`)

Reduzir o pool size e aumentar o timeout para funcionar melhor em serverless:

```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,  // serverless = 1 connection
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});
```

### 2. Adicionar tratamento de erro no frontend (`src/pages/admin/patrimonio/Patrimonio.jsx`)

Garantir que o frontend saia do estado de loading quando receber um erro:

- No `useEffect` que carrega o dashboard, adicionar `.catch()` que seta o loading como `false` e mostra uma mensagem de erro ao invés de ficar eternamente em "Carregando..."

### 3. Adicionar fallback com Supabase client no dashboard

Se a query SQL falhar, usar o client Supabase como fallback (com `.range(0, 99999)` para evitar o limite de 1000 rows):

```javascript
router.get('/dashboard', async (req, res) => {
  try {
    // Tenta SQL direto primeiro
    const [totais, ...] = await Promise.all([...]);
    // ...responde normalmente
  } catch (e) {
    console.error('[PAT] Dashboard SQL falhou:', e.message);
    // Fallback: tenta via Supabase client
    try {
      const { data } = await supabase.from('pat_bens').select('*').range(0, 99999);
      // calcula totais em JS como fallback
    } catch (e2) {
      res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
  }
});
```

### Files modified
- `backend/utils/supabase.js` — ajustar pool para serverless (max: 1, timeout maior)
- `backend/routes/patrimonio.js` — adicionar logging e fallback no dashboard
- `src/pages/admin/patrimonio/Patrimonio.jsx` — tratar erro no carregamento do dashboard

