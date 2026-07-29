import { useCallback, useEffect, useState } from 'react';
import { inscricoesApi as api } from '../api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Loader2, QrCode, ShieldOff, ShieldCheck, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
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
  revogado_por_nome: string | null;
  reativado_em: string | null;
  reativacao_motivo: string | null;
  reativado_por_nome: string | null;
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
  total_paginas: number;
  page: number;
  por_pagina: number;
  inventario_disponivel?: boolean;
  reativacao_disponivel?: boolean;
  aviso?: string;
};

function mensagemErro(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function dataHora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function InscricoesQrInventario({ eventos = [] }: { eventos?: any[] }) {
  const [dados, setDados] = useState<QrResposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('');
  const [eventoId, setEventoId] = useState('');
  const [busca, setBusca] = useState('');
  // Busca e paginação são SERVER-SIDE: filtrar só a página carregada esconderia
  // a maior parte das pessoas num evento do tamanho do Celebra.
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (estado) qs.set('estado', estado);
    if (eventoId) qs.set('evento_id', eventoId);
    if (buscaAplicada) qs.set('q', buscaAplicada);
    if (page) qs.set('page', String(page));
    api.qrs(qs.toString()).then(setDados)
      .catch((error: unknown) => toast.error(mensagemErro(error, 'Erro ao carregar QRs')))
      .finally(() => setLoading(false));
  }, [estado, eventoId, buscaAplicada, page]);

  useEffect(() => { carregar(); }, [carregar]);

  async function revogar(item: QrItem) {
    const nome = item.inscricao?.nome_completo || 'esta inscrição';
    const motivo = window.prompt(`Motivo para revogar o comprovante de ${nome}:`);
    if (!motivo?.trim()) return;
    try {
      await api.revogarQr(item.id, motivo.trim());
      toast.success('QR revogado; os demais comprovantes continuam válidos');
      carregar();
    } catch (error: unknown) { toast.error(mensagemErro(error, 'Erro ao revogar QR')); }
  }

  // O comprovante é HMAC do id da inscrição: revogar não gira segredo nem gera
  // QR novo, então reativar é o ÚNICO caminho de volta de um clique errado.
  async function reativar(item: QrItem) {
    const nome = item.inscricao?.nome_completo || 'esta inscrição';
    const motivo = window.prompt(`Motivo para reativar o comprovante de ${nome}:`, 'revogação indevida');
    if (!motivo?.trim()) return;
    try {
      await api.reativarQr(item.id, motivo.trim());
      toast.success('QR reativado; a pessoa volta a entrar pelo comprovante');
      carregar();
    } catch (error: unknown) { toast.error(mensagemErro(error, 'Erro ao reativar QR')); }
  }

  const itens = dados?.items || [];
  const totalPaginas = dados?.total_paginas ?? 1;
  const podeReativar = dados?.reativacao_disponivel !== false;
  const inventarioIndisponivel = dados?.inventario_disponivel === false;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card className="glass-solid p-3"><div className="text-2xl font-extrabold">{dados?.total_elegiveis ?? '—'}</div><div className="text-xs text-muted-foreground">inscrições elegíveis</div></Card>
        <Card className="glass-solid p-3"><div className="text-2xl font-extrabold">{dados?.total_registrados ?? '—'}</div><div className="text-xs text-muted-foreground">QRs no filtro atual</div></Card>
        <Card className="glass-solid p-3"><div className="text-sm font-semibold flex items-center gap-1.5"><QrCode className="h-4 w-4 text-primary" /> Inventário seguro</div><div className="text-xs text-muted-foreground mt-1">O token bruto não é armazenado nem exibido.</div></Card>
      </div>

      {(inventarioIndisponivel || dados?.aviso) && (
        <Card className="glass-solid p-3 border-amber-500/40">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <span>{dados?.aviso || 'Inventário indisponível no banco.'}</span>
          </div>
        </Card>
      )}

      <Card className="glass-solid p-4">
        <div className="flex gap-2 flex-wrap mb-3">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa (nome completo)" className="max-w-sm" />
          <select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(0); }} className="h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 text-sm">
            <option value="">Todos</option><option value="ativo">Ativos</option><option value="revogado">Revogados</option>
          </select>
          <select value={eventoId} onChange={(e) => { setEventoId(e.target.value); setPage(0); }} className="h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 text-sm max-w-[280px]">
            <option value="">Todos os eventos</option>
            {eventos.map((ev: any) => (
              <option key={ev.id} value={ev.id}>{ev.nome}{ev.edicao_rotulo ? ` · ${ev.edicao_rotulo}` : ''}</option>
            ))}
          </select>
        </div>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum QR registrado neste filtro.</p>
        ) : (
          <>
            <div className="divide-y divide-border">
              {itens.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="text-sm font-medium">{item.inscricao?.nome_completo || 'Inscrição'}</div>
                    <div className="text-xs text-muted-foreground">{item.inscricao?.evento?.nome || 'Evento'} · emitido {item.emissoes}x · {(item.canais || []).join(', ') || 'api'} · último em {dataHora(item.ultima_emissao_em)}</div>
                    {!item.ativo && (
                      <div className="text-xs text-red-600 mt-0.5">
                        Revogado {dataHora(item.revogado_em)}{item.revogado_por_nome ? ` por ${item.revogado_por_nome}` : ''}{item.revogacao_motivo ? ` — ${item.revogacao_motivo}` : ''}
                      </div>
                    )}
                    {item.ativo && item.reativado_em && (
                      <div className="text-xs text-amber-600 mt-0.5">
                        Reativado {dataHora(item.reativado_em)}{item.reativado_por_nome ? ` por ${item.reativado_por_nome}` : ''}{item.reativacao_motivo ? ` — ${item.reativacao_motivo}` : ''}
                      </div>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${item.ativo ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'}`}>{item.ativo ? 'ativo' : 'revogado'}</span>
                  {item.ativo
                    ? <Button size="sm" variant="outline" onClick={() => revogar(item)}><ShieldOff className="h-3.5 w-3.5 mr-1" /> Revogar</Button>
                    : <Button size="sm" variant="outline" disabled={!podeReativar} title={podeReativar ? undefined : 'Depende de migration ainda não aplicada'} onClick={() => reativar(item)}><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Reativar</Button>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-3 mt-1 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Página {page + 1} de {totalPaginas} · {dados?.total_registrados ?? 0} QRs no filtro
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                </Button>
                <Button size="sm" variant="outline" disabled={page + 1 >= totalPaginas || loading} onClick={() => setPage((p) => p + 1)}>
                  Próxima <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
