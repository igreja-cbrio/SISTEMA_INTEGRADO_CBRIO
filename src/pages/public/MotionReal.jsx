import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pause, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { FakeHeader, C, DW, DH, HH } from '../../components/motion/MotionShell';
import DashboardScene from '../../components/motion/scenes/Dashboard';
import EventosScene from '../../components/motion/scenes/Eventos';
import FinanceiroScene from '../../components/motion/scenes/Financeiro';
import MembresiaScene from '../../components/motion/scenes/Membresia';
import RHScene from '../../components/motion/scenes/RH';

// ── Utilitário de delay ────────────────────────────────────────────────────────
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ── Definição das cenas ────────────────────────────────────────────────────────
// Cursor em coordenadas absolutas do viewport demo (DW x DH)
// HH=52px é o header; conteúdo começa em y=52
const SCENES = [
  {
    id: 'dashboard',
    nav: null,
    navHighlight: null,
    Component: DashboardScene,
    label: 'Dashboard',
    steps: [
      // Hover no card "Saldo Total" (2º KPI, ~x=334 y=196)
      { x: 334, y: 196, click: false, pause: 600 },
      { x: 334, y: 196, click: true,  pause: 500 },
      // Move para card "Notificações" (5º KPI)
      { x: 975, y: 196, click: true,  pause: 700 },
      // Clica no item de notif "Financeiro"
      { x: 950, y: 415, click: true,  pause: 600 },
      // Sobe até nav "Projetos e Eventos"
      { x: 505, y: 26,  click: true,  pause: 300 },
    ],
  },
  {
    id: 'eventos',
    nav: 'Projetos e Eventos',
    Component: EventosScene,
    label: 'Eventos',
    steps: [
      // Hover no filtro "Em planejamento"
      { x: 230, y: 152, click: true, pause: 600 },
      // Clica na linha "Conferência de Jovens"
      { x: 450, y: 256, click: true, pause: 800 },
      // Clica em "Ver →" da linha
      { x: 1120, y: 256, click: true, pause: 600 },
      // Move para "Administrativo" no nav
      { x: 370, y: 26, click: true, pause: 400 },
    ],
  },
  {
    id: 'financeiro',
    nav: 'Administrativo',
    Component: FinanceiroScene,
    label: 'Financeiro',
    steps: [
      // Hover no card "Saldo Total"
      { x: 235, y: 200, click: true, pause: 700 },
      // Clica na transação "Dízimos Domingo"
      { x: 500, y: 375, click: true, pause: 700 },
      // Clica em "+ Nova Transação"
      { x: 1125, y: 84, click: true, pause: 800 },
      // Move para "Ministerial" no nav
      { x: 660, y: 26, click: true, pause: 400 },
    ],
  },
  {
    id: 'membresia',
    nav: 'Ministerial',
    Component: MembresiaScene,
    label: 'Membresia',
    steps: [
      // Clica no campo de busca
      { x: 175, y: 288, click: true, pause: 600 },
      // Clica na linha "Ana Paula Santos"
      { x: 450, y: 380, click: true, pause: 800 },
      // Clica em "Ver →"
      { x: 1120, y: 380, click: true, pause: 700 },
      // Move para "Administrativo" → RH
      { x: 370, y: 26, click: true, pause: 400 },
    ],
  },
  {
    id: 'rh',
    nav: 'Administrativo',
    Component: RHScene,
    label: 'RH',
    steps: [
      // Hover no card "Total"
      { x: 182, y: 195, click: true, pause: 700 },
      // Clica na linha "Juliana Melo" (Férias)
      { x: 450, y: 370, click: true, pause: 800 },
      // Clica em "+ Novo Colaborador"
      { x: 1100, y: 84, click: true, pause: 800 },
      // Volta ao Dashboard
      { x: 180, y: 26, click: true, pause: 400 },
    ],
  },
];

const STEP_PAUSE  = 900;   // ms entre passos (além do pause do step)
const SCENE_DELAY = 800;   // ms de espera antes de iniciar animação da cena nova

