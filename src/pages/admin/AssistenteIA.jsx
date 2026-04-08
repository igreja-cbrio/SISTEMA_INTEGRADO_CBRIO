import { useState, useEffect, useCallback } from 'react';
import { agents } from '../../api';
import { Button } from '../../components/ui/button';

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

// Mini bar chart for score history
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

export default function AssistenteIA() {
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

  // Polling para runs em execução
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
    <div style={s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>Assistente IA</div>
          <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>Agentes inteligentes para auditoria, análise e melhorias do sistema</div>
        </div>
        {stats && (
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: C.text2 }}>
            <span>Execuções: <strong style={{ color: C.text }}>{stats.totalRuns}</strong></span>
            <span>Tokens: <strong style={{ color: C.text }}>{fmtTokens(stats.totalTokens)}</strong></span>
            <span>Custo: <strong style={{ color: C.text }}>{fmtCost(stats.totalCost)}</strong></span>
          </div>
        )}
      </div>

      {/* Score History Chart */}
      <ScoreChart scores={scores} />

      {/* Launch All */}
      <div style={{ marginBottom: 16 }}>
        <Button onClick={async () => { for (const at of AGENT_TYPES) { await launchAgent(at.value); } }} disabled={launching}>
          {launching ? 'Iniciando...' : '🚀 Executar Todos os Agentes'}
        </Button>
      </div>

      {/* Agent Cards */}
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
        {/* Runs List */}
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

        {/* Run Detail */}
        {selectedRun && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Summary */}
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

            {/* Findings */}
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

            {/* Design References */}
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

            {/* Quick Wins */}
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

            {/* Steps */}
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

            {/* Status running */}
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
    </div>
  );
}
