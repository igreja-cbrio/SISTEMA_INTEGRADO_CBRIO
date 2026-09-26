import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../supabaseClient';
import { resolveApiBaseUrl } from '../lib/api-base';
import { beginCampusSession } from '../lib/campusSession';
import { Button } from '../components/ui/button';

export type Campus = { id: string; nome: string; slug: string; tipo: string };
export type CampusConfiguration = {
  estado: 'preparacao' | 'ensaio' | 'ativo';
  campus_legado_id: string | null;
  campi: Campus[];
  campus_id: string | null;
  consolidado_permitido: boolean;
};
type CampusState = {
  owner: string | null; contexto: CampusConfiguration | null; loading: boolean;
  error: string | null; generation: number;
};
type CampusValue = CampusState & {
  ready: boolean; scopeKey: string;
  trocarCampus: (id: string) => Promise<void>; recarregar: () => Promise<void>;
};
const CampusContext = createContext<CampusValue | null>(null);
const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const storageKey = (id: string) => `cbrio_campus_v1:${id}`;
function remembered(id: string) {
  try { return sessionStorage.getItem(storageKey(id)); } catch { return null; }
}
function remember(id: string, campus: string | null) {
  try {
    if (campus) sessionStorage.setItem(storageKey(id), campus);
    else sessionStorage.removeItem(storageKey(id));
  } catch { /* Preferência indisponível não altera a autorização. */ }
}

export function validateCampusConfiguration(value: unknown): CampusConfiguration {
  const config = value as CampusConfiguration;
  if (!config || !['preparacao', 'ensaio', 'ativo'].includes(config.estado)
    || !Array.isArray(config.campi)
    || config.campi.some(campus => !campus || typeof campus.id !== 'string' || !campus.id || typeof campus.nome !== 'string')
    || new Set(config.campi.map(campus => campus.id)).size !== config.campi.length
    || (config.campus_id !== null && !config.campi.some(campus => campus.id === config.campus_id))
    || (config.estado === 'preparacao' && config.campus_id !== null && config.campus_id !== config.campus_legado_id)) {
    throw new Error('O servidor retornou um contexto de campus inválido.');
  }
  return config;
}

export function CampusProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id || null;
  const [state, setState] = useState<CampusState>({ owner: null, contexto: null, loading: true, error: null, generation: 0 });
  const run = useRef(0);
  const active = useRef<AbortController | null>(null);
  const identity = useRef(userId);
  identity.current = userId;

  const load = useCallback(async (selected?: string | null) => {
    const owner = userId;
    const attempt = ++run.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const generation = beginCampusSession(owner, null);
    setState({ owner, contexto: null, loading: !!owner, error: null, generation });
    if (!owner) return;
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      // O prazo cobre também getSession: uma sessão pendurada não pode prender a tela.
      const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Não foi possível carregar os campi. Tente novamente.')), { once: true }));
      const request = async () => {
        const sessionResult = await supabase?.auth.getSession();
        if (controller.signal.aborted) throw new Error('Carregamento cancelado.');
        const token = sessionResult?.data?.session?.access_token;
        if (!token) throw new Error('Sua sessão expirou. Entre novamente para escolher o campus.');
        const response = await fetch(`${API}/campus/contexto`, {
          headers: { Authorization: `Bearer ${token}`, ...(selected ? { 'X-Campus-Id': selected } : {}) },
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Não foi possível carregar os campi autorizados.');
        return validateCampusConfiguration(body);
      };
      const contexto = await Promise.race([request(), aborted]);
      if (attempt !== run.current || identity.current !== owner) return;
      const currentGeneration = beginCampusSession(owner, contexto.campus_id, !!contexto.campus_id);
      remember(owner, contexto.campus_id);
      setState({ owner, contexto, loading: false, error: null, generation: currentGeneration });
    } catch (error) {
      if (attempt !== run.current || identity.current !== owner) return;
      remember(owner, null);
      setState({ owner, contexto: null, loading: false, error: error instanceof Error ? error.message : 'Não foi possível carregar os campi.', generation });
    } finally {
      clearTimeout(timer);
    }
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    void load(userId ? remembered(userId) : null);
    return () => { ++run.current; active.current?.abort(); beginCampusSession(null, null); };
  }, [authLoading, load, userId]);

  const ready = !authLoading && state.owner === userId && !state.loading && !state.error && !!state.contexto?.campus_id;
  const trocarCampus = async (id: string) => {
    if (!state.contexto?.campi.some(campus => campus.id === id)) return;
    if (state.contexto.estado === 'preparacao' && id !== state.contexto.campus_legado_id) return;
    await load(id);
  };
  const value: CampusValue = {
    ...state, loading: authLoading || state.owner !== userId || state.loading,
    ready, scopeKey: `${userId || 'anon'}:${state.contexto?.campus_id || 'sem-campus'}:${state.generation}`,
    trocarCampus, recarregar: () => load(null),
  };
  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

export function useCampus() {
  const value = useContext(CampusContext);
  if (!value) throw new Error('CampusProvider não está disponível.');
  return value;
}

// Usar apenas na árvore privada: formulários públicos têm contexto do recurso/token.
export function CampusBoundary({ children }: { children: ReactNode }) {
  const campus = useCampus();
  if (campus.ready) return <>{children}</>;
  if (campus.loading) return <div role="status" className="p-6 text-sm text-muted-foreground">Carregando campus…</div>;
  return <section className="mx-auto max-w-lg space-y-4 p-6" aria-label="Acesso ao campus">
    <p role={campus.error ? 'alert' : undefined}>{campus.error || (campus.contexto?.campi.length ? 'Escolha o campus para continuar.' : 'Seu usuário ainda não tem acesso a um campus. Solicite a liberação à administração.')}</p>
    {campus.contexto?.campi.filter(item => campus.contexto?.estado !== 'preparacao' || item.id === campus.contexto.campus_legado_id).map(item =>
      <Button key={item.id} variant="outline" className="mr-2" onClick={() => void campus.trocarCampus(item.id)}>{item.nome}</Button>)}
    <Button variant="outline" onClick={() => void campus.recarregar()}>Tentar novamente</Button>
  </section>;
}
