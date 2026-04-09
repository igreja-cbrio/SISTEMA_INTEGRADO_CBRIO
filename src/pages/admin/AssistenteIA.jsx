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
  { value: 'system_auditor', label: '🔍 Auditor Geral', desc: 'Analisa dados reais de todos os módulos e identifica problemas, inconsistências e oportunidades de melhoria.', icon: '🔍' },
  { value: 'module_rh', label: '👥 Agente RH', desc: 'Audita colaboradores, admissões, férias, treinamentos. Verifica campos faltantes e inconsistências.', icon: '👥' },
  { value: 'module_financeiro', label: '💰 Agente Financeiro', desc: 'Audita contas, transações, contas a pagar e reembolsos. Detecta vencimentos e anomalias.', icon: '💰' },
  { value: 'module_eventos', label: '📅 Agente Eventos', desc: 'Audita eventos, tarefas, orçamentos e reuniões. Identifica atrasos e eventos sem responsável.', icon: '📅' },
  { value: 'module_projetos', label: '📊 Agente Projetos', desc: 'Audita projetos, fases, tarefas e riscos. Detecta progresso estagnado e marcos vencidos.', icon: '📊' },
  { value: 'module_logistica', label: '🚚 Agente Logística', desc: 'Audita fornecedores, pedidos, solicitações e notas fiscais. Verifica atrasos e pendências.', icon: '🚚' },
  { value: 'module_patrimonio', label: '🏢 Agente Patrimônio', desc: 'Audita bens, inventários e movimentações. Detecta bens extraviados e sem catalogação.', icon: '🏢' },
  { value: 'module_membresia', label: '⛪ Agente Membresia', desc: 'Audita membros, integração e engajamento. Identifica dados incompletos e inativos.', icon: '⛪' },
  { value: 'design_auditor', label: '🎨 Agente Design', desc: 'Analisa layout e UI do sistema, traz referências modernas (Linear, Vercel, Notion) e sugere melhorias concretas com Tailwind.', icon: '🎨' },
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
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    loadSessions();
  }, []);

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
  }

  async function resumeSession(sess) {
    setSessionId(sess.anthropic_session_id);
    setModule(sess.agent_module);
    setShowSessions(false);

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

  const selectedModuleLabel = MODULE_OPTIONS.find(m => m.value === module)?.label || '🧠 Supervisor';

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
                    {MODULE_OPTIONS.find(m => m.value === sess.agent_module)?.label || sess.agent_module} · {fmtDate(sess.last_message_at)}
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
              {MODULE_OPTIONS.map(m => (
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

// ─── Score Chart ────────────────────────────────────────────────────────

function ScoreChart({ scores = {} }) {
  const moduleNames = { module_rh: 'RH', module_financeiro: 'Fin', module_eventos: 'Evt', module_projetos: 'Proj', module_logistica: 'Log', module_patrimonio: 'Pat', module_membresia: 'Mem', system_auditor: 'Geral' };
  const entries = Object.entries(scores).filter(([, v]) => v.length > 0);
  if (!entries.length) return null;

  return (
    <div style={{ ...s.card, padding: 20, marginBottom: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>Evolução dos Scores</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {entries.map(([type, history]) => {
          const last = history[history.length - 1];
          const prev = history.length > 1 ? history[history.length - 2] : null;
          const trend = prev ? last.score - prev.score : 0;
          const scoreColor = last.score >= 8 ? C.green : last.score >= 5 ? C.amber : C.red;
          return (
            <div key={type} style={{ textAlign: 'center', minWidth: 60 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: scoreColor }}>{last.score}</div>
              <div style={{ fontSize: 10, color: C.text3 }}>{moduleNames[type] || type}</div>
              {trend !== 0 && (
                <div style={{ fontSize: 10, color: trend > 0 ? C.green : C.red, fontWeight: 600 }}>
                  {trend > 0 ? `▲+${trend}` : `▼${trend}`}
                </div>
              )}
              <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
                {history.slice(-8).map((h, i) => (
                  <div key={i} style={{ width: 4, height: h.score * 3, background: h.score >= 8 ? C.green : h.score >= 5 ? C.amber : C.red, borderRadius: 2, opacity: 0.3 + (i / history.length) * 0.7 }} />
                ))}
              </div>
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
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [steps, setSteps] = useState([]);
  const [pollingId, setPollingId] = useState(null);

  const loadRuns = useCallback(async () => {
    try { setRuns(await agents.runs()); } catch (e) { console.error(e); }
  }, []);

  const loadScores = useCallback(async () => {
    try { setScores(await agents.scores()); } catch (e) { console.error(e); }
  }, []);

  const loadStats = useCallback(async () => {
    try { setStats(await agents.stats()); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadRuns(); loadStats(); loadScores(); }, [loadRuns, loadStats, loadScores]);

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

  async function selectRun(runId) {
    try {
      const detail = await agents.runDetail(runId);
      const stepsData = await agents.runSteps(runId);
      setSelectedRun(detail);
      setSteps(stepsData);
    } catch (e) { console.error(e); }
  }

  return (
    <>
      {stats && (
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: C.text2, marginBottom: 16 }}>
          <span>Execuções: <strong style={{ color: C.text }}>{stats.totalRuns}</strong></span>
          <span>Tokens: <strong style={{ color: C.text }}>{fmtTokens(stats.totalTokens)}</strong></span>
          <span>Custo: <strong style={{ color: C.text }}>{fmtCost(stats.totalCost)}</strong></span>
        </div>
      )}

      <ScoreChart scores={scores} />

      <div style={{ marginBottom: 16 }}>
        <Button onClick={async () => { for (const at of AGENT_TYPES) { await launchAgent(at.value); } }} disabled={launching}>
          {launching ? 'Iniciando...' : '🚀 Executar Todos os Agentes'}
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
        {AGENT_TYPES.map(at => {
          const lastRun = runs.find(r => r.agent_type === at.value);
          const lastStatus = lastRun ? STATUS_MAP[lastRun.status] : null;
          const score = lastRun?.config?.score;
          const findingsCount = lastRun?.findings?.length || 0;
          const scoreColor = score >= 8 ? C.green : score >= 5 ? C.amber : score ? C.red : C.text3;
          return (
            <div key={at.value} style={{ ...s.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{at.label}</div>
                {score != null && (
                  <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor }}>{score}</div>
                )}
              </div>
              <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.4 }}>{at.desc}</div>
              {lastRun && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: C.text3 }}>
                  <span style={s.badge(lastStatus?.c || C.text3, lastStatus?.bg || '#73737318')}>{lastStatus?.label || '—'}</span>
                  <span>{findingsCount > 0 ? `${findingsCount} finding(s)` : 'Sem alertas'}</span>
                </div>
              )}
              <Button size="sm" variant={lastRun ? 'outline' : 'default'} className="w-full" onClick={() => launchAgent(at.value)} disabled={launching}>
                {launching ? '...' : lastRun ? 'Executar Novamente' : 'Executar'}
              </Button>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedRun ? '1fr 2fr' : '1fr', gap: 16 }}>
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.cardTitle}>Execuções</div>
            <Button variant="ghost" onClick={loadRuns}>Atualizar</Button>
          </div>
          {runs.length === 0 ? <div style={s.empty}>Nenhuma execução ainda</div> : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {runs.map(r => {
                const st = STATUS_MAP[r.status] || STATUS_MAP.running;
                const isSelected = selectedRun?.id === r.id;
                return (
                  <div key={r.id} onClick={() => selectRun(r.id)} style={{
                    padding: '14px 20px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                    background: isSelected ? C.primaryBg : 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{
                        { system_auditor: '🔍 Auditor', design_auditor: '🎨 Design', module_rh: '👥 RH', module_financeiro: '💰 Financeiro', module_eventos: '📅 Eventos', module_projetos: '📊 Projetos', module_logistica: '🚚 Logística', module_patrimonio: '🏢 Patrimônio', module_membresia: '⛪ Membresia' }[r.agent_type] || r.agent_type
                      }</span>
                      <span style={s.badge(st.c, st.bg)}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.text3 }}>
                      {fmtDate(r.created_at)} · {fmtTokens((r.tokens_input || 0) + (r.tokens_output || 0))} tokens · {fmtCost(r.cost_usd)}
                    </div>
                    {r.status === 'completed' && r.findings?.length > 0 && (
                      <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>
                        {r.findings.length} finding(s)
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

            {selectedRun.findings?.length > 0 && (
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>Findings ({selectedRun.findings.length})</div>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {selectedRun.findings.map((f, i) => {
                    const sev = SEV_MAP[f.severity] || SEV_MAP.info;
                    return (
                      <div key={i} style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ ...s.badge(sev.c, sev.bg), fontSize: 9 }}>{sev.label}</span>
                          <span style={{ ...s.badge(C.primary, C.primaryBg), fontSize: 9 }}>{(f.module || '').toUpperCase()}</span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{f.title}</span>
                        </div>
                        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5, marginBottom: 6 }}>{f.detail}</div>
                        {f.suggestion && (
                          <div style={{ fontSize: 12, color: C.green, fontStyle: 'italic' }}>Sugestão: {f.suggestion}</div>
                        )}
                        {f.reference && (
                          <div style={{ fontSize: 11, color: C.blue, marginTop: 4 }}>Ref: {f.reference}</div>
                        )}
                        {f.category && (
                          <span style={{ ...s.badge(C.text3, '#73737318'), fontSize: 9, marginTop: 4, display: 'inline-block' }}>{f.category}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
