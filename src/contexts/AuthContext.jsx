import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { resolveApiBaseUrl } from '../lib/api-base';

const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const AuthContext = createContext(null);

// Rota destino quando um login fica TRAVADO num único módulo (quiosque).
// Só os módulos que fazem sentido como "tela única" pra um voluntário.
const MODULO_ROTA_TRAVA = {
  batismo: '/batismo',
  producao: '/producao',
  cuidados: '/ministerial/cuidados',
  grupos: '/grupos',
  kids: '/ministerial/kids',
  marketing: '/marketing',
  online: '/online',
};

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
  // Já temos sessão ativa? Usado pra distinguir login REAL de re-emissão de
  // SIGNED_IN por foco de aba (Alt+Tab) — ver onAuthStateChange abaixo.
  const sessaoAtivaRef = useRef(false);

  async function fetchProfile(userId) {
    if (!supabase) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, role, area, kpi_areas, avatar_url, ministerio_id, ministerio_papel, is_diretoria_geral, funcao_diretoria, telefone, membro_id, is_membro_only, password_changed_at')
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

    // Rede de segurança · se getSession()/perfil pendurar (ex.: lock de auth
    // travado de uma aba/refresh órfão), NUNCA deixa o app preso no "carregando"
    // pra sempre — libera após 8s. O lock no-op (supabaseClient.js) já evita o
    // deadlock; isto é o cinto de segurança caso algo trave por outro motivo.
    let initDone = false;
    const safetyTimer = setTimeout(() => {
      if (!initDone) {
        console.warn('[Auth] getSession demorou demais — liberando o carregamento (rede de segurança).');
        setLoading(false);
      }
    }, 8000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      sessaoAtivaRef.current = !!session?.user;
      setUser(session?.user ?? null);
      if (session?.user) {
        await Promise.all([fetchProfile(session.user.id), fetchPermissions()]);
      }
    }).catch((e) => {
      console.warn('[Auth] Erro ao obter sessão:', e?.message);
    }).finally(() => {
      initDone = true;
      clearTimeout(safetyTimer);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // ERP interno · qualquer user autenticado pelo Supabase (email ou OAuth)
      // entra direto · não tem cadastro público, então não tem risco de
      // hijacking de email. Microsoft eh restrito ao tenant CBRio e Google
      // tem email verificado.
      // ⚠️ O supabase-js re-dispara SIGNED_IN a cada FOCO de aba (Alt+Tab), não só
      // no login real. Tratar todo SIGNED_IN como login = jogar o app no
      // "carregando" (e travar se o re-fetch pendurar) toda vez que a aba volta ao
      // foco. Por isso só bloqueamos a UI na transição REAL "sem sessão → com
      // sessão" (sessaoAtivaRef), não pelo nome do evento.
      const tinhaSessao = sessaoAtivaRef.current;
      sessaoAtivaRef.current = !!session?.user;
      setUser(session?.user ?? null);
      if (session?.user) {
        // Login real: segura o loading até profile+permissões chegarem — senão o
        // homeRoute roda com modulePerms nulo e manda pro lugar errado (ex.:
        // /devocional ou /dashboard em vez da trava de módulo). Em re-emissões
        // por foco de aba (já tinha sessão), atualiza em segundo plano sem travar.
        const loginReal = _event === 'SIGNED_IN' && !tinhaSessao;
        if (loginReal) setLoading(true);
        await Promise.all([fetchProfile(session.user.id), fetchPermissions()]);
        if (loginReal) setLoading(false);
      } else {
        setProfile(null);
        setModulePerms(null);
        setPermData(null);
      }
    });

    return () => { clearTimeout(safetyTimer); subscription.unsubscribe(); };
  }, []);

  function supabaseErroMsg() {
    // Mensagem detalhada · ajuda a debugar config de preview do Vercel
    const url = !!import.meta.env.VITE_SUPABASE_URL;
    const key = !!(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    const viteKeys = Object.keys(import.meta.env || {}).filter(k => k.startsWith('VITE_'));
    const faltam = [];
    if (!url) faltam.push('VITE_SUPABASE_URL');
    if (!key) faltam.push('VITE_SUPABASE_ANON_KEY');
    return `Supabase não configurado · faltam: ${faltam.join(', ') || '(?)'}. `
      + `Vite ve essas envs: [${viteKeys.join(', ') || 'nenhuma'}]. `
      + 'Confira no Vercel se cada var tem prefixo VITE_, esta marcada para "Preview" e o deploy foi refeito.';
  }

  async function signInWithGoogle() {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInWithMicrosoft() {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    return supabase.auth.signInWithOAuth({
      provider: 'azure',
      // Supabase sempre inclui openid; estes escopos garantem que o Azure
      // devolva dados suficientes para criar/associar o usuário por e-mail.
      options: { redirectTo: window.location.origin, scopes: 'email profile' },
    });
  }

  async function signInWithEmail(email, password) {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    return supabase.auth.signInWithPassword({ email, password });
  }

  async function sendPasswordReset(email) {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
  }

  async function updatePasswordWithCurrent(currentPassword, newPassword) {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    const email = user?.email || profile?.email;
    if (!email) return { error: { message: 'Sessão sem email · refaca login.' } };
    // Reauth · valida senha atual sem invalidar a sessão
    const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauthErr) return { error: { message: 'Senha atual incorreta.' } };
    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updErr) return { error: updErr };
    try { await supabase.rpc('app_marcar_senha_trocada'); } catch { /* não bloqueante */ }
    await fetchProfile(user.id).catch(() => {});
    return { error: null };
  }

  async function updatePasswordOnly(newPassword) {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error };
    try { await supabase.rpc('app_marcar_senha_trocada'); } catch { /* não bloqueante */ }
    if (user?.id) await fetchProfile(user.id).catch(() => {});
    return { error: null };
  }

  async function signOut() {
    if (DEV_BYPASS_AUTH) return;
    if (supabase) await supabase.auth.signOut();
  }

  // Módulos com deny explícito (override nível 0) · vence o bypass de admin/diretor.
  const modulosBloqueados = permData?.modulosBloqueados || [];

  function canAccessModule(moduleNames, tipo = 'leitura', nivelMinimo = 2) {
    if (moduleNames.some((n) => modulosBloqueados.includes(n))) return false;
    if (['admin', 'diretor'].includes(profile?.role)) return true;
    if (!modulePerms) return false;
    for (const name of moduleNames) {
      const perm = modulePerms[name];
      if (perm && perm[tipo] >= nivelMinimo) return true;
    }
    return false;
  }

  function getAccessLevel(moduleNames) {
    if (moduleNames.some((n) => modulosBloqueados.includes(n))) return 0;
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
  const cargoNome = permData?.cargoNome || null;
  const cargoSlug = permData?.cargoSlug || null;

  const isVoluntario = profile?.role === 'voluntario';
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);

  // Helpers de gating por módulo · usa slug novo (matriz reunião 2026-05-18)
  // com fallback para nome antigo pra compatibilidade durante a transicao.
  const canRH = canAccessModule(['rh', 'RH', 'DP', 'Pessoas']);
  const canFinanceiro = canAccessModule(['financeiro', 'Financeiro']);
  const canLogistica = canAccessModule(['logistica', 'Logística']);
  const canPatrimonio = canAccessModule(['patrimonio', 'Patrimônio']);
  const canMembresia = canAccessModule(['membresia', 'Membresia']);
  const canProjetos = canAccessModule(['projetos', 'Projetos', 'Tarefas']);
  const canExpansao = canAccessModule(['expansao', 'Planejamento Estratégico', 'Expansão', 'Projetos']);
  const canAgenda = canAccessModule(['eventos', 'Eventos', 'Agenda']);
  const canIAModulo = canAccessModule(['assistente-ia', 'Assistente IA', 'IA / Agentes']);
  const canKPIs = isAdmin || canAccessModule(['minha-area', 'Minha Área', 'KPIs', 'Indicadores']);
  const canCuidados = isAdmin || canAccessModule(['cuidados', 'Cuidados']);
  // Módulo Processos removido na reunião 2026-05-18 — rota redireciona pra /eventos
  const canProcessos = false;
  const canSolicitacoes = isAdmin || canAccessModule(['solicitacoes', 'Solicitações'], 'leitura', 1);
  const canNPS = isAdmin || canAccessModule(['nps', 'NPS']);
  const canDadosBrutos = isAdmin || canAccessModule(['dados-brutos', 'Dados Brutos']);
  const canPainel = isAdmin || canAccessModule(['painel-cbrio', 'Painel CBRio'], 'leitura', 1);
  // Colaborador = admin/diretor ou usuário com qualquer permissão de módulo
  // (voluntários e membros sem permissão não são colaboradores)
  const isColaborador = isAdmin || canRH || canFinanceiro || canLogistica || canPatrimonio || canMembresia || canProjetos || canExpansao || canAgenda || canIAModulo || canCuidados || canSolicitacoes || canDadosBrutos || canNPS;
  // Tem acesso a QUALQUER módulo do sistema (leitura >= 1 em pelo menos um)?
  // `isColaborador` acima é uma lista fixa de canX que NÃO cobre vários módulos
  // ministeriais (batismo, integracao, grupos, voluntariado, producao, online,
  // kids, ami, bridge, marketing, painel, gestao...). Um responsável só de um
  // desses módulos não casava em nenhum canX e, com is_membro_only=true, caía
  // preso no devocional ao logar. Esta checagem olha o mapa de permissões
  // inteiro, então qualquer detentor de módulo é reconhecido como gente do
  // sistema (membro puro = todos os módulos em leitura 0 → continua false).
  const temAcessoSistema = !!modulePerms
    && Object.values(modulePerms).some((p) => p && (p.leitura || 0) >= 1);
  // "Membro só do app devocional" só vale pra ROTEAMENTO quando a pessoa não é
  // colaborador e não tem acesso a nenhum módulo. Evita que um staff que um dia
  // entrou pelo devocional (flag is_membro_only=true grudada no profile) fique
  // preso na tela do devocional ao logar com as credenciais reais.
  const isMembroOnly = !!profile?.is_membro_only && !isColaborador && !temAcessoSistema;
  // Trava de módulo (quiosque): login de MEMBRO (is_membro_only) com acesso a
  // EXATAMENTE 1 módulo — ex.: voluntário responsável só pelo Batismo — abre
  // direto naquele módulo, sem menu e sem poder navegar pra mais nada. Não afeta
  // staff (is_membro_only=false), admin, diretor nem voluntário (kiosk próprio).
  // ⚠️ modulePerms é indexado por NOME *e* por SLUG (2 chaves apontando pro MESMO
  // objeto), então conta módulos DISTINTOS por referência — não por nº de chaves.
  const entriesComAcesso = modulePerms
    ? [...new Set(Object.values(modulePerms).filter((p) => p && (p.leitura || 0) >= 1))]
    : [];
  const slugTravavel = entriesComAcesso.length === 1
    ? Object.keys(MODULO_ROTA_TRAVA).find((s) => modulePerms?.[s] === entriesComAcesso[0])
    : null;
  const moduloTravado = (
    !!profile?.is_membro_only && !isAdmin && profile?.role !== 'diretor' && !isVoluntario && slugTravavel
  ) ? slugTravavel : null;
  const rotaTravada = moduloTravado ? MODULO_ROTA_TRAVA[moduloTravado] : null;
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
    isMembroOnly,
    moduloTravado,
    rotaTravada,
    isColaborador,
    modulePerms,
    modulosBloqueados,
    canAccessModule,
    canRH, canFinanceiro, canLogistica, canPatrimonio, canMembresia, canProjetos, canExpansao, canAgenda, canIA, canKPIs, canCuidados, canProcessos, canSolicitacoes, canNPS, canDadosBrutos, canPainel,
    getAccessLevel,
    userAreas,
    userSetores,
    cargoNome,
    cargoSlug,
    signInWithMicrosoft,
    signInWithGoogle,
    signInWithEmail,
    sendPasswordReset,
    updatePasswordWithCurrent,
    updatePasswordOnly,
    signOut,
    refreshProfile: () => user?.id && fetchProfile(user.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // During HMR, context can temporarily be null — return a safe fallback
    return {
      user: null, profile: null, loading: true, role: null,
      isAdmin: false, isDiretor: false, isVoluntario: false, isMembroOnly: false, moduloTravado: null, rotaTravada: null, isColaborador: false, modulePerms: null,
      canAccessModule: () => false, getAccessLevel: () => 1,
      canRH: false, canFinanceiro: false, canLogistica: false,
      canPatrimonio: false, canMembresia: false, canProjetos: false,
      canExpansao: false, canAgenda: false, canIA: false, canCuidados: false,
      canProcessos: false, canSolicitacoes: false, canNPS: false,
      canDadosBrutos: false, canPainel: false, canKPIs: false,
      userAreas: [], userSetores: [],
      cargoNome: null, cargoSlug: null,
      signInWithMicrosoft: async () => ({}),
      signInWithGoogle: async () => ({}),
      signInWithEmail: async () => ({}),
      sendPasswordReset: async () => ({}),
      updatePasswordWithCurrent: async () => ({}),
      updatePasswordOnly: async () => ({}),
      signOut: async () => {},
    };
  }
  return ctx;
}
