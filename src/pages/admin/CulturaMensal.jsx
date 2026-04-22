import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { kpis } from '@/api';
import { toast } from 'sonner';
import { Trash2, Plus, RefreshCw, Loader2 } from 'lucide-react';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CulturaMensal() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cultura CBRio</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lance dados manuais de generosidade e gerencie os vídeos PENSE.
        </p>
      </div>

      <Tabs defaultValue="mensal">
        <TabsList>
          <TabsTrigger value="mensal">Generosidade (mensal)</TabsTrigger>
          <TabsTrigger value="pense">Vídeos PENSE</TabsTrigger>
        </TabsList>
        <TabsContent value="mensal" className="mt-4"><MensalTab /></TabsContent>
        <TabsContent value="pense" className="mt-4"><PenseTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function MensalTab() {
  const [mes, setMes] = useState(currentMonth());
  const [dizimistas, setDizimistas] = useState('');
  const [ofertantes, setOfertantes] = useState('');
  const [obs, setObs] = useState('');
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    fetch('/api/kpis/cultura/mensal').catch(() => null); // warmup
    kpis.culturaMensalList?.()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  // Quando o mês muda, prefill com valor existente
  useEffect(() => {
    const found = history.find((h) => (h.mes || '').slice(0, 7) === mes);
    setDizimistas(found?.qtd_dizimistas?.toString() ?? '');
    setOfertantes(found?.qtd_ofertantes?.toString() ?? '');
    setObs(found?.observacoes ?? '');
  }, [mes, history]);

  const save = async () => {
    setSaving(true);
    try {
      await kpis.culturaMensalUpsert({
        mes,
        qtd_dizimistas: Number(dizimistas) || 0,
        qtd_ofertantes: Number(ofertantes) || 0,
        observacoes: obs || null,
      });
      toast.success('Lançamento salvo.');
      reload();
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-5 space-y-4">
        <h3 className="font-semibold text-foreground">Lançar mês</h3>
        <div>
          <Label>Mês de referência</Label>
          <Input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Dizimistas</Label>
            <Input type="number" value={dizimistas} onChange={(e) => setDizimistas(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Ofertantes</Label>
            <Input type="number" value={ofertantes} onChange={(e) => setOfertantes(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div>
          <Label>Observações</Label>
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
        </div>
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Salvar lançamento
        </Button>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold text-foreground mb-3">Histórico</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lançamento ainda.</p>
        ) : (
          <div className="divide-y divide-border">
            {history.map((h) => {
              const [y, m] = (h.mes || '').slice(0, 7).split('-');
              return (
                <div key={h.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {MONTHS[Number(m) - 1]} {y}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {h.qtd_dizimistas} dizim · {h.qtd_ofertantes} ofert
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function PenseTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [video_id, setVideoId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [data_publicacao, setDataPub] = useState(() => new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);

  const reload = () => {
    setLoading(true);
    kpis.pense.list().then(setItems).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  const add = async () => {
    if (!video_id) { toast.error('Informe o video_id do YouTube'); return; }
    setAdding(true);
    try {
      await kpis.pense.create({ video_id, titulo, data_publicacao });
      toast.success('Vídeo cadastrado.');
      setVideoId(''); setTitulo('');
      reload();
    } catch (e) {
      toast.error(e.message || 'Erro ao cadastrar');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Remover este vídeo?')) return;
    try {
      await kpis.pense.remove(id);
      toast.success('Removido.');
      reload();
    } catch (e) {
      toast.error(e.message || 'Erro');
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await kpis.pense.sync();
      toast.success(`Sincronizado: ${r.synced} vídeo(s).`);
      reload();
    } catch (e) {
      toast.error(e.message || 'Erro na sync');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-5 space-y-4">
        <h3 className="font-semibold text-foreground">Novo vídeo PENSE</h3>
        <div>
          <Label>video_id (YouTube)</Label>
          <Input value={video_id} onChange={(e) => setVideoId(e.target.value)} placeholder="ex: dQw4w9WgXcQ" />
        </div>
        <div>
          <Label>Título (opcional)</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div>
          <Label>Data de publicação</Label>
          <Input type="date" value={data_publicacao} onChange={(e) => setDataPub(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={add} disabled={adding} className="flex-1">
            {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Adicionar
          </Button>
          <Button variant="outline" onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold text-foreground mb-3">Vídeos cadastrados</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum vídeo cadastrado.</p>
        ) : (
          <div className="divide-y divide-border max-h-[480px] overflow-auto">
            {items.map((v) => (
              <div key={v.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {v.titulo || v.video_id}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {v.data_publicacao} · {Intl.NumberFormat('pt-BR').format(v.views || 0)} views
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(v.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
