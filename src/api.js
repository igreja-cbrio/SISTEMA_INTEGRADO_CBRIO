import { supabase } from './supabaseClient';
import { resolveApiBaseUrl } from './lib/api-base';

// Configure this to point to your Vercel backend
const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

// Token de acesso em cache · mantido fresco pelo onAuthStateChange (o supabase-js
// re-dispara a sessão a cada refresh/foco de aba). Serve de fallback pra quando o
// getSession() pendura (bug do Web Lock órfão do supabase-js · ver supabaseClient.js).
// Sem isso, um getToken() travado deixava QUALQUER request (ex.: salvar meta)
// "carregando pra sempre" até o usuário recarregar a página.
let _cachedToken = null;
if (supabase) {
  supabase.auth.getSession()
    .then(({ data }) => { _cachedToken = data?.session?.access_token || null; })
    .catch(() => {});
  supabase.auth.onAuthStateChange((_event, session) => {
    _cachedToken = session?.access_token || null;
  });
}

// Decodifica o exp do JWT · true se já venceu (ou vence em <30s). Em qualquer
// erro de parse, assume VÁLIDO (não pioramos o fluxo).
function tokenExpirado(t) {
  try {
    const p = JSON.parse(atob(t.split('.')[1]));
    return !p.exp || p.exp * 1000 < Date.now() + 30000;
  } catch { return false; }
}

