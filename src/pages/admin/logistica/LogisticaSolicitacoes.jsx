import { useState, useEffect, useCallback } from 'react';
import { solicitacoes as api } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { toast } from 'sonner';

// Aba "Solicitações" do módulo Logística · a fila do Amaury (líder de logística) DENTRO
// do módulo dele, sem precisar abrir o /solicitacoes genérico (princípio do Marcos:
// "cada um vê só o seu módulo"). Reusa o backend de Solicitações + o fluxo de cotação.
const AREAS = ['logistica_compras', 'manutencao', 'reserva_espaco', 'logistica_estoque'];
const AREA_LABEL = {
  logistica_compras: 'Compras',
  manutencao: 'Manutenção',
  reserva_espaco: 'Reserva de espaço',
  logistica_estoque: 'Estoque',
};
const STATUS_META = {
  em_cotacao:                       { label: 'Em cotação',             cls: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
  aguardando_aprovacao_origem:      { label: 'Aguardando diretor',     cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  aguardando_aprovacao_financeira:  { label: 'Aprov. financeira (Yago)', cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  pendente:                         { label: 'A comprar',              cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  em_analise:                       { label: 'Em análise',             cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  aprovado:                         { label: 'Aprovado',               cls: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  em_atendimento:                   { label: 'Em atendimento',         cls: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  aguardando_entrega:               { label: 'Aguardando entrega',     cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-400' },
  concluido:                        { label: 'Concluído',              cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  rejeitado:                        { label: 'Rejeitado',              cls: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  cancelado:                        { label: 'Cancelado',              cls: 'bg-muted text-muted-foreground' },
  aguardando_ajuste:                { label: 'Aguardando ajuste',      cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
};
const fmtBRL = (n) => n != null ? `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const statusMeta = (s) => STATUS_META[s] || { label: s || '—', cls: 'bg-muted text-muted-foreground' };

export default function LogisticaSolicitacoes() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('acao'); // 'acao' | 'todas' | <status>
  const [detalhe, setDetalhe] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const data = await api.list();
      const fila = (data || []).filter(s => AREAS.includes(s.area_responsavel));
      // o que precisa de ação (cotar) primeiro · depois mais recentes
      fila.sort((a, b) => {
        const rank = (s) => s.status === 'em_cotacao' ? 0 : 1;
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return new Date(b.created_at) - new Date(a.created_at);
      });
      setItems(fila);
    } catch (e) { setErro(e.message || 'Erro ao carregar solicitações'); }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const aCotar = items.filter(s => s.status === 'em_cotacao').length;
  const visiveis = filtro === 'todas' ? items
    : filtro === 'acao' ? items.filter(s => ['em_cotacao', 'pendente', 'aprovado'].includes(s.status))
    : items.filter(s => s.status === filtro);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          Suas solicitações de logística (compras, manutenção, reserva, estoque).{' '}
          {aCotar > 0 && <span className="text-cyan-700 dark:text-cyan-400 font-medium">{aCotar} aguardando cotação.</span>}
        </div>
        <div className="flex gap-2">
          <select value={filtro} onChange={e => setFiltro(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="acao">Precisa de ação</option>
            <option value="todas">Todas</option>
            <option value="em_cotacao">Em cotação</option>
            <option value="pendente">A comprar</option>
            <option value="em_atendimento">Em atendimento</option>
            <option value="concluido">Concluídas</option>
          </select>
          <Button variant="outline" size="sm" onClick={carregar}>Atualizar</Button>
        </div>
      </div>

      {erro && <div className="text-sm text-red-600 bg-red-500/10 rounded-lg px-3 py-2">{erro}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
        </div>
      ) : visiveis.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma solicitação nessa visão.</Card>
      ) : (
        <div className="space-y-2">
          {visiveis.map(s => {
            const st = statusMeta(s.status);
            const cotar = s.status === 'em_cotacao';
            const valor = s.valor_cotado ?? s.valor_estimado;
            return (
              <Card key={s.id} onClick={() => setDetalhe(s)}
                className={`p-3 cursor-pointer hover:shadow-md transition-shadow ${cotar ? 'border-l-4 border-l-cyan-500' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {AREA_LABEL[s.area_responsavel] || s.area_responsavel} · {s.solicitante?.name || '—'} · {fmtData(s.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {valor != null && <span className="text-sm font-medium">{fmtBRL(valor)}</span>}
                    <Badge className={`text-xs ${st.cls}`}>{st.label}</Badge>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <DetalheModal item={detalhe} onClose={() => setDetalhe(null)} onChanged={carregar} />
    </div>
  );
}

function DetalheModal({ item, onClose, onChanged }) {
  const [valor, setValor] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  if (!item) return null;
  const emCotacao = item.status === 'em_cotacao';
  const jaCotado = item.valor_cotado != null;
  const st = statusMeta(item.status);

  async function cotar() {
    const v = Number(valor);
    if (valor === '' || Number.isNaN(v) || v < 0) { toast.error('Informe o valor cotado.'); return; }
    setSaving(true);
    try {
      await api.registrarCotacao(item.id, {
        valor_cotado: v,
        fornecedor: fornecedor.trim() || undefined,
        observacao: obs.trim() || undefined,
      });
      toast.success('Cotação registrada · enviada pro financeiro.');
      onChanged?.(); onClose();
    } catch (e) { toast.error(e.message || 'Erro ao registrar cotação'); }
    setSaving(false);
  }

  async function mudar(novo, msg) {
    setSaving(true);
    try {
      await api.update(item.id, { status: novo });
      toast.success(msg);
      onChanged?.(); onClose();
    } catch (e) { toast.error(e.message || 'Erro ao atualizar'); }
    setSaving(false);
  }

  return (
    <Dialog open={!!item} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item.titulo}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Área</span><p className="font-medium">{AREA_LABEL[item.area_responsavel] || item.area_responsavel}</p></div>
            <div><span className="text-muted-foreground">Status</span><p><Badge className={`text-xs ${st.cls}`}>{st.label}</Badge></p></div>
            <div><span className="text-muted-foreground">Solicitante</span><p className="font-medium">{item.solicitante?.name || '—'}</p></div>
            <div><span className="text-muted-foreground">Data</span><p className="font-medium">{fmtData(item.created_at)}</p></div>
            {item.valor_estimado != null && <div><span className="text-muted-foreground">Valor estimado</span><p className="font-medium">{fmtBRL(item.valor_estimado)}</p></div>}
          </div>
          {item.descricao && <div><span className="text-muted-foreground">Descrição</span><p className="whitespace-pre-wrap mt-1">{item.descricao}</p></div>}
          {item.itens && <div><span className="text-muted-foreground">Itens</span><p className="whitespace-pre-wrap mt-1">{item.itens}</p></div>}
          {item.favorecido_nome && <div><span className="text-muted-foreground">Fornecedor sugerido</span><p className="mt-1">{item.favorecido_nome}</p></div>}

          {jaCotado && (
            <div className="border-t border-border pt-3 space-y-1">
              <p className="font-semibold">Cotação</p>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Valor cotado</span><p className="font-medium">{fmtBRL(item.valor_cotado)}</p></div>
                {item.cotacao_fornecedor && <div><span className="text-muted-foreground">Fornecedor</span><p className="font-medium">{item.cotacao_fornecedor}</p></div>}
              </div>
              {item.cotacao_observacao && <p className="text-muted-foreground text-xs whitespace-pre-wrap">{item.cotacao_observacao}</p>}
            </div>
          )}

          {emCotacao && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="font-semibold">Registrar cotação</p>
              <p className="text-xs text-muted-foreground">Levante o valor com o fornecedor. Ao registrar, segue pro financeiro (Yago) aprovar sobre o valor real.</p>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Valor cotado (R$) *</Label><Input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" /></div>
                <div><Label className="text-xs">Fornecedor</Label><Input value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="Nome do fornecedor" /></div>
              </div>
              <div><Label className="text-xs">Observação</Label><Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Prazo de entrega, condições, link da cotação..." /></div>
              <div className="flex justify-end"><Button size="sm" onClick={cotar} disabled={saving}>{saving ? 'Registrando...' : 'Registrar cotação → financeiro'}</Button></div>
            </div>
          )}

          {['pendente', 'aprovado'].includes(item.status) && (
            <div className="border-t border-border pt-3 flex justify-end">
              <Button size="sm" onClick={() => mudar('em_atendimento', 'Em atendimento')} disabled={saving}>Iniciar atendimento</Button>
            </div>
          )}
          {['em_atendimento', 'aguardando_entrega'].includes(item.status) && (
            <div className="border-t border-border pt-3 flex justify-end">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => mudar('concluido', 'Concluído')} disabled={saving}>Marcar como concluído</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
