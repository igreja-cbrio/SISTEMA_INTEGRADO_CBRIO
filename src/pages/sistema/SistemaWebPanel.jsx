import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Gauge,
  GitCompareArrows,
  Loader2,
  Play,
  Radar,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { sistema as sistemaApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { captureFrontendCanary, isSentryEnabled } from '@/lib/sentry';

const METRIC_META = {
  LCP: { label: 'Carregamento', good: '≤ 2,5s', unit: 'ms' },
  INP: { label: 'Interatividade', good: '≤ 200ms', unit: 'ms' },
  CLS: { label: 'Estabilidade visual', good: '≤ 0,10', unit: '' },
  FCP: { label: 'Primeiro conteúdo', good: '≤ 1,8s', unit: 'ms' },
  TTFB: { label: 'Resposta inicial', good: '≤ 800ms', unit: 'ms' },
};

const STATUS_STYLE = {
  good: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  passed: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  observed: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  configured: 'border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',
  'needs-improvement': 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  warning: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  poor: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  failed: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  missing: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  unknown: 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
};

const STATUS_LABEL = {
  good: 'Bom',
  passed: 'Passou',
  observed: 'Observado',
  configured: 'Configurado',
  'needs-improvement': 'A melhorar',
  warning: 'Atenção',
  poor: 'Ruim',
  failed: 'Falhou',
  missing: 'Ausente',
  unknown: 'Sem dados',
};

function StatusBadge({ status = 'unknown' }) {
  return (
    <Badge variant="outline" className={STATUS_STYLE[status] || STATUS_STYLE.unknown}>
      {STATUS_LABEL[status] || status}
    </Badge>
  );
}

function formatMetric(metric, value) {
  if (value == null) return '—';
  if (metric === 'CLS') return Number(value).toFixed(3);
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

function when(value) {
  if (!value) return 'sem execução';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function SourceUnavailable({ children }) {
  return (
    <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
      <div className="flex items-start gap-3">
        <CircleDashed className="mt-0.5 h-5 w-5 text-amber-500" />
        <p>{children}</p>
      </div>
    </div>
  );
}

function PerformanceBoard({ source }) {
  if (!source?.available || !source.data) {
    return <SourceUnavailable>Core Web Vitals ainda sem fonte. A migration e a publicação do coletor precisam estar ativas.</SourceUnavailable>;
  }
  const performance = source.data;
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Experiência real no navegador</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            p75 de usuários reais, sem identidade, sessão ou query string.
          </p>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {performance.totalSamples.toLocaleString('pt-BR')} amostras · {performance.hours}h
        </div>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
        {Object.entries(METRIC_META).map(([metric, meta]) => {
          const value = performance.metrics?.[metric] || {};
          return (
            <article key={metric} className="bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-semibold tracking-[0.18em] text-primary">{metric}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{meta.label}</p>
                </div>
                <StatusBadge status={value.rating} />
              </div>
              <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums">
                {formatMetric(metric, value.p75)}
              </p>
              <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>{value.samples || 0} amostras</span>
                <span>bom {meta.good}</span>
              </div>
            </article>
          );
        })}
      </div>
      {!!performance.routes?.length && (
        <div className="border-t p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Rotas com amostras ruins</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {performance.routes.slice(0, 8).map((route) => (
              <span key={route.route} className="rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                {route.route} · {route.poor}/{route.samples}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SyntheticBoard({ source, running, onRun }) {
  const latest = useMemo(() => {
    const map = new Map();
    for (const item of source?.data || []) if (!map.has(item.journey_id)) map.set(item.journey_id, item);
    return [...map.values()];
  }, [source]);

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Jornadas sintéticas</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Somente GET em três rotas públicas fixas, sem alterar dados.</p>
        </div>
        <Button size="sm" onClick={onRun} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Executar agora
        </Button>
      </div>
      {!source?.available || !latest.length ? (
        <div className="mt-5"><SourceUnavailable>Nenhuma execução registrada. Após ativar a migration, execute a primeira bateria.</SourceUnavailable></div>
      ) : (
        <div className="mt-5 divide-y rounded-xl border">
          {latest.map((item) => (
            <div key={item.journey_id} className="flex items-center gap-4 p-4">
              {item.status === 'passed'
                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                : <TriangleAlert className="h-5 w-5 text-red-500" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.journey_name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{item.target_path} · {item.duration_ms}ms · {when(item.created_at)}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SecurityBoard({ source }) {
  const security = source?.data;
  const checks = [
    ...(security?.checks || []),
    ...(security?.observed?.headers || []),
  ];
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Postura de segurança</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Configuração conhecida separada de cabeçalhos realmente observados.
      </p>
      {!source?.available || !security ? (
        <div className="mt-5"><SourceUnavailable>A verificação externa não respondeu; o estado permanece desconhecido.</SourceUnavailable></div>
      ) : (
        <div className="mt-5 space-y-2">
          {checks.map((check) => (
            <div key={check.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
              {['missing', 'poor', 'failed'].includes(check.status)
                ? <ShieldX className="h-4 w-4 text-red-500" />
                : <ShieldCheck className="h-4 w-4 text-cyan-600" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{check.label}</p>
                {check.detail && <p className="truncate text-xs text-muted-foreground">{check.detail}</p>}
              </div>
              <StatusBadge status={check.status} />
            </div>
          ))}
          {!security.observed?.available && (
            <p className="pt-2 text-xs text-amber-600">Os cabeçalhos do ambiente público não puderam ser observados nesta leitura.</p>
          )}
        </div>
      )}
    </section>
  );
}

function ReleasesBoard({ source }) {
  const releases = source?.data || [];
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b p-5">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Estabilidade por release</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Erros e Web Vitals correlacionados pelo commit em produção.</p>
      </div>
      {!source?.available || !releases.length ? (
        <div className="p-5"><SourceUnavailable>A comparação começará quando houver amostras com release identificada.</SourceUnavailable></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Release</th>
                <th className="px-4 py-3 font-medium">Último sinal</th>
                <th className="px-4 py-3 font-medium">Amostras</th>
                <th className="px-4 py-3 font-medium">Ruins</th>
                <th className="px-4 py-3 font-medium">Erros API</th>
                <th className="px-4 py-3 font-medium">LCP p75</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {releases.map((release) => (
                <tr key={release.release}>
                  <td className="px-4 py-3 font-mono">{release.shortRelease}</td>
                  <td className="px-4 py-3">{when(release.lastSeen)}</td>
                  <td className="px-4 py-3 tabular-nums">{release.vitalSamples}</td>
                  <td className="px-4 py-3 tabular-nums">{release.poorVitals}</td>
                  <td className="px-4 py-3 tabular-nums">{release.errors}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMetric('LCP', release.lcpP75)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SentryBoard({ source }) {
  const sentry = source?.data;
  const issues = sentry?.issues || [];
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(null);

  useEffect(() => {
    sistemaApi.observabilityStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const testFrontend = () => {
    if (!isSentryEnabled()) return toast.error('Sentry frontend ainda não está configurado.');
    setTesting('frontend');
    const eventId = captureFrontendCanary();
    setTesting(null);
    if (eventId) toast.success(`Canário frontend enviado: ${eventId}`);
    else toast.error('O canário frontend não pôde ser enviado.');
  };

  const testBackend = async () => {
    setTesting('backend');
    try {
      await sistemaApi.runBackendObservabilityCanary();
      toast.error('O backend não produziu o erro canário esperado.');
    } catch (error) {
      if (error?.code === 'SENTRY_CANARY') {
        toast.success(`Canário backend enviado · rastreio ${error.requestId || 'gerado'}`);
      } else {
        toast.error(error?.message || 'Não foi possível executar o canário backend.');
      }
    } finally {
      setTesting(null);
    }
  };
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Sentry · problemas não resolvidos</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Leitura resumida; eventos completos e replays continuam no fornecedor.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ['Captura web', status?.frontendCapture],
          ['Captura API', status?.backendCapture],
          ['Source maps', status?.sourceMaps],
        ].map(([label, ready]) => (
          <div key={label} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span>{label}</span>
            <Badge variant={ready ? 'default' : 'secondary'}>{ready ? 'Ativo' : 'Pendente'}</Badge>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={testFrontend} disabled={!status?.frontendCapture || testing !== null}>
          {testing === 'frontend' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Testar frontend
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={testBackend} disabled={!status?.backendCapture || testing !== null}>
          {testing === 'backend' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Testar backend
        </Button>
        {status?.release && <code className="self-center text-xs text-muted-foreground">release {String(status.release).slice(0, 8)}</code>}
      </div>
      {!source?.available || !sentry?.available ? (
        <div className="mt-5">
          <SourceUnavailable>
            Adaptador ainda não conectado{sentry?.missing?.length ? `: ${sentry.missing.join(', ')}` : '.'}
          </SourceUnavailable>
        </div>
      ) : !issues.length ? (
        <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhum problema não resolvido retornado pelo Sentry.</p>
      ) : (
        <div className="mt-5 space-y-2">
          {issues.slice(0, 8).map((issue) => (
            <div key={`${issue.surface}-${issue.id}`} className="flex items-start gap-3 rounded-lg border p-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 text-orange-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{issue.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {issue.surface} · {issue.count} eventos · {when(issue.lastSeen)}
                </p>
              </div>
              {issue.permalink && (
                <a href={issue.permalink} target="_blank" rel="noreferrer" aria-label="Abrir no Sentry" className="rounded p-1 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function WebOperationsPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await sistemaApi.webCommandCenter(24 * 7)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setRunning(true);
    try {
      const result = await sistemaApi.runWebSynthetics();
      const failed = result.filter((item) => item.status !== 'passed').length;
      if (failed) toast.warning(`${failed} jornada(s) falharam.`);
      else toast.success('As três jornadas públicas passaram.');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Não foi possível executar os testes sintéticos.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (error || !data) {
    return (
      <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-5">
        <div className="flex items-center gap-3">
          <TriangleAlert className="h-5 w-5 text-destructive" />
          <p className="flex-1 text-sm">{error?.message || 'A leitura Web & API não respondeu.'}</p>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Recarregar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-5">
      <PerformanceBoard source={data.performance} />
      <div className="grid gap-5 xl:grid-cols-2">
        <SyntheticBoard source={data.synthetics} running={running} onRun={run} />
        <SecurityBoard source={data.security} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <ReleasesBoard source={data.releases} />
        <SentryBoard source={data.sentry} />
      </div>
    </div>
  );
}
