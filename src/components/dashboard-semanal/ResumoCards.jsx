import { useQuery } from '@tanstack/react-query';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent } from '../ui/card';
import { Loader2, Users, Baby, Tv, Sparkles, Droplets, UserPlus, Calendar, TrendingUp, TrendingDown } from 'lucide-react';

const PRIMARY = '#00B39D';
const fmtN = (v) => Number(v || 0).toLocaleString('pt-BR');
const fmtPct = (v) => v == null ? null : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`;

function DeltaBadge({ pct, sufixo = 'vs. semana anterior' }) {
  if (pct == null) return null;
  const pos = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>
      {pos ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {fmtPct(pct)}
      <span className="text-muted-foreground font-normal">{sufixo}</span>
    </span>
  );
}

function MiniStat({ icon: Icon, label, valor, cor }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" style={{ color: cor }} />
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

function ResumoShell({ icon: Icon, titulo, subtitulo, loading, children }) {
  return (
    <Card className="relative overflow-hidden border-primary/30">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(0,179,157,0.08), transparent 55%)' }} />
      <CardContent className="pt-5 pb-5 relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,179,157,0.12)', color: PRIMARY }}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold leading-tight">{titulo}</h3>
            <p className="text-xs text-muted-foreground">{subtitulo}</p>
          </div>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary ml-auto shrink-0" />}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function ResumoSemanaCard({ ano, semana }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dash-sem', 'resumo-semana', ano, semana],
    queryFn: () => api.resumoSemana(ano, semana),
    enabled: !!ano && !!semana,
    staleTime: 60_000,
  });

  return (
    <ResumoShell
      icon={Sparkles}
      titulo="Resumo da semana"
      subtitulo={data?.label || 'Consolidado por culto'}
      loading={isLoading}
    >
      {!data ? (
        <div className="h-10 rounded bg-muted animate-pulse" />
      ) : (
        <>
          <p className="text-sm text-foreground/90 leading-relaxed mb-3">
            <strong style={{ color: PRIMARY }}>{fmtN(data.presencas)}</strong> presenças
            {data.presencas_delta_pct != null && <> ({fmtPct(data.presencas_delta_pct)} vs. a semana anterior)</>}
            {' · '}<strong style={{ color: PRIMARY }}>{fmtN(data.online)}</strong> online
            {' · '}<strong style={{ color: PRIMARY }}>{fmtN(data.decisoes)}</strong> decisões.
            {data.maior_culto && <> {data.maior_culto.nome} foi o maior público ({fmtN(data.maior_culto.valor)}).</>}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniStat icon={Users} label="Presenças" valor={fmtN(data.presencas)} cor={PRIMARY} />
            <MiniStat icon={Baby} label="Kids" valor={fmtN(data.kids)} cor="#8b5cf6" />
            <MiniStat icon={Tv} label="Online" valor={fmtN(data.online)} cor="#3b82f6" />
            <MiniStat icon={Sparkles} label="Decisões" valor={fmtN(data.decisoes)} cor="#10b981" />
          </div>
          {data.presencas_delta_pct != null && (
            <div className="mt-3"><DeltaBadge pct={data.presencas_delta_pct} /></div>
          )}
        </>
      )}
    </ResumoShell>
  );
}

export function ResumoMesCard({ ano, mes }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dash-sem', 'resumo-mes', ano, mes],
    queryFn: () => api.resumoMes(ano, mes),
    enabled: !!ano && !!mes,
    staleTime: 60_000,
  });

  const titulo = data?.mes_nome
    ? `Resumo de ${data.mes_nome}`
    : 'Resumo do mês';

  return (
    <ResumoShell
      icon={Calendar}
      titulo={titulo}
      subtitulo="Indicadores do mês corrente"
      loading={isLoading}
    >
      {!data ? (
        <div className="h-10 rounded bg-muted animate-pulse" />
      ) : (
        <>
          <p className="text-sm text-foreground/90 leading-relaxed mb-3">
            <strong style={{ color: PRIMARY }}>{fmtN(data.presencas)}</strong> presenças no mês
            {data.presencas_delta_pct != null && <> ({fmtPct(data.presencas_delta_pct)})</>}
            {' · '}<strong style={{ color: PRIMARY }}>{fmtN(data.decisoes)}</strong> decisões
            {data.decisoes_delta_pct != null && <> ({fmtPct(data.decisoes_delta_pct)})</>}
            {' · '}<strong style={{ color: PRIMARY }}>{fmtN(data.batismos)}</strong> batismos
            {' · '}<strong style={{ color: PRIMARY }}>{fmtN(data.novos_membros)}</strong> novos membros.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniStat icon={Users} label="Presenças" valor={fmtN(data.presencas)} cor={PRIMARY} />
            <MiniStat icon={Sparkles} label="Decisões" valor={fmtN(data.decisoes)} cor="#10b981" />
            <MiniStat icon={Droplets} label="Batismos" valor={fmtN(data.batismos)} cor="#3b82f6" />
            <MiniStat icon={UserPlus} label="Novos membros" valor={fmtN(data.novos_membros)} cor="#8b5cf6" />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <DeltaBadge pct={data.presencas_delta_pct} sufixo="presenças vs. mês anterior" />
            <DeltaBadge pct={data.decisoes_delta_pct} sufixo="decisões vs. mês anterior" />
          </div>
        </>
      )}
    </ResumoShell>
  );
}
