import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { notificacoes as notifApi, waInbox as waInboxApi } from '../../api';
import { supabase } from '../../supabaseClient';
import ChatIAFloating from './ChatIAFloating';
import FeedbackButton from '../FeedbackButton';
import PrimeiroAcessoSenhaModal from '../auth/PrimeiroAcessoSenhaModal';
import PrimeiroAcessoFotoModal from '../auth/PrimeiroAcessoFotoModal';
import FotoLightboxGlobal from '../FotoLightboxGlobal';
import { playNotificationSound, playMessageSound } from '../../lib/sounds';
import { proximoIntervalo, deveRecuar } from '@/lib/pollingResiliente';
import { isPushSupported, getCurrentSubscription, subscribePush, unsubscribePush } from '../../lib/pushNotifications';
import MegaMenu from '../ui/mega-menu';
import { CommandSearch } from '../ui/command-search';
import { navItemAllowed } from '../../lib/menuAccess';
import {
  Activity, ArrowRight, ArrowRightLeft, Baby, BarChart2, Bell, BellOff, BellRing, BookOpen, BrainCircuit, CalendarDays, Camera, Check, CheckCheck, ClipboardCheck, ClipboardList, Compass, DollarSign, Droplets, FileText, FolderKanban, GraduationCap, HandHelping, Heart, Landmark, LayoutDashboard, ListChecks, LogOut, Map, Megaphone, Menu as MenuIcon, MessageSquare, MonitorSmartphone, Moon, QrCode, Search, Settings, Shield, ShoppingCart, SlidersHorizontal, Sparkles, Sun, Tag, Target, TrendingUp, Truck, UserCheck, UserSearch, Users, UsersRound, Youtube, Filter,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
} from '../ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { GlobalChartGradients } from '../charts/ChartGradients';

/**
 * Polling que NÃO empilha e NÃO martela (incidente de 02/09/2026).
 *
 * ⚠️⚠️ O `setInterval(fn, 30000)` cru tinha dois defeitos que só aparecem
 * quando o servidor está mal — que é exatamente quando eles doem:
 *   1. dispara de novo mesmo com a anterior EM VOO (com o backend pendurando
 *      300 s, cada aba empilhava ~10 chamadas vivas por endpoint);
 *   2. mantém o ritmo fixo durante a queda, ajudando a afogar o banco que
 *      está tentando levantar.
 *
 * Usa `setTimeout` reagendado (não `setInterval`): é o que permite o intervalo
 * MUDAR entre um ciclo e outro.
 */
function usePollingResiliente(fn, ativo, deps) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    let timer = null;
    let emVoo = false;
    let falhas = 0;

    const ciclo = async () => {
      // ⚠️ Guarda de "em voo": é ela que impede o empilhamento.
      if (emVoo) { agenda(); return; }
      emVoo = true;
      try {
        await fnRef.current();
        falhas = 0;               // ⚠️ sucesso zera o recuo NA HORA
      } catch (e) {
        if (deveRecuar(e)) falhas += 1;
      } finally {
        emVoo = false;
        if (vivo) agenda();
      }
    };
    const agenda = () => {
      if (!vivo) return;
      clearTimeout(timer);
      timer = setTimeout(ciclo, proximoIntervalo(falhas));
    };

    ciclo();
    // Voltar pra aba ressincroniza na hora e ZERA o recuo: a pessoa está
    // olhando, e o cenário mais comum é o sistema já ter voltado.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      falhas = 0;
      ciclo();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      vivo = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}


