

## Plan: Ajustar badges Apple/Google Wallet para proporcoes e cores oficiais

### Problema atual
Os badges SVG atuais tem proporcoes incorretas (280x44 viewBox), icones simplificados que nao correspondem aos oficiais, e o icone do Apple Wallet e uma aproximacao generica com retangulos coloridos.

### Mudancas

**Arquivo: `src/components/ui/wallet-buttons.tsx`**

1. **Apple Wallet Badge** — Corrigir para proporcoes oficiais HIG:
   - ViewBox: `0 0 187 56` (aspect ratio ~3.34:1, conforme badge oficial Apple)
   - Fundo preto com borda arredondada (`rx=6`)
   - Icone Wallet oficial: stack de 3 cards coloridos (vermelho `#FC3D3A`, amarelo `#F5A623`, verde `#4CD964`, azul `#5AC8FA`) com bordas arredondadas
   - Texto em 2 linhas: "Adicionar ao" (fontSize 10, regular) + "Apple Wallet" (fontSize 16, semibold)
   - Fonte: `-apple-system, SF Pro Text` / `SF Pro Display`

2. **Google Wallet Badge** — Corrigir proporcoes e icone:
   - Mesmo viewBox `0 0 187 56`
   - Icone Google "G" multicolorido oficial (4 cores: azul `#4285F4`, vermelho `#EA4335`, amarelo `#FBBC04`, verde `#34A853`)
   - Texto: "Adicionar ao" + "Google Wallet"

3. **Botoes wrapper** — Ajustar `min-h-[56px]` para corresponder a nova proporcao, `max-w-[240px]` para nao esticar demais em containers largos

### Arquivos modificados
- `src/components/ui/wallet-buttons.tsx` — unico arquivo

