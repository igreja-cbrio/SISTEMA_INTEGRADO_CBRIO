import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { kpis as kpisApi, painel as painelApi } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import {
  Heart, Sparkles, Loader2, BarChart3, Calendar, Users, Search, UserPlus,
  ChevronDown, ChevronRight, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
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

      <DetalhamentoDecisoes porTipo={porTipo} />
    </div>
  );
}

// ============================================================================
// DetalhamentoDecisoes · embaixo do grafico · 2 modos de visao
//
// Marcos: "colocar essa aba de pessoas que decidiram em decisoes abaixo do
//          grafico, exatamente como e o batismo, e ai pode ter um filtro de
//          ver as decisoes por culto como numero ou aparecer os cpfs como na
//          area de batismo".
//
// Modo "Por culto"  · agregacao por culto individual (data, tipo, decisoes,
//                     pessoas registradas, gap)
// Modo "Pessoas"    · lista igual Batismos (nome, CPF, telefone, email, data,
//                     culto, status_followup)
// ============================================================================
function DetalhamentoDecisoes({ porTipo }: { porTipo: any[] }) {
  const [modo, setModo] = useState<'por_culto' | 'pessoas'>('por_culto');

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {modo === 'por_culto'
            ? <><Calendar className="h-4 w-4 text-muted-foreground" /> Por culto</>
            : <><Users className="h-4 w-4 text-muted-foreground" /> Pessoas que decidiram</>}
        </CardTitle>
        <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/30">
          {[
            { v: 'por_culto' as const, l: 'Por culto', I: Calendar },
            { v: 'pessoas'   as const, l: 'Pessoas',   I: Users },
          ].map(opt => {
            const I = opt.I;
            return (
              <button
                key={opt.v}
                onClick={() => setModo(opt.v)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 ${
                  modo === opt.v ? 'bg-[#00B39D] text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <I className="h-3 w-3" /> {opt.l}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {modo === 'por_culto' ? <VisaoPorCulto porTipo={porTipo} /> : <VisaoPessoas />}
      </CardContent>
    </Card>
  );
}

function VisaoPorCulto({ porTipo }: { porTipo: any[] }) {
  return (
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
  );
}

// ============================================================================
// VisaoPessoas · lista todas as pessoas registradas (estilo Batismos)
// Click numa linha expande o culto e permite adicionar/remover pessoas
// ============================================================================
function VisaoPessoas() {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pendentes' | 'completos' | 'nenhuma'>('todos');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['painel', 'nsm-sem-dados', 365],
    queryFn: () => painelApi.nsmSemDados({ dias: 365 }),
    staleTime: 30_000,
  });

  const items = data?.items || [];

  // Carrega todas as pessoas de uma vez (limitado · ~últimas 500)
  const { data: todasPessoas = [] } = useQuery({
    queryKey: ['decisoes-pessoas', 'todas', 365],
    queryFn: async () => {
      const cultoIds = items.slice(0, 200).map((c: any) => c.culto_id);
      if (cultoIds.length === 0) return [];
      const arrs = await Promise.all(
        cultoIds.map((id: string) => kpisApi.cultos.decisoesPessoas.list(id).catch(() => []))
      );
      return arrs.flat().map((p: any, _i: number) => {
        const culto = items.find((c: any) => c.culto_id === p.culto_id);
        return { ...p, _culto: culto };
      });
    },
    enabled: items.length > 0,
    staleTime: 30_000,
  });

  const pessoasFiltradas = useMemo(() => {
    if (!busca) return todasPessoas;
    const q = busca.toLowerCase();
    const qCpf = q.replace(/\D/g, '');
    return todasPessoas.filter((p: any) =>
      (p.nome || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.telefone || '').toLowerCase().includes(q) ||
      (qCpf && (p.cpf || '').includes(qCpf))
    );
  }, [todasPessoas, busca]);

  const cultosFiltrados = useMemo(() => {
    if (filtroStatus === 'todos') return items;
    if (filtroStatus === 'pendentes') return items.filter((c: any) => c.gap_status === 'parcial' || c.gap_status === 'nenhuma_registrada');
    if (filtroStatus === 'completos') return items.filter((c: any) => c.gap_status === 'completo');
    if (filtroStatus === 'nenhuma')   return items.filter((c: any) => c.gap_status === 'nenhuma_registrada');
    return items;
  }, [items, filtroStatus]);

  if (isLoading) {
    return <div className="py-8 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Filtros · estilo Batismos */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30 overflow-x-auto">
          {([
            { v: 'todos' as const, l: 'Todos' },
            { v: 'pendentes' as const, l: 'Pendentes' },
            { v: 'nenhuma' as const, l: 'Sem dados' },
            { v: 'completos' as const, l: 'Completos' },
          ]).map(opt => {
            const count = opt.v === 'todos' ? items.length
              : opt.v === 'pendentes' ? items.filter((c: any) => c.gap_status === 'parcial' || c.gap_status === 'nenhuma_registrada').length
              : opt.v === 'completos' ? items.filter((c: any) => c.gap_status === 'completo').length
              : items.filter((c: any) => c.gap_status === 'nenhuma_registrada').length;
            return (
              <button
                key={opt.v}
                onClick={() => setFiltroStatus(opt.v)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                  filtroStatus === opt.v ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.l} ({count})
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar nome, CPF, telefone, email"
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Quando há busca: lista de pessoas (tipo Batismos) */}
      {busca ? (
        pessoasFiltradas.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Nenhuma pessoa bate com a busca.
          </div>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead className="hidden md:table-cell">Contato</TableHead>
                  <TableHead>Culto</TableHead>
                  <TableHead className="text-center">Tipo</TableHead>
                  <TableHead className="text-center">Vínculo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pessoasFiltradas.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="font-mono text-xs">{maskCpf(p.cpf || '')}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {p.telefone && <div>{p.telefone}</div>}
                      {p.email && <div className="truncate max-w-[200px]">{p.email}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p._culto && (
                        <>
                          <div>{formatDataCurta(p._culto.data_culto)}</div>
                          <div className="text-muted-foreground">{p._culto.service_type_name}</div>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[9px] capitalize">{p.tipo_decisao}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {p.membro_id ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          membro
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : (
        // Sem busca: lista de cultos com expand
        cultosFiltrados.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Nenhum culto com decisões nesse filtro.
          </div>
        ) : (
          <div className="space-y-1.5">
            {cultosFiltrados.map((c: any) => (
              <CultoExpandivel
                key={c.culto_id}
                culto={c}
                expanded={expandedId === c.culto_id}
                onToggle={() => setExpandedId(expandedId === c.culto_id ? null : c.culto_id)}
                onChanged={() => refetch()}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function CultoExpandivel({
  culto, expanded, onToggle, onChanged,
}: { culto: any; expanded: boolean; onToggle: () => void; onChanged: () => void }) {
  const cor = culto.gap_status === 'nenhuma_registrada' ? '#EF4444'
            : culto.gap_status === 'parcial' ? '#F59E0B'
            : '#10B981';
  const labelStatus = culto.gap_status === 'nenhuma_registrada' ? `${culto.sem_dados} SEM DADOS`
                    : culto.gap_status === 'parcial' ? `Faltam ${culto.sem_dados}`
                    : 'Completo ✓';

  return (
    <div className="rounded-lg border bg-card overflow-hidden" style={{ borderLeft: `3px solid ${cor}` }}>
      <button onClick={onToggle} className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted/30 transition-colors text-left">
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm capitalize">{formatDataCurta(culto.data_culto)}</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4" style={{ color: culto.service_type_color, borderColor: culto.service_type_color }}>
              {culto.service_type_name}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            <strong>{culto.total_decisoes}</strong> decisões · <strong>{culto.total_registradas}</strong> cadastradas
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded shrink-0" style={{ background: `${cor}1a`, color: cor }}>
          {labelStatus}
        </span>
      </button>
      {expanded && <CultoPessoas cultoId={culto.culto_id} totalEsperado={culto.total_decisoes} onChanged={onChanged} />}
    </div>
  );
}

function CultoPessoas({ cultoId, totalEsperado, onChanged }: { cultoId: string; totalEsperado: number; onChanged: () => void }) {
  const { data: pessoas = [], refetch } = useQuery({
    queryKey: ['cultos', cultoId, 'decisoes-pessoas'],
    queryFn: () => kpisApi.cultos.decisoesPessoas.list(cultoId),
    staleTime: 10_000,
  });
  const [adicionando, setAdicionando] = useState(false);
  const faltando = Math.max(0, totalEsperado - pessoas.length);

  const remover = async (id: string) => {
    if (!window.confirm('Remover este registro?')) return;
    try {
      await kpisApi.cultos.decisoesPessoas.remove(id);
      toast.success('Removido');
      refetch();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  };

  return (
    <div className="border-t bg-muted/20 p-3 space-y-2">
      {pessoas.length === 0 && !adicionando && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Nenhuma pessoa registrada · clique abaixo pra começar
        </div>
      )}
      {pessoas.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8">Nome</TableHead>
                <TableHead className="h-8">CPF</TableHead>
                <TableHead className="h-8 hidden md:table-cell">Contato</TableHead>
                <TableHead className="h-8 text-center">Tipo</TableHead>
                <TableHead className="h-8 w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pessoas.map((p: any) => {
                const incompleto = !p.cpf || !p.data_nascimento;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium py-1.5 text-xs">
                      {p.nome}
                      {incompleto && (
                        <span className="ml-1.5 text-[8px] font-bold px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300" title="Faltam dados pra cruzar na jornada">
                          incompleto
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono py-1.5 text-[11px]">
                      {p.cpf ? maskCpf(p.cpf) : <span className="text-muted-foreground italic">—</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell py-1.5 text-[11px] text-muted-foreground">
                      {p.telefone}{p.email ? ` · ${p.email}` : ''}
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <Badge variant="outline" className="text-[9px] capitalize">{p.tipo_decisao}</Badge>
                      {p.membro_id && (
                        <span className="ml-1 text-[8px] font-bold px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          membro
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-1.5">
                      <button onClick={() => remover(p.id)} className="text-muted-foreground hover:text-red-500" title="Remover">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {adicionando ? (
        <FormPessoa cultoId={cultoId} onSaved={() => { setAdicionando(false); refetch(); onChanged(); }} onCancel={() => setAdicionando(false)} />
      ) : (
        <Button
          onClick={() => setAdicionando(true)}
          size="sm" variant="outline"
          className="w-full h-8 gap-1.5"
          style={faltando > 0 ? { borderColor: C.purple, color: C.purple } : undefined}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Adicionar pessoa {faltando > 0 ? `(faltam ${faltando})` : ''}
        </Button>
      )}
    </div>
  );
}

function FormPessoa({ cultoId, onSaved, onCancel }: { cultoId: string; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    nome: '', telefone: '', email: '', idade: '', cpf: '',
    data_nascimento: '', tipo_decisao: 'presencial' as 'presencial' | 'online', observacoes: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    // Marcos: "no momento de conversao, nome + telefone bastam · CPF/nascimento
    // ficam pra censo posterior"
    if (form.nome.trim().length < 2) return toast.error('Nome obrigatório');
    const telLimpo = form.telefone.replace(/\D/g, '');
    if (telLimpo.length < 8) return toast.error('Telefone obrigatório (mín 8 dígitos)');
    const cpfLimpo = form.cpf.replace(/\D/g, '');
    if (cpfLimpo && cpfLimpo.length !== 11) return toast.error('CPF deve ter 11 dígitos (ou deixe vazio)');
    setSaving(true);
    try {
      await kpisApi.cultos.decisoesPessoas.create(cultoId, {
        nome: form.nome.trim(),
        telefone: form.telefone,
        email: form.email || null,
        idade: form.idade ? Number(form.idade) : null,
        cpf: cpfLimpo || null,
        data_nascimento: form.data_nascimento || null,
        tipo_decisao: form.tipo_decisao,
        observacoes: form.observacoes || null,
      });
      toast.success(cpfLimpo && form.data_nascimento
        ? 'Pessoa registrada'
        : 'Registrada · cadastro incompleto (pode completar depois)');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2" style={{ borderColor: C.purple, borderWidth: 2 }}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="md:col-span-2">
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">Nome *</label>
          <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} autoFocus className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">Tipo</label>
          <select
            value={form.tipo_decisao}
            onChange={e => setForm(f => ({ ...f, tipo_decisao: e.target.value as 'presencial' | 'online' }))}
            className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs"
          >
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">Telefone *</label>
          <Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(21) 99999-0000" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">CPF <span className="text-muted-foreground/60 normal-case font-normal">(censo depois)</span></label>
          <Input value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: maskCpf(e.target.value) }))} maxLength={14} placeholder="opcional" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">Nascimento <span className="text-muted-foreground/60 normal-case font-normal">(censo depois)</span></label>
          <Input type="date" value={form.data_nascimento} onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))} placeholder="opcional" className="h-8 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">Email</label>
          <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="opcional" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">Observações</label>
          <Input value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="opcional" className="h-8 text-xs" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} size="sm" variant="outline" disabled={saving}>Cancelar</Button>
        <Button onClick={submit} size="sm" disabled={saving} className="gap-1.5 text-white" style={{ background: C.purple }}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
          Registrar
        </Button>
      </div>
    </div>
  );
}

function maskCpf(v: string): string {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDataCurta(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}
