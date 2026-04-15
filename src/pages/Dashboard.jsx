// v1.0.1
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { notificacoes as notifApi, rh, financeiro, patrimonio, logistica } from '../api';
import { StatisticsCard, StatisticsCardSkeleton } from '../components/ui/statistics-card';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Users, DollarSign, CalendarDays, FolderKanban,
  Truck, Tag, BookOpen, ClipboardList, Bell, ArrowRight,
  Clock, AlertTriangle, Package, ChevronRight, Sparkles,
  Activity, LayoutGrid, HandHelping,
} from 'lucide-react';

// path='VOLUNTARIADO_DYNAMIC' e tratado no click handler (vai para painel do
// voluntario ou visao admin conforme o perfil do usuario logado)
const MODULES = [
  { label: 'Recursos Humanos', desc: 'Colaboradores e DP', icon: Users, path: '/admin/rh', color: '#8b5cf6', perm: 'canRH' },
  { label: 'Financeiro', desc: 'Contas e transações', icon: DollarSign, path: '/admin/financeiro', color: '#10b981', perm: 'canFinanceiro' },
  { label: 'Eventos', desc: 'Gestão de eventos', icon: CalendarDays, path: '/eventos', color: '#3b82f6', perm: 'canAgenda' },
  { label: 'Projetos', desc: 'Acompanhamento', icon: FolderKanban, path: '/projetos', color: '#f59e0b', perm: 'canProjetos' },
  { label: 'Logística', desc: 'Compras e pedidos', icon: Truck, path: '/admin/logistica', color: '#ef4444', perm: 'canLogistica' },
  { label: 'Patrimônio', desc: 'Bens e inventário', icon: Tag, path: '/admin/patrimonio', color: '#6366f1', perm: 'canPatrimonio' },
  { label: 'Voluntariado', desc: 'Check-in, escalas e meu painel', icon: HandHelping, path: 'VOLUNTARIADO_DYNAMIC', color: '#00B39D' },
  { label: 'Membresia', desc: 'Membros e famílias', icon: BookOpen, path: '/ministerial/membresia', color: '#00B39D', perm: 'canMembresia' },
  { label: 'Solicitações', desc: 'TI, compras e reembolsos', icon: ClipboardList, path: '/solicitacoes', color: '#ec4899', perm: 'isColaborador' },
];

const SEV_COLORS = { urgente: '#ef4444', aviso: '#f59e0b', info: '#00B39D' };
const MOD_COLORS = { rh: '#8b5cf6', financeiro: '#10b981', logistica: '#ef4444', patrimonio: '#6366f1', eventos: '#3b82f6', projetos: '#f59e0b', sistema: '#6b7280' };
const MOD_LABELS = { rh: 'RH', financeiro: 'Financeiro', logistica: 'Logística', patrimonio: 'Patrimônio', eventos: 'Eventos', projetos: 'Projetos', sistema: 'Sistema' };

function NotifItem({ n, onClick }) {
  const sevColor = SEV_COLORS[n.severidade] || '#00B39D';
  const modColor = MOD_COLORS[n.modulo] || '#6b7280';
  const timeAgo = useMemo(() => {
    const diff = Date.now() - new Date(n.created_at).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }, [n.created_at]);

  return (
    <div
      onClick={onClick}
      className="p-3 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors cursor-pointer"
      style={{ borderLeft: `3px solid ${sevColor}` }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: modColor, background: `${modColor}15` }}>
          {MOD_LABELS[n.modulo] || n.modulo}
        </span>
        <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
      </div>
      <p className="text-sm font-medium text-foreground">{n.titulo}</p>
      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>
    </div>
  );
}

