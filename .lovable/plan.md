

## Plano: Corrigir erro "Could not find table in schema cache"

### Diagnóstico

Dois problemas encontrados:

1. **Variável de ambiente errada** — O arquivo `src/supabaseClient.js` usa `VITE_SUPABASE_ANON_KEY`, mas o Lovable Cloud fornece `VITE_SUPABASE_PUBLISHABLE_KEY`. Isso faz o cliente Supabase do frontend ficar `null` no preview do Lovable, ou apontar para uma instância diferente em produção.

2. **Schema cache desatualizado** — O PostgREST mantém um cache do schema do banco. Após criar muitas tabelas via migrations, o cache pode não ter atualizado, causando o erro "Could not find the table 'public.solicitacoes' in the schema cache".

### Correção

1. **Atualizar `src/supabaseClient.js`** — Usar `VITE_SUPABASE_PUBLISHABLE_KEY` (com fallback para `VITE_SUPABASE_ANON_KEY` para compatibilidade com o deploy Vercel externo):
```js
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY 
  || import.meta.env.VITE_SUPABASE_ANON_KEY;
```

2. **Forçar reload do schema cache** — Executar `NOTIFY pgrst, 'reload schema'` no banco para que o PostgREST atualize o cache e reconheça as novas tabelas.

### Arquivos envolvidos

| Ação | Arquivo |
|------|---------|
| Editar | `src/supabaseClient.js` |
| Migration SQL | `NOTIFY pgrst, 'reload schema'` |