// ── Cursor ─────────────────────────────────────────────────────────────────────
function MotionCursor({ x, y, clicking, scale }) {
  const px = (x / DW) * 100;
  const py = (y / DH) * 100;
  return (
    <div style={{
      position: 'absolute', left: `${px}%`, top: `${py}%`,
      transform: 'translate(-4px, -2px)',
      zIndex: 99, pointerEvents: 'none',
      transition: 'left 0.55s cubic-bezier(0.16,1,0.3,1), top 0.55s cubic-bezier(0.16,1,0.3,1)',
    }}>
      {clicking && (
        <span style={{
          position: 'absolute', left: -10, top: -10, width: 24, height: 24,
          borderRadius: '50%', background: '#ffffff33',
          animation: 'ripple-cursor 0.35s ease-out forwards',
        }} />
      )}
      <svg width={Math.max(14, 18 / scale)} height={Math.max(17, 22 / scale)} viewBox="0 0 18 22" fill="none"
        style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}>
        <path d="M1 1l6.5 16 3-5 5.5 1.5L1 1z" fill="white" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
      </svg>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function MotionReal() {
  const [sceneIdx, setSceneIdx]   = useState(0);
  const [direction, setDirection] = useState(1);
  const [playing, setPlaying]     = useState(true);
  const [progress, setProgress]   = useState(0);
  const [cursor, setCursor]       = useState({ x: 640, y: 360 });
  const [clicking, setClicking]   = useState(false);
  const [scale, setScale]         = useState(1);

  const cancelRef  = useRef(false);
  const startRef   = useRef(Date.now());
  const containerRef = useRef(null);

  const scene = SCENES[sceneIdx];
  const total = SCENES.length;

  // Calcular escala para caber na tela
  useEffect(() => {
    function onResize() {
      const sw = window.innerWidth / DW;
      const sh = window.innerHeight / DH;
      setScale(Math.min(sw, sh));
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Avançar cena
  const goTo = useCallback((idx) => {
    const next = ((idx % total) + total) % total;
    setDirection(idx > sceneIdx ? 1 : -1);
    setSceneIdx(next);
    setProgress(0);
    startRef.current = Date.now();
  }, [sceneIdx, total]);

  const goNext = useCallback(() => goTo(sceneIdx + 1), [goTo, sceneIdx]);
  const goPrev = useCallback(() => goTo(sceneIdx - 1), [goTo, sceneIdx]);

  // Animação do cursor por cena
  useEffect(() => {
    if (!playing) return;
    cancelRef.current = false;
    const steps = scene.steps;

    async function run() {
      await wait(SCENE_DELAY);
      if (cancelRef.current) return;

      for (const step of steps) {
        if (cancelRef.current) return;
        setCursor({ x: step.x, y: step.y });
        await wait(620);
        if (cancelRef.current) return;

        if (step.click) {
          setClicking(true);
          await wait(180);
          setClicking(false);
        }
        await wait(step.pause ?? STEP_PAUSE);
      }

      // Avança automaticamente após todos os steps
      if (!cancelRef.current) goNext();
    }

    run();
    return () => { cancelRef.current = true; };
  }, [sceneIdx, playing]);

  // Barra de progresso
  useEffect(() => {
    if (!playing) return;
    const totalDuration = scene.steps.reduce((s, st) => s + 620 + (st.pause ?? STEP_PAUSE) + (st.click ? 180 : 0), 0) + SCENE_DELAY;
    const interval = setInterval(() => {
      setProgress(Math.min((Date.now() - startRef.current) / totalDuration, 1));
    }, 16);
    return () => clearInterval(interval);
  }, [playing, sceneIdx]);

  // Teclado
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') { cancelRef.current = true; goNext(); }
      else if (e.key === 'ArrowLeft') { cancelRef.current = true; goPrev(); }
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050505', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <style>{`
        @keyframes ripple-cursor {
          from { transform: scale(0.3); opacity: 1; }
          to   { transform: scale(2.5); opacity: 0; }
        }
      `}</style>

      {/* Viewport escalado */}
      <div
        ref={containerRef}
        style={{
          width: DW, height: DH,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          position: 'relative',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 0 80px rgba(0,0,0,0.8)',
          flexShrink: 0,
        }}
      >
        {/* Header */}
        <FakeHeader activeNav={scene.nav} />

        {/* Conteúdo da cena */}
        <div style={{ height: DH - HH, overflow: 'hidden', position: 'relative' }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={scene.id}
              custom={direction}
              initial={{ x: direction > 0 ? '100%' : '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction > 0 ? '-100%' : '100%', opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
              style={{ position: 'absolute', inset: 0 }}
            >
              <scene.Component />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Cursor */}
        <MotionCursor x={cursor.x} y={cursor.y} clicking={clicking} scale={scale} />
      </div>

      {/* Controles abaixo */}
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {/* Barra de progresso */}
        <div style={{ width: 280, height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', background: C.primary, transition: 'none' }} />
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => { cancelRef.current = true; goPrev(); }}
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={16} />
          </button>

          {/* Dots */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {SCENES.map((s, i) => (
              <button key={s.id} onClick={() => { cancelRef.current = true; goTo(i); }}
                style={{ height: 5, borderRadius: 3, border: 'none', cursor: 'pointer', transition: 'all 0.3s', width: i === sceneIdx ? 18 : 5, background: i === sceneIdx ? C.primary : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>

          <button onClick={() => { cancelRef.current = true; goNext(); }}
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Label da cena + play/pause */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {String(sceneIdx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')} — {scene.label}
          </span>
          <button onClick={() => setPlaying(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 11 }}>
            {playing ? <Pause size={10} /> : <Play size={10} />}
            {playing ? 'Pausar' : 'Reproduzir'} · Espaço
          </button>
        </div>
      </div>
    </div>
  );
}
