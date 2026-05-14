import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { kpis as kpisApi } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Heart, Sparkles, Loader2, BarChart3, Calendar } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ec4899' };

type Culto = {
  id: string;
  data: string;
  service_type_name?: string | null;
  service_type_color?: string | null;
  decisoes_presenciais?: number | null;
  decisoes_online?: number | null;
};

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const labelMes = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${MESES_PT[parseInt(m, 10) - 1]}/${y.slice(2)}`;
};

type RangeValue = '3m' | '6m' | '12m' | '24m' | '60m';

const RANGE_OPCOES: { value: RangeValue; label: string; meses: number }[] = [
  { value: '3m',  label: 'Últimos 3 meses',  meses: 3 },
  { value: '6m',  label: 'Últimos 6 meses',  meses: 6 },
  { value: '12m', label: 'Últimos 12 meses', meses: 12 },
  { value: '24m', label: 'Últimos 2 anos',   meses: 24 },
  { value: '60m', label: 'Últimos 5 anos',   meses: 60 },
];

function dataInicio(mesesAtras: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - mesesAtras);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function VisualizacaoDecisoes() {
  const [range, setRange] = useState<RangeValue>('12m');

  const { data: cultos = [], isLoading: loading } = useQuery<Culto[]>({
    queryKey: ['integracao', 'cultos-dec', range],
    queryFn: async () => {
      const meses = RANGE_OPCOES.find(r => r.value === range)?.meses ?? 12;
      const inicio = dataInicio(meses);
      const fim = new Date().toISOString().slice(0, 10);
      const d = await kpisApi.cultos.list({ data_inicio: inicio, data_fim: fim, limit: 5000 });
      return Array.isArray(d) ? d : [];
    },
    staleTime: 5 * 60_000,
  });

  const totais = useMemo(() => {
    let presenciais = 0, online = 0;
    let cultosComDecisao = 0;
    cultos.forEach(c => {
      const p = c.decisoes_presenciais || 0;
      const o = c.decisoes_online      || 0;
      presenciais += p;
      online      += o;
      if (p > 0 || o > 0) cultosComDecisao++;
    });
    const total = presenciais + online;
    const mediaPorCulto = cultosComDecisao > 0 ? (total / cultosComDecisao).toFixed(1) : '0';
    return { presenciais, online, total, mediaPorCulto, totalCultos: cultos.length, cultosComDecisao };
  }, [cultos]);

  const porMes = useMemo(() => {
    const map = new Map<string, { mes: string; presenciais: number; online: number }>();
    cultos.forEach(c => {
      const ym = c.data.slice(0, 7);
      const row = map.get(ym) || { mes: labelMes(ym), presenciais: 0, online: 0 };
      row.presenciais += c.decisoes_presenciais || 0;
      row.online      += c.decisoes_online      || 0;
      map.set(ym, row);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [cultos]);

  const porTipo = useMemo(() => {
    const map = new Map<string, { nome: string; cor: string; cultos: number; presenciais: number; online: number }>();
    cultos.forEach(c => {
      const nome = c.service_type_name || 'Sem tipo';
      const cor  = c.service_type_color || C.primary;
      const row = map.get(nome) || { nome, cor, cultos: 0, presenciais: 0, online: 0 };
      row.cultos      += 1;
      row.presenciais += c.decisoes_presenciais || 0;
      row.online      += c.decisoes_online      || 0;
      map.set(nome, row);
    });
    return Array.from(map.values()).sort((a, b) => (b.presenciais + b.online) - (a.presenciais + a.online));
  }, [cultos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30">
          {RANGE_OPCOES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                range === r.value
                  ? 'bg-[#00B39D] text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {totais.totalCultos} culto{totais.totalCultos === 1 ? '' : 's'} no período
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatisticsCard
          title="Total decisões"
          value={totais.total.toLocaleString('pt-BR')}
          icon={Heart}
          iconColor={C.pink}
        />
        <StatisticsCard
          title="Presenciais"
          value={totais.presenciais.toLocaleString('pt-BR')}
          icon={Sparkles}
          iconColor={C.purple}
        />
        <StatisticsCard
          title="Online"
          value={totais.online.toLocaleString('pt-BR')}
          icon={Sparkles}
          iconColor={C.warn}
        />
        <StatisticsCard
          title="Média / culto"
          value={totais.mediaPorCulto}
          icon={BarChart3}
          iconColor={C.primary}
        />
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Decisões por mês
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Total: {totais.total.toLocaleString('pt-BR')}
          </span>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porMes} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(139,92,246,0.08)' }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, name: any) => [`${Number(v).toLocaleString('pt-BR')}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Bar dataKey="presenciais" name="Presenciais" stackId="dec" fill={C.purple} />
                <Bar dataKey="online"      name="Online"      stackId="dec" fill={C.warn} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center space-y-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Por tipo de culto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cultos</TableHead>
                  <TableHead className="text-right">Presenciais</TableHead>
                  <TableHead className="text-right">Online</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Média / culto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porTipo.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      Nenhum dado no período.
                    </TableCell>
                  </TableRow>
                ) : porTipo.map(t => {
                  const total = t.presenciais + t.online;
                  const media = t.cultos > 0 ? (total / t.cultos).toFixed(1) : '0';
                  return (
                    <TableRow key={t.nome}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.cor }} />
                          {t.nome}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.cultos}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.presenciais.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.online.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{total.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-right tabular-nums">{media}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
