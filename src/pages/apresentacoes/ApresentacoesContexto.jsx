import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apresentacoes as api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2, Brain, Eye, EyeOff, Sparkles,
} from 'lucide-react';

export default function ApresentacoesContexto() {
  const navigate = useNavigate();
  const { isAdmin, getAccessLevel } = useAuth();
  const podeEditar = isAdmin || getAccessLevel(['apresentacoes']) >= 5;

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null); // null | {} (novo) | row (editar)

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.contexto.list();
      setList(data || []);
    } catch (e) {
      toast.error('Erro ao carregar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function toggleAtivo(row) {
    try {
      await api.contexto.update(row.id, { ativo: !row.ativo });
      carregar();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  }

  async function deletar(row) {
    if (!window.confirm(`Apagar entrada "${row.titulo}"?`)) return;
    try {
      await api.contexto.remove(row.id);
      toast.success('Removida');
      carregar();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/apresentacoes')} className="mb-3 -ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar pra apresentações
      </Button>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-amber-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Brain className="h-5 w-5 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Base de conhecimento</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Fatos sobre a CBRio que o gerador injeta no prompt da IA em <strong>toda apresentação</strong>. Quando alguém pedir "5 valores da CBRio", a IA usa esses dados em vez de inventar.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setEditando({})} className="bg-cyan-600 hover:bg-cyan-500">
            <Plus className="h-4 w-4 mr-1" /> Nova entrada
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
        </div>
      ) : list.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium mb-1">Nenhuma entrada ainda</h3>
          <p className="text-sm text-muted-foreground">A migration faz seed dos 5 valores + 6 áreas + liderança. Aplique no Supabase pra ver.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map(row => (
            <Card key={row.id} className={`p-4 ${!row.ativo ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base">{row.titulo}</h3>
                    <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{row.chave}</code>
                    <span className="text-[10px] text-muted-foreground">ordem {row.ordem}</span>
                    {!row.ativo && (
                      <span className="text-[10px] uppercase tracking-wide text-rose-400">Inativa</span>
                    )}
                  </div>
                </div>
                {podeEditar && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleAtivo(row)} title={row.ativo ? 'Desativar' : 'Ativar'}>
                      {row.ativo ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditando(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-400" onClick={() => deletar(row)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed bg-secondary/30 px-3 py-2 rounded max-h-48 overflow-y-auto">
{row.conteudo}
              </pre>
            </Card>
          ))}
        </div>
      )}

      {editando !== null && (
        <ContextoDialog
          row={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }}
        />
      )}
    </div>
  );
}

function ContextoDialog({ row, onClose, onSalvo }) {
  const isNovo = !row?.id;
  const [chave, setChave] = useState(row?.chave || '');
  const [titulo, setTitulo] = useState(row?.titulo || '');
  const [conteudo, setConteudo] = useState(row?.conteudo || '');
  const [ordem, setOrdem] = useState(row?.ordem ?? 100);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!titulo.trim() || !conteudo.trim()) {
      toast.error('Título e conteúdo são obrigatórios');
      return;
    }
    if (isNovo && !chave.trim()) {
      toast.error('Chave é obrigatória (slug curto, ex: "missao")');
      return;
    }
    setSalvando(true);
    try {
      if (isNovo) {
        await api.contexto.create({ chave: chave.trim(), titulo: titulo.trim(), conteudo, ordem: parseInt(ordem) || 0 });
        toast.success('Criada');
      } else {
        await api.contexto.update(row.id, { titulo: titulo.trim(), conteudo, ordem: parseInt(ordem) || 0 });
        toast.success('Salva');
      }
      onSalvo();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNovo ? 'Nova entrada de contexto' : `Editar · ${row.titulo}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">
                Chave (slug · não muda depois)
              </label>
              <Input
                value={chave}
                onChange={(e) => setChave(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_'))}
                placeholder="ex: missao"
                disabled={!isNovo}
                maxLength={80}
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">
                Ordem (menor = primeiro)
              </label>
              <Input type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">
              Título (vira cabeçalho no prompt)
            </label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex: Missão e visão" maxLength={200} />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">
              Conteúdo (markdown · texto livre · seja específico)
            </label>
            <Textarea
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              rows={12}
              className="font-mono text-sm resize-y"
              placeholder="Escreva tudo que a IA precisa saber sobre esse tema..."
            />
            <div className="text-[10px] text-muted-foreground mt-1">{conteudo.length} chars</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-cyan-600 hover:bg-cyan-500">
            {salvando ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando…</> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
