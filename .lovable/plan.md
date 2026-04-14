

## Plan: Add geometric shape animation to login page

### Summary
Add the KokonutUI "Shape Landing Hero" animation to the login page background, adapted to CBRio's identity (teal `#00B39D` palette). The animation will play on page load with floating geometric shapes and fade-in effects, replacing the current WebGL smokey background.

### What will change

1. **Create `src/components/ui/shape-landing-hero.tsx`**
   - Port the HeroGeometric component with ElegantShape sub-component
   - Uses `framer-motion` (already installed) and `lucide-react` (already installed)
   - Adapt colors: replace white/indigo gradients with CBRio teal (`#00B39D` / `#00736B`) tones
   - Dark background matching current login aesthetic (`#0a0a0a` / dark theme)

2. **Update `src/pages/Login.jsx`**
   - Remove the `SmokeyBackground` WebGL component (canvas shader)
   - Remove all shader code (`vertexSource`, `fragmentSource`, `SmokeyBackground` function)
   - Import and render the geometric shapes animation as the background layer behind the login card
   - The animation plays automatically on page load
   - Login form card remains centered on top with the glassmorphism style

### Visual result
- On entering `/login`, animated geometric rounded-rectangle shapes float in from edges with rotation and blur effects
- Shapes use CBRio teal gradients instead of the original white/indigo
- The login card fades in on top with the existing glassmorphism design
- Interactive mouse hover on the WebGL canvas is removed (the new animation is CSS/framer-motion based)

### Technical details
- No new dependencies needed (`framer-motion` and `lucide-react` already in `package.json`)
- No database changes
- Files modified: `src/pages/Login.jsx`
- Files created: `src/components/ui/shape-landing-hero.tsx`

