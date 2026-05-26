import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Joyride, STATUS } from 'react-joyride';
import { supabase } from '../supabaseClient';
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

  // 1) Carregar progresso do usuário
  useEffect(() => {
    if (!auth.user?.id || !supabase) {
      setCompletedTours(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('app_tutorial_progress')
          .select('tour_id')
          .eq('user_id', auth.user.id);
        if (cancelled) return;
        if (error) {
          // Tabela pode não existir ainda (migration não aplicada) · degrada gracefully
          console.warn('[Tutorial] Erro ao carregar progresso:', error.message);
          setCompletedTours(new Set());
          return;
        }
        setCompletedTours(new Set((data || []).map((r) => r.tour_id)));
      } catch (e) {
        console.warn('[Tutorial] Falha ao carregar:', e?.message);
        setCompletedTours(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  // 2) Detectar rota → ver se há tour aplicável → iniciar (se ainda não viu)
  useEffect(() => {
    if (!auth.user || auth.loading) return;
    if (completedTours === null) return; // ainda carregando
    if (activeTour) return; // já tem um rodando

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

  // 3) Marcar tour como completo no banco
  const markTourComplete = useCallback(async (tourId, status = 'completed') => {
    if (!auth.user?.id || !supabase) return;
    try {
      const { error } = await supabase
        .from('app_tutorial_progress')
        .upsert(
          { user_id: auth.user.id, tour_id: tourId, status, completed_at: new Date().toISOString() },
          { onConflict: 'user_id,tour_id' },
        );
      if (error) {
        console.warn('[Tutorial] Erro ao salvar progresso:', error.message);
        return;
      }
      setCompletedTours((prev) => {
        const next = new Set(prev || []);
        next.add(tourId);
        return next;
      });
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

  // 4) Re-disparar manualmente (botão "Refazer tutorial")
  // Apenas reseta o progresso · o auto-trigger via rota se encarrega
  // de iniciar quando o user estiver na página certa.
  const restartTour = useCallback(async (tourId) => {
    if (!auth.user?.id) return;
    const tour = getTourById(tourId);
    if (!tour) return;
    try {
      if (supabase) {
        await supabase
          .from('app_tutorial_progress')
          .delete()
          .eq('user_id', auth.user.id)
          .eq('tour_id', tourId);
      }
      setCompletedTours((prev) => {
        const next = new Set(prev || []);
        next.delete(tourId);
        return next;
      });
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
    if (!auth.user?.id || !supabase) return;
    try {
      await supabase
        .from('app_tutorial_progress')
        .delete()
        .eq('user_id', auth.user.id);
      setCompletedTours(new Set());
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
