import { useState, useEffect, useCallback } from 'react';
import { kpis as kpisApi } from '@/api';
import {
  Loader2, AlertCircle, CheckCircle2, Clock, Edit2, RefreshCw, FileText, Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const C = {
  primary: '#00B39D',
  warn: '#F59E0B',
  danger: '#EF4444',
};

const PERIODICIDADE_LABEL: Record<string, string> = {
  semanal: 'Semanal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

interface Tatico {
  id: string;
  area: string;
  indicador: string;
  periodicidade: string;
  meta_descricao?: string;
  meta_valor?: number;
  unidade?: string;
  periodo_atual?: string;
  ultimo_periodo?: string;
  ultimo_valor?: number;
  ultima_data?: string;
  ultima_origem?: 'manual' | 'auto' | null;
  fonte_auto?: string | null;
  status: 'verde' | 'vermelho' | 'pendente';
}

function statusColor(s: string): string {
  if (s === 'verde') return C.primary;
  if (s === 'vermelho') return C.danger;
  return '#6B7280';
}

function statusIcon(s: string) {
  const cor = statusColor(s);
  if (s === 'verde') return <CheckCircle2 className="h-3.5 w-3.5" style={{ color: cor }} />;
  if (s === 'vermelho') return <AlertCircle className="h-3.5 w-3.5" style={{ color: cor }} />;
  return <Clock className="h-3.5 w-3.5" style={{ color: cor }} />;
}

/**
 * Seção compacta de "Indicadores Táticos & Histórico" para inserir em cada
 * aba de área existente (TabAMI, TabVoluntariado, etc.).
 *
 * Mostra a tabela de táticos com status atual e link "Lançar" que leva
 * para a aba Lançamento dessa área.
 */
export default function KPIRegistrosSection({ area, onLancarClick }: {
  area: string;
  onLancarClick?: () => void;
}) {
  const [taticos, setTaticos] = useState<Tatico[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kpisApi.v2.taticos({ area });
      setTaticos(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [area]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (taticos.length === 0) {
    return null;
  }

  const verde = taticos.filter(t => t.status === 'verde').length;
  const vermelho = taticos.filter(t => t.status === 'vermelho').length;
  const pendente = taticos.filter(t => t.status === 'pendente').length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Indicadores Táticos & Lançamentos</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: C.primary }} />
              <span className="font-bold tabular-nums">{verde}</span>
              <span className="text-muted-foreground">em dia</span>
            </span>
            {vermelho > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: C.danger }} />
                <span className="font-bold tabular-nums">{vermelho}</span>
                <span className="text-muted-foreground">atrasado(s)</span>
              </span>
            )}
            {pendente > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
                <span className="font-bold tabular-nums">{pendente}</span>
                <span className="text-muted-foreground">pendente(s)</span>
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5 text-xs h-7">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </Button>
          {onLancarClick && (
            <Button
              size="sm"
              onClick={onLancarClick}
              className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white text-xs h-7"
            >
              <Edit2 className="h-3 w-3" /> Lançar valores
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Indicador</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Periodicidade</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meta</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Último valor</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Período</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {taticos.map(t => (
              <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    {statusIcon(t.status)}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground/60">{t.id}</span>
                    {t.fonte_auto && (
                      <span title="Lancado automaticamente pelo sistema" className="inline-flex items-center">
                        <Bot className="h-3 w-3" style={{ color: C.primary }} />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground">{t.indicador}</p>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {PERIODICIDADE_LABEL[t.periodicidade] || t.periodicidade}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[180px] truncate" title={t.meta_descricao || ''}>
                  {t.meta_descricao || '—'}
                </td>
                <td className="px-4 py-2.5">
                  {t.ultimo_valor != null ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold tabular-nums text-foreground">
                        {Number(t.ultimo_valor).toLocaleString('pt-BR')}
                        {t.unidade ? ` ${t.unidade}` : ''}
                      </span>
                      {t.ultima_origem === 'auto' && (
                        <Bot className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground/70">
                  {t.ultimo_periodo || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
