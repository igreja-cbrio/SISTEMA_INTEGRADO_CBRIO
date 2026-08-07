// ============================================================================
// Analytics do App de Membros · AO VIVO (lançamento) + histórico
// ============================================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { appAnalytics } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Smartphone, Users, Activity, AlertTriangle, Loader2, UserPlus, Radio } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip as RTooltip, CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function haQuanto(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)}min`;
  return format(new Date(iso), "dd/MM HH:mm", { locale: ptBR });
}

export default function AppAnalytics() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Smartphone className="h-6 w-6 text-[#00B39D]" /> Analytics do App</h1>
        <p className="text-sm text-muted-foreground">Acompanhamento ao vivo e histórico de uso do app de membros.</p>
      </div>
      <Tabs defaultValue="aovivo">
        <TabsList>
          <TabsTrigger value="aovivo" className="gap-1.5"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span> Ao Vivo</TabsTrigger>
          <TabsTrigger value="historico">Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="aovivo" className="mt-4"><LivePanel /></TabsContent>
        <TabsContent value="historico" className="mt-4"><AnalyticsHistorico /></TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────── AO VIVO ─────────────────────────
function LivePanel() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const primeira = useRef(true);

  const carregar = useCallback(async () => {
    try {
      const r = await appAnalytics.aoVivo();
      setD(r); setErro(null); setAtualizadoEm(new Date());
    } catch (e) {
      setErro(e?.message || 'Erro');
    } finally {
      primeira.current = false;
    }
  }, []);

  // ⚠️ 15s e não 5s (07/08/2026 · Onda 4). Cada tick roda
  // `fn_app_telemetria_ao_vivo`, que faz ~10 agregações — inclusive `count(*)`
  // em `mem_membros` (3.979 linhas) e em `profiles`. A 5s eram 720 execuções
  // por hora de painel aberto, pra um dado que muda em minutos.
  // ⚠️ E PAUSA com a aba em segundo plano: painel esquecido aberto a noite
  // toda dava ~17 mil execuções sem ninguém olhando — o mesmo padrão do
  // aparelho de teste que gerou 84% dos pings da telemetria.
  useEffect(() => {
    carregar();
    let t = setInterval(carregar, 15000);
    const aoTrocarVisibilidade = () => {
      clearInterval(t);
      if (document.visibilityState === 'visible') {
        carregar();
        t = setInterval(carregar, 15000);
      }
    };
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
    };
  }, [carregar]);

  if (primeira.current && !d) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#00B39D]" /></div>;
  if (erro && !d) return <Card><CardContent className="p-8 text-center text-muted-foreground">{erro}</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-red-500" /> Atualiza a cada 5s {atualizadoEm && `· ${format(atualizadoEm, 'HH:mm:ss')}`}</span>
      </div>

      {/* Números grandes ao vivo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigCard icon={Users} label="Online agora" value={d?.online_5min ?? 0} sub={`${d?.online_1min ?? 0} no último minuto`} cor="#22c55e" pulse />
        <BigCard icon={Smartphone} label="Cadastros no app" value={(d?.cadastros_app_total ?? 0).toLocaleString('pt-BR')} sub={`${(d?.cadastros_total ?? 0).toLocaleString('pt-BR')} na base do sistema`} cor="#00B39D" />
        <BigCard icon={UserPlus} label="Novos hoje (app)" value={d?.cadastros_app_hoje ?? 0} sub={`${d?.cadastros_hoje ?? 0} no sistema`} cor="#3b82f6" />
        <BigCard icon={Activity} label="Eventos (5 min)" value={d?.eventos_5min ?? 0} cor="#8b5cf6" />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {/* Telas em uso agora */}
        <Card>
          <CardHeader><CardTitle className="text-base">Telas em uso agora</CardTitle></CardHeader>
          <CardContent>
            {(d?.telas_agora || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Ninguém ativo no momento.</p>
            ) : (
              <div className="space-y-1.5">
                {d.telas_agora.map((t, i) => (
                  <div key={i} className="flex justify-between text-sm"><span className="truncate">{t.nome}</span><Badge variant="secondary">{t.n}</Badge></div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cadastros recentes (feed) */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4 text-blue-500" /> Cadastros pelo app</CardTitle></CardHeader>
          <CardContent>
            {(d?.cadastros_recentes || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum cadastro pelo app ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {d.cadastros_recentes.map((c, i) => (
                  <div key={i} className="flex justify-between items-center text-sm gap-2">
                    <span className="truncate font-medium">📱 {c.nome}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{haQuanto(c.em)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atividade recente (feed) */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-violet-500" /> Atividade recente</CardTitle></CardHeader>
          <CardContent>
            {(d?.eventos_recentes || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">—</p>
            ) : (
              <div className="space-y-1.5">
                {d.eventos_recentes.map((e, i) => (
                  <div key={i} className="flex justify-between items-center text-sm gap-2">
                    <span className="truncate">{e.tipo === 'erro' ? '⚠️ ' : ''}{e.nome}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{e.plataforma || ''} · {haQuanto(e.em)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BigCard({ icon: Icon, label, value, sub, cor, pulse }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
          <span className="relative">
            {pulse && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: cor }} />}
            <Icon className="h-4 w-4 relative" style={{ color: cor }} />
          </span>
        </div>
        <div className="text-4xl font-extrabold mt-1" style={{ color: cor }}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ───────────────────────── HISTÓRICO ─────────────────────────
const PERIODOS = [{ d: 7, l: '7 dias' }, { d: 14, l: '14 dias' }, { d: 30, l: '30 dias' }];

function AnalyticsHistorico() {
  const [dias, setDias] = useState(14);
  const [data, setData] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try { setData(await appAnalytics.resumo(dias)); }
    catch (e) { setErro(e?.message || 'Erro ao carregar'); }
    finally { setCarregando(false); }
  }, [dias]);
  useEffect(() => { carregar(); }, [carregar]);

  const serie = (data?.por_dia || []).map((p) => ({ ...p, label: format(new Date(p.dia + 'T00:00:00'), 'dd/MM', { locale: ptBR }) }));
  const plataformas = Object.entries(data?.por_plataforma || {});
  const versoes = Object.entries(data?.por_versao || {});

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {PERIODOS.map((p) => (
          <Button key={p.d} size="sm" variant={dias === p.d ? 'default' : 'outline'} className={dias === p.d ? 'bg-[#00B39D] hover:bg-[#009684]' : ''} onClick={() => setDias(p.d)}>{p.l}</Button>
        ))}
      </div>

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#00B39D]" /></div>
      ) : erro ? (
        <Card><CardContent className="p-8 text-center space-y-3"><p className="text-muted-foreground">{erro}</p><Button onClick={carregar}>Tentar de novo</Button></CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigCard icon={Activity} label="Eventos" value={data?.total ?? 0} cor="#00B39D" />
            <BigCard icon={Users} label="Usuários ativos" value={data?.usuarios ?? 0} cor="#3b82f6" />
            <BigCard icon={Smartphone} label="Plataformas" value={plataformas.map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'} cor="#8b5cf6" />
            <BigCard icon={AlertTriangle} label="Erros (período)" value={(data?.erros || []).length} cor={(data?.erros || []).length ? '#ef4444' : '#22c55e'} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Uso por dia</CardTitle></CardHeader>
            <CardContent>
              {serie.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sem dados ainda. Conforme o app for usado, aparece aqui.</p>
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

          <div className="grid md:grid-cols-2 gap-3">
            <ListaTop titulo="Telas mais vistas" itens={data?.top_telas} />
            <ListaTop titulo="Ações mais comuns" itens={data?.top_acoes} vazio="Eventos de ação são adicionados por feature." />
          </div>

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
                        <span className="text-xs text-muted-foreground">{format(new Date(e.em), 'dd/MM HH:mm', { locale: ptBR })} · {e.plataforma || '?'} · v{e.app_version || '?'}</span>
                      </div>
                      {e.props?.message && <div className="text-xs text-muted-foreground mt-1 break-words">{e.props.message}</div>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {versoes.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Versões:</span>
              {versoes.map(([v, n]) => <Badge key={v} variant="secondary" className="text-xs">v{v}: {n}</Badge>)}
            </div>
          )}
        </>
      )}
    </div>
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
                <div className="h-1.5 bg-muted rounded-full mt-0.5"><div className="h-1.5 rounded-full bg-[#00B39D] cbrio-bar" style={{ width: `${(i.n / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
