

## Configurar Secrets do Supabase

A partir do JWT fornecido, extraí o identificador do projeto: `hhntwfawfnxvuobhdfkb`.

### O que será feito

1. **Atualizar `.env`** com os valores reais:
   - `VITE_SUPABASE_URL` → `https://hhntwfawfnxvuobhdfkb.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` → a chave fornecida
   - `VITE_API_URL` → `https://crmcbrio.vercel.app/api` (já configurado)

Isso fará com que o frontend conecte ao seu Supabase existente e as requisições que estão falhando (indo para `seu-projeto.supabase.co`) passem a funcionar.

> **Nota de segurança**: A anon key é uma chave pública (publishable), então é seguro armazená-la no `.env` do projeto.

