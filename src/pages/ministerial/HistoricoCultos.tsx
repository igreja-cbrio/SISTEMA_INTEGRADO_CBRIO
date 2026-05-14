import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { integracao as intApi } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Calendar, Users, Heart, Tv, Loader2, BarChart3, Archive, Droplets } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ec4899' };

type HistoricoRow = {
  ano: number;
  service_type_id: string | null;
  service_type_name: string | null;
  service_type_color: string | null;
  total_cultos: number;
  cultos_preenchidos: number;
  presencial_total: number;
  kids_total: number;
  decisoes_presenciais_total: number;
  decisoes_online_total: number;
  online_pico_total: number;
  online_pico_avg: number | null;
  online_ds_total: number;
  online_ddus_total: number;
};

type BatismoAnoRow = { ano: number; total_batismos: number };

type Metrica = 'todos' | 'frequencia' | 'aceitacoes' | 'batismos';

const METRICAS: { value: Metrica; label: string; cor: string }[] = [
  { value: 'todos',      label: 'Todos',      cor: C.primary },
  { value: 'frequencia', label: 'Frequência', cor: C.info },
  { value: 'aceitacoes', label: 'Aceitações', cor: C.purple },
  { value: 'batismos',   label: 'Batismos',   cor: C.primary },
];

