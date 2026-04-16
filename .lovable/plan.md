

## Plan: Diferenciar cards Voluntariado vs Membresia + logo no check-in

### Resumo
Trocar as cores dos cards de QR Code para distinguir visualmente voluntariado (azul escuro `#408097`) e membresia (bege `#eae3da`), e adicionar a logo CBRio no overlay de check-in.

### Mudancas

**1. `QrCodeModal.tsx` (voluntariado) — cor azul escuro**
- Trocar `bg-[#00B39D]` para `bg-[#408097]`
- Canvas `handleDownload`: trocar `fillStyle: '#00B39D'` para `'#408097'`
- Badge pill: manter texto "VOLUNTARIO" mas com destaque mais visivel (bg-white/20)

**2. `MemberWalletPass.tsx` (membresia) — cor bege**
- Trocar `bg-[#00B39D]` para `bg-[#eae3da]`
- Textos: trocar de branco para escuro (`text-[#408097]`) pois o fundo bege e claro
- Badge pill "Membro": fundo `bg-[#408097]/15` com texto `text-[#408097]`
- Footer icons: opacidade com cor escura em vez de branca
- Spinner de loading: trocar cor teal para `#408097`

**3. `SuccessOverlay.tsx` (check-in) — adicionar logo CBRio**
- Adicionar `<img src="/logo-cbrio-icon.png">` acima do icone de check (ou abaixo do titulo)
- Texto "CBRio" com fonte iBrand ao lado do logo, no mesmo padrao dos cards

### Arquivos modificados
- `src/pages/ministerial/voluntariado/components/qrcodes/QrCodeModal.tsx`
- `src/components/membresia/MemberWalletPass.tsx`
- `src/pages/ministerial/voluntariado/components/checkin/SuccessOverlay.tsx`

