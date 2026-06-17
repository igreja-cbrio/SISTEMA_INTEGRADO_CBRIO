// ============================================================================
// Analytics do App de Membros · uso (telas/ações) + erros (telemetria)
// ============================================================================
import { useState, useEffect, useCallback } from 'react';
import { appAnalytics } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Users, Activity, AlertTriangle, Loader2 } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip as RTooltip, CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PERIODOS = [{ d: 7, l: '7 dias' }, { d: 14, l: '14 dias' }, { d: 30, l: '30 dias' }];

export default function AppAnalytics() {
  const [dias, setDias] = useState(14);
  const [data, setData] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      setData(await appAnalytics.resumo(dias));
    } catch (e) {
      setErro(e?.message || 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  const serie = (data?.por_dia || []).map((p) => ({
    ...p,
    label: format(new Date(p.dia + 'T00:00:00'), 'dd/MM', { locale: ptBR }),
  }));
  const plataformas = Object.entries(data?.por_plataforma || {});
  const versoes = Object.entries(data?.por_versao || {});

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Smartphone className="h-6 w-6 text-[#00B39D]" /> Analytics do App</h1>
          <p className="text-sm text-muted-foreground">Uso real e erros do app de membros (últimos {dias} dias).</p>
        </div>
        <div className="flex gap-2">
          {PERIODOS.map((p) => (
            <Button key={p.d} size="sm" variant={dias === p.d ? 'default' : 'outline'} className={dias === p.d ? 'bg-[#00B39D] hover:bg-[#009684]' : ''} onClick={() => setDias(p.d)}>{p.l}</Button>
          ))}
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#00B39D]" /></div>
      ) : erro ? (
        <Card><CardContent className="p-8 text-center space-y-3"><p className="text-muted-foreground">{erro}</p><Button onClick={carregar}>Tentar de novo</Button></CardContent></Card>
      ) : (
        <>
          {/* Cards de topo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Activity} label="Eventos" value={data?.total ?? 0} cor="#00B39D" />
            <StatCard icon={Users} label="Usuários ativos" value={data?.usuarios ?? 0} cor="#3b82f6" />
            <StatCard icon={Smartphone} label="Plataformas" value={plataformas.map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'} small cor="#8b5cf6" />
            <StatCard icon={AlertTriangle} label="Erros (período)" value={(data?.erros || []).length} cor={(data?.erros || []).length ? '#ef4444' : '#22c55e'} />
          </div>

          {/* Gráfico uso por dia */}
          <Card>
            <CardHeader><CardTitle className="text-base">Uso por dia</CardTitle></CardHeader>
            <CardContent>
              {serie.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sem dados ainda. Conforme o app for usado, os números aparecem aqui.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} allowDecimals={false} />
                    <RTooltip />
                    <Bar dataKey="eventos" name="Eventos" fill="#00B39D" radius={[4, 4, 0, 0]} />
                    <Line dataKey="usuarios" name="Usuários" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top telas + ações */}
          <div className="grid md:grid-cols-2 gap-3">
            <ListaTop titulo="Telas mais vistas" itens={data?.top_telas} />
            <ListaTop titulo="Ações mais comuns" itens={data?.top_acoes} vazio="Nenhuma ação registrada ainda (eventos são adicionados por feature)." />
          </div>

          {/* Erros recentes */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Erros recentes</CardTitle></CardHeader>
            <CardContent>
              {(data?.erros || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum erro registrado 🎉</p>
              ) : (
                <div className="space-y-2">
                  {data.erros.map((e, i) => (
                    <div key={i} className="text-sm border rounded-md p-2 bg-red-50 dark:bg-red-950/20">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-red-700 dark:text-red-300">{e.nome}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(e.em), "dd/MM HH:mm", { locale: ptBR })} · {e.plataforma || '?'} · v{e.app_version || '?'}</span>
                      </div>
                      {e.props?.message && <div className="text-xs text-muted-foreground mt-1 break-words">{e.props.message}</div>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {versoes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Versões:</span>
              {versoes.map(([v, n]) => <Badge key={v} variant="secondary" className="text-xs">v{v}: {n}</Badge>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, cor, small }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
          <Icon className="h-4 w-4" style={{ color: cor }} />
        </div>
        <div className={small ? 'text-sm font-semibold mt-1' : 'text-3xl font-bold mt-1'} style={{ color: small ? undefined : cor }}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ListaTop({ titulo, itens, vazio }) {
  const max = Math.max(1, ...(itens || []).map((i) => i.n));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent>
        {(!itens || itens.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-6">{vazio || 'Sem dados ainda.'}</p>
        ) : (
          <div className="space-y-1.5">
            {itens.map((i, idx) => (
              <div key={idx} className="text-sm">
                <div className="flex justify-between"><span className="truncate">{i.nome}</span><span className="text-muted-foreground">{i.n}</span></div>
                <div className="h-1.5 bg-muted rounded-full mt-0.5"><div className="h-1.5 rounded-full bg-[#00B39D]" style={{ width: `${(i.n / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
