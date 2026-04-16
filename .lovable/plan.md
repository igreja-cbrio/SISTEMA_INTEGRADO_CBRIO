

## Plan: Estilizar MemberWalletDialog com cantos arredondados e layout de card

### Resumo
Aplicar o mesmo padrao visual dos wallet cards (cantos arredondados, inputs estilizados) ao dialog de "Meu QR de membro", melhorando a aparencia no mobile.

### Mudancas

**Arquivo: `src/components/membresia/MemberWalletDialog.tsx`**

- Adicionar `rounded-3xl` ao `DialogContent` (override do `sm:rounded-lg` padrao)
- Inputs com `rounded-xl` para consistencia visual
- Botao "Gerar meu QR" com `rounded-xl`
- Padding mais generoso (`p-6`)
- Icone do titulo trocar para logo CBRio (`/logo-cbrio-icon.png`) + texto com fonte iBrand, no mesmo padrao dos cards

### Arquivo modificado
- `src/components/membresia/MemberWalletDialog.tsx`

