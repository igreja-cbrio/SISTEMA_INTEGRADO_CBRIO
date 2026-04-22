

# Quantidade de escalados nos cards de cultos

Adicionar a contagem de voluntários escalados em cada card de culto na **Home do Voluntariado** (`VolDashboard.tsx`), tanto em **Cultos de Hoje** quanto em **Próximos Cultos**, para que líderes saibam de relance quantos estão confirmados.

## Layout

```
┌─ Quarta Com Deus ─────────────────── 20:00 ─┐
│  Quarta Com Deus                            │
│  👥 12 escalados                            │
└─────────────────────────────────────────────┘
```

Badge discreto abaixo do subtítulo do culto, ícone `Users` + "N escalados" (cor `text-muted-foreground`, mesmo tamanho de fonte do subtítulo). Se zero: "Sem escala".

## Mudanças de código

### 1. Backend — incluir contagem na resposta dos endpoints de services

**`backend/routes/voluntariado.js`** (linhas 764-795): nas três rotas (`/services`, `/services/upcoming`, `/services/today`), após buscar `vol_services`, fazer uma query agregada em `vol_schedules` agrupada por `service_id` e anexar `scheduled_count` em cada culto.

Implementação: um único `SELECT service_id, count(*)` filtrando pelos IDs retornados, depois map no JS:
```js
const ids = data.map(s => s.id);
const { data: counts } = await supabase
  .from('vol_schedules')
  .select('service_id')
  .in('service_id', ids);
const countMap = counts.reduce((acc, r) => {
  acc[r.service_id] = (acc[r.service_id] || 0) + 1;
  return acc;
}, {});
const result = data.map(s => ({ ...s, scheduled_count: countMap[s.id] || 0 }));
res.json(result);
```

Se `ids.length === 0`, pular a query de contagem.

### 2. Tipo — adicionar campo opcional

**`src/pages/ministerial/voluntariado/types/index.ts`**: adicionar `scheduled_count?: number` em `VolService`.

### 3. UI — exibir o badge

**`src/pages/ministerial/voluntariado/VolDashboard.tsx`**:
- Importar `Users` de `lucide-react`.
- Em cada card de culto (Cultos de Hoje e Próximos Cultos), abaixo do `service_type_name`, renderizar:
  ```jsx
  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
    <Users className="h-3 w-3" />
    {svc.scheduled_count > 0 ? `${svc.scheduled_count} escalados` : 'Sem escala'}
  </p>
  ```

## Sem mudanças

- Banco de dados (apenas leitura agregada).
- API client (`src/api.js`) — endpoints já existentes, só ganham um campo na resposta.
- Outros consumidores de `useTodaysServices` / `useUpcomingServices` continuam funcionando (campo é opcional).

## Risco

Mínimo. Uma query extra leve por chamada (limitada aos IDs já carregados). Se a contagem falhar por qualquer motivo, retornamos `scheduled_count: 0` e o card mostra "Sem escala" — sem quebrar a tela.

