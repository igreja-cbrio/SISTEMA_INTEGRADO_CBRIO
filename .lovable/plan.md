

## Plano: Copiar Frontend do CRM CBRio para o Lovable

### Visão Geral
Copiar todo o frontend do repositório `igreja-cbrio/crmcbrio` (pasta `frontend/`) para este projeto Lovable, adaptando para funcionar com Tailwind CSS v3 (o Lovable não suporta v4). O backend Express permanece no Vercel — as chamadas de API serão redirecionadas para a URL do Vercel.

### Inventário de Arquivos (~50+ arquivos)

**Configuração:**
- `package.json` (ajustar dependências)
- `vite.config.ts` (remover @tailwindcss/vite, usar PostCSS)
- `index.html`
- `tsconfig.json`

**Core:**
- `src/main.tsx`
- `src/App.jsx`
- `src/api.js` (ajustar base URL para Vercel)
- `src/supabaseClient.js`
- `src/index.css` (migrar Tailwind v4 → v3)

**Contexts:**
- `src/contexts/AuthContext.jsx`
- `src/contexts/ThemeContext.jsx`

**Lib:**
- `src/lib/utils.ts`
- `src/lib/theme.ts`
- `src/lib/export.js`

**Components UI (~18 arquivos):**
- avatar, badge, button, calendar, card, command-search, dialog, dropdown-menu, empty-state, input, label, loading-spinner, mega-menu, modern-side-bar, number-ticker, scroll-area, select, separator, skeleton, statistics-card, status-badge, switch, table, tabs

**Layout:**
- `src/components/layout/AppShell.jsx`

**Pages (~15+ arquivos):**
- Dashboard, Login, Perfil, Expansão, Planejamento, Projetos, SolicitarCompra
- `admin/`: AssistenteIA, NotificacaoRegras
- `admin/rh/`, `admin/financeiro/`, `admin/logistica/`, `admin/patrimonio/`
- `eventos/` + `eventos/components/`
- `ministerial/`

**Assets:**
- `public/images/` (logo SVG)

### Adaptações Necessárias

1. **Tailwind v4 → v3**: Converter `@import "tailwindcss"` para `@tailwind base/components/utilities`, mover tema para `tailwind.config.ts`
2. **API Base URL**: Configurar `api.js` para apontar para `https://crmcbrio.vercel.app/api` (ou a URL real do Vercel)
3. **Variáveis de ambiente**: Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nos secrets do Lovable
4. **Dependências**: Instalar framer-motion, react-day-picker, cmdk, e outros pacotes usados

### Estratégia de Execução (em várias mensagens)

**Fase 1**: Configuração base — package.json, vite.config, tailwind.config, index.css, index.html
**Fase 2**: Core — main.tsx, supabaseClient, api.js, contexts (Auth + Theme)  
**Fase 3**: UI Components — todos os 18+ componentes da pasta ui/
**Fase 4**: Layout — AppShell + mega-menu + modern-side-bar
**Fase 5**: Pages — Dashboard, Login, Perfil e páginas simples
**Fase 6**: Módulos Admin — RH, Financeiro, Logística, Patrimônio
**Fase 7**: Módulos Eventos/Projetos — Eventos + componentes, Projetos, Planejamento, Expansão
**Fase 8**: Testes e ajustes — verificar se tudo compila e as chamadas à API funcionam

> ⚠️ **Importante**: Você precisará configurar os secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) no Lovable e informar a URL base da API no Vercel para que o app funcione de verdade.

