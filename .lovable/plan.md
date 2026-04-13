

## Correção: Erro "SelectItem value must not be empty string"

### Problema
O Radix UI Select não permite `<SelectItem value="">` — o valor precisa ser uma string não vazia. A migração dos selects nativos para o componente shadcn introduziu esse bug em vários lugares do RH.jsx.

### Solução
Substituir todos os `<SelectItem value="">` por `<SelectItem value="__all__">` / `<SelectItem value="__none__">` e ajustar a lógica de onChange para converter esses valores sentinela de volta para string vazia ou null conforme esperado.

### Locais afetados (todos em `src/pages/admin/rh/RH.jsx`)

1. **Filtro de status** (~linha 651): `value=""` → `value="__all__"`, ajustar handler
2. **Filtro de área** (~linha 660): `value=""` → `value="__all__"`, ajustar handler
3. **Setor no formulário** (~linha 1422): `value=""` → `value="__none__"`, ajustar handler
4. **Área no formulário** (~linha 1428): `value=""` → `value="__none__"`, ajustar handler
5. **Gestor Direto** (~linha 1445): `value=""` → `value="__none__"`, ajustar handler

Também será necessário atualizar o componente `FormSelect` para mapear `"__none__"` / `"__all__"` de volta para `""` no `onValueChange`, de forma transparente para o resto do código.

### Arquivos modificados
- `src/pages/admin/rh/RH.jsx`

