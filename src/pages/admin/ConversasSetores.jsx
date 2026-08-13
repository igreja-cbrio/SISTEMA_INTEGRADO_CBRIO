// Admin · menu de setores do bot de triagem (Conversas). Edita os itens que o
// bot mostra quando alguém escreve no WhatsApp da igreja, e a área de cada um.
import { useState, useEffect, useCallback } from 'react';
import { waInbox } from '../../api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Loader2, Plus, Trash2, GripVertical, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function ConversasSetores() {
  const [setores, setSetores] = useState(null);
  const [erroSetores, setErroSetores] = useState(false);
  const [areas, setAreas] = useState([]);
  const [novo, setNovo] = useState({ rotulo: '', area: '', ordem: '' });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setErroSetores(false);
    waInbox.setores().then((r) => setSetores(r?.setores || [])).catch(() => { setSetores([]); setErroSetores(true); });
  }, []);
  useEffect(() => {
    carregar();
    waInbox.areas().then((r) => setAreas(r?.areas || [])).catch(() => {});
  }, [carregar]);

  async function salvar(s, patch) {
    try {
      await waInbox.salvarSetor(s.id, patch);
      setSetores((list) => list.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
    } catch (e) { toast.error(e?.message || 'Erro ao salvar'); carregar(); }
  }
  async function remover(s) {
    if (!window.confirm(`Remover o setor "${s.rotulo}" do menu?`)) return;
    try { await waInbox.removerSetor(s.id); setSetores((list) => list.filter((x) => x.id !== s.id)); }
    catch (e) { toast.error(e?.message || 'Erro ao remover'); }
  }
  async function criar() {
    if (!novo.rotulo.trim() || !novo.area) { toast.error('Preencha rótulo e área.'); return; }
    setSalvando(true);
    try {
      const ordem = novo.ordem !== '' ? Number(novo.ordem) : ((setores || []).reduce((m, s) => Math.max(m, s.ordem || 0), 0) + 1);
      await waInbox.criarSetor({ rotulo: novo.rotulo.trim(), area: novo.area, ordem });
      setNovo({ rotulo: '', area: '', ordem: '' });
      carregar();
    } catch (e) { toast.error(e?.message || 'Erro ao criar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" />Menu de setores · Conversas</h1>
        <p className="text-sm text-muted-foreground">
          Quando alguém desconhecido escreve no WhatsApp da igreja, o bot mostra este menu. A pessoa escolhe o setor,
          diz o nome, e a conversa vai pra área correspondente (que é notificada). Edite aqui sem precisar de deploy.
        </p>
      </div>

      <Card className="p-4">
        {setores === null ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : erroSetores ? (
          <div style={{ padding: 16, background: '#FCEBEB', border: '1px dashed #F09595', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#501313', marginBottom: 4 }}>Não foi possível carregar os setores</div>
            <div style={{ fontSize: 11, color: '#791F1F', marginBottom: 10 }}>Setores existentes podem estar configurados — não recrie sem confirmar.</div>
            <button onClick={carregar} style={{ background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Tentar de novo</button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[40px_1fr_1fr_70px_44px] gap-2 px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Ordem</span><span>Rótulo (no menu)</span><span>Área destino</span><span className="text-center">Ativo</span><span />
            </div>
            {setores.length === 0 && <p className="text-sm text-muted-foreground py-3 text-center">Nenhum setor. Adicione abaixo.</p>}
            {setores.map((s) => (
              <div key={s.id} className="grid grid-cols-[40px_1fr_1fr_70px_44px] gap-2 items-center">
                <Input type="number" className="h-9 px-1 text-center" defaultValue={s.ordem}
                  onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== s.ordem) salvar(s, { ordem: v }); }} />
                <Input className="h-9" defaultValue={s.rotulo}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.rotulo) salvar(s, { rotulo: v }); }} />
                <Select value={s.area} onValueChange={(v) => salvar(s, { area: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{areas.map((a) => <SelectItem key={a.nome} value={a.nome}>{a.nome}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex justify-center"><Switch checked={s.ativo} onCheckedChange={(v) => salvar(s, { ativo: v })} /></div>
                <button onClick={() => remover(s)} className="text-muted-foreground hover:text-red-500 flex justify-center" title="Remover"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}

            <div className="border-t border-border pt-3 mt-1">
              <div className="grid grid-cols-[40px_1fr_1fr_70px_44px] gap-2 items-center">
                <Input type="number" className="h-9 px-1 text-center" placeholder="#" value={novo.ordem} onChange={(e) => setNovo((n) => ({ ...n, ordem: e.target.value }))} />
                <Input className="h-9" placeholder="Novo setor (ex.: Financeiro)" value={novo.rotulo} onChange={(e) => setNovo((n) => ({ ...n, rotulo: e.target.value }))} />
                <Select value={novo.area} onValueChange={(v) => setNovo((n) => ({ ...n, area: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Área" /></SelectTrigger>
                  <SelectContent>{areas.map((a) => <SelectItem key={a.nome} value={a.nome}>{a.nome}</SelectItem>)}</SelectContent>
                </Select>
                <span />
                <Button size="icon" className="h-9 w-9" disabled={salvando} onClick={criar} title="Adicionar">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</Button>
              </div>
            </div>
          </div>
        )}
      </Card>
      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><GripVertical className="h-3.5 w-3.5" />A ordem define a numeração do menu (1, 2, 3…). Desativar tira do menu sem apagar.</p>
    </div>
  );
}
