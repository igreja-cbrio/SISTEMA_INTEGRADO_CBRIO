import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { online } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Users, Eye, ThumbsUp, MessageSquare, TrendingUp, ExternalLink,
  Youtube, Loader2, RefreshCw, PlayCircle, Info,
} from 'lucide-react';
import { toast } from 'sonner';

const VALOR_LABELS: Record<string, string> = {
  seguir: 'Seguir a Jesus',
  conectar: 'Conectar com Pessoas',
  investir: 'Investir Tempo com Deus',
  servir: 'Servir em Comunidade',
  generosidade: 'Viver Generosamente',
};

const VALOR_CORES: Record<string, string> = {
  seguir: '#8B5CF6',
  conectar: '#EC4899',
  investir: '#3B82F6',
  servir: '#10B981',
  generosidade: '#F59E0B',
};

const STATUS_COR: Record<string, string> = {
  no_alvo: 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10',
  atras: 'text-amber-600 border-amber-500/30 bg-amber-500/10',
  critico: 'text-red-600 border-red-500/30 bg-red-500/10',
  sem_meta: 'text-gray-600 border-gray-500/30 bg-gray-500/10',
  sem_dado: 'text-gray-600 border-gray-500/30 bg-gray-500/10',
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

function VideoCard({ v, badge }: { v: Video; badge?: string }) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${v.video_id}`}
      target="_blank" rel="noreferrer"
      className="block rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow bg-card"
    >
      <div className="relative aspect-video bg-muted">
        {v.thumbnail_url ? (
          <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PlayCircle className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
        {badge && (
          <Badge className="absolute top-2 left-2 bg-black/70 text-white border-0">{badge}</Badge>
        )}
      </div>
      <div className="p-3">
        <div className="line-clamp-2 text-sm font-medium leading-tight mb-2">{v.titulo}</div>
        {v.serie && (
          <div className="text-xs text-muted-foreground line-clamp-1 mb-2">{v.serie.titulo}</div>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNumber(v.view_count)}</span>
          <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{formatNumber(v.like_count)}</span>
          {v.comment_count > 0 && (
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{formatNumber(v.comment_count)}</span>
          )}
          {v.taxa_engajamento !== null && (
            <span className="flex items-center gap-1 ml-auto text-emerald-600 font-medium">
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
    <Card className="overflow-hidden">
      <div className="aspect-video bg-muted relative">
        {s.thumbnail_url ? (
          <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <PlayCircle className="h-12 w-12" />
          </div>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <div className="font-medium text-sm line-clamp-2">{s.titulo}</div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <div className="font-bold text-base">{s.videos_publicados}</div>
            <div className="text-muted-foreground">videos</div>
          </div>
          <div>
            <div className="font-bold text-base">{formatNumber(s.total_views)}</div>
            <div className="text-muted-foreground">views</div>
          </div>
          <div>
            <div className="font-bold text-base">{s.taxa_engajamento_media !== null ? `${s.taxa_engajamento_media}%` : '—'}</div>
            <div className="text-muted-foreground">engaj.</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          {canal?.channel_thumbnail && (
            <img src={canal.channel_thumbnail} alt="" className="w-12 h-12 rounded-full" />
          )}
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Youtube className="h-6 w-6 text-red-600" />
              Online {canal && <span className="text-muted-foreground font-normal text-base">· {canal.channel_title}</span>}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Visao do canal YouTube e analise de series de pregacao.
            </p>
          </div>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          variant="outline"
          className="gap-2"
        >
          {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sincronizar agora
        </Button>
      </div>

      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-3 flex gap-3 text-sm">
          <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
          <div>
            <strong>Modulo somente leitura.</strong> Frequencia online e
            aceitacoes sao preenchidas por <strong>Alda Lorena</strong> em
            <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-xs">/ministerial/integracao</code>
            (aba Cultos). Aqui voce vê o desempenho do canal.
          </div>
        </CardContent>
      </Card>

      {semDados && (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <Youtube className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="font-semibold">Sem dados sincronizados ainda</h2>
            <p className="text-sm text-muted-foreground">
              O cron diario sincroniza automaticamente as 6h da manha. Para popular agora,
              clique em "Sincronizar agora" acima (precisa <code>YOUTUBE_CHANNEL_ID</code> configurada no Vercel).
            </p>
          </CardContent>
        </Card>
      )}

      {canal && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-500/10 p-3"><Users className="h-6 w-6 text-red-600" /></div>
                <div className="flex-1">
                  <div className="text-2xl font-bold">{formatNumber(canal.subscriber_count)}</div>
                  <div className="text-xs text-muted-foreground">Inscritos</div>
                </div>
                {data?.delta?.subscriber !== undefined && (
                  <div className={`text-sm font-medium ${data.delta.subscriber > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {formatDelta(data.delta.subscriber)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-3"><Eye className="h-6 w-6 text-blue-600" /></div>
                <div className="flex-1">
                  <div className="text-2xl font-bold">{formatNumber(canal.view_count)}</div>
                  <div className="text-xs text-muted-foreground">Views totais</div>
                </div>
                {data?.delta?.view !== undefined && (
                  <div className={`text-sm font-medium ${data.delta.view > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {formatDelta(data.delta.view)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-3"><PlayCircle className="h-6 w-6 text-emerald-600" /></div>
                <div className="flex-1">
                  <div className="text-2xl font-bold">{formatNumber(canal.video_count)}</div>
                  <div className="text-xs text-muted-foreground">Videos publicados</div>
                </div>
                {data?.delta?.video !== undefined && (
                  <div className={`text-sm font-medium ${data.delta.video > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {formatDelta(data.delta.video)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top videos do mes · 2 rankings */}
      {(data?.top_views_mes?.length || data?.top_engajamento_mes?.length) ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Top videos do mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={topTab} onValueChange={(v) => setTopTab(v as any)}>
              <TabsList>
                <TabsTrigger value="views">Por views</TabsTrigger>
                <TabsTrigger value="engajamento">Por engajamento</TabsTrigger>
              </TabsList>
              <TabsContent value="views" className="mt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {(data?.top_views_mes || []).map((v, i) => (
                    <VideoCard key={v.id} v={v} badge={`#${i + 1}`} />
                  ))}
                  {data?.top_views_mes?.length === 0 && (
                    <div className="col-span-full text-center text-muted-foreground py-8 text-sm">
                      Sem videos publicados neste mes ainda.
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="engajamento" className="mt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {(data?.top_engajamento_mes || []).map((v, i) => (
                    <VideoCard key={v.id} v={v} badge={`#${i + 1}`} />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}

      {/* Top all-time */}
      {data?.top_all_time?.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Maiores hits do canal (todos os tempos)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {data.top_all_time.map((v, i) => (
                <VideoCard key={v.id} v={v} badge={`#${i + 1}`} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Series */}
      {data?.series?.length ? (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Series de pregacao</CardTitle>
            <span className="text-xs text-muted-foreground">{data.series.length} serie(s) · top 12 por views</span>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.series.map(s => <SerieCard key={s.id} s={s} />)}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Matriz Online · KPIs do area=online agrupados por valor */}
      {data?.matriz_online && Object.keys(data.matriz_online).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Indicadores estrategicos do Online</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              KPIs da matriz Valor × Area onde area = Online (do <code>/painel</code>).
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(data.matriz_online).map(([valor, kpis]) => (
                <div key={valor} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: VALOR_CORES[valor] }}
                    />
                    <h3 className="text-sm font-semibold">{VALOR_LABELS[valor] || valor}</h3>
                    <Badge variant="outline" className="ml-auto text-[10px]">{kpis.length}</Badge>
                  </div>
                  <ul className="space-y-1.5">
                    {kpis.map((k: MatrizCell) => (
                      <li key={k.kpi_id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate" title={k.indicador}>{k.kpi_id} · {k.indicador}</span>
                        {k.status_trajetoria && (
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_COR[k.status_trajetoria] || ''}`}>
                            {k.percentual_meta !== null && k.percentual_meta !== undefined
                              ? `${k.percentual_meta}%`
                              : k.status_trajetoria}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center pt-2">
        Dados sincronizados diariamente as 6h via API do YouTube.
        {canal && <> Ultima coleta: <strong>{new Date().toLocaleDateString('pt-BR')}</strong>.</>}
      </p>

      {/* Footer link pra todos os videos */}
      {canal && (
        <div className="flex justify-center">
          <a
            href={`https://www.youtube.com/channel/${canal.channel_id}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Ver canal no YouTube <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
