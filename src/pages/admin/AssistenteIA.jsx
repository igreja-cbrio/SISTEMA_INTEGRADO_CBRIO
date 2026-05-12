import { useState, useEffect, useCallback, useRef } from 'react';
import { agents } from '../../api';
import { Button } from '../../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import ReactMarkdown from 'react-markdown';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618', purple: '#8b5cf6', purpleBg: '#8b5cf618',
};

const STATUS_MAP = {
  running: { c: C.blue, bg: C.blueBg, label: 'Executando...' },
  completed: { c: C.green, bg: C.greenBg, label: 'Concluído' },
  failed: { c: C.red, bg: C.redBg, label: 'Falhou' },
  cancelled: { c: C.text3, bg: '#73737318', label: 'Cancelado' },
};

const SEV_MAP = {
  critico: { c: '#fff', bg: C.red, label: 'CRÍTICO' },
  aviso: { c: '#000', bg: C.amber, label: 'AVISO' },
  info: { c: '#fff', bg: C.blue, label: 'INFO' },
};

const AGENT_TYPES = [
  // Auditoria cross-módulos
  { value: 'system_auditor',     label: '🔍 Auditor Geral',       desc: 'Analisa dados reais de todos os módulos e identifica problemas, inconsistências e oportunidades.', icon: '🔍', group: 'cross' },
  { value: 'design_auditor',     label: '🎨 Agente Design',       desc: 'Analisa layout e UI, traz referências modernas (Linear, Vercel, Notion) e sugere melhorias.', icon: '🎨', group: 'cross' },

  // Administrativo
  { value: 'module_rh',          label: '👥 Agente RH',           desc: 'Audita colaboradores, admissões, férias, treinamentos. Verifica campos faltantes.', icon: '👥', group: 'admin' },
  { value: 'module_financeiro',  label: '💰 Agente Financeiro',   desc: 'Audita contas, transações, contas a pagar e reembolsos.', icon: '💰', group: 'admin' },
  { value: 'module_logistica',   label: '🚚 Agente Logística',    desc: 'Audita fornecedores, pedidos, solicitações e notas fiscais.', icon: '🚚', group: 'admin' },
  { value: 'module_patrimonio',  label: '🏢 Agente Patrimônio',   desc: 'Audita bens, inventários e movimentações.', icon: '🏢', group: 'admin' },

  // Acompanhamento
  { value: 'module_eventos',     label: '📅 Agente Eventos',      desc: 'Audita eventos, tarefas, orçamentos e reuniões.', icon: '📅', group: 'acomp' },
  { value: 'module_projetos',    label: '📊 Agente Projetos',     desc: 'Audita projetos, fases, tarefas e riscos.', icon: '📊', group: 'acomp' },

  // Ministerial
  { value: 'module_membresia',   label: '⛪ Agente Membresia',     desc: 'Audita membros, integração e engajamento.', icon: '⛪', group: 'min' },
  { value: 'module_integracao',  label: '🤲 Agente Integração',   desc: 'Audita visitantes, decisões e funil de acompanhamento.', icon: '🤲', group: 'min' },
  { value: 'module_next',        label: '➡️ Agente NEXT',         desc: 'Audita inscrições do NEXT, check-ins e indicações pendentes.', icon: '➡️', group: 'min' },
  { value: 'module_grupos',      label: '👥 Agente Grupos',       desc: 'Audita grupos de conexão, líderes e cobertura por bairro.', icon: '👥', group: 'min' },
  { value: 'module_cuidados',    label: '💜 Agente Cuidados',     desc: 'Audita capelania, aconselhamento e Jornada 180.', icon: '💜', group: 'min' },
  { value: 'module_voluntariado',label: '🤝 Agente Voluntariado', desc: 'Audita voluntários ativos, escalas e sincronização Planning Center.', icon: '🤝', group: 'min' },

  // Inteligência / Governança
  { value: 'module_nps',         label: '📢 Agente NPS',          desc: 'Audita pesquisas de satisfação, taxa de resposta e tendências de NPS.', icon: '📢', group: 'intel' },
  { value: 'module_cerebro',     label: '🧠 Agente Cérebro',      desc: 'Audita fila do Cérebro CBRio, erros de processamento e custo de tokens.', icon: '🧠', group: 'intel' },
  { value: 'module_kpis',        label: '📈 Agente KPIs/OKR',     desc: 'Audita indicadores táticos, trajetória das metas e cobertura por área.', icon: '📈', group: 'intel' },
  { value: 'module_processos',   label: '⚙️ Agente Processos',    desc: 'Audita processos operacionais, OKRs e responsáveis.', icon: '⚙️', group: 'intel' },
  { value: 'module_governanca',  label: '🏛️ Agente Governança',   desc: 'Audita ciclo mensal (OKR/DRE/KPI/Conselho), pautas e deliberações.', icon: '🏛️', group: 'intel' },
];

