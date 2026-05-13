import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import { Inbox, CheckCircle2, Percent } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from 'recharts';

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];

const MES_LABEL = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${m}/${y.slice(2)}`;
};

interface InscricoesSummary {
  filtros: { ano: string | null; area: string | null };
  total: { recebidas: number; alocadas: number; taxa: number | null };
  por_area: {
    kids: { recebidas: number; alocadas: number };
    sede: { recebidas: number; alocadas: number };
  };
  meses: Array<{
    mes: string;
    recebidas: number;
    alocadas: number;
    kids_rec: number;
    kids_aloc: number;
    sede_rec: number;
    sede_aloc: number;
    taxa: number | null;
  }>;
}

export default function VolInscricoes() {
  const [ano, setAno] = useState<string>(String(ANO_ATUAL));
  const [area, setArea] = useState<string>('todas');

  const { data, isLoading } = useQuery<InscricoesSummary>({
    queryKey: ['vol', 'inscricoes-summary', ano, area],
    queryFn: () => voluntariado.inscricoesSummary({
      ano,
      area: area === 'todas' ? undefined : area,
    }),
  });

  const chartData = useMemo(() => {
    if (!data?.meses) return [];
    return data.meses.map(m => ({
      mes: MES_LABEL(m.mes),
      Inscritos: m.recebidas,
      Alocados: m.alocadas,
      Taxa: m.taxa,
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  const total = data?.total || { recebidas: 0, alocadas: 0, taxa: null };
  const porArea = data?.por_area || { kids: { recebidas: 0, alocadas: 0 }, sede: { recebidas: 0, alocadas: 0 } };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Inscricoes de Voluntariado</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compara quem se inscreveu (formulario) vs quem foi efetivamente integrado.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas areas</SelectItem>
              <SelectItem value="kids">Kids</SelectItem>
              <SelectItem value="sede">Sede</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 3 cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-blue-500/10 p-3">
              <Inbox className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold">{total.recebidas}</div>
              <div className="text-xs text-muted-foreground">Inscritos no ano</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-green-500/10 p-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold">{total.alocadas}</div>
              <div className="text-xs text-muted-foreground">Voluntarios integrados</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-lg bg-orange-500/10 p-3">
              <Percent className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold">
                {total.taxa !== null ? `${total.taxa}%` : '-'}
              </div>
              <div className="text-xs text-muted-foreground">Taxa de integracao</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown por area */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Por segmento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Kids</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold">{porArea.kids.recebidas}</span>
                <span className="text-sm text-muted-foreground">inscritos</span>
              </div>
              <div className="text-sm">
                {porArea.kids.alocadas} integrados
                {porArea.kids.recebidas > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {Math.round((porArea.kids.alocadas / porArea.kids.recebidas) * 100)}%
                  </Badge>
                )}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Sede</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold">{porArea.sede.recebidas}</span>
                <span className="text-sm text-muted-foreground">inscritos</span>
              </div>
              <div className="text-sm">
                {porArea.sede.alocadas} integrados
                {porArea.sede.recebidas > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {Math.round((porArea.sede.alocadas / porArea.sede.recebidas) * 100)}%
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grafico de barras comparativo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Inscritos vs Integrados por mes</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Sem dados no periodo.
            </div>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Inscritos" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Alocados" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grafico de linha taxa */}
      {chartData.length > 0 && chartData.some(d => d.Taxa !== null) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Taxa de integracao mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: any) => v === null ? '-' : `${v}%`} />
                  <Line type="monotone" dataKey="Taxa" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Detalhe mensal</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Mes</th>
                  <th className="text-right px-4 py-2 font-medium">Inscritos</th>
                  <th className="text-right px-4 py-2 font-medium">Integrados</th>
                  <th className="text-right px-4 py-2 font-medium">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {data?.meses?.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-muted-foreground py-6">Sem dados</td></tr>
                )}
                {data?.meses?.map(m => (
                  <tr key={m.mes} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-medium">{MES_LABEL(m.mes)}</td>
                    <td className="px-4 py-2 text-right">{m.recebidas}</td>
                    <td className="px-4 py-2 text-right">{m.alocadas}</td>
                    <td className="px-4 py-2 text-right">
                      {m.taxa !== null ? `${m.taxa}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