const SEV_COLORS = { urgente: '#ef4444', aviso: '#f59e0b', info: '#00B39D' };
const MOD_COLORS = { rh: '#8b5cf6', financeiro: '#10b981', logistica: '#ef4444', patrimonio: '#6366f1', membresia: '#00B39D', eventos: '#3b82f6', projetos: '#ec4899', kpis: '#f97316', cuidados: '#ef476f', processos: '#00B39D', nps: '#06b6d4', sistema: '#6b7280' };
// Rótulo de exibição por módulo — cobre todo valor de `notificacoes.modulo` gravado
// pelo backend (ver grep de `modulo:` em backend/routes|services). Sem entrada aqui,
// o filtro cai no fallback do slug cru (minúsculo, sem acento).
const MOD_LABELS = {
  rh: 'RH', financeiro: 'Financeiro', logistica: 'Logística', patrimonio: 'Patrimônio',
  membresia: 'Membresia', eventos: 'Eventos', 'eventos-externos': 'Eventos Externos', inscricoes: 'Inscrições',
  projetos: 'Projetos', kpis: 'KPIs', cuidados: 'Cuidados', processos: 'Processos',
  nps: 'NPS', sistema: 'Sistema', integracao: 'Integração', next: 'NEXT',
  voluntariado: 'Voluntariado', grupos: 'Grupos', kids: 'Kids', batismos: 'Batismos',
  marketing: 'Marketing', producao: 'Produção', governanca: 'Governança', wifi: 'WiFi',
  administrativo: 'Administrativo', ti: 'TI', cerebro: 'Cérebro',
  apresentacoes: 'Apresentações', online: 'Online', conversas: 'Conversas',
  desconhecido: 'Desconhecido', tarefas: 'Tarefas', dashboard: 'Dashboard',
};

