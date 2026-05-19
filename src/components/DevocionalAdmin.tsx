import { useState, useEffect, useCallback, useMemo } from 'react';
import { devocionalPlanos as planosApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Sparkles, Plus, Trash2, Loader2, ArrowLeft, RefreshCw, Edit2, Save, Calendar, Users, BookOpen, Send, CheckCircle2, AlertTriangle, Link2, Copy, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import DevocionalPanel from './DevocionalPanel';

type Plano = {
  id: string;
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
  created_at: string;
  devocional_itens?: { count: number }[];
};
type Item = {
  id: string;
  plano_id: string;
  data: string;
  titulo: string;
  passagem: string | null;
  reflexao: string;
  aplicacao: string | null;
  oracao: string | null;
  gerado_por_ia: boolean;
};
type AdesaoDia = {
  plano_id: string;
  item_id: string;
  data: string;
  titulo: string;
  passagem: string | null;
  check_ins: number;
  total_membros: number;
  pct_adesao: number;
};

export default function DevocionalAdmin() {
  const { isAdmin } = useAuth();
  const [view, setView] = useState<'lista' | 'detalhe'>('lista');
  const [planoId, setPlanoId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {view === 'lista' && (
        <PlanosLista
          onAbrir={(id) => { setPlanoId(id); setView('detalhe'); }}
          podeEditar={isAdmin}
        />
      )}
      {view === 'detalhe' && planoId && (
        <PlanoDetalhe
          planoId={planoId}
          onVoltar={() => { setPlanoId(null); setView('lista'); }}
          podeEditar={isAdmin}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Lista de planos
// ─────────────────────────────────────────────────────────────
function PlanosLista({ onAbrir, podeEditar }: { onAbrir: (id: string) => void; podeEditar: boolean }) {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalNovo, setModalNovo] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    planosApi.list()
      .then((r: any) => setPlanos(r?.data || []))
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Planos de devocional</h3>
          <p className="text-sm text-muted-foreground">Crie planos mensais e acompanhe a adesao dos membros</p>
        </div>
        {podeEditar && (
          <Button onClick={() => setModalNovo(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo plano
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : planos.length === 0 ? (
        <Card className="p-8 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum plano criado ainda.</p>
          {podeEditar && <p className="text-xs text-muted-foreground mt-1">Crie o primeiro plano clicando em "Novo plano".</p>}
        </Card>
      ) : (
        <div className="grid gap-3">
          {planos.map(p => (
            <Card key={p.id} className="p-4 cursor-pointer hover:border-primary transition-colors" onClick={() => onAbrir(p.id)}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold truncate">{p.titulo}</h4>
                    {p.ativo ? <Badge variant="default" className="text-xs">Ativo</Badge> : <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                  </div>
                  {p.descricao && <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{p.descricao}</p>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmt(p.data_inicio)} - {fmt(p.data_fim)}</span>
                    <span>· {p.devocional_itens?.[0]?.count || 0} itens</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modalNovo && <NovoPlanoModal onClose={() => setModalNovo(false)} onSaved={(id) => { setModalNovo(false); load(); onAbrir(id); }} />}
    </>
  );
}

function NovoPlanoModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const proxMes = new Date();
  proxMes.setMonth(proxMes.getMonth() + 1);
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    data_inicio: hoje,
    data_fim: proxMes.toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.titulo) return toast.error('Titulo obrigatorio');
    setSaving(true);
    try {
      const r: any = await planosApi.create(form);
      toast.success('Plano criado');
      onSaved(r.id);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo plano de devocional</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Titulo *</Label>
            <Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Devocional Junho 2026" />
          </div>
          <div>
            <Label>Descricao / contexto</Label>
            <Textarea rows={3} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Tema, serie biblica, foco pastoral..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Inicio</Label>
              <Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Detalhe do plano (itens + adesao + estudo)
// ─────────────────────────────────────────────────────────────
function PlanoDetalhe({ planoId, onVoltar, podeEditar }: { planoId: string; onVoltar: () => void; podeEditar: boolean }) {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalIA, setModalIA] = useState(false);
  const [modalNovoItem, setModalNovoItem] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [tab, setTab] = useState('itens');

  const load = useCallback(() => {
    setLoading(true);
    planosApi.get(planoId)
      .then((r: any) => { setPlano(r.plano); setItens(r.itens || []); })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [planoId]);

  useEffect(() => { load(); }, [load]);

  async function removerItem(id: string) {
    if (!confirm('Remover este item?')) return;
    try { await planosApi.removeItem(id); toast.success('Removido'); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  async function togglePlanoAtivo() {
    if (!plano) return;
    try {
      await planosApi.update(plano.id, { ativo: !plano.ativo });
      toast.success(plano.ativo ? 'Plano desativado' : 'Plano ativado');
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function removerPlano() {
    if (!plano) return;
    if (!confirm(`Remover plano "${plano.titulo}" e todos os itens?`)) return;
    try {
      await planosApi.remove(plano.id);
      toast.success('Plano removido');
      onVoltar();
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading || !plano) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onVoltar}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{plano.titulo}</h3>
              {plano.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{fmt(plano.data_inicio)} - {fmt(plano.data_fim)} · {itens.length} itens</p>
          </div>
        </div>
        {podeEditar && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={togglePlanoAtivo}>{plano.ativo ? 'Desativar' : 'Ativar'}</Button>
            <Button variant="outline" size="sm" onClick={removerPlano}><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="itens">Itens diarios</TabsTrigger>
          <TabsTrigger value="adesao">Adesao</TabsTrigger>
          <TabsTrigger value="envios">Envios</TabsTrigger>
          <TabsTrigger value="estudo">Estudo biblico</TabsTrigger>
        </TabsList>

        <TabsContent value="itens" className="space-y-3">
          {podeEditar && (
            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => setModalNovoItem(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" /> Novo item
              </Button>
              <Button onClick={() => setModalIA(true)} variant="default">
                <Sparkles className="h-4 w-4 mr-2" /> Gerar com IA
              </Button>
            </div>
          )}
          {itens.length === 0 ? (
            <Card className="p-8 text-center">
              <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum item criado ainda.</p>
              {podeEditar && <p className="text-xs text-muted-foreground mt-1">Use "Novo item" pra criar manualmente ou "Gerar com IA" pra preencher todos os dias.</p>}
            </Card>
          ) : (
            <div className="space-y-2">
              {itens.map(item => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">{fmt(item.data)}</span>
                        {item.gerado_por_ia && <Badge variant="secondary" className="text-xs"><Sparkles className="h-3 w-3 mr-1" />IA</Badge>}
                        {item.passagem && <Badge variant="outline" className="text-xs">{item.passagem}</Badge>}
                      </div>
                      <h4 className="font-medium">{item.titulo}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{item.reflexao}</p>
                    </div>
                    {podeEditar && (
                      <div className="flex flex-col gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditingItem(item)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => removerItem(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="adesao">
          <AdesaoView planoId={planoId} />
        </TabsContent>

        <TabsContent value="envios">
          <EnviosView planoId={planoId} podeEnviar={podeEditar} planoItens={itens} />
        </TabsContent>

        <TabsContent value="estudo">
          <DevocionalPanel />
        </TabsContent>
      </Tabs>

      {modalIA && plano && <GerarIAModal plano={plano} onClose={() => setModalIA(false)} onDone={() => { setModalIA(false); load(); }} />}
      {modalNovoItem && plano && <NovoItemModal plano={plano} itens={itens} onClose={() => setModalNovoItem(false)} onSaved={() => { setModalNovoItem(false); load(); }} />}
      {editingItem && <EditarItemModal item={editingItem} onClose={() => setEditingItem(null)} onSaved={() => { setEditingItem(null); load(); }} />}
    </>
  );
}

function GerarIAModal({ plano, onClose, onDone }: { plano: Plano; onClose: () => void; onDone: () => void }) {
  const [tema, setTema] = useState('');
  const [tom, setTom] = useState('pastoral, edificante, com aplicacao pratica');
  const [sobrescrever, setSobrescrever] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });

  const diasTotalPlano = useMemo(() => {
    const inicio = new Date(plano.data_inicio + 'T12:00');
    const fim = new Date(plano.data_fim + 'T12:00');
    return Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1;
  }, [plano]);

  // Quantos dias gerar nesta rodada · max 30 ou o total do plano (o menor)
  const maxPermitido = Math.min(30, diasTotalPlano);
  const [diasParaGerar, setDiasParaGerar] = useState(maxPermitido);

  // Lista das primeiras N datas do plano (que vao ser passadas no apenas_datas)
  function primeirasDatas(n: number): string[] {
    const out: string[] = [];
    const cur = new Date(plano.data_inicio + 'T12:00');
    for (let i = 0; i < n; i++) {
      out.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
  }

  async function gerar() {
    const n = Math.max(1, Math.min(maxPermitido, Number(diasParaGerar) || maxPermitido));
    const apenas_datas = primeirasDatas(n);
    setGerando(true);
    setProgresso({ feitos: 0, total: n });
    let totalCriados = 0;
    try {
      // Backend gera ate 10 dias por chamada · loop ate cobrir tudo
      for (let i = 0; i < 20; i++) {
        const r: any = await planosApi.gerarIA(plano.id, { tema, tom, sobrescrever, apenas_datas });
        const criados = r.criados || 0;
        const restantes = r.restantes ?? 0;
        totalCriados += criados;
        setProgresso(p => ({ feitos: p.feitos + criados, total: p.total }));
        if (sobrescrever && i === 0) setSobrescrever(false);
        if (restantes === 0 || criados === 0) break;
      }
      toast.success(`${totalCriados} devocionais gerados`);
      onDone();
    } catch (e: any) {
      if (totalCriados > 0) {
        toast.warning(`${totalCriados} gerados, mas erro no lote seguinte: ${e.message}`);
        onDone();
      } else {
        toast.error(e.message);
      }
    } finally { setGerando(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !gerando && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Gerar devocionais com IA</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Plano de {diasTotalPlano} dias. Use Claude Haiku pra gerar conteudo automatico.
            Voce pode gerar parte do plano agora e o restante depois (ou criar manualmente).
          </p>
          <div>
            <Label>Quantos dias gerar? <span className="text-muted-foreground">(max {maxPermitido})</span></Label>
            <Input
              type="number"
              min={1}
              max={maxPermitido}
              value={diasParaGerar}
              onChange={e => setDiasParaGerar(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Gera a partir do primeiro dia do plano ({fmt(plano.data_inicio)}).
              Tempo estimado: ~{Math.ceil(diasParaGerar / 10) * 40}s.
            </p>
          </div>
          <div>
            <Label>Tema / serie biblica (opcional)</Label>
            <Input value={tema} onChange={e => setTema(e.target.value)} placeholder="Ex: Caminhar com Deus · Salmos · Vida no Espirito" />
          </div>
          <div>
            <Label>Tom / estilo</Label>
            <Input value={tom} onChange={e => setTom(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sobrescrever} onChange={e => setSobrescrever(e.target.checked)} />
            Sobrescrever itens existentes no plano
          </label>
          {gerando && progresso.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Progresso</span>
                <span>{progresso.feitos} / {progresso.total}</span>
              </div>
              <div className="h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${(progresso.feitos / progresso.total) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={gerando}>Cancelar</Button>
          <Button onClick={gerar} disabled={gerando || diasParaGerar < 1}>
            {gerando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...</> : <><Sparkles className="h-4 w-4 mr-2" /> Gerar {diasParaGerar}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovoItemModal({ plano, itens, onClose, onSaved }: { plano: Plano; itens: Item[]; onClose: () => void; onSaved: () => void }) {
  // Sugere a primeira data do plano que ainda nao tem item
  const datasUsadas = useMemo(() => new Set(itens.map(i => i.data)), [itens]);
  const proxData = useMemo(() => {
    const cur = new Date(plano.data_inicio + 'T12:00');
    const fim = new Date(plano.data_fim + 'T12:00');
    while (cur <= fim) {
      const d = cur.toISOString().slice(0, 10);
      if (!datasUsadas.has(d)) return d;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return plano.data_inicio;
  }, [plano, datasUsadas]);

  const [form, setForm] = useState({
    data: proxData,
    titulo: '',
    passagem: '',
    reflexao: '',
    aplicacao: '',
    oracao: '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.titulo.trim()) return toast.error('Titulo obrigatorio');
    if (!form.reflexao.trim()) return toast.error('Reflexao obrigatoria');
    if (form.data < plano.data_inicio || form.data > plano.data_fim) {
      return toast.error('Data fora do periodo do plano');
    }
    setSaving(true);
    try {
      await planosApi.createItem(plano.id, form);
      toast.success('Item criado');
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Novo devocional (manual)</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                min={plano.data_inicio}
                max={plano.data_fim}
                value={form.data}
                onChange={e => setForm({ ...form, data: e.target.value })}
              />
            </div>
            <div>
              <Label>Passagem</Label>
              <Input value={form.passagem} onChange={e => setForm({ ...form, passagem: e.target.value })} placeholder="Ex: Joao 3:16" />
            </div>
          </div>
          <div>
            <Label>Titulo *</Label>
            <Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="O amor de Deus" />
          </div>
          <div>
            <Label>Reflexao *</Label>
            <Textarea rows={6} value={form.reflexao} onChange={e => setForm({ ...form, reflexao: e.target.value })} placeholder="Corpo principal do devocional..." />
          </div>
          <div>
            <Label>Aplicacao</Label>
            <Textarea rows={3} value={form.aplicacao} onChange={e => setForm({ ...form, aplicacao: e.target.value })} placeholder="Como aplicar hoje · pergunta pratica" />
          </div>
          <div>
            <Label>Oracao</Label>
            <Textarea rows={3} value={form.oracao} onChange={e => setForm({ ...form, oracao: e.target.value })} placeholder="Sugestao de oracao curta" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarItemModal({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    titulo: item.titulo,
    passagem: item.passagem || '',
    reflexao: item.reflexao,
    aplicacao: item.aplicacao || '',
    oracao: item.oracao || '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await planosApi.updateItem(item.id, form);
      toast.success('Item atualizado');
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Editar item · {fmt(item.data)}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div><Label>Titulo</Label><Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} /></div>
          <div><Label>Passagem</Label><Input value={form.passagem} onChange={e => setForm({ ...form, passagem: e.target.value })} placeholder="Joao 3:16" /></div>
          <div><Label>Reflexao</Label><Textarea rows={8} value={form.reflexao} onChange={e => setForm({ ...form, reflexao: e.target.value })} /></div>
          <div><Label>Aplicacao</Label><Textarea rows={3} value={form.aplicacao} onChange={e => setForm({ ...form, aplicacao: e.target.value })} /></div>
          <div><Label>Oracao</Label><Textarea rows={3} value={form.oracao} onChange={e => setForm({ ...form, oracao: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Adesao
// ─────────────────────────────────────────────────────────────
type Periodo = 'semana' | '30d' | 'tudo';

function AdesaoView({ planoId }: { planoId: string }) {
  const [dias, setDias] = useState<AdesaoDia[]>([]);
  const [totalMembros, setTotalMembros] = useState(0);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>('30d');

  const load = useCallback(() => {
    setLoading(true);
    planosApi.adesao(planoId)
      .then((r: any) => { setDias(r.dias || []); setTotalMembros(r.total_membros || 0); })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [planoId]);

  useEffect(() => { load(); }, [load]);

  // Filtra por periodo
  const diasFiltrados = useMemo(() => {
    if (!dias.length) return [];
    const hoje = new Date().toISOString().slice(0, 10);
    if (periodo === 'tudo') return dias;
    if (periodo === 'semana') {
      const ini = new Date();
      ini.setDate(ini.getDate() - ini.getDay()); // domingo
      const iniIso = ini.toISOString().slice(0, 10);
      const fim = new Date();
      fim.setDate(fim.getDate() + (6 - fim.getDay()));
      const fimIso = fim.toISOString().slice(0, 10);
      return dias.filter(d => d.data >= iniIso && d.data <= fimIso);
    }
    if (periodo === '30d') {
      const ini = new Date(); ini.setDate(ini.getDate() - 14);
      const fim = new Date(); fim.setDate(fim.getDate() + 15);
      return dias.filter(d => d.data >= ini.toISOString().slice(0, 10) && d.data <= fim.toISOString().slice(0, 10));
    }
    return dias;
  }, [dias, periodo]);

  // Estatisticas baseadas no filtro
  const diasComCheckin = diasFiltrados.filter(d => d.check_ins > 0);
  const mediaAdesao = diasComCheckin.length
    ? Math.round(diasComCheckin.reduce((s, d) => s + d.pct_adesao, 0) / diasComCheckin.length)
    : 0;
  const melhor = diasComCheckin.length ? [...diasComCheckin].sort((a, b) => b.pct_adesao - a.pct_adesao)[0] : null;
  const pior = diasComCheckin.length ? [...diasComCheckin].sort((a, b) => a.pct_adesao - b.pct_adesao)[0] : null;
  const totalCheckIns = diasFiltrados.reduce((s, d) => s + d.check_ins, 0);

  // Agrupa por semana (chave: ISO da segunda-feira da semana)
  const semanas = useMemo(() => {
    const map = new Map<string, { ini: string; dias: AdesaoDia[] }>();
    for (const d of diasFiltrados) {
      const dt = new Date(d.data + 'T12:00');
      const diaSem = dt.getDay(); // 0=dom
      const segIso = new Date(dt);
      segIso.setDate(dt.getDate() - ((diaSem + 6) % 7)); // segunda
      const key = segIso.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { ini: key, dias: [] });
      map.get(key)!.dias.push(d);
    }
    return Array.from(map.values()).sort((a, b) => a.ini.localeCompare(b.ini));
  }, [diasFiltrados]);

  function corPorPct(pct: number) {
    if (pct === 0) return 'bg-muted';
    if (pct < 30) return 'bg-rose-500/70';
    if (pct < 60) return 'bg-amber-500/80';
    return 'bg-primary';
  }

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      {/* Filtros de periodo */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border bg-card overflow-hidden">
          {[
            { key: 'semana', label: 'Esta semana' },
            { key: '30d', label: '±15 dias' },
            { key: 'tudo', label: 'Tudo' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setPeriodo(opt.key as Periodo)}
              className={`px-3 py-1.5 text-sm transition-colors ${periodo === opt.key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Cards de estatistica */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3 w-3" /> Membros</div>
          <div className="text-2xl font-bold mt-1">{totalMembros}</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3" /> Total check-ins</div>
          <div className="text-2xl font-bold mt-1">{totalCheckIns}</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Sparkles className="h-3 w-3" /> Adesao media</div>
          <div className="text-2xl font-bold mt-1" style={{ color: mediaAdesao >= 60 ? '#00B39D' : mediaAdesao >= 30 ? '#f59e0b' : undefined }}>
            {mediaAdesao}%
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Calendar className="h-3 w-3" /> Dias</div>
          <div className="text-2xl font-bold mt-1">{diasFiltrados.length}</div>
        </Card>
      </div>

      {/* Melhor e pior dia */}
      {melhor && pior && melhor.item_id !== pior.item_id && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="p-3 border-l-4 border-l-primary">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-primary" /> Melhor adesao
            </div>
            <div className="text-sm font-semibold truncate mt-1">{melhor.titulo}</div>
            <div className="text-xs text-muted-foreground">{fmt(melhor.data)} · {melhor.check_ins} check-ins · {melhor.pct_adesao}%</div>
          </Card>
          <Card className="p-3 border-l-4 border-l-rose-500">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingDown className="h-3 w-3 text-rose-500" /> Menor adesao
            </div>
            <div className="text-sm font-semibold truncate mt-1">{pior.titulo}</div>
            <div className="text-xs text-muted-foreground">{fmt(pior.data)} · {pior.check_ins} check-ins · {pior.pct_adesao}%</div>
          </Card>
        </div>
      )}

      {/* Adesao agrupada por semana */}
      {diasFiltrados.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Sem itens neste periodo.
        </Card>
      ) : (
        <div className="space-y-3">
          {semanas.map(sem => {
            const total = sem.dias.reduce((s, d) => s + d.check_ins, 0);
            const media = Math.round(sem.dias.reduce((s, d) => s + d.pct_adesao, 0) / sem.dias.length);
            return (
              <SemanaBloco key={sem.ini} ini={sem.ini} dias={sem.dias} total={total} media={media} corPorPct={corPorPct} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SemanaBloco({ ini, dias, total, media, corPorPct }: { ini: string; dias: AdesaoDia[]; total: number; media: number; corPorPct: (p: number) => string }) {
  const [aberto, setAberto] = useState(true);
  const fim = dias[dias.length - 1]?.data || ini;

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setAberto(a => !a)}
        className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="text-left">
            <div className="font-medium text-sm">Semana de {fmt(ini)} - {fmt(fim)}</div>
            <div className="text-xs text-muted-foreground">{dias.length} dias · {total} check-ins · {media}% media</div>
          </div>
        </div>
        {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {aberto && (
        <div className="border-t divide-y">
          {dias.map(d => (
            <div key={d.item_id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/30">
              <div className="w-14 text-xs">
                <div className="font-mono">{fmt(d.data)}</div>
                <div className="text-muted-foreground text-[10px] uppercase">{diaSemana(d.data)}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">{d.titulo}</div>
                {d.passagem && <div className="text-xs text-muted-foreground truncate">{d.passagem}</div>}
              </div>
              <div className="flex items-center gap-2 w-44">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full transition-all ${corPorPct(d.pct_adesao)}`} style={{ width: `${Math.min(100, d.pct_adesao)}%` }} />
                </div>
                <span className="text-xs font-medium w-20 text-right tabular-nums">{d.check_ins}/{d.total_membros}</span>
                <span className="text-xs font-bold w-10 text-right tabular-nums">{d.pct_adesao}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function diaSemana(iso: string) {
  if (!iso) return '';
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
}

function fmt(iso: string) {
  if (!iso) return '';
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ─────────────────────────────────────────────────────────────
// Envios (WhatsApp)
// ─────────────────────────────────────────────────────────────
type EnvioAgg = {
  item_id: string;
  data: string;
  titulo: string;
  enviados: number;
  erros: number;
  ultimos_motivos: Record<string, number>;
};

function EnviosView({ planoId, podeEnviar, planoItens }: { planoId: string; podeEnviar: boolean; planoItens: Item[] }) {
  const [envios, setEnvios] = useState<EnvioAgg[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    planosApi.envios(planoId)
      .then((r: any) => setEnvios(r.itens || []))
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [planoId]);

  useEffect(() => { load(); }, [load]);

  const hoje = new Date().toISOString().slice(0, 10);
  const itemHoje = useMemo(() => (planoItens || []).find(i => i.data === hoje), [planoItens, hoje]);

  function buildMensagem(item: Item) {
    const link = `${window.location.origin}/devocional/hoje`;
    const linhas = ['📖 *Devocional de hoje*', '', `*${item.titulo}*`];
    if (item.passagem) linhas.push(item.passagem);
    linhas.push('', `Leia em: ${link}`);
    return linhas.join('\n');
  }

  async function copiarMensagem() {
    if (!itemHoje) return toast.error('Plano nao tem item pra hoje');
    const texto = buildMensagem(itemHoje);
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Mensagem copiada · cole no WhatsApp/Telegram/grupo');
    } catch {
      toast.error('Nao consegui copiar · selecione manualmente abaixo');
    }
  }

  function abrirWhatsAppWeb() {
    if (!itemHoje) return toast.error('Plano nao tem item pra hoje');
    const texto = encodeURIComponent(buildMensagem(itemHoje));
    window.open(`https://wa.me/?text=${texto}`, '_blank');
  }

  async function enviarHoje() {
    setEnviando(true);
    try {
      const r: any = await planosApi.enviarHoje(planoId);
      if (r.motivo === 'sem_item_hoje') {
        toast.error('Plano nao tem item pra hoje');
      } else if (r.motivo === 'sem_destinatarios') {
        toast.error('Nenhum membro elegivel (precisa ter logado pelo /devocional + telefone)');
      } else if (r.motivo === 'whatsapp_desabilitado') {
        toast.warning('WhatsApp desabilitado · WHATSAPP_ENABLED=true e credenciais precisam estar no Vercel');
      } else {
        toast.success(`Enviados: ${r.enviados} · Erros: ${r.erros} · Ja existentes: ${r.ja_existentes}`);
      }
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setEnviando(false); }
  }

  return (
    <div className="space-y-4">
      {/* Opcao Link · sempre disponivel · nao depende de template aprovado */}
      <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Compartilhar por link</h4>
        </div>
        {itemHoje ? (
          <>
            <div className="text-xs text-muted-foreground">
              Pre-formatado pra colar no WhatsApp Web, grupo ou status. Membro abre o link e ve o conteudo completo no app.
            </div>
            <pre className="text-xs bg-card border rounded p-3 whitespace-pre-wrap font-sans">{buildMensagem(itemHoje)}</pre>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copiarMensagem} variant="default" size="sm">
                <Copy className="h-4 w-4 mr-2" /> Copiar mensagem
              </Button>
              <Button onClick={abrirWhatsAppWeb} variant="outline" size="sm">
                <Send className="h-4 w-4 mr-2" /> Abrir no WhatsApp Web
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Plano nao tem item pra hoje. Gere/crie um item com data {hoje}.</p>
        )}
      </Card>

      {/* Opcao envio automatico via WhatsApp API */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cron diario 06:00 BRT envia via WhatsApp Business API (precisa do template aprovado pelo Meta).
        </p>
        {podeEnviar && (
          <Button onClick={enviarHoje} disabled={enviando} variant="outline">
            {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Disparar API agora
          </Button>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : envios.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Nenhum envio registrado ainda.
        </Card>
      ) : (
        <div className="space-y-2">
          {envios.map(it => (
            <Card key={it.item_id} className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-muted-foreground">{fmt(it.data)}</span>
                    <span className="text-sm font-medium truncate">{it.titulo}</span>
                  </div>
                  {Object.keys(it.ultimos_motivos).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(it.ultimos_motivos).map(([motivo, count]) => (
                        <Badge key={motivo} variant="outline" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1 text-amber-600" />
                          {motivo}: {count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-primary">
                    <CheckCircle2 className="h-4 w-4" /> {it.enviados}
                  </span>
                  {it.erros > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-4 w-4" /> {it.erros}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
