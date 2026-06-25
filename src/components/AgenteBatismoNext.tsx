// ============================================================================
// Agente Batismo/Next 90d · fila de convite (UI)
// ============================================================================
// Convertidos chegando no prazo de 90d sem batismo/Next, com o convite já
// rascunhado. O líder revisa, abre no WhatsApp em 1 toque e marca. Modo seguro.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { agenteBatismoNext as api } from '../api';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Sparkles, MessageCircle, Check, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

type Item = {
  id: string;
  area: string | null;
  responsavel_nome: string | null;
  falta_batismo: boolean;
  falta_next: boolean;
  dias: number | null;
  mensagem_rascunho: string | null;
  telefone: string | null;
  convertido?: { nome: string } | null;
};

const AREA_LABEL: Record<string, string> = { ami: 'AMI', bridge: 'Bridge', online: 'Online', sede: 'Sede' };

export default function AgenteBatismoNext() {
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState(true);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [processando, setProcessando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    api.fila('pendente')
      .then((d: Item[]) => {
        setItens(d || []);
        const r: Record<string, string> = {};
        (d || []).forEach((i) => { r[i.id] = i.mensagem_rascunho || ''; });
        setRascunhos(r);
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirWhatsapp(item: Item) {
    const tel = (item.telefone || '').replace(/\D/g, '');
    if (!tel) { toast.error('Convertido sem telefone cadastrado.'); return; }
    const num = tel.startsWith('55') ? tel : `55${tel}`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(rascunhos[item.id] || '')}`, '_blank', 'noopener,noreferrer');
  }

  async function marcarEnviado(item: Item) {
    setProcessando(item.id);
    try {
      const editou = (rascunhos[item.id] || '') !== (item.mensagem_rascunho || '');
      await api.enviado(item.id, editou);
      toast.success('Convite registrado 💙');
      setItens((xs) => xs.filter((x) => x.id !== item.id));
    } catch (e: any) { toast.error(e.message); } finally { setProcessando(null); }
  }

  async function ignorar(item: Item) {
    if (!confirm(`Tirar ${item.convertido?.nome || 'este convertido'} da fila?`)) return;
    setProcessando(item.id);
    try {
      await api.ignorar(item.id);
      setItens((xs) => xs.filter((x) => x.id !== item.id));
    } catch (e: any) { toast.error(e.message); } finally { setProcessando(null); }
  }

  if (loading) return null;
  if (itens.length === 0) return null;

  return (
    <Card className="p-4 border-primary/30 bg-primary/5">
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Agente Batismo/Next</span>
          <Badge variant="secondary">{itens.length} convite{itens.length > 1 ? 's' : ''}</Badge>
        </div>
        {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <p className="text-xs text-muted-foreground mt-1">
        Convertidos chegando no prazo de 90 dias sem batismo/Next. Convite pronto — revise, abra no WhatsApp e confirme.
      </p>

      {aberto && (
        <div className="space-y-3 mt-3">
          {itens.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.convertido?.nome || '—'}</span>
                  {item.area && <Badge variant="outline" className="text-xs">{AREA_LABEL[item.area] || item.area}</Badge>}
                  {item.falta_batismo && <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">falta batismo</Badge>}
                  {item.falta_next && <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">falta Next</Badge>}
                  {item.dias != null && <span className="text-xs text-muted-foreground">{item.dias}d desde a conversão</span>}
                </div>
                {item.responsavel_nome && <span className="text-xs text-muted-foreground">Responsável: {item.responsavel_nome}</span>}
              </div>

              <Textarea
                rows={3}
                value={rascunhos[item.id] || ''}
                onChange={(e) => setRascunhos((r) => ({ ...r, [item.id]: e.target.value }))}
                placeholder="Escreva o convite..."
                className="text-sm"
              />

              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={() => abrirWhatsapp(item)} disabled={!item.telefone}>
                  <MessageCircle className="h-4 w-4 mr-1" /> Abrir no WhatsApp
                </Button>
                <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => marcarEnviado(item)} disabled={processando === item.id}>
                  {processando === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Convidei</>}
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => ignorar(item)} disabled={processando === item.id}>
                  <X className="h-4 w-4 mr-1" /> Ignorar
                </Button>
                {!item.telefone && <span className="text-xs text-amber-600">sem telefone</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
