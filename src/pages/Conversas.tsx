// Página do módulo Conversas: inbox (por área) + mensagens prontas.
//
// 08/09/2026 (Marcos): a sub-aba "Painel" (pendências por área) SAIU — "essa
// aba de painel não é útil". Os chips Abertas · Sem resposta · Finalizadas do
// próprio inbox respondem a pergunta que ela tentava responder, com a idade da
// espera na linha. O endpoint `GET /wa-inbox/resumo-areas` segue vivo e sem
// consumidor aqui (dormente) — não apagar por parecer sobra.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { waInbox } from '../api';
import ConversasInbox from '../components/waInbox/ConversasInbox';
import { VARIAVEIS } from '../lib/mensagemVariaveis';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Loader2, Inbox, Zap, Plus, Trash2, Pencil } from 'lucide-react';

type Pronta = { id: string; titulo: string; texto: string };
function MensagensProntas() {
  const [lista, setLista] = useState<Pronta[] | null>(null);
  const [erro, setErro] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const textoRef = useRef<HTMLTextAreaElement | null>(null);

  const carregar = useCallback(() => {
    setErro(false);
    waInbox.mensagensProntas().then((r: any) => setLista(r?.mensagens || [])).catch(() => { setLista([]); setErro(true); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Insere `{{chave}}` onde o cursor está (ou no fim), e devolve o foco ao campo.
  function inserirVariavel(chave: string) {
    const tag = `{{${chave}}}`;
    const el = textoRef.current;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    const novo = texto.slice(0, ini) + tag + texto.slice(fim);
    setTexto(novo);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = ini + tag.length;
      el.setSelectionRange(pos, pos);
    });
  }

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
          <p className="text-[11px] text-muted-foreground">
            Aparecem no ⚡ do campo de mensagem e ao digitar <b>/</b> na conversa. Com variáveis, o texto se adapta à pessoa ao ser inserido.
          </p>
        </div>
        <div className="max-h-[520px] divide-y divide-border/60 overflow-y-auto">
          {lista === null ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : erro ? (
            <div style={{ margin: 16, padding: 16, background: '#FCEBEB', border: '1px dashed #F09595', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#501313', marginBottom: 4 }}>Não foi possível carregar as mensagens</div>
              <div style={{ fontSize: 11, color: '#791F1F', marginBottom: 10 }}>Suas mensagens prontas podem já existir — não recrie sem confirmar.</div>
              <button onClick={carregar} style={{ background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Tentar de novo</button>
            </div>
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
        <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (ex.: Convite do Next)" />
        <textarea ref={textoRef} value={texto} onChange={e => setTexto(e.target.value)} rows={6}
          placeholder={'Texto da mensagem… Ex.: Oi {{primeiro_nome}}! Aqui é {{atendente}}, da CBRio.'}
          className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-primary" />
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">Variáveis (clique para inserir · são preenchidas na hora de usar):</p>
          <div className="flex flex-wrap gap-1">
            {VARIAVEIS.map(v => (
              <button key={v.chave} type="button" onClick={() => inserirVariavel(v.chave)} title={`${v.rotulo} · ex.: ${v.exemplo}`}
                className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:border-primary hover:text-primary">
                {`{{${v.chave}}}`}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Variável sem valor na conversa fica escrita no campo e o envio pede pra completar — nada sai pela metade.</p>
        </div>
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
    // ⚠️ Remove SÓ os params consumidos — setSearchParams({}) apagava também o
    // ?tab=conversas e a página Comunicação (que embute esta) voltava pro
    // dashboard no meio da abertura da conversa.
    if (searchParams.get('telefone') || searchParams.get('texto')) {
      const p = new URLSearchParams(searchParams);
      p.delete('telefone');
      p.delete('texto');
      setSearchParams(p, { replace: true });
    }
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
        <TabsContent value="prontas">
          <MensagensProntas />
        </TabsContent>
      </Tabs>
    </div>
  );
}
