

## Fix: Card "Férias Próximas" não reflete férias em andamento

### Problema
A query do dashboard de RH filtra férias com `data_inicio >= hoje`, o que ignora férias que já começaram mas ainda estão em vigor (ex: férias de 01/04 a 15/04 não aparecem no dia 13/04 porque `data_inicio` já passou).

### Solução
Alterar a query no backend para mostrar férias cujo período ainda esteja ativo ou prestes a iniciar nos próximos 30 dias:
- Trocar `.gte('data_inicio', hoje)` por `.gte('data_fim', hoje)` — garante que férias em andamento apareçam
- Manter `.lte('data_inicio', em30)` — limita a férias que começam em até 30 dias

Isso captura tanto férias em andamento quanto as que vão iniciar nos próximos 30 dias.

### Arquivo modificado
- `backend/routes/rh.js` — linha 44: `.gte('data_inicio', hoje)` → `.gte('data_fim', hoje)`