export default function Dashboard() {
  const { profile, isAdmin, isVoluntario, isColaborador, canRH, canFinanceiro, canLogistica, canPatrimonio, canAgenda, canProjetos, canMembresia } = useAuth();
  const navigate = useNavigate();

  const permMap = { canRH, canFinanceiro, canLogistica, canPatrimonio, canAgenda, canProjetos, canMembresia, isColaborador };
  const links = MODULES.filter(l => !l.perm || isAdmin || permMap[l.perm]);

  const handleModuleClick = (path) => {
    if (path === 'VOLUNTARIADO_DYNAMIC') {
      navigate(isVoluntario ? '/voluntariado/checkin/painel' : '/ministerial/voluntariado');
    } else {
      navigate(path);
    }
  };

  const [notifs, setNotifs] = useState([]);
  const [rhData, setRhData] = useState(null);
  const [finData, setFinData] = useState(null);
  const [patData, setPatData] = useState(null);
  const [logData, setLogData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const promises = [];
    promises.push(notifApi.list().then(setNotifs).catch(() => {}));
    if (canRH !== false) promises.push(rh.dashboard().then(setRhData).catch(() => {}));
    if (canFinanceiro !== false) promises.push(financeiro.dashboard().then(setFinData).catch(() => {}));
    if (canPatrimonio !== false) promises.push(patrimonio.dashboard().then(setPatData).catch(() => {}));
    if (canLogistica !== false) promises.push(logistica.dashboard().then(setLogData).catch(() => {}));
    Promise.allSettled(promises).finally(() => setLoading(false));
  }, []);

  const unread = notifs.filter(n => !n.lida);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = (profile?.name || '').split(' ')[0];

  const kpis = [];

  if (rhData) {
    kpis.push({ title: 'Colaboradores Ativos', value: rhData.ativos ?? rhData.total ?? 0, icon: Users, iconColor: '#8b5cf6', path: '/admin/rh' });
    if (rhData.ferias > 0) kpis.push({ title: 'Em Férias', value: rhData.ferias, icon: Clock, iconColor: '#f59e0b', path: '/admin/rh' });
  }

  if (finData) {
    const saldo = finData.saldo ?? finData.saldoTotal ?? 0;
    kpis.push({ title: 'Saldo Total', value: `R$ ${Number(saldo).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, icon: DollarSign, iconColor: '#10b981', path: '/admin/financeiro' });
    const vencendo = finData.contasVencendo ?? finData.contas_vencendo ?? 0;
    if (vencendo > 0) kpis.push({ title: 'Contas Vencendo', value: vencendo, icon: AlertTriangle, iconColor: '#ef4444', path: '/admin/financeiro' });
  }

  if (patData) {
    kpis.push({ title: 'Bens Cadastrados', value: patData.total ?? 0, icon: Package, iconColor: '#6366f1', path: '/admin/patrimonio' });
  }

  if (logData) {
    const pendentes = logData.pedidosPendentes ?? logData.pedidos_pendentes ?? 0;
    if (pendentes > 0) kpis.push({ title: 'Pedidos Pendentes', value: pendentes, icon: Truck, iconColor: '#ef4444', path: '/admin/logistica' });
  }

  if (unread.length > 0) {
    kpis.push({ title: 'Notificações', value: unread.length, icon: Bell, iconColor: '#00B39D' });
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="p-6 space-y-8">
      {/* Greeting */}
      <div>
        <p className="text-xs text-muted-foreground capitalize">{dateStr}</p>
        <h1 className="text-2xl font-bold text-foreground mt-1">{greeting}, {firstName}</h1>
      </div>

      {/* KPI Cards */}
      <section>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-primary" />
          Visão Geral
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => <StatisticsCardSkeleton key={i} />)}
          </div>
        ) : kpis.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 cbrio-stagger">
            {kpis.map((kpi, i) => (
              <StatisticsCard key={i} {...kpi} onClick={kpi.path ? () => navigate(kpi.path) : undefined} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum dado disponível no momento.</p>
        )}
      </section>

      {/* Quick access modules */}
      <section>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
          <LayoutGrid className="h-4 w-4 text-primary" />
          Acesso Rápido
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {links.map(link => {
            const Icon = link.icon;
            return (
              <button
                key={link.path}
                onClick={() => handleModuleClick(link.path)}
                className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card shadow-sm text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer w-full px-5 py-4"
              >
                <div className="rounded-lg p-2" style={{ background: `${link.color}18` }}>
                  <Icon className="h-5 w-5" style={{ color: link.color }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{link.label}</p>
                  <p className="text-xs text-muted-foreground">{link.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Notifications feed */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Atividade Recente
            {unread.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                {unread.length}
              </span>
            )}
          </h2>
          {notifs.length > 0 && (
            <button
              onClick={() => navigate('/admin/notificacao-regras')}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer"
            >
              Ver todas →
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : notifs.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="h-8 w-8 text-primary/40 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Tudo em dia</p>
            <p className="text-xs text-muted-foreground">Nenhuma notificação recente</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 cbrio-stagger">
            {notifs.slice(0, 12).map(n => (
              <NotifItem key={n.id} n={n} onClick={() => { if (n.link) navigate(n.link); }} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