async function getToken() {
  if (!supabase) return null;
  // FAST-PATH (perf · 2026-06-30): token cacheado e ainda válido → devolve na
  // HORA, sem aguardar o getSession(). Antes, todo request esperava o getSession
  // (corrida de 3s) antes de disparar → os dados demoravam a aparecer. O cache é
  // mantido fresco pelo onAuthStateChange (refresh/foco) e a checagem de exp
  // (margem de 30s) força um refresh real ANTES de vencer. Sem getSession no hot path.
  if (_cachedToken && !tokenExpirado(_cachedToken)) return _cachedToken;

  // getSession() pode pendurar indefinidamente (Web Lock órfão · issues supabase-js
  // #1594/#2111). Corremos contra um timeout curto e caímos no token cacheado, pra
  // o request nunca travar (botão "Salvar" girando infinito · incidente 2026-06-29).
  try {
    const session = await Promise.race([
      supabase.auth.getSession().then(({ data }) => data?.session || null),
      new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (session?.access_token) {
      _cachedToken = session.access_token;
      return _cachedToken;
    }
  } catch {
    /* cai no token cacheado abaixo */
  }
  // Se o token cacheado está EXPIRADO, NÃO o devolvemos: mandá-lo daria 401
  // 'invalid_token' → handleDeadSession deslogaria abruptamente no meio da ação.
  // Tenta um refresh real (timeout maior); se nem assim, retorna null → vira
  // 'no_token' (mensagem suave de re-login, sem redirect abrupto). 2026-06-30.
  if (_cachedToken && tokenExpirado(_cachedToken)) {
    try {
      // refreshSession() FORÇA a renovação (getSession poderia devolver o mesmo
      // token vencido). Re-valida o exp do retornado antes de aceitar.
      const refreshed = await Promise.race([
        supabase.auth.refreshSession().then(({ data }) => data?.session?.access_token || null),
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
      if (refreshed && !tokenExpirado(refreshed)) { _cachedToken = refreshed; return _cachedToken; }
    } catch { /* ignora */ }
    return null;
  }
  return _cachedToken;
}

const headers = async () => {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Sessão morta (token inválido/expirado/de outro ambiente): limpa a sessão do
// Supabase e manda pro login, em vez de deixar a tela travada com mensagem de
// erro. Trava anti-loop (uma vez por carregamento) + não redireciona se já
// estiver no /login.
let _deadSessionHandled = false;
async function handleDeadSession() {
  if (_deadSessionHandled) return;
  _deadSessionHandled = true;
  try { await supabase?.auth.signOut(); } catch {}
  try {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.replace('/login');
    }
  } catch {}
}

async function request(path, opts = {}) {
  const h = await headers();
  // Timeout (default 30s · configurável por opts.timeout) pra um backend/rede
  // lento não deixar a UI "carregando pra sempre". requestFile já usa esse padrão.
  const { timeout = 30000, ...rest } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(`${API}${path}`, { ...rest, headers: { ...h, ...rest.headers }, signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('Tempo esgotado ao falar com o servidor. Recarregue a página ou tente de novo.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('Backend não disponível. Os módulos funcionam apenas com o servidor rodando.');
  }

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    console.warn('[API] 401', { path, reason: body.reason, detail: body.detail });
    // invalid_token = tinha um token, mas o servidor recusou (expirado / de
    // outro ambiente). Sessão morta → desloga e manda pro login (self-heal).
    // no_token = simplesmente não está logado → NÃO redireciona (evita loop na
    // própria tela de login).
    if (body.reason === 'invalid_token') {
      handleDeadSession();
    }
    const reasonMsg = {
      no_token:       'Sessão expirada. Faça login novamente.',
      invalid_token:  'Sua sessão expirou. Redirecionando para o login...',
    };
    throw new Error(reasonMsg[body.reason] || body.error || 'Não autorizado. Verifique se o backend está configurado corretamente.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    const error = new Error(err.error || `HTTP ${res.status}`);
    // Preserve all extra fields from error body (alreadyCheckedIn, volunteerName, etc.)
    Object.assign(error, err);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

const get = (path, opts) => request(path, { ...opts });
// opts opcional (ex.: { timeout }) pra operações longas — sync do Planning
// Center, imports — que legitimamente passam do timeout padrão de 30s.
const post = (path, body, opts) => request(path, { method: 'POST', body: JSON.stringify(body), ...opts });
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = (path) => request(path, { method: 'DELETE' });

export const users = {
  list: () => get('/auth/users'),
  me: () => get('/auth/me'),
};

// Progresso de tutoriais (onboarding) · backend com service role · 1x por
// usuário+tour, confiável (não depende de RLS/anon key no frontend).
export const tutorial = {
  progress: () => get('/tutorial/progress'),
  complete: (tour_id, status) => post('/tutorial/complete', { tour_id, status }),
  reset: (tour_id) => del('/tutorial/progress' + (tour_id ? `?tour_id=${encodeURIComponent(tour_id)}` : '')),
};

// Reconhecimento facial na entrada · membro-ou-anônimo + rostos a resolver
export const face = {
  reconhecer: (data) => post('/face/reconhecer', data),
  resumo: (params) => get('/face/presencas/resumo' + (params ? '?' + new URLSearchParams(params) : '')),
  presencaLista: (params) => get('/face/presencas/lista' + (params ? '?' + new URLSearchParams(params) : '')),
  cultos: () => get('/face/cultos'),
  anonimos: (params) => get('/face/anonimos' + (params ? '?' + new URLSearchParams(params) : '')),
  vincular: (anonId, membro_id) => post(`/face/anonimos/${anonId}/vincular`, { membro_id }),
  cadastrar: (anonId, data) => post(`/face/anonimos/${anonId}/cadastrar`, data),
  descartar: (anonId) => post(`/face/anonimos/${anonId}/descartar`, {}),
  importarAnonimo: (data) => post('/face/anonimos/importar', data),
  galeria: (params) => get('/face/membros/galeria' + (params ? '?' + new URLSearchParams(params) : '')),
  // Carrega a foto do membro pelo MESMO domínio (proxy) → blob → object URL.
  // Evita CORS (foto do PCO/app cross-origin tornaria o canvas "tainted").
  fotoBlobUrl: async (membroId) => {
    const token = await getToken();
    const res = await fetch(`${API}/face/membros/${membroId}/foto`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Falha ao carregar a foto');
    return URL.createObjectURL(await res.blob());
  },
  enroll: (membroId, descriptor, consentimento) => post(`/face/membros/${membroId}/enroll`, { descriptor, consentimento }),
  removerEnroll: (membroId) => del(`/face/membros/${membroId}/enroll`),
};

// Onda 0 · loop de feedback do piloto
export const feedback = {
  enviar: (data) => post('/feedback', data),
  list: (params) => get('/feedback' + (params ? '?' + new URLSearchParams(params) : '')),
  resumo: () => get('/feedback/resumo'),
  erros: () => get('/feedback/erros'),
  relatorios: () => get('/feedback/relatorios'),
  atualizar: (id, data) => patch(`/feedback/${id}`, data),
};

export const events = {
  list: (params) => get('/events' + (params ? '?' + new URLSearchParams(params) : '')),
  dashboard: () => get('/events/dashboard'),
  categories: () => get('/events/categories'),
  get: (id) => get(`/events/${id}`),
  create: (data) => post('/events', data),
  update: (id, data) => put(`/events/${id}`, data),
  updateStatus: (id, status) => patch(`/events/${id}/status`, { status }),
  remove: (id) => del(`/events/${id}`),
  updateOccurrence: (evId, occId, data) => patch(`/events/${evId}/occurrences/${occId}`, data),
  createTask: (evId, data) => post(`/events/${evId}/tasks`, data),
  updateTask: (taskId, data) => put(`/events/tasks/${taskId}`, data),
  updateTaskStatus: (taskId, status) => patch(`/events/tasks/${taskId}/status`, { status }),
  removeTask: (taskId) => del(`/events/tasks/${taskId}`),
  createSubtask: (taskId, data) => post(`/events/tasks/${taskId}/subtasks`, data),
  toggleSubtask: (subId, done) => patch(`/events/subtasks/${subId}`, { done }),
  removeSubtask: (subId) => del(`/events/subtasks/${subId}`),
  addComment: (taskId, text) => post(`/events/tasks/${taskId}/comments`, { text }),
  simpleTemplates: () => get('/events/simple-templates'),
  createSimpleTemplate: (data) => post('/events/simple-templates', data),
  deleteSimpleTemplate: (id) => del(`/events/simple-templates/${id}`),
  toggleSimpleTemplate: (id) => patch(`/events/simple-templates/${id}/toggle`, {}),
  applySimpleTemplates: (eventId) => post(`/events/${eventId}/apply-simple-templates`, {}),
};

export const projects = {
  categories: () => get('/projects/categories'),
  dashboard: () => get('/projects/dashboard'),
  list: (params) => get('/projects' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => get(`/projects/${id}`),
  create: (data) => post('/projects', data),
  update: (id, data) => put(`/projects/${id}`, data),
  remove: (id) => del(`/projects/${id}`),
  createPhase: (pId, data) => post(`/projects/${pId}/phases`, data),
  updatePhase: (phaseId, data) => patch(`/projects/phases/${phaseId}`, data),
  createTask: (pId, data) => post(`/projects/${pId}/tasks`, data),
  updateTask: (taskId, data) => put(`/projects/tasks/${taskId}`, data),
  updateTaskStatus: (taskId, status) => patch(`/projects/tasks/${taskId}/status`, { status }),
  removeTask: (taskId) => del(`/projects/tasks/${taskId}`),
  createSubtask: (taskId, data) => post(`/projects/tasks/${taskId}/subtasks`, data),
  toggleSubtask: (subId, done) => patch(`/projects/subtasks/${subId}`, { done }),
  removeSubtask: (subId) => del(`/projects/subtasks/${subId}`),
  addComment: (taskId, text) => post(`/projects/tasks/${taskId}/comments`, { text }),
  createMilestone: (pId, data) => post(`/projects/${pId}/milestones`, data),
  updateMilestone: (mId, data) => put(`/projects/milestones/${mId}`, data),
  updateMilestoneStatus: (mId, status) => patch(`/projects/milestones/${mId}/status`, { status }),
  createKpi: (pId, data) => post(`/projects/${pId}/kpis`, data),
  updateKpi: (kpiId, data) => patch(`/projects/kpis/${kpiId}`, data),
  removeKpi: (kpiId) => del(`/projects/kpis/${kpiId}`),
  createRisk: (pId, data) => post(`/projects/${pId}/risks`, data),
  updateRisk: (riskId, data) => patch(`/projects/risks/${riskId}`, data),
  removeRisk: (riskId) => del(`/projects/risks/${riskId}`),
  createBudgetItem: (pId, data) => post(`/projects/${pId}/budget`, data),
  updateBudgetItem: (itemId, data) => patch(`/projects/budget/${itemId}`, data),
  removeBudgetItem: (itemId) => del(`/projects/budget/${itemId}`),
  getRetrospective: (pId) => get(`/projects/${pId}/retrospective`),
  saveRetrospective: (pId, data) => post(`/projects/${pId}/retrospective`, data),
};

export const expansion = {
  dashboard: () => get('/expansion/dashboard'),
  milestones: () => get('/expansion/milestones'),
  createMilestone: (data) => post('/expansion/milestones', data),
  updateMilestone: (id, data) => put(`/expansion/milestones/${id}`, data),
  removeMilestone: (id) => del(`/expansion/milestones/${id}`),
  createTask: (miId, data) => post(`/expansion/milestones/${miId}/tasks`, data),
  updateTask: (id, data) => put(`/expansion/tasks/${id}`, data),
  removeTask: (id) => del(`/expansion/tasks/${id}`),
  createSubtask: (taskId, data) => post(`/expansion/tasks/${taskId}/subtasks`, data),
  updateSubtaskPct: (id, pct) => patch(`/expansion/subtasks/${id}`, { pct }),
  removeSubtask: (id) => del(`/expansion/subtasks/${id}`),
  getDependents: (id) => get(`/expansion/milestones/${id}/dependents`),
  getDependencies: (id) => get(`/expansion/milestones/${id}/dependencies`),
  // Planos · camada cíclica (aba Acompanhamento)
  planos: () => get('/expansion/planos'),
  createPlano: (data) => post('/expansion/planos', data),
  updatePlano: (id, data) => put(`/expansion/planos/${id}`, data),
  encerrarPlano: (id, data) => post(`/expansion/planos/${id}/encerrar`, data),
  reabrirPlano: (id) => post(`/expansion/planos/${id}/reabrir`, {}),
  removePlano: (id) => del(`/expansion/planos/${id}`),
};

// Eventos Externos · gestão (autenticado)
export const eventosExternos = {
  list: () => get('/eventos-externos'),
  get: (id) => get(`/eventos-externos/${id}`),
  criar: (data) => post('/eventos-externos', data),
  atualizar: (id, data) => put(`/eventos-externos/${id}`, data),
  remover: (id) => del(`/eventos-externos/${id}`),
  sortear: (id, premio) => post(`/eventos-externos/${id}/sortear`, { premio }),
  uploadCapa: (file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile('/eventos-externos/upload-capa', fd); },
};

// Eventos Externos · formulário público de confirmação de presença (sem auth)
export const eventoPublico = {
  get: (slug) => fetch(`${API}/public/evento/${encodeURIComponent(slug)}`).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),
  inscrever: (slug, data) => fetch(`${API}/public/evento/${encodeURIComponent(slug)}/inscrever`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),
  // Upload de imagem de um campo do formulário (ex.: logo da empresa) · sem auth.
  uploadImagem: (slug, file) => {
    const fd = new FormData(); fd.append('arquivo', file);
    return fetch(`${API}/public/evento/${encodeURIComponent(slug)}/upload-imagem`, { method: 'POST', body: fd })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; });
  },
};

// Decisão online · formulário público "Eu aceito Jesus" (sem auth)
export const decisaoOnline = {
  ativo: () => fetch(`${API}/public/decisao-online/ativo`).then(r => r.json()),
  registrar: (data) => fetch(`${API}/public/decisao-online`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(async r => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || 'Erro');
    return j;
  }),
};

export const next = {
  // Public (sem auth) — para o formulário
  publicEventos: () => fetch(`${API}/public/next/eventos`).then(r => r.json()),
  publicInscrever: (data) => fetch(`${API}/public/next/inscrever`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(async r => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro');
    return j;
  }),
  // Direcionamento self-service pelo QR no fim do Next (Fase 2a) · token assinado da turma
  publicDirecionarInfo: (token) => fetch(`${API}/public/next/direcionar/${token}`).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),
  publicDirecionar: (token, data) => fetch(`${API}/public/next/direcionar/${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),
  // QR de direcionamento (token fixo · resolve a turma aberta do momento) · admin
  direcionarQr: () => get('/next/direcionar-qr'),
  // Admin
  dashboard: () => get('/next/dashboard'),
  eventos: {
    list: (params) => get('/next/eventos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/next/eventos', data),
    update: (id, data) => put(`/next/eventos/${id}`, data),
    autoCreateMes: (data) => post('/next/eventos/auto-create-mes', data || {}),
  },
  inscricoes: {
    list: (params) => get('/next/inscricoes' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/next/inscricoes/${id}`),
    create: (data) => post('/next/inscricoes', data),
    update: (id, data) => put(`/next/inscricoes/${id}`, data),
    checkin: (id) => post(`/next/inscricoes/${id}/checkin`, {}),
    descheckin: (id) => del(`/next/inscricoes/${id}/checkin`),
    indicacoes: (id, data) => post(`/next/inscricoes/${id}/indicacoes`, data),
  },
  indicacoes: {
    list: (params) => get('/next/indicacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    update: (id, data) => put(`/next/indicacoes/${id}`, data),
  },
  // Turmas — Next como coorte de 2 encontros + presença
  turmas: {
    list: (params) => get('/next/turmas' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/next/turmas/${id}`),
    create: (data) => post('/next/turmas', data),
    update: (id, data) => patch(`/next/turmas/${id}`, data),
    remove: (id) => del(`/next/turmas/${id}`),
    listaEspera: () => get('/next/lista-espera'),
  },
  encontros: {
    update: (id, data) => patch(`/next/encontros/${id}`, data),
    setPresencas: (id, matriculaIds) => put(`/next/encontros/${id}/presencas`, { matricula_ids: matriculaIds }),
  },
  matriculas: {
    list: (params) => get('/next/matriculas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/next/matriculas', data),
    update: (id, data) => patch(`/next/matriculas/${id}`, data),
    remove: (id) => del(`/next/matriculas/${id}`),
    // Direcionar pros valores (grupos/voluntarios/batismo/devocional) · cria encaminhamento
    // origem='next' (grupos/voluntarios), inscrição pendente (batismo), registra (devocional).
    direcionar: (id, destinos) => post(`/next/matriculas/${id}/direcionar`, { destinos }),
    // Liga as matrículas órfãs (sem membro_id) via matcher forte (fecha o funil).
    backfillMembros: () => post('/next/matriculas/backfill-membros', {}),
  },
  // Pessoas — funil unificado (convertidos + matrículas, 1 linha/pessoa)
  pessoas: (params) => get('/next/pessoas' + (params ? '?' + new URLSearchParams(params) : '')),
  // Curso — visão por pessoa de quem passou pelo Next (aula 1/2, concluiu, sem-CPF)
  curso: () => get('/next/curso'),
  // Override manual de aula 1/2 (o responsável corrige a presença não computada)
  pessoaAulas: (membroId, data) => put(`/next/pessoa/${membroId}/aulas`, data),
  convertidos: {
    resolver: (id, resolucao) => post(`/next/convertidos/${id}/resolver`, { resolucao }),
    desresolver: (id) => del(`/next/convertidos/${id}/resolver`),
  },
};

export const integracao = {
  // visitantes/acompanhamentos removidos (2026-06-25) · superfície órfã do
  // redesenho de mai/26 (PR #399) · nenhuma tela consumia. Dados de visitante
  // hoje vivem em Cuidados/Membresia.
  dashboard: () => get('/integracao/dashboard'),
  historicoAnual: () => get('/integracao/historico-anual'),
  historicoBatismos: () => get('/integracao/historico-batismos'),
  coleta: {
    cultosAbertos: () => get('/integracao/coleta/cultos-abertos'),
    submeter: (data) => post('/integracao/coleta', data),
    minhas: () => get('/integracao/coleta/minhas'),
    pendentes: () => get('/integracao/coleta/pendentes'),
    aprovar: (id) => post(`/integracao/coleta/${id}/aprovar`),
    rejeitar: (id, motivo) => post(`/integracao/coleta/${id}/rejeitar`, { motivo }),
  },
  decisoesApp: {
    list: (status = 'pendente') => get(`/integracao/decisoes-app?status=${status}`),
    confirmar: (id, culto_id) => post(`/integracao/decisoes-app/${id}/confirmar`, { culto_id }),
    descartar: (id) => post(`/integracao/decisoes-app/${id}/descartar`),
  },
};

export const dashboardSemanal = {
  cultos: () => get('/dashboard-semanal/cultos'),
  semanasDisponiveis: (ano) => get(`/dashboard-semanal/semanas-disponiveis?ano=${ano}`),
  semanal: (params) => get('/dashboard-semanal/semanal?' + new URLSearchParams(params)),
  resumoSemana: (ano, semana) => get(`/dashboard-semanal/resumo-semana?ano=${ano}&semana=${semana}`),
  voluntariadoPessoas: (ano, semana) => get(`/dashboard-semanal/voluntariado-pessoas?ano=${ano}&semana=${semana}`),
  voluntariadoComposicao: (ano, semana) => get(`/dashboard-semanal/voluntariado-composicao?ano=${ano}&semana=${semana}`),
  // Observações da semana (ex.: "Não houve culto · jogo do Brasil")
  notasList: (ano, semana) => get(`/dashboard-semanal/notas?ano=${ano}&semana=${semana}`),
  notaCreate: (data) => post('/dashboard-semanal/notas', data),
  notaDelete: (id) => del(`/dashboard-semanal/notas/${id}`),
  resumoMes: (ano, mes) => get(`/dashboard-semanal/resumo-mes?ano=${ano}&mes=${mes}`),
  ranking: (params) => get('/dashboard-semanal/ranking?' + new URLSearchParams(params)),
  yoy: (params) => get('/dashboard-semanal/yoy?' + new URLSearchParams(params)),
  mensal: (params) => get('/dashboard-semanal/mensal?' + new URLSearchParams(params)),
  mediaMovel: (params) => get('/dashboard-semanal/media-movel?' + new URLSearchParams(params)),
  metasList: () => get('/dashboard-semanal/metas'),
  metaCreate: (data) => post('/dashboard-semanal/metas', data),
  metaUpdate: (id, data) => put(`/dashboard-semanal/metas/${id}`, data),
  metaRemove: (id) => del(`/dashboard-semanal/metas/${id}`),
  metaSugerir: (params) => get('/dashboard-semanal/metas/sugerir?' + new URLSearchParams(params)),
  metaValorAtual: (params) => get('/dashboard-semanal/metas/valor-atual?' + new URLSearchParams(params)),
  iaSugerirIndicador: (pergunta) => post('/dashboard-semanal/ia/sugerir-indicador', { pergunta }),
  indicadoresCustomList: (status) => get('/dashboard-semanal/indicadores-custom' + (status ? `?status=${status}` : '')),
  indicadorCustomPatch: (id, data) => patch(`/dashboard-semanal/indicadores-custom/${id}`, data),
  indicadorCustomRemove: (id) => del(`/dashboard-semanal/indicadores-custom/${id}`),
  // Lista KPIs taticos com status (reuso da view do módulo painel) pra aba
  // "KPIs" do dashboard. Filtros opcionais: área, periodicidade, status, kpi.
  kpisTaticos: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/kpis/v2/taticos' + (qs ? '?' + qs : ''));
  },
  // Detalhe do KPI · indicador + histórico + checkpoints + líder · usa endpoint
  // do painel pra não duplicar lógica.
  kpiDetalhe: (id) => get(`/painel/kpi/${encodeURIComponent(id)}`),
};

export const grupos = {
  list: (params) => get('/grupos' + (params ? '?' + new URLSearchParams(params) : '')),
  meu: () => get('/grupos/meu'),
  get: (id) => get(`/grupos/${id}`),
  create: (data) => post('/grupos', data),
  update: (id, data) => put(`/grupos/${id}`, data),
  remove: (id) => del(`/grupos/${id}`),
  addMembro: (grupoId, data) => post(`/grupos/${grupoId}/membros`, data),
  // Funil de entrada pro botão "Adicionar": direcionados do Next + inscritos neste grupo
  candidatosAdicionar: (grupoId) => get(`/grupos/${grupoId}/candidatos-adicionar`),
  sairMembro: (participacaoId, data) => patch(`/grupos/participacao/${participacaoId}/sair`, data),
  registrarPresenca: (participacaoId) => patch(`/grupos/participacao/${participacaoId}/presenca`, {}),
  materiais: (params) => get('/grupos/materiais' + (params ? '?' + new URLSearchParams(params) : '')),
  uploadMaterial: (formData) => requestFile('/grupos/materiais', formData),
  importarLideresAnalisar: (file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile('/grupos/importar-lideres/analisar', fd, { timeoutMs: 120_000 }); },
  // Importa o consolidado de participantes (pessoas × grupos). dryRun=true só prévia.
  importarParticipantes: (file, { dryRun = true, reconciliar = false } = {}) => { const fd = new FormData(); fd.append('arquivo', file); const qs = [dryRun ? 'dry_run=1' : '', reconciliar ? 'reconciliar=1' : ''].filter(Boolean).join('&'); return requestFile(`/grupos/importar-participantes${qs ? `?${qs}` : ''}`, fd, { timeoutMs: 300_000 }); },
  importarLideresAplicar: (vinculos) => post('/grupos/importar-lideres/aplicar', { vinculos }),
  removeMaterial: (docId) => del(`/grupos/materiais/${docId}`),
  encontros: (grupoId, params) => get(`/grupos/${grupoId}/encontros` + (params ? '?' + new URLSearchParams(params) : '')),
  encontro: (encontroId) => get(`/grupos/encontros/${encontroId}`),
  registrarEncontro: (grupoId, data) => post(`/grupos/${grupoId}/encontros`, data),
  atualizarEncontro: (encontroId, data) => patch(`/grupos/encontros/${encontroId}`, data),
  removerEncontro: (encontroId) => del(`/grupos/encontros/${encontroId}`),
  metricas: (grupoId) => get(`/grupos/${grupoId}/metricas`),
  saudeAgregada: (params) => get('/grupos/saude/agregado' + (params ? '?' + new URLSearchParams(params) : '')),
  relatorioKpis: (params) => get('/grupos/kpis/relatorio' + (params ? '?' + new URLSearchParams(params) : '')),
  lideresTreinamento: (params) => get('/grupos/kpis/lideres-treinamento' + (params ? '?' + new URLSearchParams(params) : '')),
  temporadas: () => get('/grupos/temporadas/list'),
  atualizarTemporada: (id, data) => patch(`/grupos/temporadas/${id}`, data),
  // Flag global de temporada de inscrições (app lê pra liberar auto-inscrição)
  temporadaInscricoes: {
    get: () => get('/grupos/temporada-inscricoes'),
    set: (data) => put('/grupos/temporada-inscricoes', data),
  },
  bairros: (params) => get('/grupos/bairros/list' + (params ? '?' + new URLSearchParams(params) : '')),
  // Busca / pedidos de inscrição
  buscar: (params) => get('/grupos/buscar' + (params ? '?' + new URLSearchParams(params) : '')),
  buscarLideres: (params) => get('/grupos/lideres/buscar' + (params ? '?' + new URLSearchParams(params) : '')),
  gruposDoLider: (liderId, params) => get(`/grupos/lideres/${liderId}/grupos` + (params ? '?' + new URLSearchParams(params) : '')),
  criarPedido: (grupoId, data) => post(`/grupos/${grupoId}/pedidos`, data),
  listarPedidos: (params) => get('/grupos/pedidos/list' + (params ? '?' + new URLSearchParams(params) : '')),
  contarPedidos: () => get('/grupos/pedidos/count'),
  historicoMembros: (grupoId) => get(`/grupos/${grupoId}/historico-membros`),
  aprovarPedido: (pedidoId) => post(`/grupos/pedidos/${pedidoId}/aprovar`, {}),
  rejeitarPedido: (pedidoId, motivo) => post(`/grupos/pedidos/${pedidoId}/rejeitar`, { motivo }),
  geocodeBatch: (data) => post('/grupos/geocode-batch', data || {}),
  // Supervisao
  supervisaoMe: () => get('/grupos/supervisao/me'),
  setSupervisor: (grupoId, supervisor_id) => put(`/grupos/${grupoId}/supervisor`, { supervisor_id }),
  setFuncaoMembro: (membroRowId, funcao) => put(`/grupos/membros/${membroRowId}/funcao`, { funcao }),
  listVisitas: (grupoId) => get(`/grupos/${grupoId}/visitas`),
  addVisita: (grupoId, body) => post(`/grupos/${grupoId}/visitas`, body),
  updateVisita: (visitaId, body) => patch(`/grupos/visitas/${visitaId}`, body),
  removeVisita: (visitaId) => del(`/grupos/visitas/${visitaId}`),
  visitasPainel: () => get('/grupos/visitas/painel'),
  pessoasPapeis: () => get('/grupos/pessoas/papeis'),
  marcarEstudoSemana: (docId, ativo) => patch(`/whatsapp-grupos/materiais/${docId}/estudo-semana`, { ativo }),
  semRelato: () => get('/grupos/kpis/sem-relato'),
  listObservacoes: (grupoId) => get(`/grupos/${grupoId}/observacoes`),
  setObservacao: (grupoId, periodo, observacao) => put(`/grupos/${grupoId}/observacoes/${periodo}`, { observacao }),
};

export const whatsapp = {
  // Teste de disparo de template pra si mesmo (valida env + template)
  testDisparo: (chave) => post('/whatsapp/test-disparo', { chave }),
  // Líderes · vinculo telefone -> profile
  listLideres: () => get('/whatsapp/lideres'),
  vincularLider: (data) => post('/whatsapp/lideres', data),
  atualizarLider: (id, data) => put(`/whatsapp/lideres/${id}`, data),
  removerLider: (id) => del(`/whatsapp/lideres/${id}`),
  // Coletas · revisão e aplicação
  listColetas: (status) => get('/whatsapp/coletas' + (status ? `?status=${status}` : '')),
  aplicarColeta: (id) => post(`/whatsapp/coletas/${id}/aplicar`, {}),
  rejeitarColeta: (id, motivo) => post(`/whatsapp/coletas/${id}/rejeitar`, { motivo }),
  // Config institucional + toggle IA
  getConfig: () => get('/whatsapp/config'),
  saveConfig: (data) => put('/whatsapp/config', data),
  // Broadcast pra equipe (aviso pontual · {nome} = primeiro nome)
  broadcastDestinatarios: () => get('/whatsapp/broadcast/destinatarios'),
  broadcastEnviar: (mensagem) => post('/whatsapp/broadcast', { mensagem }),
};

export const strategic = {
  categories: () => get('/strategic/categories'),
  list: (params) => get('/strategic' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => get(`/strategic/${id}`),
  create: (data) => post('/strategic', data),
  update: (id, data) => put(`/strategic/${id}`, data),
  remove: (id) => del(`/strategic/${id}`),
  createTask: (planId, data) => post(`/strategic/${planId}/tasks`, data),
  updateTask: (taskId, data) => put(`/strategic/tasks/${taskId}`, data),
  updateTaskStatus: (taskId, status) => patch(`/strategic/tasks/${taskId}/status`, { status }),
  removeTask: (taskId) => del(`/strategic/tasks/${taskId}`),
  createSubtask: (taskId, data) => post(`/strategic/tasks/${taskId}/subtasks`, data),
  toggleSubtask: (subId, done) => patch(`/strategic/subtasks/${subId}`, { done }),
  removeSubtask: (subId) => del(`/strategic/subtasks/${subId}`),
  addComment: (taskId, text) => post(`/strategic/tasks/${taskId}/comments`, { text }),
  createMilestone: (planId, data) => post(`/strategic/${planId}/milestones`, data),
  updateMilestone: (mId, data) => put(`/strategic/milestones/${mId}`, data),
  updateMilestoneStatus: (mId, status) => patch(`/strategic/milestones/${mId}/status`, { status }),
};

export const meetings = {
  list: (params) => get('/meetings' + (params ? '?' + new URLSearchParams(params) : '')),
  create: (data) => post('/meetings', data),
  update: (id, data) => put(`/meetings/${id}`, data),
  remove: (id) => del(`/meetings/${id}`),
  togglePendency: (id, done) => patch(`/meetings/pendencies/${id}`, { done }),
  removePendency: (id) => del(`/meetings/pendencies/${id}`),
};

export const dashboard = {
  pmo: () => get('/dashboard/pmo'),
  workload: () => get('/dashboard/workload'),
};

export const risks = {
  list: (eventId) => get(`/events/${eventId}/risks`),
  create: (eventId, data) => post(`/events/${eventId}/risks`, data),
  update: (riskId, data) => patch(`/events/risks/${riskId}`, data),
  remove: (riskId) => del(`/events/risks/${riskId}`),
};

export const retrospective = {
  get: (eventId) => get(`/events/${eventId}/retrospective`),
  save: (eventId, data) => post(`/events/${eventId}/retrospective`, data),
};

export const history = {
  list: (eventId) => get(`/events/${eventId}/history`),
};

export const tasks = {
  // finalized: 'hide' (default, esconde fechadas-com-evento) | 'show' (todas, marcadas) | 'only' (só fechadas-com-evento)
  all: (params) => {
    const q = new URLSearchParams();
    if (params?.source) q.set('source', params.source);
    if (params?.area) q.set('area', params.area);
    if (params?.finalized) q.set('finalized', params.finalized);
    const qs = q.toString();
    return get('/tasks/all' + (qs ? '?' + qs : ''));
  },
  updateStatus: (source, taskId, status) => patch(`/tasks/${source}/${taskId}/status`, { status }),
};

export const occurrences = {
  get: (occId) => get(`/occurrences/${occId}`),
  list: (eventId) => get(`/occurrences/${eventId}`),
  create: (eventId, data) => post(`/occurrences/${eventId}`, data),
  update: (id, data) => patch(`/occurrences/${id}`, data),
  remove: (id) => del(`/occurrences/${id}`),
  createTask: (occId, data) => post(`/occurrences/${occId}/tasks`, data),
  updateTask: (taskId, data) => patch(`/occurrences/tasks/${taskId}`, data),
  updateTaskStatus: (taskId, status) => patch(`/occurrences/tasks/${taskId}/status`, { status }),
  removeTask: (taskId) => del(`/occurrences/tasks/${taskId}`),
  createMeeting: (occId, data) => post(`/occurrences/${occId}/meetings`, data),
  removeMeeting: (id) => del(`/occurrences/meetings/${id}`),
  togglePendency: (id, done) => patch(`/occurrences/pendencies/${id}`, { done }),
};

export const cycles = {
  activate: (eventId) => post(`/cycles/activate/${eventId}`, {}),
  get: (eventId) => get(`/cycles/${eventId}`),
  createPhase: (data) => post('/cycles/phases', data),
  updatePhase: (phaseId, data) => patch(`/cycles/phases/${phaseId}`, data),
  deletePhase: (phaseId) => del(`/cycles/phases/${phaseId}`),
  createTask: (data) => post('/cycles/tasks', data),
  updateTask: (taskId, data) => patch(`/cycles/tasks/${taskId}`, data),
  updateSubtask: (subId, data) => patch(`/cycles/subtasks/${subId}`, data),
  createSubtask: (taskId, name) => post(`/cycles/tasks/${taskId}/subtasks`, { name }),
  deleteSubtask: (subId) => del(`/cycles/subtasks/${subId}`),
  deleteTask: (taskId) => del(`/cycles/tasks/${taskId}`),
  updateAdmItem: (itemId, data) => patch(`/cycles/adm/${itemId}`, data),
  registerExpense: (data) => post('/cycles/expenses', data),
  summaryAll: () => get('/cycles/summary/all'),
  kanbanAll: () => get('/cycles/kanban/all'),
  // KPIs
  kpiEvento: (eventId) => get(`/cycles/kpis/evento/${eventId}`),
  kpiCross: (params) => get('/cycles/kpis/cross' + (params ? '?' + new URLSearchParams(params) : '')),
  deliverCard: (cardId, data) => post(`/cycles/card-completions/${cardId}/deliver`, data),
  approveCard: (cardId) => patch(`/cycles/card-completions/${cardId}/approve`, {}),
  qualityCard: (cardId, rating) => patch(`/cycles/card-completions/${cardId}/quality`, { quality_rating: rating }),
  docResumo: (taskId) => get(`/cycles/kpis/doc-resumo/${taskId}`),
  toggleCritical: (taskId, isCritical) => patch(`/cycles/tasks/${taskId}/critical`, { is_critical: isCritical }),
  kpiAreaWeights: () => get('/cycles/kpis/area-weights'),
  updateAreaWeight: (id, weight) => put(`/cycles/kpis/area-weights/${id}`, { weight }),
  // Templates de tarefas padrão
  admTemplates: () => get('/cycles/adm-templates'),
  createAdmTemplate: (data) => post('/cycles/adm-templates', data),
  updateAdmTemplate: (id, data) => put(`/cycles/adm-templates/${id}`, data),
  deleteAdmTemplate: (id) => del(`/cycles/adm-templates/${id}`),
  toggleAdmTemplate: (id) => patch(`/cycles/adm-templates/${id}/toggle`, {}),
  addAdmSubtask: (templateId, data) => post(`/cycles/adm-templates/${templateId}/subtasks`, data),
  removeAdmSubtask: (id) => del(`/cycles/adm-template-subtasks/${id}`),
};

export const revisoes = {
  diagnostico: () => get('/revisoes/diagnostico'),
  simular: (tipo, id, params) => get(`/revisoes/simular/${tipo}/${id}` + (params ? '?' + new URLSearchParams(params) : '')),
  updateProjeto: (id, data) => put(`/revisoes/projeto/${id}`, data),
  updateExpansao: (id, data) => put(`/revisoes/expansao/${id}`, data),
  deleteProjeto: (id, motivo) => request(`/revisoes/projeto/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) }),
  deleteExpansao: (id, motivo) => request(`/revisoes/expansao/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) }),
  historico: (params) => get('/revisoes/historico' + (params ? '?' + new URLSearchParams(params) : '')),
};

export const governanca = {
  // Relatórios automáticos de preparo (legado · consumidos no Eventos)
  tipos: () => get('/governanca/tipos'),
  relatorio: (sigla) => get(`/governanca/relatorio/${sigla}`),
  salvarObservacoes: (sigla, observacoes) => post(`/governanca/relatorio/${sigla}/observacoes`, { observacoes }),

  // Ciclo de reuniões de diretoria (F1)
  types: {
    list:   () => get('/governanca/types'),
    create: (data) => post('/governanca/types', data),
    update: (id, data) => patch(`/governanca/types/${id}`, data),
  },
  cycles: {
    list:   (year) => get('/governanca/cycles' + (year ? `?year=${year}` : '')),
    get:    (id) => get(`/governanca/cycles/${id}`),
    create: (year, month) => post('/governanca/cycles', { year, month }),
    generateYear: (year, fromMonth) => post('/governanca/cycles/generate-year', { year, from_month: fromMonth }),
  },
  meetings: {
    list:   (params = {}) => get('/governanca/meetings' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
    get:    (id) => get(`/governanca/meetings/${id}`),
    create: (data) => post('/governanca/meetings', data),
    update: (id, data) => patch(`/governanca/meetings/${id}`, data),
    remove: (id) => del(`/governanca/meetings/${id}`),
    aplicarTemplates: (id) => post(`/governanca/meetings/${id}/apply-templates`, {}),
    gerarPauta: (id) => post(`/governanca/meetings/${id}/gerar-pauta`, {}),
  },
  tasks: {
    create: (meetingId, data) => post(`/governanca/meetings/${meetingId}/tasks`, data),
    update: (id, data) => patch(`/governanca/tasks/${id}`, data),
    remove: (id) => del(`/governanca/tasks/${id}`),
  },
  docs: {
    list:     (meetingId) => get(`/governanca/meetings/${meetingId}/docs`),
    upload:   (meetingId, file, tipo) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      if (tipo) fd.append('tipo', tipo);
      return requestFile(`/governanca/meetings/${meetingId}/docs`, fd, { timeoutMs: 120_000 });
    },
    download: (docId) => get(`/governanca/docs/${docId}/download`),
    remove:   (docId) => del(`/governanca/docs/${docId}`),
    update:   (docId, conteudo_md) => patch(`/governanca/docs/${docId}`, { conteudo_md }),
  },
  // Análise por tema + IA (memória acumulada · pauta gerada)
  analise: (sigla, ano) => get('/governanca/analise?' + new URLSearchParams({ sigla, ...(ano ? { ano } : {}) })),
  memoria: {
    get:    (sigla, ano) => get('/governanca/memoria?' + new URLSearchParams({ sigla, ...(ano ? { ano } : {}) })),
    gerar:  (sigla, ano) => post('/governanca/memoria/gerar', { sigla, ano }),
    update: (id, conteudo_md) => patch(`/governanca/memoria/${id}`, { conteudo_md }),
  },
};

export const agents = {
  generate: (data) => post('/agents/generate', data),
  queue: (status) => get('/agents/queue' + (status ? `?status=${status}` : '')),
  approve: (id) => patch(`/agents/queue/${id}/approve`),
  reject: (id, motivo) => patch(`/agents/queue/${id}/reject`, motivo ? { motivo } : undefined),
  apply: (id) => post(`/agents/queue/${id}/apply`),
  triggerWorker: (data) => post('/agents/worker/trigger', data || {}),
  log: () => get('/agents/log'),
  run: (data) => post('/agents/run', data),
  runs: (params) => get('/agents/runs' + (params ? '?' + new URLSearchParams(params) : '')),
  runDetail: (id) => get(`/agents/runs/${id}`),
  runSteps: (id) => get(`/agents/runs/${id}/steps`),
  cancelRun: (id) => post(`/agents/runs/${id}/cancel`),
  stats: () => get('/agents/stats'),
  scores: () => get('/agents/scores'),
  memory: (module) => get(`/agents/memory/${module}`),
  // Managed Agents — Chat
  modules: () => get('/agents/modules'),
  sessions: () => get('/agents/sessions'),
  sessionMessages: (id) => get(`/agents/sessions/${id}/messages`),
  deleteSession: (id) => del(`/agents/sessions/${id}`),
  /**
   * Chat SSE stream. Returns the raw Response so the caller can read the stream.
   */
  chat: async ({ message, module, sessionId }) => {
    const token = await getToken();
    const res = await fetch(`${API}/agents/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, module, sessionId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res; // caller reads SSE stream
  },
};

export const financeiro = {
  dashboard: () => get('/financeiro/dashboard'),
  contas: {
    list: () => get('/financeiro/contas'),
    create: (data) => post('/financeiro/contas', data),
    update: (id, data) => put(`/financeiro/contas/${id}`, data),
    remove: (id) => del(`/financeiro/contas/${id}`),
  },
  categorias: {
    list: () => get('/financeiro/categorias'),
    create: (data) => post('/financeiro/categorias', data),
    remove: (id) => del(`/financeiro/categorias/${id}`),
  },
  transacoes: {
    list: (params) => get('/financeiro/transacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro/transacoes', data),
    update: (id, data) => put(`/financeiro/transacoes/${id}`, data),
    remove: (id) => del(`/financeiro/transacoes/${id}`),
  },
  contasPagar: {
    list: (params) => get('/financeiro/contas-pagar' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro/contas-pagar', data),
    update: (id, data) => put(`/financeiro/contas-pagar/${id}`, data),
    remove: (id) => del(`/financeiro/contas-pagar/${id}`),
  },
  solicitacoesPendentesFinanceiro: () => get('/solicitacoes/pendentes-financeiro'),
  solicitacaoAprovarFinanceiro: (id, observacao) => post(`/solicitacoes/${id}/aprovar-financeiro`, { observacao }),
  solicitacaoReprovarFinanceiro: (id, motivo) => post(`/solicitacoes/${id}/reprovar-financeiro`, { motivo }),
  solicitacaoSobrestarFinanceiro: (id, motivo, revisao) => post(`/solicitacoes/${id}/sobrestar`, { motivo, revisao }),
  urgenciaFrequente: () => get('/solicitacoes/dashboard/urgencia-frequente'),
  recorrentes: {
    list: (params) => get('/financeiro/recorrentes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro/recorrentes', data),
    update: (id, data) => patch(`/financeiro/recorrentes/${id}`, data),
    remove: (id) => del(`/financeiro/recorrentes/${id}`),
    gerarContasPagar: () => post('/financeiro/recorrentes/gerar-contas-pagar', {}),
  },
  projecaoCaixa: () => get('/financeiro/projecao-caixa'),
  generosidade: {
    overview: () => get('/financeiro/generosidade/overview'),
    anonimos: () => get('/financeiro/generosidade/anonimos'),
    pararam: () => get('/financeiro/generosidade/pararam'),
  },
  filaClassificacao: {
    stats: () => get('/financeiro/fila-classificacao/stats'),
    items: (params) => get('/financeiro/fila-classificacao/items' + (params ? '?' + new URLSearchParams(params) : '')),
    aprovarMassa: (confianca_min) => post('/financeiro/fila-classificacao/aprovar-massa', { confianca_min }),
    decidir: (id, data) => post(`/financeiro/fila-classificacao/${id}/decidir`, data),
    reclassificar: () => post('/financeiro/fila-classificacao/reclassificar', {}),
  },
  alertas: {
    list: (params) => get('/financeiro/alertas' + (params ? '?' + new URLSearchParams(params) : '')),
    atender: (id, comentario) => post(`/financeiro/alertas/${id}/atender`, { comentario }),
    gerar: () => post('/financeiro/alertas/gerar', {}),
  },
  calendario: (params) => get('/financeiro/calendario' + (params ? '?' + new URLSearchParams(params) : '')),
  centrosCustoLista: () => get('/financeiro/centros-custo'),
  closing: {
    list: () => get('/financeiro/closing'),
    fechar: (ano, mes, observacao) => post('/financeiro/closing/fechar', { ano, mes, observacao }),
    reabrir: (ano, mes, motivo) => post('/financeiro/closing/reabrir', { ano, mes, motivo }),
  },
  dreComparativo: () => get('/financeiro/dre-comparativo'),
  audit: {
    geral: (params) => get('/financeiro/audit' + (params ? '?' + new URLSearchParams(params) : '')),
    porRegistro: (tabela, rowId) => get(`/financeiro/audit/${encodeURIComponent(tabela)}/${encodeURIComponent(rowId)}`),
  },
  dreCentroAtual: () => get('/financeiro/dre-centro-custo/atual'),
  dreCentroHistorico: (id) => get(`/financeiro/dre-centro-custo/${id}/historico`),
  reembolsos: {
    list: (params) => get('/financeiro/reembolsos' + (params ? '?' + new URLSearchParams(params) : '')),
    aprovar: (id, status) => patch(`/financeiro/reembolsos/${id}`, { status }),
  },
};

// ============================================================
// FINANCEIRO V2 · estrutura fiscal (plano de contas, centros de custo, OFX, PIX)
// ============================================================
export const financeiroV2 = {
  planoContas: {
    list: (params) => get('/financeiro-v2/plano-contas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro-v2/plano-contas', data),
    update: (id, data) => put(`/financeiro-v2/plano-contas/${id}`, data),
    remove: (id) => del(`/financeiro-v2/plano-contas/${id}`),
  },
  centrosCusto: {
    list: (params) => get('/financeiro-v2/centros-custo' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro-v2/centros-custo', data),
    update: (id, data) => put(`/financeiro-v2/centros-custo/${id}`, data),
    remove: (id) => del(`/financeiro-v2/centros-custo/${id}`),
  },
  identificadores: {
    list: () => get('/financeiro-v2/identificadores'),
    create: (data) => post('/financeiro-v2/identificadores', data),
    update: (id, data) => put(`/financeiro-v2/identificadores/${id}`, data),
    remove: (id) => del(`/financeiro-v2/identificadores/${id}`),
  },
  cultoSlots: {
    list: () => get('/financeiro-v2/culto-slots'),
    create: (data) => post('/financeiro-v2/culto-slots', data),
    update: (id, data) => put(`/financeiro-v2/culto-slots/${id}`, data),
    remove: (id) => del(`/financeiro-v2/culto-slots/${id}`),
  },
  regras: {
    list: () => get('/financeiro-v2/regras-classificacao'),
    create: (data) => post('/financeiro-v2/regras-classificacao', data),
    update: (id, data) => put(`/financeiro-v2/regras-classificacao/${id}`, data),
    remove: (id) => del(`/financeiro-v2/regras-classificacao/${id}`),
  },
  importar: {
    ofx: (file, conta_id) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      fd.append('conta_id', conta_id);
      return requestFile('/financeiro-v2/importar/ofx', fd);
    },
    pixExtrato: (file, conta_id) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      if (conta_id) fd.append('conta_id', conta_id);
      return requestFile('/financeiro-v2/importar/pix-extrato', fd);
    },
    balanco: (file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile('/financeiro-v2/importar/balanco', fd, { timeoutMs: 300_000 });
    },
  },
  uploads: (params) => get('/financeiro-v2/uploads' + (params ? '?' + new URLSearchParams(params) : '')),
  lancamentosBrutos: (params) => get('/financeiro-v2/lancamentos-brutos' + (params ? '?' + new URLSearchParams(params) : '')),
  fila: {
    list: (params) => get('/financeiro-v2/fila-classificacao' + (params ? '?' + new URLSearchParams(params) : '')),
    aprovar: (filaId, data) => post(`/financeiro-v2/classificar/${filaId}/aprovar`, data),
    ignorar: (filaId) => post(`/financeiro-v2/classificar/${filaId}/ignorar`, {}),
  },
  notasCompras: {
    list: (params) => get('/financeiro-v2/notas-compras' + (params ? '?' + new URLSearchParams(params) : '')),
    lancar: (id, data) => post(`/financeiro-v2/notas-compras/${id}/lancar`, data),
    rejeitar: (id, motivo) => post(`/financeiro-v2/notas-compras/${id}/rejeitar`, { motivo }),
  },
  contasPagar: {
    list: (params) => get('/financeiro-v2/contas-pagar' + (params ? '?' + new URLSearchParams(params) : '')),
    resumo: (params) => get('/financeiro-v2/contas-pagar/resumo' + (params ? '?' + new URLSearchParams(params) : '')),
    importar: (file, origem) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      if (origem) fd.append('origem', origem);
      return requestFile('/financeiro-v2/contas-pagar/importar', fd, { timeoutMs: 300_000 });
    },
  },
  transacoes: (params) => get('/financeiro-v2/transacoes' + (params ? '?' + new URLSearchParams(params) : '')),
  arrecadacoes: (params) => get('/financeiro-v2/arrecadacoes' + (params ? '?' + new URLSearchParams(params) : '')),
  despesasDetalhe: (params) => get('/financeiro-v2/despesas/detalhe' + (params ? '?' + new URLSearchParams(params) : '')),
  sugerirPlanoHorario: (params) => get('/financeiro-v2/sugerir-plano-horario' + (params ? '?' + new URLSearchParams(params) : '')),
  historicoPagador: ({ nome, documento }) => {
    const qs = new URLSearchParams();
    if (nome) qs.set('nome', nome);
    if (documento) qs.set('documento', documento);
    return get('/financeiro-v2/historico-pagador?' + qs.toString());
  },
  dashboard: {
    overview: (opts) => {
      // Aceita string (period legado) ou objeto {period, year, month, início, fim}
      if (!opts) return get('/financeiro-v2/dashboard/overview');
      if (typeof opts === 'string') return get(`/financeiro-v2/dashboard/overview?period=${opts}`);
      const qs = new URLSearchParams();
      if (opts.period) qs.set('period', opts.period);
      if (opts.year != null) qs.set('year', opts.year);
      if (opts.month != null) qs.set('month', opts.month);
      if (opts.inicio) qs.set('inicio', opts.inicio);
      if (opts.fim) qs.set('fim', opts.fim);
      return get(`/financeiro-v2/dashboard/overview${qs.toString() ? `?${qs}` : ''}`);
    },
    semana: (semana) => get('/financeiro-v2/dashboard/semana' + (semana ? `?semana=${semana}` : '')),
    semanaCompleta: (semana) => get('/financeiro-v2/dashboard/semana-completa' + (semana ? `?semana=${semana}` : '')),
    financeiroCompleto: () => get('/financeiro-v2/dashboard/financeiro-completo'),
    saidasDetalhadas: (mes) => get('/financeiro-v2/dashboard/saidas-detalhadas' + (mes ? `?mes=${mes}` : '')),
    melhorSemana: () => get('/financeiro-v2/dashboard/melhor-semana'),
    assistente: (aba, semana) => {
      const qs = new URLSearchParams({ aba: aba || 'resumo' });
      if (semana) qs.set('semana', semana);
      return get(`/financeiro-v2/dashboard/assistente?${qs}`);
    },
  },
  metas: {
    list: (params) => get('/financeiro-v2/metas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro-v2/metas', data),
    update: (id, data) => put(`/financeiro-v2/metas/${id}`, data),
    remove: (id) => del(`/financeiro-v2/metas/${id}`),
    progresso: (params) => get('/financeiro-v2/metas-progresso' + (params ? '?' + new URLSearchParams(params) : '')),
  },
  freqArrecadacaoSemanal: (semanas = 20) => get(`/financeiro-v2/freq-arrecadacao-semanal?semanas=${semanas}`),
  arrecadacaoAnual: (ano, filtros = {}) => {
    const params = new URLSearchParams();
    if (ano) params.set('ano', ano);
    if (filtros.centro_custo_id) params.set('centro_custo_id', filtros.centro_custo_id);
    if (filtros.plano_contas_id) params.set('plano_contas_id', filtros.plano_contas_id);
    const qs = params.toString();
    return get(`/financeiro-v2/arrecadacao-anual${qs ? `?${qs}` : ''}`);
  },
  sazonalidadeSemanal: (anos) => {
    const qs = Array.isArray(anos) && anos.length ? `?anos=${anos.join(',')}` : '';
    return get(`/financeiro-v2/sazonalidade-semanal${qs}`);
  },
  categoriaTransacoes: ({ categoria, inicio, fim }) =>
    get(`/financeiro-v2/categoria-transacoes?categoria=${encodeURIComponent(categoria)}&inicio=${inicio}&fim=${fim}`),
  despesaTransacoes: (params) =>
    get('/financeiro-v2/despesa-transacoes?' + new URLSearchParams(params).toString()),
  filtrosDisponiveis: () => get('/financeiro-v2/filtros-disponiveis'),
  saudeFinanceira: (ano) => get(`/financeiro-v2/saude-financeira${ano ? `?ano=${ano}` : ''}`),
  doadores: ({ ano, limit, offset } = {}) => {
    const p = new URLSearchParams();
    if (ano) p.set('ano', ano);
    if (limit) p.set('limit', limit);
    if (offset != null) p.set('offset', offset);
    const qs = p.toString();
    return get(`/financeiro-v2/doadores${qs ? `?${qs}` : ''}`);
  },
  doadorTransacoes: ({ nome, ano, limit } = {}) => {
    const p = new URLSearchParams();
    if (nome) p.set('nome', nome);
    if (ano) p.set('ano', ano);
    if (limit) p.set('limit', limit);
    return get(`/financeiro-v2/doador/transacoes?${p.toString()}`);
  },
  dizimoOferta: (ano) => get(`/financeiro-v2/dizimo-oferta${ano ? `?ano=${ano}` : ''}`),
  syncSaldoBancos: () => post('/financeiro-v2/sync-saldo-bancos', {}),
  backfill: (data) => post('/financeiro-v2/backfill/transacoes', data || {}),
  recorrencias: {
    list: (params) => get('/financeiro-v2/recorrencias' + (params ? '?' + new URLSearchParams(params) : '')),
    update: (id, data) => put(`/financeiro-v2/recorrencias/${id}`, data),
    detectar: (data) => post('/financeiro-v2/recorrencias/detectar', data || {}),
  },
  dre: {
    mensal: (mes) => get(`/financeiro-v2/dre/mensal?mes=${mes}`),
    comparativo: (meses = 6) => get(`/financeiro-v2/dre/comparativo?meses=${meses}`),
  },
  analises: {
    heatmap: () => get('/financeiro-v2/analises/heatmap'),
    forecast: (semanas = 4) => get(`/financeiro-v2/analises/forecast?semanas=${semanas}`),
    rodar: () => post('/financeiro-v2/analises/rodar', {}),
  },
  alertas: {
    list: (params) => get('/financeiro-v2/alertas' + (params ? '?' + new URLSearchParams(params) : '')),
    dismiss: (id, data) => post(`/financeiro-v2/alertas/${id}/dismiss`, data || {}),
  },
};

export const santander = {
  pixCultoAtual: (limit = 30) => get(`/santander/pix/culto-atual?limit=${limit}`),
  pixApiDiagnostico: () => get('/santander/pix-api/diagnostico'),
  health: () => get('/santander/health'),
  saldo: () => get('/santander/saldo'),
  saldoHistorico: (dias = 30) => get(`/santander/saldo/historico?dias=${dias}`),
  contas: () => get('/santander/contas'),
  extrato: (inicio, fim, refresh = false) =>
    get(`/santander/extrato?inicio=${inicio}&fim=${fim}${refresh ? '&refresh=1' : ''}`),
  comprovantes: {
    list: (params) => get('/santander/comprovantes?' + new URLSearchParams(params)),
    local: (params) => get('/santander/comprovantes-local' + (params ? '?' + new URLSearchParams(params) : '')),
    baixar: (paymentId, metadata) => post(`/santander/comprovantes/${encodeURIComponent(paymentId)}/baixar`, { metadata }),
    pdfUrl: (paymentId) => get(`/santander/comprovantes/${encodeURIComponent(paymentId)}/pdf-url`),
    vincular: (paymentId, data) => post(`/santander/comprovantes/${encodeURIComponent(paymentId)}/vincular`, data),
    desvincular: (paymentId) => del(`/santander/comprovantes/${encodeURIComponent(paymentId)}/vincular`),
  },
  bulk: {
    list: () => get('/santander/bulk'),
    create: (data) => post('/santander/bulk', data),
    get: (orderId) => get(`/santander/bulk/${encodeURIComponent(orderId)}`),
  },
  log: () => get('/santander/log'),
  syncExtratoFila: (dias = 3) => post('/santander/sync-extrato-fila', { dias }),
  syncExtratoHistorico: () => get('/santander/sync-extrato-historico'),
  importarHistorico: (desde, ate) => post('/santander/importar-historico', { desde, ate }),
  pixCob: {
    health: () => get('/santander/pix-cob/health'),
    list: (params) => get('/santander/pix-cob' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (txid) => get(`/santander/pix-cob/${encodeURIComponent(txid)}`),
    criar: (data) => post('/santander/pix-cob', data),
    cancelar: (txid) => patch(`/santander/pix-cob/${encodeURIComponent(txid)}/cancelar`, {}),
  },
  pagamentos: {
    health: () => get('/santander/pagamentos/health'),
    parse: (linha) => post('/santander/pagamentos/parse', { linha }),
    list: (params) => get('/santander/pagamentos' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/santander/pagamentos/${id}`),
    criar: (data) => post('/santander/pagamentos', data),
    cancelar: (id) => patch(`/santander/pagamentos/${id}/cancelar`, {}),
  },
  boletos: {
    health: () => get('/santander/boletos/health'),
    list: (params) => get('/santander/boletos' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/santander/boletos/${id}`),
    emitir: (data) => post('/santander/boletos', data),
    cancelar: (id) => patch(`/santander/boletos/${id}/cancelar`, {}),
  },
};

export const logistica = {
  dashboard: (refresh = false) => get('/logistica/dashboard' + (refresh ? '?refresh=1' : '')),
  fornecedores: {
    list: (params) => get('/logistica/fornecedores' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/logistica/fornecedores', data),
    update: (id, data) => put(`/logistica/fornecedores/${id}`, data),
    remove: (id) => del(`/logistica/fornecedores/${id}`),
    enriquecer: (id) => post(`/logistica/fornecedores/${id}/enriquecer`, {}),
    enriquecerIncompletos: () => post('/logistica/fornecedores/enriquecer-incompletos', {}),
  },
  pedidos: {
    list: (params) => get('/logistica/pedidos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/logistica/pedidos', data),
    update: (id, data) => put(`/logistica/pedidos/${id}`, data),
    remove: (id) => del(`/logistica/pedidos/${id}`),
    receber: (id, data) => post(`/logistica/pedidos/${id}/recebimento`, data),
    itens: (pedidoId) => get(`/logistica/pedidos/${pedidoId}/itens`),
    addItem: (pedidoId, data) => post(`/logistica/pedidos/${pedidoId}/itens`, data),
    removeItem: (id) => del(`/logistica/itens/${id}`),
  },
  notas: {
    list: (params) => get('/logistica/notas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/logistica/notas', data),
    update: (id, data) => put(`/logistica/notas/${id}`, data),
    remove: (id) => del(`/logistica/notas/${id}`),
    escanear: (file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile('/logistica/notas/escanear', fd, { timeoutMs: 120_000 });
    },
    enviarFinanceiro: (id) => post(`/logistica/notas/${id}/enviar-financeiro`, {}),
    categorias: () => get('/logistica/notas/aux/categorias'),
  },
  // Compras (aba Compras · ledger do Pery · scan→aprovação→vínculo com a saída do balanço)
  compras: {
    list: (params) => get('/logistica/compras' + (params ? '?' + new URLSearchParams(params) : '')),
    kpis: () => get('/logistica/compras/kpis'),
    centrosCusto: () => get('/logistica/compras/aux/centros-custo'),
    planoContas: () => get('/logistica/compras/aux/plano-contas'),
    compradores: () => get('/logistica/compras/aux/compradores'),
    create: (data) => post('/logistica/compras', data),
    update: (id, data) => put(`/logistica/compras/${id}`, data),
    remove: (id) => del(`/logistica/compras/${id}`),
    escanear: (file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile('/logistica/compras/escanear', fd, { timeoutMs: 120_000 });
    },
    importar: (file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile('/logistica/compras/importar', fd, { timeoutMs: 180_000 });
    },
    aprovar: (id, correcoes) => post(`/logistica/compras/${id}/aprovar`, correcoes || {}),
    rejeitar: (id, motivo) => post(`/logistica/compras/${id}/rejeitar`, { motivo }),
    sugestoesVinculo: (id) => get(`/logistica/compras/${id}/sugestoes-vinculo`),
    vincular: (id, fin_transacao_id, score) => post(`/logistica/compras/${id}/vincular`, { fin_transacao_id, score }),
    desvincular: (id) => post(`/logistica/compras/${id}/desvincular`, {}),
  },
  // Estoque (Fase 3a) · catálogo + razão (saldo derivado) + validade/FEFO + consumo
  estoque: {
    produtos: (params) => get('/logistica/estoque/produtos' + (params ? '?' + new URLSearchParams(params) : '')),
    criarProduto: (data) => post('/logistica/estoque/produtos', data),
    atualizarProduto: (id, data) => patch(`/logistica/estoque/produtos/${id}`, data),
    removerProduto: (id) => del(`/logistica/estoque/produtos/${id}`),
    movimentacoes: (params) => get('/logistica/estoque/movimentacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    lancar: (movimentos) => post('/logistica/estoque/movimentacoes', Array.isArray(movimentos) ? { movimentos } : movimentos),
    lotes: (dias) => get('/logistica/estoque/lotes' + (dias ? `?dias=${dias}` : '')),
    consumo: (dias = 90) => get(`/logistica/estoque/consumo?dias=${dias}`),
    gerarCompra: (produto_ids) => post('/logistica/estoque/gerar-compra', { produto_ids }),
    relatorio: (dias = 90) => get(`/logistica/estoque/relatorio?dias=${dias}`),
  },
};

export const patrimonio = {
  dashboard: () => get('/patrimonio/dashboard'),
  categorias: {
    list: () => get('/patrimonio/categorias'),
    create: (data) => post('/patrimonio/categorias', data),
    remove: (id) => del(`/patrimonio/categorias/${id}`),
  },
  localizacoes: {
    list: () => get('/patrimonio/localizacoes'),
    create: (data) => post('/patrimonio/localizacoes', data),
    remove: (id) => del(`/patrimonio/localizacoes/${id}`),
  },
  bens: {
    list: (params) => get('/patrimonio/bens' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/patrimonio/bens/${id}`),
    create: (data) => post('/patrimonio/bens', data),
    update: (id, data) => put(`/patrimonio/bens/${id}`, data),
    remove: (id) => del(`/patrimonio/bens/${id}`),
    movimentar: (id, data) => post(`/patrimonio/bens/${id}/movimentacoes`, data),
    porCodigo: (codigo) => get(`/patrimonio/bens/barcode/${encodeURIComponent(codigo)}`),
  },
  inventarios: {
    list: () => get('/patrimonio/inventarios'),
    create: (data) => post('/patrimonio/inventarios', data),
    atualizar: (id, data) => patch(`/patrimonio/inventarios/${id}`, data),
  },
};

export const rh = {
  dashboard: () => get('/rh/dashboard'),
  dashboardSeries: (meses = 12) => get(`/rh/dashboard/series?meses=${meses}`),
  acessos: () => get('/rh/acessos'),
  organograma: {
    ia: (instrucao) => post('/rh/organograma/ia', { instrucao }),
    aplicar: (mudancas) => post('/rh/organograma/ia/aplicar', { mudancas }),
  },
  funcionarios: {
    list: (params) => get('/rh/funcionarios' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/rh/funcionarios/${id}`),
    create: (data) => post('/rh/funcionarios', data),
    update: (id, data) => put(`/rh/funcionarios/${id}`, data),
    remove: (id) => del(`/rh/funcionarios/${id}`),
    desligar: (id, data) => post(`/rh/funcionarios/${id}/desligar`, data),
    reativar: (id) => post(`/rh/funcionarios/${id}/reativar`),
    concluirAdmissao: (id) => post(`/rh/funcionarios/${id}/concluir-admissao`),
    setGestor: (id, gestorId) => put(`/rh/funcionarios/${id}/gestor`, { gestor_id: gestorId || null }),
    uploadFoto: (id, file) => {
      const fd = new FormData();
      fd.append('foto', file);
      return requestFile(`/rh/funcionarios/${id}/foto`, fd);
    },
  },
  documentos: {
    create: (funcId, data) => post(`/rh/funcionarios/${funcId}/documentos`, data),
    upload: (funcId, formData) => requestFile(`/rh/funcionarios/${funcId}/documentos`, formData),
    remove: (id) => del(`/rh/documentos/${id}`),
  },
  treinamentos: {
    list: () => get('/rh/treinamentos'),
    create: (data) => post('/rh/treinamentos', data),
    update: (id, data) => put(`/rh/treinamentos/${id}`, data),
    remove: (id) => del(`/rh/treinamentos/${id}`),
    inscrever: (id, data) => post(`/rh/treinamentos/${id}/inscrever`, data),
    atualizarInscricao: (id, data) => patch(`/rh/treinamentos-funcionarios/${id}`, data),
  },
  // (Materiais de treinamento removido por ora — não havia backend `/rh/materiais`.)
  ferias: {
    list: (params) => get('/rh/ferias' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (funcId, data) => post(`/rh/funcionarios/${funcId}/ferias`, data),
    update: (id, data) => patch(`/rh/ferias/${id}`, data),
    remove: (id) => del(`/rh/ferias/${id}`),
  },
  // Cobertura de férias/licença (substituto herda módulos operacionais · expira sozinho)
  coberturas: {
    list: (params) => get('/rh/coberturas' + (params ? '?' + new URLSearchParams(params) : '')),
    cancelar: (id) => post(`/rh/coberturas/${id}/cancelar`, {}),
    minhas: () => get('/coberturas/minhas'),  // qualquer usuário logado (o substituto)
  },
  extras: {
    list: (params) => get('/rh/extras' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/rh/extras', data),
    update: (id, data) => patch(`/rh/extras/${id}`, data),
    remove: (id) => del(`/rh/extras/${id}`),
  },
  config: {
    get: () => get('/rh/config'),
    set: (chave, valor) => put(`/rh/config/${chave}`, { valor }),
  },
  avaliacoes: {
    list: (params) => get('/rh/avaliacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/rh/avaliacoes', data),
    update: (id, data) => patch(`/rh/avaliacoes/${id}`, data),
    remove: (id) => del(`/rh/avaliacoes/${id}`),
    submitFatores: (id, data) => post(`/rh/avaliacoes/${id}/fatores`, data),
    concluir: (id) => post(`/rh/avaliacoes/${id}/concluir`),
    iniciarCiclo: (data) => post('/rh/avaliacoes/iniciar-ciclo', data),
  },
  // Admissão agora é um status do colaborador (em_admissao) — ver rh.funcionarios
  // (create com status 'em_admissao', update de admissao_dados, concluirAdmissao).
};

export const pcs = {
  // Graus
  graus: {
    list: () => get('/pcs/graus'),
    update: (id, data) => put(`/pcs/graus/${id}`, data),
    reajusteColetivo: (data) => post('/pcs/graus/reajuste-coletivo', data),
  },
  reajustes: {
    list: () => get('/pcs/reajustes-coletivos'),
  },
  // Critérios de avaliação
  criterios: {
    list: () => get('/pcs/criterios'),
    update: (id, data) => put(`/pcs/criterios/${id}`, data),
    updateNivel: (id, data) => put(`/pcs/niveis-criterio/${id}`, data),
  },
  // Benefícios
  beneficios: {
    list: () => get('/pcs/beneficios'),
    update: (id, data) => put(`/pcs/beneficios/${id}`, data),
    setElegibilidade: (beneficioId, grauId, status) =>
      put(`/pcs/beneficios/${beneficioId}/grau/${grauId}`, { status }),
    porFuncionario: (id) => get(`/pcs/funcionarios/${id}/beneficios`),
  },
  // Aderência
  aderencia: {
    list: () => get('/pcs/aderencia'),
    resumo: () => get('/pcs/aderencia/resumo'),
    planoAcao: () => get('/pcs/aderencia/plano-acao'),
    aplicarEnquadramento: (data) => post('/pcs/aderencia/aplicar-enquadramento', data || {}),
  },
  // Progressões
  progressoes: {
    list: (params) => get('/pcs/progressoes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/pcs/progressoes', data),
  },
  // Elegibilidade
  elegibilidade: () => get('/pcs/elegibilidade'),
  sugerirGrau: (pontos) => get(`/pcs/sugerir-grau/${pontos}`),
  // Pontuação PCS estrutural (avaliação dos 6 critérios + grau proposto)
  pontuacao: {
    list: (ciclo) => get('/pcs/pontuacao' + (ciclo ? `?ciclo=${encodeURIComponent(ciclo)}` : '')),
    resumo: (ciclo) => get('/pcs/pontuacao/resumo' + (ciclo ? `?ciclo=${encodeURIComponent(ciclo)}` : '')),
    update: (funcionarioId, data) => put(`/pcs/pontuacao/${funcionarioId}`, data),
  },
};

export const notificacoes = {
  list: (params) => get('/notificacoes' + (params ? '?' + new URLSearchParams(params) : '')),
  count: () => get('/notificacoes/count'),
  ler: (id) => patch(`/notificacoes/${id}/ler`),
  lerTodas: () => patch('/notificacoes/ler-todas'),
  gerar: () => post('/notificacoes/gerar'),
  regras: {
    list: () => get('/notificacoes/regras'),
    create: (data) => post('/notificacoes/regras', data),
    remove: (id) => del(`/notificacoes/regras/${id}`),
  },
};

// Analytics do app de membros (telemetria · visto no sistema)
export const appAnalytics = {
  resumo: (dias = 14) => get(`/app-analytics/resumo?dias=${dias}`),
  aoVivo: () => get('/app-analytics/ao-vivo'),
};

// Comunicados / Mural (criados no Marketing → app)
export const comunicados = {
  list: () => get('/comunicados'),
  create: (data) => post('/comunicados', data),
  update: (id, data) => put(`/comunicados/${id}`, data),
  publicar: (id) => post(`/comunicados/${id}/publicar`, {}),
  arquivar: (id) => post(`/comunicados/${id}/arquivar`, {}),
  remove: (id) => del(`/comunicados/${id}`),
  uploadFoto: (file) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    return requestFile('/comunicados/upload-foto', fd);
  },
};

export const painelArea = {
  // params: { período?: '30d'|'90d'|'180d'|'365d', desde?: 'YYYY-MM-DD', até?: 'YYYY-MM-DD' }
  get: (area, params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return get(`/painel-area/${encodeURIComponent(area)}${qs ? `?${qs}` : ''}`);
  },
  // Tendências históricas por valor da Jornada · meses: 3|6|12|24|60
  series: (area, meses = 12) => {
    return get(`/painel-area/${encodeURIComponent(area)}/series?meses=${meses}`);
  },
  // Registra NPS mensal · body: { nota: 0-10, mês?: 'YYYY-MM', qtd_respostas?, observação? }
  // Requer nível >= 3 no módulo da área (coord da área)
  registrarNps: (area, body) => post(`/painel-area/${encodeURIComponent(area)}/nps`, body),
  // Aba Pessoas (AMI/Bridge) · quem declarou frequentar a área, com faixa etária
  pessoas: (area) => get(`/painel-area/${encodeURIComponent(area)}/pessoas`),
  // Detalhe da pessoa (sem contribuições)
  pessoa: (area, id) => get(`/painel-area/${encodeURIComponent(area)}/pessoas/${id}`),
};

// ── Totem Kids · módulo Ministerial > Totem Kids ──
export const totemKids = {
  dashboard: () => get('/totem-kids/dashboard'),
  batismos: () => get('/totem-kids/batismos'),
  apresentacoes: () => get('/totem-kids/apresentacoes'),
  apresentacaoUpdate: (id, body) => patch(`/totem-kids/apresentacoes/${id}`, body),
  apresentacaoRemove: (id) => del(`/totem-kids/apresentacoes/${id}`),
  resumoExemplo: () => post('/totem-kids/resumo/exemplo', {}),
  resumoPcoTestar: (data) => post('/totem-kids/resumo-pco/testar', data ? { data } : {}),
  pcoPessoa: (pcoId) => get(`/totem-kids/pco-pessoa/${encodeURIComponent(pcoId)}`),
  kidsEquipe: {
    list: () => get('/totem-kids/kids-equipe'),
    buscar: (q) => get(`/totem-kids/kids-equipe/buscar?q=${encodeURIComponent(q)}`),
    alocar: (body) => post('/totem-kids/kids-equipe/membro', body),
    remover: (id) => del(`/totem-kids/kids-equipe/membro/${id}`),
    ficha: (volProfileId) => get(`/totem-kids/kids-equipe/membro/${volProfileId}/ficha`),
  },
  estoque: {
    list: () => get('/totem-kids/estoque'),
    add: (salaId, body) => post(`/totem-kids/salas/${salaId}/estoque`, body),
    update: (id, body) => patch(`/totem-kids/estoque/${id}`, body),
    remove: (id) => del(`/totem-kids/estoque/${id}`),
    registrarPatrimonio: (id) => post(`/totem-kids/estoque/${id}/patrimonio`, {}),
    localizacoesKids: () => get('/totem-kids/salas/localizacoes-kids'),
    sincronizarPatrimonio: () => post('/totem-kids/salas/sincronizar-patrimonio', {}),
    vincularLocalizacao: (salaId, localizacao_id) => patch(`/totem-kids/salas/${salaId}/localizacao`, { localizacao_id }),
  },
  sessoes: {
    atual: () => get('/totem-kids/sessoes/atual'),
    list: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
      return get(`/totem-kids/sessoes${qs ? `?${qs}` : ''}`);
    },
    create: (data) => post('/totem-kids/sessoes', data),
    abrir: (id) => post(`/totem-kids/sessoes/${id}/abrir`, {}),
    encerrar: (id) => post(`/totem-kids/sessoes/${id}/encerrar`, {}),
  },
  criancas: {
    buscar: (q) => get(`/totem-kids/criancas/buscar?q=${encodeURIComponent(q)}`),
    get: (id) => get(`/totem-kids/criancas/${id}`),
    uploadFoto: (id, dataUrl) => post(`/totem-kids/criancas/${id}/foto`, { dataUrl }),
    removeFoto: (id) => del(`/totem-kids/criancas/${id}/foto`),
    duplicados: () => get('/totem-kids/criancas/duplicados'),
    merge: (keep_id, merge_ids) => post('/totem-kids/criancas/merge', { keep_id, merge_ids }),
    list: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
      return get(`/totem-kids/criancas${qs ? `?${qs}` : ''}`);
    },
    create: (data) => post('/totem-kids/criancas', data),
    update: (id, data) => patch(`/totem-kids/criancas/${id}`, data),
    historico: (id) => get(`/totem-kids/historico/crianca/${id}`),
    addResponsavel: (id, data) => post(`/totem-kids/criancas/${id}/responsaveis`, data),
    addResponsavelRapido: (id, data) => post(`/totem-kids/criancas/${id}/responsavel-rapido`, data),
    removeResponsavel: (responsavelId) => del(`/totem-kids/responsaveis/${responsavelId}`),
    inativar: (id, body) => patch(`/totem-kids/criancas/${id}/inativar`, body),
    jornada: (id) => get(`/totem-kids/criancas/${id}/jornada`),
    analiseFrequencia: (id) => get(`/totem-kids/criancas/${id}/analise-frequencia`),
    // Atendimentos (histórico de contatos da equipe Kids com a criança)
    atendimentos: (id) => get(`/totem-kids/criancas/${id}/atendimentos`),
    addAtendimento: (id, data) => post(`/totem-kids/criancas/${id}/atendimentos`, data),
    removeAtendimento: (atendimentoId) => del(`/totem-kids/atendimentos/${atendimentoId}`),
    // Importação XLSX · dryRun=true valida sem gravar
    importar: (file, { dryRun = false } = {}) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile(`/totem-kids/criancas/importar${dryRun ? '?dry_run=1' : ''}`, fd);
    },
    // URL pra abrir e baixar modelo (browser cuida da auth via cookie/header)
    modeloImportacaoUrl: () => `${API}/totem-kids/criancas/modelo-importacao`,
    // Sync com a API do Planning Center Check-Ins (upsert idempotente)
    syncPco: (data = {}) => post('/totem-kids/sync-pco', data),
    depurarInativos: (meses = 6) => post('/totem-kids/criancas/depurar-inativos', { meses }),
  },
  checkin: {
    criar: (data) => post('/totem-kids/checkin', data),
    porCodigo: (codigo) => get(`/totem-kids/checkin/codigo/${encodeURIComponent(codigo)}`),
    atualizar: (id, data) => patch(`/totem-kids/checkin/${id}`, data),
  },
  cultosDoDia: (data) => get(`/totem-kids/cultos-do-dia?data=${encodeURIComponent(data)}`),
  // Pré-check-in pelo app do membro · o voluntário digita/escaneia o código
  preCheckin: {
    buscarCodigo: (codigo) => get(`/totem-kids/pre-checkin/codigo/${encodeURIComponent(codigo)}`),
    consumir: (id, data) => post(`/totem-kids/pre-checkin/${id}/consumir`, data),
  },
  // Solicitações de vínculo (criança↔responsável) feitas pelo app · equipe aprova
  vinculos: {
    list: (status = 'pendente') => get(`/totem-kids/vinculo-solicitacoes?status=${encodeURIComponent(status)}`),
    get: (id) => get(`/totem-kids/vinculo-solicitacoes/${id}`),
    aprovar: (id, criancaId) => post(`/totem-kids/vinculo-solicitacoes/${id}/aprovar`, criancaId ? { crianca_id: criancaId } : {}),
    rejeitar: (id, motivo) => post(`/totem-kids/vinculo-solicitacoes/${id}/rejeitar`, { motivo }),
  },
  checkout: {
    realizar: (data) => post('/totem-kids/checkout', data),
  },
  painel: {
    aoVivo: (sessaoId) => get(`/totem-kids/painel/ao-vivo${sessaoId ? `?sessao_id=${sessaoId}` : ''}`),
    sala: (salaId, sessaoId) => get(`/totem-kids/painel/sala/${salaId}${sessaoId ? `?sessao_id=${sessaoId}` : ''}`),
    dia: (data) => get(`/totem-kids/painel/dia${data ? `?data=${encodeURIComponent(data)}` : ''}`),
  },
  decisoes: {
    // Lista crianças com check-in numa sessão (pra UI de decisões selecionar)
    presentesNaSessao: (sessaoId) => get(`/totem-kids/sessoes/${sessaoId}/criancas-presentes`),
    // Histórico de decisões de uma criança · com sequencia (1a vez, 2a vez, etc)
    historicoCrianca: (criancaId) => get(`/totem-kids/decisoes/historico/${criancaId}`),
    // Ranking de crianças com mais decisões
    resumoPorCrianca: () => get('/totem-kids/decisoes/resumo-por-crianca'),
  },
  salas: {
    list: () => get('/totem-kids/salas'),
    create: (data) => post('/totem-kids/salas', data),
    update: (id, data) => patch(`/totem-kids/salas/${id}`, data),
    remove: (id) => del(`/totem-kids/salas/${id}`),
  },
  estacoes: {
    list: () => get('/totem-kids/estacoes'),
    create: (data) => post('/totem-kids/estacoes', data),
    update: (id, data) => patch(`/totem-kids/estacoes/${id}`, data),
    // Pareamento de tablet · admin gera QR a partir disso
    infoPareamento: (id) => get(`/totem-kids/estacoes/${id}/info-pareamento`),
    regenerarToken: (id) => post(`/totem-kids/estacoes/${id}/regenerar-token`, {}),
    // Tablet confirma pareamento · body: {estacao_id, token}
    parear: (data) => post('/totem-kids/estacoes/parear', data),
  },
  // Chamadas (TV das salas) · pai digita código na recepcao
  chamadas: {
    // Body: { código, estacao_token? } · token presente = modo self-service (sem login)
    chamar: (data) => post('/totem-kids/chamadas', data),
  },
  // Display da TV consome via polling 2s
  display: {
    info: (token) => get(`/totem-kids/display/info?token=${encodeURIComponent(token)}`),
    chamadasAtivas: (token) => get(`/totem-kids/display/chamadas-ativas?token=${encodeURIComponent(token)}`),
    foyerResumo: (token) => get(`/totem-kids/display/foyer-resumo?token=${encodeURIComponent(token)}`),
  },
  etiquetas: {
    log: (data) => post('/totem-kids/etiquetas-log', data),
  },
  auditoria: {
    overrides: () => get('/totem-kids/auditoria/overrides'),
  },
  // Pagers fisicos (pulseira/coaster da família) · integração com transmissor LRS
  pagers: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return get(`/totem-kids/pager/pagers${q ? `?${q}` : ''}`);
    },
    create: (data) => post('/totem-kids/pager/pagers', data),
    update: (id, data) => patch(`/totem-kids/pager/pagers/${id}`, data),
    remove: (id) => del(`/totem-kids/pager/pagers/${id}`),
    testar: (id) => post(`/totem-kids/pager/pagers/${id}/testar`, {}),
    emUso: () => get('/totem-kids/pager/em-uso'),
    envios: (limit = 50) => get(`/totem-kids/pager/envios?limit=${limit}`),
  },
};

export const permissoes = {
  bustCache: () => post('/permissoes/cache/bust', {}),
  estrutura: () => get('/permissoes/estrutura'),
  colaboradores: () => get('/permissoes/colaboradores'),
  matriz: () => get('/permissoes/matriz'),
  setCelula: (data) => put('/permissoes/matriz/celula', data),
  cargo: (id) => get(`/permissoes/cargo/${id}`),
  usuario: (id) => get(`/permissoes/usuario/${id}`),
  usuarioPorEmail: (email) => get(`/permissoes/usuario-por-email/${encodeURIComponent(email)}`),
  criarUsuario: (data) => post('/permissoes/usuario', data),
  setCargo: (id, cargo_id) => put(`/permissoes/usuario/${id}/cargo`, { cargo_id }),
  setRole: (id, role) => put(`/permissoes/usuario/${id}/role`, { role }),
  setAreas: (id, area_ids) => put(`/permissoes/usuario/${id}/areas`, { area_ids }),
  setModulo: (id, data) => put(`/permissoes/usuario/${id}/modulo`, data),
  removerOverride: (id, moduloId) => del(`/permissoes/usuario/${id}/modulo/${moduloId}`),
};

export const marketing = {
  // Catalogos
  etiquetas:    () => get('/marketing/etiquetas'),
  membros:      () => get('/marketing/membros'),
  recorrentes:  () => get('/marketing/compromissos-recorrentes'),

  // CRUD cards
  cards:        (params) => get('/marketing/cards' + (params ? '?' + new URLSearchParams(params) : '')),
  card:         (id) => get(`/marketing/cards/${id}`),
  criarCard:    (data) => post('/marketing/cards', data),
  atualizarCard:(id, data) => patch(`/marketing/cards/${id}`, data),
  removerCard:  (id) => del(`/marketing/cards/${id}`),

  // Ações especificas
  sugerirRevisao:  (id, motivo) => patch(`/marketing/cards/${id}/sugerir-revisao`, { motivo }),
  aprovarEntrega:  (id) => patch(`/marketing/cards/${id}/aprovar-entrega`, {}),

  // Entregaveis (Spec 006 · SharePoint)
  entregaveis: {
    list:     (cardId) => get(`/marketing/cards/${cardId}/entregaveis`),
    upload:   (cardId, file, tipo) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      if (tipo) fd.append('tipo', tipo);
      return requestFile(`/marketing/cards/${cardId}/entregaveis`, fd, { timeoutMs: 120_000 });
    },
    download: (entregavelId) => `${API}/marketing/entregaveis/${entregavelId}/download`,
    remove:   (entregavelId) => del(`/marketing/entregaveis/${entregavelId}`),
  },

  // Checklist do card (sub-itens · 2026-05-29)
  checklist: {
    list:   (cardId) => get(`/marketing/cards/${cardId}/checklist`),
    create: (cardId, data) => post(`/marketing/cards/${cardId}/checklist`, data),
    update: (itemId, data) => patch(`/marketing/checklist/${itemId}`, data),
    remove: (itemId) => del(`/marketing/checklist/${itemId}`),
  },

  // Analytics (Spec 013)
  analytics: {
    kpis:              (semanas = 12) => get(`/marketing/analytics/kpis?semanas=${semanas}`),
    aprovacoesOrigem:  (dias = 90) => get(`/marketing/analytics/aprovacoes-origem?dias=${dias}`),
  },

  // Fila · só a posição do card (mostrada ao solicitante · o resto virou ordenação no Kanban)
  fila: {
    posicao:   (cardId) => get(`/marketing/fila/posicao/${cardId}`),
  },

  // Ciclo criativo (Spec 024) · planejamento agrupado por evento+fase
  ciclo: {
    list:  () => get('/marketing/ciclo-criativo'),
    batch: (cardIds, payload) => patch('/marketing/ciclo-criativo/batch', { card_ids: cardIds, ...payload }),
  },

  // Campanhas + Triagem (Redesenho Fase 2 · 2026-05-30)
  campanhas: {
    list:      (status) => get('/marketing/campanhas' + (status ? '?status=' + encodeURIComponent(status) : '')),
    get:       (id) => get(`/marketing/campanhas/${id}`),
    update:    (id, data) => patch(`/marketing/campanhas/${id}`, data),
    remove:    (id) => del(`/marketing/campanhas/${id}`),
    criarCard: (id, data) => post(`/marketing/campanhas/${id}/cards`, data),
    aprovar:   (id) => post(`/marketing/campanhas/${id}/aprovar`, {}),
    revisar:   (id, motivo) => post(`/marketing/campanhas/${id}/revisar`, { motivo }),
  },

  // Capacidade por dia (Fase 4 · fundacao) · ocupacao de slots do membro no período
  capacidadeDia: (membroId, inicio, fim) =>
    get(`/marketing/capacidade-dia?membro_id=${encodeURIComponent(membroId)}&inicio=${inicio}&fim=${fim}`),

  // Planner (Fase 4b) · membros (raias) + entregaveis (barras) no período
  planner: (inicio, fim) => get(`/marketing/planner?inicio=${inicio}&fim=${fim}`),

  // Admin (Spec 009 · nível 5)
  admin: {
    membros: {
      list:   () => get('/marketing/admin/membros'),
      create: (data) => post('/marketing/admin/membros', data),
      update: (id, data) => patch(`/marketing/admin/membros/${id}`, data),
      remove: (id) => del(`/marketing/admin/membros/${id}`),
    },
    etiquetasTipo: {
      list:   () => get('/marketing/admin/etiquetas/tipo'),
      create: (data) => post('/marketing/admin/etiquetas/tipo', data),
      update: (id, data) => patch(`/marketing/admin/etiquetas/tipo/${id}`, data),
    },
    etiquetasDestino: {
      list:   () => get('/marketing/admin/etiquetas/destino'),
      create: (data) => post('/marketing/admin/etiquetas/destino', data),
      update: (id, data) => patch(`/marketing/admin/etiquetas/destino/${id}`, data),
    },
    recorrentes: {
      list:   () => get('/marketing/admin/recorrentes'),
      create: (data) => post('/marketing/admin/recorrentes', data),
      update: (id, data) => patch(`/marketing/admin/recorrentes/${id}`, data),
      remove: (id) => del(`/marketing/admin/recorrentes/${id}`),
    },
    overrides: {
      list:   (params) => get('/marketing/admin/overrides' + (params ? '?' + new URLSearchParams(params) : '')),
      create: (data) => post('/marketing/admin/overrides', data),
      update: (id, data) => patch(`/marketing/admin/overrides/${id}`, data),
      remove: (id) => del(`/marketing/admin/overrides/${id}`),
    },
    // Padrões por fase do ciclo criativo (2026-05-29)
    cicloPadroes: {
      list:       () => get('/marketing/admin/ciclo-padroes'),
      categorias: () => get('/marketing/admin/ciclo-padroes/categorias'),
      fases:      (categoryId) => get('/marketing/admin/ciclo-padroes/fases?category_id=' + encodeURIComponent(categoryId)),
      create:     (data) => post('/marketing/admin/ciclo-padroes', data),
      update:     (id, data) => patch(`/marketing/admin/ciclo-padroes/${id}`, data),
      remove:     (id) => del(`/marketing/admin/ciclo-padroes/${id}`),
      aplicar:    (categoryId) => post('/marketing/admin/ciclo-padroes/aplicar', categoryId ? { category_id: categoryId } : {}),
    },
  },
};

export const solicitacoes = {
  list:           (params) => get('/solicitacoes' + (params ? '?' + new URLSearchParams(params) : '')),
  create:         (data) => post('/solicitacoes', data),
  update:         (id, data) => patch(`/solicitacoes/${id}`, data),
  meuPapel:       () => get('/solicitacoes/meu-papel'),
  slaDefs:        () => get('/solicitacoes/sla-defs'),
  reservasEspaco: (params) => get('/solicitacoes/reservas-espaco' + (params ? '?' + new URLSearchParams(params) : '')),
  alcadas:        () => get('/solicitacoes/alcadas'),
  aprovarOrigem:  (id) => patch(`/solicitacoes/${id}/aprovar-origem`, {}),
  rejeitarOrigem: (id, motivo) => patch(`/solicitacoes/${id}/rejeitar-origem`, { motivo }),
  // Levas 2/3 · julgamento de mérito (Pastor Presidente) + sobrestar/retomar (em espera)
  aprovarMerito:  (id) => post(`/solicitacoes/${id}/aprovar-merito`, {}),
  reprovarMerito: (id, motivo) => post(`/solicitacoes/${id}/reprovar-merito`, { motivo }),
  sobrestar:      (id, { motivo, revisao } = {}) => post(`/solicitacoes/${id}/sobrestar`, { motivo, revisao }),
  retomar:        (id) => post(`/solicitacoes/${id}/retomar`, {}),
  // Cotação (compras/serviço) · logística registra valor+fornecedor antes do financeiro
  registrarCotacao: (id, payload) => post(`/solicitacoes/${id}/registrar-cotacao`, payload),
  areaResponsaveis: {
    list:    () => get('/solicitacoes/area-responsaveis'),
    save:    (area, profile_ids) => put('/solicitacoes/area-responsaveis', { area, profile_ids }),
  },
  // Vinculo com pedido Mercado Livre (compras)
  vincularML:   (id, mlInput) => post(`/solicitacoes/${id}/vincular-ml`, { ml_input: mlInput }),
  desvincularML: (id) => del(`/solicitacoes/${id}/vincular-ml`),
  atualizarML:  (id) => post(`/solicitacoes/${id}/atualizar-ml`, {}),
  mlTimeline:   (id) => get(`/solicitacoes/${id}/ml-timeline`),
  // Fase 1 · linha do tempo + Relatar Problema (alteração/devolução) + reenvio
  timeline:        (id) => get(`/solicitacoes/${id}/timeline`),
  relatarProblema: (id, motivo, comentario) => post(`/solicitacoes/${id}/relatar-problema`, { motivo, comentario }),
  reenviar:        (id, campos) => post(`/solicitacoes/${id}/reenviar`, campos || {}),
  diagnosticoRefeitas: (dias = 90) => get(`/solicitacoes/dashboard/refeitas?dias=${dias}`),
  // Ponte estoque (Fase 3a-2) · atender pela estoque dá baixa + resolve
  estoqueProdutos: (busca) => get('/solicitacoes/estoque/produtos' + (busca ? '?busca=' + encodeURIComponent(busca) : '')),
  atenderEstoque: (id, itens, observacao) => post(`/solicitacoes/${id}/atender-estoque`, { itens, observacao }),
};

export const producao = {
  serviceTypes: () => get('/producao/service-types'),
  salvarMetaTipo: (id, meta_duracao_min) => patch(`/producao/service-types/${id}/meta`, { meta_duracao_min }),
  semana:       (inicio, fim) => get(`/producao/semana?inicio=${inicio}&fim=${fim}`),
  culto:        (id) => get(`/producao/culto/${id}`),
  salvarCulto:  (id, data) => put(`/producao/culto/${id}`, data),
  salvarEtapas: (cultoId, etapas) => put(`/producao/culto/${cultoId}/etapas`, { etapas }),
  addOcorrencia:(id, data) => post(`/producao/culto/${id}/ocorrencias`, data),
  removerOcorrencia: (id) => del(`/producao/ocorrencias/${id}`),
  vincularSolicitacao: (ocorrenciaId, solicitacaoId) => patch(`/producao/ocorrencias/${ocorrenciaId}/solicitacao`, { solicitacao_id: solicitacaoId }),
  salvarChecklist: (cultoId, marks) => put(`/producao/culto/${cultoId}/checklist`, { marks }),
  acumulado:    (params = {}) => get('/producao/acumulado' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
  pendencias:   () => get('/producao/pendencias'),
  desempenho:   () => get('/producao/desempenho'),
  // Template do checklist (aba admin)
  checklistItens: {
    list:   () => get('/producao/checklist-itens'),
    create: (data) => post('/producao/checklist-itens', data),
    update: (id, data) => patch(`/producao/checklist-itens/${id}`, data),
    remove: (id) => del(`/producao/checklist-itens/${id}`),
  },
  // Roteiro padrão (cronograma) por tipo de culto · aba admin
  roteiroEtapas: {
    list:   () => get('/producao/roteiro-etapas'),
    create: (data) => post('/producao/roteiro-etapas', data),
    update: (id, data) => patch(`/producao/roteiro-etapas/${id}`, data),
    remove: (id) => del(`/producao/roteiro-etapas/${id}`),
  },
};

// "Check de pessoas" do funil Next/Batismo/convertido (resolução de identidade)
export const nextBatismo = {
  resumo: () => get('/next-batismo/resumo'),
  duplicados: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/next-batismo/duplicados' + (qs ? '?' + qs : ''));
  },
  semVinculo: () => get('/next-batismo/sem-vinculo'),
  candidatos: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/next-batismo/candidatos' + (qs ? '?' + qs : ''));
  },
  ligar: (data) => post('/next-batismo/ligar', data),
  ignorarDuplicata: (data) => post('/next-batismo/ignorar-duplicata', data),
  fundir: (data) => post('/next-batismo/fundir', data),
  pessoa: (id) => get('/next-batismo/pessoa/' + encodeURIComponent(id)),
};

