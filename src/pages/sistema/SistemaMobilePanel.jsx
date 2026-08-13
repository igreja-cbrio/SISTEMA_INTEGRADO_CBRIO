import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Apple, Bug, ChevronRight, CircleHelp, Clock3, ExternalLink,
  Gauge, Loader2, Network, Radio, RefreshCw, Send, ShieldCheck, Smartphone,
  TriangleAlert, WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { sistema as sistemaApi } from '@/api';
import { Button } from '@/components/ui/button';

const PLATFORM = {
  android: {
    label: 'Android',
    icon: Smartphone,
    accent: 'emerald',
    tab: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200',
    line: 'bg-emerald-400',
  },
  ios: {
    label: 'iOS',
    icon: Apple,
    accent: 'sky',
    tab: 'border-sky-400/50 bg-sky-400/10 text-sky-200',
    line: 'bg-sky-400',
  },
};

const SOURCE_LABEL = {
  connected: 'Conectada',
  partial: 'Parcial',
  external_pending: 'Pendente',
};

const SOURCE_STYLE = {
  connected: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  partial: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  external_pending: 'border-slate-600 bg-slate-800 text-slate-300',
};

function number(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function percent(value) {
  return value === null || value === undefined ? 'Desconhecido' : `${Number(value).toLocaleString('pt-BR')}%`;
}

function ago(value) {
  if (!value) return 'Sem leitura';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`;
  return `há ${Math.floor(minutes / 1440)} d`;
}

function SourceCard({ label, source, detail }) {
  const state = source?.state || 'external_pending';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-100">{label}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SOURCE_STYLE[state]}`}>
          {SOURCE_LABEL[state] || state}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

function Metric({ label, value, note, icon: Icon, unknown = false }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`mt-3 text-2xl font-semibold tabular-nums ${unknown ? 'text-amber-200' : 'text-white'}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

function Unknown({ children }) {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100">
      <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <span>{children}</span>
    </div>
  );
}

function Coverage({ coverage = {}, total = 0 }) {
  const items = [
    ['Sessão', coverage.sessions],
    ['Instalação', coverage.installations],
    ['Build', coverage.builds],
    ['SO', coverage.osVersions],
    ['Dispositivo', coverage.devices],
    ['Duração', coverage.durations],
    ['Rede', coverage.network],
    ['Offline', coverage.offline],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, count]) => {
        const rate = total ? Math.round((Number(count || 0) / total) * 100) : 0;
        return (
          <div key={label} className="rounded-lg border border-slate-800 px-3 py-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{label}</span><span>{rate}%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(rate, 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Versions({ rows = [] }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Adoção de versão e build</h2>
      </div>
      {!rows.length ? (
        <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhuma versão observada no período.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="pb-3">Versão</th><th className="pb-3">Build</th><th className="pb-3 text-right">Usuários</th><th className="pb-3 text-right">Eventos</th><th className="pb-3 text-right">Erros</th><th className="pb-3 text-right">Último sinal</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={`${row.version}-${row.build}`}>
                  <td className="py-3 font-medium">{row.version}</td>
                  <td className="py-3 text-muted-foreground">{row.build}</td>
                  <td className="py-3 text-right tabular-nums">{number(row.users)}</td>
                  <td className="py-3 text-right tabular-nums">{number(row.events)}</td>
                  <td className="py-3 text-right tabular-nums">{number(row.errors)}</td>
                  <td className="py-3 text-right text-muted-foreground">{ago(row.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ErrorFeed({ telemetry = [], sentry }) {
  const sentryIssues = sentry?.issues || [];
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Bug className="h-4 w-4 text-destructive" />
        <h2 className="font-semibold">Falhas e crashes</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Telemetria segura do app e problemas agregados do Sentry.</p>
      <div className="mt-4 space-y-2">
        {sentryIssues.slice(0, 5).map((issue) => (
          <div key={`sentry-${issue.id}`} className="flex items-start gap-3 rounded-lg border p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{issue.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">Sentry · {number(issue.count)} eventos · {ago(issue.lastSeen)}</p>
            </div>
            {issue.permalink && <a href={issue.permalink} target="_blank" rel="noreferrer" aria-label="Abrir no Sentry"><ExternalLink className="h-4 w-4 text-muted-foreground" /></a>}
          </div>
        ))}
        {telemetry.slice(0, 8).map((item) => (
          <div key={`event-${item.id}`} className="flex items-start gap-3 rounded-lg border p-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.fatal ? 'bg-red-500' : 'bg-amber-400'}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.nome}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{item.message}</p>
            </div>
            <span className="text-xs text-muted-foreground">{ago(item.created_at)}</span>
          </div>
        ))}
        {!sentryIssues.length && !telemetry.length && (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhuma falha retornada pelas fontes disponíveis.</p>
        )}
      </div>
    </section>
  );
}

function Signals({ data }) {
  const p = data.performance || {};
  const cards = [
    ['Startup', p.startupSamples ? `${number(p.startupAvgMs)} ms` : 'Desconhecido', `${number(p.startupSamples)} amostras`, Clock3],
    ['Rede/API', number(p.networkFailures), 'falhas instrumentadas', Network],
    ['Autenticação', number(p.authFailures), 'falhas instrumentadas', ShieldCheck],
    ['Push', number(p.pushEvents), 'eventos no dispositivo', Send],
    ['Deep links', number(p.deepLinkEvents), 'aberturas instrumentadas', ChevronRight],
    ['Offline', number(p.offlineEvents), 'eventos reportados', WifiOff],
  ];
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /><h2 className="font-semibold">Jornada e desempenho</h2></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, note, Icon]) => (
          <div key={label} className="rounded-xl border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
            <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MobileOperationsPanel() {
  const [platform, setPlatform] = useState('android');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await sistemaApi.mobileCommandCenter(platform, 14)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [platform]);

  useEffect(() => { load(); }, [load]);

  const refreshReceipts = async () => {
    setRefreshing(true);
    try {
      const result = await sistemaApi.refreshMobilePushReceipts();
      toast.success(`${number(result.checked)} recibo(s) Expo atualizado(s).`);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Não foi possível consultar os recibos Expo.');
    } finally {
      setRefreshing(false);
    }
  };

  const meta = PLATFORM[platform];
  const totalEvents = Number(data?.totals?.events || 0);
  const hasSessions = Number(data?.coverage?.sessions || 0) > 0;
  const latestVersion = useMemo(() => data?.versions?.[0], [data]);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white">
        <div className={`absolute inset-x-0 top-0 h-1 ${meta.line}`} />
        <div className="p-5 md:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Sala de operação mobile</p>
              <h2 className="mt-2 text-2xl font-semibold">Android e iOS, sem misturar sinais</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Uso, estabilidade, releases e entrega de push por plataforma. Ausência de instrumentação aparece como desconhecida — nunca como saudável.
              </p>
            </div>
            <div className="flex rounded-xl border border-slate-800 bg-slate-900/80 p-1" role="tablist" aria-label="Plataforma mobile">
              {Object.entries(PLATFORM).map(([id, config]) => {
                const Icon = config.icon;
                const active = platform === id;
                return (
                  <button key={id} type="button" role="tab" aria-selected={active} onClick={() => setPlatform(id)}
                    className={`flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition ${active ? config.tab : 'border-transparent text-slate-400 hover:text-white'}`}>
                    <Icon className="h-4 w-4" />{config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {!loading && data && (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SourceCard label="Telemetria própria" source={data.sources?.telemetry} detail={`Último evento ${ago(data.lastEventAt)}.`} />
                <SourceCard label="Sentry mobile" source={data.sources?.sentry} detail={data.sources?.sentry?.missing?.length ? `Faltam: ${data.sources.sentry.missing.join(', ')}` : `${number(data.sources?.sentry?.issues?.length)} problemas retornados.`} />
                <SourceCard label={data.sources?.store?.provider || 'Loja'} source={data.sources?.store} detail={data.sources?.store?.note} />
                <SourceCard label="Expo Push" source={data.sources?.expo} detail={`${number(data.sources?.expo?.trackedTickets)} tickets; ${number(data.sources?.expo?.pendingReceipts)} recibos pendentes.`} />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                <p className="text-xs text-slate-500">Janela de 14 dias · última leitura {ago(data.generatedAt)}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white" onClick={refreshReceipts} disabled={refreshing}>
                    {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Recibos Expo
                  </Button>
                  <Button variant="outline" size="sm" className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white" onClick={load}>
                    <RefreshCw className="mr-2 h-4 w-4" />Atualizar
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {loading && <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {!loading && error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <div className="flex items-center gap-3"><TriangleAlert className="h-5 w-5 text-destructive" /><p className="flex-1 text-sm">{error?.message || 'A operação mobile não respondeu.'}</p><Button variant="outline" size="sm" onClick={load}>Tentar novamente</Button></div>
        </div>
      )}
      {!loading && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Usuários ativos" value={number(data.totals?.activeUsers)} note="identidades apenas agregadas" icon={Activity} />
            <Metric label="Sessões" value={hasSessions ? number(data.totals?.sessions) : 'Desconhecido'} note={hasSessions ? 'sessões instrumentadas' : 'session_id ainda ausente'} icon={Radio} unknown={!hasSessions} />
            <Metric label="Crash-free" value={percent(data.totals?.crashFreeSessions)} note="por sessão instrumentada" icon={ShieldCheck} unknown={data.totals?.crashFreeSessions == null} />
            <Metric label="Erros" value={number(data.totals?.errors)} note={`${number(data.totals?.fatalErrors)} marcados como fatais`} icon={Bug} />
            <Metric label="Versão líder" value={latestVersion?.version || 'Desconhecida'} note={latestVersion ? `build ${latestVersion.build}` : 'sem adoção observada'} icon={Smartphone} unknown={!latestVersion} />
          </div>

          {!hasSessions && <Unknown>Crash-free users/sessions, abandono de jornada e estabilidade por sessão dependem do contrato v2 no aplicativo. Até lá, o painel mantém essas leituras como desconhecidas.</Unknown>}

          <section className="rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="font-semibold">Cobertura do contrato v2</h2><p className="mt-1 text-sm text-muted-foreground">Percentual dos {number(totalEvents)} eventos com cada dimensão operacional.</p></div>
              <span className="text-xs text-muted-foreground">{meta.label}</span>
            </div>
            <div className="mt-4"><Coverage coverage={data.coverage} total={totalEvents} /></div>
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <Versions rows={data.versions} />
            <Signals data={data} />
          </div>
          <ErrorFeed telemetry={data.errors} sentry={data.sources?.sentry} />
        </>
      )}
    </div>
  );
}
