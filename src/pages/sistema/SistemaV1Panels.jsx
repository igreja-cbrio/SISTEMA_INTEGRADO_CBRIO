import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileWarning,
  Loader2,
  MessageSquareWarning,
  Plus,
  RefreshCw,
  ServerCrash,
  ShieldAlert,
  TimerReset,
} from 'lucide-react';
import { toast } from 'sonner';
import { sistema as sistemaApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const ACTIVE_STATUSES = new Set(['novo', 'reconhecido', 'investigando', 'mitigado', 'monitorado']);
const STATUS_LABELS = {
  novo: 'Novo',
  reconhecido: 'Reconhecido',
  investigando: 'Investigando',
  mitigado: 'Mitigado',
  resolvido: 'Resolvido',
  monitorado: 'Monitorado',
  duplicado: 'Duplicado',
  nao_reproduzido: 'Não reproduzido',
  risco_aceito: 'Risco aceito',
};
const NEXT_STATUS = {
  novo: ['reconhecido', 'investigando', 'duplicado', 'nao_reproduzido', 'risco_aceito'],
  reconhecido: ['investigando', 'mitigado', 'duplicado', 'nao_reproduzido', 'risco_aceito'],
  investigando: ['mitigado', 'resolvido', 'duplicado', 'nao_reproduzido', 'risco_aceito'],
  mitigado: ['investigando', 'resolvido'],
  resolvido: ['monitorado', 'investigando'],
  monitorado: ['resolvido', 'investigando'],
  duplicado: [],
  nao_reproduzido: [],
  risco_aceito: [],
};
const SEVERITY_STYLE = {
  info: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  error: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
  critical: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
};

function relativeTime(value) {
  if (!value) return 'sem registro';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes}min`;
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)}h`;
  return `há ${Math.floor(minutes / 1440)}d`;
}

function ErrorState({ error, retry }) {
  return (
    <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
        <div className="flex-1">
          <p className="font-medium">Não foi possível carregar esta leitura operacional.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message || 'A API não respondeu.'}
            {error?.requestId && <> Rastreio: <code>{error.requestId}</code>.</>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={retry}><RefreshCw className="mr-2 h-4 w-4" />Recarregar</Button>
      </div>
    </div>
  );
}

function LoadingBlock() {
  return <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
}

