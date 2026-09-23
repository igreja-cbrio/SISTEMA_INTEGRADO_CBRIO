// ════════════════════════════════════════════════════════════════════════════
//  ARRECADAÇÃO DO ONLINE · a tela
//
//  ⚠️⚠️ TUDO que este card DECLARA é obrigatório, não enfeite — e cada item
//  vem de uma medição de 23/09/2026:
//
//   · O RECORTE. "Toda arrecadação que entra no Santander" inclui R$ 2,1 mi de
//     transferência entre contas próprias e R$ 471 mil de maquininha do culto
//     PRESENCIAL. O bloco de conferência mostra o que entrou e o que ficou de
//     fora, e a soma fecha — senão quem confere o extrato conclui que falta
//     dinheiro (lei do corte de bairro do censo, 16/09).
//
//   · A SEMANA é QUARTA→TERÇA. 53% dos créditos caem na segunda e ZERO no fim
//     de semana: a oferta do culto de domingo é creditada em D+1. Na semana
//     qua→ter o domingo e o crédito dele ficam JUNTOS.
//
//   · O PERÍODO EM CURSO é parcial e NÃO entra em variação nenhuma. A
//     importação do balanço é semanal; medido no dia, a semana corrente tinha
//     R$ 90 contra R$ 17.664 da anterior — a variação ingênua seria −99,5%,
//     TODA semana.
//
//   · A CONCENTRAÇÃO fica ao lado da variação. Top 10 doadores = 39,8% do
//     total; ticket médio R$ 351 contra mediano R$ 100. Uma doação de R$ 5 mil
//     move a semana em 20% — variação sem concentração é máquina de conclusão
//     errada.
//
//   · O Nº DE SEGUNDAS no mês, quando o calendário difere do ano anterior: um
//     mês com 5 segundas tem ~11% a mais que um com 4, sem nada ter mudado.
//
//  ⚠️ Erro NUNCA vira zero nem gráfico vazio.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend, Cell,
} from 'recharts';
import { online } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { gradFill } from '@/components/charts/ChartGradients';
import {
  Wallet, AlertCircle, Loader2, TrendingUp, TrendingDown, ChevronDown, Info, Lock,
} from 'lucide-react';

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function brl(v: number | null | undefined) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  });
}
function brlExato(v: number | null | undefined) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function num(v: number | null | undefined) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR');
}
/** dd/mm de "YYYY-MM-DD". ⚠️ Fatiando a string, nunca `new Date(s)`: a string
 *  sem horário é meia-noite UTC = 21h do dia anterior no Rio. */
