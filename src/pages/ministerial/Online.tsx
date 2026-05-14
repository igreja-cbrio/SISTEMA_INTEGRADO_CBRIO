import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { online } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Users, Eye, ThumbsUp, MessageSquare, TrendingUp, TrendingDown, ExternalLink,
  Youtube, Loader2, RefreshCw, PlayCircle, Info, Cross, HeartHandshake,
  Clock, HandHelping, Sparkles, AlertCircle, Target,
} from 'lucide-react';
import { toast } from 'sonner';

const VALOR_META: Record<string, { label: string; cor: string; corClara: string; icon: any }> = {
  seguir:        { label: 'Seguir a Jesus',          cor: '#8B5CF6', corClara: 'from-violet-500/15 to-violet-500/5', icon: Cross },
  conectar:      { label: 'Conectar com Pessoas',    cor: '#EC4899', corClara: 'from-pink-500/15 to-pink-500/5',     icon: HeartHandshake },
  investir:      { label: 'Investir Tempo com Deus', cor: '#3B82F6', corClara: 'from-blue-500/15 to-blue-500/5',     icon: Clock },
  servir:        { label: 'Servir em Comunidade',    cor: '#10B981', corClara: 'from-emerald-500/15 to-emerald-500/5', icon: HandHelping },
  generosidade:  { label: 'Viver Generosamente',     cor: '#F59E0B', corClara: 'from-amber-500/15 to-amber-500/5',   icon: Sparkles },
};

const STATUS_INFO: Record<string, { label: string; cor: string; corBg: string }> = {
  no_alvo:  { label: 'No alvo',   cor: 'text-emerald-700 dark:text-emerald-400',  corBg: 'bg-emerald-500' },
  atras:    { label: 'Atrasado',  cor: 'text-amber-700 dark:text-amber-400',      corBg: 'bg-amber-500'   },
  critico:  { label: 'Critico',   cor: 'text-red-700 dark:text-red-400',          corBg: 'bg-red-500'     },
  sem_meta: { label: 'Sem meta',  cor: 'text-muted-foreground',                   corBg: 'bg-gray-400'    },
  sem_dado: { label: 'Sem dado',  cor: 'text-muted-foreground',                   corBg: 'bg-gray-400'    },
};

function formatNumber(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatDelta(n: number | null | undefined) {
  if (n === null || n === undefined) return '';
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatNumber(n)}`;
}

interface Video {
  id: string;
  video_id: string;
  titulo: string;
  thumbnail_url: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  taxa_engajamento: number | null;
  publicado_em: string;
  serie?: { id: string; titulo: string } | null;
}

interface Serie {
  id: string;
  titulo: string;
  descricao: string | null;
  thumbnail_url: string | null;
  total_videos: number;
  videos_publicados: number;
  total_views: number;
  total_likes: number;
  taxa_engajamento_media: number | null;
  ultimo_video_em: string | null;
}

interface MatrizCell {
  kpi_id: string;
  indicador: string;
  status_trajetoria?: string;
  ultimo_valor?: number | null;
  percentual_meta?: number | null;
  checkpoint_meta?: number | null;
}

interface DashboardData {
  canal: {
    channel_id: string;
    channel_title: string;
    channel_thumbnail: string | null;
    subscriber_count: number;
    view_count: number;
    video_count: number;
  } | null;
  delta: { subscriber: number; view: number; video: number } | null;
  top_views_mes: Video[];
  top_engajamento_mes: Video[];
  top_all_time: Video[];
  series: Serie[];
  matriz_online: Record<string, MatrizCell[]>;
}

// ────────────────────────────────────────────────────────────────────────────
// Componentes
// ────────────────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, delta, accentClass }: {
  icon: any; label: string; value: string; delta?: number; accentClass: string;
}) {
  const positive = delta !== undefined && delta > 0;
  return (
    <Card className="overflow-hidden relative group hover:shadow-lg transition-shadow">
      <div className={`absolute inset-0 opacity-50 bg-gradient-to-br ${accentClass}`} />
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between mb-3">
          <div className={`rounded-xl p-2.5 bg-white/80 dark:bg-black/30 backdrop-blur shadow-sm`}>
            <Icon className="h-5 w-5" style={{ color: 'var(--cbrio-primary, #00B39D)' }} />
          </div>
          {delta !== undefined && delta !== 0 && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
              positive ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-gray-500/15 text-muted-foreground'
            }`}>
              {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {formatDelta(delta)}
            </div>
          )}
        </div>
        <div className="text-3xl font-bold leading-tight">{value}</div>
        <div className="text-sm text-muted-foreground mt-1">{label}</div>
        {delta !== undefined && (
          <div className="text-[10px] text-muted-foreground/70 mt-2 uppercase tracking-wide">vs 30 dias atras</div>
        )}
      </CardContent>
    </Card>
  );
}