export const membresia = {
  kpis: () => get('/membresia/kpis'),
  qrLookup: (token) => get(`/membresia/qr-lookup/${encodeURIComponent(token)}`),
  cpfLookup: (cpf) => get(`/membresia/cpf-lookup/${encodeURIComponent(String(cpf).replace(/\D/g, ''))}`),
  orfaosStats: () => get('/membresia/orfaos-stats'),
  promoverOrfaos: () => post('/membresia/promover-orfaos', {}),
  // Detecção e merge de duplicados
  duplicados: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/membresia/duplicados' + (qs ? '?' + qs : ''));
    },
    ignorar: (data) => post('/membresia/duplicados/ignorar', data),
    merge: (data) => post('/membresia/membros/merge', data),
    doMembro: (id) => get(`/membresia/membros/${id}/possiveis-duplicados`),
    log: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/membresia/merge-log' + (qs ? '?' + qs : ''));
    },
  },
  membros: {
    list: (params) => get('/membresia/membros' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/membresia/membros/${id}`),
    create: (data) => post('/membresia/membros', data),
    update: (id, data) => put(`/membresia/membros/${id}`, data),
    remove: (id) => del(`/membresia/membros/${id}`),
    uploadFoto: (id, formData) => requestFile(`/membresia/membros/${id}/foto`, formData),
    wifi: (id) => get(`/membresia/membros/${id}/wifi`),
    reconhecimentoFacial: (id) => get(`/membresia/membros/${id}/reconhecimento-facial`),
  },
  trilha: {
    create: (data) => post('/membresia/trilha', data),
    update: (id, data) => patch(`/membresia/trilha/${id}`, data),
  },
  familias: {
    list: (params) => get('/membresia/familias' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/membresia/familias', data),
    update: (id, data) => put(`/membresia/familias/${id}`, data),
    remove: (id) => del(`/membresia/familias/${id}`),
    vincular: (membroId, data) => patch(`/membresia/membros/${membroId}/familia`, data),
    mesmaFamilia: (membroId, data) => post(`/membresia/membros/${membroId}/mesma-familia`, data),
  },
  vinculos: {
    list: (membroId) => get(`/membresia/membros/${membroId}/vinculos`),
    create: (membroId, data) => post(`/membresia/membros/${membroId}/vinculos`, data),
    remove: (id) => del(`/membresia/vinculos/${id}`),
  },
  historico: {
    create: (data) => post('/membresia/historico', data),
  },
  grupos: {
    list: (params) => get('/membresia/grupos' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/membresia/grupos/${id}`),
    create: (data) => post('/membresia/grupos', data),
    update: (id, data) => put(`/membresia/grupos/${id}`, data),
    remove: (id) => del(`/membresia/grupos/${id}`),
    adicionarMembro: (grupoId, data) => post(`/membresia/grupos/${grupoId}/membros`, data),
    sairMembro: (participacaoId, data) => patch(`/membresia/grupo-membros/${participacaoId}/sair`, data),
  },
  totem: {
    entrarGrupo: (grupoId, membroId) => post(`/membresia/totem/grupos/${grupoId}/entrar`, { membro_id: membroId }),
    geocodeCep: (cep) => get(`/membresia/geocode-cep?cep=${encodeURIComponent(cep)}`),
    updateMembro: (id, data) => put(`/membresia/totem/membros/${id}`, data),
    uploadFoto: (id, formData) => requestFile(`/membresia/totem/membros/${id}/foto`, formData),
    next: {
      status: (params = {}) => get('/membresia/totem/next/status?' + new URLSearchParams(params).toString()),
      inscrever: (data) => post('/membresia/totem/next/inscrever', data),
    },
    apresentacaoBebe: {
      status: (params = {}) => get('/membresia/totem/apresentacao-bebe/status?' + new URLSearchParams(params).toString()),
      create: (data) => post('/membresia/totem/apresentacao-bebe', data),
    },
  },
  contribuicoes: {
    list: (params) => get('/membresia/contribuicoes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/membresia/contribuicoes', data),
    update: (id, data) => put(`/membresia/contribuicoes/${id}`, data),
    remove: (id) => del(`/membresia/contribuicoes/${id}`),
    kpis: () => get('/membresia/contribuicoes/kpis'),
  },
  ministerios: {
    list: (params) => get('/membresia/ministerios' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/membresia/ministerios/${id}`),
    create: (data) => post('/membresia/ministerios', data),
    update: (id, data) => put(`/membresia/ministerios/${id}`, data),
    remove: (id) => del(`/membresia/ministerios/${id}`),
  },
  voluntarios: {
    create: (data) => post('/membresia/voluntarios', data),
    update: (id, data) => put(`/membresia/voluntarios/${id}`, data),
    sair: (id, motivo) => patch(`/membresia/voluntarios/${id}/sair`, { motivo }),
  },
  escalas: {
    list: (params) => get('/membresia/escalas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/membresia/escalas', data),
    update: (id, data) => put(`/membresia/escalas/${id}`, data),
    remove: (id) => del(`/membresia/escalas/${id}`),
  },
  checkins: {
    list: (params) => get('/membresia/checkins' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/membresia/checkins', data),
    remove: (id) => del(`/membresia/checkins/${id}`),
  },
  cadastros: {
    list: (params) => get('/membresia/cadastros' + (params ? '?' + new URLSearchParams(params) : '')),
    kpis: () => get('/membresia/cadastros/kpis'),
    aprovar: (id, data) => post(`/membresia/cadastros/${id}/aprovar`, data || {}),
    rejeitar: (id, motivo) => post(`/membresia/cadastros/${id}/rejeitar`, { motivo }),
    update: (id, data) => patch(`/membresia/cadastros/${id}`, data),
    remove: (id) => del(`/membresia/cadastros/${id}`),
  },
};

// ── Endpoint público (sem auth) do formulário de cadastro de membresia ──
// Usa fetch direto porque não requer token e deve funcionar em rotas públicas.
// API pública de grupos — sem auth, read-only. Usada pelo formulário
// de cadastro público (CadastroMembresia.jsx) e pela inscrição com QR.
export const gruposPublic = {
  temporadas: async () => {
    const r = await fetch(`${API}/public/grupos/temporadas`);
    if (!r.ok) return [];
    return r.json();
  },
  buscar: async (params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const r = await fetch(`${API}/public/grupos/buscar${qs}`);
    if (!r.ok) return [];
    return r.json();
  },
  getById: async (id) => {
    const r = await fetch(`${API}/public/grupos/${id}`);
    if (!r.ok) return null;
    return r.json();
  },
  buscarLideres: async (params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const r = await fetch(`${API}/public/grupos/lideres/buscar${qs}`);
    if (!r.ok) return [];
    return r.json();
  },
  gruposDoLider: async (liderId, params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const r = await fetch(`${API}/public/grupos/lideres/${liderId}/grupos${qs}`);
    if (!r.ok) return [];
    return r.json();
  },
  inscrever: async (data) => {
    const r = await fetch(`${API}/public/grupos/inscrever`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  },
};

export const apresentacaoCriancasPublico = {
  proximaData: async () => {
    const res = await fetch(`${API}/public/apresentacao-criancas/proxima-data`);
    if (!res.ok) throw new Error('Erro ao buscar próxima data');
    return res.json();
  },
  inscrever: async (data) => {
    const res = await fetch(`${API}/public/apresentacao-criancas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
};

export const batismoPublico = {
  proximaData: async () => {
    const res = await fetch(`${API}/public/batismo/proxima-data`);
    if (!res.ok) throw new Error('Erro ao buscar próxima data');
    return res.json();
  },
  horarios: async () => {
    // no-store: o seletor do form sempre reflete o estado atual (aberto/fechado/
    // lotado) que a Integração acabou de mudar — sem cache do navegador.
    const res = await fetch(`${API}/public/batismo/horarios?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Erro ao buscar horários');
    return res.json();
  },
  inscrever: async (data) => {
    const res = await fetch(`${API}/public/batismo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  // Acesso às fotos pela etiqueta do quiosque: o token (codigo_acesso) É a
  // credencial — devolve nome + data + fotos do dia do batismo. Sem login.
  acesso: async (token) => {
    const res = await fetch(`${API}/public/batismo/acesso?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Link inválido ou expirado.');
    }
    return res.json();
  },
};

// Módulo Relatórios · catálogo, dados (preview/PDF) e download do Excel (.xlsx).
export const relatorios = {
  tipos: () => get('/relatorios/tipos'),
  dados: ({ tipo, inicio, fim }) =>
    get(`/relatorios/dados?tipo=${encodeURIComponent(tipo)}&inicio=${inicio}&fim=${fim}`),
  baixarXlsx: async ({ tipo, inicio, fim, colunas }) => {
    const qs = new URLSearchParams({ tipo, inicio, fim });
    if (colunas?.length) qs.set('colunas', colunas.join(','));
    const h = await headers();
    const res = await fetch(`${API}/relatorios/xlsx?${qs.toString()}`, { headers: h });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'Erro ao baixar a planilha');
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : `${tipo}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

export const cadastroPublico = {
  uploadFoto: async (file) => {
    const fd = new FormData();
    fd.append('foto', file);
    const res = await fetch(`${API}/public/membresia/upload-foto`, { method: 'POST', body: fd });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erro ao enviar foto'); }
    return res.json();
  },
  verificarFamilia: async (sobrenome) => {
    const res = await fetch(`${API}/public/membresia/verificar-familia?sobrenome=${encodeURIComponent(sobrenome)}`);
    if (!res.ok) return { familias: [] };
    return res.json();
  },
  lookupCpf: async (cpf) => {
    const res = await fetch(`${API}/public/membresia/lookup-cpf?cpf=${encodeURIComponent(cpf)}`);
    if (!res.ok) return { found: false };
    return res.json();
  },
  lookupNomeTelefone: async (nome, telefone) => {
    const qs = `nome=${encodeURIComponent(nome)}&telefone=${encodeURIComponent(telefone)}`;
    const res = await fetch(`${API}/public/membresia/lookup-nome-telefone?${qs}`);
    if (!res.ok) return { found: false };
    return res.json();
  },
  enviar: async (data) => {
    const res = await fetch(`${API}/public/membresia/cadastro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  // ── QR Code/Wallet do membro (público, sem auth) ──
  walletVerify: async (cpf, data_nascimento) => {
    const res = await fetch(`${API}/public/membresia/wallet/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, data_nascimento }),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (ct.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      throw new Error(`Erro no servidor (HTTP ${res.status}). Tente novamente.`);
    }
    if (!ct.includes('application/json')) {
      throw new Error('Resposta inesperada do servidor. Tente novamente.');
    }
    return res.json();
  },
  walletQrToken: async (cpf, data_nascimento) => {
    const res = await fetch(`${API}/public/membresia/wallet/qr-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, data_nascimento }),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (ct.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      throw new Error(`Erro no servidor (HTTP ${res.status}). Tente novamente.`);
    }
    if (!ct.includes('application/json')) {
      throw new Error('Resposta inesperada do servidor. Tente novamente.');
    }
    return res.json();
  },
  walletGoogle: async (cpf, data_nascimento) => {
    const res = await fetch(`${API}/public/membresia/wallet/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, data_nascimento }),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (ct.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      throw new Error(`Erro no servidor (HTTP ${res.status}). Tente novamente.`);
    }
    if (!ct.includes('application/json')) {
      throw new Error('Resposta inesperada do servidor. Tente novamente.');
    }
    return res.json();
  },
  walletApple: async (cpf, data_nascimento) => {
    const res = await fetch(`${API}/public/membresia/wallet/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, data_nascimento }),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (ct.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      throw new Error(`Erro no servidor (HTTP ${res.status}). Tente novamente.`);
    }
    return res.blob();
  },
};

async function requestFile(path, formData, { timeoutMs = 60_000 } = {}) {
  const token = await getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Tempo esgotado ao enviar arquivo (60s). Tente novamente.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) { if (supabase) await supabase.auth.signOut(); window.location.href = '/login'; throw new Error('Sessão expirada'); }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
  return res.json();
}

export const attachments = {
  upload: (eventId, taskId, formData) => requestFile(`/events/${eventId}/tasks/${taskId}/attachments`, formData),
  list: (eventId) => get(`/events/${eventId}/attachments`),
  listByTask: (eventId, taskId) => get(`/events/${eventId}/tasks/${taskId}/attachments`),
  remove: (id) => del(`/events/attachments/${id}`),
};

export const reports = {
  // Geração síncrona (legacy/fallback). Novo frontend usa start+section+finalize.
  generate: (eventId, data) => post(`/events/${eventId}/report`, data),
  list: (eventId) => get(`/events/${eventId}/reports`),
  get: (eventId, id) => get(`/events/${eventId}/reports/${id}`),
  // Geração progressiva — chunked como upload de SharePoint, mas pra IA.
  // Cliente orquestra: start → loop generateSection → finalize. Cada call < 60s.
  start: (eventId, data) => post(`/events/${eventId}/report/start`, data),
  generateSection: (eventId, reportId, section, force = false) =>
    post(`/events/${eventId}/report/${reportId}/section${force ? '?force=1' : ''}`, { section }),
  finalize: (eventId, reportId) => post(`/events/${eventId}/report/${reportId}/finalize`, {}),
  // Gera/regenera o corpo de e-mail pro relatório. Sem force=true devolve cache se já existe.
  emailSummary: (eventId, reportId, force = false) =>
    post(`/events/${eventId}/report/${reportId}/email-summary`, force ? { force: true } : {}),
};

export const completions = {
  getUploadUrl: (data) => post('/completions/upload-url', data),
  complete: (data) => post('/completions', data),
  attach: (data) => post('/completions/attach', data),
  getByTask: (taskId) => get(`/completions/task/${taskId}`),
  reopen: (taskId, reason) => request(`/completions/${taskId}/reopen`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  listByEvent: (eventId) => get(`/completions/event/${eventId}`),
};

export const ml = {
  status: () => get('/ml/status'),
  config: (data) => post('/ml/config', data),
  authCallback: (code) => post('/ml/auth-callback', { code }),
  disconnect: () => post('/ml/disconnect'),
  orders: (params) => get('/ml/orders' + (params ? '?' + new URLSearchParams(params) : '')),
  order: (id) => get(`/ml/orders/${id}`),
  shipments: (params) => get('/ml/shipments' + (params ? '?' + new URLSearchParams(params) : '')),
  shipment: (id) => get(`/ml/shipments/${id}`),
  syncNotas: () => post('/ml/sync-notas'),
};

export const arquivei = {
  status: () => get('/arquivei/status'),
  config: (data) => post('/arquivei/config', data),
  disconnect: () => post('/arquivei/disconnect'),
  sync: () => post('/arquivei/sync'),
};

// ── Rotas PUBLICAS do voluntariado (sem auth — scan QR sem conta) ──
export const publicVoluntariado = {
  lookupCpf: (cpf) => post('/public/voluntariado/lookup-cpf', { cpf }),
  requestLogin: (cpf, serviceId) => post('/public/voluntariado/request-login', { cpf, serviceId }),
  register: (data) => post('/public/voluntariado/register', data),
  inscreverForm: (data) => fetch(`${API}/public/voluntariado/inscrever-form`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(async r => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao enviar inscrição');
    return j;
  }),
  formOpcoes: () => fetch(`${API}/public/voluntariado/form-opcoes`).then(async r => {
    const j = await r.json().catch(() => ({}));
    return j?.opcoes || [];
  }),
};

// ── Voluntariado ──
export const voluntariado = {
  // Controle de acesso de voluntários (quem tem login + cargo + cruzamento com membresia)
  acessos: {
    list: (params) => get('/voluntariado/acessos' + (params ? '?' + new URLSearchParams(params) : '')),
    cargos: () => get('/voluntariado/acessos/cargos'),
    criarLogin: (data) => post('/voluntariado/acessos/criar-login', data),
  },
  // Controle de frequência (histórico da planilha + check-ins) · ativos/inativos
  frequencia: {
    list: (params) => get('/voluntariado/frequencia' + (params ? '?' + new URLSearchParams(params) : '')),
    detalhe: (params) => get('/voluntariado/frequencia/detalhe?' + new URLSearchParams(params)),
    perfis: (q) => get('/voluntariado/frequencia/perfis' + (q ? '?q=' + encodeURIComponent(q) : '')),
    vincular: (nome_norm, vol_profile_id) => post('/voluntariado/frequencia/vincular', { nome_norm, vol_profile_id }),
    revincular: () => post('/voluntariado/frequencia/revincular', {}),
    sugerirVinculos: () => post('/voluntariado/frequencia/sugerir-vinculos', {}),
    vincularLote: (vinculos) => post('/voluntariado/frequencia/vincular-lote', { vinculos }),
    importar: (file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile('/voluntariado/frequencia/importar', fd); },
  },
  // Mensagem automática de WhatsApp (boas-vindas ao se inscrever pra servir)
  whatsappAuto: {
    config: () => get('/voluntariado/whatsapp-auto/config'),
    saveConfig: (data) => put('/voluntariado/whatsapp-auto/config', data),
    testar: (telefone, nome) => post('/voluntariado/whatsapp-auto/testar', { telefone, nome }),
    envios: () => get('/voluntariado/whatsapp-auto/envios'),
  },
  // Disparo de e-mails pros voluntários (composer + segmentos + histórico)
  emails: {
    list: () => get('/voluntariado/emails'),
    get: (id) => get(`/voluntariado/emails/${id}`),
    create: (data) => post('/voluntariado/emails', data),
    update: (id, data) => put(`/voluntariado/emails/${id}`, data),
    remove: (id) => del(`/voluntariado/emails/${id}`),
    resolverDestinatarios: (segmento) => post('/voluntariado/emails/resolver-destinatarios', { segmento }),
    destinatarios: (id) => get(`/voluntariado/emails/${id}/destinatarios`),
    uploadImagem: (file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile('/voluntariado/emails/upload-imagem', fd); },
    gerarIa: (data) => post('/voluntariado/emails/gerar-ia', data, { timeout: 120_000 }),
    preview: (corpo_html, incluir_assinatura) => post('/voluntariado/emails/preview', { corpo_html, incluir_assinatura }),
    teste: (id) => post(`/voluntariado/emails/${id}/teste`, {}),
    enviar: (id) => post(`/voluntariado/emails/${id}/enviar`, {}, { timeout: 300_000 }),
    agendar: (id, agendado_para) => post(`/voluntariado/emails/${id}/agendar`, { agendado_para }),
    cancelar: (id) => post(`/voluntariado/emails/${id}/cancelar`, {}),
    // Assinatura global do módulo (texto + logo)
    config: () => get('/voluntariado/emails/config'),
    saveConfig: (assinatura_html) => put('/voluntariado/emails/config', { assinatura_html }),
    // Templates de e-mail (modelos reutilizáveis · fábrica + custom)
    templates: {
      list: () => get('/voluntariado/emails/templates'),
      create: (data) => post('/voluntariado/emails/templates', data),
      update: (id, data) => put(`/voluntariado/emails/templates/${id}`, data),
      remove: (id) => del(`/voluntariado/emails/templates/${id}`),
    },
  },
  // Backfill de e-mails: Planning Center (People API) + complemento membresia
  backfillEmails: () => post('/voluntariado/backfill-emails', {}, { timeout: 300_000 }),
  // Opções do formulário público ("Onde você quer servir")
  formOpcoes: {
    list: () => get('/voluntariado/form-opcoes'),
    create: (data) => post('/voluntariado/form-opcoes', data),
    update: (id, data) => put(`/voluntariado/form-opcoes/${id}`, data),
    remove: (id) => del(`/voluntariado/form-opcoes/${id}`),
  },
  // Inscrições (funil recebidas vs alocadas, do formulário Google)
  inscricoesSummary: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.ano) qs.set('ano', params.ano);
    if (params.area) qs.set('area', params.area);
    const s = qs.toString();
    return get(`/voluntariado/inscricoes-summary${s ? `?${s}` : ''}`);
  },
  inscricoesList: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.ano) qs.set('ano', params.ano);
    if (params.area) qs.set('area', params.area);
    if (params.status) qs.set('status', params.status);
    if (params.mes) qs.set('mes', params.mes);
    if (params.search) qs.set('search', params.search);
    if (params.limit != null) qs.set('limit', params.limit);
    if (params.offset != null) qs.set('offset', params.offset);
    const s = qs.toString();
    return get(`/voluntariado/inscricoes${s ? `?${s}` : ''}`);
  },
  // Triagem: muda o status da inscrição (inscrito → enviado_ministerio → integrado)
  atualizarInscricao: (id, status) => patch(`/voluntariado/inscricoes/${id}`, { status }),
  // Edita os dados da ficha (CPF, nascimento, nome da mãe, interesse, área direcionada)
  editarInscricao: (id, dados) => patch(`/voluntariado/inscricoes/${id}/dados`, dados),
  // Distribuição de voluntários por área direcionada ("onde estão as pessoas")
  distribuicaoDirecionada: (params) => get('/voluntariado/inscricoes/por-direcionada' + (params ? '?' + new URLSearchParams(params) : '')),
  // Triagem de antecedentes criminais (Kids/Bridge)
  antecedentes: (inscricaoId) => get(`/voluntariado/inscricoes/${inscricaoId}/antecedentes`),
  consultarAntecedentes: (inscricaoId) => post(`/voluntariado/inscricoes/${inscricaoId}/antecedentes/consultar`, {}),
  revisarAntecedentes: (checkId, data) => patch(`/voluntariado/antecedentes/${checkId}`, data),
  antecedentesPendentes: () => get('/voluntariado/antecedentes/pendentes'),
  // Encontros 1x1 mensais (líder <-> voluntário)
  teamMembers: (teamId, yearMonth) =>
    get(`/voluntariado/team/${teamId}/members${yearMonth ? `?year_month=${yearMonth}` : ''}`),
  oneOnOne: {
    create: (data) => post('/voluntariado/1x1', data),
    remove: (id) => del(`/voluntariado/1x1/${id}`),
  },
  // Volunteer Portal (self-service)
  me: {
    get: () => get('/voluntariado/me'),
    update: (data) => put('/voluntariado/me', data),
    schedules: () => get('/voluntariado/my-schedules'),
    respondSchedule: (id, status) => post(`/voluntariado/my-schedules/${id}/respond`, { status }),
    availability: () => get('/voluntariado/my-availability'),
    addAvailability: (data) => post('/voluntariado/my-availability', data),
    removeAvailability: (id) => del(`/voluntariado/my-availability/${id}`),
    services: (year) => get(`/voluntariado/my-services?year=${year}`),
    walletGoogle: () => get('/voluntariado/me/wallet/google'),
    walletApple: async () => {
      const token = await getToken();
      const res = await fetch(`${API}/voluntariado/me/wallet/apple`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.blob();
    },
    saveFace: (descriptor, photo_url) => post('/voluntariado/me/face', { descriptor, photo_url }),
    registerMember: (data) => post('/voluntariado/me/register-member', data),
    checkIns: () => get('/voluntariado/my-check-ins'),
  },
  selfCheckinQr: (serviceId) => get(`/voluntariado/self-checkin-qr/${serviceId}`),
  // Profiles
  profiles: {
    list: () => get('/voluntariado/profiles'),
    get: (id) => get(`/voluntariado/profiles/${id}`),
    detalhe: (id) => get(`/voluntariado/profiles/${id}/detalhe`),
    create: (data) => post('/voluntariado/profiles', data),
    update: (id, data) => put(`/voluntariado/profiles/${id}`, data),
  },
  // Roles
  roles: {
    list: () => get('/voluntariado/roles'),
    add: (profile_id, role) => post('/voluntariado/roles', { profile_id, role }),
    remove: (profileId, role) => del(`/voluntariado/roles/${profileId}/${role}`),
  },
  // Service Types (recurring templates)
  serviceTypes: {
    list: () => get('/voluntariado/service-types'),
    create: (data) => post('/voluntariado/service-types', data),
    update: (id, data) => put(`/voluntariado/service-types/${id}`, data),
    remove: (id) => del(`/voluntariado/service-types/${id}`),
    generate: (id, weeks, year) => post(`/voluntariado/service-types/${id}/generate`, { weeks, year }),
  },
  // Services
  // Dados do relatório de presença por período (server-side · cap-proof)
  relatorioDados: (desde, ate) => get(`/voluntariado/relatorio-dados?desde=${desde}&ate=${ate}`),
  services: {
    list: () => get('/voluntariado/services'),
    upcoming: () => get('/voluntariado/services/upcoming'),
    today: () => get('/voluntariado/services/today'),
    // Janela de check-in (passado recente + futuros) · permite check-in fora do dia
    checkinWindow: (back, ahead) => get(`/voluntariado/services/checkin-window?back=${back ?? 21}&ahead=${ahead ?? 35}`),
    create: (data) => post('/voluntariado/services', data),
    update: (id, data) => put(`/voluntariado/services/${id}`, data),
    remove: (id) => del(`/voluntariado/services/${id}`),
  },
  // Schedules
  schedules: {
    list: (params) => get('/voluntariado/schedules' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/schedules', data),
    update: (id, data) => put(`/voluntariado/schedules/${id}`, data),
    remove: (id) => del(`/voluntariado/schedules/${id}`),
    bulk: (service_id, assignments) => post('/voluntariado/schedules/bulk', { service_id, assignments }),
    copy: (from_service_id, to_service_id) => post('/voluntariado/schedules/copy', { from_service_id, to_service_id }),
    autoFill: (service_id, team_id) => post('/voluntariado/schedules/auto-fill', { service_id, team_id }),
  },
  // Check-ins
  checkIns: {
    list: (params) => get('/voluntariado/check-ins' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/check-ins', data),
    manha: (data) => post('/voluntariado/check-ins/manha', data),
  },
  cultosManha: () => get('/voluntariado/cultos-manha'),
  updateProfileContact: (id, data) => put(`/voluntariado/profiles/${id}/contact`, data),
  // QR code lookup
  qrLookup: (qr_code) => post('/voluntariado/qr-lookup', { qr_code }),
  // Volunteer QR codes
  volunteerQrCodes: {
    list: () => get('/voluntariado/volunteer-qrcodes'),
    create: (data) => post('/voluntariado/volunteer-qrcodes', data),
  },
  // Face
  face: {
    saveProfile: (data) => post('/voluntariado/face/save-profile', data),
    saveQrcode: (data) => post('/voluntariado/face/save-qrcode', data),
    match: (descriptor, threshold) => post('/voluntariado/face/match', { descriptor, threshold }),
  },
  // Self check-in
  selfCheckin: (data) => post('/voluntariado/self-checkin', data),
  // Sync · o sync do Planning Center é lento (todos os service types + planos +
  // pessoas + QR + avatares). O backend roda com maxDuration 300s (vercel.json);
  // por isso o cliente espera até ~300s em vez do padrão de 30s (que abortava e
  // mostrava "tempo esgotado" mesmo com o sync completando no servidor).
  sync: () => post('/voluntariado/sync', {}, { timeout: 300000 }),
  syncHistorical: (startDate, endDate) => post('/voluntariado/sync-historical', { startDate, endDate }, { timeout: 300000 }),
  syncAuto: () => post('/voluntariado/sync-auto', {}, { timeout: 300000 }),
  syncDiagnostics: () => get('/voluntariado/diagnostics'),
  pcoCpfCheck: () => get('/voluntariado/pco-cpf-check'),
  backfillCpf: () => post('/voluntariado/backfill-cpf'),
  volCpfCoverage: () => get('/voluntariado/vol-cpf-coverage'),
  backfillCpfFromMembro: () => post('/voluntariado/backfill-cpf-from-membro'),
  volCpfHiddenCheck: () => get('/voluntariado/vol-cpf-hidden-check'),
  // Sync logs
  syncLogs: () => get('/voluntariado/sync-logs'),
  // Volunteers pool (all vol_profiles with team memberships, cached 5 min on client)
  // incluirArquivados=true traz também os arquivados (saíram do PCO na reconciliação).
  volunteersPool: (incluirArquivados = false) =>
    get(`/voluntariado/volunteers-pool${incluirArquivados ? '?incluir_arquivados=1' : ''}`),
  // Supervisores de área (concedido no sistema · usado pelo app pra montar escala)
  supervisores: {
    list: () => get('/voluntariado/supervisores'),
    grant: (membro_id, area) => post('/voluntariado/supervisores', { membro_id, area }),
    revoke: (id) => del(`/voluntariado/supervisores/${id}`),
  },
  // CPF / Membresia unification
  volByMembro: (membroId) => get(`/voluntariado/vol-by-membro/${membroId}`),
  queroServir: (membroId) => post('/voluntariado/quero-servir', { membro_id: membroId }),
  waitingAllocation: () => get('/voluntariado/waiting-allocation'),
  allocate: (id, data) => post(`/voluntariado/allocate/${id}`, data),
  // Teams (legacy — unique names from schedules)
  teams: () => get('/voluntariado/teams'),
  // Teams Management (formal CRUD)
  teamsManage: {
    list: () => get('/voluntariado/teams-manage'),
    create: (data) => post('/voluntariado/teams-manage', data),
    update: (id, data) => put(`/voluntariado/teams-manage/${id}`, data),
    remove: (id) => del(`/voluntariado/teams-manage/${id}`),
    importFromSchedules: () => post('/voluntariado/teams-manage/import-from-schedules'),
    syncMembersFromSchedules: () => post('/voluntariado/teams-manage/sync-members-from-schedules'),
  },
  // Positions (within teams)
  positions: {
    list: (params) => get('/voluntariado/positions' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/positions', data),
    update: (id, data) => put(`/voluntariado/positions/${id}`, data),
    remove: (id) => del(`/voluntariado/positions/${id}`),
  },
  // Team Members
  teamMembers: {
    list: (params) => get('/voluntariado/team-members' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/team-members', data),
    update: (id, data) => put(`/voluntariado/team-members/${id}`, data),
    remove: (id) => del(`/voluntariado/team-members/${id}`),
  },
  // Availability
  availability: {
    list: (params) => get('/voluntariado/availability' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/availability', data),
    remove: (id) => del(`/voluntariado/availability/${id}`),
    byService: (from, to) => get(`/voluntariado/services-availability?from=${from}&to=${to}`),
  },
  // Training
  trainingCheckins: {
    list: (params) => get('/voluntariado/training-checkins' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/training-checkins', data),
  },
  // Planning Center proxy
  pc: {
    searchPeople: (query) => post('/voluntariado/pc/search-people', { query }),
    getPerson: (person_id) => post('/voluntariado/pc/get-person', { person_id }),
  },
};


export const kpis = {
  // Service types
  serviceTypes: () => get('/kpis/service-types'),
  // Cultos
  cultos: {
    list: (params) => get('/kpis/cultos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/kpis/cultos', data),
    update: (id, data) => put(`/kpis/cultos/${id}`, data),
    remove: (id) => del(`/kpis/cultos/${id}`),
    voluntarios: (id) => get(`/kpis/cultos/${id}/voluntarios`),
    // Pessoas que tomaram decisão em culto · 1 row por pessoa
    decisoesPessoas: {
      list:   (cultoId) => get(`/kpis/cultos/${cultoId}/decisoes-pessoas`),
      create: (cultoId, data) => post(`/kpis/cultos/${cultoId}/decisoes-pessoas`, data),
      update: (id, data) => put(`/kpis/decisoes-pessoas/${id}`, data),
      remove: (id) => del(`/kpis/decisoes-pessoas/${id}`),
      buscarMembro: (q) => get(`/kpis/decisoes-pessoas/buscar-membro?q=${encodeURIComponent(q)}`),
      // Histórico de decisões importadas (planilha) sem culto vinculado
      historicoImportado: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return get('/kpis/decisoes-pessoas/historico-importado' + (qs ? '?' + qs : ''));
      },
      // Pessoas com cadastro incompleto (sem CPF ou nascimento) · pra censo posterior
      incompletos: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return get('/kpis/decisoes-pessoas/incompletos' + (qs ? '?' + qs : ''));
      },
    },
  },
  // Batismos
  batismos: {
    list: (params) => get('/kpis/batismos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/kpis/batismos', data),
    update: (id, data) => put(`/kpis/batismos/${id}`, data),
    coberturaConvertidos: () => get('/kpis/batismos/cobertura-convertidos'),
    // Horários do batismo (abrir/fechar + limite de vagas)
    horarios: {
      list: () => get('/kpis/batismos/horarios'),
      create: (data) => post('/kpis/batismos/horarios', data),
      update: (id, data) => patch(`/kpis/batismos/horarios/${id}`, data),
      remove: (id) => del(`/kpis/batismos/horarios/${id}`),
    },
    config: () => get('/kpis/batismos/config'),
    salvarConfig: (data) => patch('/kpis/batismos/config', data),
    // Check-in do quiosque (Fase 1): lista do dia, registra check-in, sobe selfie.
    checkin: {
      doDia: (params) => get('/kpis/batismos/checkin/do-dia' + (params ? '?' + new URLSearchParams(params) : '')),
      confirmar: (id, body) => post(`/kpis/batismos/${id}/checkin`, body),
      fotoReferencia: (id, file) => {
        const fd = new FormData();
        fd.append('foto', file, 'selfie.jpg');
        return requestFile(`/kpis/batismos/${id}/foto-referencia`, fd);
      },
    },
  },
  // Dashboard & metas
  dashboard: (semanas) => get(`/kpis/dashboard?semanas=${semanas || 12}`),
  metas: () => get('/kpis/metas'),
  updateMeta: (id, data) => put(`/kpis/metas/${id}`, data),
  // YouTube sync
  youtubeSync: () => post('/kpis/youtube/sync', {}),
  youtubeStatus: () => get('/kpis/youtube/status'),
  // Auto-criação semanal (idempotente). weeks=N para backfill retroativo
  cultosAutoCreate: (weeks) => post(`/kpis/cultos/auto-create${weeks ? `?weeks=${weeks}` : ''}`, {}),
  // ── Mandala Cultura ──
  cultura: (mes) => get(`/kpis/cultura${mes ? `?mes=${mes}` : ''}`),
  culturaMensalList: () => get('/kpis/cultura/mensal'),
  culturaMensalUpsert: (data) => post('/kpis/cultura/mensal', data),
  pense: {
    list: () => get('/kpis/cultura/pense'),
    create: (data) => post('/kpis/cultura/pense', data),
    remove: (id) => del(`/kpis/cultura/pense/${id}`),
    sync: () => post('/kpis/cultura/pense/sync', {}),
  },
  // ── V2: Hierarquia estratégica (NSM -> Direcionadores -> KPIs -> Taticos) ──
  v2: {
    nsm: (ano) => get(`/kpis/v2/nsm${ano ? `?ano=${ano}` : ''}`),
    direcionadores: (ano) => get(`/kpis/v2/direcionadores${ano ? `?ano=${ano}` : ''}`),
    estrategicos: (ano) => get(`/kpis/v2/estrategicos${ano ? `?ano=${ano}` : ''}`),
    taticos: (params) => get('/kpis/v2/taticos' + (params ? '?' + new URLSearchParams(params) : '')),
    taticoDetail: (id, limit) => get(`/kpis/v2/taticos/${id}${limit ? `?limit=${limit}` : ''}`),
    taticoCreate: (data) => post('/kpis/v2/taticos', data),
    taticoUpdate: (id, data) => put(`/kpis/v2/taticos/${id}`, data),
    taticoDelete: (id, hard = false) => del(`/kpis/v2/taticos/${id}${hard ? '?hard=true' : ''}`),
    areas: () => get('/kpis/v2/areas'),
    periodoAtual: (periodicidade) => get(`/kpis/v2/periodo-atual?periodicidade=${periodicidade}`),
    registros: {
      list: (params) => get('/kpis/v2/registros' + (params ? '?' + new URLSearchParams(params) : '')),
      create: (data) => post('/kpis/v2/registros', data),
      update: (id, data) => put(`/kpis/v2/registros/${id}`, data),
      remove: (id) => del(`/kpis/v2/registros/${id}`),
    },
    // Trigger manual do coletor automático (admin)
    // opts: { dryRun, fontes: ['next.', 'integração.'], áreas: ['next'] }
    coletarAuto: (opts = {}) => {
      const params = new URLSearchParams();
      if (opts.dryRun) params.set('dry_run', 'true');
      if (opts.fontes?.length) params.set('fontes', opts.fontes.join(','));
      if (opts.areas?.length) params.set('areas', opts.areas.join(','));
      const qs = params.toString();
      return post(`/kpis/v2/coletar${qs ? `?${qs}` : ''}`, {});
    },
    // Backfill histórico (admin) · roda a coleta dos últimos N meses semana a
    // semana e recalcula. opts: { meses, fontes:['cultos.kids'], areas:['kids'] }
    coletarBackfill: (opts = {}) => post('/kpis/v2/coletar/backfill', {
      meses: opts.meses || 6,
      fontes: opts.fontes || null,
      areas: opts.areas || null,
    }),
  },
};

// Convite do NEXT · convidar convertidos sem NEXT
export const nextConvite = {
  pendentes: (contato) => get('/next-convite/pendentes' + (contato ? `?contato=${encodeURIComponent(contato)}` : '')),
  getConfig: () => get('/next-convite/config'),
  saveConfig: (body) => put('/next-convite/config', body),
  enviar: (convertido_ids, tipo = 'next') => post('/next-convite/enviar', { convertido_ids, tipo }),
  marcar: (convertido_ids, tipo = 'next') => post('/next-convite/marcar', { convertido_ids, tipo }),
};

// Agente de Primeiro Contato (piloto) · fila de revisão
export const agentePrimeiroContato = {
  fila: (status = 'pendente') => get(`/agente-primeiro-contato?status=${encodeURIComponent(status)}`),
  enviado: (id, editou = false) => post(`/agente-primeiro-contato/${id}/enviado`, { editou }),
  ignorar: (id, motivo) => post(`/agente-primeiro-contato/${id}/ignorar`, { motivo }),
};

export const agenteBatismoNext = {
  fila: (status = 'pendente') => get(`/agente-batismo-next?status=${encodeURIComponent(status)}`),
  enviado: (id, editou = false) => post(`/agente-batismo-next/${id}/enviado`, { editou }),
  ignorar: (id, motivo) => post(`/agente-batismo-next/${id}/ignorar`, { motivo }),
};

export const agenteVoluntariado = {
  analisar: () => get('/agente-voluntariado'),
  lembrar: (schedule_ids) => post('/agente-voluntariado/lembrar', schedule_ids ? { schedule_ids } : {}),
};

export const monitorAutomacoes = {
  status: () => get('/monitor-automacoes/status'),
};

export const cuidados = {
  dashboard: () => get('/cuidados/dashboard'),
  dashboardSeries: (params) => get('/cuidados/dashboard-series' + (params ? '?' + new URLSearchParams(params) : '')),
  jornadaConvertidos: (params) => get('/cuidados/jornada-convertidos' + (params ? '?' + new URLSearchParams(params) : '')),
  acompanhamentos: {
    list: (params) => get('/cuidados/acompanhamentos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/cuidados/acompanhamentos', data),
    update: (id, data) => patch(`/cuidados/acompanhamentos/${id}`, data),
    remove: (id) => del(`/cuidados/acompanhamentos/${id}`),
  },
  pedidosApp: {
    list: (params) => get('/cuidados/pedidos-app' + (params ? '?' + new URLSearchParams(params) : '')),
    updateStatus: (id, tratamento_status) => patch(`/cuidados/pedidos-app/${id}`, { tratamento_status }),
  },
  oracoes: {
    list: () => get('/cuidados/oracoes'),
    insights: () => get('/cuidados/oracoes/insights'),
    analisar: () => post('/cuidados/oracoes/analisar', {}),
  },
  // Mensagem automática de WhatsApp (quando o membro pede aconselhamento pastoral)
  whatsappAuto: {
    config: () => get('/cuidados/whatsapp-auto/config'),
    saveConfig: (data) => put('/cuidados/whatsapp-auto/config', data),
    testar: (telefone, nome) => post('/cuidados/whatsapp-auto/testar', { telefone, nome }),
    envios: () => get('/cuidados/whatsapp-auto/envios'),
  },
  jornada180: {
    list: (params) => get('/cuidados/jornada180' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/cuidados/jornada180', data),
    remove: (id) => del(`/cuidados/jornada180/${id}`),
  },
  // Turmas da Jornada 180 · estrutura própria de Cuidados (líder/participantes/encontros)
  j180: {
    turmas: {
      list: (params) => get('/cuidados/j180/turmas' + (params ? '?' + new URLSearchParams(params) : '')),
      get: (id) => get(`/cuidados/j180/turmas/${id}`),
      create: (data) => post('/cuidados/j180/turmas', data),
      update: (id, data) => patch(`/cuidados/j180/turmas/${id}`, data),
      remove: (id) => del(`/cuidados/j180/turmas/${id}`),
    },
    membros: {
      add: (turmaId, data) => post(`/cuidados/j180/turmas/${turmaId}/membros`, data),
      update: (id, data) => patch(`/cuidados/j180/membros/${id}`, data),
      remove: (id) => del(`/cuidados/j180/membros/${id}`),
    },
    encontros: {
      list: (turmaId) => get(`/cuidados/j180/turmas/${turmaId}/encontros`),
      registrar: (turmaId, data) => post(`/cuidados/j180/turmas/${turmaId}/encontros`, data),
      remove: (id) => del(`/cuidados/j180/encontros/${id}`),
    },
    relatorio: () => get('/cuidados/j180/relatorio'),
  },
  convertidos: {
    list: (params) => get('/cuidados/convertidos' + (params ? '?' + new URLSearchParams(params) : '')),
    // create removido (2026-06-25) · convertido só nasce via Integração (decisão de culto)
    update: (id, data) => patch(`/cuidados/convertidos/${id}`, data),
    remove: (id) => del(`/cuidados/convertidos/${id}`),
    tags: () => get('/cuidados/convertidos/tags'),
    atendentes: () => get('/cuidados/convertidos/atendentes'),
    visitasPendentes: () => get('/cuidados/visitas-pendentes'),
    agendarEncontro: (id, data) => post(`/cuidados/convertidos/${id}/agendar-encontro`, data),
    cancelarEncontro: (id) => post(`/cuidados/convertidos/${id}/cancelar-encontro`, {}),
    registrarContato: (id) => post(`/cuidados/convertidos/${id}/registrar-contato`, {}),
    desfecho: (id, data) => post(`/cuidados/convertidos/${id}/desfecho`, data),
    // Direciona o convertido (grupos/devocionais/voluntarios) · grupos/voluntários
    // criam o handoff na caixa da área · NÃO marca engajamento.
    direcionar: (id, direcionamento) => post(`/cuidados/convertidos/${id}/direcionar`, { direcionamento }),
  },
  // Visitas pastorais e atendimentos avulsos (fora do funil de convertidos)
  visitas: {
    list: (params) => get('/cuidados/visitas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/cuidados/visitas', data),
    update: (id, data) => patch(`/cuidados/visitas/${id}`, data),
    remove: (id) => del(`/cuidados/visitas/${id}`),
  },
  agregado: {
    list: (mes) => get(`/cuidados/agregado${mes ? `?mes=${mes}` : ''}`),
    upsert: (data) => post('/cuidados/agregado', data),
  },
  buscarMembro: (cpf) => get(`/cuidados/buscar-membro?cpf=${encodeURIComponent(cpf)}`),
  criarMembro: (data) => post('/cuidados/criar-membro', data),
};

export const batismoFotos = {
  datas: () => get('/batismo-fotos'),
  fotos: (data) => get(`/batismo-fotos/${data}/fotos`),
  upload: (data, formData) => requestFile(`/batismo-fotos/${data}/fotos`, formData),
  remove: (data, nome) => del(`/batismo-fotos/${data}/fotos/${encodeURIComponent(nome)}`),
};

export const destaques = {
  list: () => get('/destaques'),
  create: (formData) => requestFile('/destaques', formData),
  update: (id, data) => put(`/destaques/${id}`, data),
  trocarImagem: (id, formData) => requestFile(`/destaques/${id}/imagem`, formData),
  remove: (id) => del(`/destaques/${id}`),
};


// Encaminhamentos da jornada · caixa de entrada das áreas receptoras
// (Grupos / Voluntários / Jornada 180). Origem = desfecho do encontro em Cuidados.
export const encaminhamentos = {
  list: (params) => get('/encaminhamentos' + (params ? '?' + new URLSearchParams(params) : '')),
  resumo: (destino) => get('/encaminhamentos/resumo' + (destino ? `?destino=${encodeURIComponent(destino)}` : '')),
  get: (id) => get(`/encaminhamentos/${id}`),
  contato: (id, data) => post(`/encaminhamentos/${id}/contato`, data),
  updateStatus: (id, status) => patch(`/encaminhamentos/${id}`, { status }),
  // grupos ativos pro select do "Engajou" (destino=grupos)
  auxGrupos: () => get('/encaminhamentos/aux/grupos'),
};

// Minhas Tarefas · pessoais (página /tarefas)
export const tarefas = {
  list: () => get('/tarefas'),
  create: (data) => post('/tarefas', data),
  update: (id, data) => put(`/tarefas/${id}`, data),
  remove: (id, serie = false) => del(`/tarefas/${id}${serie ? '?serie=1' : ''}`),
};

export const processos = {
  list:   (p) => get('/processos' + (p ? '?' + new URLSearchParams(p) : '')),
  get:    (id) => get(`/processos/${id}`),
  create: (d) => post('/processos', d),
  update: (id, d) => put(`/processos/${id}`, d),
  remove: (id) => del(`/processos/${id}`),
  agenda: {
    list:   (p) => get('/processos/agenda/all' + (p ? '?' + new URLSearchParams(p) : '')),
    saveBulk: (items) => put('/processos/agenda/bulk', { items }),
  },
  registros: {
    list:   (p) => get('/processos/registros/list' + (p ? '?' + new URLSearchParams(p) : '')),
    create: (d) => post('/processos/registros', d),
  },
  tarefas: {
    list:   (p) => get('/processos/tarefas/list' + (p ? '?' + new URLSearchParams(p) : '')),
    create: (d) => post('/processos/tarefas', d),
    toggle: (id, done) => patch(`/processos/tarefas/${id}`, { done }),
    remove: (id) => del(`/processos/tarefas/${id}`),
  },
  coletar: (dryRun = false) => post(`/processos/coletar${dryRun ? '?dry_run=true' : ''}`, {}),
};

export const jornada = {
  dashboard: (p) => get('/jornada/dashboard' + (p ? '?' + new URLSearchParams(p) : '')),
  visao: (p) => get('/jornada/visao' + (p ? '?' + new URLSearchParams(p) : '')),
  membros: (p) => get('/jornada/membros' + (p ? '?' + new URLSearchParams(p) : '')),
  membro: (id) => get(`/jornada/membro/${id}`),
  cruzar: (criterios, opts = {}) => post('/jornada/cruzar', { criterios, ...opts }),
  refreshPapeis: () => post('/jornada/refresh-papeis', {}),
};

export const devocionais = {
  list: (p) => get('/devocionais' + (p ? '?' + new URLSearchParams(p) : '')),
  byMembro: (id) => get(`/devocionais/membro/${id}`),
  kpis: () => get('/devocionais/kpis'),
  stats: (p) => get('/devocionais/stats' + (p ? '?' + new URLSearchParams(p) : '')),
  create: (body) => post('/devocionais', body),
  update: (id, body) => put(`/devocionais/${id}`, body),
  remove: (id) => del(`/devocionais/${id}`),
};

// Bíblia - proxy para api.bible
export const bible = {
  bibles: (language) => get('/bible/bibles' + (language ? '?language=' + encodeURIComponent(language) : '')),
  books: (bibleId) => get(`/bible/bibles/${bibleId}/books`),
  chapters: (bibleId, bookId) => get(`/bible/bibles/${bibleId}/books/${bookId}/chapters`),
  chapter: (bibleId, chapterId) => get(`/bible/bibles/${bibleId}/chapters/${chapterId}`),
};

// Devocional · planos mensais (admin) + adesao
export const devocionalPlanos = {
  list: () => get('/devocional-planos'),
  get: (id) => get(`/devocional-planos/${id}`),
  create: (body) => post('/devocional-planos', body),
  update: (id, body) => put(`/devocional-planos/${id}`, body),
  remove: (id) => del(`/devocional-planos/${id}`),
  gerarIA: (id, body) => post(`/devocional-planos/${id}/gerar-ia`, body || {}),
  carregarDocx: (id, file, { sobrescrever = false } = {}) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    return requestFile(`/devocional-planos/${id}/carregar-docx${sobrescrever ? '?sobrescrever=1' : ''}`, fd, { timeoutMs: 120_000 });
  },
  // Prévia: extrai o .docx e devolve os itens p/ revisão (NÃO grava).
  previewDocx: (file) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    return requestFile('/devocional-planos/preview-docx', fd, { timeoutMs: 120_000 });
  },
  // Publica os itens já revisados nos dias do plano.
  publicarItensLote: (id, itens, sobrescrever = false) => post(`/devocional-planos/${id}/itens-lote`, { itens, sobrescrever }),
  createItem: (id, body) => post(`/devocional-planos/${id}/itens`, body),
  updateItem: (itemId, body) => put(`/devocional-planos/itens/${itemId}`, body),
  removeItem: (itemId) => del(`/devocional-planos/itens/${itemId}`),
  adesao: (id, params) => get(`/devocional-planos/${id}/adesao` + (params ? '?' + new URLSearchParams(params) : '')),
  enviarHoje: (id) => post(`/devocional-planos/${id}/enviar-hoje`, {}),
  envios: (id) => get(`/devocional-planos/${id}/envios`),
  metricasCuidados: () => get('/devocional-planos/metricas-cuidados'),
};

// Devocional · endpoints do membro (autenticado · usados por /devocional/*)
export const devocionalMembro = {
  hoje: () => get('/devocional-membro/hoje'),
  checkIn: (body) => post('/devocional-membro/check-in', body || {}),
  historico: () => get('/devocional-membro/historico'),
};

// Devocional · público (envio do magic link)
export const publicDevocional = {
  login: (email) => post('/public/devocional/login', { email }),
};

// Pessoas - lookup unificado (Membresia como fonte única)
export const pessoas = {
  lookup: ({ cpf, email, telefone } = {}) => {
    const params = new URLSearchParams();
    if (cpf) params.set('cpf', cpf);
    if (email) params.set('email', email);
    if (telefone) params.set('telefone', telefone);
    return get('/pessoas/lookup?' + params.toString());
  },
  findOrCreate: (body) => post('/pessoas/find-or-create', body),
};

// ── NSM (North Star Metric) — Painel ──
export const nsm = {
  painel: () => get('/nsm/painel'),
  segmento: (seg) => get(`/nsm/painel/${seg}`),
  recalcular: () => post('/nsm/recalcular', {}),
  eventos: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/nsm/eventos' + (qs ? '?' + qs : ''));
  },
};

// ── Dados brutos (números absolutos · alimentam KPIs com tipo_calculo automático) ──
export const dadosBrutos = {
  tipos: {
    list:   (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/dados-brutos/tipos' + (qs ? '?' + qs : ''));
    },
    create: (body) => post('/dados-brutos/tipos', body),
    update: (id, body) => put(`/dados-brutos/tipos/${id}`, body),
  },
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/dados-brutos' + (qs ? '?' + qs : ''));
  },
  create: (body) => post('/dados-brutos', body),
  update: (id, body) => put(`/dados-brutos/${id}`, body),
  remove: (id) => del(`/dados-brutos/${id}`),
  validar:    (id) => post(`/dados-brutos/${id}/validar`, {}),
  desvalidar: (id) => del(`/dados-brutos/${id}/validar`),
};

// ── Gestão (PMO administrativo) ──
export const gestao = {
  pulso: () => get('/gestao/pulso'),
  saude: () => get('/gestao/saude'),
  cobrar: (liderId, body = {}) => post(`/gestao/pulso/cobrar/${liderId}`, body),
  painelAdm: () => get('/gestao/painel-adm'),
  recalcularAdm: () => post('/gestao/painel-adm/recalcular', {}),
};

// ── Ritual mensal (revisão OKR) ──
export const ritual = {
  resumo: (periodo) => get('/ritual/resumo' + (periodo ? `?periodo=${periodo}` : '')),
  pendentes: (periodo) => get('/ritual/pendentes' + (periodo ? `?periodo=${periodo}` : '')),
  revisados: (periodo) => get('/ritual/revisados' + (periodo ? `?periodo=${periodo}` : '')),
  revisar: (kpiId, body) => post(`/ritual/${encodeURIComponent(kpiId)}/revisar`, body),
  atualizarRevisao: (id, body) => patch(`/ritual/revisao/${id}`, body),
  historico: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/ritual/historico' + (qs ? '?' + qs : ''));
  },
};

// ── Estrategia (Direcionadores · Objetivos Gerais · KRs) ──
export const estrategia = {
  direcionadores: {
    list:   () => get('/estrategia/direcionadores'),
    create: (body) => post('/estrategia/direcionadores', body),
    update: (id, body) => put(`/estrategia/direcionadores/${id}`, body),
  },
  objetivos: {
    list:   (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/estrategia/objetivos' + (qs ? '?' + qs : ''));
    },
    get:    (id) => get(`/estrategia/objetivos/${id}`),
    create: (body) => post('/estrategia/objetivos', body),
    update: (id, body) => put(`/estrategia/objetivos/${id}`, body),
    remove: (id) => del(`/estrategia/objetivos/${id}`),
  },
  krs: {
    list:   (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/estrategia/krs' + (qs ? '?' + qs : ''));
    },
    create: (body) => post('/estrategia/krs', body),
    update: (id, body) => put(`/estrategia/krs/${id}`, body),
    remove: (id) => del(`/estrategia/krs/${id}`),
  },
  metasInstitucionais: {
    list:    () => get('/estrategia/metas-institucionais'),
    upsert:  (body) => post('/estrategia/metas-institucionais', body),
    update:  (id, body) => put(`/estrategia/metas-institucionais/${id}`, body),
    aplicar: (tipo) => post('/estrategia/metas-institucionais/aplicar', { tipo }),
  },
  okrsPorTipo:  () => get('/estrategia/okrs-por-tipo'),
  setOkrTipo:   (id, tipo_okr) => put(`/estrategia/objetivos/${id}/tipo`, { tipo_okr }),
  setDadoPrincipal: (id, dado_tipo_principal) => put(`/estrategia/objetivos/${id}/dado-tipo-principal`, { dado_tipo_principal }),
};

// ── Painel CBRio (mandalas, matriz, alertas, drilldown) ──
export const painel = {
  mandalas:   () => get('/painel/mandalas'),
  matriz:     () => get('/painel/matriz'),
  matrizAdm:  () => get('/painel/matriz-adm'),
  matrizCriativo: () => get('/painel/matriz-criativo'),
  celula:     (area, valor) => get(`/painel/celula/${area}/${valor}`),
  celulaAdm:  (areaAdm, areaCliente) => get(`/painel/celula-adm/${areaAdm}/${areaCliente}`),
  celulaCriativo: (areaCriativa, areaCliente) => get(`/painel/celula-criativo/${areaCriativa}/${areaCliente}`),
  alertas:  (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/painel/alertas' + (qs ? '?' + qs : ''));
  },
  kpi: (id) => get(`/painel/kpi/${encodeURIComponent(id)}`),
  nsmPessoas: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/painel/nsm/pessoas' + (qs ? '?' + qs : ''));
  },
  // Tendência mensal do NSM (coorte por mês de conversão) · gráfico no /painel
  nsmSerie: (meses = 12, segmento = 'central') =>
    get(`/painel/nsm/serie?meses=${meses}&segmento=${segmento}`),
  // Cultos com decisões sem pessoas registradas · alimenta filtro "sem dados"
  // no drilldown NSM. Mostra accountability da captura individual.
  nsmSemDados: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/painel/nsm/sem-dados' + (qs ? '?' + qs : ''));
  },
  // Catalogo de combinacoes valor x dado disponíveis pro carrossel + cultos
  serieTemporalDados: () => get('/painel/serie-temporal/dados'),
  // Série temporal pra gráfico de linha do carrossel de valores
  // params: { valor, dado, culto?, início?, fim?, granularidade? }
  serieTemporal: (params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''));
    const qs = new URLSearchParams(clean).toString();
    return get('/painel/serie-temporal' + (qs ? '?' + qs : ''));
  },
  // Aba "Monitoramento OKR" (planilha do Pr. Juninho) · NSM + métricas vivas
  monitoramentoOkr: () => get('/painel/monitoramento-okr'),
};

export const nps = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/nps' + (qs ? '?' + qs : ''));
  },
  get: (id) => get(`/nps/${id}`),
  create: (data) => post('/nps', data),
  update: (id, data) => put(`/nps/${id}`, data),
  remove: (id) => del(`/nps/${id}`),
  gerarPerguntas: (data) => post('/nps/gerar-perguntas', data),
  respostas: (id) => get(`/nps/${id}/respostas`),
  responder: (id, data) => post(`/nps/${id}/responder`, data),
  analisar: (id) => post(`/nps/${id}/analisar`, {}),
  notificar: (id) => post(`/nps/${id}/notificar`, {}),
  // Públicas (sem auth) · com RETRY: num culto, a borda do Vercel pode dar um
  // soluço/challenge momentâneo sob pico. Em vez de perder a resposta, o celular
  // tenta de novo sozinho (backoff). Status "de borda" (403 challenge / 429 / 503)
  // e erro de rede são retentados; 400/404 (dado inválido / pesquisa off) não.
  publicGet: (token) =>
    npsFetchRetry(
      () => fetch(`${API}/public/nps/${encodeURIComponent(token)}`, { headers: { 'Content-Type': 'application/json' } }),
      { tentativas: 4, msg: 'Erro ao carregar pesquisa' },
    ),
  publicResponder: (token, payload) =>
    npsFetchRetry(
      () => fetch(`${API}/public/nps/${encodeURIComponent(token)}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      { tentativas: 3, msg: 'Erro ao enviar resposta' },
    ),
  // Envio "à prova de fechamento de aba" · dispara mesmo enquanto a página
  // descarrega (pagehide/visibilitychange). Fire-and-forget (não lê resposta) ·
  // usado como última tentativa da fila offline no NpsPublica.
  publicResponderBeacon: (token, payload) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
      const url = `${API}/public/nps/${encodeURIComponent(token)}/responder`;
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      return navigator.sendBeacon(url, blob);
    } catch { return false; }
  },
};

// Retry com backoff pras chamadas públicas do NPS (evento com pico).
// Retenta em falha de rede e nos status de proteção de borda (403 challenge do
// Vercel / 429 / 503) — que barram ANTES do servidor, então é seguro repetir.
// Não retenta 400/404 (erro real de dado/pesquisa) nem estoura duplicata.
async function npsFetchRetry(doFetch, { tentativas = 3, msg = 'Erro' } = {}) {
  const RETRIABLE = new Set([403, 429, 502, 503, 504]);
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await doFetch();
      if (r.ok) return await r.json().catch(() => ({}));
      if (!RETRIABLE.has(r.status) || i === tentativas - 1) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || msg);
      }
      ultimo = new Error(`http_${r.status}`);
    } catch (e) {
      ultimo = e;
      if (i === tentativas - 1) throw e;
    }
    // backoff: ~0.5s, 1.2s, 2.5s + jitter · espalha as re-tentativas do pico
    await new Promise((res) => setTimeout(res, (500 * Math.pow(2, i)) + Math.random() * 400));
  }
  throw ultimo || new Error(msg);
}

