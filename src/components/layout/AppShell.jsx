import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { notificacoes as notifApi } from '../../api';
import MegaMenu from '../ui/mega-menu';
import { CommandSearch } from '../ui/command-search';
import {
  Users, DollarSign, Truck, Tag,
  CalendarDays, FolderKanban, Map,
  UserCheck, UsersRound, Heart, HandHelping, BookOpen,
  Megaphone, BrainCircuit, ShoppingCart,
  Sun, Moon, Bell, LogOut, Search,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
} from '../ui/dropdown-menu';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback } from '../ui/avatar';

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
          { label: 'Solicitar Compra', description: 'Peça materiais ou serviços', icon: ShoppingCart, path: '/solicitar-compra' },
        ],
      },
      {
        title: 'Inteligência',
        items: [
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
          { label: 'Grupos', description: 'Dashboard, inscrição e material', icon: UsersRound, path: '/ministerial/grupos' },
          { label: 'Cuidados', description: 'Capelania e aconselhamento', icon: Heart, path: '/ministerial/cuidados' },
          { label: 'Voluntariado', description: 'Check-in e lista de voluntários', icon: HandHelping, path: '/ministerial/voluntariado' },
          { label: 'Membresia', description: 'Cadastro e trilha dos valores', icon: BookOpen, path: '/ministerial/membresia' },
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
  const { profile, role, signOut, isAdmin, canRH, canFinanceiro, canLogistica, canPatrimonio, canMembresia, canProjetos, canExpansao, canAgenda, canIA } = useAuth();
  const permMap = { canRH, canFinanceiro, canLogistica, canPatrimonio, canMembresia, canProjetos, canExpansao, canAgenda, canIA };

  const filteredNavItems = NAV_ITEMS.map(section => ({
    ...section,
    subMenus: section.subMenus.map(sub => ({
      ...sub,
      items: sub.items.filter(item => !item.perm || permMap[item.perm] !== false),
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

  useEffect(() => {
    loadNotifCount();
    const interval = setInterval(loadNotifCount, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadNotifCount() {
    try {
      const { count } = await notifApi.count();
      setNotifCount(count);
    } catch { /* backend might not be ready */ }
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
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                C
              </div>
              <span className="text-sm font-bold text-foreground hidden sm:inline">CBRio ERP</span>
            </button>
            <MegaMenu items={filteredNavItems} role={role} />
          </div>

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
            <button
              onClick={() => navigate('/admin/notificacao-regras')}
              className="relative p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
            >
              <Bell className="h-4 w-4" />
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center cbrio-badge-pulse px-1">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>

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