// Painel de notificações · agrupamento por data (Hoje / Ontem / …).
const ORDEM_GRUPOS_NOTIF = ['Hoje', 'Ontem', 'Últimos 7 dias', 'Anteriores'];
function grupoDaNotif(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Anteriores';
  const agora = new Date();
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const DIA = 86400000;
  if (t >= hoje0) return 'Hoje';
  if (t >= hoje0 - DIA) return 'Ontem';
  if (t >= hoje0 - 7 * DIA) return 'Últimos 7 dias';
  return 'Anteriores';
}
function tempoAtras(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

// 7 módulos macro · alinhados com o roadmap apresentado ao gestor
// (Staff · Administração · Inteligência · Planejamento · Ministerial · Cultos · Criativo)
// "Staff" (2026-08-14 · decisão do Marcos): Solicitações + Minhas Tarefas saíram do
// grupo Administração (que agora só reúne quem de fato usa RH/Financeiro/Logística/
// Patrimônio/Sistema/Permissões) e viraram grupo próprio, no topo do menu, porque
// são usados por TODO colaborador — pura reorganização de EXIBIÇÃO, sem mudança
// de módulo/permissão/rota (Solicitações segue perm 'isColaborador'; Minhas Tarefas
// segue sem module/perm, aberta a qualquer autenticado).
const NAV_ITEMS = [
  {
    id: 7,
    label: 'Staff',
    subMenus: [
      {
        title: 'Serviços',
        items: [
          { label: 'Solicitações', description: 'TI, compras, reembolso, espaços e férias', icon: ShoppingCart, path: '/solicitacoes', perm: 'isColaborador' },
          // Sem perm/module: página pessoal · visível pra qualquer autenticado
          { label: 'Minhas Tarefas', description: 'Suas tarefas pessoais — lista, kanban e calendário', icon: ListChecks, path: '/tarefas' },
        ],
      },
    ],
  },
  {
    id: 1,
    label: 'Administração',
    subMenus: [
      {
        title: 'Gestão',
        items: [
          { label: 'Recursos Humanos', description: 'Funcionários, treinamentos e férias', icon: Users, path: '/admin/rh', perm: 'canRH' },
          { label: 'Financeiro', description: 'Contas, transações e reembolsos', icon: DollarSign, path: '/admin/financeiro', perm: 'canFinanceiro' },
          // Campanhas fica ao lado do Financeiro (não em Planejamento): quem lê a
          // arrecadação é quem já lê o caixa, e a matriz de permissão do módulo foi
          // semeada da do financeiro. `module:` (não `perm:`) — quem decide é a matriz.
          { label: 'Campanhas', description: 'Arrecadação · meta, dígito verificador, cronograma e disparos', icon: Target, path: '/campanhas', module: 'campanhas' },
          { label: 'Logística', description: 'Fornecedores, compras e pedidos', icon: Truck, path: '/admin/logistica', perm: 'canLogistica' },
          { label: 'Patrimônio', description: 'Bens, localizações e inventário', icon: Tag, path: '/admin/patrimonio', perm: 'canPatrimonio' },
        ],
      },
      {
        title: 'Configurações',
        items: [
          { label: 'Sistema', description: 'Centro de controle técnico, automações, integrações e releases', icon: Settings, path: '/sistema', superAdminOnly: true },
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
          { label: 'Monitoramento OKR', description: 'Planejamento estratégico 2026 · NSM, 9 OKRs e indicadores táticos', icon: Compass, path: '/monitoramento-okr' },
          // ⚠️ `module: 'membresia'` acrescentado em 20/08: a tela lista PESSOAS
          // (`GET /jornada/membros`), e aquele endpoint passou a exigir nível 2.
          // Sem isto o item aparece pra quem depois toma 403 — item de menu que
          // não abre é pior que item ausente.
          { label: 'Jornada da Igreja', description: 'Profundidade da igreja · 5 valores · Membro Modelo (≥2 valores)', icon: Sparkles, path: '/jornada', module: 'membresia' },
          { label: 'Dashboard Semanal', description: 'Painel da reunião de quarta · semanal · mensal · metas · gerador IA', icon: LayoutDashboard, path: '/dashboard-semanal' },
          { label: 'ATA Semanal', description: 'Ata da reunião ministerial de segunda · redigida a partir da gravação', icon: FileText, path: '/ata-semanal' },
        ],
      },
      {
        title: 'Análise',
        items: [
          // ⚠️ Entrou no menu em 20/08/2026. A tela existia desde MAIO e nunca teve
          // item — só abria digitando /admin/cruzamentos. É a lei "tela fora do
          // menu é tela invisível": o Matheus pediu critérios novos nela e depois
          // perguntou onde a funcionalidade estava.
          // `module: 'membresia'` espelha o guard do servidor (jornada.js). Fica em
          // Inteligência (decisão dele) porque quem pergunta "quantos voluntários
          // são batizados" procura em análise, não em Administração.
          { label: 'Cruzamentos', description: 'Cruza batismo, NEXT, conversão, grupos e voluntariado · quem está onde', icon: Filter, path: '/admin/cruzamentos', module: 'membresia' },
          { label: 'NPS', description: 'Pesquisas de satisfação geradas por IA · análise automática', icon: MessageSquare, path: '/nps', module: 'nps' },
          { label: 'Censo', description: 'Perfil demográfico e engajamento da comunidade · pesquisas próprias', icon: ClipboardList, path: '/censo', module: 'censo' },
          { label: 'Links e QR', description: 'QR que não precisa ser reimpresso · o código fica, o destino muda', icon: QrCode, path: '/links', module: 'links' },
          { label: 'Gestão (PMO)', description: 'Pulso · Estrutura OKR · Saúde · Configurar (admin)', icon: Settings, path: '/gestao', perm: 'isAdmin' },
          { label: 'Agentes & Auditoria', description: 'Time de agentes: equipe, fila de aprovação e job descriptions · super-admins', icon: BrainCircuit, path: '/assistente-ia', perm: 'isSuperAdmin' },
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
          // "Eventos Externos" saiu do menu na virada pro /inscricoes (SPEC-04 · 2026-07-28); a rota redireciona.
          { label: 'Inscrições', description: 'Módulo central de inscrições · calendário, eventos, séries e sorteios', icon: CalendarDays, path: '/inscricoes', module: 'inscricoes' },
          { label: 'Projetos', description: 'Acompanhamento de projetos com Kanban/Gantt', icon: FolderKanban, path: '/projetos', perm: 'canProjetos' },
          { label: 'Propostas', description: 'Ciclo anual de propostas de projetos, eventos e rotinas', icon: ClipboardCheck, path: '/propostas', module: 'propostas' },
          { label: 'Planejamento Estratégico', description: 'Plano plurianual · etapas e marcos (vigente: Expansão 2026–2029)', icon: Map, path: '/expansao', module: 'expansao' },
          { label: 'Planejamento Anual', description: 'Propostas do ciclo · avaliação pelas diretorias · decisão do Pastor · calendário e orçamento', icon: CalendarDays, path: '/planejamento-anual', module: 'planejamento-anual' },
        ],
      },
      {
        title: 'Governança',
        items: [
          { label: 'Governança', description: 'Ciclo de reuniões da diretoria · pauta, documentos e atas', icon: Landmark, path: '/governanca', module: 'governanca' },
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
          // ⚠️ 'Next' e 'Batismo' SAÍRAM daqui em 03/09/2026 (pedido do Matheus): os dois
          // já vivem como ABA desta página — `/ministerial/next` era só um redirect pra
          // `?tab=next`, e `/batismo` renderiza o MESMO componente `Batismos` que a aba.
          // ⚠️ As ROTAS ficam (link salvo, push e deep link continuam abrindo). Tirar do
          // menu é tirar do NAV_ITEMS, nunca da rota — quem decide acesso é o ModuleGuard.
          { label: 'Integração', description: 'Cultos, decisões, batismos e Next', icon: UserCheck, path: '/ministerial/integracao', module: 'integracao' },
          { label: 'Membresia', description: 'Cadastros, trilha dos valores e Jornada', icon: BookOpen, path: '/ministerial/membresia', perm: 'canMembresia' },
          { label: 'Cuidados', description: 'Capelania e aconselhamento', icon: Heart, path: '/ministerial/cuidados', module: 'cuidados' },
          { label: 'Comunicação', description: 'Central de WhatsApp · chat, envios, templates, atendentes e relatórios', icon: MessageSquare, path: '/comunicacao', module: 'comunicacao' },
          { label: 'Grupos', description: 'Grupos de conexão · pedidos · QR · mapa', icon: UsersRound, path: '/grupos', module: 'grupos' },
          { label: 'Voluntariado', description: 'Check-in, escalas e QR codes', icon: HandHelping, path: '/ministerial/voluntariado', module: 'voluntariado' },
          { label: 'Entradas', description: 'Porta de entrada · uma pessoa = um cadastro · liga inscrição ao membro e funde duplicados', icon: UserSearch, path: '/entradas', module: 'next-batismo' },
        ],
      },
      {
        title: 'Ferramentas',
        items: [
          { label: 'Totem Membro', description: 'Modo kiosk para self-service no hall', icon: MonitorSmartphone, path: '/totem', module: 'totem-membro' },
          { label: 'Operacional Kids', description: 'Operação de culto · check-in, crianças, painel ao vivo, etiqueta, config', icon: Baby, path: '/ministerial/kids', module: 'kids' },
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
          { label: 'Online', description: 'Visão do canal YouTube e séries de pregação', icon: Youtube, path: '/online', module: 'online' },
          { label: 'Kids · Indicadores', description: 'Gestão do ministério (vínculos, equipe, estoque...) + KPIs e saúde', icon: Baby, path: '/kids', module: 'kids' },
          { label: 'AMI', description: 'Indicadores do culto AMI', icon: GraduationCap, path: '/ami', module: 'ami' },
          { label: 'Bridge', description: 'Indicadores do culto Bridge', icon: ArrowRightLeft, path: '/bridge', module: 'bridge' },
        ],
      },
    ],
  },
  {
    id: 6,
    label: 'Criativo',
    subMenus: [
      {
        title: 'Demandas criativas',
        items: [
          { label: 'Marketing', description: 'Kanban de demandas criativas · capacidade · analytics', icon: Megaphone, path: '/marketing', module: 'marketing' },
          { label: 'Produção de Culto', description: 'Indicadores técnicos por culto · solicitações · desempenho', icon: SlidersHorizontal, path: '/producao', module: 'producao' },
          // ⚠️ "App de membros" (comunicados do mural · destaques da Home · fotos
          // de batismo) NÃO tem item de menu próprio (21/08): é só a aba "App"
          // dentro de Marketing. A rota /marketing/app e os redirects continuam
          // valendo — não recriar aqui.
        ],
      },
    ],
  },
];

export default function AppShell() {
  const auth = useAuth();
  const { profile, role, signOut, isAdmin, isVoluntario, rotaTravada, moduloTravado, travaPrefixos } = auth;
  const labelTravado = moduloTravado ? moduloTravado.charAt(0).toUpperCase() + moduloTravado.slice(1) : '';

  // Visibilidade de item de menu · navItemAllowed (src/lib/menuAccess) espelha
  // o ModuleGuard das rotas (src/App.tsx) e é compartilhado com a busca ⌘K
  // (CommandSearch), pra que um módulo inacessível nunca apareça em nenhum dos dois.
  const itemAllowed = (item) => {
    return navItemAllowed(item, auth);
  };

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
  const location = useLocation();

  // Login travado num módulo (quiosque): qualquer rota fora dos prefixos do
  // módulo redireciona de volta — o usuário só consegue ficar na tela dele
  // (ex.: Marcelo só /batismo; totem Kids no hub + /ministerial/totem-kids).
  useEffect(() => {
    if (!rotaTravada) return;
    const permitidos = travaPrefixos || [rotaTravada];
    if (!permitidos.some((p) => location.pathname.startsWith(p))) {
      navigate(rotaTravada, { replace: true });
    }
  }, [rotaTravada, travaPrefixos, location.pathname, navigate]);

  const initials = (profile?.name || '??')
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const [notifCount, setNotifCount] = useState(0);
  const [waUnread, setWaUnread] = useState(0);
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
        else if (r === 'denied') alert('Você bloqueou notificações neste navegador. Habilite nas configurações do site.');
        else if (r === 'no_vapid') alert('Push ainda não foi configurado pelo administrador.');
        else if (r === 'unsupported') alert('Este navegador não suporta notificações push.');
        else alert('Não foi possível ativar notificações.');
      }
    } finally { setPushBusy(false); }
  };
  const [notifs, setNotifs] = useState([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const [notifAberta, setNotifAberta] = useState(null); // pop-up com a mensagem completa
  const [notifFiltro, setNotifFiltro] = useState('todas'); // 'todas' | 'nao_lidas' | slug de módulo
  const prevNotifCount = useRef(-1);

  // Abas de módulo dinâmicas: os módulos presentes na lista carregada (mais frequentes primeiro).
  const notifModTabs = useMemo(() => {
    const cont = {};
    notifs.forEach(n => { const m = n.modulo || 'sistema'; cont[m] = (cont[m] || 0) + 1; });
    return Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m]) => m);
  }, [notifs]);

  const notifNaoLidas = useMemo(() => notifs.filter(n => !n.lida).length, [notifs]);

  // Lista filtrada pela aba ativa + agrupada por data.
  const notifGrupos = useMemo(() => {
    const filtradas = notifs.filter(n => {
      if (notifFiltro === 'todas') return true;
      if (notifFiltro === 'nao_lidas') return !n.lida;
      return (n.modulo || 'sistema') === notifFiltro;
    });
    const mapa = {};
    filtradas.forEach(n => { const g = grupoDaNotif(n.created_at); (mapa[g] = mapa[g] || []).push(n); });
    return ORDEM_GRUPOS_NOTIF.filter(g => mapa[g]?.length).map(g => ({ label: g, items: mapa[g] }));
  }, [notifs, notifFiltro]);

  // ⚠️ Polling com guarda de "em voo" + recuo no erro (incidente de 02/09/2026).
  // Cobre o refoco da aba também. Realtime segue entregando em < 1 s; isto é
  // só a rede de segurança que ressincroniza o que o WebSocket perder.
  usePollingResiliente(loadNotifCount, true, []);

  // Realtime · escuta INSERTs em `notificações` filtrado pelo usuário logado.
  // Quando uma nova chega, toca o som, incrementa o badge e (se o dropdown
  // já estiver aberto) prepend na lista sem precisar refazer fetch.
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
            // Mantem o ref sincronizado pro polling subsequente não tocar som de novo
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
      .subscribe((status) => {
        // A cada (re)conexão do canal, ressincroniza o contador pra recuperar
        // eventos que tenham chegado enquanto o socket estava fora do ar.
        if (status === 'SUBSCRIBED') loadNotifCount();
      });
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
    } catch (e) {
      // ⚠️⚠️ RELANÇA de propósito: o `catch` mudo engolia a falha e o polling
      // nunca sabia que o servidor estava mal — era isso que mantinha o ritmo
      // fixo de 30 s durante a queda. O badge continua degradando sozinho
      // (fica no último valor); quem decide o recuo é o hook.
      throw e;
    }
  }

  // ── Conversas (WhatsApp) · badge dedicado no header ──────────────────
  // Mensagens do inbox NÃO poluem o sino: têm o próprio ícone. Contador é o
  // total de não-lidas do ESCOPO do usuário (área/atribuição). Realtime + poll.
  // Gate pelo DESTINO: o sino navega pra /comunicacao — gate por 'conversas'
  // deixava quem tem conversas sem comunicacao clicando num beco (ModuleGuard
  // quicava pro dashboard). O polling das não-lidas segue no backend de
  // 'conversas'; se faltar, degrada pra badge 0 (o catch já zera).
  const podeConversas = itemAllowed({ module: 'comunicacao' });
  const prevWaUnread = useRef(-1);
  async function loadWaUnread() {
    try {
      const r = await waInboxApi.naoLidas();
      const total = r?.total || 0;
      // toca o plim quando o total sobe (mensagem nova no escopo do usuário) ·
      // funciona em qualquer tela, não só dentro de /conversas.
      if (total > 0 && prevWaUnread.current >= 0 && total > prevWaUnread.current) playMessageSound();
      prevWaUnread.current = total;
      setWaUnread(total);
    } catch (e) {
      // ⚠️ Sem permissão no módulo (403) NÃO é falha de infra: o hook trata
      // isso em `deveRecuar` e segue no ritmo normal. Relançar é o que permite
      // essa distinção — o catch mudo tratava 403 e banco-fora igual.
      throw e;
    }
  }
  useEffect(() => {
    if (!podeConversas) { setWaUnread(0); return; }
    // ⚠️ polling e refoco: `usePollingResiliente` (abaixo)
    let ch = null;
    if (supabase && profile?.id) {
      ch = supabase.channel(`wa-unread:${profile.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_mensagens' }, () => { loadWaUnread().catch(() => {}); })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wa_conversas' }, () => { loadWaUnread().catch(() => {}); })
        .subscribe();
    }
    return () => {

      if (ch) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeConversas, profile?.id]);

  // ⚠️ Mesmo polling resiliente do sino. `ativo = podeConversas`: quem não tem
  // o módulo não fica batendo num endpoint que responde 403.
  usePollingResiliente(loadWaUnread, podeConversas, [podeConversas]);

  const loadNotifs = useCallback(async () => {
    setNotifsLoading(true);
    try {
      const data = await notifApi.list();
      setNotifs(data || []);
    } catch { /* ignore */ }
    setNotifsLoading(false);
  }, []);

  // Marca UMA notificação como lida (botão ✓ da linha ou ao clicar pra abrir).
  async function marcarLida(n, e) {
    e?.stopPropagation();
    if (n.lida) return;
    try {
      await notifApi.ler(n.id);
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, lida: true } : x));
      setNotifCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  }

  async function handleNotifClick(n) {
    await marcarLida(n);
    // Avisos (e notificações sem página de destino) abrem a MENSAGEM COMPLETA
    // num pop-up — a prévia da lista corta em 2 linhas. As demais continuam
    // navegando direto pro link (fluxos de aprovação etc).
    const ehAviso = (n.tipo || '').startsWith('aviso') || n.modulo === 'sistema' || !n.link;
    setNotifOpen(false);
    if (ehAviso) {
      setNotifAberta(n);
      return;
    }
    navigate(n.link);
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
    <div className="min-h-screen" style={{ background: 'transparent' }}>
      <GlobalChartGradients />
      <CommandSearch />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-card/40 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/30">
        <div className="flex items-center justify-between h-14 px-4 md:px-6 max-w-[1800px] mx-auto gap-2">
          {/* Left: Menu mobile + Logo */}
          <div className="flex items-center gap-2">
            {/* Hamburger · so mobile (desktop usa MegaMenu) */}
            {!isVoluntario && !rotaTravada && (
              <MobileNavSheet items={filteredNavItems} />
            )}
            <button onClick={() => navigate(rotaTravada || '/dashboard')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src="/logo-cbrio-text.png" alt="CBRio" className="h-8 object-contain" />
            </button>
          </div>

          {/* Center: Navigation desktop · CENTRALIZADA (como sempre foi — o
              pedido de alinhamento de 13/07 era das ABAS do /grupos, não daqui).
              Escondida no mobile (vai pro Sheet). */}
          {!isVoluntario && !rotaTravada && (
            <div className="flex-1 flex justify-center" data-tour="megamenu">
              <MegaMenu items={filteredNavItems} role={role} />
            </div>
          )}
          {isVoluntario && !rotaTravada && (
            <div className="flex-1 flex justify-center">
              <span className="text-sm font-medium text-muted-foreground">Voluntariado</span>
            </div>
          )}
          {rotaTravada && (
            <div className="flex-1 flex justify-center">
              <span className="text-sm font-medium text-muted-foreground">{labelTravado}</span>
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Search trigger · mobile so icon, desktop com texto + ⌘K */}
            <button
              data-tour="search"
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

            {/* Conversas (WhatsApp) · badge próprio, fora do sino */}
            {podeConversas && (
              <button
                onClick={() => navigate('/comunicacao?tab=conversas')}
                className="relative p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
                title="Conversas (WhatsApp)"
              >
                <MessageSquare className="h-4 w-4" />
                {waUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center cbrio-badge-pulse px-1">
                    {waUnread > 9 ? '9+' : waUnread}
                  </span>
                )}
              </button>
            )}

            {/* Theme toggle */}
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Notifications */}
            <DropdownMenu open={notifOpen} onOpenChange={(v) => { setNotifOpen(v); if (v) { loadNotifs(); setNotifFiltro('todas'); } }}>
              <DropdownMenuTrigger asChild>
                <button data-tour="notifications" className="relative p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
                  <Bell className="h-4 w-4" />
                  {notifCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center cbrio-badge-pulse px-1">
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[400px] max-w-[calc(100vw-16px)] p-0 overflow-hidden" sideOffset={8}>
                {/* Cabeçalho */}
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-foreground">Notificações</span>
                    {notifNaoLidas > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary tabular-nums">
                        {notifNaoLidas} nova{notifNaoLidas > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {pushSupported && (
                      <button
                        onClick={togglePush}
                        disabled={pushBusy}
                        className="p-1.5 rounded-md hover:bg-accent transition-colors"
                        style={{ color: pushSubscribed ? '#00B39D' : 'var(--cbrio-text3)' }}
                        title={pushSubscribed ? 'Desativar notificações no celular/desktop' : 'Ativar notificações no celular/desktop'}
                      >
                        {pushSubscribed ? <BellRing className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button onClick={() => { setNotifOpen(false); navigate('/admin/notificacao-regras'); }} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground" title="Configurar regras">
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Abas de filtro */}
                <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto scrollbar-hide border-b border-border">
                  {[
                    { id: 'todas', label: 'Todas' },
                    { id: 'nao_lidas', label: `Não lidas${notifNaoLidas ? ` (${notifNaoLidas})` : ''}` },
                    ...notifModTabs.map(m => ({ id: m, label: MOD_LABELS[m] || m })),
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setNotifFiltro(t.id)}
                      className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                        notifFiltro === t.id
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Lista agrupada por data */}
                <div className="max-h-[420px] overflow-y-auto overscroll-contain">
                  {notifsLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
                    </div>
                  ) : notifGrupos.length === 0 ? (
                    <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/60">
                        <Bell className="h-5 w-5 opacity-50" />
                      </span>
                      <span className="text-xs font-medium">
                        {notifs.length === 0 ? 'Nenhuma notificação por aqui' : 'Nada nesse filtro'}
                      </span>
                      {notifs.length === 0 && <span className="text-[11px] opacity-70">Quando algo precisar de você, aparece aqui.</span>}
                    </div>
                  ) : (
                    <div className="pb-1">
                      {notifGrupos.map(grupo => (
                        <div key={grupo.label}>
                          <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 sticky top-0 bg-popover/95 backdrop-blur-sm z-10">
                            {grupo.label}
                          </div>
                          {grupo.items.map(n => {
                            const sevColor = SEV_COLORS[n.severidade] || '#00B39D';
                            const modColor = MOD_COLORS[n.modulo] || '#6b7280';
                            return (
                              <div
                                key={n.id}
                                onClick={() => handleNotifClick(n)}
                                className="group relative px-4 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer"
                                style={{ borderLeft: `3px solid ${n.lida ? 'transparent' : sevColor}`, background: n.lida ? undefined : 'var(--cbrio-input-bg)' }}
                              >
                                <div className="flex items-start gap-2.5">
                                  <span
                                    className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                                    style={{ color: modColor, background: `${modColor}18` }}
                                    title={MOD_LABELS[n.modulo] || n.modulo}
                                  >
                                    {(MOD_LABELS[n.modulo] || n.modulo || '?').slice(0, 2).toUpperCase()}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <p className={`text-sm leading-snug truncate ${n.lida ? 'text-muted-foreground' : 'text-foreground font-semibold'}`}>{n.titulo}</p>
                                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{tempoAtras(n.created_at)}</span>
                                    </div>
                                    {n.mensagem && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>}
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className="text-[10px] font-semibold px-1.5 py-px rounded" style={{ color: modColor, background: `${modColor}12` }}>
                                        {MOD_LABELS[n.modulo] || n.modulo}
                                      </span>
                                      {n.severidade === 'urgente' && (
                                        <span className="text-[10px] font-semibold px-1.5 py-px rounded text-red-500 bg-red-500/10">Urgente</span>
                                      )}
                                    </div>
                                  </div>
                                  {!n.lida && (
                                    <span className="mt-2 flex shrink-0 items-center">
                                      <button
                                        onClick={(e) => marcarLida(n, e)}
                                        title="Marcar como lida"
                                        className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full text-primary hover:bg-primary/15"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </button>
                                      <span className="group-hover:hidden h-2 w-2 rounded-full bg-primary" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rodapé */}
                {notifNaoLidas > 0 && (
                  <div className="border-t border-border px-3 py-2">
                    <button onClick={handleLerTodas} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded-md py-1.5 transition-colors">
                      <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
                    </button>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User menu */}
            <button data-tour="user-menu" onClick={() => navigate('/perfil')} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent transition-colors">
              <Avatar className="h-7 w-7">
                {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={profile.name || ''} /> : null}
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
      {/* pb-24: respiro no rodapé pra o conteúdo rolar ACIMA dos botões
          flutuantes (Reportar/IA), que são position:fixed e cobriam a última
          linha de tabelas/listas. */}
      <main className="max-w-[1800px] mx-auto pb-24">
        <Outlet />
      </main>

      <ChatIAFloating />
      <FeedbackButton />
      <PrimeiroAcessoSenhaModal />
      <PrimeiroAcessoFotoModal />
      <FotoLightboxGlobal />

      {/* Pop-up de notificação · mensagem completa (avisos) */}
      <Dialog open={!!notifAberta} onOpenChange={(v) => { if (!v) setNotifAberta(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  color: MOD_COLORS[notifAberta?.modulo] || '#6b7280',
                  background: `${MOD_COLORS[notifAberta?.modulo] || '#6b7280'}15`,
                }}
              >
                {MOD_LABELS[notifAberta?.modulo] || notifAberta?.modulo || 'Aviso'}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {notifAberta ? new Date(notifAberta.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
            <DialogTitle className="text-left leading-snug">{notifAberta?.titulo}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{notifAberta?.mensagem}</p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setNotifAberta(null)}>Fechar</Button>
            {notifAberta?.link && (
              <Button onClick={() => { const l = notifAberta.link; setNotifAberta(null); navigate(l); }}>
                Abrir página
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MobileNavSheet · drawer lateral pra navegar em telas pequenas
// Visível so < md (768px) · desktop usa MegaMenu no centro do header.
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
    // modal={false}: por padrão o Radix BLOQUEIA toda interação fora do Sheet
    // enquanto aberto (é assim que ele impede clique "vazar" pro fundo) — isso
    // fazia o toque no Reportar/IA realocados (que ficam FORA do Sheet de
    // propósito) ser descartado mesmo com onPointerDownOutside prevenindo o
    // fechamento (prevenia o dismiss, mas não devolvia a interatividade).
    // Sem o modal, a faixa livre à direita fica genuinamente clicável.
    <Sheet open={open} onOpenChange={setOpen} modal={false}>
      <SheetTrigger asChild>
        <button
          data-tour="megamenu"
          className="md:hidden p-2 rounded-lg hover:bg-accent transition-colors text-foreground"
          aria-label="Abrir menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-80 max-w-[85vw] overflow-y-auto p-0"
        // Reportar/IA ficam realocados na faixa livre à direita enquanto o
        // drawer está aberto (ver useOverlayAberto.js) — sem isso, o Radix
        // trata o toque neles como "clique fora" e fecha o drawer ANTES do
        // onClick do botão rodar (o botão "pula" de posição no meio do toque
        // e o relatório nunca abre — achado do usuário 2026-07-27).
        onPointerDownOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('.floating-action-btn')) {
            e.preventDefault();
          }
        }}
      >
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
