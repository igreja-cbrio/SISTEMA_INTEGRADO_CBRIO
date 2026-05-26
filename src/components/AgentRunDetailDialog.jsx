import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618', purple: '#8b5cf6', purpleBg: '#8b5cf618',
};

const STATUS_MAP = {
  running: { c: C.blue, bg: C.blueBg, label: 'Executando' },
  completed: { c: C.green, bg: C.greenBg, label: 'Concluído' },
  failed: { c: C.red, bg: C.redBg, label: 'Falhou' },
  cancelled: { c: C.text3, bg: '#73737318', label: 'Cancelado' },
};

const SEV_MAP = {
  critico: { c: '#fff', bg: C.red, label: 'CRÍTICO' },
  aviso: { c: '#000', bg: C.amber, label: 'AVISO' },
  info: { c: '#fff', bg: C.blue, label: 'INFO' },
};

const fmtDate = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtCost = (v) => `$${(Number(v) || 0).toFixed(4)}`;
const fmtTokens = (v) => (v || 0).toLocaleString('pt-BR');

const LABEL_AGENT = {
  module_kpis_watcher: '📊 Watcher KPIs/OKRs',
  module_financeiro_executor: '🤖 Executor Financeiro',
  system_auditor: '🔍 Auditor Geral',
  design_auditor: '🎨 Agente Design',
};
function agentLabel(t) {
  return LABEL_AGENT[t] || t?.replace('module_', '').replace('_', ' ');
}

// Estilos pro markdown render
const mdStyles = {
  page: { color: C.text, fontSize: 14, lineHeight: 1.7 },
  h1: { fontSize: 22, fontWeight: 800, marginTop: 20, marginBottom: 12, color: C.text, letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: 700, marginTop: 18, marginBottom: 10, color: C.text, letterSpacing: -0.2 },
  h3: { fontSize: 15, fontWeight: 700, marginTop: 14, marginBottom: 8, color: C.text },
  p: { marginBottom: 10, color: C.text2 },
  ul: { marginBottom: 12, paddingLeft: 22, color: C.text2 },
  ol: { marginBottom: 12, paddingLeft: 22, color: C.text2 },
  li: { marginBottom: 4 },
  strong: { fontWeight: 700, color: C.text },
  em: { fontStyle: 'italic', color: C.text2 },
  hr: { border: 'none', borderTop: `1px solid ${C.border}`, margin: '18px 0' },
  blockquote: {
    margin: '10px 0', padding: '8px 14px',
    borderLeft: `3px solid ${C.primary}`, background: C.primaryBg,
    borderRadius: '0 6px 6px 0', color: C.text2,
  },
  code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12, padding: '2px 6px', borderRadius: 4,
    background: 'rgba(127,127,127,0.12)', color: C.text,
  },
  pre: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12, padding: 12, borderRadius: 8,
    background: 'rgba(127,127,127,0.08)', border: `1px solid ${C.border}`,
    overflow: 'auto', marginBottom: 12,
  },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 14, fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 12px', background: 'rgba(127,127,127,0.08)', borderBottom: `2px solid ${C.border}`, fontWeight: 700, color: C.text },
  td: { padding: '8px 12px', borderBottom: `1px solid ${C.border}`, color: C.text2 },
  a: { color: C.primary, textDecoration: 'underline' },
};

const mdComponents = {
  h1: (p) => <h1 style={mdStyles.h1} {...p} />,
  h2: (p) => <h2 style={mdStyles.h2} {...p} />,
  h3: (p) => <h3 style={mdStyles.h3} {...p} />,
  h4: (p) => <h3 style={{ ...mdStyles.h3, fontSize: 14 }} {...p} />,
  p: (p) => <p style={mdStyles.p} {...p} />,
  ul: (p) => <ul style={mdStyles.ul} {...p} />,
  ol: (p) => <ol style={mdStyles.ol} {...p} />,
  li: (p) => <li style={mdStyles.li} {...p} />,
  strong: (p) => <strong style={mdStyles.strong} {...p} />,
  em: (p) => <em style={mdStyles.em} {...p} />,
  hr: (p) => <hr style={mdStyles.hr} {...p} />,
  blockquote: (p) => <blockquote style={mdStyles.blockquote} {...p} />,
  code: ({ inline, children, ...rest }) =>
    inline === false
      ? <pre style={mdStyles.pre}><code {...rest}>{children}</code></pre>
      : <code style={mdStyles.code} {...rest}>{children}</code>,
  pre: (p) => <pre style={mdStyles.pre} {...p} />,
  table: (p) => <div style={{ overflowX: 'auto' }}><table style={mdStyles.table} {...p} /></div>,
  th: (p) => <th style={mdStyles.th} {...p} />,
  td: (p) => <td style={mdStyles.td} {...p} />,
  a: (p) => <a style={mdStyles.a} target="_blank" rel="noopener noreferrer" {...p} />,
};