export const online = {
  dashboard: () => get('/online/dashboard'),
  engajamento: () => get('/online/engajamento'),
  cultosMetricas: (limit) => get('/online/cultos-metricas' + (limit ? '?limit=' + limit : '')),
  series: (order) => get('/online/series' + (order ? '?order=' + order : '')),
  serie: (id) => get('/online/series/' + id),
  sync: () => post('/online/sync', {}),
  oauth: {
    status: () => get('/online/oauth/status'),
    authorize: () => get('/online/oauth/authorize'),
    disconnect: () => post('/online/oauth/disconnect', {}),
  },
  coletar: {
    live: () => post('/online/coletar/live', {}),
    ds: () => post('/online/coletar/ds', {}),
    ddus: () => post('/online/coletar/ddus', {}),
    backfillCultos: () => post('/online/coletar/backfill-cultos', {}),
    catchUp: (limit = 5) => post(`/online/coletar/catch-up?limit=${limit}`, {}),
    engajamento: (ano) => post(`/online/coletar/engajamento${ano ? `?ano=${ano}` : ''}`, {}),
  },
  debug: {
    canaisAutorizados: () => get('/online/debug/canais-autorizados'),
    analyticsTest: (video_id, start, end) =>
      get(`/online/debug/analytics-test?video_id=${encodeURIComponent(video_id)}${start ? `&start=${start}` : ''}${end ? `&end=${end}` : ''}`),
  },
};