const MODULE_OPTIONS = [
  { value: 'supervisor', label: '🧠 Supervisor', icon: '🧠' },
  { value: 'rh', label: '👥 RH', icon: '👥' },
  { value: 'financeiro', label: '💰 Financeiro', icon: '💰' },
  { value: 'logistica', label: '🚚 Logística', icon: '🚚' },
  { value: 'patrimonio', label: '🏢 Patrimônio', icon: '🏢' },
  { value: 'solicitarCompra', label: '🛒 Compras', icon: '🛒' },
  { value: 'eventos', label: '📅 Eventos', icon: '📅' },
  { value: 'projetos', label: '📊 Projetos', icon: '📊' },
  { value: 'expansao', label: '🏗️ Expansão', icon: '🏗️' },
  { value: 'integracao', label: '🔗 Integração', icon: '🔗' },
  { value: 'grupos', label: '👥 Grupos', icon: '👥' },
  { value: 'cuidados', label: '💜 Cuidados', icon: '💜' },
  { value: 'voluntariado', label: '🤝 Voluntariado', icon: '🤝' },
  { value: 'membresia', label: '⛪ Membresia', icon: '⛪' },
  { value: 'marketing', label: '📣 Marketing', icon: '📣' },
];

const s = {
  page: { maxWidth: 1600, margin: '0 auto', padding: '0 24px' },
  card: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' },
  cardHeader: { padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: 700, color: C.text },
  btn: (v = 'primary') => ({ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', ...(v === 'primary' ? { background: C.primary, color: '#fff' } : {}), ...(v === 'ghost' ? { background: 'transparent', color: C.text2 } : {}), ...(v === 'secondary' ? { background: 'transparent', color: C.primary, border: `1px solid ${C.primary}` } : {}) }),
  badge: (c, bg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: c, background: bg }),
  empty: { textAlign: 'center', padding: 40, color: C.text3, fontSize: 14 },
};

const fmtDate = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtCost = (v) => `$${(Number(v) || 0).toFixed(4)}`;
const fmtTokens = (v) => (v || 0).toLocaleString('pt-BR');

const AGENT_BY_VALUE = AGENT_TYPES.reduce((acc, a) => { acc[a.value] = a; return acc; }, {});
const labelOf = (agentType) => AGENT_BY_VALUE[agentType]?.label || agentType;

const GROUP_LABELS = {
  cross: 'Cross-módulos',
  admin: 'Administrativo',
  acomp: 'Acompanhamento',
  min: 'Ministerial',
  intel: 'Inteligência & Governança',
};
const GROUP_ORDER = ['cross', 'admin', 'acomp', 'min', 'intel'];

function scoreColor(score) {
  if (score == null) return C.text3;
  if (score >= 8) return C.green;
  if (score >= 5) return C.amber;
  return C.red;
}

// ─── Typing Indicator ──────────────────────────────────────────────────

const dotStyle = {
  width: 8, height: 8, borderRadius: '50%', background: C.primary, opacity: 0.4,
  display: 'inline-block',
};

function TypingIndicator() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          ...dotStyle,
          animation: 'typingBounce 1.4s infinite ease-in-out both',
          animationDelay: `${i * 0.16}s`,
        }} />
      ))}
      <style>{`
        @keyframes typingBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

function TypingCursor() {
  return (
    <span style={{
      display: 'inline-block', width: 2, height: 16, background: C.primary,
      marginLeft: 2, verticalAlign: 'text-bottom',
      animation: 'cursorBlink 1s step-end infinite',
    }}>
      <style>{`
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </span>
  );
}