export default function HistoricoCultos() {
  const { data, isLoading } = useQuery<HistoricoRow[]>({
    queryKey: ['integracao', 'historico-anual'],
    queryFn: () => intApi.historicoAnual(),
    staleTime: 5 * 60_000,
  });

  const { data: batismosAno = [] } = useQuery<BatismoAnoRow[]>({
    queryKey: ['integracao', 'historico-batismos'],
    queryFn: () => intApi.historicoBatismos(),
    staleTime: 5 * 60_000,
  });

  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');
  const [metrica, setMetrica] = useState<Metrica>('todos');

  const rows = data || [];

  const tiposDisponiveis = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach(r => {
      if (r.service_type_name) set.set(r.service_type_name, r.service_type_color || C.primary);
    });
    return Array.from(set.entries()).map(([nome, cor]) => ({ nome, cor }));
  }, [rows]);

  const rowsFiltrados = useMemo(() => {
    if (tipoFiltro === 'todos') return rows;
    return rows.filter(r => r.service_type_name === tipoFiltro);
  }, [rows, tipoFiltro]);

  // Agrega por ano · adiciona batismos do ano via lookup separado
  const porAno = useMemo(() => {
    const batismosMap = new Map<number, number>();
    batismosAno.forEach(b => batismosMap.set(b.ano, b.total_batismos));

    const map = new Map<number, {
      ano: number;
      presencial: number;
      kids: number;
      decisoes: number;
      batismos: number;
      online: number;
      cultos: number;
    }>();
    rowsFiltrados.forEach(r => {
      const row = map.get(r.ano) || {
        ano: r.ano, presencial: 0, kids: 0, decisoes: 0, batismos: 0, online: 0, cultos: 0,
      };
      row.presencial += r.presencial_total;
      row.kids       += r.kids_total;
      row.decisoes   += r.decisoes_presenciais_total + r.decisoes_online_total;
      row.online     += r.online_pico_total;
      row.cultos     += r.total_cultos;
      map.set(r.ano, row);
    });
    // Quando filtro é "todos", batismos do ano são fixos (não dependem de tipo
    // de culto). Quando filtro é por tipo, batismos seguem visíveis mesmo
    // assim · escolha de design: batismos é série independente.
    for (const row of map.values()) {
      row.batismos = batismosMap.get(row.ano) || 0;
    }
    // Garante anos que só têm batismos (sem cultos) também aparecem
    for (const [ano, total] of batismosMap.entries()) {
      if (!map.has(ano)) {
        map.set(ano, { ano, presencial: 0, kids: 0, decisoes: 0, batismos: total, online: 0, cultos: 0 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ano - b.ano);
  }, [rowsFiltrados, batismosAno]);

  const totais = useMemo(() => {
    let p = 0, k = 0, d = 0, c = 0;
    rowsFiltrados.forEach(r => {
      p += r.presencial_total;
      k += r.kids_total;
      d += r.decisoes_presenciais_total + r.decisoes_online_total;
      c += r.total_cultos;
    });
    const batismosTotal = batismosAno.reduce((s, b) => s + b.total_batismos, 0);
    return { presencial: p, kids: k, decisoes: d, cultos: c, batismos: batismosTotal };
  }, [rowsFiltrados, batismosAno]);

  const anos = useMemo(() => {
    const s = new Set(rows.map(r => r.ano));
    return Array.from(s).sort((a, b) => b - a);
  }, [rows]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Archive className="h-4 w-4" />
          <span>Histórico completo · {anos.length} ano{anos.length === 1 ? '' : 's'} de dados</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatisticsCard title="Cultos no histórico" value={totais.cultos.toLocaleString('pt-BR')} icon={Calendar} iconColor={C.purple} />
        <StatisticsCard title="Frequência total"    value={(totais.presencial + totais.kids).toLocaleString('pt-BR')} icon={Users} iconColor={C.info} />
        <StatisticsCard title="Aceitações totais"   value={totais.decisoes.toLocaleString('pt-BR')} icon={Heart} iconColor={C.pink} />
        <StatisticsCard title="Batismos realizados" value={totais.batismos.toLocaleString('pt-BR')} icon={Droplets} iconColor={C.primary} />
      </div>

      {tiposDisponiveis.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTipoFiltro('todos')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              tipoFiltro === 'todos'
                ? 'bg-[#00B39D]/10 border-[#00B39D] text-[#00B39D]'
                : 'border-border text-muted-foreground hover:border-foreground/30'
            }`}
          >
            Todos ({rows.length} entradas)
          </button>
          {tiposDisponiveis.map(t => (
            <button
              key={t.nome}
              onClick={() => setTipoFiltro(t.nome)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                tipoFiltro === t.nome ? 'text-foreground' : 'text-muted-foreground hover:border-foreground/30'
              }`}
              style={tipoFiltro === t.nome ? { borderColor: t.cor, background: `${t.cor}1a` } : undefined}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: t.cor }} />
              {t.nome}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            {METRICAS.find(m => m.value === metrica)?.label} por ano
          </CardTitle>
          <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30">
            {METRICAS.map(m => (
              <button
                key={m.value}
                onClick={() => setMetrica(m.value)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  metrica === m.value
                    ? 'bg-[#00B39D] text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porAno} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(0,179,157,0.08)' }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, name: any) => [`${Number(v).toLocaleString('pt-BR')}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                {metrica === 'todos' && (
                  <>
                    <Bar dataKey="presencial" name="Presencial" stackId="freq" fill={C.info} />
                    <Bar dataKey="kids"       name="Kids"       stackId="freq" fill={C.pink} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="decisoes"   name="Aceitações" fill={C.purple} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="batismos"   name="Batismos"   fill={C.primary} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="online"     name="Pico online" fill={C.warn} radius={[4, 4, 0, 0]} />
                  </>
                )}
                {metrica === 'frequencia' && (
                  <>
                    <Bar dataKey="presencial" name="Presencial" stackId="freq" fill={C.info} />
                    <Bar dataKey="kids"       name="Kids"       stackId="freq" fill={C.pink} radius={[4, 4, 0, 0]} />
                  </>
                )}
                {metrica === 'aceitacoes' && (
                  <Bar dataKey="decisoes" name="Aceitações" fill={C.purple} radius={[4, 4, 0, 0]} />
                )}
                {metrica === 'batismos' && (
                  <Bar dataKey="batismos" name="Batismos" fill={C.primary} radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Tv className="h-4 w-4 text-muted-foreground" />
            Detalhamento por ano e tipo de culto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ano</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cultos</TableHead>
                  <TableHead className="text-right">Preenchidos</TableHead>
                  <TableHead className="text-right">Presencial</TableHead>
                  <TableHead className="text-right">Kids</TableHead>
                  <TableHead className="text-right">Decisões</TableHead>
                  <TableHead className="text-right">Pico online (média)</TableHead>
                  <TableHead className="text-right">Views D+1</TableHead>
                  <TableHead className="text-right">Views D+7</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                      Nenhum dado no histórico.
                    </TableCell>
                  </TableRow>
                ) : rowsFiltrados.map(r => (
                  <TableRow key={`${r.ano}-${r.service_type_id || 'sem-tipo'}`}>
                    <TableCell className="font-medium">{r.ano}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.service_type_color || C.primary }} />
                        {r.service_type_name || 'Sem tipo'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.total_cultos}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.cultos_preenchidos}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.presencial_total.toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.kids_total.toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right tabular-nums">{(r.decisoes_presenciais_total + r.decisoes_online_total).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.online_pico_avg ? r.online_pico_avg.toLocaleString('pt-BR') : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.online_ds_total.toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.online_ddus_total.toLocaleString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
