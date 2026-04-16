

## Plan: Criar icones personalizados para "Adicionar na tela de inicio"

### Problema
Quando o usuario adiciona o site na tela de inicio do celular (via "Adicionar a Tela de Inicio" do Safari/Chrome), ambas as paginas — Checkin Voluntariado e Membresia — mostram o mesmo icone generico "C" preto, sem identidade visual.

### Solucao

Criar dois icones PNG distintos (192x192 e 512x512) usando o coracao CBRio como base, e implementar troca dinamica do `apple-touch-icon` e titulo baseado na rota atual.

**1. Gerar icones via script Python (Pillow)**

- **Checkin Voluntariado**: fundo azul (`#408097`), coracao branco, texto "V" sutil
- **Membresia**: fundo bege (`#eae3da`), coracao teal (`#3E7E8E`), texto "M" sutil

Ambos com cantos arredondados no estilo iOS. Gerar em 180x180 (apple-touch-icon) e 192x192 + 512x512 (manifest).

Arquivos gerados:
- `public/icons/checkin-180.png`, `public/icons/checkin-192.png`, `public/icons/checkin-512.png`
- `public/icons/membresia-180.png`, `public/icons/membresia-192.png`, `public/icons/membresia-512.png`

**2. Criar `public/manifest-checkin.json` e `public/manifest-membresia.json`**

Cada manifest com nome, icones e start_url diferentes:
- Checkin: `start_url: "/voluntariado/checkin"`, `name: "Check-in CBRio"`
- Membresia: `start_url: "/cadastro-membresia"`, `name: "Membresia CBRio"`

**3. Atualizar `index.html`**

Adicionar `apple-touch-icon` padrao (o logo CBRio existente) e um `<link rel="manifest">` padrao.

**4. Criar hook `useHomeScreenMeta` em `src/hooks/useHomeScreenMeta.ts`**

Detecta a rota atual e dinamicamente:
- Troca o `<link rel="apple-touch-icon">` para o icone correto
- Troca o `<link rel="manifest">` para o manifest correto
- Atualiza `<title>` e `<meta name="apple-mobile-web-app-title">`

**5. Chamar o hook nas paginas publicas relevantes**

- `src/pages/ministerial/voluntariado/index.tsx` e `VolSelfCheckin.tsx` → icone checkin
- `src/pages/public/CadastroMembresia.jsx` → icone membresia

### Arquivos modificados/criados
- `public/icons/` — 6 PNGs gerados via script
- `public/manifest-checkin.json` — manifest PWA do checkin
- `public/manifest-membresia.json` — manifest PWA da membresia
- `index.html` — meta tags base (apple-touch-icon, apple-mobile-web-app-capable)
- `src/hooks/useHomeScreenMeta.ts` — hook para trocar icone/manifest por rota
- `src/pages/ministerial/voluntariado/index.tsx` — chamar hook
- `src/pages/ministerial/voluntariado/VolSelfCheckin.tsx` — chamar hook
- `src/pages/public/CadastroMembresia.jsx` — chamar hook

