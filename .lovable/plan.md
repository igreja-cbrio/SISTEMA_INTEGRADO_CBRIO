

## Mapa de Grupos com MapLibre, lista lateral e modo Totem

### Objetivo
Substituir o mapa Leaflet atual por um mapa MapLibre com layout moderno (estilo Carto), lista lateral de grupos clicável que centraliza o marcador, controles flutuantes e toggle dark/light. Aplicar nas duas telas: `/grupos` (admin) e `/totem → Grupos de Conexão` (kiosk para membros).

### Arquitetura

```text
src/components/ui/map.tsx         ← componente base MapLibre (novo)
                                    adaptado ao ThemeContext (sem next-themes)

src/components/grupos/
  GruposMapView.tsx               ← view reutilizável: mapa + lista lateral + 
                                    toggle de tema + controles + popups

src/pages/ministerial/Grupos.jsx  ← nova aba "Mapa" usa <GruposMapView />
src/pages/TotemMembro.tsx         ← GruposFlow usa <GruposMapView /> em vez 
                                    de Leaflet, sempre dark, com lista lateral
                                    colapsável (kiosk-friendly)
```

### Etapa 1 — Componente base `map.tsx`
- Instalar `maplibre-gl` (CSS + JS).
- Implementar `Map`, `MapMarker`, `MapPopup`, `MapControls`, `useMap` conforme o snippet do 21st.dev, com **uma adaptação**: substituir `useTheme` de `next-themes` por um hook interno que aceita `theme?: 'light' | 'dark'` via prop **ou** lê do `ThemeContext` existente (`useTheme` de `src/contexts/ThemeContext.jsx`). Isso evita instalar `next-themes` e mantém uma só fonte de verdade.
- Estilos padrão: Carto `dark-matter` e `positron` (já são gratuitos, sem API key).
- Respeitar paleta CBRio nos botões/controles (`#00B39D`).

### Etapa 2 — `GruposMapView` (componente compartilhado)
Props:
```ts
{
  grupos: Grupo[];               // com lat/lng
  memberCoords?: {lat,lng};      // opcional (totem)
  onGroupSelect?: (g) => void;   // botão "participar" no totem
  variant: 'admin' | 'kiosk';    // ajusta header e ações
  defaultTheme?: 'light'|'dark'; // kiosk começa dark
}
```
Estrutura:
- Layout em duas colunas (desktop): **lista lateral 320px** (esquerda) + **mapa flex-1** (direita). No mobile/totem retrato a lista vira drawer/sheet colapsável.
- Cada item da lista mostra nome, líder, dia/horário, local, distância (se houver) e categoria.
- Ao clicar num item: `map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 })` e abre o popup do marcador.
- Marcadores customizados em SVG (cor `#00B39D`, marker do membro em azul).
- Filtros de categoria (chips) acima da lista, busca por nome no topo.
- Botão flutuante no topo direito do mapa: **toggle dark/light** (ícone Sun/Moon) — controla apenas o tema do mapa, não o app.
- `MapControls`: zoom, locate (para o totem), fullscreen.

### Etapa 3 — Integração em `/grupos` (admin)
- No `Grupos.jsx`, adicionar nova aba `"mapa"` ao lado de `"grupos"` e `"materiais"` (já existe `pageTab`).
- Renderizar `<GruposMapView grupos={gruposList} variant="admin" />`.
- Filtra apenas grupos com `lat && lng`. Aviso quando há grupos sem coordenadas, com link para editar.

### Etapa 4 — Integração no Totem do Membro
- Em `TotemMembro.tsx → GruposFlow`, **remover** o bloco Leaflet (imports, makePin, MapContainer/TileLayer).
- Substituir por `<GruposMapView grupos={filtered} memberCoords={memberCoords} variant="kiosk" defaultTheme="dark" onGroupSelect={(g) => setSelected(g)} />`.
- O toggle de view "Mapa/Lista" do totem é mantido — quando "Mapa", usa `GruposMapView` que **já tem lista lateral**. Em telas verticais de totem, a lista lateral pode ser fechada/aberta com botão chevron.
- Toggle dark/light fica no canto do mapa, acessível ao membro.

### Etapa 5 — Permissões e roteamento
- Sem mudanças. A aba "Mapa" em `/grupos` herda o `ModuleGuard permKey="canMembresia"`.
- A rota `/totem` continua protegida. O modo kiosk em si **já é a rota /totem**; não preciso criar nova rota — apenas o componente respeita o estilo fullscreen.

### Etapa 6 — Banco de dados
**Sem migração.** As colunas `lat` e `lng` já existem na `mem_grupos` (usadas no formulário de edição com geocoding por CEP) e o backend já as retorna.

### Dependências a instalar
- `maplibre-gl` (engine do mapa, ~200KB gz)
- CSS importado em `src/index.css` ou no próprio componente

### Detalhes técnicos
- **ThemeContext**: o componente `Map` aceitará `theme` controlado via prop. `GruposMapView` mantém um state local independente do tema do app, permitindo o usuário do totem alternar mapa dark/light sem alterar o tema do app.
- **Performance**: marcadores via `MapMarker` com portal — OK até ~500 grupos. Acima disso considerar clustering futuramente.
- **SSR/Hydration**: o `Map` só monta após `isMounted=true` para evitar problemas (já no snippet original).
- **Cleanup**: `useEffect` retorna `mapInstance.remove()` ao desmontar.

### Riscos e mitigações
- **Bundle size**: MapLibre adiciona ~200KB gz. Aceitável e o módulo é lazy-loaded.
- **Estilos Carto offline**: dependem de internet; em produção do totem isso já é assumido (Leaflet também depende). Sem mudança operacional.
- **Coordenadas faltantes**: muitos grupos podem não ter `lat/lng`. UI mostra contador "X de Y grupos no mapa" + CTA para o admin completar.

### Entregáveis
1. `src/components/ui/map.tsx` — componente base MapLibre adaptado ao ThemeContext.
2. `src/components/grupos/GruposMapView.tsx` — view com lista lateral + controles + toggle tema.
3. `src/pages/ministerial/Grupos.jsx` — nova aba "Mapa".
4. `src/pages/TotemMembro.tsx` — `GruposFlow` migrado para o novo componente; remoção do Leaflet local.
5. Atualização de `package.json` com `maplibre-gl`.

