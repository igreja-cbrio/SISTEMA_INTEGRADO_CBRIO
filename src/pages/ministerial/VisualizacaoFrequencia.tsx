import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { kpis as kpisApi } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Users, Tv, Loader2, BarChart3, Calendar } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ec4899' };

type Culto = {
  id: string;
  data: string;
  hora?: string;
  service_type_name?: string | null;
  service_type_color?: string | null;
  presencial_adulto?: number | null;
  presencial_kids?: number | null;
  online_pico?: number | null;
  online_ds?: number | null;
  online_ddus?: number | null;
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

export default function VisualizacaoFrequencia() {
  const [range, setRange] = useState<RangeValue>('12m');

  // useQuery: cache de 5 min · trocar 3m↔6m↔12m sem refetch enquanto cache
  // estiver quente. Limit 5000 cobre 5 anos × 7 slots/sem × 52 sem = 1.820.
  const { data: cultos = [], isLoading: loading } = useQuery<Culto[]>({
    queryKey: ['integracao', 'cultos-freq', range],
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
    let presencial = 0, kids = 0, online = 0;
    let cultosComPresencial = 0;
    cultos.forEach(c => {
      const p = c.presencial_adulto || 0;
      const k = c.presencial_kids || 0;
      const o = c.online_pico || 0;
      presencial += p;
      kids += k;
      online += o;
      if (p > 0 || k > 0) cultosComPresencial++;
    });
    const totalPresencial = presencial + kids;
    const mediaPresencial = cultosComPresencial > 0 ? Math.round(totalPresencial / cultosComPresencial) : 0;
    return { presencial, kids, online, totalPresencial, mediaPresencial, totalCultos: cultos.length, cultosComPresencial };
  }, [cultos]);

  // Por mes · presencial (adulto+kids) + online stacked
  const porMes = useMemo(() => {
    const map = new Map<string, { mes: string; presencial: number; kids: number; online: number }>();
    cultos.forEach(c => {
      const ym = c.data.slice(0, 7);
      const row = map.get(ym) || { mes: labelMes(ym), presencial: 0, kids: 0, online: 0 };
      row.presencial += c.presencial_adulto || 0;
      row.kids      += c.presencial_kids   || 0;
      row.online    += c.online_pico       || 0;
      map.set(ym, row);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [cultos]);

  // Por tipo de culto · totais agregados
  const porTipo = useMemo(() => {
    const map = new Map<string, { nome: string; cor: string; cultos: number; presencial: number; kids: number; online: number }>();
    cultos.forEach(c => {
      const nome = c.service_type_name || 'Sem tipo';
      const cor  = c.service_type_color || C.primary;
      const row = map.get(nome) || { nome, cor, cultos: 0, presencial: 0, kids: 0, online: 0 };
      row.cultos     += 1;
      row.presencial += c.presencial_adulto || 0;
      row.kids       += c.presencial_kids   || 0;
      row.online     += c.online_pico       || 0;
      map.set(nome, row);
    });
    return Array.from(map.values()).sort((a, b) => (b.presencial + b.kids + b.online) - (a.presencial + a.kids + a.online));
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
          title="Presencial (adultos)"
          value={totais.presencial.toLocaleString('pt-BR')}
          icon={Users}
          iconColor={C.info}
        />
        <StatisticsCard
          title="Kids"
          value={totais.kids.toLocaleString('pt-BR')}
          icon={Users}
          iconColor={C.pink}
        />
        <StatisticsCard
          title="Pico online (soma)"
          value={totais.online.toLocaleString('pt-BR')}
          icon={Tv}
          iconColor={C.warn}
        />
        <StatisticsCard
          title="Média por culto"
          value={String(totais.mediaPresencial)}
          icon={BarChart3}
          iconColor={C.primary}
        />
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Frequência por mês
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Total: {totais.totalPresencial.toLocaleString('pt-BR')} presenciais
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
                  cursor={{ fill: 'rgba(0,179,157,0.08)' }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, name: any) => [`${Number(v).toLocaleString('pt-BR')}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Bar dataKey="presencial" name="Presencial" stackId="pres" fill={C.info} radius={[0, 0, 0, 0]} />
                <Bar dataKey="kids"       name="Kids"       stackId="pres" fill={C.pink} radius={[4, 4, 0, 0]} />
                <Bar dataKey="online"     name="Pico online" fill={C.warn} radius={[4, 4, 0, 0]} />
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
                  <TableHead className="text-right">Presencial</TableHead>
                  <TableHead className="text-right">Kids</TableHead>
                  <TableHead className="text-right">Online (pico)</TableHead>
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
                  const totalPres = t.presencial + t.kids;
                  const media = t.cultos > 0 ? Math.round(totalPres / t.cultos) : 0;
                  return (
                    <TableRow key={t.nome}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.cor }} />
                          {t.nome}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.cultos}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.presencial.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.kids.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.online.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{media}</TableCell>
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
