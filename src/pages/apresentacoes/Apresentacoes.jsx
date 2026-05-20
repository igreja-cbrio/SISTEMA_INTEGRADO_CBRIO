import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apresentacoes as api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { toast } from 'sonner';
import { Sparkles, Plus, Trash2, Eye, Clock, AlertCircle, Loader2, Upload, X, FileText } from 'lucide-react';

const TONS = [
  { value: 'executivo', label: 'Executivo · diretoria · dark premium' },
  { value: 'comercial', label: 'Comercial · venda · vibrante' },
  { value: 'relatorio', label: 'Relatório · dados densos · neutro' },
  { value: 'criativo',  label: 'Criativo · conceitual · ousado' },
];

const STATUS_META = {
  pendente: { label: 'Aguardando',  cor: 'bg-slate-500/15 text-slate-300',  icon: Clock },
  gerando:  { label: 'Gerando…',    cor: 'bg-cyan-500/15  text-cyan-300',   icon: Loader2 },
  pronto:   { label: 'Pronta',      cor: 'bg-emerald-500/15 text-emerald-300', icon: Sparkles },
  erro:     { label: 'Erro',        cor: 'bg-rose-500/15  text-rose-300',   icon: AlertCircle },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pendente;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${meta.cor}`}>
      <Icon className={`h-3 w-3 ${status === 'gerando' ? 'animate-spin' : ''}`} />
      {meta.label}
    </span>
  );
}

function fmtData(s) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Apresentacoes() {
  const navigate = useNavigate();
  const { getAccessLevel } = useAuth();
  const podeGerar = getAccessLevel(['apresentacoes']) >= 3;

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novaOpen, setNovaOpen] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.list({ limit: 100 });
      setList(data || []);
    } catch (e) {
      toast.error('Erro ao carregar apresentações: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Auto-refresh enquanto houver algo gerando
  useEffect(() => {
    const algoGerando = list.some(a => a.status === 'gerando' || a.status === 'pendente');
    if (!algoGerando) return;
    const t = setInterval(carregar, 5000);
    return () => clearInterval(t);
  }, [list, carregar]);

  async function deletar(id, titulo) {
    if (!window.confirm(`Apagar "${titulo}"?`)) return;
    try {
      await api.remove(id);
      toast.success('Apresentação removida');
      carregar();
    } catch (e) {
      toast.error('Erro ao deletar: ' + e.message);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-amber-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-cyan-400" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Apresentações</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Descreva o que você quer apresentar (e anexe arquivos se tiver) — o Claude Opus monta uma apresentação HTML interativa em estilo premium. Use Ctrl+P pra exportar PDF.
          </p>
        </div>
        {podeGerar && (
          <Button onClick={() => setNovaOpen(true)} className="bg-cyan-600 hover:bg-cyan-500">
            <Plus className="h-4 w-4 mr-1" /> Nova apresentação
          </Button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Carregando…
        </div>
      ) : list.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium mb-1">Nenhuma apresentação ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {podeGerar ? 'Clique em "Nova apresentação" pra começar.' : 'Você não tem permissão pra criar (nível 3+ no módulo apresentações).'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(a => (
            <Card
              key={a.id}
              className="p-5 hover:border-cyan-500/40 transition-colors cursor-pointer group"
              onClick={() => navigate(`/admin/apresentacoes/${a.id}`)}
            >
              <div className="flex items-start justify-between mb-3 gap-2">
                <h3 className="font-semibold text-base line-clamp-2 flex-1 group-hover:text-cyan-400 transition-colors">
                  {a.titulo}
                </h3>
                <StatusBadge status={a.status} />
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                {a.tom && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="capitalize">{a.tom}</Badge>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span>{fmtData(a.created_at)}</span>
                  {a.slides_count > 0 && <span>{a.slides_count} slides</span>}
                </div>
                {a.custo_usd > 0 && (
                  <div className="text-[10px] opacity-60">US$ {Number(a.custo_usd).toFixed(2)} estimado</div>
                )}
                {a.status === 'erro' && a.erro_mensagem && (
                  <div className="text-rose-400 text-[11px] line-clamp-2 mt-1">{a.erro_mensagem}</div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); navigate(`/admin/apresentacoes/${a.id}`); }}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" /> Abrir
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                  onClick={(e) => { e.stopPropagation(); deletar(a.id, a.titulo); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Nova */}
      {novaOpen && (
        <NovaApresentacaoDialog
          open={novaOpen}
          onClose={() => setNovaOpen(false)}
          onCriada={(id) => {
            setNovaOpen(false);
            carregar();
            navigate(`/admin/apresentacoes/${id}`);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Dialog · Nova apresentacao (com upload opcional)
// ─────────────────────────────────────────────────────────────────────
function NovaApresentacaoDialog({ open, onClose, onCriada }) {
  const [titulo, setTitulo] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tom, setTom] = useState('executivo');
  const [modeloPremium, setModeloPremium] = useState(false);
  const [arquivos, setArquivos] = useState([]);
  const [criando, setCriando] = useState(false);

  function handleFiles(e) {
    const arr = Array.from(e.target.files || []);
    const filtrados = arr.filter(f => f.size <= 15 * 1024 * 1024);
    if (filtrados.length !== arr.length) {
      toast.warning('Alguns arquivos foram ignorados (máx 15MB por arquivo)');
    }
    setArquivos(prev => [...prev, ...filtrados].slice(0, 6));
    e.target.value = '';
  }

  function removerArquivo(i) {
    setArquivos(prev => prev.filter((_, idx) => idx !== i));
  }

  async function submeter() {
    if (titulo.trim().length < 3) {
      toast.error('Título precisa de pelo menos 3 caracteres');
      return;
    }
    if (prompt.trim().length < 20) {
      toast.error('Descreva melhor o que você quer (mínimo 20 caracteres)');
      return;
    }
    setCriando(true);
    try {
      // 1. Cria registro
      const modelo = modeloPremium ? 'claude-opus-4-7' : 'claude-sonnet-4-6';
      const { id } = await api.create({ titulo: titulo.trim(), prompt: prompt.trim(), tom, modelo });

      // 2. Upload de arquivos (se houver)
      if (arquivos.length > 0) {
        await api.uploadArquivos(id, arquivos);
      }

      // 3. Dispara geracao (background-style · cliente vai mostrar progresso)
      api.gerar(id).catch(err => {
        // Erro nao bloqueia · a pagina de detalhe vai pegar o status
        console.warn('[apresentacoes] gerar falhou (UI mostra erro):', err.message);
      });

      toast.success('Apresentação criada · iniciando geração');
      onCriada(id);
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setCriando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-cyan-400" /> Nova apresentação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Título
            </label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Roadmap CBRio Q3 2026"
              maxLength={200}
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
              O que você quer apresentar?
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Descreva o conteúdo, o público, os pontos chave, números importantes, narrativa que você quer construir. Quanto mais contexto, melhor o resultado."
              rows={7}
              maxLength={8000}
              className="resize-y"
            />
            <div className="text-[10px] text-muted-foreground mt-1 text-right">{prompt.length} / 8000</div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Tom visual
            </label>
            <Select value={tom} onValueChange={setTom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TONS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Material de referência (opcional · até 6 arquivos · 15MB cada)
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {arquivos.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-xs">
                  <FileText className="h-3 w-3 opacity-60" />
                  <span className="max-w-[200px] truncate">{f.name}</span>
                  <button onClick={() => removerArquivo(i)} className="opacity-60 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-dashed cursor-pointer text-xs hover:bg-secondary/50 transition-colors">
              <Upload className="h-3.5 w-3.5" />
              Adicionar arquivos (PDF, DOCX, XLSX, PPTX, imagens)
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.md,.json,image/*"
                className="hidden"
                onChange={handleFiles}
              />
            </label>
          </div>

          {/* Toggle modelo · Sonnet (default rapido) ou Opus (premium lento) */}
          <div className="rounded-md border bg-secondary/30 px-3 py-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={modeloPremium}
                onChange={(e) => setModeloPremium(e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1 text-xs">
                <div className="font-medium text-foreground mb-0.5">
                  Modo Premium (Claude Opus 4.7) {modeloPremium && <span className="text-amber-400">· ativado</span>}
                </div>
                <div className="text-muted-foreground leading-relaxed">
                  {modeloPremium ? (
                    <>⚠ ~US$ 2-5 por apresentação · pode dar timeout (60s da Vercel). Use só pra apresentação importante de diretoria.</>
                  ) : (
                    <>Padrão: Claude Sonnet 4.6 · ~US$ 0.30-1 · 3x mais rápido · qualidade visual excelente pra slides.</>
                  )}
                </div>
              </div>
            </label>
          </div>

          <div className="rounded-md bg-cyan-500/10 border border-cyan-500/30 px-3 py-2 text-xs text-cyan-100">
            A geração leva 20-50 segundos. Pode fechar a aba — você recebe notificação no sino quando ficar pronta.
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={criando}>Cancelar</Button>
          <Button onClick={submeter} disabled={criando} className="bg-cyan-600 hover:bg-cyan-500">
            {criando ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Criando…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" /> Gerar apresentação</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
