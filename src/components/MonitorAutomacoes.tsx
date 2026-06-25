// ============================================================================
// Monitor de Automações · painel de saúde (UI)
// ============================================================================
// Mostra a saúde dos pipelines automáticos (sync financeiro, WiFi, YouTube,
// telemetria): verde = ok, amarelo = atrasado, vermelho = parado. Só leitura.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { monitorAutomacoes as api } from '../api';
import { Card } from './ui/card';
import { Activity, RefreshCw } from 'lucide-react';

type Pipeline = { chave: string; label: string; status: 'ok' | 'atrasado' | 'parado' | 'desconhecido'; horas: number | null; maxHoras: number };
type Dados = { pipelines: Pipeline[]; resumo: { ok: number; atrasado: number; parado: number; desconhecido: number } };

const COR: Record<string, string> = {
  ok: 'bg-green-500', atrasado: 'bg-amber-500', parado: 'bg-red-500', desconhecido: 'bg-muted-foreground/40',
};
const LABEL_STATUS: Record<string, string> = {
  ok: 'ok', atrasado: 'atrasado', parado: 'parado', desconhecido: '—',
};

export default function MonitorAutomacoes() {
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(() => {
    setLoading(true);
    api.status()
      .then((r: Dados) => setD(r))
      .catch(() => setD(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading || !d) return null;
  const problemas = d.resumo.atrasado + d.resumo.parado;

  return (
    <Card className={`p-4 ${problemas > 0 ? 'border-amber-400/50 bg-amber-500/5' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Saúde das automações</span>
          {problemas > 0
            ? <span className="text-xs text-amber-700 dark:text-amber-400">{problemas} com problema</span>
            : <span className="text-xs text-green-600">tudo ok</span>}
        </div>
        <button onClick={carregar} className="text-muted-foreground hover:text-foreground" title="Atualizar"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {d.pipelines.map((p) => (
          <div key={p.chave} className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${COR[p.status]}`} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{p.label}</div>
              <div className="text-[11px] text-muted-foreground">
                {LABEL_STATUS[p.status]}{p.horas != null ? ` · há ${p.horas}h` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
