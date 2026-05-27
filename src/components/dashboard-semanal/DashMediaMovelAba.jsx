import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { INDICADORES } from '../../pages/DashboardSemanal';

const COR_VALOR = '#CBD5E1';   // valor real (cru) · cinza claro
const COR_CURTA = '#00B39D';   // media movel curta · verde CBRio
const COR_LONGA = '#8b5cf6';   // media movel longa · roxo

// Janelas default por granularidade
const DEFAULTS = {
  semana: { curta: 4, longa: 12 },
  mes:    { curta: 3, longa: 6 },
};
// Opcoes de janela oferecidas
const JANELAS = {
  semana: [2, 3, 4, 6, 8, 12, 26],
  mes:    [2, 3, 6, 12],
};

export default function DashMediaMovelAba() {
  const [indicador, setIndicador] = useState('frequencia');
  const [culto, setCulto] = useState('todos');
  const [granularidade, setGranularidade] = useState('semana');
  const [curta, setCurta] = useState(DEFAULTS.semana.curta);
  const [longa, setLonga] = useState(DEFAULTS.semana.longa);

  // Ao trocar granularidade, volta pros defaults daquela escala
  useEffect(() => {
    setCurta(DEFAULTS[granularidade].curta);
    setLonga(DEFAULTS[granularidade].longa);
  }, [granularidade]);

  const { data: cultos } = useQuery({
    queryKey: ['dash-sem', 'cultos'],
    queryFn: () => api.cultos(),
    staleTime: 30 * 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dash-sem', 'media-movel', granularidade, indicador, culto, curta, longa],
    queryFn: () => api.mediaMovel({ granularidade, indicador, culto, curta, longa }),
    staleTime: 60_000,
  });

  const indDef = INDICADORES.find(i => i.key === indicador);
  const series = data?.series || [];
  const sufixo = granularidade === 'mes' ? 'meses' : 'semanas';

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Indicador</label>
              <Select value={indicador} onValueChange={setIndicador}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INDICADORES.map(i => <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

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
              <label className="text-xs font-medium text-muted-foreground block mb-1">Média curta</label>
              <Select value={String(curta)} onValueChange={v => setCurta(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JANELAS[granularidade].filter(j => j < longa).map(j => (
                    <SelectItem key={j} value={String(j)}>{j} {sufixo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Média longa</label>
              <Select value={String(longa)} onValueChange={v => setLonga(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JANELAS[granularidade].filter(j => j > curta).map(j => (
                    <SelectItem key={j} value={String(j)}>{j} {sufixo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Média móvel · {indDef?.label} ({granularidade === 'mes' ? 'mensal' : 'semanal'})
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
            <div className="h-[440px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 16, right: 20, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [v == null ? '—' : Number(v).toLocaleString('pt-BR'), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line
                    type="monotone" dataKey="valor" name="Valor real"
                    stroke={COR_VALOR} strokeWidth={1.5} dot={false} activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone" dataKey="mm_curta" name={`Média ${curta} ${sufixo}`}
                    stroke={COR_CURTA} strokeWidth={2.5} dot={false} connectNulls
                  />
                  <Line
                    type="monotone" dataKey="mm_longa" name={`Média ${longa} ${sufixo}`}
                    stroke={COR_LONGA} strokeWidth={2.5} strokeDasharray="5 4" dot={false} connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            A linha cinza é o valor real de cada {granularidade === 'mes' ? 'mês' : 'semana'}. As duas
            médias móveis suavizam a tendência: a curta reage mais rápido, a longa mostra o rumo de
            fundo. Quando a curta cruza acima da longa, a tendência está acelerando.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
