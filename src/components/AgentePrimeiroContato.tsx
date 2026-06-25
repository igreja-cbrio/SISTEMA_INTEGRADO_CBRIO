// ============================================================================
// Agente de Primeiro Contato · fila de revisão (UI)
// ============================================================================
// Mostra os convertidos sem contato com a mensagem JÁ rascunhada pelo agente.
// O líder revisa (pode editar), abre no WhatsApp em 1 toque e marca como feito.
// Modo seguro: o agente nunca envia — quem envia é o líder.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { agentePrimeiroContato as api } from '../api';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Sparkles, MessageCircle, Check, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

type Item = {
  id: string;
  convertido_id: string;
  area: string | null;
  responsavel_nome: string | null;
  mensagem_rascunho: string | null;
  telefone: string | null;
  prazo: string | null;
  created_at: string;
  convertido?: { nome: string; data_culto: string | null } | null;
};

const AREA_LABEL: Record<string, string> = { ami: 'AMI', bridge: 'Bridge', online: 'Online', sede: 'Sede' };

function diasDe(dataCulto?: string | null) {
  if (!dataCulto) return null;
  return Math.floor((Date.now() - new Date(dataCulto + 'T12:00:00').getTime()) / 86400000);
}

export default function AgentePrimeiroContato() {
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
    const msg = encodeURIComponent(rascunhos[item.id] || '');
    window.open(`https://wa.me/${num}?text=${msg}`, '_blank', 'noopener,noreferrer');
  }

  async function marcarEnviado(item: Item) {
    setProcessando(item.id);
    try {
      const editou = (rascunhos[item.id] || '') !== (item.mensagem_rascunho || '');
      await api.enviado(item.id, editou);
      toast.success('Contato registrado 💙');
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
          <span className="font-semibold text-sm">Agente de primeiro contato</span>
          <Badge variant="secondary">{itens.length} pendente{itens.length > 1 ? 's' : ''}</Badge>
        </div>
        {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <p className="text-xs text-muted-foreground mt-1">
        Convertidos sem contato. A mensagem já vem pronta — revise, abra no WhatsApp e confirme. (O agente não envia sozinho.)
      </p>

      {aberto && (
        <div className="space-y-3 mt-3">
          {itens.map((item) => {
            const dias = diasDe(item.convertido?.data_culto);
            return (
              <div key={item.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.convertido?.nome || '—'}</span>
                    {item.area && <Badge variant="outline" className="text-xs">{AREA_LABEL[item.area] || item.area}</Badge>}
                    {dias != null && <span className={`text-xs ${dias > 3 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>há {dias}d</span>}
                  </div>
                  {item.responsavel_nome && <span className="text-xs text-muted-foreground">Responsável: {item.responsavel_nome}</span>}
                </div>

                <Textarea
                  rows={3}
                  value={rascunhos[item.id] || ''}
                  onChange={(e) => setRascunhos((r) => ({ ...r, [item.id]: e.target.value }))}
                  placeholder="Escreva a mensagem de primeiro contato..."
                  className="text-sm"
                />

                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" onClick={() => abrirWhatsapp(item)} disabled={!item.telefone}>
                    <MessageCircle className="h-4 w-4 mr-1" /> Abrir no WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => marcarEnviado(item)} disabled={processando === item.id}>
                    {processando === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Marquei contato</>}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => ignorar(item)} disabled={processando === item.id}>
                    <X className="h-4 w-4 mr-1" /> Ignorar
                  </Button>
                  {!item.telefone && <span className="text-xs text-amber-600">sem telefone</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
