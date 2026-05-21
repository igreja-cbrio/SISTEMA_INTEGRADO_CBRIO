import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { notificacoes as notifApi } from '../../api';
import { supabase } from '../../supabaseClient';
import SpotifyPlayer from './SpotifyPlayer';
import { playNotificationSound } from '../../lib/sounds';
import { isPushSupported, getCurrentSubscription, subscribePush, unsubscribePush } from '../../lib/pushNotifications';
import MegaMenu from '../ui/mega-menu';
import { CommandSearch } from '../ui/command-search';
import {
  Users, DollarSign, Truck, Tag,
  CalendarDays, FolderKanban, Map, ListChecks,
  UserCheck, UsersRound, Heart, HandHelping, BookOpen, ArrowRight, TrendingUp, Youtube,
  Megaphone, BrainCircuit, ShoppingCart, LayoutDashboard,
  Sun, Moon, Bell, BellRing, BellOff, LogOut, Search, CheckCheck, Settings, MonitorSmartphone, BarChart2, ClipboardCheck, Activity, MessageSquare, Shield, Menu as MenuIcon,
  Baby, GraduationCap, ArrowRightLeft, Sparkles,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
} from '../ui/dropdown-menu';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback } from '../ui/avatar';

const SEV_COLORS = { urgente: '#ef4444', aviso: '#f59e0b', info: '#00B39D' };
const MOD_COLORS = { rh: '#8b5cf6', financeiro: '#10b981', logistica: '#ef4444', patrimonio: '#6366f1', membresia: '#00B39D', eventos: '#3b82f6', projetos: '#ec4899', kpis: '#f97316', cuidados: '#ef476f', processos: '#00B39D', nps: '#06b6d4', sistema: '#6b7280' };
const MOD_LABELS = { rh: 'RH', financeiro: 'Financeiro', logistica: 'Logística', patrimonio: 'Patrimônio', membresia: 'Membresia', eventos: 'Eventos', projetos: 'Projetos', kpis: 'KPIs', cuidados: 'Cuidados', processos: 'Processos', nps: 'NPS', sistema: 'Sistema' };

