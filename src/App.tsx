import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
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
//
// Mensagens cobertas por navegador:
//   Chrome/Edge : "Failed to fetch dynamically imported module"
//   Firefox     : "error loading dynamically imported module"
//   Safari/iOS  : "Importing a module script failed" + "'text/html' is not a valid JavaScript MIME type"
//   Webpack     : "Loading chunk X failed" / "ChunkLoadError"
const CHUNK_ERROR_RE = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|valid JavaScript MIME type|Expected a JavaScript(?: \w+)? module script|Unexpected token '?<'?/i;

function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const key = 'chunk-retry-' + factory.toString().slice(0, 50);
    try {
      return await factory();
    } catch (err: any) {
      const alreadyRetried = sessionStorage.getItem(key);
      const isChunkError = CHUNK_ERROR_RE.test(err?.message || '');
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
    const isChunkError = CHUNK_ERROR_RE.test(error?.message || '');
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
const KpiAreasAdmin = lazyWithRetry(() => import('./pages/admin/KpiAreas'));
const MeusKpis = lazyWithRetry(() => import('./pages/MeusKpis'));
const Painel = lazyWithRetry(() => import('./pages/Painel'));
// /painel/kpi/:id removido na Fase 2.5F — agora detalhe abre como modal (KpiDetalheModal)
const PainelNsmPessoas = lazyWithRetry(() => import('./pages/PainelNsmPessoas'));
const EstruturaOkr = lazyWithRetry(() => import('./pages/admin/EstruturaOkr'));
const Ritual = lazyWithRetry(() => import('./pages/Ritual'));
const Gestao = lazyWithRetry(() => import('./pages/Gestao'));
const MinhaArea = lazyWithRetry(() => import('./pages/MinhaArea'));
const DadosBrutos = lazyWithRetry(() => import('./pages/DadosBrutos'));
const Membresia = lazyWithRetry(() => import('./pages/ministerial/Membresia'));
const MemberScan = lazyWithRetry(() => import('./pages/ministerial/membresia/MemberScan'));
const AssistenteIA = lazyWithRetry(() => import('./pages/admin/AssistenteIA'));
const EventDetail = lazyWithRetry(() => import('./pages/eventos/EventDetail'));
const Financeiro = lazyWithRetry(() => import('./pages/admin/financeiro/Financeiro'));
const Patrimonio = lazyWithRetry(() => import('./pages/admin/patrimonio/Patrimonio'));
const Expansao = lazyWithRetry(() => import('./pages/Expansao'));
const RevisaoEstrategica = lazyWithRetry(() => import('./pages/RevisaoEstrategica'));
const RevisaoDetalhe = lazyWithRetry(() => import('./pages/RevisaoDetalhe'));
const RH = lazyWithRetry(() => import('./pages/admin/rh/RH'));
const Logistica = lazyWithRetry(() => import('./pages/admin/logistica/Logistica'));
const Planejamento = lazyWithRetry(() => import('./pages/Planejamento'));
const Eventos = lazyWithRetry(() => import('./pages/eventos/Eventos'));
const Projetos = lazyWithRetry(() => import('./pages/Projetos'));
const Processos = lazyWithRetry(() => import('./pages/Processos'));
const Grupos = lazyWithRetry(() => import('./pages/ministerial/Grupos'));
const PedidosGrupo = lazyWithRetry(() => import('./pages/ministerial/PedidosGrupo'));
const CadastroMembresia = lazyWithRetry(() => import('./pages/public/CadastroMembresia'));
const InscricaoGrupos = lazyWithRetry(() => import('./pages/public/InscricaoGrupos'));
const InscricaoGruposQRCode = lazyWithRetry(() => import('./pages/admin/InscricaoGruposQRCode'));
const GruposGeocode = lazyWithRetry(() => import('./pages/admin/GruposGeocode'));
const WalletPage = lazyWithRetry(() => import('./pages/public/WalletPage'));
const Motion = lazyWithRetry(() => import('./pages/public/Motion'));
const Voluntariado = lazyWithRetry(() => import('./pages/ministerial/voluntariado'));
const VolTotem = lazyWithRetry(() => import('./pages/ministerial/voluntariado/VolTotem'));
const TotemMembro = lazyWithRetry(() => import('./pages/TotemMembro'));
const VolSelfCheckin = lazyWithRetry(() => import('./pages/ministerial/voluntariado/VolSelfCheckin'));
const PcCallback = lazyWithRetry(() => import('./pages/auth/PcCallback'));
const SpotifyCallback = lazyWithRetry(() => import('./pages/auth/SpotifyCallback'));
const Cuidados = lazyWithRetry(() => import('./pages/ministerial/Cuidados'));
const Integracao = lazyWithRetry(() => import('./pages/ministerial/Integracao'));
const Next = lazyWithRetry(() => import('./pages/ministerial/Next'));
// Jornada virou aba dentro de Membresia (componente MembersJornadaPanel).
// Mantido aqui apenas pra retrocompat de URL — redirect via Navigate.
const InscricaoNext = lazyWithRetry(() => import('./pages/public/InscricaoNext'));
// /admin/cultura, /kpis, /kpis/guia, /painel-kpis foram substituidos pelo /painel
// (Fase 2 do sistema OKR/NSM 2026). Redirects abaixo preservam URLs antigas.

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

function VoluntariadoGuard({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (auth.isVoluntario) return <>{children}</>;
  if (auth.canMembresia === false) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** Shell minimalista para voluntarios — so logo + nome + sair */
function VolunteerShell() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen" style={{ background: 'var(--cbrio-bg)' }}>
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-between h-14 px-4 md:px-6 max-w-[1800px] mx-auto">
          <div className="flex items-center gap-2">
            <img src="/logo-cbrio-text.png" alt="CBRio" className="h-7 object-contain" />
            <span className="text-sm font-medium text-muted-foreground">Voluntariado</span>
          </div>
          <div className="flex items-center gap-3">
            {profile?.name && <span className="text-sm text-foreground hidden sm:inline">{profile.name.split(' ')[0]}</span>}
            <button
              onClick={async () => { await signOut(); navigate('/login'); }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[1800px] mx-auto">
        <Outlet />
      </main>
    </div>
  );
}

function DefaultRedirect() {
  const { user, loading, isVoluntario } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (isVoluntario) return <Navigate to="/voluntariado/checkin" replace />;
  return <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  const { user, loading, isVoluntario } = useAuth();
  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={user ? (isVoluntario ? <Navigate to="/voluntariado/checkin" replace /> : <Navigate to="/dashboard" replace />) : <Login />} />

      {/* Rotas publicas */}
      <Route path="/cadastro-membresia" element={<Suspense fallback={<Loading />}><CadastroMembresia /></Suspense>} />
      <Route path="/inscricao-grupos" element={<Suspense fallback={<Loading />}><InscricaoGrupos /></Suspense>} />
      <Route path="/next" element={<Suspense fallback={<Loading />}><InscricaoNext /></Suspense>} />
      <Route path="/next/inscrever" element={<Suspense fallback={<Loading />}><InscricaoNext /></Suspense>} />
      <Route path="/wallet" element={<Suspense fallback={<Loading />}><WalletPage /></Suspense>} />
      <Route path="/motion" element={<Suspense fallback={<Loading />}><Motion /></Suspense>} />
      <Route path="/auth/pc-callback" element={<Suspense fallback={<Loading />}><PcCallback /></Suspense>} />
      <Route path="/spotify/callback" element={<Suspense fallback={<Loading />}><SpotifyCallback /></Suspense>} />

      {/* Totem — fullscreen, sem shell nenhum */}
      <Route path="/voluntariado/totem" element={<ProtectedRoute><Suspense fallback={<Loading />}><VolTotem /></Suspense></ProtectedRoute>} />
      <Route path="/totem" element={<ProtectedRoute><Suspense fallback={<Loading />}><TotemMembro /></Suspense></ProtectedRoute>} />

      {/* Self check-in — voluntario escaneia QR do totem com celular.
          Rota PUBLICA: se nao estiver autenticado, a propria pagina oferece
          cadastro via CPF (fluxo de registration / magic link). */}
      <Route path="/voluntariado/self-checkin" element={<Suspense fallback={<Loading />}><VolSelfCheckin /></Suspense>} />

      {/* ═══ Rotas do VOLUNTARIO — shell minimalista ═══ */}
      <Route element={<ProtectedRoute><VolunteerShell /></ProtectedRoute>}>
        <Route path="/voluntariado/checkin/*" element={<Suspense fallback={<Loading />}><Voluntariado /></Suspense>} />
        <Route path="/voluntariado/*" element={<Navigate to="/voluntariado/checkin" replace />} />
      </Route>

      {/* ═══ Rotas do STAFF — AppShell completo ═══ */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Suspense fallback={<Loading />}><Dashboard /></Suspense>} />
        <Route path="/perfil" element={<Suspense fallback={<Loading />}><Perfil /></Suspense>} />
        <Route path="/planejamento" element={<Suspense fallback={<Loading />}><Planejamento /></Suspense>} />
        <Route path="/eventos" element={<ModuleGuard permKey="canAgenda"><Suspense fallback={<Loading />}><Eventos /></Suspense></ModuleGuard>} />
        <Route path="/eventos/:id" element={<ModuleGuard permKey="canAgenda"><Suspense fallback={<Loading />}><EventDetail /></Suspense></ModuleGuard>} />
        <Route path="/projetos" element={<ModuleGuard permKey="canProjetos"><Suspense fallback={<Loading />}><Projetos /></Suspense></ModuleGuard>} />
        <Route path="/expansao" element={<ModuleGuard permKey="canExpansao"><Suspense fallback={<Loading />}><Expansao /></Suspense></ModuleGuard>} />
        <Route path="/revisao" element={<Suspense fallback={<Loading />}><RevisaoEstrategica /></Suspense>} />
        <Route path="/revisao/:tipo/:id" element={<Suspense fallback={<Loading />}><RevisaoDetalhe /></Suspense>} />
        <Route path="/processos" element={<ModuleGuard permKey="canProcessos"><Suspense fallback={<Loading />}><Processos /></Suspense></ModuleGuard>} />
        <Route path="/admin/rh" element={<ModuleGuard permKey="canRH"><Suspense fallback={<Loading />}><RH /></Suspense></ModuleGuard>} />
        <Route path="/admin/financeiro" element={<ModuleGuard permKey="canFinanceiro"><Suspense fallback={<Loading />}><Financeiro /></Suspense></ModuleGuard>} />
        <Route path="/admin/logistica" element={<ModuleGuard permKey="canLogistica"><Suspense fallback={<Loading />}><Logistica /></Suspense></ModuleGuard>} />
        <Route path="/admin/patrimonio" element={<ModuleGuard permKey="canPatrimonio"><Suspense fallback={<Loading />}><Patrimonio /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/membresia" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><Membresia /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/membresia/scan" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><MemberScan /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/voluntariado/*" element={<VoluntariadoGuard><Suspense fallback={<Loading />}><Voluntariado /></Suspense></VoluntariadoGuard>} />
        <Route path="/grupos" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><Grupos /></Suspense></ModuleGuard>} />
        <Route path="/grupos/pedidos" element={<Suspense fallback={<Loading />}><PedidosGrupo /></Suspense>} />
        <Route path="/ministerial/cuidados" element={<ModuleGuard permKey="canCuidados"><Suspense fallback={<Loading />}><Cuidados /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/jornada" element={<Navigate to="/ministerial/membresia" replace />} />
        <Route path="/ministerial/integracao" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><Integracao /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/next" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><Next /></Suspense></ModuleGuard>} />
        <Route path="/assistente-ia" element={<ModuleGuard permKey="canIA"><Suspense fallback={<Loading />}><AssistenteIA /></Suspense></ModuleGuard>} />
        <Route path="/solicitacoes" element={<Suspense fallback={<Loading />}><Solicitacoes /></Suspense>} />
        {/* Telas substituidas pelo /painel (Sistema OKR/NSM 2026 — Fase 2) */}
        <Route path="/kpis" element={<Navigate to="/painel" replace />} />
        <Route path="/kpis/guia" element={<Navigate to="/painel" replace />} />
        <Route path="/painel-kpis" element={<Navigate to="/painel" replace />} />
        <Route path="/admin/cultura" element={<Navigate to="/painel" replace />} />
        <Route path="/meus-kpis" element={<Navigate to="/minha-area" replace />} />
        <Route path="/painel" element={<Suspense fallback={<Loading />}><Painel /></Suspense>} />
        <Route path="/painel/kpi/:id" element={<Navigate to="/painel" replace />} />
        <Route path="/painel/nsm/pessoas" element={<Suspense fallback={<Loading />}><PainelNsmPessoas /></Suspense>} />
        <Route path="/admin/notificacao-regras" element={<Suspense fallback={<Loading />}><NotificacaoRegras /></Suspense>} />
        <Route path="/admin/kpi-areas" element={<Suspense fallback={<Loading />}><KpiAreasAdmin /></Suspense>} />
        <Route path="/admin/estrutura-okr" element={<Suspense fallback={<Loading />}><EstruturaOkr /></Suspense>} />
        <Route path="/ritual" element={<Suspense fallback={<Loading />}><Ritual /></Suspense>} />
        <Route path="/gestao" element={<Suspense fallback={<Loading />}><Gestao /></Suspense>} />
        <Route path="/minha-area" element={<Suspense fallback={<Loading />}><MinhaArea /></Suspense>} />
        <Route path="/dados-brutos" element={<Suspense fallback={<Loading />}><DadosBrutos /></Suspense>} />
        <Route path="/admin/grupos/qrcode-inscricao" element={<Suspense fallback={<Loading />}><InscricaoGruposQRCode /></Suspense>} />
        <Route path="/admin/grupos/geocode" element={<Suspense fallback={<Loading />}><GruposGeocode /></Suspense>} />
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
