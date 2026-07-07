// ============================================================================
// Central de Agentes IA · painel ao vivo
// Mostra os agentes do sistema/app: quem está rodando agora, o que faz e
// quanto de token/custo cada um gasta. Lê /api/agents/overview (bundle único)
// e atualiza sozinho a cada 8s.
// ============================================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { agents } from '@/api';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Cpu, DollarSign, ShieldCheck, Palette, Boxes, Bot, BrainCircuit, Radio,
  Zap, Activity, AlertTriangle, CheckCircle2, Loader2, Coins, Timer, RefreshCw, Inbox,
} from 'lucide-react';

const ACCENT = '#00B39D';

// ── Metadados por tipo de agente ────────────────────────────────────────────
const AG = {
  financeiro_executor: { label: 'Executor Financeiro', Icon: DollarSign, cor: '#10b981', desc: 'Categoriza lançamentos e propõe pagamentos' },
  system_auditor:      { label: 'Auditor do Sistema',  Icon: ShieldCheck, cor: '#f59e0b', desc: 'Varre o sistema em busca de riscos' },
  design_auditor:      { label: 'Auditor de Design',   Icon: Palette,     cor: '#ec4899', desc: 'Consistência visual das telas' },
  supervisor:          { label: 'Chat IA · Supervisor', Icon: BrainCircuit, cor: '#8b5cf6', desc: 'Assistente conversacional geral' },
};
function meta(type) {
  if (!type) return { label: 'Desconhecido', Icon: Bot, cor: '#94a3b8', desc: '' };
  if (AG[type]) return AG[type];
  if (type.startsWith('module_')) {
    const m = type.slice(7);
    return { label: `Auditor · ${m.charAt(0).toUpperCase() + m.slice(1)}`, Icon: Boxes, cor: '#6366f1', desc: 'Auditoria do módulo' };
  }
  const label = type.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, Icon: BrainCircuit, cor: ACCENT, desc: 'Chamada de IA' };
}

// ── Formatação ────────────────────────────────────────────────────────────
const fmtTokens = (n) => (n || 0).toLocaleString('pt-BR');
const fmtCost = (n) => {
  const v = Number(n || 0);
  return 'US$ ' + (v >= 1 ? v.toFixed(2) : v.toFixed(4));
};
function fmtDur(s) {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
function haQuanto(iso) {
  if (!iso) return '—';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)}min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  return format(new Date(iso), 'dd/MM HH:mm', { locale: ptBR });
}

const STATUS_META = {
  running:   { label: 'rodando',   cor: ACCENT,     Icon: Loader2 },
  completed: { label: 'concluído', cor: '#22c55e',  Icon: CheckCircle2 },
  failed:    { label: 'falhou',    cor: '#ef4444',  Icon: AlertTriangle },
  cancelled: { label: 'cancelado', cor: '#94a3b8',  Icon: AlertTriangle },
};

