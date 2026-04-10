import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { resolveApiBaseUrl } from '../lib/api-base';

const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const AuthContext = createContext(null);

// Set to true to bypass login and simulate an admin user
const DEV_BYPASS_AUTH = false;

const FAKE_USER = {
  id: 'dev-user-00000000',
  email: 'admin@cbrio.dev',
};

const FAKE_PROFILE = {
  id: 'dev-user-00000000',
  name: 'Admin Dev',
  email: 'admin@cbrio.dev',
  role: 'admin',
  area: 'Tecnologia',
  avatar_url: null,
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEV_BYPASS_AUTH ? FAKE_USER : null);
  const [profile, setProfile] = useState(DEV_BYPASS_AUTH ? FAKE_PROFILE : null);
  const [modulePerms, setModulePerms] = useState(null);
  const [permData, setPermData] = useState(null);
  const [loading, setLoading] = useState(DEV_BYPASS_AUTH ? false : true);

  async function fetchProfile(userId) {
    if (!supabase) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, role, area, avatar_url')
      .eq('id', userId)
      .single();
    setProfile(data ?? null);
  }

  async function fetchPermissions() {
    try {
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`${API}/auth/my-permissions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setModulePerms(data.granular?.modulePerms ?? null);
        setPermData(data.granular ?? null);
      }
    } catch (e) { console.warn('[Auth] Erro ao buscar permissões:', e?.message); }
  }

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return;
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await Promise.all([fetchProfile(session.user.id), fetchPermissions()]);
      }
      setLoading(false);
    }).catch((e) => {
      console.warn('[Auth] Erro ao obter sessão:', e?.message);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchPermissions();
      } else {
        setProfile(null);
        setModulePerms(null);
        setPermData(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithGoogle() {
    if (!supabase) return { error: { message: 'Supabase não configurado' } };
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInWithMicrosoft() {
    if (!supabase) return { error: { message: 'Supabase não configurado' } };
    return supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInWithEmail(email, password) {
    if (!supabase) return { error: { message: 'Supabase não configurado' } };
    return supabase.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    if (DEV_BYPASS_AUTH) return;
    if (supabase) await supabase.auth.signOut();
  }

  function canAccessModule(moduleNames, tipo = 'leitura', nivelMinimo = 2) {
    if (['admin', 'diretor'].includes(profile?.role)) return true;
    if (!modulePerms) return false;
    for (const name of moduleNames) {
      const perm = modulePerms[name];
      if (perm && perm[tipo] >= nivelMinimo) return true;
    }
    return false;
  }

  function getAccessLevel(moduleNames) {
    if (profile?.role === 'admin') return 5;
    if (profile?.role === 'diretor') return 4;
    if (!modulePerms) return 1;
    let max = 1;
    for (const name of moduleNames) {
      const perm = modulePerms[name];
      if (perm) max = Math.max(max, perm.leitura || 1);
    }
    return max;
  }

  const userAreas = permData?.areas || [profile?.area].filter(Boolean);
  const userSetores = permData?.setores || [];

  const canRH = canAccessModule(['DP', 'Pessoas']);
  const canFinanceiro = canAccessModule(['Financeiro']);
  const canLogistica = canAccessModule(['Logística']);
  const canPatrimonio = canAccessModule(['Patrimônio']);
  const canMembresia = canAccessModule(['Membresia']);
  const canProjetos = canAccessModule(['Projetos', 'Tarefas']);
  const canExpansao = canAccessModule(['Projetos']);
  const canAgenda = canAccessModule(['Agenda']);
  const canIA = canAccessModule(['IA / Agentes']);

  const value = {
    user,
    profile,
    loading,
    role: profile?.role ?? null,
    isAdmin: ['admin', 'diretor'].includes(profile?.role),
    isDiretor: profile?.role === 'diretor',
    modulePerms,
    canAccessModule,
    canRH, canFinanceiro, canLogistica, canPatrimonio, canMembresia, canProjetos, canExpansao, canAgenda, canIA,
    getAccessLevel,
    userAreas,
    userSetores,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithEmail,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // During HMR, context can temporarily be null — return a safe fallback
    return {
      user: null, profile: null, loading: true, role: null,
      isAdmin: false, isDiretor: false, modulePerms: null,
      canAccessModule: () => false, getAccessLevel: () => 1,
      canRH: false, canFinanceiro: false, canLogistica: false,
      canPatrimonio: false, canMembresia: false, canProjetos: false,
      canExpansao: false, canAgenda: false, canIA: false,
      userAreas: [], userSetores: [],
      signInWithGoogle: async () => ({}), signInWithMicrosoft: async () => ({}),
      signInWithEmail: async () => ({}), signOut: async () => {},
    };
  }
  return ctx;
}
