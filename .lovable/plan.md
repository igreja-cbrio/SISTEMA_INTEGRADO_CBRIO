

## Fix: Select dropdown não aparece dentro do Modal

### Problema
O Modal customizado usa `z-[1000]`, mas o `SelectContent` do Radix UI renderiza via portal no root do documento com `z-50`. O dropdown fica atrás do modal e não é visível.

### Solução
Adicionar `className="z-[1001]"` ao `SelectContent` dentro do `FormSelect`, para que o dropdown fique acima do modal.

### Arquivo modificado
- `src/pages/admin/rh/RH.jsx` — linha 113: alterar `<SelectContent>` para `<SelectContent className="z-[1001]">`

