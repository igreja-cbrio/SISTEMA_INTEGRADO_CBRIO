// Popup de detalhe de um KPI · abre a partir da aba KPIs (visão por valor).
// Mostra a FONTE (auto/manual + link pro módulo), meta/último/% da meta, a
// memória de cálculo, a última observação (o cálculo do coletor) e o histórico.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardSemanal as api } from '@/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from 'recharts';
import { Loader2, ExternalLink, Zap, Hand } from 'lucide-react';

const FONTE_ROTA = {
  cultos: '/cultos', cuidados: '/ministerial/cuidados', batismos: '/batismo',
  grupos: '/grupos', voluntariado: '/ministerial/voluntariado', next: '/ministerial/next',
  generosidade: '/admin/financeiro/generosidade', devocionais: '/ministerial/membresia',
  marketing: '/marketing', integracao: '/ministerial/integracao', cba: '/ministerial/integracao',
};
function fonteInfo(fonteAuto) {
  if (!fonteAuto) return { auto: false, label: 'Manual (preenchido à mão)', rota: null, chave: null };
  const prefix = String(fonteAuto).split('.')[0];
  return { auto: true, label: fonteAuto, rota: FONTE_ROTA[prefix] || null, chave: fonteAuto };
}
function fmtPer(p) {
  if (!p) return '—';
  const m = String(p).match(/^(\d{4})-W?(\d{1,2})$/);
  if (m && String(p).includes('W')) return `Sem ${m[2]}/${m[1]}`;
  return String(p);
}

export default function KpiDetalheModal({ kpiId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['kpi-detalhe-modal', kpiId],
    queryFn: () => api.kpiDetalhe(kpiId),
    enabled: !!kpiId,
  });
  const kpi = data?.kpi || {};
  const traj = data?.trajetoria_atual || {};
  const hist = Array.isArray(data?.historico) ? data.historico : (data?.registros || []);
  const fonte = fonteInfo(kpi.fonte_auto);
  const serie = [...hist]
    .map(h => ({ periodo: h.periodo_referencia, valor: h.valor_realizado == null ? null : Number(h.valor_realizado) }))
    .filter(h => h.valor != null)
    .reverse();
  const ultimo = hist[0];
  const pct = traj.percentual_meta;
  const corPct = pct == null ? 'text-muted-foreground' : pct >= 100 ? 'text-emerald-600' : pct >= 90 ? 'text-amber-600' : 'text-red-600';

  return (
    <Dialog open={!!kpiId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{kpi.indicador || 'KPI'}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4">
            {kpi.descricao && <p className="text-sm text-muted-foreground">{kpi.descricao}</p>}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {kpi.area && <Badge variant="outline" className="capitalize">{kpi.area}</Badge>}
              {kpi.periodicidade && <Badge variant="outline" className="capitalize">{kpi.periodicidade}</Badge>}
              {(kpi.valores || []).map(v => <Badge key={v} variant="secondary" className="capitalize">{v}</Badge>)}
            </div>

            {/* Fonte */}
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fonte do dado</p>
              <div className="flex flex-wrap items-center gap-2">
                {fonte.auto
                  ? <span className="inline-flex items-center gap-1 text-sm"><Zap className="h-3.5 w-3.5 text-primary" />Automático · <code className="text-xs">{fonte.chave}</code></span>
                  : <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Hand className="h-3.5 w-3.5" />Manual (preenchido à mão)</span>}
                {fonte.rota && (
                  <Link to={fonte.rota} onClick={onClose}>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"><ExternalLink className="h-3 w-3" />Ver na fonte</Button>
                  </Link>
                )}
              </div>
              {kpi.memoria_calculo && <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap"><b>Como é calculado:</b> {kpi.memoria_calculo}</p>}
              {ultimo?.observacoes && <p className="mt-1 text-xs text-muted-foreground"><b>Último cálculo:</b> {ultimo.observacoes}</p>}
            </div>

            {/* Mini-stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Último valor</p>
                <p className="text-lg font-bold tabular-nums">{ultimo?.valor_realizado ?? '—'}</p>
                <p className="text-[10px] text-muted-foreground">{fmtPer(ultimo?.periodo_referencia)}</p>
              </div>
              <div className="rounded-lg border border-border p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meta</p>
                <p className="text-lg font-bold tabular-nums">{traj.meta_periodo ?? kpi.meta_descricao ?? '—'}</p>
              </div>
              <div className="rounded-lg border border-border p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">% da meta</p>
                <p className={`text-lg font-bold tabular-nums ${corPct}`}>{pct == null ? '—' : `${Math.round(pct)}%`}</p>
              </div>
            </div>

            {/* Gráfico */}
            {serie.length > 1 && (
              <div className="h-48 rounded-lg border border-border p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="periodo" tick={{ fontSize: 10 }} tickFormatter={fmtPer} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={fmtPer} />
                    {traj.meta_periodo != null && <ReferenceLine y={Number(traj.meta_periodo)} stroke="#E97A3F" strokeDasharray="4 3" />}
                    <Line type="monotone" dataKey="valor" stroke="#00B39D" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Histórico */}
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Histórico (últimos registros)</p>
              {hist.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros ainda.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-[11px] text-muted-foreground">
                      <th className="px-3 py-1.5 text-left font-medium">Período</th>
                      <th className="px-3 py-1.5 text-right font-medium">Valor</th>
                      <th className="px-3 py-1.5 text-left font-medium">Origem</th>
                    </tr></thead>
                    <tbody>
                      {hist.slice(0, 12).map((h, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-3 py-1.5">{fmtPer(h.periodo_referencia)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{h.valor_realizado ?? h.valor_texto ?? '—'}</td>
                          <td className="px-3 py-1.5 text-[11px] text-muted-foreground">{h.origem === 'auto' ? 'automático' : h.origem || 'manual'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
