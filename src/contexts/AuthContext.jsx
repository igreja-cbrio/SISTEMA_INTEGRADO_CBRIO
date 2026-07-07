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
  // Conta de quiosque dos computadores do lounge (autoatendimento do hall)
  'totem-membro': '/totem',
};

// Prefixos de rota PERMITIDOS dentro da trava, quando o módulo opera em mais de
// um prefixo (a landing continua sendo MODULO_ROTA_TRAVA). Kids: o quiosque usa
// o hub (/ministerial/kids) + as telas do totem (/ministerial/totem-kids/...).
// O painel do culto kids (/kids · aba Cultos) fica FORA de propósito — conta
// travada não vê o gerencial. Módulo sem entrada aqui → só a rota de landing.
const MODULO_TRAVA_PREFIXOS = {
  kids: ['/ministerial/kids', '/ministerial/totem-kids'],
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

// Limita o tempo de uma promise (fetch/query). No cold-start do Vercel o
// my-permissions pode demorar; sem teto, a carga fica "em progresso" além do
// timer de segurança e a tela era liberada com modulePerms=null. Com teto, cada
// tentativa termina em tempo previsível → a lógica de retry decide (sucesso ou
// falha definitiva), a carga é SEMPRE limitada e nunca pendura.
function comTimeout(promise, ms, label) {
  let t;
  const limite = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout_${label}`)), ms); });
  return Promise.race([promise, limite]).finally(() => clearTimeout(t));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEV_BYPASS_AUTH ? FAKE_USER : null);
  const [profile, setProfile] = useState(DEV_BYPASS_AUTH ? FAKE_PROFILE : null);
  const [modulePerms, setModulePerms] = useState(null);
  const [permData, setPermData] = useState(null);
  const [loading, setLoading] = useState(DEV_BYPASS_AUTH ? false : true);
  // Já temos sessão ativa? Usado pra distinguir login REAL de re-emissão de
  // SIGNED_IN por foco de aba (Alt+Tab) — ver onAuthStateChange abaixo.
  const sessaoAtivaRef = useRef(false);

  // fetchProfile/fetchPermissions retornam { ok } pra o chamador saber se os
  // dados REALMENTE carregaram (antes engoliam o erro e retornavam undefined →
  // o Promise.all "resolvia" mesmo vazio e o setLoading(false) liberava a tela
  // em branco com "—". Causa raiz do "tela vazia exige refresh" · 2026-06-30).
  // Em falha, NÃO apagam o estado já carregado (regra anti-"?").
  async function fetchProfile(userId, tentativa = 1) {
    if (!supabase) return { ok: false, error: 'sem_supabase' };
    try {
      const { data, error } = await comTimeout(
        supabase
          .from('profiles')
          .select('id, name, email, role, area, kpi_areas, avatar_url, ministerio_id, ministerio_papel, is_diretoria_geral, funcao_diretoria, telefone, membro_id, is_membro_only, password_changed_at')
          .eq('id', userId)
          .single(),
        7000, 'profile');
      if (!error && data) { setProfile(data); return { ok: true, data }; }
      // Falha transitória (token renovando no resume, race do no-op lock, blip de
      // rede). Tenta de novo depois que o token assenta.
      if (tentativa < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        return fetchProfile(userId, tentativa + 1);
      }
      // Fallback pelo backend (Bearer token · service_role · sem depender do RLS +
      // token do client, que pode ir stale no resume/no-op lock e a policy
      // auth.role()='authenticated' falhar fechado → 0 linhas → /perfil "conexão
      // instável"). É o mesmo caminho confiável do my-permissions (que faz o menu
      // carregar). 2026-06-30.
      const viaBackend = await fetchProfileBackend();
      if (viaBackend.ok) return viaBackend;
      // Esgotou · NÃO apaga o perfil já carregado — senão o /perfil vira "?".
      console.warn('[Auth] fetchProfile falhou · mantendo perfil atual:', error?.message);
      return { ok: false, error: error?.message || 'falha' };
    } catch (e) {
      if (tentativa < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        return fetchProfile(userId, tentativa + 1);
      }
      const viaBackend = await fetchProfileBackend();
      if (viaBackend.ok) return viaBackend;
      console.warn('[Auth] fetchProfile erro · mantendo perfil atual:', e?.message);
      return { ok: false, error: e?.message || 'erro' };
    }
  }

  // Busca o perfil pelo backend (valida o Bearer token e lê via service_role,
  // ignorando o RLS do client). Rede de segurança pro fetchProfile direto.
  async function fetchProfileBackend() {
    try {
      if (!supabase) return { ok: false, error: 'sem_supabase' };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return { ok: false, error: 'sem_token' };
      const res = await comTimeout(fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }), 7000, 'profile_backend');
      if (!res.ok) return { ok: false, error: `http_${res.status}` };
      const data = await res.json();
      if (data?.id) { setProfile(data); return { ok: true, data }; }
      return { ok: false, error: 'sem_dados' };
    } catch (e) {
      return { ok: false, error: e?.message || 'erro' };
    }
  }

  async function fetchPermissions(tentativa = 1) {
    try {
      if (!supabase) return { ok: false, error: 'sem_supabase' };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return { ok: false, error: 'sem_token' };
      const res = await comTimeout(fetch(`${API}/auth/my-permissions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }), 7000, 'perms');
      if (res.ok) {
        const data = await res.json();
        setModulePerms(data.granular?.modulePerms ?? null);
        setPermData(data.granular ?? null);
        return { ok: true };
      }
      // Resposta não-ok (ex.: 401 com token renovando no resume) · tenta 1x.
      // Em falha NÃO apaga o que já tem (mantém o estado atual).
      if (tentativa < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        return fetchPermissions(tentativa + 1);
      }
      return { ok: false, error: `http_${res.status}` };
    } catch (e) {
      if (tentativa < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        return fetchPermissions(tentativa + 1);
      }
      console.warn('[Auth] Erro ao buscar permissões · mantendo as atuais:', e?.message);
      return { ok: false, error: e?.message || 'erro' };
    }
  }

  // Carrega perfil + permissões e, se algum vier vazio numa sessão real (race de
  // refresh de token / no-op lock), faz UMA re-tentativa após o token assentar —
  // em vez de liberar a tela em branco e depender de F5. Bounded (1 retry).
  async function carregarDadosUsuario(userId) {
    const [pRes, permRes] = await Promise.all([fetchProfile(userId), fetchPermissions()]);
    if (!pRes?.ok || !permRes?.ok) {
      await new Promise((r) => setTimeout(r, 1500));
      await Promise.all([
        pRes?.ok ? Promise.resolve() : fetchProfile(userId),
        permRes?.ok ? Promise.resolve() : fetchPermissions(),
      ]);
    }
  }

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return;
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Rede de segurança · protege APENAS o getSession() (caso o lock de auth de
    // uma aba/refresh órfão trave — o lock no-op já evita o deadlock, isto é o
    // cinto). Assim que o getSession RESOLVE, cancelamos o timer: a carga de
    // perfil/permissões (carregarDadosUsuario) é limitada por timeout POR REQUEST
    // (comTimeout) + retries, então SEMPRE termina e o `.finally` libera a tela —
    // sem o timer soltar no meio da carga e deixar modulePerms=null (a raiz do
    // "menu cheio, clica e volta pro dashboard" no cold-start · 2026-07-01).
    let sessionResolvida = false;
    const safetyTimer = setTimeout(() => {
      if (!sessionResolvida) {
        console.warn('[Auth] getSession travou — liberando o carregamento (rede de segurança).');
        setLoading(false);
      }
    }, 8000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      sessionResolvida = true;
      clearTimeout(safetyTimer); // getSession OK · deixa a carga (limitada) terminar sem ser cortada
      sessaoAtivaRef.current = !!session?.user;
      setUser(session?.user ?? null);
      if (session?.user) {
        await carregarDadosUsuario(session.user.id);
      }
    }).catch((e) => {
      console.warn('[Auth] Erro ao obter sessão:', e?.message);
    }).finally(() => {
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
        // Só (re)carrega na transição REAL "sem sessão → com sessão" (login, ou
        // recuperação após um sign-out espúrio do refresh de token). Foco de aba
        // (o supabase-js re-emite SIGNED_IN a cada Alt+Tab) e TOKEN_REFRESHED NÃO
        // mudam quem a pessoa é — não refazemos o fetch. Antes refazia a cada foco
        // e, com o no-op lock, o race do refresh fazia a query falhar e APAGAR o
        // perfil (virava "?"). Quem muda cargo/perfil recarrega a página (igual à
        // regra de logout/login pra renovar a matriz).
        const loginReal = !tinhaSessao;
        if (loginReal) {
          setLoading(true);
          await carregarDadosUsuario(session.user.id);
          setLoading(false);
        }
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

  // Devs (auditoria/agentes só pra eles · você + Marcos Paulo). Espelha o
  // requireDev do backend (agents.js). Adicionar mais alguém: aqui + lá.
  const DEV_EMAILS = ['gestao@cbrio.com.br', 'infra@cbrio.com.br'];
  const isDev = DEV_EMAILS.includes(String(profile?.email || user?.email || '').toLowerCase());

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
  // A contagem de módulos DISTINTOS vem do backend (granular.slugsComAcesso ·
  // slugs deduplicados no catálogo). ⚠️ NÃO dá pra contar por referência em
  // modulePerms: o backend indexa nome e slug no MESMO objeto, mas o JSON da
  // resposta duplica os objetos — o new Set vê 2 pra um módulo só e a trava
  // nunca dispara. Fallback por referência só pra resposta de backend antigo.
  const slugsComAcesso = Array.isArray(permData?.slugsComAcesso) ? permData.slugsComAcesso : null;
  let slugTravavel = null;
  if (slugsComAcesso) {
    slugTravavel = (slugsComAcesso.length === 1 && MODULO_ROTA_TRAVA[slugsComAcesso[0]])
      ? slugsComAcesso[0]
      : null;
  } else if (modulePerms) {
    const entriesComAcesso = [...new Set(Object.values(modulePerms).filter((p) => p && (p.leitura || 0) >= 1))];
    slugTravavel = entriesComAcesso.length === 1
      ? (Object.keys(MODULO_ROTA_TRAVA).find((s) => modulePerms?.[s] === entriesComAcesso[0]) || null)
      : null;
  }
  // Módulo único da conta (slug) — usado também pelo landing pós-login (homeRoute).
  const moduloUnico = slugsComAcesso && slugsComAcesso.length === 1 ? slugsComAcesso[0] : null;
  const moduloTravado = (
    !!profile?.is_membro_only && !isAdmin && profile?.role !== 'diretor' && !isVoluntario && slugTravavel
  ) ? slugTravavel : null;
  const rotaTravada = moduloTravado ? MODULO_ROTA_TRAVA[moduloTravado] : null;
  const travaPrefixos = moduloTravado
    ? (MODULO_TRAVA_PREFIXOS[moduloTravado] || [MODULO_ROTA_TRAVA[moduloTravado]])
    : null;
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
    travaPrefixos,
    moduloUnico,
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
    isDev,
    signInWithMicrosoft,
    signInWithGoogle,
    signInWithEmail,
    sendPasswordReset,
    updatePasswordWithCurrent,
    updatePasswordOnly,
    signOut,
    refreshProfile: () => user?.id && fetchProfile(user.id),
    // Recarrega perfil + permissões (usado pelo ModuleGuard quando o estado não
    // hidratou — carga lenta / falha transitória / rede de segurança de 8s).
    recarregarAuth: () => (user?.id ? carregarDadosUsuario(user.id) : Promise.resolve()),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // During HMR, context can temporarily be null — return a safe fallback
    return {
      user: null, profile: null, loading: true, role: null,
      isAdmin: false, isDiretor: false, isVoluntario: false, isMembroOnly: false, moduloTravado: null, rotaTravada: null, travaPrefixos: null, moduloUnico: null, isColaborador: false, modulePerms: null,
      canAccessModule: () => false, getAccessLevel: () => 1,
      canRH: false, canFinanceiro: false, canLogistica: false,
      canPatrimonio: false, canMembresia: false, canProjetos: false,
      canExpansao: false, canAgenda: false, canIA: false, canCuidados: false,
      canProcessos: false, canSolicitacoes: false, canNPS: false,
      canDadosBrutos: false, canPainel: false, canKPIs: false,
      userAreas: [], userSetores: [],
      cargoNome: null, cargoSlug: null, isDev: false,
      recarregarAuth: async () => {},
      refreshProfile: async () => {},
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