function VideoCard({ v, rank }: { v: Video; rank: number }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${v.video_id}`}
      target="_blank" rel="noreferrer"
      className="group block rounded-xl border border-border overflow-hidden bg-card hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="relative aspect-video bg-muted overflow-hidden">
        {v.thumbnail_url ? (
          <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-500/10 to-red-700/20">
            <PlayCircle className="h-12 w-12 text-red-500/60" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/80 text-white text-xs font-bold backdrop-blur">
          #{rank}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
          <PlayCircle className="h-8 w-8 text-white" />
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div className="line-clamp-2 text-sm font-medium leading-tight min-h-[2.5rem]">{v.titulo}</div>
        {v.serie && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground line-clamp-1">
            <PlayCircle className="h-3 w-3 shrink-0" />
            <span className="truncate">{v.serie.titulo}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNumber(v.view_count)}</span>
            <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{formatNumber(v.like_count)}</span>
          </div>
          {v.taxa_engajamento !== null && v.taxa_engajamento !== undefined && (
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {v.taxa_engajamento.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

function SerieCard({ s }: { s: Serie }) {
  return (
    <Card className="group overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className="aspect-video bg-muted relative overflow-hidden">
        {s.thumbnail_url ? (
          <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-500/10 to-red-700/20">
            <PlayCircle className="h-14 w-14 text-red-500/60" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-3 right-3">
          <div className="text-white text-sm font-semibold line-clamp-2 drop-shadow-lg">{s.titulo}</div>
        </div>
      </div>
      <CardContent className="p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="font-bold text-lg leading-none">{s.videos_publicados}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">videos</div>
          </div>
          <div className="border-x border-border">
            <div className="font-bold text-lg leading-none">{formatNumber(s.total_views)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">views</div>
          </div>
          <div>
            <div className="font-bold text-lg leading-none text-emerald-600 dark:text-emerald-400">
              {s.taxa_engajamento_media !== null ? `${s.taxa_engajamento_media}%` : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">engaj.</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCard({ kpi }: { kpi: MatrizCell }) {
  const status = kpi.status_trajetoria || 'sem_dado';
  const info = STATUS_INFO[status] || STATUS_INFO.sem_dado;
  const pct = kpi.percentual_meta;
  const pctClamped = pct !== null && pct !== undefined ? Math.max(0, Math.min(100, pct)) : null;

  return (
    <div className="rounded-lg bg-card border border-border p-3 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{kpi.kpi_id}</div>
          <div className="text-xs font-medium leading-tight mt-0.5 line-clamp-2" title={kpi.indicador}>
            {kpi.indicador}
          </div>
        </div>
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${info.cor}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${info.corBg}`} />
          {info.label}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">
            {kpi.ultimo_valor !== null && kpi.ultimo_valor !== undefined
              ? <><span className="font-bold text-foreground text-sm">{kpi.ultimo_valor}</span><span className="text-muted-foreground"> atual</span></>
              : <span className="italic">aguardando dado</span>}
          </span>
          {kpi.checkpoint_meta !== null && kpi.checkpoint_meta !== undefined && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="h-2.5 w-2.5" />
              meta {kpi.checkpoint_meta}
            </span>
          )}
        </div>
        {pctClamped !== null && (
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${info.corBg}`}
              style={{ width: `${pctClamped}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ValorGroupCard({ valor, kpis }: { valor: string; kpis: MatrizCell[] }) {
  const meta = VALOR_META[valor];
  if (!meta) return null;
  const Icon = meta.icon;

  // Resumo de status
  const counts = { no_alvo: 0, atras: 0, critico: 0, outro: 0 };
  kpis.forEach(k => {
    const s = k.status_trajetoria;
    if (s === 'no_alvo') counts.no_alvo++;
    else if (s === 'atras') counts.atras++;
    else if (s === 'critico') counts.critico++;
    else counts.outro++;
  });

  return (
    <div className={`rounded-2xl border border-border overflow-hidden bg-gradient-to-br ${meta.corClara}`}>
      <div className="p-4 flex items-center gap-3 border-b border-border/40">
        <div
          className="rounded-xl p-2.5 shadow-sm"
          style={{ background: meta.cor + '20', color: meta.cor }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold leading-tight">{meta.label}</h3>
          <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px]">
            <span className="text-muted-foreground">{kpis.length} indicador{kpis.length > 1 ? 'es' : ''}</span>
            {counts.no_alvo > 0 && (
              <Badge variant="outline" className="text-[10px] py-0 h-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                {counts.no_alvo} ok
              </Badge>
            )}
            {counts.atras > 0 && (
              <Badge variant="outline" className="text-[10px] py-0 h-4 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                {counts.atras} atras
              </Badge>
            )}
            {counts.critico > 0 && (
              <Badge variant="outline" className="text-[10px] py-0 h-4 bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30">
                {counts.critico} critico
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="p-3 space-y-2">
        {kpis.map((k) => <KpiCard key={k.kpi_id} kpi={k} />)}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pagina
// ────────────────────────────────────────────────────────────────────────────

export default function Online() {
  const { data, isLoading, refetch } = useQuery<DashboardData>({
    queryKey: ['online', 'dashboard'],
    queryFn: () => online.dashboard(),
  });

  const syncMutation = useMutation({
    mutationFn: () => online.sync(),
    onSuccess: () => {
      toast.success('Sincronizacao com YouTube concluida.');
      refetch();
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao sincronizar'),
  });

  const [topTab, setTopTab] = useState<'views' | 'engajamento'>('views');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canal = data?.canal;
  const semDados = !canal;
  const matrizKeys = data?.matriz_online ? Object.keys(data.matriz_online) : [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-500 via-red-600 to-rose-700 text-white shadow-xl">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0%, transparent 50%)'
        }} />
        <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-4 flex-1">
            {canal?.channel_thumbnail ? (
              <img src={canal.channel_thumbnail} alt="" className="w-16 h-16 rounded-full ring-4 ring-white/30 shadow-lg" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur ring-4 ring-white/30 flex items-center justify-center">
                <Youtube className="h-8 w-8" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/80 mb-1">
                <Youtube className="h-3.5 w-3.5" />
                Canal YouTube
              </div>
              <h1 className="text-2xl md:text-3xl font-bold leading-tight">
                {canal?.channel_title || 'CBRio Online'}
              </h1>
              <p className="text-sm text-white/80 mt-1 max-w-md">
                Desempenho do canal e analise por series de pregacao
              </p>
            </div>
          </div>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            variant="secondary"
            size="lg"
            className="gap-2 bg-white text-red-600 hover:bg-white/90 shadow-lg"
          >
            {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar agora
          </Button>
        </div>
      </div>

      {/* Aviso da Alda - mais discreto */}
      <div className="rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-500/5 to-transparent p-3 flex items-start gap-3">
        <div className="rounded-lg bg-blue-500/15 p-1.5 mt-0.5">
          <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="text-xs leading-relaxed">
          <strong className="text-foreground">Modulo somente leitura.</strong>{' '}
          <span className="text-muted-foreground">
            Frequencia online e aceitacoes sao preenchidas pela <strong>Alda Lorena</strong> em{' '}
            <code className="px-1 py-0.5 rounded bg-muted text-[10px]">/ministerial/integracao</code> (aba Cultos).
          </span>
        </div>
      </div>

      {/* Estado vazio - card menor e amigavel */}
      {semDados && (
        <Card className="border-dashed border-2 border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="rounded-2xl bg-amber-500/15 p-4">
              <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold mb-1">Sem dados do YouTube ainda</h2>
              <p className="text-sm text-muted-foreground">
                O cron sincroniza automaticamente as <strong>6h da manha</strong> todo dia.
                Para popular agora, configure <code className="px-1 py-0.5 rounded bg-muted text-xs">YOUTUBE_CHANNEL_ID</code> no Vercel
                e clique em "Sincronizar agora".
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats do canal */}
      {canal && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard icon={Users}       label="Inscritos"            value={formatNumber(canal.subscriber_count)} delta={data?.delta?.subscriber} accentClass="from-red-500/15 to-rose-500/5" />
          <StatCard icon={Eye}         label="Views totais"         value={formatNumber(canal.view_count)}        delta={data?.delta?.view}        accentClass="from-blue-500/15 to-cyan-500/5" />
          <StatCard icon={PlayCircle}  label="Videos publicados"    value={formatNumber(canal.video_count)}       delta={data?.delta?.video}       accentClass="from-emerald-500/15 to-teal-500/5" />
        </div>
      )}

      {/* Top videos */}
      {((data?.top_views_mes?.length || 0) > 0 || (data?.top_engajamento_mes?.length || 0) > 0) && (
        <Card className="overflow-hidden">
          <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-tight">Top videos do mes</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Melhores performances de {new Date().toLocaleDateString('pt-BR', { month: 'long' })}</p>
              </div>
            </div>
            <Tabs value={topTab} onValueChange={(v) => setTopTab(v as any)}>
              <TabsList>
                <TabsTrigger value="views" className="gap-1.5"><Eye className="h-3.5 w-3.5" />Por views</TabsTrigger>
                <TabsTrigger value="engajamento" className="gap-1.5"><ThumbsUp className="h-3.5 w-3.5" />Por engajamento</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <CardContent className="p-4 md:p-5">
            <Tabs value={topTab}>
              <TabsContent value="views" className="mt-0">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {(data?.top_views_mes || []).map((v, i) => (
                    <VideoCard key={v.id} v={v} rank={i + 1} />
                  ))}
                  {data?.top_views_mes?.length === 0 && (
                    <div className="col-span-full text-center text-muted-foreground py-8 text-sm">
                      Sem videos publicados neste mes ainda.
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="engajamento" className="mt-0">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {(data?.top_engajamento_mes || []).map((v, i) => (
                    <VideoCard key={v.id} v={v} rank={i + 1} />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Maiores hits */}
      {(data?.top_all_time?.length || 0) > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 md:p-5 flex items-center gap-3 border-b border-border bg-gradient-to-r from-amber-500/10 to-transparent">
            <div className="rounded-xl bg-amber-500/15 p-2">
              <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Maiores hits do canal</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Top 5 por views de todos os tempos</p>
            </div>
          </div>
          <CardContent className="p-4 md:p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {(data?.top_all_time || []).map((v, i) => (
                <VideoCard key={v.id} v={v} rank={i + 1} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Series */}
      {(data?.series?.length || 0) > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 md:p-5 flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-purple-500/10 to-transparent">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-purple-500/15 p-2">
                <PlayCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-tight">Series de pregacao</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data?.series?.length || 0} serie(s) ativa(s) · ordenadas por views
                </p>
              </div>
            </div>
          </div>
          <CardContent className="p-4 md:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(data?.series || []).map(s => <SerieCard key={s.id} s={s} />)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Matriz Online · KPIs por valor */}
      {matrizKeys.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 md:p-5 flex items-center gap-3 border-b border-border bg-gradient-to-r from-primary/10 to-transparent">
            <div className="rounded-xl bg-primary/15 p-2">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold leading-tight">Indicadores estrategicos do Online</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                KPIs da matriz Valor × Area = Online (do <code className="px-1 py-0.5 rounded bg-muted text-[10px]">/painel</code>)
              </p>
            </div>
          </div>
          <CardContent className="p-4 md:p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {matrizKeys.map(valor => (
                <ValorGroupCard
                  key={valor}
                  valor={valor}
                  kpis={(data?.matriz_online?.[valor] || []) as MatrizCell[]}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer info */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
        <div>Dados sincronizados diariamente as 6h via API do YouTube.</div>
        {canal && (
          <a
            href={`https://www.youtube.com/channel/${canal.channel_id}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            Ver canal no YouTube <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
