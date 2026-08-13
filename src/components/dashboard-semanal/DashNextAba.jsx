import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dashboardSemanal as api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Loader2, Users, Pencil, Check, X, PencilLine } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { ChartGradients, gradFill } from '../charts/ChartGradients';

const C = { primary: '#00B39D' };

// Aba simples: quantas PESSOAS estiveram presentes no NEXT, por mês.
//
// ⚠️ A fonte é a CHAMADA dos encontros (next_presencas · vw_next_presenca_mes),
// não mais o check-in da inscrição — aquele é o modelo anterior ao cutover de
// turmas (17/06/2026) e parou em abr/2026, o que fazia os meses novos nascerem
// "sem dado" e obrigava a digitar na mão. Conta PESSOA: quem foi aos 2 encontros
// do mês conta 1 (o legado contava 2, e é por isso que o histórico diminuiu).
export default function DashNextAba() {
  const [meses, setMeses] = useState(12);
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editMes, setEditMes] = useState(null); // ano_mes em edição
  const [editVal, setEditVal] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['dash-sem', 'next-presenca', meses],
    queryFn: () => api.nextPresencaMensal(meses),
    staleTime: 5 * 60_000,
  });

  const salvarMut = useMutation({
    mutationFn: ({ ano_mes, total }) => api.nextPresencaMensalSet({ ano_mes, total }),
    onSuccess: () => {
      toast.success('Presença do NEXT atualizada');
      setEditMes(null); setEditVal('');
      qc.invalidateQueries({ queryKey: ['dash-sem', 'next-presenca'] });
    },
    onError: (e) => toast.error(e.message || 'Erro ao salvar'),
  });

  const abrirEdicao = (m) => {
    setEditMes(m.mes);
    setEditVal(m.manual != null ? String(m.manual) : (m.auto ? String(m.auto) : ''));
  };
  const salvar = (ano_mes) => {
    const t = editVal.trim();
    salvarMut.mutate({ ano_mes, total: t === '' ? null : Number(t) });
  };

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
            Quantas pessoas estiveram presentes no NEXT em cada mês, pela chamada dos encontros.
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

      {data?.aviso && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {data.aviso}
        </div>
      )}

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
              Nenhuma presença de NEXT no período. A chamada é feita no módulo NEXT, no encontro da turma.
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

      {/* Ajuste manual por mês · pra quando a lista de presença não veio do
          check-in do sistema. Só admin/diretor edita; o manual substitui o
          automático naquele mês. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <PencilLine className="h-4 w-4 text-amber-500" />
            Presença por mês {isAdmin ? '· ajuste manual' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[11px] text-muted-foreground mb-2">
            O número vem da chamada dos encontros do NEXT. {isAdmin
              ? 'Onde a lista de presença foi contada à mão (sem chamada no sistema), digite o total — o manual substitui o automático naquele mês.'
              : 'Meses lançados à mão pela lista de presença aparecem marcados como “manual”.'}
          </p>
          <div className="divide-y divide-border/60 rounded-lg border">
            {serie.slice().reverse().map((m) => (
              <div key={m.mes} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-24 shrink-0 font-medium">{m.label}</span>
                {editMes === m.mes ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="number"
                      min={0}
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') salvar(m.mes); if (e.key === 'Escape') { setEditMes(null); } }}
                      className="h-8 w-28"
                      autoFocus
                      placeholder="total"
                    />
                    <button
                      type="button"
                      onClick={() => salvar(m.mes)}
                      disabled={salvarMut.isPending}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                      style={{ background: C.primary }}
                      title="Salvar"
                    >
                      <Check className="h-3.5 w-3.5" /> Salvar
                    </button>
                    {m.manual != null && (
                      <button
                        type="button"
                        onClick={() => { setEditVal(''); salvar(m.mes); }}
                        disabled={salvarMut.isPending}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        title="Voltar pro automático (limpar o manual)"
                      >
                        Voltar ao automático
                      </button>
                    )}
                    <button type="button" onClick={() => setEditMes(null)} className="text-muted-foreground hover:text-foreground" title="Cancelar">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 font-semibold tabular-nums" style={{ color: C.primary }}>
                      {m.presentes.toLocaleString('pt-BR')}
                      <span className="ml-2 text-[10px] font-normal align-middle">
                        {m.fonte === 'manual' ? (
                          <>
                            <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5">manual</span>
                            {/* ⚠️ O automático fica À VISTA para se poder decidir se o
                                manual ainda é necessário — sem isso ele vira número
                                que ninguém revisita. */}
                            <span className="ml-2 text-muted-foreground">chamada: {m.auto}</span>
                          </>
                        ) : m.auto > 0 ? (
                          <span className="text-muted-foreground">chamada</span>
                        ) : (
                          <span className="text-muted-foreground">sem chamada</span>
                        )}
                      </span>
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => abrirEdicao(m)}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50"
                        title="Lançar/ajustar manualmente"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
