

## Atualizar cards KPI da Membresia para o estilo do RH

### Problema
Os cards KPI da Membresia usam estilo inline simples (borda esquerda colorida, sem ícone). O usuário quer que sigam o mesmo padrão visual do dashboard de RH, que usa o componente `StatisticsCard` com ícone no canto superior direito.

### Solução
Substituir o bloco de KPIs (linhas 323-336 do `Membresia.jsx`) pelo componente `StatisticsCard` já existente, adicionando ícones relevantes para cada métrica:

- **Total Membros** — ícone `Users`, cor primary (`#00B39D`)
- **Membros Ativos** — ícone `Users`, cor green (`#10b981`)
- **Visitantes** — ícone `UserPlus`, cor blue (`#3b82f6`)
- **Famílias** — ícone `Home`, cor amber (`#f59e0b`)

### Arquivo modificado
- **`src/pages/ministerial/Membresia.jsx`**:
  - Importar `StatisticsCard` de `@/components/ui/statistics-card`
  - Substituir o grid de cards inline pelo componente `StatisticsCard` com `grid-cols-4`