export function OperationsPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await sistemaApi.overview(24)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState error={error} retry={load} />;

  const runs = data.runs?.data || {};
  const slo = runs.slo || {};
  const incidents = data.incidents?.data || {};
  const errors = data.errors?.data || {};
  const feedback = data.feedback?.data || {};
  const pipelines = data.pipelines?.data || [];
  const unavailable = [data.runs, data.incidents, data.errors, data.feedback, data.pipelines]
    .filter((source) => source?.available === false).length;

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-cyan-500" />
            <h2 className="font-semibold">Pulso das últimas 24 horas</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Leitura das fontes atuais; indisponibilidade aparece como desconhecida.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unavailable > 0 && <Badge variant="outline">{unavailable} fontes indisponíveis</Badge>}
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Incidentes ativos', incidents.active ?? '—', `${incidents.critical || 0} críticos`, ShieldAlert],
          ['Falhas da API', errors.total ?? '—', 'respostas 500 capturadas', ServerCrash],
          ['Feedbacks abertos', feedback.active ?? '—', `${feedback.critical || 0} críticos`, MessageSquareWarning],
          ['Execuções registradas', runs.total ?? '—', `${runs.byStatus?.failed || 0} falharam`, Activity],
        ].map(([label, value, note, Icon]) => (
          <div key={label} className="bg-card p-5">
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-4 text-3xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-sm font-medium">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>

      {runs.slo && (
        <div className="border-t p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Confiabilidade e cobertura das automações</h3>
              <p className="mt-1 text-xs text-muted-foreground">Janela de {slo.windowHours}h. Sucesso só conta quando há prova do efeito esperado.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Confiabilidade: {slo.successRatePct ?? '—'}%</Badge>
              <Badge variant="outline">Cobertura de prova: {slo.proofCoveragePct ?? '—'}%</Badge>
              <Badge variant="outline" className={slo.jobsBreached ? SEVERITY_STYLE.critical : SEVERITY_STYLE.info}>{slo.jobsBreached || 0} metas violadas</Badge>
              <Badge variant="outline" className={slo.jobsMissing ? SEVERITY_STYLE.error : SEVERITY_STYLE.info}>{slo.jobsMissing || 0} atrasadas</Badge>
            </div>
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {(slo.items || []).slice(0, 8).map((item) => {
              const stateLabel = { breached: 'meta violada', missing: 'atrasada', at_risk: 'atenção', unproven: 'sem prova', healthy: 'saudável' }[item.state] || item.state;
              const stateStyle = { breached: SEVERITY_STYLE.critical, missing: SEVERITY_STYLE.error, at_risk: SEVERITY_STYLE.warning, unproven: SEVERITY_STYLE.warning, healthy: SEVERITY_STYLE.info }[item.state];
              return (
                <div key={item.jobId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.ownerLabel || 'Responsável não definido'} · {item.runs} execuções · {item.successRatePct ?? '—'}%</p>
                  </div>
                  <Badge variant="outline" className={stateStyle}>{stateLabel}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t p-5">
        <h3 className="text-sm font-semibold">Sinais legados de recência</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {pipelines.map((pipeline) => (
            <div key={pipeline.chave} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{pipeline.label}</p>
                <p className="text-xs text-muted-foreground">{relativeTime(pipeline.ultima)}</p>
              </div>
              <Badge variant="outline" className={
                pipeline.status === 'ok' ? SEVERITY_STYLE.info
                  : pipeline.status === 'atrasado' ? SEVERITY_STYLE.warning
                    : pipeline.status === 'parado' ? SEVERITY_STYLE.critical
                      : ''
              }>
                {pipeline.status}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AutomationRunsPanel() {
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setRuns(await sistemaApi.runs({ limit: 80 })); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState error={error} retry={load} />;
  if (!runs.length) {
    return (
      <div className="mb-5 rounded-xl border border-dashed bg-card p-5">
        <div className="flex items-start gap-3">
          <TimerReset className="mt-0.5 h-5 w-5 text-amber-500" />
          <div>
            <h2 className="font-semibold">Aguardando a primeira execução registrada</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Após a migration e o próximo ciclo dos crons, as execuções aparecerão aqui.
              Resposta HTTP sem prova de efeito entra como “atenção”, não como sucesso.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="mb-5 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="font-semibold">Execuções recentes</h2>
          <p className="text-sm text-muted-foreground">Registro canônico, separado do catálogo</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
      </div>
      <div className="divide-y">
        {runs.slice(0, 20).map((run) => (
          <div key={run.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_110px_110px_100px] sm:items-center">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs">{run.job_id}</p>
              <p className="mt-1 text-xs text-muted-foreground">{relativeTime(run.started_at)}</p>
              {run.owner_label && <p className="mt-1 text-xs text-muted-foreground">Responsavel: {run.owner_label}</p>}
              {(run.error_code || run.request_id) && (
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {[run.error_code, run.request_id].filter(Boolean).join(' / ')}
                </p>
              )}
              {run.runbook_url && (
                <a href={run.runbook_url} className="mt-1 inline-block text-xs text-primary hover:underline">Abrir runbook operacional</a>
              )}
            </div>
            <Badge variant="outline">{run.status}</Badge>
            <span className="text-xs text-muted-foreground">efeito: {run.effect_status}</span>
            <span className="font-mono text-xs">{run.duration_ms ?? 0}ms</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function IncidentForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', severity: 'warning', affected_surface: 'web-api' });

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await sistemaApi.createIncident({ ...form, source_type: 'manual' });
      toast.success('Incidente criado');
      setForm({ title: '', description: '', severity: 'warning', affected_surface: 'web-api' });
      setOpen(false);
      onCreated();
    } catch (error) {
      toast.error(error.message || 'Erro ao criar incidente');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Criar incidente</Button>;
  }

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <label className="text-sm font-medium">O que aconteceu?</label>
          <input
            value={form.title}
            onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
            className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Ex.: sincronização do Wi-Fi parou"
            required
            minLength={3}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Severidade inicial</label>
          <select
            value={form.severity}
            onChange={(event) => setForm((value) => ({ ...value, severity: event.target.value }))}
            className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="info">Informação</option>
            <option value="warning">Atenção</option>
            <option value="error">Erro</option>
            <option value="critical">Crítico</option>
          </select>
        </div>
      </div>
      <label className="mt-4 block text-sm font-medium">Contexto técnico sem dados sensíveis</label>
      <textarea
        value={form.description}
        onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
        className="mt-1.5 min-h-24 w-full rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Impacto, alcance e sinais observados. Não inclua tokens, CPF, telefone ou payloads."
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar incidente</Button>
      </div>
    </form>
  );
}

/**
 * Diagnóstico estruturado que o agente especialista registrou no evento.
 *
 * ⚠️ Renderiza NADA quando não há diagnóstico (evento de triagem, nota humana) —
 * bloco vazio com título faria toda nota parecer diagnóstico faltando.
 * ⚠️ Só LEITURA: decidir o incidente é o `select` de status ao lado; a versão
 * completa desta análise, com filtros, é a aba Diagnósticos do /assistente-ia.
 */
function DiagnosticoDoAgente({ diagnosis }) {
  if (!diagnosis || typeof diagnosis !== 'object') return null;
  const acoes = Array.isArray(diagnosis.recommended_actions) ? diagnosis.recommended_actions.filter(Boolean) : [];
  const validacao = Array.isArray(diagnosis.validation_steps) ? diagnosis.validation_steps.filter(Boolean) : [];
  const evidencias = Array.isArray(diagnosis.evidence) ? diagnosis.evidence.filter(Boolean) : [];
  const pergunta = diagnosis.decision_required === true ? String(diagnosis.decision_question || '').trim() : '';

  return (
    <div className="mt-2 space-y-3 rounded-lg border bg-background/60 p-3">
      {diagnosis.probable_cause && (
        <p className="text-sm"><span className="font-semibold">Causa provável · </span>{diagnosis.probable_cause}</p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {diagnosis.classification && <span>tipo: <strong>{diagnosis.classification}</strong></span>}
        {diagnosis.confidence && <span>confiança: <strong>{diagnosis.confidence}</strong></span>}
        {diagnosis.risk_level && <span>risco: <strong>{diagnosis.risk_level}</strong></span>}
      </div>
      {acoes.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plano de ação sugerido</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">{acoes.map((a, i) => <li key={i}>{a}</li>)}</ol>
        </div>
      )}
      {validacao.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como validar antes de mexer</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">{validacao.map((a, i) => <li key={i}>{a}</li>)}</ol>
        </div>
      )}
      {evidencias.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidências</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{evidencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
      {pergunta && (
        <div className="rounded-md border border-primary/40 bg-primary/10 p-2 text-sm">
          <span className="font-semibold">O agente precisa de uma decisão: </span>{pergunta}
        </div>
      )}
    </div>
  );
}

export function IncidentsPanel() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('ativos');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [eventsByIncident, setEventsByIncident] = useState({});
  const [loadingEvents, setLoadingEvents] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setItems(await sistemaApi.incidents({ limit: 200 })); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => (
    filter === 'todos' ? items
      : filter === 'ativos' ? items.filter((item) => ACTIVE_STATUSES.has(item.status))
        : items.filter((item) => item.severity === filter)
  ), [filter, items]);

  const transition = async (incident, status) => {
    setUpdating(incident.id);
    try {
      const updated = await sistemaApi.updateIncident(incident.id, { status });
      setItems((rows) => rows.map((row) => row.id === updated.id ? updated : row));
      toast.success(`Incidente marcado como ${STATUS_LABELS[status].toLowerCase()}`);
    } catch (err) {
      toast.error(err.message || 'Erro ao atualizar incidente');
    } finally {
      setUpdating(null);
    }
  };

  const toggleTimeline = async (incident) => {
    if (expanded === incident.id) {
      setExpanded(null);
      return;
    }
    setExpanded(incident.id);
    if (eventsByIncident[incident.id]) return;
    setLoadingEvents(incident.id);
    try {
      const events = await sistemaApi.incidentEvents(incident.id);
      setEventsByIncident((current) => ({ ...current, [incident.id]: events }));
    } catch (err) {
      toast.error(err.message || 'Erro ao carregar a analise do incidente');
    } finally {
      setLoadingEvents(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Incidentes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Do primeiro sinal ao monitoramento pós-resolução.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-700">Agente ativo · 5 min</Badge>
          <IncidentForm onCreated={load} />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {[
          ['ativos', 'Ativos'],
          ['critical', 'Críticos'],
          ['error', 'Erros'],
          ['todos', 'Todos'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${filter === id ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <LoadingBlock /> : error ? <ErrorState error={error} retry={load} /> : (
        <section className="overflow-hidden rounded-xl border bg-card">
          {filtered.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <h3 className="mt-3 font-semibold">Nenhum incidente neste recorte</h3>
              <p className="mt-1 text-sm text-muted-foreground">Novos sinais podem ser convertidos em incidente nas abas Web & API e Automações.</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((incident) => (
                <article key={incident.id} className="p-4 md:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={SEVERITY_STYLE[incident.severity]}>{incident.severity}</Badge>
                        <Badge variant="secondary">{STATUS_LABELS[incident.status] || incident.status}</Badge>
                        <span className="text-xs text-muted-foreground">{incident.source_type}</span>
                      </div>
                      <h3 className="mt-3 font-semibold">{incident.title}</h3>
                      {incident.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{incident.description}</p>}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Aberto {relativeTime(incident.created_at)}
                        {incident.request_id && <> · rastreio <code>{incident.request_id}</code></>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => toggleTimeline(incident)}>
                        {expanded === incident.id ? 'Ocultar análise' : 'Ver análise'}
                      </Button>
                      {NEXT_STATUS[incident.status]?.length > 0 && (
                        <select
                          aria-label={`Atualizar status de ${incident.title}`}
                          value=""
                          disabled={updating === incident.id}
                          onChange={(event) => event.target.value && transition(incident, event.target.value)}
                          className="h-9 rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="">Atualizar status…</option>
                          {NEXT_STATUS[incident.status].map((status) => (
                            <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                          ))}
                        </select>
                      )}
                      {updating === incident.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                  </div>
                  {expanded === incident.id && (
                    <div className="mt-4 rounded-xl border bg-muted/30 p-4">
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div><span className="text-muted-foreground">Impacto</span><p className="mt-1">{incident.impact_summary || 'Em avaliação'}</p></div>
                        <div><span className="text-muted-foreground">Responsável</span><p className="mt-1">{incident.owner_email || 'Tecnologia · triagem automática'}</p></div>
                      </div>
                      <div className="mt-4 border-t pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linha do tempo</p>
                        {loadingEvents === incident.id ? <Loader2 className="mt-3 h-4 w-4 animate-spin" /> : (
                          <div className="mt-3 space-y-3">
                            {(eventsByIncident[incident.id] || []).map((event) => (
                              <div key={event.id} className="flex gap-3 text-sm">
                                <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
                                <div className="min-w-0 flex-1">
                                  <p>{event.message || (String(event.from_status || '') + ' → ' + String(event.to_status || ''))}</p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">{event.actor_email || 'sistema'} · {relativeTime(event.created_at)}</p>
                                  {/* ⚠️ O diagnóstico do agente vinha nesta resposta e era
                                      DESCARTADO — a tela mostrava só a 1ª frase do `message`
                                      e o plano de ação nunca chegava a ninguém (27/08/2026). */}
                                  <DiagnosticoDoAgente diagnosis={event.metadata?.diagnosis} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SignalRow({ item, type, onIncident }) {
  const severity = type === 'error'
    ? (item.status >= 500 ? 'error' : 'warning')
    : ({ critica: 'critical', alta: 'error', media: 'warning', baixa: 'info' }[item.severidade] || 'warning');
  const title = type === 'error'
    ? `${item.metodo || 'HTTP'} ${item.rota || 'rota não informada'}`
    : item.mensagem;
  const detail = type === 'error' ? item.mensagem : `${item.tipo} · ${item.rota || item.modulo || 'sem rota'}`;

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={SEVERITY_STYLE[severity]}>{severity}</Badge>
          <span className="text-xs text-muted-foreground">{relativeTime(item.created_at)}</span>
        </div>
        <p className="mt-2 truncate font-medium">{title}</p>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{detail}</p>
        {item.request_id && <p className="mt-1 font-mono text-xs text-muted-foreground">{item.request_id}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={() => onIncident(item, severity)}>
        <AlertCircle className="mr-2 h-4 w-4" />Criar incidente
      </Button>
    </div>
  );
}

export function WebApiPanel() {
  const [tab, setTab] = useState('errors');
  const [errors, setErrors] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [errorRows, feedbackRows] = await Promise.all([
        sistemaApi.webErrors(150),
        sistemaApi.feedback({ limit: 150 }),
      ]);
      setErrors(errorRows);
      setFeedback(feedbackRows);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const createIncident = async (item, severity) => {
    const isError = tab === 'errors';
    try {
      await sistemaApi.createIncident({
        title: isError ? `${item.metodo || 'HTTP'} ${item.rota || 'Falha da API'}` : item.mensagem.slice(0, 180),
        description: isError ? item.mensagem : `Feedback ${item.tipo} em ${item.rota || item.modulo || 'rota não informada'}`,
        severity,
        source_type: isError ? 'server_error' : 'feedback',
        source_ref: String(item.id),
        request_id: item.request_id,
        affected_surface: isError ? 'web-api' : (item.modulo || 'web'),
      });
      toast.success('Sinal convertido em incidente');
    } catch (error) {
      toast.error(error.message || 'Erro ao criar incidente');
    }
  };

  const rows = tab === 'errors' ? errors : feedback;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Web & API</h2>
          <p className="mt-1 text-sm text-muted-foreground">Falhas técnicas e relatos humanos no mesmo fluxo de triagem.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => setTab('errors')} className={`rounded-xl border p-4 text-left ${tab === 'errors' ? 'border-primary bg-primary/5' : 'bg-card'}`}>
          <ServerCrash className="h-5 w-5 text-orange-500" />
          <p className="mt-3 text-2xl font-semibold tabular-nums">{errors.length}</p>
          <p className="text-sm font-medium">Falhas recentes da API</p>
        </button>
        <button type="button" onClick={() => setTab('feedback')} className={`rounded-xl border p-4 text-left ${tab === 'feedback' ? 'border-primary bg-primary/5' : 'bg-card'}`}>
          <FileWarning className="h-5 w-5 text-cyan-500" />
          <p className="mt-3 text-2xl font-semibold tabular-nums">{feedback.length}</p>
          <p className="text-sm font-medium">Feedbacks recebidos</p>
        </button>
      </div>

      {loading ? <LoadingBlock /> : loadError ? <ErrorState error={loadError} retry={load} /> : (
        <section className="overflow-hidden rounded-xl border bg-card">
          {rows.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-3 font-semibold">Nenhum sinal neste recorte</p>
            </div>
          ) : (
            <div className="max-h-[620px] divide-y overflow-auto">
              {rows.map((item) => (
                <SignalRow key={`${tab}-${item.id}`} item={item} type={tab === 'errors' ? 'error' : 'feedback'} onIncident={createIncident} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