function diaCurto(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
function mesCurto(mes: string) {
  const i = Number(mes.slice(5, 7)) - 1;
  return `${MES_CURTO[i] || mes}/${mes.slice(2, 4)}`;
}

/** Variação em pílula. ⚠️ `null` NÃO vira 0% — vira "sem base". */
function Variacao({ pct, comparavel }: { pct: number | null; comparavel: boolean }) {
  if (!comparavel) {
    return <span className="text-xs text-muted-foreground">período em curso</span>;
  }
  if (pct === null) {
    return <span className="text-xs text-muted-foreground">sem base para comparar</span>;
  }
  const sobe = pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
      sobe ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
           : 'bg-gray-500/15 text-muted-foreground'
    }`}>
      {sobe ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {sobe ? '+' : ''}{pct}%
    </span>
  );
}

export default function ArrecadacaoOnlineCard() {
  const [ano, setAno] = useState<number | undefined>(undefined);

  const { data, isLoading, error } = useQuery({
    queryKey: ['online', 'arrecadacao', ano],
    queryFn: () => online.arrecadacao(ano),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  // ⚠️ 403 não é falha: é a régua do dinheiro dizendo que esta pessoa não vê
  // valores. O card some inteiro — mostrar um card vazio faria parecer que a
  // igreja não arrecadou nada.
  const semPermissao = (error as any)?.status === 403
    || (error as any)?.corpo?.reason === 'financeiro_requerido';
  if (semPermissao) return null;

  const semanas = data?.semanas || [];
  const meses = data?.meses || [];
  const semanaFechada = data?.semana_atual || null;
  const mesesAnotados = meses.filter((m: any) => m.fechado);
  const mesFechado = mesesAnotados.length ? mesesAnotados[mesesAnotados.length - 1] : null;
  const conf = data?.conferencia;

  const barrasSemana = semanas.map((s: any) => ({
    ...s, curto: diaCurto(s.inicio),
  }));
  const linhaMes = meses.map((m: any) => ({
    ...m, curto: mesCurto(m.mes),
  }));
  const temAnoAnterior = linhaMes.some((m: any) => m.total_ano_anterior !== null);

  return (
    <Card className="overflow-hidden">
      <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-xl bg-primary/10 p-2"><Wallet className="h-5 w-5 text-primary" /></div>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight">Arrecadação do online</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pix, TED e transferências na conta Santander · semana de <strong>quarta a terça</strong>
              {data?.corte && <> · dado importado até {diaCurto(data.corte)}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(data?.anos || []).slice(-4).map((a: number) => (
            <Button
              key={a}
              size="sm"
              variant={a === data?.ano ? 'default' : 'ghost'}
              className="h-8 px-3 text-xs"
              onClick={() => setAno(a)}
            >
              {a}
            </Button>
          ))}
        </div>
      </div>

      <CardContent className="p-4 md:p-5 space-y-5">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando a arrecadação…
          </div>
        )}

        {/* ⚠️ Erro de leitura NUNCA vira R$ 0. */}
        {error && !isLoading && !semPermissao && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              Não foi possível carregar a arrecadação. O número não está zerado — ele não foi lido.
            </div>
          </div>
        )}

        {data && !isLoading && (
          <>
            {(data.avisos || []).map((a: string) => (
              <div key={a} className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" /> {a}
              </div>
            ))}

            {/* ─────────── os números do topo ─────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Total em {data.ano}</div>
                <div className="text-2xl font-bold tabular-nums leading-tight">{brl(data.total)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {num(data.lancamentos)} doações
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Última semana fechada
                </div>
                <div className="text-2xl font-bold tabular-nums leading-tight">
                  {brl(semanaFechada?.total)}
                </div>
                <div className="text-[11px] mt-0.5 flex items-center gap-2">
                  {semanaFechada
                    ? <>{semanaFechada.label?.replace(/^Sem \d+ · /, '')}{' '}
                        <Variacao pct={semanaFechada.variacao} comparavel={semanaFechada.comparavel} /></>
                    : <span className="text-muted-foreground">nenhuma semana fechada ainda</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Último mês fechado</div>
                <div className="text-2xl font-bold tabular-nums leading-tight">{brl(mesFechado?.total)}</div>
                <div className="text-[11px] mt-0.5 flex items-center gap-2">
                  {mesFechado
                    ? <>{mesCurto(mesFechado.mes)}{' '}
                        <Variacao pct={mesFechado.variacao} comparavel={mesFechado.comparavel} /></>
                    : <span className="text-muted-foreground">nenhum mês fechado ainda</span>}
                </div>
              </div>
              <div>
                {/* ⚠️ Mediana na frente: média R$ 351 × mediana R$ 100 — a cauda
                    é longa e a média não descreve doador nenhum. */}
                <div className="text-xs text-muted-foreground">Doação típica (mediana)</div>
                <div className="text-2xl font-bold tabular-nums leading-tight">
                  {brl(data.ticket_mediano)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  média {brl(data.ticket_medio)}
                </div>
              </div>
            </div>

            {/* ⚠️⚠️ A CONCENTRAÇÃO, colada na variação de propósito: sem ela,
                "a semana caiu 59%" se lê como queda de generosidade quando pode
                ser uma pessoa que não doou naquela semana. */}
            {data.concentracao?.top10_pct !== null && data.concentracao?.top10_pct !== undefined && (
              <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong>{data.concentracao.top10_pct}%</strong> do total vem dos{' '}
                  <strong>10 maiores doadores</strong> ({data.concentracao.top50_pct}% dos 50 maiores,
                  de {num(data.concentracao.doadores)} no ano). Por isso uma variação semanal grande
                  costuma ser uma doação avulsa, não mudança de comportamento.
                </div>
              </div>
            )}

            {/* ─────────── semana a semana ─────────── */}
            {barrasSemana.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Semana a semana</h3>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barrasSemana} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="curto" tickLine={false} axisLine={false} minTickGap={20} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} width={64} fontSize={11}
                             tickFormatter={(v) => brl(v)} />
                      <Tooltip
                        formatter={(v: any) => [brlExato(v as number), 'Arrecadado']}
                        labelFormatter={(l, p: any) => {
                          const d = p?.[0]?.payload;
                          return d ? `${d.label}${d.fechado ? '' : ' · em curso'}` : `Semana de ${l}`;
                        }}
                      />
                      <Bar dataKey="total" name="Arrecadado" radius={[4, 4, 0, 0]}>
                        {barrasSemana.map((s: any) => (
                          // ⚠️ A semana em curso é PINTADA diferente: ela não é
                          // comparável e a barra baixa não é queda.
                          <Cell key={s.inicio}
                                fill={s.fechado ? gradFill('#00B39D') : '#9CA3AF'}
                                fillOpacity={s.fechado ? 1 : 0.45} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {barrasSemana.some((s: any) => !s.fechado) && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    A barra cinza é a semana <strong>em curso</strong> — o balanço dela ainda não foi
                    importado por inteiro, então ela não entra em nenhuma comparação.
                  </p>
                )}
              </div>
            )}

            {/* ─────────── mês a mês, com o ano anterior ─────────── */}
            {linhaMes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Mês a mês{temAnoAnterior && <> · contra {data.ano - 1}</>}
                </h3>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={linhaMes} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="curto" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} width={64} fontSize={11}
                             tickFormatter={(v) => brl(v)} />
                      <Tooltip formatter={(v: any, n: any) => [brlExato(v as number), n]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {temAnoAnterior && (
                        <Line type="monotone" dataKey="total_ano_anterior" name={String(data.ano - 1)}
                              stroke="#9CA3AF" strokeWidth={2} strokeDasharray="4 4"
                              dot={false} connectNulls={false} />
                      )}
                      <Line type="monotone" dataKey="total" name={String(data.ano)}
                            stroke="#00B39D" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="text-left font-medium py-1.5">Mês</th>
                        <th className="text-right font-medium">Arrecadado</th>
                        <th className="text-right font-medium">vs mês anterior</th>
                        {temAnoAnterior && <th className="text-right font-medium">vs {data.ano - 1}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {linhaMes.map((m: any) => (
                        <tr key={m.mes} className="border-b border-border/50 last:border-0">
                          <td className="py-1.5">
                            {mesCurto(m.mes)}
                            {!m.fechado && <span className="text-muted-foreground"> · em curso</span>}
                          </td>
                          <td className="text-right tabular-nums">{brlExato(m.total)}</td>
                          <td className="text-right">
                            <Variacao pct={m.variacao} comparavel={m.comparavel} />
                          </td>
                          {temAnoAnterior && (
                            <td className="text-right">
                              {m.variacao_ano === null
                                ? <span className="text-muted-foreground">—</span>
                                : (
                                  <span className="inline-flex items-center gap-1">
                                    <span className={m.variacao_ano > 0
                                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                      : 'text-muted-foreground'}>
                                      {m.variacao_ano > 0 ? '+' : ''}{m.variacao_ano}%
                                    </span>
                                    {/* ⚠️ 53% do dinheiro cai na segunda: um mês
                                        com 5 segundas tem ~11% a mais sem nada
                                        ter mudado. */}
                                    {m.calendario_difere && (
                                      <span title={`${m.dias_segunda} segundas neste mês contra ${m.dias_segunda_ano_anterior} no ano anterior — parte da variação é só o calendário.`}
                                            className="text-amber-600 cursor-help">⚠</span>
                                    )}
                                  </span>
                                )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ─────────── conferência: a soma tem que fechar ─────────── */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold hover:opacity-80 w-full">
                <ChevronDown className="h-4 w-4" />
                O que entra nesta conta
                {conf && (
                  <span className="text-xs font-normal text-muted-foreground">
                    · {conf.pct_dentro}% do que a conta recebeu
                  </span>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  A conta Santander é o canal online (a chave Pix do culto online aponta para ela).
                  Mas ela recebe mais do que doação online — por isso o recorte é{' '}
                  <strong>Pix, TED e transferência</strong>, e o resto fica declarado abaixo para a
                  soma fechar com o extrato.
                </p>

                {conf && (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Entra na arrecadação</div>
                      <div className="font-bold tabular-nums">{brlExato(conf.dentro)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Fica de fora</div>
                      <div className="font-bold tabular-nums text-muted-foreground">{brlExato(conf.fora)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Total da conta</div>
                      <div className="font-bold tabular-nums">{brlExato(conf.total_conta)}</div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold mb-1.5">Composição do que entra</div>
                    {(data.composicao || []).map((c: any) => (
                      <div key={c.plano} className="flex items-center gap-2 text-xs py-0.5">
                        <span className="flex-1 min-w-0 truncate">{c.plano}</span>
                        <span className="tabular-nums text-muted-foreground">{num(c.n)}×</span>
                        <span className="tabular-nums w-24 text-right">{brlExato(c.total)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs font-semibold mb-1.5">O que fica de fora, e por quê</div>
                    {(data.fora_do_recorte || []).map((f: any) => (
                      <div key={f.forma} className="flex items-center gap-2 text-xs py-0.5 text-muted-foreground">
                        <span className="flex-1 min-w-0 truncate">{f.forma}</span>
                        <span className="tabular-nums">{num(f.n)}×</span>
                        <span className="tabular-nums w-24 text-right">{brlExato(f.total)}</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Cartão é o repasse da maquininha do culto <strong>presencial</strong>.
                      Transferência entre contas da própria igreja e estorno também ficam fora —
                      somá-los contaria o mesmo dinheiro duas vezes.
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
                  ⚠️ A data é a do <strong>crédito no banco</strong>, não a da doação: a oferta do
                  culto de domingo é creditada na segunda. Por isso a semana vai de quarta a terça —
                  assim o culto e o dinheiro dele ficam na mesma semana. Esta tela não diz quanto
                  cada culto arrecadou.
                </p>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
}
