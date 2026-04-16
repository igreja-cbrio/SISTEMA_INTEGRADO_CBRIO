

## Plan: Implementar botoes oficiais Apple Wallet e Google Wallet (HIG-compliant)

### Resumo
Substituir os botoes genéricos de "Adicionar ao Apple/Google Wallet" por SVGs oficiais seguindo as Human Interface Guidelines da Apple e o branding do Google Wallet.

### O que muda

**1. Criar componente `AddToWalletButtons.tsx`** em `src/components/ui/`

Componente reutilizavel com:
- **Apple Wallet**: SVG oficial preto com icone do Wallet + texto "Add to Apple Wallet" (ou versao PT "Adicionar ao Apple Wallet"). Fundo preto, cantos arredondados, proporcoes conforme HIG (altura minima 44px, aspect ratio ~3.5:1).
- **Google Wallet**: SVG/botao oficial com logo Google Wallet colorido, fundo preto, texto "Add to Google Wallet". Segue as guidelines do Google Pay brand.
- Props: `onApple`, `onGoogle`, `appleBusy`, `googleBusy`, `showApple` (auto-detecta iOS)

**2. Atualizar `VolMeuPainel.tsx`** (linhas 123-148)
- Substituir os `<Button>` genericos pelo componente `AddToWalletButtons`
- Remover imports de `Apple`, `Wallet` do lucide

**3. Atualizar `MemberWalletPass.tsx`** (linhas 188-206)
- Mesmo: substituir botoes genericos pelo componente oficial
- Manter botao "Baixar imagem do QR" separado

### SVGs utilizados
- Apple Wallet: inline SVG reproduzindo o badge oficial (preto com icone wallet colorido + texto branco). Nao usaremos imagem externa — SVG inline garante qualidade em qualquer resolucao.
- Google Wallet: inline SVG com logo G colorido + texto "Add to Google Wallet" em fundo escuro.

### Arquivos
- `src/components/ui/wallet-buttons.tsx` — novo componente
- `src/pages/ministerial/voluntariado/VolMeuPainel.tsx` — usar novo componente
- `src/components/membresia/MemberWalletPass.tsx` — usar novo componente

