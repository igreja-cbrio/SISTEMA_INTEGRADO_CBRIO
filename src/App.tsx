import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TutorialProvider } from './contexts/TutorialContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, Component, useEffect } from 'react';
import type { ReactNode, ComponentType } from 'react';
import { Toaster } from 'sonner';
import AppShell from './components/layout/AppShell';
import Login from './pages/Login';
import DemoAutoLogin from './pages/DemoAutoLogin';
import { DEMO_MODE } from './lib/demo';
import RedefinirSenha from './pages/RedefinirSenha';
import { CbrioLoader } from './components/ui/cbrio-loader';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Cache de 60s · trocar de aba/voltar mostra o dado em cache na hora
      // (revalida em background) em vez de recarregar do zero toda vez.
      staleTime: 60_000,
      // Mantém o dado em memória por 10 min depois de sair da tela.
      gcTime: 10 * 60_000,
    },
  },
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

// Conta tentativas via querystring (sobrevive ao reload, diferente de
// sessionStorage que ficava preso entre deploys consecutivos e impedia
// re-tentativas legítimas).
const RETRY_PARAM = '_chunk_retry';
const MAX_RETRIES = 3;

function getRetryCount(): number {
  try {
    const v = new URL(window.location.href).searchParams.get(RETRY_PARAM);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch { return 0; }
}

// Reload com cache-buster + limpeza de caches do browser/SW · usado quando
// um chunk lazy quebra (deploy novo invalidou o hash que o HTML em cache
// referência). Limpa tudo que pode estar segurando o HTML antigo.
let hardReloadFired = false;
async function hardReload() {
  if (hardReloadFired) return; // vários chunk errors ao mesmo tempo → 1 reload só
  hardReloadFired = true;
  const limpar = (async () => {
    try {
      // Limpa Cache Storage (PWA / fetch cache)
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // Desregistra Service Workers (re-registra no próximo load se necessário)
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      // Limpa flags antigos do retry baseado em sessionStorage (legado)
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('chunk-retry-') || k === 'boundary-chunk-retry')
        .forEach(k => sessionStorage.removeItem(k));
    } catch { /* ignora — vamos recarregar de qualquer jeito */ }
  })();
  // ⚠️ A limpeza NUNCA pode travar o reload: se caches.delete/getRegistrations
  // pendurar, o location.replace nunca rodava e a tela ficava PRETA pra sempre
  // (lazyWithRetry já retornou uma promise que nunca resolve). Timeout garante
  // que recarrega em ≤1.2s de qualquer jeito. 2026-06-30.
  try { await Promise.race([limpar, new Promise((r) => setTimeout(r, 1200))]); } catch { /* ignora */ }
  try {
    const url = new URL(window.location.href);
    const next = getRetryCount() + 1;
    url.searchParams.set(RETRY_PARAM, String(next));
    url.searchParams.set('_cb', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

// Chunk errors surgem muitas vezes FORA do ciclo de render do React — um import
// dinâmico que rejeita numa navegação, ou o <script>/<link> do chunk dando 404
// depois de um deploy novo (o HTML em cache aponta pra um hash que já não existe).
// Nesses casos o ErrorBoundary NÃO é acionado e a tela fica PRETA (o usuário tem
// que recarregar na mão). Handlers globais recuperam: detectam o erro de chunk e
// recarregam com cache-bust, respeitando o teto de retries. 2026-06-30.
if (typeof window !== 'undefined') {
  const recuperarSeChunk = (msg: string) => {
    if (CHUNK_ERROR_RE.test(msg || '') && getRetryCount() < MAX_RETRIES) hardReload();
  };
  // capture:true pega erro de CARREGAMENTO de recurso (<script>/<link>), que não borbulha
  window.addEventListener('error', (e: ErrorEvent) => {
    const alvo = e.target as (HTMLScriptElement & HTMLLinkElement) | null;
    const src = alvo ? (alvo.src || alvo.href || '') : '';
    if (src && /\/assets\/.*\.(js|mjs|css)(\?|$)/.test(src)) {
      if (getRetryCount() < MAX_RETRIES) hardReload();
      return;
    }
    recuperarSeChunk(e.message || e.error?.message || '');
  }, true);
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r: unknown = e.reason;
    recuperarSeChunk(typeof r === 'string' ? r : (r as Error)?.message || '');
  });
}

function lazyWithRetry<T extends ComponentType<Record<string, never>>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || '');
      const isChunkError = CHUNK_ERROR_RE.test(message);
      if (isChunkError && getRetryCount() < MAX_RETRIES) {
        hardReload();
        return new Promise<{ default: T }>(() => {}); // Nunca resolve — página vai recarregar
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
    // Se for chunk load error, tenta recarregar automaticamente (até MAX_RETRIES)
    const isChunkError = CHUNK_ERROR_RE.test(error?.message || '');
    if (isChunkError && getRetryCount() < MAX_RETRIES) {
      hardReload();
    }
  }
  render() {
    if (this.state.hasError) {
      const isChunkError = CHUNK_ERROR_RE.test(this.state.error?.message || '');
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>Algo deu errado</h1>
          {isChunkError ? (
            <>
              <p style={{ color: '#888', maxWidth: 480 }}>
                Houve uma atualizacao do sistema. Vamos limpar o cache e recarregar.
              </p>
              <button
                onClick={async () => {
                  // Forca limpeza total + remove o param de retry pra zerar o contador
                  try {
                    if ('caches' in window) {
                      const keys = await caches.keys();
                      await Promise.all(keys.map(k => caches.delete(k)));
                    }
                    if ('serviceWorker' in navigator) {
                      const regs = await navigator.serviceWorker.getRegistrations();
                      await Promise.all(regs.map(r => r.unregister()));
                    }
                  } catch {
                    // Ignora falhas de limpeza; o reload abaixo ainda recupera o app.
                  }
                  sessionStorage.clear();
                  // Limpa querystring (zera contador) e vai pra raiz
                  window.location.replace('/?_cb=' + Date.now());
                }}
                style={{ padding: '10px 28px', borderRadius: 8, background: '#00B39D', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                Limpar cache e recarregar
              </button>
              <p style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>
                Se o problema persistir: feche o navegador e abra de novo, ou use uma aba anonima.
              </p>
            </>
          ) : (
            <>
              <p style={{ color: '#888' }}>{this.state.error?.message || 'Erro inesperado na aplicação.'}</p>
              <button onClick={() => { sessionStorage.clear(); hardReload(); }} style={{ padding: '8px 24px', borderRadius: 8, background: '#00B39D', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Recarregar
              </button>
            </>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const DesignPreview = lazyWithRetry(() => import('./pages/DesignPreview'));
const Perfil = lazyWithRetry(() => import('./pages/Perfil'));
const MinhasTarefas = lazyWithRetry(() => import('./pages/MinhasTarefas'));
const NotFound = lazyWithRetry(() => import('./pages/NotFound'));
const Solicitacoes = lazyWithRetry(() => import('./pages/Solicitacoes'));
const NotificacaoRegras = lazyWithRetry(() => import('./pages/admin/NotificacaoRegras'));
const Destaques = lazyWithRetry(() => import('./pages/admin/Destaques'));
const FotosBatismo = lazyWithRetry(() => import('./pages/admin/FotosBatismo'));
const CruzamentosPessoas = lazyWithRetry(() => import('./pages/admin/CruzamentosPessoas'));
const SolicitacoesResponsaveis = lazyWithRetry(() => import('./pages/admin/SolicitacoesResponsaveis'));
const PermissoesAdmin = lazyWithRetry(() => import('./pages/admin/Permissoes'));
const WhatsappAdmin = lazyWithRetry(() => import('./pages/admin/Whatsapp'));
const FeedbackAdmin = lazyWithRetry(() => import('./pages/admin/Feedback'));
const AppAnalytics = lazyWithRetry(() => import('./pages/admin/AppAnalytics'));
const MeusKpis = lazyWithRetry(() => import('./pages/MeusKpis'));
const Painel = lazyWithRetry(() => import('./pages/Painel'));
// /painel/kpi/:id removido na Fase 2.5F — agora detalhe abre como modal (KpiDetalheModal)
const PainelNsmPessoas = lazyWithRetry(() => import('./pages/PainelNsmPessoas'));
const PainelJornada = lazyWithRetry(() => import('./pages/PainelJornada'));
const EstruturaOkr = lazyWithRetry(() => import('./pages/admin/EstruturaOkr'));
const Ritual = lazyWithRetry(() => import('./pages/Ritual'));
const Gestao = lazyWithRetry(() => import('./pages/Gestao'));
const MinhaArea = lazyWithRetry(() => import('./pages/MinhaArea'));
const DadosBrutos = lazyWithRetry(() => import('./pages/DadosBrutos'));
const DashboardSemanal = lazyWithRetry(() => import('./pages/DashboardSemanal'));
const MonitoramentoOkr = lazyWithRetry(() => import('./pages/MonitoramentoOkr'));
const Membresia = lazyWithRetry(() => import('./pages/ministerial/Membresia'));
const MemberScan = lazyWithRetry(() => import('./pages/ministerial/membresia/MemberScan'));
const ReconhecimentoFacial = lazyWithRetry(() => import('./pages/ministerial/reconhecimentoFacial/ReconhecimentoFacial'));
const Online = lazyWithRetry(() => import('./pages/ministerial/Online'));
const PainelKids = lazyWithRetry(() => import('./pages/ministerial/PainelKids'));
const PainelAmi = lazyWithRetry(() => import('./pages/ministerial/PainelAmi'));
const PainelBridge = lazyWithRetry(() => import('./pages/ministerial/PainelBridge'));
const TotemKidsCheckin = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsCheckin'));
const GestaoCriancas = lazyWithRetry(() => import('./pages/ministerial/totemKids/GestaoCriancas'));
const KidsHub = lazyWithRetry(() => import('./pages/ministerial/totemKids/KidsHub'));
const KidsFrequenciaPCO = lazyWithRetry(() => import('./pages/ministerial/totemKids/KidsFrequenciaPCO'));
const VoluntariosKids = lazyWithRetry(() => import('./pages/ministerial/totemKids/VoluntariosKids'));
const EstoqueKids = lazyWithRetry(() => import('./pages/ministerial/totemKids/EstoqueKids'));
const BatismosKids = lazyWithRetry(() => import('./pages/ministerial/totemKids/BatismosKids'));
const ApresentacaoCriancasKids = lazyWithRetry(() => import('./pages/ministerial/totemKids/ApresentacaoCriancas'));
const TotemKidsCheckout = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsCheckout'));
const TotemKidsPainel = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsPainel'));
const TotemKidsTesteEtiqueta = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsTesteEtiqueta'));
const TotemKidsDecisoes = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsDecisoes'));
const TotemKidsVinculos = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsVinculos'));
const TotemKidsParear = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsParear'));
const TotemKidsDisplaySala = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsDisplaySala'));
const TotemKidsDisplayFoyer = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsDisplayFoyer'));
const MarketingKanban = lazyWithRetry(() => import('./pages/marketing/MarketingKanban'));
const MarketingPlanner = lazyWithRetry(() => import('./pages/marketing/MarketingPlanner'));
const MarketingAdmin = lazyWithRetry(() => import('./pages/marketing/MarketingAdmin'));
const MarketingAnalytics = lazyWithRetry(() => import('./pages/marketing/MarketingAnalytics'));
const MarketingComunicados = lazyWithRetry(() => import('./pages/marketing/MarketingComunicados'));
const TotemKidsAdmin = lazyWithRetry(() => import('./pages/admin/totemKids/TotemKidsAdmin'));
const AssistenteIA = lazyWithRetry(() => import('./pages/admin/AssistenteIA'));
const EventDetail = lazyWithRetry(() => import('./pages/eventos/EventDetail'));
const Financeiro = lazyWithRetry(() => import('./pages/admin/financeiro/Financeiro'));
const Patrimonio = lazyWithRetry(() => import('./pages/admin/patrimonio/Patrimonio'));
const Expansao = lazyWithRetry(() => import('./pages/Expansao'));
const RevisaoEstrategica = lazyWithRetry(() => import('./pages/RevisaoEstrategica'));
const RevisaoDetalhe = lazyWithRetry(() => import('./pages/RevisaoDetalhe'));
const RH = lazyWithRetry(() => import('./pages/admin/rh/RH'));
const Logistica = lazyWithRetry(() => import('./pages/admin/logistica/Logistica'));
const GestaoAnual = lazyWithRetry(() => import('./pages/GestaoAnual'));
const Eventos = lazyWithRetry(() => import('./pages/eventos/Eventos'));
const Projetos = lazyWithRetry(() => import('./pages/Projetos'));
const Processos = lazyWithRetry(() => import('./pages/Processos'));
const Nps = lazyWithRetry(() => import('./pages/Nps'));
const NpsResponder = lazyWithRetry(() => import('./pages/nps/NpsResponder'));
const NpsPublica = lazyWithRetry(() => import('./pages/public/NpsPublica'));
const Grupos = lazyWithRetry(() => import('./pages/ministerial/Grupos'));
const GruposSupervisao = lazyWithRetry(() => import('./pages/ministerial/GruposSupervisao'));
const PedidosGrupo = lazyWithRetry(() => import('./pages/ministerial/PedidosGrupo'));
const CadastroMembresia = lazyWithRetry(() => import('./pages/public/CadastroMembresia'));
const InscricaoBatismo = lazyWithRetry(() => import('./pages/public/InscricaoBatismo'));
const BatismoAcesso = lazyWithRetry(() => import('./pages/public/BatismoAcesso'));
const ApresentacaoCriancasPublica = lazyWithRetry(() => import('./pages/public/ApresentacaoCriancas'));
const InscricaoGrupos = lazyWithRetry(() => import('./pages/public/InscricaoGrupos'));
const InscricaoGruposQRCode = lazyWithRetry(() => import('./pages/admin/InscricaoGruposQRCode'));
const GruposGeocode = lazyWithRetry(() => import('./pages/admin/GruposGeocode'));
const TemporadasGrupos = lazyWithRetry(() => import('./pages/admin/TemporadasGrupos'));
const WalletPage = lazyWithRetry(() => import('./pages/public/WalletPage'));
const Motion = lazyWithRetry(() => import('./pages/public/Motion'));
// /novosite · prévia interna do redesign do site público (cbrio.com.br).
// Pública, standalone, fora de qualquer menu. Conteúdo entra depois.
const NovoSite = lazyWithRetry(() => import('./pages/public/NovoSite'));
const QuemSomos = lazyWithRetry(() => import('./pages/public/QuemSomos'));
// /atlas · atlas operacional do sistema (manual + auditoria) · standalone, autenticado, fora do menu.
const Atlas = lazyWithRetry(() => import('./pages/atlas/Atlas'));
const Voluntariado = lazyWithRetry(() => import('./pages/ministerial/voluntariado'));
const VolTotem = lazyWithRetry(() => import('./pages/ministerial/voluntariado/VolTotem'));
const TotemMembro = lazyWithRetry(() => import('./pages/TotemMembro'));
const VolSelfCheckin = lazyWithRetry(() => import('./pages/ministerial/voluntariado/VolSelfCheckin'));
const PcCallback = lazyWithRetry(() => import('./pages/auth/PcCallback'));
const Cuidados = lazyWithRetry(() => import('./pages/ministerial/Cuidados'));
const DevocionalMovido = lazyWithRetry(() => import('./pages/devocional/DevocionalMovido'));
const Integracao = lazyWithRetry(() => import('./pages/ministerial/Integracao'));
const Batismo = lazyWithRetry(() => import('./pages/ministerial/Batismos'));
const WifiModulo = lazyWithRetry(() => import('./pages/ministerial/Wifi'));
const Producao = lazyWithRetry(() => import('./pages/ministerial/Producao'));
const ColetaCulto = lazyWithRetry(() => import('./pages/ministerial/coleta/ColetaCulto'));
const NextBatismo = lazyWithRetry(() => import('./pages/ministerial/NextBatismo'));
const Governanca = lazyWithRetry(() => import('./pages/governanca/Governanca'));
const GovernancaRitual = lazyWithRetry(() => import('./pages/governanca/RitualPage'));
// Jornada virou aba dentro de Membresia (componente MembersJornadaPanel).
// Mantido aqui apenas pra retrocompat de URL — redirect via Navigate.
const InscricaoNext = lazyWithRetry(() => import('./pages/public/InscricaoNext'));
const EventoExterno = lazyWithRetry(() => import('./pages/public/EventoExterno'));
const EventosExternos = lazyWithRetry(() => import('./pages/EventosExternos'));
const NextDirecionar = lazyWithRetry(() => import('./pages/public/NextDirecionar'));
const DecisaoOnline = lazyWithRetry(() => import('./pages/public/DecisaoOnline'));
const InscricaoVoluntariado = lazyWithRetry(() => import('./pages/public/InscricaoVoluntariado'));
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
    <CbrioLoader />
  </div>
);

function loginRedirectTarget() {
  if (typeof window === 'undefined') return '/login';
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hasAuthError = searchParams.has('error') || hashParams.has('error');
  return hasAuthError ? `/login${window.location.search}${window.location.hash}` : '/login';
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={loginRedirectTarget()} replace />;
  return children;
}

// Membros logados via magic link do devocional ficam restritos a /devocional/*.
// Tentativa de acessar qualquer outra rota colaborador redireciona pra /devocional/hoje.
function MemberOnlyRedirect({ children }: { children: ReactNode }) {
  const { isMembroOnly, loading } = useAuth();
  if (loading) return <Loading />;
  if (isMembroOnly) return <Navigate to="/devocional" replace />;
  return <>{children}</>;
}

/**
 * Guarda de módulo — verifica se o usuário tem permissão para acessar o módulo.
 * Se não tiver, redireciona para /dashboard.
 *
 * Duas formas de uso:
 *   - permKey: legado · usa hook canX (canRH, canFinanceiro, etc) com nivelMinimo=2
 *   - moduleSlug: novo · checa modulePerms[slug].leitura >= nivelMinimo (default 1)
 *     Permite liberar acesso de visualizacao (nível 1) sem cair no fallback canX.
 */
function ModuleGuard({ permKey, moduleSlug, nivelMinimo = 1, children }: { permKey?: string; moduleSlug?: string; nivelMinimo?: number; children: ReactNode }) {
  const auth = useAuth();
  const a = auth as Record<string, unknown>;

  // Autenticado mas perfil/permissões ainda NÃO hidrataram (carga lenta, falha
  // transitória do my-permissions, ou a rede de segurança de 8s soltou o loading
  // antes das permissões chegarem). Não dá pra decidir acesso com estado nulo →
  // NÃO expulsa pro dashboard achando "sem acesso" (isso tirava líderes de área
  // da própria tela · Arthur/Marcelo · 2026-07-01). Espera e dispara UMA recarga;
  // quando perfil+permissões chegam, o guard reavalia corretamente.
  const naoHidratou = !auth.loading && !!a.user && (a.profile == null || a.modulePerms == null);
  useEffect(() => {
    if (naoHidratou && typeof a.recarregarAuth === 'function') (a.recarregarAuth as () => void)();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naoHidratou]);

  if (auth.loading) return <Loading />;
  if (naoHidratou) return <Loading />;

  // Deny explícito de módulo (override nível 0) · vence até o bypass de admin.
  const PERM_SLUG: Record<string, string> = {
    canRH: 'rh', canFinanceiro: 'financeiro', canLogistica: 'logistica',
    canPatrimonio: 'patrimonio', canMembresia: 'membresia', canProjetos: 'projetos',
    canExpansao: 'expansao', canAgenda: 'eventos', canIA: 'assistente-ia', canCuidados: 'cuidados',
  };
  const slugAlvo = moduleSlug || (permKey ? PERM_SLUG[permKey] : undefined);
  const bloqueados = ((auth as Record<string, unknown>).modulosBloqueados as string[] | undefined) || [];
  if (slugAlvo && bloqueados.includes(slugAlvo)) return <Navigate to="/dashboard" replace />;

  if (auth.isAdmin) return <>{children}</>;

  if (moduleSlug) {
    const perm = auth.modulePerms?.[moduleSlug];
    const leitura = perm?.leitura ?? 0;
    if (leitura < nivelMinimo) return <Navigate to="/dashboard" replace />;
    return <>{children}</>;
  }

  // Legado · checa hook canX
  const hasAccess = permKey ? (auth as Record<string, unknown>)[permKey] : true;
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

/** Shell minimalista para voluntários — so logo + nome + sair */
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

// Home pós-login. Quem tem acesso a um ÚNICO módulo abre direto nele
// (ex.: colaborador só de Produção → /producao) em vez do dashboard.
// `moduloUnico` vem do AuthContext (canônico do backend · slugs deduplicados);
// contar por referência em modulePerms quebrava: o JSON da resposta duplica o
// objeto das chaves nome+slug e o Set vê 2 módulos pra quem tem só 1.
const HOME_MODULO_UNICO: Record<string, string> = {
  producao: '/producao',
  batismo: '/batismo',
  kids: '/ministerial/kids',
};
function homeRoute(auth: Record<string, unknown>): string {
  if (auth.rotaTravada) return auth.rotaTravada as string; // login travado num módulo (quiosque)
  if (auth.isMembroOnly) return '/devocional';
  if (auth.isVoluntario) return '/voluntariado/checkin';
  const moduloUnico = auth.moduloUnico as string | null | undefined;
  if (!auth.isAdmin && moduloUnico && HOME_MODULO_UNICO[moduloUnico]) {
    return HOME_MODULO_UNICO[moduloUnico];
  }
  return '/dashboard';
}

function DefaultRedirect() {
  const auth = useAuth();
  const { user, loading } = auth;
  if (loading) return <Loading />;
  // No ambiente demo, o link publico e a raiz · manda pro auto-login.
  if (!user && DEMO_MODE) return <Navigate to="/demo" replace />;
  if (!user) return <Navigate to={loginRedirectTarget()} replace />;
  return <Navigate to={homeRoute(auth as Record<string, unknown>)} replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={user ? <DefaultRedirect /> : <Login />} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />

      {/* Demonstracao · login automatico com usuario demo (so com VITE_DEMO_MODE) */}
      <Route path="/demo" element={<DemoAutoLogin />} />

      {/* Rotas publicas */}
      <Route path="/cadastro-membresia" element={<Suspense fallback={<Loading />}><CadastroMembresia /></Suspense>} />
      <Route path="/inscricao-batismo" element={<Suspense fallback={<Loading />}><InscricaoBatismo /></Suspense>} />
      {/* Acesso às fotos do batismo pelo QR da etiqueta do quiosque · token = credencial · sem login */}
      <Route path="/batismo/acesso" element={<Suspense fallback={<Loading />}><BatismoAcesso /></Suspense>} />
      <Route path="/apresentacao-criancas" element={<Suspense fallback={<Loading />}><ApresentacaoCriancasPublica /></Suspense>} />
      <Route path="/evento/:slug" element={<Suspense fallback={<Loading />}><EventoExterno /></Suspense>} />
      <Route path="/inscricao-grupos" element={<Suspense fallback={<Loading />}><InscricaoGrupos /></Suspense>} />
      <Route path="/next" element={<Suspense fallback={<Loading />}><InscricaoNext /></Suspense>} />
      <Route path="/next/inscrever" element={<Suspense fallback={<Loading />}><InscricaoNext /></Suspense>} />
      <Route path="/next/direcionar/:token" element={<Suspense fallback={<Loading />}><NextDirecionar /></Suspense>} />
      <Route path="/inscricao-voluntariado" element={<Suspense fallback={<Loading />}><InscricaoVoluntariado /></Suspense>} />
      <Route path="/decisao" element={<Suspense fallback={<Loading />}><DecisaoOnline /></Suspense>} />
      <Route path="/wallet" element={<Suspense fallback={<Loading />}><WalletPage /></Suspense>} />
      <Route path="/motion" element={<Suspense fallback={<Loading />}><Motion /></Suspense>} />
      {/* Prévia interna do novo site (redesign cbrio.com.br) · não-listada */}
      <Route path="/novosite" element={<Suspense fallback={<Loading />}><NovoSite /></Suspense>} />
      <Route path="/novosite/quem-somos" element={<Suspense fallback={<Loading />}><QuemSomos /></Suspense>} />
      <Route path="/nps/publica/:token" element={<Suspense fallback={<Loading />}><NpsPublica /></Suspense>} />
      <Route path="/auth/pc-callback" element={<Suspense fallback={<Loading />}><PcCallback /></Suspense>} />

      {/* Devocional · migrou pro app de membros. As telas web saíram; estas rotas
          mostram um aviso curto "está no app" e os links antigos redirecionam. */}
      <Route path="/devocional" element={<Suspense fallback={<Loading />}><DevocionalMovido /></Suspense>} />
      <Route path="/devocional/hoje" element={<Navigate to="/devocional" replace />} />
      <Route path="/devocional/historico" element={<Navigate to="/devocional" replace />} />

      {/* Preview de design (estilo Rondesignlab) · fullscreen isolado · não-produção */}
      <Route path="/design-preview" element={<ProtectedRoute><Suspense fallback={<Loading />}><DesignPreview /></Suspense></ProtectedRoute>} />

      {/* /atlas · atlas operacional do sistema (manual + auditoria + fluxograma) · fullscreen isolado, autenticado, fora do menu */}
      <Route path="/atlas" element={<ProtectedRoute><Suspense fallback={<Loading />}><Atlas /></Suspense></ProtectedRoute>} />
      {/* /atlas/fluxograma · abre direto no canvas de fluxo do sistema */}
      <Route path="/atlas/fluxograma" element={<ProtectedRoute><Suspense fallback={<Loading />}><Atlas initialHash="#fluxograma" /></Suspense></ProtectedRoute>} />

      {/* Totem — fullscreen, sem shell nenhum */}
      <Route path="/voluntariado/totem" element={<ProtectedRoute><Suspense fallback={<Loading />}><VolTotem /></Suspense></ProtectedRoute>} />
      <Route path="/totem" element={<ProtectedRoute><ModuleGuard moduleSlug="totem-membro"><Suspense fallback={<Loading />}><TotemMembro /></Suspense></ModuleGuard></ProtectedRoute>} />

      {/* Display Totem Kids · TV/Fire TV · publica (autentica via token de estação) */}
      <Route path="/ministerial/totem-kids/display-sala" element={<Suspense fallback={<Loading />}><TotemKidsDisplaySala /></Suspense>} />
      <Route path="/ministerial/totem-kids/display-foyer" element={<Suspense fallback={<Loading />}><TotemKidsDisplayFoyer /></Suspense>} />
      {/* Pareamento público · token na URL já autoriza */}
      <Route path="/ministerial/totem-kids/parear" element={<Suspense fallback={<Loading />}><TotemKidsParear /></Suspense>} />

      {/* Self check-in — voluntário escaneia QR do totem com celular.
          Rota PUBLICA: se não estiver autenticado, a própria página oferece
          cadastro via CPF (fluxo de registration / magic link). */}
      <Route path="/voluntariado/self-checkin" element={<Suspense fallback={<Loading />}><VolSelfCheckin /></Suspense>} />

      {/* ═══ Rotas do VOLUNTÁRIO — shell minimalista ═══ */}
      <Route element={<ProtectedRoute><VolunteerShell /></ProtectedRoute>}>
        <Route path="/voluntariado/checkin/*" element={<Suspense fallback={<Loading />}><Voluntariado /></Suspense>} />
        <Route path="/voluntariado/*" element={<Navigate to="/voluntariado/checkin" replace />} />
      </Route>

      {/* ═══ Rotas do STAFF — AppShell completo ═══ */}
      <Route
        element={
          <ProtectedRoute>
            <MemberOnlyRedirect>
              <AppShell />
            </MemberOnlyRedirect>
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Suspense fallback={<Loading />}><Dashboard /></Suspense>} />
        <Route path="/perfil" element={<Suspense fallback={<Loading />}><Perfil /></Suspense>} />
        {/* Página pessoal · sem ModuleGuard (login basta · cada um vê só as suas) */}
        <Route path="/tarefas" element={<Suspense fallback={<Loading />}><MinhasTarefas /></Suspense>} />
        <Route path="/planejamento" element={<Suspense fallback={<Loading />}><GestaoAnual /></Suspense>} />
        <Route path="/eventos" element={<ModuleGuard permKey="canAgenda"><Suspense fallback={<Loading />}><Eventos /></Suspense></ModuleGuard>} />
        <Route path="/eventos/:id" element={<ModuleGuard permKey="canAgenda"><Suspense fallback={<Loading />}><EventDetail /></Suspense></ModuleGuard>} />
        <Route path="/projetos" element={<ModuleGuard permKey="canProjetos"><Suspense fallback={<Loading />}><Projetos /></Suspense></ModuleGuard>} />
        <Route path="/expansao" element={<ModuleGuard moduleSlug="expansao"><Suspense fallback={<Loading />}><Expansao /></Suspense></ModuleGuard>} />
        <Route path="/revisao" element={<Suspense fallback={<Loading />}><RevisaoEstrategica /></Suspense>} />
        <Route path="/revisao/:tipo/:id" element={<Suspense fallback={<Loading />}><RevisaoDetalhe /></Suspense>} />
        {/* /processos descontinuado em 2026-05-18 (reunião de permissões) — redireciona pra /eventos */}
        <Route path="/processos" element={<Navigate to="/eventos" replace />} />
        <Route path="/processos/*" element={<Navigate to="/eventos" replace />} />
        <Route path="/nps" element={<Suspense fallback={<Loading />}><Nps /></Suspense>} />
        <Route path="/nps/:id/responder" element={<Suspense fallback={<Loading />}><NpsResponder /></Suspense>} />
        <Route path="/admin/rh" element={<ModuleGuard permKey="canRH"><Suspense fallback={<Loading />}><RH /></Suspense></ModuleGuard>} />
        <Route path="/admin/financeiro" element={<ModuleGuard permKey="canFinanceiro"><Suspense fallback={<Loading />}><Financeiro /></Suspense></ModuleGuard>} />
        <Route path="/admin/logistica" element={<ModuleGuard permKey="canLogistica"><Suspense fallback={<Loading />}><Logistica /></Suspense></ModuleGuard>} />
        <Route path="/admin/patrimonio" element={<ModuleGuard permKey="canPatrimonio"><Suspense fallback={<Loading />}><Patrimonio /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/membresia" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><Membresia /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/membresia/scan" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><MemberScan /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/reconhecimento-facial" element={<ModuleGuard moduleSlug="face"><Suspense fallback={<Loading />}><ReconhecimentoFacial /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/voluntariado/*" element={<VoluntariadoGuard><Suspense fallback={<Loading />}><Voluntariado /></Suspense></VoluntariadoGuard>} />
        {/* Totem Kids · check-in/checkout/painel · 2026-05-21 */}
        <Route path="/ministerial/totem-kids" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsCheckin /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/kids" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><KidsHub /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/criancas" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><GestaoCriancas /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/frequencia" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><KidsFrequenciaPCO /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/voluntarios" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><VoluntariosKids /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/estoque" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><EstoqueKids /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/batismos" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><BatismosKids /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/apresentacao" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><ApresentacaoCriancasKids /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/checkout" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsCheckout /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/painel" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsPainel /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/teste-etiqueta" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsTesteEtiqueta /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/decisoes" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsDecisoes /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/vinculos" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsVinculos /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/configuracoes" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsAdmin /></Suspense></ModuleGuard>} />
        {/* Redirects das URLs antigas (admin separado) · 2026-05-21 */}
        <Route path="/admin/totem-kids" element={<Navigate to="/ministerial/totem-kids/configuracoes" replace />} />
        <Route path="/admin/totem-kids/sessoes" element={<Navigate to="/ministerial/totem-kids/configuracoes?aba=sessoes" replace />} />
        <Route path="/grupos" element={<ModuleGuard moduleSlug="grupos"><Suspense fallback={<Loading />}><Grupos /></Suspense></ModuleGuard>} />
        <Route path="/grupos/supervisao" element={<ModuleGuard moduleSlug="grupos"><Suspense fallback={<Loading />}><GruposSupervisao /></Suspense></ModuleGuard>} />
        <Route path="/grupos/pedidos" element={<ModuleGuard moduleSlug="grupos"><Suspense fallback={<Loading />}><PedidosGrupo /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/cuidados" element={<ModuleGuard moduleSlug="cuidados"><Suspense fallback={<Loading />}><Cuidados /></Suspense></ModuleGuard>} />
        <Route path="/wifi" element={<ModuleGuard moduleSlug="wifi"><Suspense fallback={<Loading />}><WifiModulo /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/devocional" element={<Navigate to="/ministerial/cuidados?tab=devocional" replace />} />
        <Route path="/ministerial/jornada" element={<Navigate to="/ministerial/membresia" replace />} />
        <Route path="/ministerial/integracao" element={<ModuleGuard moduleSlug="integracao"><Suspense fallback={<Loading />}><Integracao /></Suspense></ModuleGuard>} />
        <Route path="/batismo" element={<ModuleGuard moduleSlug="batismo"><Suspense fallback={<Loading />}><Batismo /></Suspense></ModuleGuard>} />
        {/* Relatórios virou aba dentro do Dashboard Semanal · mantém link antigo */}
        <Route path="/ministerial/relatorios" element={<Navigate to="/dashboard-semanal" replace />} />
        <Route path="/integracao/coleta" element={<ModuleGuard moduleSlug="integracao" nivelMinimo={2}><Suspense fallback={<Loading />}><ColetaCulto /></Suspense></ModuleGuard>} />
        <Route path="/integracao" element={<Navigate to="/ministerial/integracao" replace />} />
        <Route path="/producao" element={<ModuleGuard moduleSlug="producao" nivelMinimo={1}><Suspense fallback={<Loading />}><Producao /></Suspense></ModuleGuard>} />
        <Route path="/next-batismo" element={<ModuleGuard moduleSlug="next-batismo" nivelMinimo={1}><Suspense fallback={<Loading />}><NextBatismo /></Suspense></ModuleGuard>} />
        <Route path="/eventos-externos" element={<ModuleGuard moduleSlug="eventos-externos" nivelMinimo={1}><Suspense fallback={<Loading />}><EventosExternos /></Suspense></ModuleGuard>} />
        <Route path="/governanca" element={<ModuleGuard moduleSlug="governanca" nivelMinimo={1}><Suspense fallback={<Loading />}><Governanca /></Suspense></ModuleGuard>} />
        <Route path="/governanca/:sigla" element={<ModuleGuard moduleSlug="governanca" nivelMinimo={1}><Suspense fallback={<Loading />}><GovernancaRitual /></Suspense></ModuleGuard>} />
        <Route path="/entradas" element={<Navigate to="/next-batismo" replace />} />
        {/* Cultos · rotas na raiz (sem prefixo /ministerial) · 2026-05-21 */}
        <Route path="/online" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><Online /></Suspense></ModuleGuard>} />
        <Route path="/kids" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><PainelKids /></Suspense></ModuleGuard>} />
        <Route path="/ami" element={<ModuleGuard moduleSlug="ami"><Suspense fallback={<Loading />}><PainelAmi /></Suspense></ModuleGuard>} />
        <Route path="/bridge" element={<ModuleGuard moduleSlug="bridge"><Suspense fallback={<Loading />}><PainelBridge /></Suspense></ModuleGuard>} />
        {/* Marketing · Kanban (Spec 007) + Calendário (Spec 008) */}
        <Route path="/marketing" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingKanban /></Suspense></ModuleGuard>} />
        <Route path="/marketing/calendario" element={<Navigate to="/marketing" replace />} />
        <Route path="/marketing/planner" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingPlanner /></Suspense></ModuleGuard>} />
        <Route path="/marketing/admin" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={5}><Suspense fallback={<Loading />}><MarketingAdmin /></Suspense></ModuleGuard>} />
        <Route path="/marketing/analytics" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingAnalytics /></Suspense></ModuleGuard>} />
        <Route path="/marketing/comunicados" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingComunicados /></Suspense></ModuleGuard>} />
        <Route path="/marketing/fila" element={<Navigate to="/marketing" replace />} />
        <Route path="/marketing/ciclo-criativo" element={<Navigate to="/marketing" replace />} />
        <Route path="/marketing/triagem" element={<Navigate to="/marketing" replace />} />
        {/* Redirects das rotas antigas pra não quebrar bookmarks */}
        <Route path="/ministerial/online" element={<Navigate to="/online" replace />} />
        <Route path="/ministerial/ami" element={<Navigate to="/ami" replace />} />
        <Route path="/ministerial/bridge" element={<Navigate to="/bridge" replace />} />
        <Route path="/ministerial/next" element={<Navigate to="/ministerial/integracao?tab=next" replace />} />
        <Route path="/ministerial/batismos" element={<Navigate to="/ministerial/integracao?tab=batismos" replace />} />
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
        <Route path="/jornada" element={<Suspense fallback={<Loading />}><PainelJornada /></Suspense>} />
        <Route path="/admin/notificacao-regras" element={<Suspense fallback={<Loading />}><NotificacaoRegras /></Suspense>} />
        <Route path="/admin/destaques" element={<ModuleGuard permKey="isAdmin"><Suspense fallback={<Loading />}><Destaques /></Suspense></ModuleGuard>} />
        <Route path="/admin/fotos-batismo" element={<ModuleGuard permKey="isAdmin"><Suspense fallback={<Loading />}><FotosBatismo /></Suspense></ModuleGuard>} />
        <Route path="/admin/cruzamentos" element={<Suspense fallback={<Loading />}><CruzamentosPessoas /></Suspense>} />
        <Route path="/admin/solicitacoes-responsaveis" element={<Suspense fallback={<Loading />}><SolicitacoesResponsaveis /></Suspense>} />
        <Route path="/admin/permissoes" element={<Suspense fallback={<Loading />}><PermissoesAdmin /></Suspense>} />
        <Route path="/admin/feedback" element={<Suspense fallback={<Loading />}><FeedbackAdmin /></Suspense>} />
        <Route path="/admin/app-analytics" element={<ModuleGuard moduleSlug="dashboard" nivelMinimo={1}><Suspense fallback={<Loading />}><AppAnalytics /></Suspense></ModuleGuard>} />
        <Route path="/admin/whatsapp" element={<ModuleGuard moduleSlug="integracao" nivelMinimo={3}><Suspense fallback={<Loading />}><WhatsappAdmin /></Suspense></ModuleGuard>} />
        {/* Apresentações: módulo desativado (2026-07-06 · pedido do Matheus) — rota redireciona */}
        <Route path="/admin/apresentacoes" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin/apresentacoes/*" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin/usuarios" element={<Navigate to="/admin/permissoes?aba=usuarios" replace />} />
        <Route path="/admin/kpi-areas" element={<Navigate to="/admin/permissoes" replace />} />
        <Route path="/permissoes" element={<Navigate to="/admin/permissoes" replace />} />
        <Route path="/ritual" element={<Suspense fallback={<Loading />}><Ritual /></Suspense>} />
        <Route path="/gestao" element={<Suspense fallback={<Loading />}><Gestao /></Suspense>} />
        <Route path="/minha-area" element={<Suspense fallback={<Loading />}><MinhaArea /></Suspense>} />
        {/* Redirects · /minha-area virou so visualizador · /dados-brutos so admin */}
        <Route path="/dados-brutos" element={<Suspense fallback={<Loading />}><DadosBrutos /></Suspense>} />
        <Route path="/dashboard-semanal" element={<Suspense fallback={<Loading />}><DashboardSemanal /></Suspense>} />
        <Route path="/monitoramento-okr" element={<Suspense fallback={<Loading />}><MonitoramentoOkr /></Suspense>} />
        <Route path="/admin/estrutura-okr" element={<Navigate to="/gestao?aba=estrutura" replace />} />
        <Route path="/admin/grupos/qrcode-inscricao" element={<Suspense fallback={<Loading />}><InscricaoGruposQRCode /></Suspense>} />
        <Route path="/admin/grupos/geocode" element={<Suspense fallback={<Loading />}><GruposGeocode /></Suspense>} />
        <Route path="/admin/grupos/temporadas" element={<Suspense fallback={<Loading />}><TemporadasGrupos /></Suspense>} />
        <Route path="/ministerial/*" element={<PlaceholderPage title="Ministerial" />} />
        <Route path="/criativo/*" element={<PlaceholderPage title="Criativo" />} />

        <Route path="*" element={<Suspense fallback={<Loading />}><NotFound /></Suspense>} />
      </Route>

      <Route path="/" element={<DefaultRedirect />} />
    </Routes>
  );
}

export default function App() {
  // Se o app rodar estável por 5s, a navegação deu certo → tira _chunk_retry/_cb
  // da URL pra ZERAR o contador de retries (senão um retry grudado come as
  // tentativas do próximo incidente) e deixa a URL limpa. O atraso de 5s é o que
  // preserva o teto anti-loop: se um chunk falhar antes disso, o hardReload roda
  // com o contador intacto. 2026-06-30.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has(RETRY_PARAM) || url.searchParams.has('_cb')) {
          url.searchParams.delete(RETRY_PARAM);
          url.searchParams.delete('_cb');
          window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        }
      } catch { /* ignora */ }
    }, 5000);
    return () => clearTimeout(t);
  }, []);
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <BrowserRouter>
              <TutorialProvider>
                <AppRoutes />
                <Toaster position="top-right" richColors />
              </TutorialProvider>
            </BrowserRouter>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
