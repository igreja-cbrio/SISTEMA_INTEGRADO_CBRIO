// ============================================================================
// Agente de Voluntariado · painel do coordenador (UI)
// ============================================================================
// Mostra as escalas dos próximos cultos que precisam de ação: confirmações
// pendentes (WhatsApp 1-toque), recusas pra repor e no-shows do último culto.
// Modo seguro: só sugere — quem age é o coordenador.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { agenteVoluntariado as api } from '../api';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Sparkles, MessageCircle, Loader2, CalendarClock, UserX, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

type Pendente = { schedule_id: string; nome: string; funcao: string; servico: string | null; quando: string; telefone: string | null; whatsapp: string | null };
type Reposicao = { schedule_id: string; nome: string; funcao: string; servico: string | null; quando: string };
type NoShow = { schedule_id: string; nome: string; funcao: string; servico: string | null; quando: string };
type Dados = { confirmacoes_pendentes: Pendente[]; reposicoes: Reposicao[]; no_shows: NoShow[] };

export default function AgenteVoluntariadoPainel() {
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(() => {
    setLoading(true);
    api.analisar()
      .then((r: Dados) => setD(r))
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return null;
  if (!d) return null;
  const total = d.confirmacoes_pendentes.length + d.reposicoes.length + d.no_shows.length;
  if (total === 0) return null;

  return (
    <Card className="p-4 border-primary/30 bg-primary/5 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">Agente de Voluntariado</span>
      </div>

      {d.confirmacoes_pendentes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> Aguardando confirmação ({d.confirmacoes_pendentes.length}) · lembre em 1 toque
          </div>
          {d.confirmacoes_pendentes.map((p) => (
            <div key={p.schedule_id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{p.nome}</div>
                <div className="text-xs text-muted-foreground truncate">{[p.funcao, p.servico, p.quando].filter(Boolean).join(' · ')}</div>
              </div>
              {p.whatsapp ? (
                <a href={p.whatsapp} target="_blank" rel="noopener noreferrer">
                  <Button size="sm"><MessageCircle className="h-4 w-4 mr-1" /> Lembrar</Button>
                </a>
              ) : <span className="text-xs text-amber-600">sem telefone</span>}
            </div>
          ))}
        </div>
      )}

      {d.reposicoes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <UserX className="h-3.5 w-3.5" /> Recusadas — precisam de reposição ({d.reposicoes.length})
          </div>
          {d.reposicoes.map((r) => (
            <div key={r.schedule_id} className="rounded-md border border-amber-300/50 bg-amber-500/5 p-2 text-sm">
              <span className="font-medium">{r.nome}</span>
              <span className="text-xs text-muted-foreground"> — {[r.funcao, r.servico, r.quando].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}

      {d.no_shows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Faltaram sem avisar no último culto ({d.no_shows.length})
          </div>
          {d.no_shows.map((n) => (
            <div key={n.schedule_id} className="rounded-md border border-border bg-card p-2 text-sm">
              <span className="font-medium">{n.nome}</span>
              <span className="text-xs text-muted-foreground"> — {[n.funcao, n.servico, n.quando].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
