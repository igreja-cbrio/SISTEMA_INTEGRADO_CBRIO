import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { online } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bug, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export function OnlineDebugPanel() {
  const [videoId, setVideoId] = useState('mEhcOL8BQxg');
  const [start, setStart] = useState('2026-05-17');
  const [end, setEnd] = useState('2026-05-24');

  const canaisQuery = useMutation({
    mutationFn: () => online.debug.canaisAutorizados(),
  });

  const testQuery = useMutation({
    mutationFn: () => online.debug.analyticsTest(videoId, start, end),
  });

  const canais = canaisQuery.data as any;
  const teste = testQuery.data as any;

  return (
    <Card className="overflow-hidden border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <h2 className="text-base font-bold leading-tight">Diagnostico (admin)</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Pra descobrir por que as metricas voltam zeradas. Roda os 2 testes e me passa o resultado.
        </p>

        {/* Teste 1 · canais autorizados */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">1. Canais que a conta OAuth gerencia</div>
            <Button
              size="sm"
              onClick={() => canaisQuery.mutate()}
              disabled={canaisQuery.isPending}
            >
              {canaisQuery.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Listar canais'}
            </Button>
          </div>
          {canaisQuery.error && (
            <div className="rounded bg-destructive/10 text-destructive p-2 text-xs flex items-start gap-1.5">
              <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{(canaisQuery.error as any)?.message || 'Erro'}</span>
            </div>
          )}
          {canais && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Total: <strong>{canais.total}</strong> canal(is)</div>
              {(canais.canais || []).map((c: any) => (
                <div key={c.id} className="text-xs flex items-center gap-2 p-2 rounded bg-muted/30">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div>
                    <div className="font-semibold">{c.title}</div>
                    <div className="text-muted-foreground">{c.id} · {c.subscriber_count} inscritos · {c.video_count} videos</div>
                  </div>
                </div>
              ))}
              {canais.total === 0 && (
                <div className="text-xs flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Conta OAuth nao gerencia nenhum canal · reconectar com conta dona do canal CBRio.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Teste 2 · analytics dum video */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="text-sm font-semibold">2. Chamada Analytics pra um video</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">video_id</label>
              <Input value={videoId} onChange={e => setVideoId(e.target.value)} className="text-xs h-8 font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">start</label>
              <Input value={start} onChange={e => setStart(e.target.value)} className="text-xs h-8" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">end</label>
              <Input value={end} onChange={e => setEnd(e.target.value)} className="text-xs h-8" />
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => testQuery.mutate()}
            disabled={testQuery.isPending || !videoId}
          >
            {testQuery.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Testar Analytics'}
          </Button>

          {testQuery.error && (
            <div className="rounded bg-destructive/10 text-destructive p-2 text-xs flex items-start gap-1.5">
              <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{(testQuery.error as any)?.message || 'Erro'}</span>
            </div>
          )}

          {teste && (
            <div className="space-y-2">
              <div className={`rounded p-2 text-xs flex items-start gap-1.5 ${
                teste.interpretacao?.startsWith('OK') ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : teste.interpretacao?.startsWith('ROWS') ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'bg-destructive/10 text-destructive'
              }`}>
                {teste.interpretacao?.startsWith('OK') ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                <span>{teste.interpretacao}</span>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver JSON cru da resposta</summary>
                <pre className="mt-2 p-2 bg-muted/30 rounded overflow-auto max-h-64 text-[10px] font-mono">
                  {JSON.stringify(teste, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
