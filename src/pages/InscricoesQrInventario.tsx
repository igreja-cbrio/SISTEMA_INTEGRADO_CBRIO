import { useCallback, useEffect, useState } from 'react';
import { inscricoesApi as api } from '../api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Loader2, QrCode, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

type QrItem = {
  id: string;
  primeira_emissao_em: string;
  ultima_emissao_em: string;
  emissoes: number;
  canais: string[];
  ativo: boolean;
  revogado_em: string | null;
  revogacao_motivo: string | null;
  inscricao?: {
    id: string;
    nome_completo: string;
    status: string;
    evento?: { id: string; nome: string; slug: string };
  };
};

type QrResposta = {
  items: QrItem[];
  total_elegiveis: number;
  total_registrados: number;
};

function mensagemErro(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function InscricoesQrInventario() {
  const [dados, setDados] = useState<QrResposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('');
  const [busca, setBusca] = useState('');

  const carregar = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (estado) qs.set('estado', estado);
    api.qrs(qs.toString()).then(setDados)
      .catch((error: unknown) => toast.error(mensagemErro(error, 'Erro ao carregar QRs')))
      .finally(() => setLoading(false));
  }, [estado]);

  useEffect(() => { carregar(); }, [carregar]);

  async function revogar(item: QrItem) {
    const motivo = window.prompt(`Motivo para revogar o comprovante de ${item.inscricao?.nome_completo || 'esta inscrição'}:`);
    if (!motivo) return;
    try {
      await api.revogarQr(item.id, motivo);
      toast.success('QR revogado; os demais comprovantes continuam válidos');
      carregar();
    } catch (error: unknown) { toast.error(mensagemErro(error, 'Erro ao revogar QR')); }
  }

  const itens: QrItem[] = (dados?.items || []).filter((item: QrItem) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return String(item.inscricao?.nome_completo || '').toLowerCase().includes(q)
      || String(item.inscricao?.evento?.nome || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card className="glass-solid p-3"><div className="text-2xl font-extrabold">{dados?.total_elegiveis ?? '—'}</div><div className="text-xs text-muted-foreground">inscrições elegíveis</div></Card>
        <Card className="glass-solid p-3"><div className="text-2xl font-extrabold">{dados?.total_registrados ?? '—'}</div><div className="text-xs text-muted-foreground">QRs já emitidos e registrados</div></Card>
        <Card className="glass-solid p-3"><div className="text-sm font-semibold flex items-center gap-1.5"><QrCode className="h-4 w-4 text-primary" /> Inventário seguro</div><div className="text-xs text-muted-foreground mt-1">O token bruto não é armazenado nem exibido.</div></Card>
      </div>

      <Card className="glass-solid p-4">
        <div className="flex gap-2 flex-wrap mb-3">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa ou evento" className="max-w-sm" />
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 text-sm">
            <option value="">Todos</option><option value="ativo">Ativos</option><option value="revogado">Revogados</option>
          </select>
        </div>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum QR registrado neste filtro.</p>
        ) : (
          <div className="divide-y divide-border">
            {itens.map((item) => (
              <div key={item.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <div className="text-sm font-medium">{item.inscricao?.nome_completo || 'Inscrição'}</div>
                  <div className="text-xs text-muted-foreground">{item.inscricao?.evento?.nome || 'Evento'} · emitido {item.emissoes}x · {(item.canais || []).join(', ') || 'api'}</div>
                  {item.revogacao_motivo && <div className="text-xs text-red-600 mt-0.5">{item.revogacao_motivo}</div>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${item.ativo ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'}`}>{item.ativo ? 'ativo' : 'revogado'}</span>
                {item.ativo && <Button size="sm" variant="outline" onClick={() => revogar(item)}><ShieldOff className="h-3.5 w-3.5 mr-1" /> Revogar</Button>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
