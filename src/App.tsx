import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { lazy, Suspense } from 'react';
import AppShell from './components/layout/AppShell';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Perfil = lazy(() => import('./pages/Perfil'));
const NotFound = lazy(() => import('./pages/NotFound'));
const SolicitarCompra = lazy(() => import('./pages/SolicitarCompra'));
const NotificacaoRegras = lazy(() => import('./pages/admin/NotificacaoRegras'));
const Membresia = lazy(() => import('./pages/ministerial/Membresia'));
const AssistenteIA = lazy(() => import('./pages/admin/AssistenteIA'));
const EventDetail = lazy(() => import('./pages/eventos/EventDetail'));

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
        <Route path="/planejamento" element={<PlaceholderPage title="Planejamento" />} />
        <Route path="/eventos" element={<PlaceholderPage title="Eventos" />} />
        <Route path="/eventos/:id" element={<Suspense fallback={<Loading />}><EventDetail /></Suspense>} />
        <Route path="/projetos" element={<PlaceholderPage title="Projetos" />} />
        <Route path="/expansao" element={<PlaceholderPage title="Expansão" />} />
        <Route path="/admin/rh" element={<PlaceholderPage title="Recursos Humanos" />} />
        <Route path="/admin/financeiro" element={<PlaceholderPage title="Financeiro" />} />
        <Route path="/admin/logistica" element={<PlaceholderPage title="Logística" />} />
        <Route path="/admin/patrimonio" element={<PlaceholderPage title="Patrimônio" />} />
        <Route path="/ministerial/membresia" element={<Suspense fallback={<Loading />}><Membresia /></Suspense>} />
        <Route path="/assistente-ia" element={<Suspense fallback={<Loading />}><AssistenteIA /></Suspense>} />
        <Route path="/solicitar-compra" element={<Suspense fallback={<Loading />}><SolicitarCompra /></Suspense>} />
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
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
