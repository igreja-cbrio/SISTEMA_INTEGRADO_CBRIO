// Página do módulo Conversas: inbox (por área) + painel de pendências por área.
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { waInbox } from '../api';
import ConversasInbox from '../components/waInbox/ConversasInbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Loader2, Inbox, LayoutGrid, RefreshCw, Users, Zap, Plus, Trash2, Pencil } from 'lucide-react';

type ResumoArea = { area: string | null; entrada?: boolean; novas: number; ativos: number; pendentes: number };

function PainelAreas() {
  const [rows, setRows] = useState<ResumoArea[] | null>(null);
  const carregar = useCallback(() => {
    waInbox.resumoAreas().then((r: any) => setRows(r?.areas || [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { carregar(); const t = setInterval(carregar, 20_000); return () => clearInterval(t); }, [carregar]);

  const totais = (rows || []).reduce((a, r) => ({ novas: a.novas + r.novas, ativos: a.ativos + r.ativos, pendentes: a.pendentes + r.pendentes }), { novas: 0, ativos: 0, pendentes: 0 });

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Pendências por área</p>
          <p className="text-[11px] text-muted-foreground">Você vê as áreas sob sua responsabilidade. Novas = não lidas · Ativos = abertas · Pendentes = sem responsável.</p>
        </div>
        <button onClick={carregar} className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted" title="Atualizar"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Área</th>
              <th className="px-4 py-2.5 text-center font-medium">Novas mensagens</th>
              <th className="px-4 py-2.5 text-center font-medium">Ativos</th>
              <th className="px-4 py-2.5 text-center font-medium">Pendentes</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={4} className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="py-10 text-center text-sm text-muted-foreground">Nenhuma conversa ainda.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{r.entrada || !r.area ? 'Entrada (não triada)' : r.area}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center"><Contador n={r.novas} cor="verde" /></td>
                <td className="px-4 py-3 text-center"><Contador n={r.ativos} cor="azul" /></td>
                <td className="px-4 py-3 text-center"><Contador n={r.pendentes} cor="ambar" /></td>
              </tr>
            ))}
          </tbody>
          {rows && rows.length > 0 && (
            <tfoot>
              <tr className="text-[13px] font-semibold">
                <td className="px-4 py-3 text-right text-muted-foreground">Total</td>
                <td className="px-4 py-3 text-center">{totais.novas}</td>
                <td className="px-4 py-3 text-center">{totais.ativos}</td>
                <td className="px-4 py-3 text-center">{totais.pendentes}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

function Contador({ n, cor }: { n: number; cor: 'verde' | 'azul' | 'ambar' }) {
  if (!n) return <span className="text-muted-foreground/50">0</span>;
  const c = cor === 'verde' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : cor === 'azul' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  return <span className={`inline-flex min-w-[28px] items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${c}`}>{n}</span>;
}

type Pronta = { id: string; titulo: string; texto: string };
function MensagensProntas() {
  const [lista, setLista] = useState<Pronta[] | null>(null);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const carregar = useCallback(() => {
    waInbox.mensagensProntas().then((r: any) => setLista(r?.mensagens || [])).catch(() => setLista([]));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    if (!titulo.trim() || !texto.trim()) { toast.error('Preencha título e texto.'); return; }
    setSalvando(true);
    try {
      if (editId) { await waInbox.atualizarMensagemPronta(editId, { titulo: titulo.trim(), texto: texto.trim() }); toast.success('Mensagem atualizada'); }
      else { await waInbox.criarMensagemPronta({ titulo: titulo.trim(), texto: texto.trim() }); toast.success('Mensagem criada'); }
      setTitulo(''); setTexto(''); setEditId(null); carregar();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }
  function editar(m: Pronta) { setEditId(m.id); setTitulo(m.titulo); setTexto(m.texto); }
  function cancelar() { setEditId(null); setTitulo(''); setTexto(''); }
  async function remover(id: string) {
    if (!window.confirm('Remover esta mensagem pronta?')) return;
    try { await waInbox.removerMensagemPronta(id); if (editId === id) cancelar(); carregar(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao remover'); }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_360px]">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Mensagens prontas</p>
          <p className="text-[11px] text-muted-foreground">Respostas rápidas que aparecem no ⚡ do campo de mensagem, na conversa.</p>
        </div>
        <div className="max-h-[520px] divide-y divide-border/60 overflow-y-auto">
          {lista === null ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : lista.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma mensagem pronta ainda. Crie ao lado. →</div>
          ) : lista.map(m => (
            <div key={m.id} className="flex items-start gap-2 px-4 py-3 hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.titulo}</div>
                <div className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{m.texto}</div>
              </div>
              <button onClick={() => editar(m)} className="shrink-0 text-muted-foreground hover:text-primary" title="Editar"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remover(m.id)} className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </Card>
      <Card className="space-y-3 self-start p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Zap className="h-4 w-4 text-primary" />{editId ? 'Editar mensagem' : 'Nova mensagem pronta'}</p>
        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (ex.: Boas-vindas)" />
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={6} placeholder="Texto da mensagem…"
          className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-primary" />
        <div className="flex gap-2">
          {editId && <Button variant="outline" className="flex-1" onClick={cancelar}>Cancelar</Button>}
          <Button className="flex-1 gap-1.5" disabled={salvando} onClick={salvar}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editId ? 'Salvar' : 'Adicionar'}</Button>
        </div>
      </Card>
    </div>
  );
}

export default function Conversas() {
  const { user, userAreas, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Botões de WhatsApp dos módulos chegam com ?telefone=&texto= — captura e limpa a URL.
  const [abrir] = useState(() => ({
    telefone: searchParams.get('telefone') || undefined,
    texto: searchParams.get('texto') || undefined,
  }));
  useEffect(() => {
    if (searchParams.get('telefone') || searchParams.get('texto')) setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Conversas</h1>
        <p className="text-sm text-muted-foreground">
          Inbox de WhatsApp da igreja — receba e responda quem escreve, com triagem por área.
        </p>
      </div>
      <Tabs defaultValue="inbox" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inbox"><Inbox className="h-3.5 w-3.5 mr-1.5" />Conversas</TabsTrigger>
          <TabsTrigger value="painel"><LayoutGrid className="h-3.5 w-3.5 mr-1.5" />Painel</TabsTrigger>
          <TabsTrigger value="prontas"><Zap className="h-3.5 w-3.5 mr-1.5" />Mensagens prontas</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox">
          <ConversasInbox
            currentUserId={user?.id}
            userAreas={userAreas || []}
            isAdmin={isAdmin}
            abrirTelefone={abrir.telefone}
            textoInicial={abrir.texto}
          />
        </TabsContent>
        <TabsContent value="painel">
          <PainelAreas />
        </TabsContent>
        <TabsContent value="prontas">
          <MensagensProntas />
        </TabsContent>
      </Tabs>
    </div>
  );
}
