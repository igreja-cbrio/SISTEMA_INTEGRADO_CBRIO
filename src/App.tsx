import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { lazy, Suspense } from 'react';
import AppShell from './components/layout/AppShell';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Perfil = lazy(() => import('./pages/Perfil'));
const NotFound = lazy(() => import('./pages/NotFound'));

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
        <Route path="/eventos/:id" element={<PlaceholderPage title="Detalhe do Evento" />} />
        <Route path="/projetos" element={<PlaceholderPage title="Projetos" />} />
        <Route path="/expansao" element={<PlaceholderPage title="Expansão" />} />
        <Route path="/admin/rh" element={<PlaceholderPage title="Recursos Humanos" />} />
        <Route path="/admin/financeiro" element={<PlaceholderPage title="Financeiro" />} />
        <Route path="/admin/logistica" element={<PlaceholderPage title="Logística" />} />
        <Route path="/admin/patrimonio" element={<PlaceholderPage title="Patrimônio" />} />
        <Route path="/ministerial/membresia" element={<PlaceholderPage title="Membresia" />} />
        <Route path="/assistente-ia" element={<PlaceholderPage title="Assistente IA" />} />
        <Route path="/solicitar-compra" element={<PlaceholderPage title="Solicitar Compra" />} />
        <Route path="/admin/notificacao-regras" element={<PlaceholderPage title="Regras de Notificação" />} />
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
