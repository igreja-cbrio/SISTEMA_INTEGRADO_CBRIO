import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { kpis as kpisApi } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Users, Tv, Loader2, BarChart3, Calendar, Armchair } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6', pink: '#ec4899' };

// Capacidade de assentos · usado pro % de ocupacao media.
// Templo = 1050 lugares (Domingo, Quarta, AMI) · Kids = 250.
const CAP_TEMPLO = 1050;
const CAP_KIDS = 250;

// Bridge e Online nao acontecem no templo → ficam de fora da ocupacao.
// (Online nem e tipo de culto · so sai de graca por usarmos presencial.)
const ehBridge = (nome: string) => /bridge/i.test(nome);
const ehOnline = (nome: string) => /online/i.test(nome);
const foraDoTemplo = (nome: string) => ehBridge(nome) || ehOnline(nome);

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
  // Card de ocupacao · modo (templo/kids) + filtro por culto
  const [modoOcup, setModoOcup] = useState<'templo' | 'kids'>('templo');
  const [cultoOcup, setCultoOcup] = useState<string>('todos');

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

  // Tipos de culto elegiveis pro seletor de ocupacao (exclui Bridge/Online).
  // No modo Kids, so os tipos que tem presenca de kids registrada no periodo.
  const tiposOcup = useMemo(() => {
    const m = new Map<string, number>();
    cultos.forEach(c => {
      const nome = c.service_type_name || 'Sem tipo';
      if (foraDoTemplo(nome)) return;
      const val = modoOcup === 'templo' ? (c.presencial_adulto || 0) : (c.presencial_kids || 0);
      m.set(nome, (m.get(nome) || 0) + val);
    });
    return Array.from(m.entries())
      .filter(([, soma]) => modoOcup === 'templo' || soma > 0)
      .map(([nome]) => nome)
      .sort();
  }, [cultos, modoOcup]);

  // % medio de assentos ocupados · media da presenca por culto ÷ capacidade.
  // Conta so cultos com presenca lancada (>0) no modo escolhido · culto sem
  // dado nao derruba a media. Capacidade: Templo 1050 · Kids 250.
  const ocupacao = useMemo(() => {
    const cap = modoOcup === 'templo' ? CAP_TEMPLO : CAP_KIDS;
    const alvo = (cultoOcup === 'todos' || tiposOcup.includes(cultoOcup)) ? cultoOcup : 'todos';
    const valores: number[] = [];
    cultos.forEach(c => {
      const nome = c.service_type_name || 'Sem tipo';
      if (foraDoTemplo(nome)) return;
      if (alvo !== 'todos' && nome !== alvo) return;
      const val = modoOcup === 'templo' ? (c.presencial_adulto || 0) : (c.presencial_kids || 0);
      if (val > 0) valores.push(val);
    });
    if (valores.length === 0) return { pct: null as number | null, media: 0, nCultos: 0, cap, alvo };
    const media = Math.round(valores.reduce((s, v) => s + v, 0) / valores.length);
    const pct = Math.round((media / cap) * 1000) / 10; // 1 casa decimal
    return { pct, media, nCultos: valores.length, cap, alvo };
  }, [cultos, modoOcup, cultoOcup, tiposOcup]);

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

      {/* % medio de assentos ocupados · toggle Templo/Kids + filtro por culto */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30">
                {(['templo', 'kids'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setModoOcup(m); setCultoOcup('todos'); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      modoOcup === m ? 'bg-[#00B39D] text-white' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m === 'templo' ? 'Templo' : 'Kids'}
                  </button>
                ))}
              </div>
              <select
                value={ocupacao.alvo}
                onChange={e => setCultoOcup(e.target.value)}
                className="h-9 px-3 rounded-lg border border-border bg-background text-xs"
              >
                <option value="todos">Todos os cultos</option>
                {tiposOcup.map(nome => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Capacidade: {ocupacao.cap.toLocaleString('pt-BR')} lugares
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="rounded-lg p-2.5 shrink-0" style={{ background: `${C.primary}18` }}>
              <Armchair className="h-6 w-6" style={{ color: C.primary }} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                % médio de assentos ocupados · {modoOcup === 'templo' ? 'Templo' : 'Kids'}
              </p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl font-bold text-foreground">
                  {ocupacao.pct != null ? `${ocupacao.pct}%` : '—'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {ocupacao.pct != null
                    ? `${ocupacao.media.toLocaleString('pt-BR')} / ${ocupacao.cap.toLocaleString('pt-BR')} por culto`
                    : 'sem dados'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Média da presença {modoOcup === 'templo' ? 'presencial (adultos)' : 'de Kids'} ÷ capacidade ·{' '}
                {ocupacao.alvo === 'todos' ? 'todos os cultos' : ocupacao.alvo} · período selecionado acima
              </p>
            </div>
            {ocupacao.nCultos > 0 && (
              <div className="flex gap-5 text-center shrink-0">
                <div>
                  <p className="text-lg font-semibold text-foreground">{ocupacao.media.toLocaleString('pt-BR')}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">média/culto</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">{ocupacao.nCultos}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">cultos</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">{ocupacao.cap.toLocaleString('pt-BR')}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">capacidade</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
