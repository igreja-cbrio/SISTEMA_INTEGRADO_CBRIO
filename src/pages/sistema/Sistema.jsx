import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Braces,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GitBranch,
  Layers3,
  Loader2,
  Network,
  RefreshCw,
  ReceiptText,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Workflow,
} from 'lucide-react';
import { sistema as sistemaApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AutomationRunsPanel,
  IncidentsPanel,
  OperationsPanel,
  WebApiPanel,
} from './SistemaV1Panels';
import { WebOperationsPanel } from './SistemaWebPanel';
import { MobileOperationsPanel } from './SistemaMobilePanel';
import { GovernanceOperationsPanel } from './SistemaGovernancePanel';
import { FinanceOperationsPanel } from './SistemaFinancePanel';

const VIEWS = [
  { id: 'overview', label: 'Visão geral', icon: Activity },
  { id: 'web-api', label: 'Web & API', icon: Braces },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
  { id: 'incidents', label: 'Incidentes & feedback', icon: ShieldCheck },
  { id: 'governance', label: 'Governança', icon: Layers3 },
  { id: 'finance', label: 'Custos & relatórios', icon: ReceiptText },
  { id: 'services', label: 'Serviços', icon: Boxes },
  { id: 'jobs', label: 'Automações', icon: Workflow },
  { id: 'integrations', label: 'Integrações', icon: Network },
];

const STATE_LABEL = {
  cataloged: 'Catalogado',
  connected: 'Conectado',
  partial: 'Parcial',
  external_pending: 'Fonte externa pendente',
};

const STATE_STYLE = {
  cataloged: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  connected: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',
  partial: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  external_pending: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
};

function StateBadge({ state }) {
  return (
    <Badge variant="outline" className={STATE_STYLE[state] || STATE_STYLE.external_pending}>
      {STATE_LABEL[state] || state}
    </Badge>
  );
}

function Metric({ label, value, note, icon: Icon }) {
  return (
    <div className="border-l border-white/15 px-4 first:border-l-0 first:pl-0">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
        <Icon className="h-3.5 w-3.5 text-cyan-300" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</div>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  );
}

function EmptyBoundary({ title, children }) {
  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-5 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <h3 className="font-semibold text-amber-950 dark:text-amber-100">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-300">{children}</p>
        </div>
      </div>
    </div>
  );
}

function Overview({ data }) {
  const release = data.release || {};
  const services = data.catalog?.services || [];
  const pending = services.filter((item) => item.state !== 'cataloged').length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
      <section className="rounded-2xl border bg-card">
        <div className="border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Mapa da fundação</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            O que já pode ser verificado sem criar uma nova estrutura de dados.
          </p>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2">
          {[
            ['Acesso', 'Superadmin estrito no frontend e na API', ShieldCheck, true],
            ['Catálogo', `${data.counts.services} serviços e ${data.counts.integrations} integrações`, Boxes, true],
            ['Correlação', 'X-Request-ID em todas as respostas da API', Braces, true],
            ['Releases', release.shortCommit ? `${release.shortCommit} · ${release.branch || 'branch não informada'}` : 'Metadados disponíveis no próximo deploy', GitBranch, !!release.shortCommit],
          ].map(([label, detail, Icon, ready]) => (
            <div key={label} className="bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="rounded-lg border bg-background p-2">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                {ready
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : <Clock3 className="h-4 w-4 text-amber-500" />}
              </div>
              <h3 className="mt-4 text-sm font-semibold">{label}</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-5">
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Ambiente atual</h2>
            <Badge variant="secondary">{release.environment || 'desconhecido'}</Badge>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-t pt-3">
              <dt className="text-muted-foreground">Commit</dt>
              <dd className="font-mono">{release.shortCommit || 'não informado'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-3">
              <dt className="text-muted-foreground">Branch</dt>
              <dd className="truncate font-medium">{release.branch || 'não informada'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-3">
              <dt className="text-muted-foreground">Região</dt>
              <dd className="font-medium">{release.region || 'não informada'}</dd>
            </div>
          </dl>
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Cobertura honesta</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {pending} serviços ainda dependem de adaptadores ou da identificação da stack externa.
            Nenhum estado de saúde é inferido apenas porque um serviço está catalogado.
          </p>
        </section>
      </div>

      <div className="xl:col-span-2">
        <EmptyBoundary title="Próxima fronteira: registro canônico de execuções">
          O catálogo conhece 45 crons e 10 workflows, mas ainda não afirma sucesso ou falha.
          Persistir cada execução exige a migration de <code className="font-mono">system_job_runs</code>.
        </EmptyBoundary>
      </div>
    </div>
  );
}

function Services({ items }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const Icon = item.surface === 'mobile' ? Smartphone : item.surface === 'api' ? Braces : ServerCog;
        return (
          <article key={item.id} className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/40">
            <div className="flex items-start justify-between gap-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
              <StateBadge state={item.state} />
            </div>
            <h3 className="mt-5 font-semibold">{item.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.runtime}</p>
            <p className="mt-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">{item.surface}</p>
          </article>
        );
      })}
    </div>
  );
}

