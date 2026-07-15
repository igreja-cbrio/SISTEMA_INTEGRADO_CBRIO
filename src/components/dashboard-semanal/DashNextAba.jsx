import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, Users } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { ChartGradients, gradFill } from '../charts/ChartGradients';

const C = { primary: '#00B39D' };

// Aba simples: quantas pessoas estiveram PRESENTES no NEXT, por mês.
// Presença = inscrição do NEXT com check-in (mesma régua do módulo /next).
export default function DashNextAba() {
  const [meses, setMeses] = useState(12);

  const { data, isLoading } = useQuery({
    queryKey: ['dash-sem', 'next-presenca', meses],
    queryFn: () => api.nextPresencaMensal(meses),
    staleTime: 5 * 60_000,
  });

  const serie = data?.serie || [];
  const total = data?.total || 0;
  const comDado = serie.filter((m) => m.presentes > 0);
  const media = comDado.length ? Math.round(total / comDado.length) : 0;
  const melhor = serie.reduce((a, b) => (b.presentes > (a?.presentes ?? -1) ? b : a), null);

  return (
    <div className="space-y-4 max-w-[1100px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Presença no NEXT · por mês</h2>
          <p className="text-sm text-muted-foreground">
            Quantas pessoas estiveram presentes no NEXT (check-in) em cada mês.
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Período</label>
          <Select value={String(meses)} onValueChange={(v) => setMeses(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
              <SelectItem value="24">Últimos 24 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-2xl font-bold" style={{ color: C.primary }}>{total.toLocaleString('pt-BR')}</p>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
            Total no período
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-2xl font-bold">{media.toLocaleString('pt-BR')}</p>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
            Média por mês (com NEXT)
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-2xl font-bold">
            {melhor && melhor.presentes > 0 ? melhor.presentes.toLocaleString('pt-BR') : '—'}
          </p>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
            Melhor mês {melhor && melhor.presentes > 0 ? `· ${melhor.label}` : ''}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: C.primary }} />
            Presentes no NEXT por mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[360px] flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : total === 0 ? (
            <div className="h-[360px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
              Nenhum check-in de NEXT no período. A presença é registrada no módulo NEXT (check-in da inscrição).
            </div>
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
                  <ChartGradients colors={[C.primary]} />
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,179,157,0.06)' }}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [Number(v).toLocaleString('pt-BR'), 'Presentes']}
                  />
                  <Bar dataKey="presentes" name="Presentes" radius={[6, 6, 0, 0]} animationDuration={800}>
                    {serie.map((_, i) => (
                      <Cell key={i} fill={gradFill(C.primary)} />
                    ))}
                    <LabelList
                      dataKey="presentes"
                      position="top"
                      style={{ fontSize: 11, fontWeight: 600 }}
                      formatter={(v) => (v > 0 ? v : '')}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
