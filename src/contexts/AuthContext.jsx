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
  kpi_areas: [],
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
      .select('id, name, email, role, area, kpi_areas, avatar_url, ministerio_id, ministerio_papel, is_diretoria_geral, funcao_diretoria')
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // ERP interno · qualquer user autenticado pelo Supabase (email ou OAuth)
      // entra direto · nao tem cadastro publico, entao nao tem risco de
      // hijacking de email. Microsoft eh restrito ao tenant CBRio e Google
      // tem email verificado.
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
      // Supabase sempre inclui openid; estes escopos garantem que o Azure
      // devolva dados suficientes para criar/associar o usuario por e-mail.
      options: { redirectTo: window.location.origin, scopes: 'email profile' },
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

  const isVoluntario = profile?.role === 'voluntario';
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);

  // Helpers de gating por modulo · usa slug novo (matriz reuniao 2026-05-18)
  // com fallback para nome antigo pra compatibilidade durante a transicao.
  const canRH = canAccessModule(['rh', 'RH', 'DP', 'Pessoas']);
  const canFinanceiro = canAccessModule(['financeiro', 'Financeiro']);
  const canLogistica = canAccessModule(['logistica', 'Logística']);
  const canPatrimonio = canAccessModule(['patrimonio', 'Patrimônio']);
  const canMembresia = canAccessModule(['membresia', 'Membresia']);
  const canProjetos = canAccessModule(['projetos', 'Projetos', 'Tarefas']);
  const canExpansao = canAccessModule(['expansao', 'Expansão', 'Projetos']);
  const canAgenda = canAccessModule(['eventos', 'Eventos', 'Agenda']);
  const canIAModulo = canAccessModule(['assistente-ia', 'Assistente IA', 'IA / Agentes']);
  const canKPIs = isAdmin || canAccessModule(['minha-area', 'Minha Área', 'KPIs', 'Indicadores']);
  const canCuidados = isAdmin || canAccessModule(['cuidados', 'Cuidados']);
  // Modulo Processos removido na reuniao 2026-05-18 — rota redireciona pra /eventos
  const canProcessos = false;
  const canSolicitacoes = isAdmin || canAccessModule(['solicitacoes', 'Solicitações'], 'leitura', 1);
  const canNPS = isAdmin || canAccessModule(['nps', 'NPS']);
  const canDadosBrutos = isAdmin || canAccessModule(['dados-brutos', 'Dados Brutos']);
  const canPainel = isAdmin || canAccessModule(['painel-cbrio', 'Painel CBRio'], 'leitura', 1);
  // Colaborador = admin/diretor ou usuario com qualquer permissao de modulo
  // (voluntarios e membros sem permissao nao sao colaboradores)
  const isColaborador = isAdmin || canRH || canFinanceiro || canLogistica || canPatrimonio || canMembresia || canProjetos || canExpansao || canAgenda || canIAModulo || canCuidados || canSolicitacoes || canDadosBrutos || canNPS;
  // Assistente IA é liberado para qualquer colaborador; o backend filtra os
  // agentes e os dados conforme as permissões de cada usuário.
  const canIA = isColaborador;

  const value = {
    user,
    profile,
    loading,
    role: profile?.role ?? null,
    isAdmin,
    isDiretor: profile?.role === 'diretor',
    isVoluntario,
    isColaborador,
    modulePerms,
    canAccessModule,
    canRH, canFinanceiro, canLogistica, canPatrimonio, canMembresia, canProjetos, canExpansao, canAgenda, canIA, canKPIs, canCuidados, canProcessos, canSolicitacoes, canNPS, canDadosBrutos, canPainel,
    getAccessLevel,
    userAreas,
    userSetores,
    signInWithMicrosoft,
    signInWithGoogle,
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
      isAdmin: false, isDiretor: false, isVoluntario: false, isColaborador: false, modulePerms: null,
      canAccessModule: () => false, getAccessLevel: () => 1,
      canRH: false, canFinanceiro: false, canLogistica: false,
      canPatrimonio: false, canMembresia: false, canProjetos: false,
      canExpansao: false, canAgenda: false, canIA: false, canCuidados: false,
      canProcessos: false, canSolicitacoes: false, canNPS: false,
      canDadosBrutos: false, canPainel: false, canKPIs: false,
      userAreas: [], userSetores: [],
      signInWithMicrosoft: async () => ({}),
      signInWithGoogle: async () => ({}),
      signInWithEmail: async () => ({}), signOut: async () => {},
    };
  }
  return ctx;
}
