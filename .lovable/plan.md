

# Corrigir erro "Erro desconhecido" na Mandala Cultura

## Diagnóstico

A mensagem **"Erro desconhecido"** no card da Mandala vem do wrapper de API do frontend (`src/api.js` linha 35). Ele aparece quando a resposta do `/api/kpis/cultura` **não é JSON parseável** — caso típico em Vercel quando a função serverless **estoura o timeout** (504) ou o body retorna vazio.

Olhando `backend/routes/kpis.js` (linhas 462-538), o endpoint `/kpis/cultura` dispara 5 queries em paralelo. O ponto problemático é:

```js
supabase.from('vol_check_ins')
  .select('volunteer_id', { count: 'exact', head: false })
  .gte('checkin_at', noventaDiasStr),
```

Isso **traz todas as linhas de check-in dos últimos 90 dias** apenas para deduplicar voluntários no JS — com o módulo de voluntariado em produção há semanas, isso pode passar dos milhares de rows e levar o pooler do Supabase a estourar o limite de 1000 rows + custo de transferência. Em paralelo, `pense_videos` e `cultura_mensal` podem nem existir, retornando `.error` silenciosamente — funcional, mas adiciona latência.

Combinado com o limite serverless da Vercel, a função estoura, retorna 504 sem JSON, e o frontend cai no fallback "Erro desconhecido".

## O que muda

### 1. Trocar a contagem de voluntários ativos por uma RPC server-side

Criar função SQL `kpi_servir_comunidade(_since timestamptz)` que retorna apenas `count(distinct volunteer_id)` direto no banco — uma única linha, sem trafegar dados.

```sql
create or replace function public.kpi_servir_comunidade(_since timestamptz)
returns int
language sql stable security definer set search_path = public as $$
  select count(distinct volunteer_id)::int
  from vol_check_ins
  where checkin_at >= _since;
$$;
grant execute on function public.kpi_servir_comunidade(timestamptz) to authenticated, service_role;
```

No backend, trocar a query por `supabase.rpc('kpi_servir_comunidade', { _since: noventaDiasStr })`.

### 2. Tornar cada query do `Promise.all` resiliente

Hoje o `Promise.all` resolve mesmo com `.error`, mas se qualquer uma rejeitar (ex.: timeout de uma table), tudo morre. Trocar por `Promise.allSettled` e tratar cada slot individualmente, devolvendo `null` em qualquer um que falhe — a Mandala mostra "—" naquela pétala em vez de quebrar a tela inteira.

### 3. Garantir resposta JSON mesmo em erro inesperado

No `catch` final, garantir:
```js
res.status(500).json({ error: e?.message || 'Erro ao calcular cultura', stack: process.env.NODE_ENV === 'development' ? e.stack : undefined });
```
Hoje, se `e` for um objeto sem `.message` (raro, mas possível em rejections de fetch), o body fica `{ error: undefined }` → JSON inválido para o frontend ler como string.

### 4. Frontend — mensagem mais útil

Em `src/components/cultura/MandalaCultura.jsx`, quando `error` vier vazio, mostrar texto explicativo e botão "Tentar novamente":
```jsx
{error || 'Não foi possível carregar a Mandala.'}
```
e um pequeno botão que dispara o `useEffect` novamente.

### 5. SQL manual para o usuário aplicar

Junto da PR, entregar bloco SQL idempotente:
- `create or replace function kpi_servir_comunidade(...)`
- `create table if not exists cultura_mensal (...)` (caso ainda não exista — schema mínimo: `mes date primary key, qtd_dizimistas int, qtd_ofertantes int, observacoes text, updated_at timestamptz default now()`)
- `create table if not exists pense_videos (...)` (id uuid pk, video_id text, titulo text, data_publicacao date, views bigint default 0, ativo bool default true)

Marcar tudo com `IF NOT EXISTS` para ser seguro rodar várias vezes.

## Arquivos alterados

- `backend/routes/kpis.js` — usar RPC, `Promise.allSettled`, response de erro garantida.
- `src/components/cultura/MandalaCultura.jsx` — fallback de mensagem + retry.
- `supabase/migrations/<timestamp>_kpi_cultura_rpc.sql` — função RPC e tabelas idempotentes.

## Sem mudanças

- Estrutura visual da Mandala (`MandalaSVG`, `PetalDetailDialog`).
- Cálculos de pétalas (presencial/online/decisões/etc.).
- Outros endpoints `/kpis/*`.

## Validação após deploy

1. Rodar o SQL no editor do Supabase de produção.
2. Recarregar `/dashboard` — Mandala deve carregar (mesmo que algumas pétalas mostrem "—" se faltarem dados).
3. Conferir nos logs da Vercel que `/api/kpis/cultura` responde em < 2s.

## Risco

Baixo. A RPC apenas substitui uma query pesada por uma agregação no banco; o `Promise.allSettled` é estritamente mais tolerante que o `Promise.all` atual; o SQL é todo idempotente.