export const wifi = {
  resumo: () => get('/wifi/resumo'),
  pessoas: (params) => get('/wifi/pessoas' + (params ? '?' + new URLSearchParams(params) : '')),
  pessoa: (cpf) => get('/wifi/pessoas/' + encodeURIComponent(cpf)),
  cultos: (params) => get('/wifi/cultos' + (params ? '?' + new URLSearchParams(params) : '')),
  semanas: (params) => get('/wifi/semanas' + (params ? '?' + new URLSearchParams(params) : '')),
  alertas: () => get('/wifi/alertas'),
  servicos: () => get('/wifi/servicos'),
  sync: () => post('/wifi/sync', {}),
};

// ─── Planejamento · litúrgicos (usado pelo hub "Gestão Anual") ────────────
// O fluxo antigo de Planejamento Anual (setores/ciclos/propostas/aprovação
// diretor→diretoria) foi removido em 2026-06-10 — nunca usado, tabelas dropadas.
// Sobrou só a geração do calendário litúrgico do ano.
export const planejamento = {
  gerarLiturgia: (year) => post(`/planejamento/liturgia/gerar/${year}`, {}),
};

export const auth = {
  uploadFoto: (file) => {
    const fd = new FormData();
    fd.append('foto', file);
    return requestFile('/auth/profile/foto', fd);
  },
};

// ── Apresentações · gerador de slides via Claude Opus ────────────────
export const apresentacoes = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return get('/apresentacoes' + (q ? '?' + q : ''));
  },
  get: (id) => get(`/apresentacoes/${id}`),
  create: (body) => post('/apresentacoes', body),
  remove: (id) => del(`/apresentacoes/${id}`),
  gerar: (id, body = {}) => post(`/apresentacoes/${id}/gerar`, body),
  uploadArquivos: (id, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    return requestFile(`/apresentacoes/${id}/arquivos`, fd);
  },
  removerArquivo: (id, arquivoId) => del(`/apresentacoes/${id}/arquivos/${arquivoId}`),
  reset: (id) => post(`/apresentacoes/${id}/reset`, {}),
  // Busca HTML completo pra usar em <iframe srcDoc={...}>
  // (iframes não mandam Authorization automaticamente · precisamos do fetch)
  fetchHtml: async (id) => {
    const h = await headers();
    const res = await fetch(`${API}/apresentacoes/${id}/render`, { headers: h });
    if (!res.ok) throw new Error(`Erro ao carregar HTML (${res.status})`);
    return res.text();
  },
  resumoUso: () => get('/apresentacoes/uso/resumo'),
};
