

## Excluir culto Bridge da lógica de online

### Problema
O culto Bridge não tem transmissão online, mas o sistema atual tenta buscar métricas de YouTube e notifica "sem vídeo vinculado" para ele também.

### Solução
Adicionar flag `has_online_stream` em `vol_service_types` para marcar quais tipos de culto têm transmissão online. Bridge ficará com `false`.

### Schema (migration SQL)
```sql
-- Rodar no SQL Editor do Supabase
ALTER TABLE public.vol_service_types 
  ADD COLUMN IF NOT EXISTS has_online_stream BOOLEAN DEFAULT true;

-- Marcar Bridge como sem online (ajustar o nome conforme o cadastro)
UPDATE public.vol_service_types 
  SET has_online_stream = false 
  WHERE LOWER(name) LIKE '%bridge%';
```

### Backend (`backend/routes/kpis.js`)

**1. Auto-criação de cultos** — filtrar apenas tipos que têm online:
```javascript
const { data: types, error: typesErr } = await supabase
  .from('vol_service_types')
  .select('id, name, recurrence_day, recurrence_time')
  .eq('is_active', true)
  .eq('has_online_stream', true)  // NOVO: só cultos com online
  .not('recurrence_day', 'is', null)
  .not('recurrence_time', 'is', null);
```

**2. YouTube sync** — ignorar cultos Bridge:
```javascript
// No POST /youtube/sync, ao buscar cultos para sincronizar
const [{ data: cultosDS }, { data: cultosDDUS }] = await Promise.all([
  supabase.from('cultos')
    .select('id, youtube_video_id, service_type_id')
    .eq('data', ontemStr)
    .not('youtube_video_id', 'is', null)
    .is('online_ds', null),
  supabase.from('cultos')
    .select('id, youtube_video_id, online_ds, service_type_id')
    .eq('data', seteDiasStr)
    .not('youtube_video_id', 'is', null)
    .not('online_ds', 'is', null)
    .is('online_ddus', null),
]);

// Buscar service_types que têm online para filtrar
const { data: onlineTypes } = await supabase
  .from('vol_service_types')
  .select('id')
  .eq('has_online_stream', true);
const onlineTypeIds = new Set(onlineTypes?.map(t => t.id) || []);

// Filtrar apenas cultos com online
const cultosDSFiltrados = (cultosDS || []).filter(c => onlineTypeIds.has(c.service_type_id));
const cultosDDUSFiltrados = (cultosDDUS || []).filter(c => onlineTypeIds.has(c.service_type_id));
```

**3. Notificação de culto sem vídeo** — ignorar Bridge:
```javascript
// Buscar cultos do dia anterior sem youtube_video_id
const { data: cultosSemVideo } = await supabase
  .from('cultos')
  .select('id, nome, data, service_type_id')
  .eq('data', ontemStr)
  .is('youtube_video_id', null);

// Filtrar apenas quem tem online
const cultosSemVideoOnline = (cultosSemVideo || [])
  .filter(c => onlineTypeIds.has(c.service_type_id));

// Notificar apenas esses
for (const c of cultosSemVideoOnline) { ... }
```

**4. Endpoint `/service-types`** — incluir nova coluna:
```javascript
router.get('/service-types', async (req, res) => {
  const { data, error } = await supabase
    .from('vol_service_types')
    .select('id, name, color, recurrence_day, recurrence_time, has_online_stream')  // NOVO
    .eq('is_active', true)
    .order('recurrence_day')
    .order('recurrence_time');
  ...
});
```

### Frontend (`src/pages/kpis/KPIs.tsx`)

**Banner de alerta** — filtrar cultos que realmente precisam de vídeo:
```typescript
// Na verificação de cultos sem vídeo (últimas 48h)
const cultosPrecisamVideo = recentCultos.filter(c => 
  c.has_online_stream !== false && !c.youtube_video_id
);
// Só mostrar banner se houver cultosPrecisamVideo.length > 0
```

**Tabela Online** — opcional: mostrar badge "Sem online" para Bridge em vez de "Sem vídeo".

### Arquivos modificados
- `supabase/migrations_manual/20260420_vol_service_types_online.sql` — migration
- `backend/routes/kpis.js` — filtros em auto-create, youtube sync, notificações
- `src/pages/kpis/KPIs.tsx` — ajuste no banner de alerta

### Entrega
PR `claude/excluir-bridge-online`. Após merge:
1. Rode o SQL no Supabase
2. Edite o tipo de culto Bridge marcando `has_online_stream = false`
3. Próximo culto Bridge não gerará alerta "sem vídeo" nem aparecerá nos gráficos de online

