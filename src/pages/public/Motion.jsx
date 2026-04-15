import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, CalendarDays, FolderKanban, Users, DollarSign,
  Truck, Tag, BookOpen, ClipboardList, HandHelping, UsersRound,
  Sparkles, Brain, Compass, BarChart3, ChevronLeft, ChevronRight,
  Pause, Play, CheckCircle2, TrendingUp, Shield, Bell, Search,
  FileText, Zap, Globe,
} from 'lucide-react';

// ── Paleta por módulo ──────────────────────────────────────────────────────────
const SLIDES = [
  {
    id: 'intro',
    type: 'intro',
    title: 'Sistema Integrado',
    subtitle: 'CBRio',
    tagline: 'Uma plataforma completa para a gestão da sua igreja.',
    color: '#00B39D',
    bg: 'from-[#00B39D]/20 via-black to-black',
  },
  {
    id: 'dashboard',
    icon: LayoutGrid,
    title: 'Dashboard',
    subtitle: 'Visão Geral',
    desc: 'Central de comando com indicadores em tempo real de todos os módulos.',
    features: ['KPIs consolidados', 'Notificações inteligentes', 'Acesso rápido a qualquer módulo'],
    color: '#00B39D',
    bg: 'from-[#00B39D]/15 via-black to-black',
  },
  {
    id: 'eventos',
    icon: CalendarDays,
    title: 'Eventos',
    subtitle: 'Gestão de Eventos',
    desc: 'Planejamento completo do ciclo criativo: fases, tarefas, aprovações e KPIs.',
    features: ['Ciclo criativo por fases', 'Tarefas por área', 'Score de performance'],
    color: '#3b82f6',
    bg: 'from-[#3b82f6]/15 via-black to-black',
  },
  {
    id: 'projetos',
    icon: FolderKanban,
    title: 'Projetos',
    subtitle: 'Acompanhamento',
    desc: 'Gerencie iniciativas estratégicas com quadros Kanban, marcos e histórico.',
    features: ['Kanban visual', 'Marcos e prazos', 'Histórico de progresso'],
    color: '#f59e0b',
    bg: 'from-[#f59e0b]/15 via-black to-black',
  },
  {
    id: 'planejamento',
    icon: BarChart3,
    title: 'Planejamento',
    subtitle: 'Estratégia',
    desc: 'OKRs, metas e planos de ação vinculados à visão da Igreja.',
    features: ['OKRs e metas', 'Planos de ação', 'Acompanhamento periódico'],
    color: '#8b5cf6',
    bg: 'from-[#8b5cf6]/15 via-black to-black',
  },
  {
    id: 'rh',
    icon: Users,
    title: 'Recursos Humanos',
    subtitle: 'Pessoas & DP',
    desc: 'Colaboradores, contratos, férias, holerites e departamento pessoal.',
    features: ['Gestão de colaboradores', 'Folha e holerites', 'Férias e afastamentos'],
    color: '#a855f7',
    bg: 'from-[#a855f7]/15 via-black to-black',
  },
  {
    id: 'financeiro',
    icon: DollarSign,
    title: 'Financeiro',
    subtitle: 'Controle Financeiro',
    desc: 'Receitas, despesas, categorias, centros de custo e relatórios gerenciais.',
    features: ['Contas e transações', 'Categorias e centros de custo', 'Relatórios gerenciais'],
    color: '#10b981',
    bg: 'from-[#10b981]/15 via-black to-black',
  },
  {
    id: 'logistica',
    icon: Truck,
    title: 'Logística',
    subtitle: 'Compras & Pedidos',
    desc: 'Solicitações de compra, fornecedores, orçamentos e aprovações.',
    features: ['Fluxo de compras', 'Gestão de fornecedores', 'Aprovações por alçada'],
    color: '#ef4444',
    bg: 'from-[#ef4444]/15 via-black to-black',
  },
  {
    id: 'patrimonio',
    icon: Tag,
    title: 'Patrimônio',
    subtitle: 'Bens & Inventário',
    desc: 'Controle de bens, depreciação, manutenções e localização de ativos.',
    features: ['Inventário de bens', 'Controle de manutenção', 'QR Code de patrimônio'],
    color: '#6366f1',
    bg: 'from-[#6366f1]/15 via-black to-black',
  },
  {
    id: 'membresia',
    icon: BookOpen,
    title: 'Membresia',
    subtitle: 'Membros & Famílias',
    desc: 'Cadastro completo de membros, famílias, histórico e cartão digital.',
    features: ['Cadastro de membros', 'Núcleos familiares', 'Cartão digital de membro'],
    color: '#00B39D',
    bg: 'from-[#00B39D]/15 via-black to-black',
  },
  {
    id: 'voluntariado',
    icon: HandHelping,
    title: 'Voluntariado',
    subtitle: 'Escalas & Check-in',
    desc: 'Gestão de voluntários, escalas por área e check-in via QR Code ou totem.',
    features: ['Escalas por ministério', 'Check-in via QR Code', 'Painel do voluntário'],
    color: '#0ea5e9',
    bg: 'from-[#0ea5e9]/15 via-black to-black',
  },
  {
    id: 'grupos',
    icon: UsersRound,
    title: 'Grupos',
    subtitle: 'Ministerial',
    desc: 'Células, grupos de crescimento e ministérios com acompanhamento de frequência.',
    features: ['Grupos e células', 'Frequência e relatórios', 'Líderes e liderados'],
    color: '#f97316',
    bg: 'from-[#f97316]/15 via-black to-black',
  },
  {
    id: 'solicitacoes',
    icon: ClipboardList,
    title: 'Solicitações',
    subtitle: 'TI, Compras & Reembolso',
    desc: 'Canal unificado para solicitações internas com fluxo de aprovação.',
    features: ['Tipos configuráveis', 'Fluxo de aprovação', 'Histórico e status'],
    color: '#ec4899',
    bg: 'from-[#ec4899]/15 via-black to-black',
  },
  {
    id: 'ia',
    icon: Sparkles,
    title: 'Assistente IA',
    subtitle: 'Inteligência Artificial',
    desc: 'Assistente integrado ao sistema para respostas, análises e geração de conteúdo.',
    features: ['Chat contextual', 'Análise de dados', 'Geração de textos'],
    color: '#f59e0b',
    bg: 'from-[#f59e0b]/15 via-black to-black',
  },
  {
    id: 'cerebro',
    icon: Brain,
    title: 'Cérebro CBRio',
    subtitle: 'Base de Conhecimento',
    desc: 'Documentos do SharePoint transformados automaticamente em notas Obsidian.',
    features: ['Processamento automático', 'Vault Obsidian sincronizado', 'Classificação por IA'],
    color: '#a78bfa',
    bg: 'from-[#a78bfa]/15 via-black to-black',
  },
  {
    id: 'expansao',
    icon: Compass,
    title: 'Expansão',
    subtitle: 'Gestão de Expansão',
    desc: 'Acompanhamento de plantas, regiões e estratégias de crescimento da Igreja.',
    features: ['Mapa de regiões', 'Indicadores de alcance', 'Planos de expansão'],
    color: '#14b8a6',
    bg: 'from-[#14b8a6]/15 via-black to-black',
  },
  {
    id: 'closing',
    type: 'closing',
    title: 'Tudo em um só lugar.',
    subtitle: 'Sistema Integrado CBRio',
    tagline: 'Uma plataforma feita para a CBRio crescer com excelência.',
    color: '#00B39D',
    bg: 'from-[#00B39D]/20 via-black to-black',
    modules: ['Dashboard', 'Eventos', 'Projetos', 'RH', 'Financeiro', 'Logística', 'Patrimônio', 'Membresia', 'Voluntariado', 'Grupos', 'Solicitações', 'IA', 'Cérebro', 'Expansão'],
  },
];

