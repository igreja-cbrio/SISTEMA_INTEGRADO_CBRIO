

## Fix: Card "Férias Próximas" — mostrar apenas férias futuras (próximos 30 dias)

### Problema
A alteração anterior mudou o filtro para `.gte('data_fim', hoje)`, o que inclui férias já em andamento. O usuário quer ver apenas férias que **vão começar** nos próximos 30 dias.

### Solução
No `backend/routes/rh.js`, reverter para filtrar por `data_inicio`:
- `.gte('data_inicio', hoje)` — férias que começam hoje ou no futuro
- `.lte('data_inicio', em30)` — dentro dos próximos 30 dias
- Remover o filtro `.eq('status', 'aprovado')` e usar `.in('status', ['pendente', 'aprovado'])` para incluir férias agendadas ainda pendentes de aprovação (que é o que aparece na aba de férias)

### Arquivo modificado
- **`backend/routes/rh.js`** — linhas 43-47: atualizar a query de `feriasProximas`

```javascript
const { data: feriasProximas } = await supabase
  .from('rh_ferias_licencas')
  .select('*, rh_funcionarios(nome)')
  .in('status', ['pendente', 'aprovado'])
  .gte('data_inicio', hoje)
  .lte('data_inicio', em30)
  .order('data_inicio');
```

