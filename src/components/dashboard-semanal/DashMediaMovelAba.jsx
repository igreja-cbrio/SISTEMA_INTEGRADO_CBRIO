import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

const CORES_ANO = ['#1E3A8A', '#E97A3F', '#7C3AED', '#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

// Janelas de média móvel oferecidas por granularidade
const JANELAS = {
  semana: [2, 3, 4, 5, 6, 8, 12],
  mes:    [2, 3, 4, 6],
};

export default function DashMediaMovelAba() {
  const anoAtual = new Date().getFullYear();
  const [culto, setCulto] = useState('todos');
  const [granularidade, setGranularidade] = useState('semana');
  const [janela, setJanela] = useState(2);
  const [anos, setAnos] = useState([anoAtual - 2, anoAtual - 1, anoAtual]);

  // Ao trocar granularidade, garante janela válida pra escala
  useEffect(() => {
    if (!JANELAS[granularidade].includes(janela)) setJanela(2);
  }, [granularidade]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: cultos } = useQuery({
    queryKey: ['dash-sem', 'cultos'],
    queryFn: () => api.cultos(),
    staleTime: 30 * 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dash-sem', 'media-movel', granularidade, culto, janela, anos.join(',')],
    queryFn: () => api.mediaMovel({ granularidade, culto, janela, anos: anos.join(',') }),
    staleTime: 60_000,
  });

  const series = data?.series || [];
  const sufixo = granularidade === 'mes' ? 'meses' : 'semanas';

  // Período selecionado pra comparar entre anos (clique no gráfico ou no select)
  const [periodoSel, setPeriodoSel] = useState(null);

  // Só períodos que têm ao menos um ano com dado
  const periodosComDado = useMemo(
    () => series.filter(r => anos.some(a => r[String(a)] != null)),
    [series, anos]
  );

  // Mantém seleção válida · default = último período com dado
  useEffect(() => {
    if (!periodosComDado.length) { setPeriodoSel(null); return; }
    setPeriodoSel(prev => {
      if (prev != null && periodosComDado.some(r => r.periodo === prev)) return prev;
      return periodosComDado[periodosComDado.length - 1].periodo;
    });
  }, [periodosComDado]);

  const linhaSel = useMemo(
    () => series.find(r => r.periodo === periodoSel) || null,
    [series, periodoSel]
  );

  // Cards comparativos · 1 por ano (ordem do gráfico) com valor + Δ% vs ano
  // anterior comparado que tem dado naquele período.
  const cardsComparativo = useMemo(() => {
    if (!linhaSel) return [];
    return anos.map((ano, idx) => {
      const valor = linhaSel[String(ano)] ?? null;
      let deltaPct = null;
      let baseAno = null;
      for (let j = idx - 1; j >= 0; j--) {
        const prev = linhaSel[String(anos[j])];
        if (valor != null && prev != null && prev !== 0) {
          deltaPct = ((valor - prev) / prev) * 100;
          baseAno = anos[j];
          break;
        }
      }
      return { ano, valor, deltaPct, baseAno, cor: CORES_ANO[idx % CORES_ANO.length] };
    });
  }, [linhaSel, anos]);

  const toggleAno = (a) => {
    setAnos(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a].sort());
  };

  const anosCandidatos = useMemo(() => {
    const arr = [];
    for (let y = anoAtual; y >= anoAtual - 4; y--) arr.push(y);
    return arr;
  }, [anoAtual]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Período</label>
              <Select value={granularidade} onValueChange={setGranularidade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semana">Semanal</SelectItem>
                  <SelectItem value="mes">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Média móvel de
              </label>
              <Select value={String(janela)} onValueChange={v => setJanela(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JANELAS[granularidade].map(j => (
                    <SelectItem key={j} value={String(j)}>{j} {sufixo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Culto</label>
              <Select value={culto} onValueChange={setCulto}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(cultos || []).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Anos comparados</label>
            <div className="flex flex-wrap gap-1.5">
              {anosCandidatos.map(a => (
                <button
                  key={a}
                  onClick={() => toggleAno(a)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    anos.includes(a)
                      ? 'bg-[#00B39D]/10 border-[#00B39D] text-[#00B39D]'
                      : 'border-border text-muted-foreground hover:border-foreground/30'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Média móvel de {janela} {sufixo} · Frequência presencial · comparativo {anos.join(' / ')}
            {isFetching && <Loader2 className="inline h-3.5 w-3.5 ml-2 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[440px] flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : series.length === 0 ? (
            <div className="h-[440px] flex items-center justify-center text-sm text-muted-foreground">
              Sem dados suficientes. Preencha os cultos em /ministerial/integracao.
            </div>
          ) : (
            <div className="h-[440px]" style={{ cursor: 'pointer' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={series}
                  margin={{ top: 16, right: 20, left: 0, bottom: 8 }}
                  onClick={(state) => {
                    const p = state?.activePayload?.[0]?.payload;
                    if (p?.periodo != null) setPeriodoSel(p.periodo);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [v == null ? '—' : Number(v).toLocaleString('pt-BR'), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  {linhaSel && (
                    <ReferenceLine x={linhaSel.label} stroke="#00B39D" strokeDasharray="4 4" strokeWidth={1.5} />
                  )}
                  {anos.map((a, idx) => (
                    <Line
                      key={a}
                      type="monotone"
                      dataKey={String(a)}
                      name={String(a)}
                      stroke={CORES_ANO[idx % CORES_ANO.length]}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                      animationDuration={1000 + idx * 200}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            Cada linha é um ano. A média móvel de {janela} {sufixo} suaviza a frequência presencial:
            cada ponto é a média dos últimos {janela} {sufixo} com dado. A linha vai só até a última{' '}
            {granularidade === 'mes' ? 'mês' : 'semana'} com dado — não cai a zero no futuro.
            {' '}Clique no gráfico (ou escolha abaixo) pra comparar uma {granularidade === 'mes' ? 'mês' : 'semana'} entre os anos.
          </p>
        </CardContent>
      </Card>

      {/* Comparativo entre anos · período selecionado */}
      {periodosComDado.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-sm font-medium">
              Comparativo entre anos {linhaSel ? `· ${linhaSel.label}` : ''}
            </CardTitle>
            <div className="w-[200px]">
              <Select
                value={periodoSel != null ? String(periodoSel) : ''}
                onValueChange={v => setPeriodoSel(Number(v))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {periodosComDado.map(r => (
                    <SelectItem key={r.periodo} value={String(r.periodo)}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className={`grid gap-3 ${
              cardsComparativo.length <= 2 ? 'grid-cols-2'
              : cardsComparativo.length === 3 ? 'grid-cols-3'
              : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5'
            }`}>
              {cardsComparativo.map(c => (
                <div key={c.ano} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />
                    <span className="text-xs font-medium text-muted-foreground">{c.ano}</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums">
                    {c.valor != null ? Number(c.valor).toLocaleString('pt-BR') : '—'}
                  </div>
                  {c.deltaPct != null ? (
                    <div className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                      c.deltaPct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {c.deltaPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {c.deltaPct >= 0 ? '+' : ''}{c.deltaPct.toFixed(1)}%
                      <span className="text-muted-foreground font-normal">vs {c.baseAno}</span>
                    </div>
                  ) : (
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Minus className="h-3.5 w-3.5" />
                      {c.valor != null ? 'base' : 'sem dado'}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Valores da média móvel de {janela} {sufixo} naquele ponto. A variação % compara cada ano
              com o ano anterior selecionado que tem dado na mesma {granularidade === 'mes' ? 'mês' : 'semana'}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
