import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Joyride, STATUS } from 'react-joyride';
import { tutorial as tutorialApi } from '../api';
import { useAuth } from './AuthContext';
import { findTourForRoute, getTourById, TUTORIALS } from '../data/tutorials';

const TutorialContext = createContext(null);

const JOYRIDE_STYLES = {
  options: {
    primaryColor: '#00B39D',
    zIndex: 10000,
    arrowColor: 'var(--cbrio-card)',
    backgroundColor: 'var(--cbrio-card)',
    textColor: 'var(--cbrio-text)',
    overlayColor: 'rgba(0,0,0,0.55)',
  },
  tooltip: {
    borderRadius: 12,
    padding: 16,
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 6,
  },
  tooltipContent: {
    fontSize: 14,
    lineHeight: 1.5,
    padding: '6px 0',
  },
  buttonNext: {
    background: '#00B39D',
    color: '#fff',
    borderRadius: 8,
    fontSize: 13,
    padding: '8px 16px',
    fontWeight: 600,
  },
  buttonBack: {
    color: 'var(--cbrio-text2)',
    fontSize: 13,
    marginRight: 8,
  },
  buttonSkip: {
    color: 'var(--cbrio-text3)',
    fontSize: 12,
  },
  buttonClose: {
    display: 'none',
  },
};

const JOYRIDE_LOCALE = {
  back: 'Voltar',
  close: 'Fechar',
  last: 'Concluir',
  next: 'Próximo',
  skip: 'Pular tutorial',
  open: 'Abrir',
};

export function TutorialProvider({ children }) {
  const auth = useAuth();
  const location = useLocation();

  const [completedTours, setCompletedTours] = useState(null); // Set<string> | null (loading)
  const [activeTour, setActiveTour] = useState(null);
  const [runJoyride, setRunJoyride] = useState(false);
  const startTimeoutRef = useRef(null);

  // 1) Carregar progresso do usuário (via backend · service role + JWT)
  useEffect(() => {
    if (!auth.user?.id) {
      setCompletedTours(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await tutorialApi.progress();
        if (cancelled) return;
        setCompletedTours(new Set((data || []).map((r) => r.tour_id)));
      } catch (e) {
        if (cancelled) return;
        // Falha ao carregar · mantém em "loading" (null) pra NÃO disparar tours
        // por erro de leitura (evita repetir). O botão "Refazer tutorial" segue
        // funcionando (chama o tour direto, sem depender do gatilho por rota).
        console.warn('[Tutorial] Falha ao carregar:', e?.message);
        setCompletedTours(null);
      }
    })();
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  // 2) Detectar rota → ver se há tour aplicável → iniciar (se ainda não viu)
  useEffect(() => {
    if (!auth.user || auth.loading) return;
    if (completedTours === null) return; // ainda carregando
    if (activeTour) return; // já tem um rodando

    // Não iniciar tutorial enquanto o modal de primeiro acesso (troca de senha)
    // ainda está pendente · senão o tour rouba o foco e fecha o modal (ele
    // "aparece e some"). Espera a senha ser tratada (ou o modal ser dispensado).
    const prov = auth.user?.app_metadata?.provider;
    const senhaPendente = auth.profile && !auth.profile.password_changed_at && (!prov || prov === 'email');
    let senhaDispensada = false;
    try { senhaDispensada = sessionStorage.getItem('cbrio_primeiro_acesso_dismissed') === '1'; } catch { /* ignore */ }
    if (senhaPendente && !senhaDispensada) return;

    const tour = findTourForRoute(location.pathname, auth);
    if (!tour) return;
    if (completedTours.has(tour.id)) return;

    // welcome tem prioridade · só dispara tours de módulo se welcome já foi feito
    if (tour.id !== 'welcome' && !completedTours.has('welcome')) return;

    // Espera o DOM montar (lazy load + render)
    const delay = tour.delay || 800;
    startTimeoutRef.current = setTimeout(() => {
      setActiveTour(tour);
      setRunJoyride(true);
    }, delay);

    return () => {
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
    };
  }, [location.pathname, auth, completedTours, activeTour]);

  // 3) Marcar tour como completo no banco (via backend · service role + JWT)
  const markTourComplete = useCallback(async (tourId, status = 'completed') => {
    if (!auth.user?.id) return;
    // Marca local PRIMEIRO · evita re-disparar o mesmo tour na sessão atual
    // mesmo se o POST falhar (a próxima sessão recarrega do banco).
    setCompletedTours((prev) => {
      const next = new Set(prev || []);
      next.add(tourId);
      return next;
    });
    try {
      await tutorialApi.complete(tourId, status);
    } catch (e) {
      console.warn('[Tutorial] Falha ao salvar:', e?.message);
    }
  }, [auth.user?.id]);

  const handleJoyrideCallback = useCallback((data) => {
    const { status } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      const tourId = activeTour?.id;
      const finalStatus = status === STATUS.SKIPPED ? 'skipped' : 'completed';
      setRunJoyride(false);
      setActiveTour(null);
      if (tourId) markTourComplete(tourId, finalStatus);
    }
  }, [activeTour, markTourComplete]);

  // ESC fecha o tutorial (marca como skipped)
  useEffect(() => {
    if (!runJoyride || !activeTour) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        const tourId = activeTour.id;
        setRunJoyride(false);
        setActiveTour(null);
        markTourComplete(tourId, 'skipped');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [runJoyride, activeTour, markTourComplete]);

  // 4) Re-disparar manualmente (botão "Refazer tutorial")
  // Apenas reseta o progresso · o auto-trigger via rota se encarrega
  // de iniciar quando o user estiver na página certa.
  const restartTour = useCallback(async (tourId) => {
    if (!auth.user?.id) return;
    const tour = getTourById(tourId);
    if (!tour) return;
    setCompletedTours((prev) => {
      const next = new Set(prev || []);
      next.delete(tourId);
      return next;
    });
    try {
      await tutorialApi.reset(tourId);
    } catch (e) {
      console.warn('[Tutorial] Falha ao resetar:', e?.message);
    }
    // Se já está na rota certa, inicia agora; senão, o auto-trigger pega
    // quando navegar pra lá
    const tourRoute = typeof tour.route === 'string' ? tour.route : null;
    if (!tourRoute || tourRoute === location.pathname) {
      setActiveTour(tour);
      setRunJoyride(true);
    }
  }, [auth.user?.id, location.pathname]);

  const resetAllTours = useCallback(async () => {
    if (!auth.user?.id) return;
    setCompletedTours(new Set());
    try {
      await tutorialApi.reset();
    } catch (e) {
      console.warn('[Tutorial] Falha ao resetar tudo:', e?.message);
    }
  }, [auth.user?.id]);

  const value = useMemo(() => ({
    activeTour,
    isRunning: runJoyride,
    completedTours: completedTours || new Set(),
    restartTour,
    resetAllTours,
    allTours: TUTORIALS,
  }), [activeTour, runJoyride, completedTours, restartTour, resetAllTours]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {activeTour && (
        <Joyride
          key={activeTour.id}
          steps={activeTour.steps}
          run={runJoyride}
          continuous
          showProgress
          showSkipButton
          scrollToFirstStep
          disableScrolling={false}
          disableOverlayClose
          locale={JOYRIDE_LOCALE}
          styles={JOYRIDE_STYLES}
          callback={handleJoyrideCallback}
        />
      )}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    return {
      activeTour: null,
      isRunning: false,
      completedTours: new Set(),
      restartTour: async () => {},
      resetAllTours: async () => {},
      allTours: [],
    };
  }
  return ctx;
}
