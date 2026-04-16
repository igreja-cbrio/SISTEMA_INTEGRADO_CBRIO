import { supabase } from './supabaseClient';
import { resolveApiBaseUrl } from './lib/api-base';

// Configure this to point to your Vercel backend
const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

async function getToken() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

const headers = async () => {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

async function request(path, opts = {}) {
  const h = await headers();
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...h, ...opts.headers } });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('Backend não disponível. Os módulos funcionam apenas com o servidor rodando.');
  }

  if (res.status === 401) {
    console.warn('[API] 401 – token inválido ou backend sem SUPABASE_SERVICE_ROLE_KEY');
    throw new Error('Não autorizado. Verifique se o backend está configurado corretamente.');
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

const get = (path) => request(path);
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = (path) => request(path, { method: 'DELETE' });

export const users = {
  list: () => get('/auth/users'),
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
};

export const grupos = {
  list: (params) => get('/grupos' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => get(`/grupos/${id}`),
  create: (data) => post('/grupos', data),
  update: (id, data) => put(`/grupos/${id}`, data),
  remove: (id) => del(`/grupos/${id}`),
  addMembro: (grupoId, data) => post(`/grupos/${grupoId}/membros`, data),
  sairMembro: (participacaoId, data) => patch(`/grupos/participacao/${participacaoId}/sair`, data),
  registrarPresenca: (participacaoId) => patch(`/grupos/participacao/${participacaoId}/presenca`, {}),
  materiais: (params) => get('/grupos/materiais' + (params ? '?' + new URLSearchParams(params) : '')),
  uploadMaterial: (formData) => requestFile('/grupos/materiais', formData),
  removeMaterial: (docId) => del(`/grupos/materiais/${docId}`),
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
  projectsKanban: () => get('/dashboard/projects-kanban'),
  strategicKanban: () => get('/dashboard/strategic-kanban'),
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
  all: (params) => {
    const q = new URLSearchParams();
    if (params?.source) q.set('source', params.source);
    if (params?.area) q.set('area', params.area);
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
  kpiTemplates: () => get('/cycles/kpis/templates'),
  createTemplate: (data) => post('/cycles/kpis/templates', data),
  deleteTemplate: (id) => del(`/cycles/kpis/templates/${id}`),
  kpiAreaWeights: () => get('/cycles/kpis/area-weights'),
  updateAreaWeight: (id, weight) => put(`/cycles/kpis/area-weights/${id}`, { weight }),
};

export const agents = {
  generate: (data) => post('/agents/generate', data),
  queue: () => get('/agents/queue'),
  approve: (id) => patch(`/agents/queue/${id}/approve`),
  reject: (id) => patch(`/agents/queue/${id}/reject`),
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
  reembolsos: {
    list: (params) => get('/financeiro/reembolsos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro/reembolsos', data),
    aprovar: (id, status) => patch(`/financeiro/reembolsos/${id}`, { status }),
  },
};

export const logistica = {
  dashboard: (refresh = false) => get('/logistica/dashboard' + (refresh ? '?refresh=1' : '')),
  fornecedores: {
    list: (params) => get('/logistica/fornecedores' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/logistica/fornecedores', data),
    update: (id, data) => put(`/logistica/fornecedores/${id}`, data),
    remove: (id) => del(`/logistica/fornecedores/${id}`),
  },
  solicitacoes: {
    list: (params) => get('/logistica/solicitacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/logistica/solicitacoes', data),
    atualizar: (id, data) => patch(`/logistica/solicitacoes/${id}`, data),
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
    list: () => get('/logistica/notas'),
    create: (data) => post('/logistica/notas', data),
    remove: (id) => del(`/logistica/notas/${id}`),
  },
  movimentacoes: {
    list: (params) => get('/logistica/movimentacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/logistica/movimentacoes', data),
    historico: (codigo) => get(`/logistica/movimentacoes/historico/${encodeURIComponent(codigo)}`),
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
  funcionarios: {
    list: (params) => get('/rh/funcionarios' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/rh/funcionarios/${id}`),
    create: (data) => post('/rh/funcionarios', data),
    update: (id, data) => put(`/rh/funcionarios/${id}`, data),
    remove: (id) => del(`/rh/funcionarios/${id}`),
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
  materiais: {
    list: (params) => get('/rh/materiais' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/rh/materiais', data),
    remove: (id) => del(`/rh/materiais/${id}`),
    enviar: (id, data) => post(`/rh/materiais/${id}/enviar`, data),
    atualizarStatus: (id, data) => patch(`/rh/materiais-funcionarios/${id}`, data),
  },
  ferias: {
    list: (params) => get('/rh/ferias' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (funcId, data) => post(`/rh/funcionarios/${funcId}/ferias`, data),
    update: (id, data) => patch(`/rh/ferias/${id}`, data),
    remove: (id) => del(`/rh/ferias/${id}`),
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
  },
  admissoes: {
    list: (params) => get('/rh/admissoes' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/rh/admissoes/${id}`),
    create: (data) => post('/rh/admissoes', data),
    update: (id, data) => patch(`/rh/admissoes/${id}`, data),
    remove: (id) => del(`/rh/admissoes/${id}`),
    concluir: (id) => post(`/rh/admissoes/${id}/concluir`),
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

export const permissoes = {
  estrutura: () => get('/permissoes/estrutura'),
  usuario: (id) => get(`/permissoes/usuario/${id}`),
  usuarioPorEmail: (email) => get(`/permissoes/usuario-por-email/${encodeURIComponent(email)}`),
  criarUsuario: (data) => post('/permissoes/usuario', data),
  setCargo: (id, cargo_id) => put(`/permissoes/usuario/${id}/cargo`, { cargo_id }),
  setAreas: (id, area_ids) => put(`/permissoes/usuario/${id}/areas`, { area_ids }),
  setModulo: (id, data) => put(`/permissoes/usuario/${id}/modulo`, data),
};

export const solicitacoes = {
  list: (params) => get('/solicitacoes' + (params ? '?' + new URLSearchParams(params) : '')),
  create: (data) => post('/solicitacoes', data),
  update: (id, data) => patch(`/solicitacoes/${id}`, data),
};

export const membresia = {
  kpis: () => get('/membresia/kpis'),
  qrLookup: (token) => get(`/membresia/qr-lookup/${encodeURIComponent(token)}`),
  membros: {
    list: (params) => get('/membresia/membros' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/membresia/membros/${id}`),
    create: (data) => post('/membresia/membros', data),
    update: (id, data) => put(`/membresia/membros/${id}`, data),
    remove: (id) => del(`/membresia/membros/${id}`),
    uploadFoto: (id, formData) => requestFile(`/membresia/membros/${id}/foto`, formData),
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
  // ── QR Code/Wallet do membro (publico, sem auth) ──
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

async function requestFile(path, formData) {
  const token = await getToken();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
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
  generate: (eventId, data) => post(`/events/${eventId}/report`, data),
  list: (eventId) => get(`/events/${eventId}/reports`),
  get: (eventId, id) => get(`/events/${eventId}/reports/${id}`),
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
};

// ── Voluntariado ──
export const voluntariado = {
  // Volunteer Portal (self-service)
  me: {
    get: () => get('/voluntariado/me'),
    update: (data) => put('/voluntariado/me', data),
    schedules: () => get('/voluntariado/my-schedules'),
    respondSchedule: (id, status) => post(`/voluntariado/my-schedules/${id}/respond`, { status }),
    availability: () => get('/voluntariado/my-availability'),
    addAvailability: (data) => post('/voluntariado/my-availability', data),
    removeAvailability: (id) => del(`/voluntariado/my-availability/${id}`),
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
    generate: (id, weeks) => post(`/voluntariado/service-types/${id}/generate`, { weeks }),
  },
  // Services
  services: {
    list: () => get('/voluntariado/services'),
    upcoming: () => get('/voluntariado/services/upcoming'),
    today: () => get('/voluntariado/services/today'),
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
  },
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
  // Sync
  sync: () => post('/voluntariado/sync'),
  syncHistorical: (startDate, endDate) => post('/voluntariado/sync-historical', { startDate, endDate }),
  syncAuto: () => post('/voluntariado/sync-auto'),
  // Sync logs
  syncLogs: () => get('/voluntariado/sync-logs'),
  // Volunteers pool (all vol_profiles with team memberships, cached 5 min on client)
  volunteersPool: () => get('/voluntariado/volunteers-pool'),
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