function Jobs({ jobs, workflows }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return jobs;
    return jobs.filter((job) => `${job.path} ${job.category} ${job.schedule}`.toLowerCase().includes(term));
  }, [jobs, query]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Vercel crons</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{jobs.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">GitHub workflows</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{workflows.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Execuções canônicas</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-600">0</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Catálogo de automações</h2>
            <p className="text-sm text-muted-foreground">{rows.length} rotinas visíveis</p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar por rota, categoria ou agenda"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring sm:w-80"
          />
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-4 py-3 font-medium">Rota</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Agenda</th>
                <th className="px-4 py-3 font-medium">Execução</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((job) => (
                <tr key={job.id} className="hover:bg-muted/35">
                  <td className="px-4 py-3 font-mono text-xs">{job.path}</td>
                  <td className="px-4 py-3">{job.category}</td>
                  <td className="px-4 py-3 font-mono text-xs">{job.schedule}</td>
                  <td className="px-4 py-3"><StateBadge state="external_pending" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Integrations({ items }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b p-5">
        <h2 className="font-semibold">Integrações conhecidas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          “Conectado” significa que há integração no código atual; não representa disponibilidade em tempo real.
        </p>
      </div>
      <div className="grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-4 border-b p-4 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate font-medium">{item.name}</p>
              <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">{item.category}</p>
            </div>
            <StateBadge state={item.state} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Sistema() {
  const requestedView = new URLSearchParams(window.location.search).get('view');
  const [view, setView] = useState(VIEWS.some((item) => item.id === requestedView) ? requestedView : 'overview');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await sistemaApi.fundacao());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const selectView = (nextView) => {
    setView(nextView);
    const url = new URL(window.location.href);
    if (nextView === 'overview') url.searchParams.delete('view');
    else url.searchParams.set('view', nextView);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">A fundação do Sistema não respondeu</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {error?.message || 'A resposta da API veio vazia.'}
          {error?.requestId && <> Código de rastreio: <code>{error.requestId}</code>.</>}
        </p>
        <Button className="mt-5" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
      </div>
    );
  }

  const { counts, catalog } = data;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="relative overflow-hidden bg-slate-950 px-4 py-7 text-white md:px-8 md:py-9">
        <div className="absolute inset-y-0 right-0 w-1/3 border-l border-white/5 bg-[linear-gradient(135deg,transparent_25%,rgba(34,211,238,0.06)_25%,rgba(34,211,238,0.06)_50%,transparent_50%,transparent_75%,rgba(34,211,238,0.06)_75%)] bg-[length:24px_24px]" />
        <div className="relative mx-auto max-w-[1600px]">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                <ShieldCheck className="h-4 w-4" />
                Acesso superadmin
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Sistema</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                Centro de controle técnico do ecossistema CBRio. A fundação separa inventário confirmado de saúde observada.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-5">
              <Metric label="Serviços" value={counts.services} note="superfícies" icon={ServerCog} />
              <Metric label="Crons" value={counts.jobs} note="Vercel" icon={Clock3} />
              <Metric label="Workflows" value={counts.workflows} note="GitHub" icon={GitBranch} />
              <Metric label="Integrações" value={counts.integrations} note="inventariadas" icon={Network} />
              <Metric label="Execuções" value={counts.canonicalRuns} note="canônicas" icon={Activity} />
            </div>
          </div>
        </div>
      </header>

      <div className="border-b bg-background">
        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 py-2 md:px-8" aria-label="Seções do Sistema">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectView(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8">
        {view === 'overview' && <><Overview data={data} /><OperationsPanel /></>}
        {view === 'web-api' && <><WebOperationsPanel /><WebApiPanel /></>}
        {view === 'mobile' && <MobileOperationsPanel />}
        {view === 'incidents' && <IncidentsPanel />}
        {view === 'governance' && <GovernanceOperationsPanel />}
        {view === 'finance' && <FinanceOperationsPanel />}
        {view === 'services' && <Services items={catalog.services || []} />}
        {view === 'jobs' && <><AutomationRunsPanel /><Jobs jobs={catalog.jobs || []} workflows={catalog.workflows || []} /></>}
        {view === 'integrations' && <Integrations items={catalog.integrations || []} />}
      </main>
    </div>
  );
}
