// ============================================================================
// Acumulado do ano até hoje × mesmo período dos anos anteriores.
//
// ⚠️ Por que TOTAL e MÉDIA POR CULTO aparecem juntos: o nº de cultos no mesmo
// período cresceu ano a ano (154 em 2023 → 199 em 2026, porque a igreja abriu
// horários novos). Olhar só o total faz "mais cultos" parecer "mais gente"; a
// média por culto é a que compara igreja com igreja.
// ============================================================================
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Loader2, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { dashboardSemanal as api } from '../../api';

const nf = (v) => Number(v).toLocaleString('pt-BR');

function Delta({ pct, base, sufixo }) {
  if (pct == null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3.5 w-3.5" />
        {base == null ? 'base de comparação' : 'sem dado'}
      </span>
    );
  }
  const positivo = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
      positivo ? 'text-emerald-600' : 'text-rose-600'
    }`}>
      {positivo ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {positivo ? '+' : ''}{pct.toFixed(1)}%
      <span className="text-muted-foreground font-normal">
        {sufixo || `vs ${base}`}
      </span>
    </span>
  );
}

export default function YtdAcumuladoCard({ indicador, indLabel, culto, anos, meses, cores }) {
  const anosKey = [...anos].sort((a, b) => a - b).join(',');
  const mesesKey = [...(meses || [])].sort((a, b) => a - b).join(',');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dash-sem', 'ytd', anosKey, indicador, culto, mesesKey],
    queryFn: () => api.ytd({ anos: anosKey, indicador, culto, meses: mesesKey }),
    staleTime: 60_000,
    enabled: anos.length > 0,
  });

  const corDoAno = (ano) => {
    const idx = (data?.anos || []).indexOf(ano);
    return cores[(idx < 0 ? 0 : idx) % cores.length];
  };

  if (!anos.length) return null;

  const resultados = data?.resultados || [];
  const acumulado = data?.acumulado || [];
  const batismos = data?.batismos || [];
  const temAlgumDado = resultados.some(r => r.tem_dado);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {indLabel} · acumulado de {data?.periodo?.rotulo || 'o período selecionado'}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          {data?.periodo
            ? <>Cada ano somado no <strong>mesmo recorte</strong> ({data.periodo.rotulo}), para a
                comparação ser justa. {data.periodo.parcial
                  ? 'O período termina hoje porque o ano corrente está na comparação.'
                  : 'Período fechado nos anos comparados.'}{' '}
                Use os chips <strong>Meses</strong> acima para escolher outro período.</>
            : 'Escolha o período nos chips Meses acima.'}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[260px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
            Não foi possível carregar o acumulado do ano.
          </div>
        ) : !temAlgumDado ? (
          <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
            Nenhum dos anos selecionados tem dado deste indicador no período.
          </div>
        ) : (
          <>
            {/* Cards · 1 por ano */}
            <div className={`grid gap-3 ${
              resultados.length <= 2 ? 'grid-cols-1 sm:grid-cols-2'
              : resultados.length === 3 ? 'grid-cols-1 sm:grid-cols-3'
              : 'grid-cols-2 lg:grid-cols-4'
            }`}>
              {resultados.map(r => (
                <div key={r.ano} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: corDoAno(r.ano) }} />
                    <span className="text-xs font-medium text-muted-foreground">{r.ano}</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums">
                    {r.tem_dado ? nf(r.total) : '—'}
                  </div>
                  <div className="mt-1">
                    <Delta pct={r.delta_pct} base={r.base_ano} />
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/60 space-y-0.5">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Média por culto: </span>
                      <span className="font-semibold tabular-nums">
                        {r.media_por_culto != null ? nf(r.media_por_culto) : '—'}
                      </span>
                    </div>
                    {r.delta_media_pct != null && (
                      <Delta pct={r.delta_media_pct} base={r.base_ano} sufixo={`na média vs ${r.base_ano}`} />
                    )}
                    {/* Só "cultos com dado" — o "N sem lançamento" saiu a pedido do
                        Matheus (10/08/2026). Ele poluía o card sem servir aqui: este
                        bloco responde "como está o ano contra os anteriores", e a
                        pendência de lançamento se resolve na aba Cultos da Integração,
                        que é onde alguém age sobre ela.
                        ⚠️ `cultos_no_periodo` continua vindo do backend e é o
                        denominador da média por culto — não remover do endpoint. */}
                    <div className="text-[11px] text-muted-foreground">
                      {nf(r.cultos_com_dado)} cultos com dado
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Curva acumulada · onde a diferença entre os anos abre ou fecha */}
            {acumulado.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Como o acumulado evoluiu mês a mês
                  {data?.periodo?.parcial && ' (o último mês é parcial)'}
                </p>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={acumulado} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="mes_nome" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={56} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        formatter={(v, name) => [nf(v), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      {(data?.anos || []).map(a => (
                        <Line
                          key={a}
                          type="monotone"
                          dataKey={String(a)}
                          name={String(a)}
                          stroke={corDoAno(a)}
                          strokeWidth={3}
                          dot={{ r: 3 }}
                          activeDot={{ r: 6 }}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Batismos · KPI da aba que não passa pelo filtro de culto */}
            {batismos.length > 0 && batismos.some(b => b.total > 0) && (
              <div className="mt-5 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Batismos realizados no mesmo período
                  <span className="font-normal"> · não depende do filtro de culto</span>
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {batismos.map(b => (
                    <div key={b.ano}>
                      <span className="text-xs text-muted-foreground">{b.ano} </span>
                      <span className="text-lg font-bold tabular-nums">{nf(b.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(data?.avisos || []).length > 0 && (
              <div className="mt-4 space-y-1.5">
                {data.avisos.map((a, i) => (
                  <p key={i} className="flex gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
                    <span>{a}</span>
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