// 6 módulos macro · alinhados com o roadmap apresentado ao gestor
// (Administração · Inteligência · Planejamento · Ministerial · Cultos · Criativo)
const NAV_ITEMS = [
  {
    id: 1,
    label: 'Administração',
    subMenus: [
      {
        title: 'Gestão',
        items: [
          { label: 'Recursos Humanos', description: 'Funcionários, treinamentos e férias', icon: Users, path: '/admin/rh', perm: 'canRH' },
          { label: 'Financeiro', description: 'Contas, transações e reembolsos', icon: DollarSign, path: '/admin/financeiro', perm: 'canFinanceiro' },
          { label: 'Logística', description: 'Fornecedores, compras e pedidos', icon: Truck, path: '/admin/logistica', perm: 'canLogistica' },
          { label: 'Patrimônio', description: 'Bens, localizações e inventário', icon: Tag, path: '/admin/patrimonio', perm: 'canPatrimonio' },
        ],
      },
      {
        title: 'Serviços',
        items: [
          { label: 'Solicitações', description: 'TI, compras, reembolso, espaços e férias', icon: ShoppingCart, path: '/solicitacoes', perm: 'isColaborador' },
        ],
      },
      {
        title: 'Configurações',
        items: [
          { label: 'Permissões', description: 'Matriz cargo × módulo + usuários (cargo, áreas, overrides)', icon: Shield, path: '/admin/permissoes', perm: 'isAdmin' },
        ],
      },
    ],
  },
  {
    id: 2,
    label: 'Inteligência',
    subMenus: [
      {
        title: 'Visão macro',
        items: [
          { label: 'Painel CBRio', description: 'NSM · 5 valores · 6 áreas — visão macro · ritual mensal', icon: Activity, path: '/painel', module: 'painel-cbrio' },
          { label: 'Dashboard Semanal', description: 'Painel da reunião de quarta · semanal · mensal · metas · gerador IA', icon: LayoutDashboard, path: '/dashboard-semanal' },
          { label: 'Minha Área', description: 'KPIs (resultado) e Dados (entrada) da sua área', icon: BarChart2, path: '/minha-area', module: 'minha-area' },
        ],
      },
      {
        title: 'Análise',
        items: [
          { label: 'NPS', description: 'Pesquisas de satisfação geradas por IA · análise automática', icon: MessageSquare, path: '/nps', module: 'nps' },
          { label: 'Gestão (PMO)', description: 'Pulso · Estrutura OKR · Saúde · Configurar (admin)', icon: Settings, path: '/gestao', module: 'gestao' },
          { label: 'Assistente IA', description: 'Agentes de auditoria e análise', icon: BrainCircuit, path: '/assistente-ia', perm: 'canIA' },
          { label: 'Apresentações', description: 'Gera slides HTML premium via Claude Opus · upload opcional', icon: Sparkles, path: '/admin/apresentacoes', module: 'apresentacoes' },
        ],
      },
    ],
  },
  {
    id: 3,
    label: 'Planejamento',
    subMenus: [
      {
        title: 'Execução',
        items: [
          { label: 'Eventos', description: 'Ciclo criativo · fases · documentos · KPIs', icon: CalendarDays, path: '/eventos', perm: 'canAgenda' },
          { label: 'Projetos', description: 'Acompanhamento de projetos com Kanban/Gantt', icon: FolderKanban, path: '/projetos', perm: 'canProjetos' },
          { label: 'Expansão', description: 'Marcos estratégicos · cascata até 2029', icon: Map, path: '/expansao', module: 'expansao' },
        ],
      },
    ],
  },
  {
    id: 4,
    label: 'Ministerial',
    subMenus: [
      {
        title: 'Áreas ministeriais',
        items: [
          { label: 'Integração', description: 'Batismo, apresentação e cultos', icon: UserCheck, path: '/ministerial/integracao' },
          { label: 'Membresia', description: 'Cadastros, trilha dos valores e Jornada', icon: BookOpen, path: '/ministerial/membresia', perm: 'canMembresia' },
          { label: 'Cuidados', description: 'Capelania e aconselhamento', icon: Heart, path: '/ministerial/cuidados', module: 'cuidados' },
          { label: 'Grupos', description: 'Grupos de conexão · pedidos · QR · mapa', icon: UsersRound, path: '/grupos' },
          { label: 'Voluntariado', description: 'Check-in, escalas e QR codes', icon: HandHelping, path: '/ministerial/voluntariado', perm: 'canMembresia' },
          { label: 'NEXT', description: 'Porta de entrada — inscrições, check-in e indicações', icon: ArrowRight, path: '/ministerial/next', perm: 'canMembresia' },
        ],
      },
      {
        title: 'Ferramentas',
        items: [
          { label: 'Totem Membro', description: 'Modo kiosk para self-service no hall', icon: MonitorSmartphone, path: '/totem', perm: 'isAdmin' },
          { label: 'Totem Kids', description: 'Check-in e checkout das crianças · imprime etiqueta', icon: Baby, path: '/ministerial/totem-kids', module: 'kids' },
          { label: 'Totem Kids · Admin', description: 'Sessões, salas, estações, crianças, auditoria', icon: Settings, path: '/admin/totem-kids', module: 'kids' },
        ],
      },
    ],
  },
  {
    id: 5,
    label: 'Cultos',
    subMenus: [
      {
        title: 'Visualização por culto',
        items: [
          { label: 'Online', description: 'Visão do canal YouTube e séries de pregação', icon: Youtube, path: '/online', perm: 'canMembresia' },
          { label: 'Kids', description: 'Indicadores do ministério infantil', icon: Baby, path: '/kids', module: 'kids' },
          { label: 'AMI', description: 'Indicadores do culto AMI', icon: GraduationCap, path: '/ami', module: 'ami' },
          { label: 'Bridge', description: 'Indicadores do culto Bridge', icon: ArrowRightLeft, path: '/bridge', module: 'bridge' },
        ],
      },
    ],
  },
  {
    id: 6,
    label: 'Criativo',
    roles: ['admin', 'diretor'],
    subMenus: [
      {
        title: 'Áreas',
        items: [
          { label: 'Marketing', description: 'Projetos e solicitações', icon: Megaphone, path: '/criativo/marketing' },
        ],
      },
    ],
  },
];

