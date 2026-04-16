

## Plan: Logo coracao oficial + fonte iBrand nos cards wallet

### Resumo
Substituir o SVG de coracao "stroke" pelo PNG oficial (`logo-cbrio-icon.png`) e registrar a fonte iBrand para o texto "CBRio" nos cards de QR Code (voluntario e membro).

### Mudancas

**1. Copiar fonte iBrand para o projeto**
- Copiar `user-uploads://ibrand.otf` para `public/fonts/ibrand.otf`

**2. Registrar @font-face em `src/index.css`**
```css
@font-face {
  font-family: 'iBrand';
  src: url('/fonts/ibrand.otf') format('opentype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```

**3. Atualizar `QrCodeModal.tsx`**
- Remover componente `CbrioLogo` SVG
- Substituir por `<img src="/logo-cbrio-icon.png">` (coracao preenchido oficial)
- Aplicar `font-family: 'iBrand'` no texto "CBRio" via style inline
- Atualizar o `handleDownload` (canvas) para carregar a fonte iBrand e a imagem PNG do logo antes de desenhar

**4. Atualizar `MemberWalletPass.tsx`**
- Mesma substituicao: remover `CbrioLogo` SVG, usar `<img src="/logo-cbrio-icon.png">`
- Aplicar fonte iBrand no texto "CBRio" via style inline

### Arquivos modificados
- `public/fonts/ibrand.otf` — novo (fonte)
- `src/index.css` — adicionar @font-face
- `src/pages/ministerial/voluntariado/components/qrcodes/QrCodeModal.tsx`
- `src/components/membresia/MemberWalletPass.tsx`