export default function Agentes() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [em, setEm] = useState(null);
  const primeira = useRef(true);

  const carregar = useCallback(async () => {
    try {
      const r = await agents.overview();
      setD(r); setErro(null); setEm(new Date());
    } catch (e) {
      setErro(e?.message || 'Erro ao carregar');
    } finally {
      primeira.current = false;
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 8000);
    return () => clearInterval(t);
  }, [carregar]);

  if (primeira.current && !d) {
    return <div className="flex justify-center items-center py-24"><Loader2 className="h-8 w-8 animate-spin" style={{ color: ACCENT }} /></div>;
  }

  const k = d?.kpis || {};
  const running = d?.running || [];
  const perAgent = d?.perAgent || [];
  const serie = (d?.serie || []).map((p) => ({ ...p, label: format(new Date(p.dia + 'T00:00:00'), 'dd/MM', { locale: ptBR }) }));

  return (
    <div className="ag-hud max-w-[1200px] mx-auto p-4 space-y-4">
      <style>{HUD_CSS}</style>

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cpu className="h-6 w-6" style={{ color: ACCENT }} />
            Central de Agentes IA
          </h1>
          <p className="text-sm text-muted-foreground">Agentes do sistema e do app — o que estão fazendo e quanto de token gastam.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5" style={{ color: running.length ? ACCENT : '#94a3b8' }} />
            atualiza a cada 8s{em && ` · ${format(em, 'HH:mm:ss')}`}
          </span>
          <button onClick={carregar} className="ag-btn" title="Atualizar agora"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {erro && !d && (
        <div className="ag-panel p-8 text-center text-muted-foreground">{erro}</div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi Icon={Zap} label="Rodando agora" value={k.rodandoAgora ?? 0} cor={ACCENT} pulse={!!k.rodandoAgora} />
        <Kpi Icon={Coins} label="Tokens · 7 dias" value={fmtTokens(k.tokens7d)} cor="#8b5cf6" sub={`${fmtTokens(k.tokens30d)} em 30d`} />
        <Kpi Icon={DollarSign} label="Custo · 7 dias" value={fmtCost(k.custo7d)} cor="#10b981" sub={`${fmtCost(k.custo30d)} em 30d`} />
        <Kpi Icon={Activity} label="Execuções · 7 dias" value={k.runs7d ?? 0} cor="#3b82f6"
             sub={`${k.completed7d ?? 0} ok · ${k.failed7d ?? 0} falhas`} />
      </div>

      {/* Rodando agora */}
      <div className="ag-panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="ag-dot" style={{ ['--c']: ACCENT }} />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Rodando agora</h2>
          <span className="text-xs text-muted-foreground">({running.length})</span>
        </div>
        {running.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum agente em execução neste instante. Eles rodam em cron/sob demanda — o histórico aparece abaixo.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {running.map((r) => {
              const m = meta(r.agent_type);
              return (
                <div key={r.id} className="ag-live" style={{ ['--c']: m.cor }}>
                  <div className="ag-scan" />
                  <div className="flex items-start gap-3 relative">
                    <div className="ag-ico" style={{ ['--c']: m.cor }}><m.Icon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{m.label}</span>
                        <span className="ag-chip" style={{ ['--c']: m.cor }}><Loader2 className="h-3 w-3 animate-spin" /> ativo</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{r.summary || m.desc}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" style={{ color: m.cor }} /> {fmtDur(r.dur_s)}</span>
                        <span className="flex items-center gap-1 ag-num"><Coins className="h-3.5 w-3.5" style={{ color: m.cor }} /> {fmtTokens(r.tokens)}</span>
                        <span className="flex items-center gap-1 ag-num">{fmtCost(r.custo)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Consumo de tokens (14d) */}
      <div className="ag-panel p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-2">Consumo de tokens · 14 dias</h2>
        {serie.every((p) => !p.tokens) ? (
          <p className="text-sm text-muted-foreground text-center py-10">Sem consumo registrado no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="agTok" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="label" fontSize={11} tickLine={false} />
              <YAxis fontSize={11} tickLine={false} width={48}
                     tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
              <RTooltip
                formatter={(v, n) => [n === 'tokens' ? fmtTokens(v) : v, n === 'tokens' ? 'Tokens' : 'Execuções']}
                labelFormatter={(l) => `Dia ${l}`}
                contentStyle={{ background: 'var(--cbrio-modal-bg, #0f172a)', border: '1px solid var(--hairline)', borderRadius: 10, fontSize: 12 }} />
              <Area type="monotone" dataKey="tokens" stroke={ACCENT} strokeWidth={2} fill="url(#agTok)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Por agente */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-2 text-muted-foreground">Agentes · últimos 30 dias</h2>
        {perAgent.length === 0 ? (
          <div className="ag-panel p-8 text-center text-sm text-muted-foreground">Nenhuma execução de agente nos últimos 30 dias.</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {perAgent.map((a) => <AgenteCard key={a.agent_type} a={a} />)}
          </div>
        )}
      </div>

      {/* Feeds */}
      <div className={`grid gap-3 ${d?.restrito ? 'md:grid-cols-1' : 'md:grid-cols-3'}`}>
        <div className={d?.restrito ? '' : 'md:col-span-1'}>
          <FeedExecucoes recent={d?.recent || []} />
        </div>
        {!d?.restrito && (
          <>
            <FilaFinanceira fila={d?.fila || []} pendente={d?.filaPendente} />
            <LogChamadas log={d?.log || []} />
          </>
        )}
      </div>

      {d?.restrito && (
        <p className="text-xs text-muted-foreground text-center">
          A fila de aprovação financeira e o log detalhado ficam visíveis para administração/diretoria.
        </p>
      )}
    </div>
  );
}

// ── Componentes ─────────────────────────────────────────────────────────────
function Kpi({ Icon, label, value, sub, cor, pulse }) {
  return (
    <div className="ag-panel p-4" style={{ ['--c']: cor }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="relative">
          {pulse && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: cor }} />}
          <Icon className="h-4 w-4 relative" style={{ color: cor }} />
        </span>
      </div>
      <div className="text-3xl font-extrabold mt-1 ag-num" style={{ color: cor }}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function AgenteCard({ a }) {
  const m = meta(a.agent_type);
  const totalTk = Math.max(1, a.tokens);
  const pctIn = (a.tokensInput / totalTk) * 100;
  return (
    <div className="ag-panel p-4 space-y-3" style={{ ['--c']: m.cor }}>
      <div className="flex items-start gap-3">
        <div className="ag-ico" style={{ ['--c']: m.cor }}><m.Icon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{m.label}</div>
          <p className="text-xs text-muted-foreground truncate">{m.desc}</p>
        </div>
        {a.running > 0 && <span className="ag-chip" style={{ ['--c']: m.cor }}><Loader2 className="h-3 w-3 animate-spin" /> {a.running}</span>}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Mini label="Tokens" value={fmtTokens(a.tokens)} cor={m.cor} />
        <Mini label="Custo" value={fmtCost(a.custo)} cor={m.cor} />
        <Mini label="Execuções" value={a.runs} cor={m.cor} />
      </div>

      {/* barra entrada/saída */}
      <div>
        <div className="ag-bar">
          <div className="ag-bar-in" style={{ width: `${pctIn}%`, background: m.cor }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>entrada {fmtTokens(a.tokensInput)}</span>
          <span>saída {fmtTokens(a.tokensOutput)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2" style={{ borderColor: 'var(--hairline)' }}>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1" style={{ color: '#22c55e' }}><CheckCircle2 className="h-3.5 w-3.5" /> {a.completed}</span>
          {a.failed > 0 && <span className="flex items-center gap-1" style={{ color: '#ef4444' }}><AlertTriangle className="h-3.5 w-3.5" /> {a.failed}</span>}
        </span>
        <span className="flex items-center gap-2">
          {a.avgDurS != null && <span className="flex items-center gap-1"><Timer className="h-3 w-3" /> {fmtDur(a.avgDurS)}</span>}
          <span>{haQuanto(a.lastAt)}</span>
        </span>
      </div>
    </div>
  );
}

function Mini({ label, value, cor }) {
  return (
    <div>
      <div className="text-sm font-bold ag-num" style={{ color: cor }}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function FeedExecucoes({ recent }) {
  return (
    <div className="ag-panel p-4 h-full">
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2"><Activity className="h-4 w-4" style={{ color: ACCENT }} /> Execuções recentes</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">—</p>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {recent.map((r) => {
            const m = meta(r.agent_type);
            const s = STATUS_META[r.status] || STATUS_META.completed;
            return (
              <div key={r.id} className="flex items-start gap-2 text-sm">
                <span className="ag-ico-sm mt-0.5" style={{ ['--c']: m.cor }}><m.Icon className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{m.label}</span>
                    <span className="text-[10px] whitespace-nowrap" style={{ color: s.cor }}>{s.label}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{r.summary || '—'}</span>
                    <span className="whitespace-nowrap ag-num">{fmtTokens(r.tokens)} tk · {haQuanto(r.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilaFinanceira({ fila, pendente }) {
  return (
    <div className="ag-panel p-4 h-full">
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
        <Inbox className="h-4 w-4" style={{ color: '#10b981' }} /> Fila financeira
        {pendente > 0 && <span className="ag-chip" style={{ ['--c']: '#f59e0b' }}>{pendente} pendente{pendente > 1 ? 's' : ''}</span>}
      </h2>
      {fila.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma proposta na fila.</p>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {fila.map((f) => {
            const s = STATUS_META[f.status] || { label: f.status, cor: '#94a3b8' };
            return (
              <div key={f.id} className="text-sm border rounded-lg p-2" style={{ borderColor: 'var(--hairline)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{f.action_label || f.action_type}</span>
                  <span className="text-[10px] whitespace-nowrap" style={{ color: s.cor }}>{s.label}</span>
                </div>
                {f.reasoning && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{f.reasoning}</p>}
                <span className="text-[10px] text-muted-foreground">{haQuanto(f.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LogChamadas({ log }) {
  return (
    <div className="ag-panel p-4 h-full">
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2"><BrainCircuit className="h-4 w-4" style={{ color: '#8b5cf6' }} /> Chamadas de IA</h2>
      {log.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">—</p>
      ) : (
        <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
          {log.map((l, i) => (
            <div key={i} className="flex items-start justify-between gap-2 text-xs">
              <span className="truncate"><b style={{ color: meta(l.agent).cor }}>{meta(l.agent).label}</b> · {l.action}</span>
              <span className="text-muted-foreground whitespace-nowrap">{haQuanto(l.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Estilo HUD (escopo .ag-hud · funciona no tema claro e escuro) ────────────
const HUD_CSS = `
.ag-hud { position: relative; }
.ag-num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; letter-spacing: -0.01em; }
.ag-panel {
  position: relative;
  background: var(--panel, rgba(255,255,255,0.04));
  border: 1px solid var(--hairline, rgba(255,255,255,0.1));
  border-radius: 16px;
  backdrop-filter: blur(12px) saturate(140%);
  box-shadow: var(--shadow, 0 8px 24px rgba(0,0,0,0.18)), var(--hi, inset 0 1px 0 rgba(255,255,255,0.06));
  overflow: hidden;
}
.ag-panel::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--c, ${ACCENT}), transparent);
  opacity: 0.5;
}
.ag-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 10px; color: var(--cbrio-text2, inherit);
  border: 1px solid var(--hairline, rgba(255,255,255,0.12));
  background: var(--panel, rgba(255,255,255,0.04)); transition: all .15s ease;
}
.ag-btn:hover { color: ${ACCENT}; border-color: ${ACCENT}; box-shadow: 0 0 0 3px ${ACCENT}22; }
.ag-ico {
  display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; flex: none;
  color: var(--c, ${ACCENT});
  background: color-mix(in srgb, var(--c, ${ACCENT}) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c, ${ACCENT}) 35%, transparent);
}
.ag-ico-sm {
  display: grid; place-items: center; width: 24px; height: 24px; border-radius: 8px; flex: none;
  color: var(--c, ${ACCENT});
  background: color-mix(in srgb, var(--c, ${ACCENT}) 14%, transparent);
}
.ag-chip {
  display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600;
  padding: 2px 8px; border-radius: 999px; white-space: nowrap;
  color: var(--c, ${ACCENT});
  background: color-mix(in srgb, var(--c, ${ACCENT}) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--c, ${ACCENT}) 40%, transparent);
}
.ag-dot { width: 9px; height: 9px; border-radius: 999px; background: var(--c, ${ACCENT});
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--c, ${ACCENT}) 60%, transparent); animation: agPing 1.6s infinite; }
@keyframes agPing { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c, ${ACCENT}) 55%, transparent); } 70% { box-shadow: 0 0 0 8px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
.ag-live {
  position: relative; overflow: hidden; padding: 14px; border-radius: 14px;
  background: color-mix(in srgb, var(--c, ${ACCENT}) 7%, var(--panel, transparent));
  border: 1px solid color-mix(in srgb, var(--c, ${ACCENT}) 45%, transparent);
  box-shadow: 0 0 22px -6px color-mix(in srgb, var(--c, ${ACCENT}) 55%, transparent);
}
.ag-scan {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--c, ${ACCENT}) 18%, transparent), transparent);
  transform: translateX(-100%); animation: agScan 2.4s ease-in-out infinite;
}
@keyframes agScan { 0% { transform: translateX(-100%); } 60%,100% { transform: translateX(100%); } }
.ag-bar { height: 7px; border-radius: 999px; overflow: hidden; background: var(--track, rgba(148,163,184,0.22)); }
.ag-bar-in { height: 100%; border-radius: 999px; transition: width .4s ease; }
@media (prefers-reduced-motion: reduce) { .ag-scan, .ag-dot { animation: none; } .ag-scan { display: none; } }
`;
