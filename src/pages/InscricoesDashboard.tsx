// Aba "Dashboard" do /inscricoes (SPEC-09 · desenho do Marcos 28/07):
// cards com filtros de tempo/área/porta, série temporal de inscrições (ritmo
// da divulgação), comparador de edições (habilitado pelas séries — inclusive
// as DERIVADAS do SPEC-10: batismo/apresentação mensais, Next por turma,
// grupos por temporada) e ranking de eventos. Arrecadação nasce ZERADA até o
// Pix da F3.3 (decisão do Marcos) e acorda sozinha quando houver pagamento.
// Charts: hue único da casa (mesma métrica — identidade fica no rótulo),
// 1 eixo, grid/tooltip do tema vidro global, gradientes via ChartGradients.
import { useEffect, useMemo, useState } from 'react';
import { inscricoesApi as api } from '../api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Loader2, FilterX, TrendingUp, CalendarCheck2, Users, Coins, DoorOpen, Percent } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { gradFill } from '../components/charts/ChartGradients';
import { PORTA_LABEL } from './InscricoesTodas';

const COR = '#00B39D';

const fmtBR = (s: string) => {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y?.slice(2)}`;
};
const fmtMes = (s: string) => {
  const [y, m] = String(s).split('-');
  return m ? `${m}/${y?.slice(2)}` : s;
};
const fmtReais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const SERIE_LABEL: Record<string, string> = {
  'batismo-mensal': 'Batismo (mensal)',
  'apresentacao-mensal': 'Apresentação (mensal)',
  'next-turmas': 'Next (turmas)',
  'grupos-temporadas': 'Grupos (temporadas)',
};

const AREAS_DERIVADAS = ['Sede', 'AMI', 'Bridge', 'Online', 'KIDS', 'Next', 'Grupos', 'Voluntariado'];

function hojeMenosDias(dias: number) {
  const d = new Date(Date.now() - dias * 86400000);
  return d.toISOString().slice(0, 10);
}

function StatTile({ icon: Icon, label, valor, sub }: { icon: any; label: string; valor: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-border p-3 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </div>
      <div className="text-2xl font-extrabold tabular-nums mt-1">{valor}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function InscricoesDashboard({ areas }: { areas: any[] }) {
  const [filtros, setFiltros] = useState({ de: hojeMenosDias(180), ate: '', area: '', porta: '' });
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [serieSel, setSerieSel] = useState<string>('');

  const opcoesArea = useMemo(() => {
    const doCatalogo = (areas || []).map((a: any) => a.nome);
    return [...new Set([...AREAS_DERIVADAS, ...doCatalogo])];
  }, [areas]);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v) p.set(k, v); });
    api.unificadasDashboard(p.toString())
      .then((r: any) => {
        setDados(r);
        setSerieSel(prev => (r.comparador || []).some((s: any) => s.serie === prev) ? prev : (r.comparador?.[0]?.serie || ''));
      })
      .catch(() => toast.error('Erro ao carregar o dashboard'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)]);

  const set = (k: string) => (e: any) => setFiltros(f => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const padraoDe = hojeMenosDias(180);
  const temFiltro = filtros.area || filtros.porta || filtros.ate || filtros.de !== padraoDe;

  const serieComparador = useMemo(
    () => (dados?.comparador || []).find((s: any) => s.serie === serieSel) || null,
    [dados, serieSel],
  );
  const dadosPorta = useMemo(
    () => Object.entries(dados?.por_porta || {})
      .map(([porta, total]) => ({ porta: PORTA_LABEL[porta] || porta, total }))
      .sort((a: any, b: any) => b.total - a.total),
    [dados],
  );

  return (
    <div className="space-y-4">
      <Card className="glass-solid p-4">
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-[11px] text-muted-foreground block">De</label>
            <Input type="date" value={filtros.de} onChange={set('de')} className="h-9 w-36" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block">Até (vazio = hoje)</label>
            <Input type="date" value={filtros.ate} onChange={set('ate')} className="h-9 w-36" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block">Área</label>
            <select value={filtros.area} onChange={set('area')} className="h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
              <option value="">Todas</option>
              {opcoesArea.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block">Porta</label>
            <select value={filtros.porta} onChange={set('porta')} className="h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
              <option value="">Todas</option>
              {Object.entries(PORTA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {temFiltro && (
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setFiltros({ de: padraoDe, ate: '', area: '', porta: '' })}>
              <FilterX className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </Card>

      {loading || !dados ? (
        <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            <StatTile icon={Users} label="Inscrições" valor={dados.cards.inscricoes_total.toLocaleString('pt-BR')} sub="no período · canceladas fora" />
            <StatTile icon={CalendarCheck2} label="Eventos realizados" valor={dados.cards.eventos_realizados} sub="edições com data já passada" />
            <StatTile icon={DoorOpen} label="Média por evento" valor={dados.cards.media_por_evento.toLocaleString('pt-BR')} sub="inscrições ÷ eventos/edições" />
            <StatTile icon={Coins} label="Arrecadação" valor={fmtReais(dados.cards.arrecadacao_centavos)} sub="pagamentos chegam com o Pix (F3.3)" />
            <StatTile icon={Percent} label="Comparecimento"
              valor={dados.cards.comparecimento_pct == null ? '—' : `${dados.cards.comparecimento_pct.toLocaleString('pt-BR')}%`}
              sub={dados.cards.comparecimento_base ? `${dados.cards.comparecimento_base.toLocaleString('pt-BR')} inscrições com check-in medível` : 'nenhuma porta com check-in no recorte'} />
          </div>

          <Card className="glass-solid p-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-primary" /> Inscrições por dia
              <span className="text-[11px] font-normal text-muted-foreground">— o ritmo da divulgação</span>
            </div>
            {dados.serie_diaria.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Sem inscrições no período.</p>
            ) : (
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <AreaChart data={dados.serie_diaria} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="data" tickFormatter={fmtBR} tick={{ fontSize: 11 }} minTickGap={28} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(v: any) => fmtBR(String(v))} formatter={(v: any) => [v, 'inscrições']} />
                    <Area type="monotone" dataKey="total" stroke={COR} strokeWidth={2}
                      fill={gradFill(COR)} dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="glass-solid p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div className="text-sm font-semibold">Edição × edição</div>
                <select value={serieSel} onChange={e => setSerieSel(e.target.value)}
                  className="h-8 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-xs px-2">
                  {(dados.comparador || []).map((s: any) => (
                    <option key={s.serie} value={s.serie}>{SERIE_LABEL[s.serie] || s.serie} · {s.total}</option>
                  ))}
                </select>
              </div>
              {!serieComparador ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Nenhuma série (recorrência) no recorte.</p>
              ) : (
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={serieComparador.edicoes} margin={{ top: 14, right: 8, bottom: 0, left: -18 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="edicao" tickFormatter={fmtMes} tick={{ fontSize: 11 }} interval={0} minTickGap={4} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={(v: any) => fmtMes(String(v))} formatter={(v: any) => [v, 'inscrições']} />
                      <Bar dataKey="total" fill={gradFill(COR)} radius={[4, 4, 0, 0]} maxBarSize={44}>
                        <LabelList dataKey="total" position="top" style={{ fontSize: 11, fill: 'var(--cbrio-text2)' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1.5">Séries derivadas: batismo e apresentação por mês, Next por turma, grupos por temporada — a gestão continua nos módulos.</p>
            </Card>

            <Card className="glass-solid p-4">
              <div className="text-sm font-semibold mb-2">Ranking de eventos</div>
              {(dados.ranking || []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Nenhum evento com inscrição no recorte.</p>
              ) : (
                <div className="space-y-1.5">
                  {dados.ranking.map((r: any, i: number) => {
                    const max = dados.ranking[0]?.total || 1;
                    return (
                      <div key={`${r.rotulo}-${i}`} className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground w-4 text-right tabular-nums shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate" title={r.rotulo}>{r.rotulo}</span>
                            <span className="font-semibold tabular-nums shrink-0">{r.total}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--track,rgba(127,127,127,0.15))] mt-0.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(3, (r.total / max) * 100)}%`, background: COR }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <Card className="glass-solid p-4">
            <div className="text-sm font-semibold mb-2">Inscrições por porta</div>
            <div style={{ width: '100%', height: Math.max(140, dadosPorta.length * 30 + 30) }}>
              <ResponsiveContainer>
                <BarChart data={dadosPorta} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="porta" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [v, 'inscrições']} />
                  <Bar dataKey="total" fill={gradFill(COR)} radius={[0, 4, 4, 0]} maxBarSize={18}>
                    <LabelList dataKey="total" position="right" style={{ fontSize: 11, fill: 'var(--cbrio-text2)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