// ─── Chat Tab Component ────────────────────────────────────────────────

function ChatTab() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [module, setModule] = useState('supervisor');
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [showSessions, setShowSessions] = useState(true);
  const [availableModules, setAvailableModules] = useState(MODULE_OPTIONS);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    loadSessions();
    loadAvailableModules();
  }, []);

  async function loadAvailableModules() {
    try {
      const data = await agents.modules();
      if (Array.isArray(data) && data.length > 0) {
        setAvailableModules(data);
        setModule((current) => (data.some((m) => m.value === current) ? current : data[0].value));
      }
    } catch (e) {
      console.warn('[CHAT] Falha ao carregar módulos permitidos, usando fallback:', e);
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadSessions() {
    try {
      const data = await agents.sessions();
      setSessions(data);
    } catch (e) { console.error(e); }
  }

  function startNewChat() {
    setMessages([]);
    setSessionId(null);
    loadSessions(); // Refresh list so previous session shows up
  }

  async function resumeSession(sess) {
    setSessionId(sess.anthropic_session_id);
    setModule(sess.agent_module);
    // Don't hide sidebar — keep it visible for easy navigation

    // Load real message history
    try {
      const msgs = await agents.sessionMessages(sess.id);
      if (msgs && msgs.length > 0) {
        setMessages(msgs.map(m => ({ role: m.role, text: m.content })));
      } else {
        setMessages([{ role: 'system', text: `Sessão restaurada: ${sess.title || 'Sem título'}` }]);
      }
    } catch (e) {
      console.error('[CHAT] Failed to load messages:', e);
      setMessages([{ role: 'system', text: `Sessão restaurada: ${sess.title || 'Sem título'}` }]);
    }
  }

  async function deleteSession(id) {
    try {
      await agents.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (sessions.find(s => s.id === id)?.anthropic_session_id === sessionId) {
        startNewChat();
      }
    } catch (e) { console.error(e); }
  }

  async function sendMessage() {
    if (!input.trim() || streaming) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setStreaming(true);

    // Add an empty assistant message for streaming
    const assistantIdx = messages.length + 1;
    setMessages(prev => [...prev, { role: 'assistant', text: '' }]);

    try {
      const res = await agents.chat({ message: userMsg, module, sessionId });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'session') {
              setSessionId(event.sessionId);
              loadSessions();
            } else if (event.type === 'done') {
              loadSessions(); // Refresh sessions after response completes
            } else if (event.type === 'delta') {
              setMessages(prev => {
                const updated = [...prev];
                const lastAssistant = updated.length - 1;
                if (updated[lastAssistant]?.role === 'assistant') {
                  updated[lastAssistant] = { ...updated[lastAssistant], text: updated[lastAssistant].text + event.text };
                }
                return updated;
              });
            } else if (event.type === 'raw') {
              console.log('[CHAT DEBUG] Raw SSE:', event.payload);
            } else if (event.type === 'error') {
              setMessages(prev => {
                const updated = [...prev];
                const lastAssistant = updated.length - 1;
                if (updated[lastAssistant]?.role === 'assistant') {
                  updated[lastAssistant] = { role: 'error', text: event.text };
                }
                return updated;
              });
            }
          } catch (e) { /* skip */ }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated.length - 1;
        if (updated[last]?.role === 'assistant' && !updated[last].text) {
          updated[last] = { role: 'error', text: e.message };
        } else {
          updated.push({ role: 'error', text: e.message });
        }
        return updated;
      });
    }

    setStreaming(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const selectedModuleLabel = availableModules.find(m => m.value === module)?.label
    || MODULE_OPTIONS.find(m => m.value === module)?.label
    || '🧠 Supervisor';

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 220px)', minHeight: 500 }}>
      {/* Sessions sidebar */}
      {showSessions && (
        <div style={{ ...s.card, width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...s.cardHeader, flexShrink: 0 }}>
            <div style={s.cardTitle}>Sessões</div>
            <button onClick={() => setShowSessions(false)} style={{ ...s.btn('ghost'), padding: '4px 8px', fontSize: 16 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sessions.length === 0 ? (
              <div style={s.empty}>Nenhuma sessão</div>
            ) : sessions.map(sess => (
              <div key={sess.id} style={{
                padding: '12px 16px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                background: sess.anthropic_session_id === sessionId ? C.primaryBg : 'transparent',
              }}>
                <div onClick={() => resumeSession(sess)} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                    {sess.title || 'Sem título'}
                  </div>
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                    {availableModules.find(m => m.value === sess.agent_module)?.label || MODULE_OPTIONS.find(m => m.value === sess.agent_module)?.label || sess.agent_module} · {fmtDate(sess.last_message_at)}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteSession(sess.id); }}
                  style={{ fontSize: 10, color: C.red, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  remover
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main chat */}
      <div style={{ ...s.card, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Chat header */}
        <div style={{ ...s.cardHeader, flexShrink: 0, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setShowSessions(!showSessions)} style={{ ...s.btn('ghost'), padding: '4px 8px', fontSize: 16 }} title="Sessões">
              💬
            </button>
            <button onClick={startNewChat} style={{ ...s.btn('ghost'), padding: '4px 8px', fontSize: 14 }} title="Nova conversa">
              ＋ Nova
            </button>
          </div>

          {/* Module selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: C.text3 }}>Agente:</span>
            <select value={module} onChange={(e) => setModule(e.target.value)}
              style={{
                padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: C.primaryBg, color: C.primary, border: `1px solid ${C.primary}40`,
                cursor: 'pointer',
              }}>
              {availableModules.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {sessionId && (
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'monospace' }}>
              sessão ativa
            </span>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>🧠</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, opacity: 0.6 }}>Assistente IA CBRio</div>
              <div style={{ fontSize: 13, color: C.text3, textAlign: 'center', maxWidth: 400, lineHeight: 1.5 }}>
                Escolha um agente especialista e faça perguntas sobre o sistema.<br />
                O agente tem acesso aos dados reais do ERP.
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.6,
                ...(msg.role === 'user' ? {
                  background: C.primary, color: '#fff',
                  borderBottomRightRadius: 4,
                } : msg.role === 'error' ? {
                  background: C.redBg, color: C.red, border: `1px solid ${C.red}40`,
                  borderBottomLeftRadius: 4,
                } : msg.role === 'system' ? {
                  background: C.primaryBg, color: C.text2, fontStyle: 'italic', fontSize: 12,
                  borderRadius: 8,
                } : {
                  background: C.card, color: C.text, border: `1px solid ${C.border}`,
                  borderBottomLeftRadius: 4,
                }),
              }}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none" style={{ color: 'inherit' }}>
                    {msg.text ? (
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    ) : streaming && i === messages.length - 1 ? (
                      <TypingIndicator />
                    ) : null}
                    {streaming && i === messages.length - 1 && msg.text && <TypingCursor />}
                  </div>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Pergunte ao agente ${selectedModuleLabel}...`}
            disabled={streaming}
            rows={1}
            style={{ flex: 1, minHeight: 40, maxHeight: 120, resize: 'none', fontSize: 14 }}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || streaming} style={{ flexShrink: 0 }}>
            {streaming ? '...' : 'Enviar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Box ───────────────────────────────────────────────────────────

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{ ...s.card, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.text, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Score Chart ────────────────────────────────────────────────────────

function ScoreChart({ scores = {} }) {
  const entries = Object.entries(scores).filter(([, v]) => v.length > 0);
  if (!entries.length) return null;

  // Calcular extremos para o eixo temporal
  const allDates = entries.flatMap(([, h]) => h.map(p => new Date(p.date).getTime()));
  const minT = Math.min(...allDates);
  const maxT = Math.max(...allDates);
  const range = Math.max(maxT - minT, 86400000); // ao menos 1d

  const W = 800;
  const H = 180;
  const padL = 32, padR = 12, padT = 12, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Paleta circular para os agentes
  const palette = ['#00B39D', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#06b6d4', '#84cc16'];

  const xOf = (ts) => padL + ((ts - minT) / range) * innerW;
  const yOf = (score) => padT + innerH - (score / 10) * innerH;

  return (
    <div style={{ ...s.card, padding: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Evolução dos Scores</div>
        <div style={{ fontSize: 11, color: C.text3 }}>{entries.length} agente(s) · {allDates.length} pontos</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480, height: H, display: 'block' }}>
          {/* gridlines de score (0, 5, 10) */}
          {[0, 5, 10].map(score => (
            <g key={score}>
              <line x1={padL} y1={yOf(score)} x2={W - padR} y2={yOf(score)} stroke={C.border} strokeWidth={1} strokeDasharray={score === 5 ? '0' : '2,3'} />
              <text x={padL - 6} y={yOf(score) + 3} fontSize="9" textAnchor="end" fill={C.text3}>{score}</text>
            </g>
          ))}
          {/* linhas */}
          {entries.map(([type, history], idx) => {
            const color = palette[idx % palette.length];
            const pts = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
            const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(new Date(p.date).getTime())} ${yOf(p.score)}`).join(' ');
            return (
              <g key={type}>
                <path d={path} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p, i) => (
                  <circle key={i} cx={xOf(new Date(p.date).getTime())} cy={yOf(p.score)} r={3} fill={color}>
                    <title>{`${labelOf(type)} — ${new Date(p.date).toLocaleDateString('pt-BR')}: score ${p.score}, ${p.findingsCount} findings`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {/* Legenda */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        {entries.map(([type, history], idx) => {
          const color = palette[idx % palette.length];
          const last = history[history.length - 1];
          const prev = history.length > 1 ? history[history.length - 2] : null;
          const trend = prev ? last.score - prev.score : 0;
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.text2 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span>{labelOf(type)}</span>
              <strong style={{ color: scoreColor(last.score) }}>{last.score}</strong>
              {trend !== 0 && (
                <span style={{ color: trend > 0 ? C.green : C.red, fontWeight: 600 }}>
                  {trend > 0 ? `▲+${trend}` : `▼${trend}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Auditorias Tab (código existente preservado) ───────────────────────

function AuditoriasTab() {
  const [runs, setRuns] = useState([]);
  const [stats, setStats] = useState(null);
  const [scores, setScores] = useState({});
  const [launching, setLaunching] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [steps, setSteps] = useState([]);
  const [pollingId, setPollingId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // all, completed, running, failed

  const loadRuns = useCallback(async () => {
    try { setRuns(await agents.runs()); } catch (e) { console.error(e); }
  }, []);

  const loadScores = useCallback(async () => {
    try { setScores(await agents.scores()); } catch (e) { console.error(e); }
  }, []);

  const loadStats = useCallback(async () => {
    try { setStats(await agents.stats()); } catch (e) { console.error(e); }
  }, []);

  const selectRun = useCallback(async (runId) => {
    try {
      const detail = await agents.runDetail(runId);
      const stepsData = await agents.runSteps(runId);
      setSelectedRun(detail);
      setSteps(stepsData);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadRuns(); loadStats(); loadScores(); }, [loadRuns, loadStats, loadScores]);

  // Deep-link ?run=<id> abre a run direto (vindo da notificacao)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const runId = params.get('run');
    if (runId) selectRun(runId);
  }, [selectRun]);

  useEffect(() => {
    const hasRunning = runs.some(r => r.status === 'running');
    if (hasRunning && !pollingId) {
      const id = setInterval(() => { loadRuns(); }, 5000);
      setPollingId(id);
    } else if (!hasRunning && pollingId) {
      clearInterval(pollingId);
      setPollingId(null);
    }
    return () => { if (pollingId) clearInterval(pollingId); };
  }, [runs, pollingId, loadRuns]);

  async function launchAgent(agentType) {
    setLaunching(true);
    try {
      const result = await agents.run({ agentType, config: { targetModules: ['all'], tokenBudget: 50000 } });
      await loadRuns();
      if (result.runId) selectRun(result.runId);
    } catch (e) { alert(e.message); }
    setLaunching(false);
  }

  // Resumo agregado de findings de runs completas
  const findingsSummary = runs
    .filter(r => r.status === 'completed' && Array.isArray(r.findings))
    .reduce((acc, r) => {
      r.findings.forEach(f => {
        if (f.severity === 'critico') acc.criticos++;
        else if (f.severity === 'aviso') acc.avisos++;
        else acc.info++;
      });
      return acc;
    }, { criticos: 0, avisos: 0, info: 0 });

  const runsFiltered = filterStatus === 'all' ? runs : runs.filter(r => r.status === filterStatus);
  const lastRunByAgent = runs.reduce((acc, r) => {
    if (!acc[r.agent_type]) acc[r.agent_type] = r;
    return acc;
  }, {});

  return (
    <>
      {/* Stats bar: agora com findings agregados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatBox label="Execuções" value={stats?.totalRuns ?? '—'} sub={stats ? `${stats.completed} OK · ${stats.failed} falhas` : null} />
        <StatBox label="Tokens" value={stats ? fmtTokens(stats.totalTokens) : '—'} />
        <StatBox label="Custo" value={stats ? fmtCost(stats.totalCost) : '—'} sub={stats ? `últimos ${stats.sinceDays}d` : null} />
        <StatBox label="Findings críticos" value={findingsSummary.criticos} color={findingsSummary.criticos > 0 ? C.red : C.text} sub={`${findingsSummary.avisos} avisos · ${findingsSummary.info} info`} />
      </div>

      <ScoreChart scores={scores} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Button onClick={async () => { for (const at of AGENT_TYPES) { await launchAgent(at.value); } }} disabled={launching}>
          {launching ? 'Iniciando...' : '🚀 Executar Todos os Agentes'}
        </Button>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { v: 'all', label: 'Todas' },
            { v: 'completed', label: 'Concluídas' },
            { v: 'running', label: 'Em execução' },
            { v: 'failed', label: 'Falhas' },
          ].map(opt => (
            <button key={opt.v} onClick={() => setFilterStatus(opt.v)} style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 600,
              borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${filterStatus === opt.v ? C.primary : C.border}`,
              background: filterStatus === opt.v ? C.primaryBg : 'transparent',
              color: filterStatus === opt.v ? C.primary : C.text2,
            }}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Cards agrupados por categoria */}
      {GROUP_ORDER.map(groupKey => {
        const agentsInGroup = AGENT_TYPES.filter(a => a.group === groupKey);
        if (!agentsInGroup.length) return null;
        return (
          <div key={groupKey} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {GROUP_LABELS[groupKey]}
              </div>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {agentsInGroup.map(at => {
                const lastRun = lastRunByAgent[at.value];
                const lastStatus = lastRun ? STATUS_MAP[lastRun.status] : null;
                const score = lastRun?.config?.score;
                const findingsCount = lastRun?.findings?.length || 0;
                const criticos = (lastRun?.findings || []).filter(f => f.severity === 'critico').length;
                const sc = scoreColor(score);
                const isHighlighted = selectedRun?.agent_type === at.value;
                return (
                  <div key={at.value}
                    onClick={() => lastRun && selectRun(lastRun.id)}
                    style={{
                      ...s.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                      cursor: lastRun ? 'pointer' : 'default',
                      borderColor: isHighlighted ? C.primary : (criticos > 0 ? C.red : C.border),
                      borderWidth: isHighlighted || criticos > 0 ? 2 : 1,
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{at.label}</div>
                      {score != null && (
                        <div style={{ fontSize: 20, fontWeight: 800, color: sc }}>{score}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.4 }}>{at.desc}</div>
                    {lastRun && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: C.text3 }}>
                        <span style={s.badge(lastStatus?.c || C.text3, lastStatus?.bg || '#73737318')}>{lastStatus?.label || '—'}</span>
                        {criticos > 0 ? (
                          <span style={{ color: C.red, fontWeight: 700 }}>{criticos} crítico(s)</span>
                        ) : (
                          <span>{findingsCount > 0 ? `${findingsCount} finding(s)` : 'Sem alertas'}</span>
                        )}
                      </div>
                    )}
                    <Button size="sm" variant={lastRun ? 'outline' : 'default'} className="w-full"
                      onClick={(e) => { e.stopPropagation(); launchAgent(at.value); }} disabled={launching}>
                      {launching ? '...' : lastRun ? 'Executar Novamente' : 'Executar'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'grid', gridTemplateColumns: selectedRun ? '1fr 2fr' : '1fr', gap: 16 }}>
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.cardTitle}>Execuções</div>
            <Button variant="ghost" onClick={loadRuns}>Atualizar</Button>
          </div>
          {runsFiltered.length === 0 ? <div style={s.empty}>Nenhuma execução {filterStatus === 'all' ? '' : `(${filterStatus})`} encontrada</div> : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {runsFiltered.map(r => {
                const st = STATUS_MAP[r.status] || STATUS_MAP.running;
                const isSelected = selectedRun?.id === r.id;
                const criticos = (r.findings || []).filter(f => f.severity === 'critico').length;
                return (
                  <div key={r.id} onClick={() => selectRun(r.id)} style={{
                    padding: '14px 20px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                    background: isSelected ? C.primaryBg : 'transparent',
                    borderLeft: criticos > 0 ? `3px solid ${C.red}` : '3px solid transparent',
                    transition: 'background 0.15s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{labelOf(r.agent_type)}</span>
                      <span style={s.badge(st.c, st.bg)}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.text3 }}>
                      {fmtDate(r.created_at)} · {fmtTokens((r.tokens_input || 0) + (r.tokens_output || 0))} tokens · {fmtCost(r.cost_usd)}
                    </div>
                    {r.status === 'completed' && r.findings?.length > 0 && (
                      <div style={{ fontSize: 11, marginTop: 4, display: 'flex', gap: 8 }}>
                        {criticos > 0 && <span style={{ color: C.red, fontWeight: 700 }}>{criticos} crítico</span>}
                        <span style={{ color: C.amber }}>{r.findings.length} finding(s)</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedRun && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedRun.summary && (
              <div style={{ ...s.card, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Resumo Executivo</div>
                <div style={{ fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selectedRun.summary}</div>
              </div>
            )}

            {selectedRun.error && (
              <div style={{ ...s.card, padding: 20, borderLeft: `4px solid ${C.red}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 4 }}>Erro</div>
                <div style={{ fontSize: 13, color: C.text }}>{selectedRun.error}</div>
              </div>
            )}

            {selectedRun.findings?.length > 0 && (() => {
              const bySev = { critico: [], aviso: [], info: [] };
              selectedRun.findings.forEach(f => {
                if (bySev[f.severity]) bySev[f.severity].push(f);
                else bySev.info.push(f);
              });
              return (
                <div style={s.card}>
                  <div style={s.cardHeader}>
                    <div style={s.cardTitle}>Findings ({selectedRun.findings.length})</div>
                    <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                      {bySev.critico.length > 0 && <span style={s.badge('#fff', C.red)}>{bySev.critico.length} crítico</span>}
                      {bySev.aviso.length > 0 && <span style={s.badge('#000', C.amber)}>{bySev.aviso.length} aviso</span>}
                      {bySev.info.length > 0 && <span style={s.badge('#fff', C.blue)}>{bySev.info.length} info</span>}
                    </div>
                  </div>
                  <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                    {['critico', 'aviso', 'info'].map(sevKey => {
                      const items = bySev[sevKey];
                      if (!items.length) return null;
                      const sev = SEV_MAP[sevKey];
                      return (
                        <div key={sevKey}>
                          <div style={{
                            padding: '8px 20px', fontSize: 10, fontWeight: 700, letterSpacing: 1,
                            color: sev.bg === C.red ? '#fff' : sev.c, background: sev.bg,
                            borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
                          }}>{sev.label} · {items.length}</div>
                          {items.map((f, i) => (
                            <div key={i} style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                <span style={{ ...s.badge(C.primary, C.primaryBg), fontSize: 9 }}>{(f.module || '').toUpperCase()}</span>
                                {f.category && (
                                  <span style={{ ...s.badge(C.text3, '#73737318'), fontSize: 9 }}>{f.category}</span>
                                )}
                                <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{f.title}</span>
                              </div>
                              <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5, marginBottom: 6 }}>{f.detail}</div>
                              {f.suggestion && (
                                <div style={{ fontSize: 12, color: C.green, fontStyle: 'italic' }}>→ {f.suggestion}</div>
                              )}
                              {f.reference && (
                                <div style={{ fontSize: 11, color: C.blue, marginTop: 4 }}>Ref: {f.reference}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {selectedRun.config?.topReferences?.length > 0 && (
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>🎨 Referências de Design</div>
                </div>
                <div style={{ padding: 16 }}>
                  {selectedRun.config.topReferences.map((ref, i) => (
                    <div key={i} style={{ padding: '10px 0', borderBottom: i < selectedRun.config.topReferences.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>{ref.name}</div>
                      {ref.url && <div style={{ fontSize: 11, color: C.blue }}>{ref.url}</div>}
                      <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{ref.why}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedRun.config?.quickWins?.length > 0 && (
              <div style={{ ...s.card, borderLeft: `4px solid ${C.green}` }}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>⚡ Quick Wins</div>
                </div>
                <div style={{ padding: 16 }}>
                  {selectedRun.config.quickWins.map((qw, i) => (
                    <div key={i} style={{ padding: '6px 0', fontSize: 13, color: C.text, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: C.green, fontWeight: 700 }}>→</span>
                      <span>{qw}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {steps.length > 0 && (
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>Steps ({steps.length})</div>
                </div>
                {steps.map(step => (
                  <div key={step.id} style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: C.text2 }}>
                      <span>#{step.step_number} · <strong>{step.role}</strong> · {step.model?.split('-').slice(0, 2).join('-')}</span>
                      <span>{fmtTokens(step.tokens_input + step.tokens_output)} tokens · {step.duration_ms}ms · {fmtCost(step.cost_usd)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedRun.status === 'running' && (
              <div style={{ ...s.card, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>Agente em execução...</div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>A página atualiza automaticamente a cada 5 segundos.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function AssistenteIA() {
  return (
    <div style={s.page}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>Assistente IA</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>Agentes inteligentes para chat, auditoria e análise do sistema</div>
      </div>

      <Tabs defaultValue="chat">
        <TabsList className="mb-4">
          <TabsTrigger value="chat">💬 Chat IA</TabsTrigger>
          <TabsTrigger value="auditorias">🔍 Auditorias</TabsTrigger>
        </TabsList>

        <TabsContent value="chat">
          <ChatTab />
        </TabsContent>

        <TabsContent value="auditorias">
          <AuditoriasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
