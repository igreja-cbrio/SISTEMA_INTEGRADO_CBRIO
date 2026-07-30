// Aba KPIs · visão "modo diretoria" por VALOR da Jornada.
// Escolhe um valor → objetivos daquele valor com gauge (% médio da meta),
// matriz por área (semáforo) e gráfico da série. Clique num KPI → detalhe.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { governanca as gov } from '../../api';
import { VALOR_COR } from '../../lib/uiTokens';
import { Card, CardContent } from '../ui/card';
import MetaGauge from './MetaGauge';
import KpiDetalheModal from './KpiDetalheModal';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts';
import { Loader2, CalendarDays } from 'lucide-react';

const VALORES = [
  { key: 'seguir', label: 'Seguir Jesus' },
  { key: 'conectar', label: 'Conectar' },
  { key: 'investir', label: 'Investir' },
  { key: 'servir', label: 'Servir' },
  { key: 'generosidade', label: 'Generosidade' },
];
const PERIODOS = [{ m: 3, l: '3 meses' }, { m: 6, l: '6 meses' }, { m: 12, l: '1 ano' }, { m: 24, l: '2 anos' }, { m: 60, l: '5 anos' }];
const AREAS_ORDEM = ['sede', 'kids', 'ami', 'bridge', 'online', 'cba'];
const corPct = (p) => (p == null ? '#9ca3af' : p >= 100 ? '#10b981' : p >= 90 ? '#f59e0b' : '#ef4444');
const RITUAL_SEMANA = { 1: 'planejamento / OKR', 2: 'DRE (financeiro)', 3: 'revisão de KPIs', 4: 'ciclo de conexão', 5: 'ciclo de conexão' };

function CabecalhoSemana({ ano }) {
  const hoje = new Date();
  const semanaMes = Math.ceil(hoje.getDate() / 7);
  const ciclo = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <CalendarDays className="h-4 w-4 text-primary" />
      {ano ? (
        <>
          <span className="font-medium">Ano {ano}</span>
          <span className="text-muted-foreground">· desempenho médio dos KPIs no ano (gráficos e valores)</span>
        </>
      ) : (
        <>
          <span className="font-medium capitalize">{ciclo}</span>
          <span className="text-muted-foreground">· {semanaMes}ª semana{semanaMes === 3 ? ' · semana de KPIs (diretoria)' : ` · foco: ${RITUAL_SEMANA[semanaMes] || ''}`}</span>
        </>
      )}
    </div>
  );
}

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2, ANO_ATUAL - 3];

export default function KpiPorValor() {
  const [valorSel, setValorSel] = useState('seguir');
  const [meses, setMeses] = useState(12);
  const [ano, setAno] = useState(null); // null = janela móvel; senão filtra o ano
  const [kpiSel, setKpiSel] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['kpi-objetivos', ano || `m${meses}`],
    queryFn: () => gov.kpiObjetivos(meses, ano),
    staleTime: 60_000,
  });
  const objetivos = (data?.objetivos || []).filter(o => Array.isArray(o.valores) && o.valores.includes(valorSel));

  return (
    <div className="space-y-4">
      <CabecalhoSemana ano={ano} />

      {/* Chips de valor */}
      <div className="flex flex-wrap gap-2">
        {VALORES.map(v => {
          const ativo = valorSel === v.key;
          const cor = VALOR_COR[v.key];
          return (
            <button key={v.key} onClick={() => setValorSel(v.key)}
              className="rounded-full px-4 py-2 text-sm font-semibold transition-colors"
              style={ativo ? { background: cor, color: '#fff' } : { background: 'transparent', color: cor, border: `1px solid ${cor}55` }}>
              {v.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
          {PERIODOS.map(p => (
            <button key={p.m} onClick={() => { setAno(null); setMeses(p.m); }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${!ano && meses === p.m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              {p.l}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {ANOS.map(a => (
            <button key={a} onClick={() => setAno(ano === a ? null : a)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${ano === a ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : objetivos.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Nenhum objetivo para este valor.</p>
      ) : (
        <div className="space-y-4">
          {objetivos.map(o => {
            const areas = AREAS_ORDEM.filter(a => o.areas?.[a]).concat(Object.keys(o.areas || {}).filter(a => !AREAS_ORDEM.includes(a)));
            const serie = (o.serie || []).map(s => ({ mes: s.mes, pct: s.pct }));
            return (
              <Card key={o.id}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">{o.nome}</h3>
                      <p className="text-[11px] text-muted-foreground">{o.medidos}/{o.total_taticos} KPIs com medição</p>
                    </div>
                    <span className="text-xs font-bold tabular-nums" style={{ color: corPct(o.pct_medio) }}>
                      {o.pct_medio == null ? '—' : `${Math.round(o.pct_medio)}% da meta`}
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[190px_1fr]">
                    {/* Gauge */}
                    <div className="flex items-center justify-center">
                      <MetaGauge atual={Math.min(o.pct_medio || 0, 200)} meta={100} size={170} label="% da meta" showLabels />
                    </div>

                    <div className="space-y-3 min-w-0">
                      {/* Matriz por área */}
                      <div className="flex flex-wrap gap-1.5">
                        {areas.map(a => {
                          const pa = o.areas[a]?.pct;
                          return (
                            <span key={a} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium"
                              style={{ borderColor: `${corPct(pa)}55`, color: corPct(pa) }}>
                              <span className="uppercase text-muted-foreground">{a}</span>
                              <b className="tabular-nums">{pa == null ? '—' : `${Math.round(pa)}%`}</b>
                            </span>
                          );
                        })}
                      </div>

                      {/* Gráfico da série */}
                      {serie.filter(s => s.pct != null).length > 1 && (
                        <div className="h-32">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={serie} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                              <XAxis dataKey="mes" tick={{ fontSize: 9 }} />
                              <YAxis tick={{ fontSize: 9 }} />
                              <Tooltip />
                              <ReferenceLine y={100} stroke="#9ca3af" strokeDasharray="4 3" />
                              <Line type="monotone" dataKey="pct" stroke={VALOR_COR[valorSel]} strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* KPIs táticos (clique → detalhe) */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(o.taticos || []).map(t => (
                      <button key={t.kpi_id} onClick={() => setKpiSel(t.kpi_id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] hover:bg-muted/50">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: corPct(t.percentual_meta) }} />
                        <span className="truncate max-w-[220px]">{t.indicador}</span>
                        <span className="uppercase text-muted-foreground">{t.area}</span>
                        <b className="tabular-nums" style={{ color: corPct(t.percentual_meta) }}>{t.percentual_meta == null ? '—' : `${Math.round(t.percentual_meta)}%`}</b>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {kpiSel && <KpiDetalheModal kpiId={kpiSel} onClose={() => setKpiSel(null)} />}
    </div>
  );
}
