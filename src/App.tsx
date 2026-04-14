import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, Component } from 'react';
import type { ReactNode, ComponentType } from 'react';
import { Toaster } from 'sonner';
import AppShell from './components/layout/AppShell';
import Login from './pages/Login';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// ── Lazy loader com retry automático em caso de chunk load failure ──
// Quando há um novo deploy, o browser pode tentar carregar um chunk antigo
// que não existe mais, causando tela branca. Esta função tenta recarregar
// a página automaticamente na primeira falha para pegar os novos chunks.
function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const key = 'chunk-retry-' + factory.toString().slice(0, 50);
    try {
      return await factory();
    } catch (err: any) {
      const alreadyRetried = sessionStorage.getItem(key);
      const isChunkError = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(err?.message || '');
      if (isChunkError && !alreadyRetried) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return new Promise(() => {}); // Nunca resolve — página vai recarregar
      }
      throw err;
    }
  });
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    // Se for chunk load error, tenta recarregar automaticamente
    const isChunkError = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(error?.message || '');
    if (isChunkError && !sessionStorage.getItem('boundary-chunk-retry')) {
      sessionStorage.setItem('boundary-chunk-retry', '1');
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>Algo deu errado</h1>
          <p style={{ color: '#888' }}>{this.state.error?.message || 'Erro inesperado na aplicação.'}</p>
          <button onClick={() => { sessionStorage.clear(); window.location.reload(); }} style={{ padding: '8px 24px', borderRadius: 8, background: '#00B39D', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Perfil = lazyWithRetry(() => import('./pages/Perfil'));
const NotFound = lazyWithRetry(() => import('./pages/NotFound'));
const Solicitacoes = lazyWithRetry(() => import('./pages/Solicitacoes'));
const NotificacaoRegras = lazyWithRetry(() => import('./pages/admin/NotificacaoRegras'));
const Membresia = lazyWithRetry(() => import('./pages/ministerial/Membresia'));
const AssistenteIA = lazyWithRetry(() => import('./pages/admin/AssistenteIA'));
const EventDetail = lazyWithRetry(() => import('./pages/eventos/EventDetail'));
const Financeiro = lazyWithRetry(() => import('./pages/admin/financeiro/Financeiro'));
const Patrimonio = lazyWithRetry(() => import('./pages/admin/patrimonio/Patrimonio'));
const Expansao = lazyWithRetry(() => import('./pages/Expansao'));
const RH = lazyWithRetry(() => import('./pages/admin/rh/RH'));
const Logistica = lazyWithRetry(() => import('./pages/admin/logistica/Logistica'));
const Planejamento = lazyWithRetry(() => import('./pages/Planejamento'));
const Eventos = lazyWithRetry(() => import('./pages/eventos/Eventos'));
const Projetos = lazyWithRetry(() => import('./pages/Projetos'));
const Grupos = lazyWithRetry(() => import('./pages/ministerial/Grupos'));
const CadastroMembresia = lazyWithRetry(() => import('./pages/public/CadastroMembresia'));
const Voluntariado = lazyWithRetry(() => import('./pages/ministerial/voluntariado'));

// Placeholder pages for modules not yet copied
const PlaceholderPage = ({ title }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
    <h1 className="text-2xl font-bold text-foreground">{title}</h1>
    <p className="text-muted-foreground">Este módulo será carregado do backend.</p>
  </div>
);

const Loading = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      <p className="text-sm text-muted-foreground">Carregando...</p>
    </div>
  </div>
);

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/**
 * Guarda de módulo — verifica se o usuário tem permissão para acessar o módulo.
 * Se não tiver, redireciona para /dashboard.
 * permKey: chave de permissão ('canRH', 'canFinanceiro', etc.)
 */
function ModuleGuard({ permKey, children }: { permKey: string; children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) return <Loading />;

  const hasAccess = permKey ? auth[permKey] : true;
  if (hasAccess === false) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function DefaultRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />

      {/* Rota pública — sem AppShell, sem autenticação.
          Permite que visitantes enviem o formulário de cadastro de membresia. */}
      <Route path="/cadastro-membresia" element={<Suspense fallback={<Loading />}><CadastroMembresia /></Suspense>} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Suspense fallback={<Loading />}><Dashboard /></Suspense>} />
        <Route path="/perfil" element={<Suspense fallback={<Loading />}><Perfil /></Suspense>} />

        {/* Placeholder routes for modules */}
        <Route path="/planejamento" element={<Suspense fallback={<Loading />}><Planejamento /></Suspense>} />
        <Route path="/eventos" element={<ModuleGuard permKey="canAgenda"><Suspense fallback={<Loading />}><Eventos /></Suspense></ModuleGuard>} />
        <Route path="/eventos/:id" element={<ModuleGuard permKey="canAgenda"><Suspense fallback={<Loading />}><EventDetail /></Suspense></ModuleGuard>} />
        <Route path="/projetos" element={<ModuleGuard permKey="canProjetos"><Suspense fallback={<Loading />}><Projetos /></Suspense></ModuleGuard>} />
        <Route path="/expansao" element={<ModuleGuard permKey="canExpansao"><Suspense fallback={<Loading />}><Expansao /></Suspense></ModuleGuard>} />
        <Route path="/admin/rh" element={<ModuleGuard permKey="canRH"><Suspense fallback={<Loading />}><RH /></Suspense></ModuleGuard>} />
        <Route path="/admin/financeiro" element={<ModuleGuard permKey="canFinanceiro"><Suspense fallback={<Loading />}><Financeiro /></Suspense></ModuleGuard>} />
        <Route path="/admin/logistica" element={<ModuleGuard permKey="canLogistica"><Suspense fallback={<Loading />}><Logistica /></Suspense></ModuleGuard>} />
        <Route path="/admin/patrimonio" element={<ModuleGuard permKey="canPatrimonio"><Suspense fallback={<Loading />}><Patrimonio /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/membresia" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><Membresia /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/voluntariado/*" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><Voluntariado /></Suspense></ModuleGuard>} />
        <Route path="/grupos" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><Grupos /></Suspense></ModuleGuard>} />
        <Route path="/assistente-ia" element={<ModuleGuard permKey="canIA"><Suspense fallback={<Loading />}><AssistenteIA /></Suspense></ModuleGuard>} />
        <Route path="/solicitacoes" element={<Suspense fallback={<Loading />}><Solicitacoes /></Suspense>} />
        <Route path="/admin/notificacao-regras" element={<Suspense fallback={<Loading />}><NotificacaoRegras /></Suspense>} />
        <Route path="/ministerial/*" element={<PlaceholderPage title="Ministerial" />} />
        <Route path="/criativo/*" element={<PlaceholderPage title="Criativo" />} />

        <Route path="*" element={<Suspense fallback={<Loading />}><NotFound /></Suspense>} />
      </Route>

      <Route path="/" element={<DefaultRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
              <Toaster position="top-right" richColors />
            </BrowserRouter>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
