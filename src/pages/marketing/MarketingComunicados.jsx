// ============================================================================
// Marketing · Comunicados (Mural) — cria conteúdo que vai pro app + push
// ============================================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { comunicados as api } from '../../api';
import MarketingNav from './MarketingNav';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { Megaphone, Plus, Send, Image as ImageIcon, Trash2, Archive, Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SEGMENTOS = [
  { v: 'todos', l: 'Todos os membros' },
  { v: 'ami', l: 'AMI' },
  { v: 'bridge', l: 'Bridge' },
  { v: 'online', l: 'Online' },
  { v: 'sede', l: 'Sede' },
  { v: 'kids', l: 'Kids' },
];
const segLabel = (v) => SEGMENTOS.find((s) => s.v === v)?.l || v;
const STATUS = {
  rascunho: { l: 'Rascunho', c: 'bg-slate-100 text-slate-700 border-slate-300' },
  publicado: { l: 'Publicado', c: 'bg-green-100 text-green-700 border-green-300' },
  arquivado: { l: 'Arquivado', c: 'bg-amber-100 text-amber-700 border-amber-300' },
};

const vazio = { titulo: '', corpo: '', segmento: 'todos', foto_url: null };

export default function MarketingComunicados() {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(vazio);
  const [editId, setEditId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const fileRef = useRef(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setLista(await api.list()); }
    catch (e) { toast.error(e?.message || 'Erro ao carregar'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function novo() { setForm(vazio); setEditId(null); setModal(true); }
  function editar(c) { setForm({ titulo: c.titulo, corpo: c.corpo, segmento: c.segmento, foto_url: c.foto_url }); setEditId(c.id); setModal(true); }

  async function enviarFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubindo(true);
    try {
      const { url } = await api.uploadFoto(file);
      setForm((f) => ({ ...f, foto_url: url }));
    } catch (err) { toast.error(err?.message || 'Erro ao enviar foto'); }
    finally { setSubindo(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function salvar() {
    if (!form.titulo.trim() || !form.corpo.trim()) { toast.error('Preencha título e corpo'); return; }
    setSalvando(true);
    try {
      if (editId) await api.update(editId, form);
      else await api.create(form);
      toast.success('Comunicado salvo');
      setModal(false); carregar();
    } catch (e) { toast.error(e?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  async function publicar(c) {
    if (!confirm(`Publicar "${c.titulo}" e enviar push pra ${segLabel(c.segmento)}?`)) return;
    try { await api.publicar(c.id); toast.success('Publicado! Push enviado.'); carregar(); }
    catch (e) { toast.error(e?.message || 'Erro ao publicar'); }
  }
  async function arquivar(c) { try { await api.arquivar(c.id); carregar(); } catch (e) { toast.error(e?.message); } }
  async function excluir(c) { if (!confirm('Excluir este comunicado?')) return; try { await api.remove(c.id); carregar(); } catch (e) { toast.error(e?.message); } }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="h-6 w-6 text-[#00B39D]" /> Comunicados</h1>
        <Button onClick={novo} className="bg-[#00B39D] hover:bg-[#009684] gap-1.5"><Plus className="h-4 w-4" /> Novo comunicado</Button>
      </div>
      <MarketingNav />
      <p className="text-sm text-muted-foreground">Avisos que aparecem no <b>mural do app</b>. Ao publicar, manda <b>push</b> pro público escolhido.</p>

      {carregando ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#00B39D]" /></div>
      ) : lista.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum comunicado ainda. Crie o primeiro!</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-3 flex gap-3 items-center">
                {c.foto_url ? <img src={c.foto_url} alt="" className="h-14 w-20 rounded object-cover shrink-0" /> : <div className="h-14 w-20 rounded bg-muted flex items-center justify-center shrink-0"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{c.titulo}</span>
                    <Badge variant="outline" className={`text-xs ${STATUS[c.status]?.c}`}>{STATUS[c.status]?.l}</Badge>
                    <Badge variant="secondary" className="text-xs">{segLabel(c.segmento)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{c.corpo}</div>
                  {c.publicado_em && <div className="text-[11px] text-muted-foreground mt-0.5">Publicado {format(new Date(c.publicado_em), "dd/MM 'às' HH:mm", { locale: ptBR })}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {c.status !== 'publicado' && <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1" onClick={() => publicar(c)}><Send className="h-3.5 w-3.5" /> Publicar</Button>}
                  <Button size="sm" variant="outline" onClick={() => editar(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                  {c.status === 'publicado' && <Button size="sm" variant="outline" onClick={() => arquivar(c)} title="Arquivar"><Archive className="h-3.5 w-3.5" /></Button>}
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => excluir(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Editar comunicado' : 'Novo comunicado'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Título</label>
              <Input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Culto especial de domingo" />
            </div>
            <div>
              <label className="text-sm font-medium">Mensagem</label>
              <Textarea value={form.corpo} onChange={(e) => setForm((f) => ({ ...f, corpo: e.target.value }))} rows={5} placeholder="Escreva o aviso..." />
            </div>
            <div>
              <label className="text-sm font-medium">Público</label>
              <Select value={form.segmento} onValueChange={(v) => setForm((f) => ({ ...f, segmento: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1001]">{SEGMENTOS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Foto (opcional)</label>
              <div className="flex items-center gap-3 mt-1">
                {form.foto_url ? <img src={form.foto_url} alt="" className="h-16 w-24 rounded object-cover" /> : <div className="h-16 w-24 rounded bg-muted flex items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}
                <input ref={fileRef} type="file" accept="image/*" onChange={enviarFoto} className="hidden" id="foto-com" />
                <Button variant="outline" size="sm" disabled={subindo} onClick={() => fileRef.current?.click()}>
                  {subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : (form.foto_url ? 'Trocar foto' : 'Enviar foto')}
                </Button>
                {form.foto_url && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setForm((f) => ({ ...f, foto_url: null }))}>Remover</Button>}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
              <Button className="bg-[#00B39D] hover:bg-[#009684]" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
