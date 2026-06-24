// Kids · Estoque por sala — a Mari Gaia controla, por sala, o que TEM (qtd_atual)
// e o que DEVERIA ter (qtd_esperada). Itens faltando ficam destacados. Itens
// duráveis podem ser "registrados no patrimônio" (tag Kids + localização da sala).
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { totemKids as api } from '../../../api';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Boxes, Plus, Loader2, Minus, Trash2, Package, AlertTriangle, Archive } from 'lucide-react';

const CATEGORIAS = ['Mobiliário', 'Brinquedos', 'Material', 'Higiene', 'Eletrônico', 'Outro'];

export default function EstoqueKids() {
  const navigate = useNavigate();
  const [salas, setSalas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoSala, setNovoSala] = useState<any>(null);
  const [editItem, setEditItem] = useState<any>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    api.estoque.list().then((d: any) => setSalas(Array.isArray(d) ? d : [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function ajustar(item: any, delta: number) {
    const novo = Math.max(0, (item.qtd_atual || 0) + delta);
    // otimista
    setSalas((prev) => prev.map((s) => ({ ...s, itens: s.itens.map((i: any) => (i.id === item.id ? { ...i, qtd_atual: novo } : i)) })));
    try { await api.estoque.update(item.id, { qtd_atual: novo }); } catch { toast.error('Erro ao ajustar'); carregar(); }
  }

  const totalFaltando = salas.reduce((acc, s) => acc + (s.faltando || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate('/ministerial/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Voltar ao hub do Kids</button>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Boxes className="h-5 w-5 text-primary" /> Estoque por sala</h1>
          <p className="text-sm text-muted-foreground">O que tem e o que deveria ter em cada sala. Item durável vai pro Patrimônio (tag Kids).</p>
        </div>
        {totalFaltando > 0 && <Badge variant="outline" className="text-amber-600 border-amber-400 shrink-0"><AlertTriangle className="h-3 w-3 mr-1" /> {totalFaltando} faltando</Badge>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : salas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma sala cadastrada. Crie salas em Configurações → Salas.</Card>
      ) : (
        <div className="space-y-3">
          {salas.map((s) => (
            <Card key={s.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.cor || '#00B39D'}1a` }}><Package className="h-4 w-4" style={{ color: s.cor || '#00B39D' }} /></div>
                  <div className="font-semibold text-sm truncate">{s.nome}</div>
                  {s.faltando > 0 && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">{s.faltando} faltando</Badge>}
                </div>
                <Button size="sm" variant="outline" onClick={() => setNovoSala(s)}><Plus className="h-4 w-4 md:mr-1" /><span className="hidden md:inline">Item</span></Button>
              </div>
              {(s.itens || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum item cadastrado.</p>
              ) : (
                <div className="space-y-1.5">
                  {s.itens.map((i: any) => {
                    const falta = (i.qtd_atual || 0) < (i.qtd_esperada || 0);
                    return (
                      <div key={i.id} className={`flex items-center gap-2 rounded-md border p-2 ${falta ? 'border-amber-400/50 bg-amber-500/5' : 'border-border'}`}>
                        <button onClick={() => setEditItem({ ...i, sala_id: s.id })} className="flex-1 min-w-0 text-left">
                          <div className="font-medium text-sm truncate flex items-center gap-1">{i.nome}{i.pat_bem_id && <Archive className="h-3 w-3 text-muted-foreground" />}</div>
                          <div className="text-xs text-muted-foreground">{i.categoria || 'Sem categoria'}{i.unidade && i.unidade !== 'un' ? ` · ${i.unidade}` : ''}</div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => ajustar(i, -1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted"><Minus className="h-3 w-3" /></button>
                          <span className={`text-sm font-semibold tabular-nums w-14 text-center ${falta ? 'text-amber-600' : ''}`}>{i.qtd_atual ?? 0}/{i.qtd_esperada ?? 0}</span>
                          <button onClick={() => ajustar(i, 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted"><Plus className="h-3 w-3" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {novoSala && <ItemModal sala={novoSala} onClose={() => setNovoSala(null)} onSaved={() => { setNovoSala(null); carregar(); }} />}
      {editItem && <ItemModal item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); carregar(); }} />}
    </div>
  );
}

// ── Modal de item (criar/editar) + registrar no patrimônio ───────────────────
function ItemModal({ sala, item, onClose, onSaved }: { sala?: any; item?: any; onClose: () => void; onSaved: () => void }) {
  const edit = !!item;
  const [nome, setNome] = useState(item?.nome || '');
  const [categoria, setCategoria] = useState(item?.categoria || '');
  const [unidade, setUnidade] = useState(item?.unidade || 'un');
  const [esperada, setEsperada] = useState(String(item?.qtd_esperada ?? 0));
  const [atual, setAtual] = useState(String(item?.qtd_atual ?? 0));
  const [observacao, setObservacao] = useState(item?.observacao || '');
  const [salvando, setSalvando] = useState(false);
  const [patrimoniando, setPatrimoniando] = useState(false);
  const [noPatrimonio, setNoPatrimonio] = useState(!!item?.pat_bem_id);

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe o nome do item'); return; }
    setSalvando(true);
    const body = { nome: nome.trim(), categoria: categoria || null, unidade: unidade || 'un', qtd_esperada: Number(esperada) || 0, qtd_atual: Number(atual) || 0, observacao: observacao.trim() || null };
    try {
      if (edit) await api.estoque.update(item.id, body);
      else await api.estoque.add(sala.id, body);
      toast.success(edit ? 'Item atualizado' : 'Item adicionado');
      onSaved();
    } catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setSalvando(false); }
  }
  async function remover() {
    if (!window.confirm('Remover este item do estoque?')) return;
    try { await api.estoque.remove(item.id); onSaved(); } catch (e: any) { toast.error(e?.message || 'Erro'); }
  }
  async function registrarPatrimonio() {
    setPatrimoniando(true);
    try { await api.estoque.registrarPatrimonio(item.id); toast.success('Registrado no patrimônio (tag Kids)'); setNoPatrimonio(true); }
    catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setPatrimoniando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{edit ? 'Editar item' : `Novo item · ${sala?.nome}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Item *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Cadeira infantil, Cola, Tablet" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Unidade</Label><Input value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="un, cx, pct" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Deveria ter</Label><Input type="number" min={0} value={esperada} onChange={(e) => setEsperada(e.target.value)} /></div>
            <div><Label className="text-xs">Tem agora</Label><Input type="number" min={0} value={atual} onChange={(e) => setAtual(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Observação</Label><Input value={observacao} onChange={(e) => setObservacao(e.target.value)} /></div>
          <Button onClick={salvar} disabled={salvando} className="w-full">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : (edit ? 'Salvar' : 'Adicionar item')}</Button>
          {edit && (
            <div className="flex items-center justify-between pt-1 border-t border-border mt-1">
              {noPatrimonio ? (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Archive className="h-3.5 w-3.5" /> No patrimônio</span>
              ) : (
                <Button variant="outline" size="sm" onClick={registrarPatrimonio} disabled={patrimoniando}>
                  {patrimoniando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Archive className="h-4 w-4 mr-1" /> Registrar no patrimônio</>}
                </Button>
              )}
              <button onClick={remover} className="text-xs text-red-500 inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
