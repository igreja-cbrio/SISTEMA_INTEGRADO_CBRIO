import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
  LineChart, Line, AreaChart, Area,
} from 'recharts';
import { INDICADORES } from '../../pages/DashboardSemanal';

const CORES_ANO = ['#1E3A8A', '#E97A3F', '#7C3AED', '#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

export default function DashMensalAba() {
  const anoAtual = new Date().getFullYear();
  const [indicador, setIndicador] = useState('aceitacoes');
  const [culto, setCulto] = useState('todos');
  const [tipoGrafico, setTipoGrafico] = useState('barra'); // barra | linha | area
  const [anos, setAnos] = useState([anoAtual - 2, anoAtual - 1, anoAtual]);
  const [mesesAtivos, setMesesAtivos] = useState([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

  const { data: cultos } = useQuery({
    queryKey: ['dash-sem', 'cultos'],
    queryFn: () => api.cultos(),
    staleTime: 30 * 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dash-sem', 'mensal', anos.join(','), indicador, culto, mesesAtivos.join(',')],
    queryFn: () => api.mensal({
      anos: anos.join(','),
      indicador,
      culto,
      meses: mesesAtivos.join(','),
    }),
    staleTime: 60_000,
  });

  const indDef = INDICADORES.find(i => i.key === indicador);
  const series = data?.series || [];

  const toggleMes = (m) => {
    setMesesAtivos(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m].sort((a, b) => a - b));
  };

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Indicador</label>
              <Select value={indicador} onValueChange={setIndicador}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INDICADORES.map(i => (
                    <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>
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
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Tipo de gráfico</label>
              <div className="inline-flex rounded-lg border p-0.5">
                {['barra', 'linha', 'area'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTipoGrafico(t)}
                    className={`px-3 py-1 text-xs font-medium rounded capitalize transition-colors ${
                      tipoGrafico === t ? 'bg-[#00B39D] text-white' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {isFetching && (
              <div className="flex items-end">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
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
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Meses</label>
              <div className="flex flex-wrap gap-1">
                {MESES.map((nome, idx) => {
                  const m = idx + 1;
                  const ativo = mesesAtivos.includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleMes(m)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                        ativo
                          ? 'bg-[#00B39D] border-[#00B39D] text-white'
                          : 'border-border text-muted-foreground hover:border-foreground/30'
                      }`}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico principal */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {indDef?.label} acumulado por mês · comparativo {anos.join(' / ')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[420px] flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : series.length === 0 ? (
            <div className="h-[420px] flex items-center justify-center text-sm text-muted-foreground">
              Sem dados para os filtros selecionados.
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${tipoGrafico}-${indicador}-${culto}-${anos.join(',')}-${mesesAtivos.join(',')}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="h-[420px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  {tipoGrafico === 'barra' ? (
                    <BarChart data={series} margin={{ top: 24, right: 20, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="mes_nome" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(0,179,157,0.06)' }}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        formatter={(v, name) => [Number(v).toLocaleString('pt-BR'), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      {anos.map((a, idx) => (
                        <Bar
                          key={a}
                          dataKey={String(a)}
                          name={String(a)}
                          fill={CORES_ANO[idx % CORES_ANO.length]}
                          radius={[6, 6, 0, 0]}
                          animationDuration={800 + idx * 150}
                        >
                          <LabelList
                            dataKey={String(a)}
                            position="top"
                            style={{ fontSize: 10, fontWeight: 600 }}
                            formatter={v => (v > 0 ? v : '')}
                          />
                        </Bar>
                      ))}
                    </BarChart>
                  ) : tipoGrafico === 'linha' ? (
                    <LineChart data={series} margin={{ top: 24, right: 20, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="mes_nome" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        formatter={(v, name) => [Number(v).toLocaleString('pt-BR'), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      {anos.map((a, idx) => (
                        <Line
                          key={a}
                          type="monotone"
                          dataKey={String(a)}
                          name={String(a)}
                          stroke={CORES_ANO[idx % CORES_ANO.length]}
                          strokeWidth={3}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                          animationDuration={1100 + idx * 200}
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <AreaChart data={series} margin={{ top: 24, right: 20, left: 0, bottom: 20 }}>
                      <defs>
                        {anos.map((a, idx) => (
                          <linearGradient key={a} id={`g-${a}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CORES_ANO[idx % CORES_ANO.length]} stopOpacity={0.6} />
                            <stop offset="100%" stopColor={CORES_ANO[idx % CORES_ANO.length]} stopOpacity={0.05} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="mes_nome" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        formatter={(v, name) => [Number(v).toLocaleString('pt-BR'), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      {anos.map((a, idx) => (
                        <Area
                          key={a}
                          type="monotone"
                          dataKey={String(a)}
                          name={String(a)}
                          stroke={CORES_ANO[idx % CORES_ANO.length]}
                          fill={`url(#g-${a})`}
                          strokeWidth={2}
                          animationDuration={1100 + idx * 200}
                        />
                      ))}
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </motion.div>
            </AnimatePresence>
          )}
        </CardContent>
      </Card>

      {/* Tabela resumo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Resumo por ano</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Mês</th>
                  {anos.map(a => (
                    <th key={a} className="text-right py-2 px-3 font-medium text-muted-foreground">{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map(r => (
                  <tr key={r.mes} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium capitalize">{r.mes_nome}</td>
                    {anos.map(a => (
                      <td key={a} className="text-right py-2 px-3 tabular-nums">
                        {(r[String(a)] || 0).toLocaleString('pt-BR')}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-semibold bg-muted/40">
                  <td className="py-2 px-2">Total</td>
                  {anos.map(a => (
                    <td key={a} className="text-right py-2 px-3 tabular-nums">
                      {series.reduce((s, r) => s + (r[String(a)] || 0), 0).toLocaleString('pt-BR')}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