function MetaPill({ label, value, color = C.text2 }) {
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', gap: 2,
      padding: '6px 14px', borderRadius: 8, background: C.card,
      border: `1px solid ${C.border}`, minWidth: 80,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

export default function AgentRunDetailDialog({ run, open, onClose }) {
  if (!run) return null;
  const st = STATUS_MAP[run.status] || STATUS_MAP.running;
  const totalTokens = (run.tokens_input || 0) + (run.tokens_output || 0);
  const duracaoMs = run.completed_at && run.created_at
    ? new Date(run.completed_at).getTime() - new Date(run.created_at).getTime()
    : null;
  const duracaoStr = duracaoMs
    ? duracaoMs < 60000
      ? `${(duracaoMs / 1000).toFixed(1)}s`
      : `${Math.floor(duracaoMs / 60000)}m ${Math.round((duracaoMs % 60000) / 1000)}s`
    : '—';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden p-0"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
      >
        {/* Header com gradiente */}
        <div style={{
          padding: '20px 24px',
          background: `linear-gradient(135deg, ${C.primary}08 0%, ${C.primary}03 100%)`,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <DialogHeader>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <DialogTitle style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: -0.3 }}>
                  {agentLabel(run.agent_type)}
                </DialogTitle>
                <div style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
                  {fmtDate(run.created_at)}{run.completed_at ? ` → ${fmtDate(run.completed_at)}` : ''}
                </div>
              </div>
              <div style={{
                display: 'inline-block', padding: '4px 14px', borderRadius: 20,
                fontSize: 12, fontWeight: 700, color: st.c, background: st.bg,
              }}>
                {st.label}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <MetaPill label="Duração" value={duracaoStr} />
              <MetaPill label="Tokens" value={fmtTokens(totalTokens)} />
              <MetaPill label="Custo" value={fmtCost(run.cost_usd)} />
              {run.actions_taken?.propostas_geradas != null && (
                <MetaPill label="Propostas" value={run.actions_taken.propostas_geradas} color={C.primary} />
              )}
              {run.actions_taken?.alertas_propostos != null && (
                <MetaPill label="Alertas" value={run.actions_taken.alertas_propostos} color={C.amber} />
              )}
              {run.findings?.length > 0 && (
                <MetaPill label="Findings" value={run.findings.length} color={C.amber} />
              )}
            </div>
          </DialogHeader>
        </div>

        {/* Body scrollavel */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 180px)', padding: '20px 28px' }}>
          {/* Erro destacado */}
          {run.error && (
            <div style={{
              padding: 14, borderRadius: 8, marginBottom: 16,
              background: C.redBg, border: `1px solid ${C.red}40`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Erro
              </div>
              <div style={{ fontSize: 13, color: C.text }}>{run.error}</div>
            </div>
          )}

          {/* Summary com markdown render */}
          {run.summary && (
            <div style={mdStyles.page}>
              <ReactMarkdown components={mdComponents}>
                {run.summary}
              </ReactMarkdown>
            </div>
          )}

          {/* Findings agrupados (modelo legacy dos auditores) */}
          {run.findings?.length > 0 && (() => {
            const bySev = { critico: [], aviso: [], info: [] };
            run.findings.forEach((f) => {
              (bySev[f.severity] || bySev.info).push(f);
            });
            return (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Findings · {run.findings.length}
                </div>
                {['critico', 'aviso', 'info'].map((sevKey) => {
                  const items = bySev[sevKey];
                  if (!items.length) return null;
                  const sev = SEV_MAP[sevKey];
                  return (
                    <div key={sevKey} style={{ marginBottom: 14 }}>
                      <div style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 14,
                        fontSize: 10, fontWeight: 700, color: sev.c, background: sev.bg,
                        marginBottom: 8,
                      }}>
                        {sev.label} · {items.length}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {items.map((f, i) => (
                          <div key={i} style={{
                            padding: 12, borderRadius: 8,
                            background: C.bg, border: `1px solid ${C.border}`,
                            borderLeft: `3px solid ${sev.bg}`,
                          }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                              {f.title}
                            </div>
                            <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5 }}>{f.detail}</div>
                            {f.suggestion && (
                              <div style={{ fontSize: 12, color: C.green, fontStyle: 'italic', marginTop: 6 }}>→ {f.suggestion}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {!run.summary && !run.error && !run.findings?.length && (
            <div style={{ padding: 40, textAlign: 'center', color: C.text3, fontSize: 14 }}>
              Sem resumo disponível ainda.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