const SLIDE_DURATION = 5500; // ms por slide

// ── Variantes de animação ──────────────────────────────────────────────────────
const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
};

const transition = { duration: 0.55, ease: [0.32, 0.72, 0, 1] };

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
};

// ── Componente de slide intro / closing ───────────────────────────────────────
function IntroSlide({ slide }) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full text-center px-8"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={fadeUp} className="mb-6">
        <img src="/logo-cbrio.svg" alt="CBRio" className="w-24 h-24 mx-auto drop-shadow-2xl" />
      </motion.div>
      <motion.p
        variants={fadeUp}
        className="text-sm font-semibold tracking-[0.3em] uppercase mb-3"
        style={{ color: slide.color }}
      >
        {slide.subtitle}
      </motion.p>
      <motion.h1
        variants={fadeUp}
        className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight"
      >
        {slide.title}
      </motion.h1>
      <motion.p variants={fadeUp} className="text-lg md:text-xl text-white/60 max-w-lg">
        {slide.tagline}
      </motion.p>
    </motion.div>
  );
}

// ── Componente de slide de módulo ─────────────────────────────────────────────
function ModuleSlide({ slide }) {
  const Icon = slide.icon;
  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full text-center px-8 max-w-2xl mx-auto"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {/* Ícone com glow */}
      <motion.div variants={fadeUp} className="mb-8 relative">
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-40 scale-150"
          style={{ background: slide.color }}
        />
        <div
          className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ background: `${slide.color}20`, border: `1.5px solid ${slide.color}40` }}
        >
          <Icon size={36} style={{ color: slide.color }} strokeWidth={1.5} />
        </div>
      </motion.div>

      {/* Subtítulo */}
      <motion.p
        variants={fadeUp}
        className="text-xs font-bold tracking-[0.3em] uppercase mb-2"
        style={{ color: slide.color }}
      >
        {slide.subtitle}
      </motion.p>

      {/* Título */}
      <motion.h2
        variants={fadeUp}
        className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight"
      >
        {slide.title}
      </motion.h2>

      {/* Descrição */}
      <motion.p variants={fadeUp} className="text-base md:text-lg text-white/55 mb-10 max-w-md">
        {slide.desc}
      </motion.p>

      {/* Features */}
      <motion.div variants={stagger} className="flex flex-col gap-3 w-full max-w-xs">
        {slide.features.map((f) => (
          <motion.div
            key={f}
            variants={fadeUp}
            className="flex items-center gap-3 text-sm text-white/70"
          >
            <CheckCircle2 size={15} style={{ color: slide.color, flexShrink: 0 }} />
            {f}
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ── Componente de slide closing ───────────────────────────────────────────────
function ClosingSlide({ slide }) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full text-center px-8"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      <motion.img variants={fadeUp} src="/logo-cbrio.svg" alt="CBRio" className="w-16 h-16 mx-auto mb-8 opacity-90" />
      <motion.h2
        variants={fadeUp}
        className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight"
      >
        {slide.title}
      </motion.h2>
      <motion.p
        variants={fadeUp}
        className="text-base text-white/55 mb-10 max-w-md"
      >
        {slide.tagline}
      </motion.p>

      {/* Grade de módulos */}
      <motion.div
        variants={stagger}
        className="flex flex-wrap justify-center gap-2 max-w-lg"
      >
        {slide.modules.map((m) => (
          <motion.span
            key={m}
            variants={fadeUp}
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: `${slide.color}18`, color: slide.color, border: `1px solid ${slide.color}35` }}
          >
            {m}
          </motion.span>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Motion() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef(null);
  const progressRef = useRef(null);
  const startRef = useRef(Date.now());

  const total = SLIDES.length;
  const slide = SLIDES[index];

  const goTo = useCallback((next) => {
    const dir = next > index ? 1 : -1;
    setDirection(dir);
    setIndex(((next % total) + total) % total);
    setProgress(0);
    startRef.current = Date.now();
  }, [index, total]);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Auto-play
  useEffect(() => {
    if (!playing) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(next, SLIDE_DURATION);
    return () => clearInterval(intervalRef.current);
  }, [playing, next]);

  // Progress bar (60fps)
  useEffect(() => {
    if (!playing) return;
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.min(elapsed / SLIDE_DURATION, 1));
    }, 16);
    return () => clearInterval(progressRef.current);
  }, [playing, index]);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      {/* Gradiente de fundo animado */}
      <AnimatePresence mode="sync">
        <motion.div
          key={`bg-${slide.id}`}
          className={`absolute inset-0 bg-gradient-to-br ${slide.bg}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        />
      </AnimatePresence>

      {/* Partículas decorativas */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full opacity-[0.04]"
            style={{
              width: 300 + i * 80,
              height: 300 + i * 80,
              left: `${10 + i * 15}%`,
              top: `${-10 + i * 20}%`,
              background: slide.color,
            }}
            animate={{ scale: [1, 1.08, 1], rotate: [0, 15, 0] }}
            transition={{ duration: 10 + i * 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* Logo topo-esquerda */}
      <div className="absolute top-5 left-6 z-20 flex items-center gap-2 opacity-50">
        <img src="/logo-cbrio-icon.png" alt="" className="h-6 w-6 object-contain" />
        <span className="text-xs font-semibold text-white/60 tracking-widest uppercase">CBRio</span>
      </div>

      {/* Número do slide */}
      <div className="absolute top-5 right-6 z-20 text-xs text-white/30 font-mono">
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>

      {/* Slides */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={slide.id}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
          className="absolute inset-0 flex items-center justify-center"
        >
          {slide.type === 'intro' && <IntroSlide slide={slide} />}
          {slide.type === 'closing' && <ClosingSlide slide={slide} />}
          {!slide.type && <ModuleSlide slide={slide} />}
        </motion.div>
      </AnimatePresence>

      {/* Controles */}
      <div className="absolute bottom-8 left-0 right-0 z-20 flex flex-col items-center gap-4 px-6">
        {/* Barra de progresso */}
        <div className="w-full max-w-sm h-[2px] bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: slide.color, width: `${progress * 100}%` }}
            transition={{ duration: 0 }}
          />
        </div>

        {/* Botões */}
        <div className="flex items-center gap-6">
          <button
            onClick={prev}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors text-white/40 hover:text-white hover:bg-white/10"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Dots */}
          <div className="flex items-center gap-1.5">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === index ? 18 : 5,
                  height: 5,
                  background: i === index ? slide.color : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>

          <button
            onClick={next}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors text-white/40 hover:text-white hover:bg-white/10"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Play/Pause */}
        <button
          onClick={() => setPlaying((p) => !p)}
          className="flex items-center gap-2 text-[11px] font-medium text-white/30 hover:text-white/60 transition-colors"
        >
          {playing ? <Pause size={11} /> : <Play size={11} />}
          {playing ? 'Pausar' : 'Reproduzir'}
          <span className="ml-1 opacity-50">· Espaço</span>
        </button>
      </div>
    </div>
  );
}
