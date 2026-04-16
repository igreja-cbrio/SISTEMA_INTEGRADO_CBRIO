

## Plan: Corrigir centralização do MemberWalletDialog no mobile com teclado aberto

### Problema
No mobile, quando o teclado abre (ao focar no input de CPF), o `DialogContent` usa `top: 50% + translate-y: -50%` relativo ao viewport fixo. O teclado reduz o viewport visível, mas o dialog não se ajusta, ficando cortado no topo.

### Solução
Trocar o posicionamento do `DialogContent` para usar `top-auto` com alinhamento seguro que respeite o viewport visível quando o teclado está aberto. A abordagem é usar classes que sobrescrevam o posicionamento padrão do dialog para usar `items-end` ou `items-center` com scroll seguro no mobile.

### Mudança

**Arquivo: `src/components/membresia/MemberWalletDialog.tsx`**

- No `DialogContent`, adicionar classes para sobrescrever o posicionamento fixo padrão:
  - `top-[50%]` → `max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0` (bottom sheet no mobile)
  - Ou alternativamente: usar `fixed inset-0 flex items-center justify-center` no overlay e tornar o content `relative` dentro de um container scrollável
- Abordagem mais simples e robusta: transformar em **bottom sheet** no mobile (o dialog sobe do fundo), que é o padrão iOS/Android para modais com input — o teclado simplesmente empurra o conteúdo visível para cima sem cortar nada
- No desktop mantém centralizado normalmente

Classes a adicionar no `DialogContent`:
```
max-sm:top-auto max-sm:bottom-4 max-sm:translate-y-0 max-sm:rounded-b-2xl
```

### Arquivo modificado
- `src/components/membresia/MemberWalletDialog.tsx`

