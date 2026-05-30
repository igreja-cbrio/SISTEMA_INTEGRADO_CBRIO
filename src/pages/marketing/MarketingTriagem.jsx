import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { marketing as api } from '../../api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Inbox, Plus, Loader2, ArrowRight, User2 } from 'lucide-react';
import { toast } from 'sonner';
import MarketingNav from './MarketingNav';

const PUBLICO_LABEL = {
  voluntarios: 'Voluntários', membros: 'Membros', visitantes: 'Visitantes / novos',
  lideranca: 'Liderança', comunidade: 'Comunidade externa', igreja_toda: 'Igreja toda', outro: 'Outro',
};
const COMPLEXIDADE = [
  { value: 'simples',  label: 'Simples · 3–4 semanas' },
  { value: 'media',    label: 'Média · ~1 mês' },
  { value: 'complexa', label: 'Complexa · 5–8 semanas' },
];

// Triagem (Redesenho Fase 2): demandas-dor aguardando o Pedro definir a solução
// e criar os entregáveis. A "dor" é a campanha; os entregáveis são cards.
export default function MarketingTriagem() {
  const { isAdmin, modulePerms } = useAuth();
  const lvl = Math.max(modulePerms?.marketing?.leitura || 0, modulePerms?.marketing?.escrita || 0);
  const podeTriar = isAdmin || lvl >= 5;

  const [campanhas, setCampanhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipos, setTipos] = useState([]);
  const [membros, setMembros] = useState([]);
  const [sel, setSel] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [c, e, m] = await Promise.all([
        api.campanhas.list('triagem'),
        api.etiquetas(),
        api.membros(),
      ]);
      setCampanhas(c || []);
      setTipos((e?.tipos || []).filter(t => t.ativo !== false));
      setMembros(m || []);
    } catch (err) { toast.error(err.message || 'Erro ao carregar triagem'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (!podeTriar) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center max-w-md mx-auto">
          <p className="text-muted-foreground">Acesso restrito · só a coordenação do Marketing tria as demandas.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" /> Triagem
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Demandas (dores) aguardando você definir a solução e os entregáveis.
          </p>
        </div>
        <MarketingNav />
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin mx-auto my-12 text-muted-foreground" />
      ) : campanhas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma demanda na triagem. Quando alguém abrir uma solicitação de Marketing (e o diretor aprovar), ela cai aqui.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {campanhas.map(c => (
            <Card key={c.id} className="p-4 space-y-2 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSel(c)}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm">{c.titulo}</p>
                <Badge variant="secondary" className="shrink-0">{c.total_cards} entreg.</Badge>
              </div>
              {c.dor_descricao && <p className="text-xs text-muted-foreground line-clamp-3">{c.dor_descricao}</p>}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
                {c.publico_alvo && <Badge variant="outline">{PUBLICO_LABEL[c.publico_alvo] || c.publico_alvo}</Badge>}
                {c.solicitante_nome && <span className="flex items-center gap-1"><User2 className="h-3 w-3" />{c.solicitante_nome}</span>}
              </div>
              <Button size="sm" variant="ghost" className="w-full justify-between mt-1" onClick={(ev) => { ev.stopPropagation(); setSel(c); }}>
                Triar <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <TriagemSheet campanha={sel} tipos={tipos} membros={membros} onClose={() => setSel(null)} onChanged={carregar} />
    </div>
  );
}

function TriagemSheet({ campanha, tipos, membros, onClose, onChanged }) {
  const open = !!campanha;
  const [detalhe, setDetalhe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState({ complexidade: '', prazo_entrega: '' });
  const [novo, setNovo] = useState({ titulo: '', etiqueta_tipo_id: '', atribuido_a: '', duracao_dias: '', pode_paralelo: true });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!campanha) { setDetalhe(null); return; }
    setMeta({
      complexidade: campanha.complexidade || '',
      prazo_entrega: campanha.prazo_entrega ? campanha.prazo_entrega.slice(0, 10) : '',
    });
    setLoading(true);
    api.campanhas.get(campanha.id).then(setDetalhe).catch(e => toast.error(e.message)).finally(() => setLoading(false));
  }, [campanha]);

  async function salvarMeta(patch) {
    try { await api.campanhas.update(campanha.id, patch); }
    catch (e) { toast.error(e.message); }
  }

  async function addEntregavel() {
    if (!novo.titulo.trim()) { toast.error('Informe o título do entregável'); return; }
    setSalvando(true);
    try {
      await api.campanhas.criarCard(campanha.id, {
        titulo: novo.titulo.trim(),
        etiqueta_tipo_id: novo.etiqueta_tipo_id || null,
        atribuido_a: novo.atribuido_a || null,
        duracao_dias: novo.duracao_dias ? parseInt(novo.duracao_dias, 10) : null,
        pode_paralelo: novo.pode_paralelo,
      });
      toast.success('Entregável criado');
      setNovo({ titulo: '', etiqueta_tipo_id: '', atribuido_a: '', duracao_dias: '', pode_paralelo: true });
      setDetalhe(await api.campanhas.get(campanha.id));
      onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>{campanha?.titulo}</SheetTitle></SheetHeader>
        {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" /> : detalhe && (
          <div className="space-y-5 mt-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">A dor / objetivo</Label>
              <p className="text-sm whitespace-pre-wrap">{detalhe.dor_descricao || '—'}</p>
              <div className="flex flex-wrap gap-2 pt-1 text-xs">
                {detalhe.publico_alvo && <Badge variant="outline">Público: {PUBLICO_LABEL[detalhe.publico_alvo] || detalhe.publico_alvo}</Badge>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
              <div className="space-y-2">
                <Label className="text-xs">Complexidade</Label>
                <Select value={meta.complexidade} onValueChange={v => { setMeta(m => ({ ...m, complexidade: v })); salvarMeta({ complexidade: v }); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {COMPLEXIDADE.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Entrega ao solicitante</Label>
                <Input type="date" value={meta.prazo_entrega}
                  onChange={e => setMeta(m => ({ ...m, prazo_entrega: e.target.value }))}
                  onBlur={() => salvarMeta({ prazo_entrega: meta.prazo_entrega ? new Date(meta.prazo_entrega + 'T12:00:00').toISOString() : null })} />
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <Label className="text-sm">Entregáveis ({detalhe.cards?.length || 0})</Label>
              {(detalhe.cards || []).map(card => (
                <Card key={card.id} className="p-2 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{card.titulo}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {card.duracao_dias ? `${card.duracao_dias}d ` : ''}{card.pode_paralelo ? '· paralela' : '· foco'}
                  </span>
                </Card>
              ))}

              <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
                <Input placeholder="Novo entregável (ex: Reels de divulgação)" value={novo.titulo}
                  onChange={e => setNovo(n => ({ ...n, titulo: e.target.value }))} className="h-8 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={novo.etiqueta_tipo_id || '__none__'} onValueChange={v => setNovo(n => ({ ...n, etiqueta_tipo_id: v === '__none__' ? '' : v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(sem etiqueta)</SelectItem>
                      {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={novo.atribuido_a || '__none__'} onValueChange={v => setNovo(n => ({ ...n, atribuido_a: v === '__none__' ? '' : v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Dono" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">(sem dono)</SelectItem>
                      {membros.map(m => <SelectItem key={m.id} value={m.id}>{(m.profile?.name || m.nome_display || '—')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" min="1" placeholder="Dias de trabalho" value={novo.duracao_dias}
                    onChange={e => setNovo(n => ({ ...n, duracao_dias: e.target.value }))} className="h-8 text-xs" />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={novo.pode_paralelo} onChange={e => setNovo(n => ({ ...n, pode_paralelo: e.target.checked }))} />
                    Pode em paralelo
                  </label>
                </div>
                <Button size="sm" onClick={addEntregavel} disabled={salvando || !novo.titulo.trim()} className="w-full gap-1.5">
                  <Plus className="h-4 w-4" /> Adicionar entregável
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Ao adicionar o 1º entregável, a campanha sai da triagem e os cards entram na fila de produção.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
