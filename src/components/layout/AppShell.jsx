import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { notificacoes as notifApi } from '../../api';
import { playNotificationSound } from '../../lib/sounds';
import MegaMenu from '../ui/mega-menu';
import { CommandSearch } from '../ui/command-search';
import {
  Users, DollarSign, Truck, Tag,
  CalendarDays, FolderKanban, Map,
  UserCheck, UsersRound, Heart, HandHelping, BookOpen,
  Megaphone, BrainCircuit, ShoppingCart,
  Sun, Moon, Bell, LogOut, Search, CheckCheck, Settings, MonitorSmartphone, BarChart2,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
} from '../ui/dropdown-menu';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback } from '../ui/avatar';

const SEV_COLORS = { urgente: '#ef4444', aviso: '#f59e0b', info: '#00B39D' };
const MOD_COLORS = { rh: '#8b5cf6', financeiro: '#10b981', logistica: '#ef4444', patrimonio: '#6366f1', membresia: '#00B39D', eventos: '#3b82f6', projetos: '#ec4899', kpis: '#f97316', cuidados: '#ef476f', sistema: '#6b7280' };
const MOD_LABELS = { rh: 'RH', financeiro: 'Financeiro', logistica: 'Logística', patrimonio: 'Patrimônio', membresia: 'Membresia', eventos: 'Eventos', projetos: 'Projetos', kpis: 'KPIs', cuidados: 'Cuidados', sistema: 'Sistema' };

const NAV_ITEMS = [
  {
    id: 1,
    label: 'Administrativo',
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
        title: 'Inteligência',
        items: [
          { label: 'KPIs e Indicadores', description: 'Frequência, batismos e métricas 2026', icon: BarChart2, path: '/kpis', perm: 'canKPIs' },
          { label: 'Assistente IA', description: 'Agentes de auditoria e análise', icon: BrainCircuit, path: '/assistente-ia', perm: 'canIA' },
        ],
      },
    ],
  },
  {
    id: 2,
    label: 'Projetos e Eventos',
    path: '/planejamento',
    subMenus: [
      {
        title: 'Módulos',
        items: [
          { label: 'Eventos', description: 'Gestão de eventos da igreja', icon: CalendarDays, path: '/eventos', perm: 'canAgenda' },
          { label: 'Projetos', description: 'Acompanhamento de projetos', icon: FolderKanban, path: '/projetos', perm: 'canProjetos' },
          { label: 'Expansão', description: 'Metas de expansão', icon: Map, path: '/expansao', perm: 'canExpansao' },
        ],
      },
    ],
  },
  {
    id: 3,
    label: 'Ministerial',
    subMenus: [
      {
        title: 'Áreas',
        items: [
          { label: 'Integração', description: 'Batismo, apresentação e cultos', icon: UserCheck, path: '/ministerial/integracao' },
          { label: 'Grupos', description: 'Grupos de conexao da igreja', icon: UsersRound, path: '/grupos' },
          { label: 'Cuidados', description: 'Capelania e aconselhamento', icon: Heart, path: '/ministerial/cuidados', perm: 'canCuidados' },
          { label: 'Voluntariado', description: 'Check-in, escalas e QR codes', icon: HandHelping, path: '/ministerial/voluntariado', perm: 'canMembresia' },
          { label: 'Membresia', description: 'Cadastro e trilha dos valores', icon: BookOpen, path: '/ministerial/membresia', perm: 'canMembresia' },
        ],
      },
      {
        title: 'Ferramentas',
        items: [
          { label: 'Totem Membro', description: 'Modo kiosk para self-service no hall', icon: MonitorSmartphone, path: '/totem', perm: 'canMembresia' },
        ],
      },
    ],
  },
  {
    id: 4,
    label: 'Criativo',
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
  const { profile, role, signOut, isAdmin, isVoluntario, isColaborador, modulePerms, canRH, canFinanceiro, canLogistica, canPatrimonio, canMembresia, canProjetos, canExpansao, canAgenda, canIA, canCuidados } = useAuth();
  const permMap = { canRH, canFinanceiro, canLogistica, canPatrimonio, canMembresia, canProjetos, canExpansao, canAgenda, canIA, canCuidados, isColaborador };

  // If permissions haven't loaded yet (modulePerms is null), show all items
  const permsLoaded = modulePerms !== null || isAdmin;

  const filteredNavItems = NAV_ITEMS.map(section => ({
    ...section,
    subMenus: section.subMenus.map(sub => ({
      ...sub,
      items: sub.items.filter(item => !item.perm || !permsLoaded || permMap[item.perm] !== false),
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
  const [notifs, setNotifs] = useState([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const prevNotifCount = useRef(-1);

  useEffect(() => {
    loadNotifCount();
    const interval = setInterval(loadNotifCount, 10000);
    return () => clearInterval(interval);
  }, []);

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
        <div className="flex items-center justify-between h-14 px-6 max-w-[1800px] mx-auto">
          {/* Left: Logo + Nav */}
          {/* Left: Logo */}
          <div className="flex items-center gap-2 min-w-[140px]">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src="/logo-cbrio-text.png" alt="CBRio" className="h-8 object-contain" />
            </button>
          </div>

          {/* Center: Navigation (hidden for volunteers) */}
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
            {/* Search trigger */}
            <button
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs hover:bg-accent transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Buscar</span>
              <kbd className="text-[10px] px-1 py-0.5 rounded bg-muted">⌘K</kbd>
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
    </div>
  );
}
