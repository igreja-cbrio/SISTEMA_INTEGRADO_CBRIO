/**
 * Caixa de entrada de encaminhamentos da jornada.
 * Reutilizável: Grupos (destino=grupos), Voluntários (voluntarios), Jornada 180 (jornada180).
 * O pastor encaminha o convertido (desfecho do encontro em /cuidados); aqui a área
 * receptora faz o primeiro contato, registra observação (fica na ficha) e a devolutiva
 * (não respondeu / em dúvida / engajou / sem interesse).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { encaminhamentos as api } from '../api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Inbox, Loader2, Phone, MessageCircle, MapPin, Mail, PlusCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const STATUS: Record<string, { label: string; color: string }> = {
  pendente:      { label: 'Pendente',      color: '#f59e0b' },
  nao_respondeu: { label: 'Não respondeu', color: '#6b7280' },
  em_duvida:     { label: 'Em dúvida',     color: '#3b82f6' },
  engajou:       { label: 'Engajou',       color: '#10b981' },
  sem_interesse: { label: 'Sem interesse', color: '#ef4444' },
};
const CANAIS = [
  { v: 'ligacao', l: 'Ligação', icon: Phone },
  { v: 'whatsapp', l: 'WhatsApp', icon: MessageCircle },
  { v: 'presencial', l: 'Presencial', icon: MapPin },
  { v: 'mensagem', l: 'Mensagem', icon: Mail },
  { v: 'outro', l: 'Outro', icon: MessageCircle },
];
const DEVOLUTIVAS = [
  { v: 'nao_respondeu', l: 'Não respondeu' },
  { v: 'em_duvida', l: 'Está em dúvida' },
  { v: 'engajou', l: 'Engajou' },
  { v: 'sem_interesse', l: 'Sem interesse' },
];

function fmtData(d: string | null) {
  if (!d) return '—';
  const iso = d.length === 10 ? d + 'T12:00:00' : d;
  return new Date(iso).toLocaleDateString('pt-BR');
}
function StatusBadge({ s }: { s: string }) {
  const m = STATUS[s] || STATUS.pendente;
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{ background: m.color + '22', color: m.color, border: `1px solid ${m.color}40` }}>
      {m.label}
    </span>
  );
}

function ContatoDialog({ enc, canWrite, onClose, onChanged }: {
  enc: any | null; canWrite: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ canal: 'ligacao', observacao: '', devolutiva: '' });

  useEffect(() => {
    if (!enc) { setDetail(null); return; }
    setLoading(true);
    setForm({ canal: 'ligacao', observacao: '', devolutiva: '' });
    api.get(enc.id).then(setDetail).catch(() => {}).finally(() => setLoading(false));
  }, [enc]);

  async function registrar() {
    if (!form.observacao.trim() && !form.devolutiva) return toast.error('Escreva a observação ou marque a devolutiva');
    setSaving(true);
    try {
      await api.contato(enc.id, {
        canal: form.canal,
        observacao: form.observacao.trim() || null,
        devolutiva: form.devolutiva || null,
      });
      toast.success('Contato registrado');
      const fresh = await api.get(enc.id).catch(() => null);
      if (fresh) setDetail(fresh);
      setForm({ canal: 'ligacao', observacao: '', devolutiva: '' });
      onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  if (!enc) return null;
  const contatos: any[] = detail?.contatos || [];

  return (
    <Dialog open={!!enc} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>{enc.nome}</span>
            <StatusBadge s={detail?.status || enc.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Telefone</dt>
            <dd>{enc.telefone || '—'}</dd>
            <dt className="text-muted-foreground">Encaminhado em</dt>
            <dd>{fmtData(enc.encaminhado_em)}</dd>
          </dl>

          {enc.observacao && (
            <div className="rounded-md border border-border p-3 text-sm" style={{ background: 'var(--cbrio-input-bg)' }}>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nota do pastor</span>
              <p className="mt-1 whitespace-pre-wrap">{enc.observacao}</p>
            </div>
          )}

          {/* Histórico de contatos · fica na ficha */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Histórico de contato</h3>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : contatos.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhum contato registrado ainda.</p>
            ) : (
              <ul className="space-y-2">
                {contatos.map((c: any) => {
                  const canal = CANAIS.find(x => x.v === c.canal);
                  return (
                    <li key={c.id} className="rounded-md border border-border p-2.5 text-sm" style={{ background: 'var(--cbrio-input-bg)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />{fmtData(c.data_contato)}{canal ? ` · ${canal.l}` : ''}
                        </span>
                        {c.devolutiva && <StatusBadge s={c.devolutiva} />}
                      </div>
                      {c.observacao && <p className="mt-1 whitespace-pre-wrap">{c.observacao}</p>}
                      {c.feito_por_nome && <p className="mt-1 text-xs text-muted-foreground">— {c.feito_por_nome}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Registrar novo contato */}
          {canWrite && (
            <section className="rounded-md border border-border p-3 space-y-3" style={{ background: 'var(--cbrio-card)' }}>
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><PlusCircle className="h-4 w-4 text-primary" />Registrar contato</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Canal</Label>
                  <Select value={form.canal} onValueChange={(v) => setForm(f => ({ ...f, canal: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CANAIS.map(c => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Devolutiva</Label>
                  <Select value={form.devolutiva || '__none'} onValueChange={(v) => setForm(f => ({ ...f, devolutiva: v === '__none' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Sem mudança" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem mudança</SelectItem>
                      {DEVOLUTIVAS.map(d => <SelectItem key={d.v} value={d.v}>{d.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Observação (fica na ficha)</Label>
                <textarea
                  className="w-full min-h-[64px] rounded-md border border-border p-2 text-sm"
                  style={{ background: 'var(--cbrio-input-bg)' }}
                  value={form.observacao}
                  onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                  placeholder="O que rolou no contato, próximos passos..."
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={registrar} disabled={saving}>{saving ? 'Salvando...' : 'Registrar contato'}</Button>
              </div>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EncaminhamentosInbox({ destino, canWrite = true }: { destino: 'grupos' | 'voluntarios' | 'jornada180'; canWrite?: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'a_fazer' | 'atendidos' | 'engajou' | 'todos'>('a_fazer');
  const [aberto, setAberto] = useState<any | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    api.list({ destino }).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, [destino]);

  useEffect(() => { reload(); }, [reload]);

  const filtrados = useMemo(() => {
    if (filtro === 'todos') return items;
    if (filtro === 'engajou') return items.filter(i => i.status === 'engajou');
    if (filtro === 'atendidos') return items.filter(i => !!i.recebido_em); // já recebeu contato do líder
    return items.filter(i => ['pendente', 'nao_respondeu', 'em_duvida'].includes(i.status)); // a fazer
  }, [items, filtro]);

  const aFazer = useMemo(() => items.filter(i => ['pendente', 'nao_respondeu', 'em_duvida'].includes(i.status)).length, [items]);
  const atendidos = useMemo(() => items.filter(i => !!i.recebido_em).length, [items]);
  const engajaram = useMemo(() => items.filter(i => i.status === 'engajou').length, [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Inbox className="h-4 w-4 text-primary" />
          <strong className="text-foreground">{aFazer}</strong> a contatar · <strong className="text-foreground">{atendidos}</strong> já atendidos · <strong className="text-foreground">{engajaram}</strong> engajaram
        </div>
        <Select value={filtro} onValueChange={(v: any) => setFiltro(v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="a_fazer">A contatar</SelectItem>
            <SelectItem value="atendidos">Já atendidos</SelectItem>
            <SelectItem value="engajou">Engajaram</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Encaminhado</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground inline" /></TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                {items.length === 0 ? 'Nenhuma pessoa encaminhada ainda.' : 'Nada neste filtro.'}
              </TableCell></TableRow>
            ) : filtrados.map(i => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">
                  <button type="button" onClick={() => setAberto(i)} className="text-left hover:text-primary transition-colors underline-offset-2 hover:underline">
                    {i.nome}
                  </button>
                  {i.telefone && <div className="text-xs text-muted-foreground">{i.telefone}</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{fmtData(i.encaminhado_em)}</TableCell>
                <TableCell><StatusBadge s={i.status} /></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setAberto(i)}>Abrir</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ContatoDialog enc={aberto} canWrite={canWrite} onClose={() => setAberto(null)} onChanged={reload} />
    </div>
  );
}