export default function AppShell() {
  const { profile, role, signOut, isAdmin, isVoluntario, isColaborador, modulePerms, canRH, canFinanceiro, canLogistica, canPatrimonio, canMembresia, canProjetos, canExpansao, canAgenda, canIA, canCuidados, canProcessos } = useAuth();
  const permMap = { canRH, canFinanceiro, canLogistica, canPatrimonio, canMembresia, canProjetos, canExpansao, canAgenda, canIA, canCuidados, canProcessos, isColaborador, isAdmin };

  // If permissions haven't loaded yet (modulePerms is null), show all items
  const permsLoaded = modulePerms !== null || isAdmin;

  // Item passa se: sem perm + sem module · OU perm explicita true · OU
  // module com nivel leitura >= 1 (admin sempre passa)
  function itemAllowed(item) {
    if (!permsLoaded) return true;
    if (isAdmin) return true;
    if (item.perm && permMap[item.perm] === false) return false;
    if (item.module && modulePerms) {
      const m = modulePerms[item.module];
      const leitura = m?.leitura ?? 0;
      if (leitura < 1) return false;
    }
    return true;
  }

  function sectionAllowed(section) {
    if (!section.roles) return true;
    if (isAdmin) return true;
    return section.roles.includes(role);
  }

  const filteredNavItems = NAV_ITEMS
    .filter(sectionAllowed)
    .map(section => ({
      ...section,
      subMenus: section.subMenus.map(sub => ({
        ...sub,
        items: sub.items.filter(itemAllowed),
      })).filter(sub => sub.items.length > 0),
    })).filter(section => section.subMenus.length > 0);

  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const initials = (profile?.name || '??')
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const [notifCount, setNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const pushSupported = typeof window !== 'undefined' && isPushSupported();

  useEffect(() => {
    if (!pushSupported) return;
    getCurrentSubscription().then(s => setPushSubscribed(!!s)).catch(() => {});
  }, [pushSupported]);

  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushSubscribed) {
        await unsubscribePush();
        setPushSubscribed(false);
      } else {
        const r = await subscribePush();
        if (r === 'ok') setPushSubscribed(true);
        else if (r === 'denied') alert('Voce bloqueou notificacoes neste navegador. Habilite nas configuracoes do site.');
        else if (r === 'no_vapid') alert('Push ainda nao foi configurado pelo administrador.');
        else if (r === 'unsupported') alert('Este navegador nao suporta notificacoes push.');
        else alert('Nao foi possivel ativar notificacoes.');
      }
    } finally { setPushBusy(false); }
  };
  const [notifs, setNotifs] = useState([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const prevNotifCount = useRef(-1);

  useEffect(() => {
    loadNotifCount();
    // Polling como safety net (caso o WebSocket caia ou o navegador hiberne a aba).
    // O canal Realtime abaixo entrega INSERTs em < 1s · o polling so existe pra
    // ressincronizar se algum evento for perdido.
    const interval = setInterval(loadNotifCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Realtime · escuta INSERTs em `notificacoes` filtrado pelo usuario logado.
  // Quando uma nova chega, toca o som, incrementa o badge e (se o dropdown
  // ja estiver aberto) prepend na lista sem precisar refazer fetch.
  useEffect(() => {
    if (!supabase || !profile?.id) return;
    const channel = supabase
      .channel(`notif:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacoes',
          filter: `usuario_id=eq.${profile.id}`,
        },
        (payload) => {
          const nova = payload?.new;
          if (!nova) return;
          playNotificationSound();
          setNotifCount(c => {
            const next = c + 1;
            // Mantem o ref sincronizado pro polling subsequente nao tocar som de novo
            // pelo mesmo evento (a comparacao em loadNotifCount usa prevNotifCount).
            prevNotifCount.current = next;
            return next;
          });
          setNotifs(prev => {
            if (prev.some(x => x.id === nova.id)) return prev;
            return [nova, ...prev];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  async function loadNotifCount() {
    try {
      const { count } = await notifApi.count();
      if (count > 0 && prevNotifCount.current >= 0 && count > prevNotifCount.current) {
        playNotificationSound();
      }
      prevNotifCount.current = count;
      setNotifCount(count);
    } catch { /* backend might not be ready */ }
  }

  const loadNotifs = useCallback(async () => {
    setNotifsLoading(true);
    try {
      const data = await notifApi.list();
      setNotifs(data || []);
    } catch { /* ignore */ }
    setNotifsLoading(false);
  }, []);

  async function handleNotifClick(n) {
    if (!n.lida) {
      try {
        await notifApi.ler(n.id);
        setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, lida: true } : x));
        setNotifCount(prev => Math.max(0, prev - 1));
      } catch { /* ignore */ }
    }
    if (n.link) {
      setNotifOpen(false);
      navigate(n.link);
    }
  }

  async function handleLerTodas() {
    try {
      await notifApi.lerTodas();
      setNotifs(prev => prev.map(x => ({ ...x, lida: true })));
      setNotifCount(0);
    } catch { /* ignore */ }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--cbrio-bg)' }}>
      <CommandSearch />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-between h-14 px-4 md:px-6 max-w-[1800px] mx-auto gap-2">
          {/* Left: Menu mobile + Logo */}
          <div className="flex items-center gap-2">
            {/* Hamburger · so mobile (desktop usa MegaMenu) */}
            {!isVoluntario && (
              <MobileNavSheet items={filteredNavItems} />
            )}
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src="/logo-cbrio-text.png" alt="CBRio" className="h-8 object-contain" />
            </button>
          </div>

          {/* Center: Navigation desktop · escondido no mobile (vai pro Sheet) */}
          {!isVoluntario && (
            <div className="flex-1 flex justify-center">
              <MegaMenu items={filteredNavItems} role={role} />
            </div>
          )}
          {isVoluntario && (
            <div className="flex-1 flex justify-center">
              <span className="text-sm font-medium text-muted-foreground">Voluntariado</span>
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Search trigger · mobile so icon, desktop com texto + ⌘K */}
            <button
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
              }}
              className="flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs hover:bg-accent transition-colors"
              title="Buscar (⌘K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Buscar</span>
              <kbd className="hidden md:inline text-[10px] px-1 py-0.5 rounded bg-muted">⌘K</kbd>
            </button>

            {/* Theme toggle */}
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Notifications */}
            <DropdownMenu open={notifOpen} onOpenChange={(v) => { setNotifOpen(v); if (v) loadNotifs(); }}>
              <DropdownMenuTrigger asChild>
                <button className="relative p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
                  <Bell className="h-4 w-4" />
                  {notifCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center cbrio-badge-pulse px-1">
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[380px] p-0" sideOffset={8}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="text-sm font-bold text-foreground">Notificacoes</span>
                  <div className="flex items-center gap-2">
                    {notifCount > 0 && (
                      <button onClick={handleLerTodas} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                        <CheckCheck className="h-3 w-3" /> Marcar todas como lidas
                      </button>
                    )}
                    {pushSupported && (
                      <button
                        onClick={togglePush}
                        disabled={pushBusy}
                        className="p-1 rounded hover:bg-accent transition-colors"
                        style={{ color: pushSubscribed ? '#00B39D' : 'var(--cbrio-text3)' }}
                        title={pushSubscribed ? 'Desativar notificacoes no celular/desktop' : 'Ativar notificacoes no celular/desktop'}
                      >
                        {pushSubscribed ? <BellRing className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button onClick={() => { setNotifOpen(false); navigate('/admin/notificacao-regras'); }} className="p-1 rounded hover:bg-accent text-muted-foreground" title="Configurar regras">
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <ScrollArea className="max-h-[400px]">
                  {notifsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
                    </div>
                  ) : notifs.length === 0 ? (
                    <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
                      <Bell className="h-8 w-8 opacity-30" />
                      <span className="text-xs">Nenhuma notificacao</span>
                    </div>
                  ) : (
                    <div className="py-1">
                      {notifs.map(n => {
                        const sevColor = SEV_COLORS[n.severidade] || '#00B39D';
                        const modColor = MOD_COLORS[n.modulo] || '#6b7280';
                        const diff = Date.now() - new Date(n.created_at).getTime();
                        const mins = Math.floor(diff / 60000);
                        const timeAgo = mins < 1 ? 'agora' : mins < 60 ? `${mins}min` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
                        return (
                          <div
                            key={n.id}
                            onClick={() => handleNotifClick(n)}
                            className="px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer"
                            style={{ borderLeft: `3px solid ${sevColor}`, background: n.lida ? undefined : 'var(--cbrio-input-bg)' }}
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-2">
                                {!n.lida && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: modColor, background: `${modColor}15` }}>
                                  {MOD_LABELS[n.modulo] || n.modulo}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
                            </div>
                            <p className={`text-sm ${n.lida ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>{n.titulo}</p>
                            {n.mensagem && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User menu */}
            <button onClick={() => navigate('/perfil')} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent transition-colors">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground hidden md:inline">{profile?.name?.split(' ')[0] || ''}</span>
            </button>

            {/* Sign out */}
            <button onClick={handleSignOut} className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground" title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1800px] mx-auto">
        <Outlet />
      </main>

      <SpotifyPlayer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MobileNavSheet · drawer lateral pra navegar em telas pequenas
// Visivel so < md (768px) · desktop usa MegaMenu no centro do header.
// ─────────────────────────────────────────────────────────────────────────
function MobileNavSheet({ items }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="md:hidden p-2 rounded-lg hover:bg-accent transition-colors text-foreground"
          aria-label="Abrir menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 max-w-[85vw] overflow-y-auto p-0">
        <div className="px-4 py-4 border-b border-border">
          <img src="/logo-cbrio-text.png" alt="CBRio" className="h-7 object-contain" />
        </div>
        <nav className="p-2 space-y-4">
          {items.map(section => (
            <div key={section.id}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-3 mb-1.5">
                {section.label}
              </p>
              {section.subMenus.map(sub => (
                <div key={sub.title} className="mb-2">
                  {sub.title && section.subMenus.length > 1 && (
                    <p className="text-[10px] text-muted-foreground/70 px-3 mt-2 mb-1">{sub.title}</p>
                  )}
                  {sub.items.map(item => {
                    const Icon = item.icon;
                    const ativo = location.pathname === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => go(item.path)}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                          ativo
                            ? 'bg-primary/15 text-primary'
                            : 'hover:bg-accent text-foreground'
                        }`}
                      >
                        {Icon && <Icon className="h-4 w-4 shrink-0" />}
                        <span className="text-sm font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
