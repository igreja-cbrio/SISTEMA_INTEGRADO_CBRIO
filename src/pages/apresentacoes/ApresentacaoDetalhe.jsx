import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apresentacoes as api } from '../../api';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, RefreshCw, Printer, Sparkles, AlertCircle, Clock,
  FileText, Maximize, Trash2, Copy,
} from 'lucide-react';

const POLL_INTERVAL_MS = 4000;

const STATUS_META = {
  pendente: { label: 'Aguardando',  cor: 'text-slate-300',  Icon: Clock },
  gerando:  { label: 'Gerando…',    cor: 'text-cyan-300',   Icon: Loader2 },
  pronto:   { label: 'Pronta',      cor: 'text-emerald-300', Icon: Sparkles },
  erro:     { label: 'Erro',        cor: 'text-rose-300',   Icon: AlertCircle },
};

function fmtData(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('pt-BR');
}

export default function ApresentacaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const iframeRef = useRef(null);
  const wrapperRef = useRef(null);

  const [apres, setApres] = useState(null);
  const [arquivos, setArquivos] = useState([]);
  const [html, setHtml] = useState('');
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [regenerando, setRegenerando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get(id);
      setApres(r.apresentacao);
      setArquivos(r.arquivos || []);
    } catch (e) {
      toast.error('Erro ao carregar: ' + e.message);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  // Poll enquanto status nao for pronto/erro
  useEffect(() => {
    if (!apres) return;
    if (apres.status === 'pronto' || apres.status === 'erro') return;
    const t = setInterval(carregar, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [apres, carregar]);

  // Quando status vira pronto, carrega HTML do viewer
  useEffect(() => {
    if (apres?.status !== 'pronto') return;
    setLoadingHtml(true);
    api.fetchHtml(id)
      .then(setHtml)
      .catch(e => toast.error('Erro ao carregar HTML: ' + e.message))
      .finally(() => setLoadingHtml(false));
  }, [apres?.status, apres?.generated_at, id]);

  async function regenerar() {
    if (!window.confirm('Gerar de novo? Isso vai consumir tokens da API (~US$ 2-5).')) return;
    setRegenerando(true);
    try {
      await api.gerar(id, { regenerar: true });
      toast.success('Regeneração iniciada');
      carregar();
    } catch (e) {
      toast.error('Erro ao regenerar: ' + e.message);
    } finally {
      setRegenerando(false);
    }
  }

  async function tentarNovamente() {
    setRegenerando(true);
    try {
      await api.gerar(id);
      toast.success('Tentando novamente');
      carregar();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setRegenerando(false);
    }
  }

  async function deletar() {
    if (!window.confirm(`Apagar "${apres?.titulo}"?`)) return;
    try {
      await api.remove(id);
      toast.success('Removida');
      navigate('/admin/apresentacoes');
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  }

  function imprimir() {
    if (!iframeRef.current) return;
    try {
      iframeRef.current.contentWindow?.focus();
      iframeRef.current.contentWindow?.print();
    } catch (e) {
      toast.error('Falha ao imprimir: ' + e.message);
    }
  }

  function fullscreen() {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      el.requestFullscreen?.();
    }
  }

  async function copiarHtml() {
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      toast.success('HTML copiado pra área de transferência');
    } catch (e) {
      toast.error('Falha ao copiar');
    }
  }

  if (!apres) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
      </div>
    );
  }

  const meta = STATUS_META[apres.status] || STATUS_META.pendente;
  const Icon = meta.Icon;

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex-1 min-w-[300px]">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/apresentacoes')} className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">{apres.titulo}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            <span className={`inline-flex items-center gap-1.5 ${meta.cor}`}>
              <Icon className={`h-4 w-4 ${apres.status === 'gerando' ? 'animate-spin' : ''}`} />
              {meta.label}
            </span>
            <span>•</span>
            <Badge variant="secondary" className="capitalize">{apres.tom}</Badge>
            {apres.slides_count > 0 && <><span>•</span><span>{apres.slides_count} slides</span></>}
            {apres.custo_usd > 0 && <><span>•</span><span>US$ {Number(apres.custo_usd).toFixed(2)}</span></>}
            {apres.duracao_ms > 0 && <><span>•</span><span>{(apres.duracao_ms / 1000).toFixed(1)}s</span></>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {apres.status === 'pronto' && (
            <>
              <Button variant="outline" size="sm" onClick={imprimir}>
                <Printer className="h-4 w-4 mr-1" /> Exportar PDF
              </Button>
              <Button variant="outline" size="sm" onClick={fullscreen}>
                <Maximize className="h-4 w-4 mr-1" /> Tela cheia
              </Button>
              <Button variant="outline" size="sm" onClick={copiarHtml}>
                <Copy className="h-4 w-4 mr-1" /> Copiar HTML
              </Button>
              <Button variant="outline" size="sm" onClick={regenerar} disabled={regenerando}>
                <RefreshCw className={`h-4 w-4 mr-1 ${regenerando ? 'animate-spin' : ''}`} /> Regenerar
              </Button>
            </>
          )}
          {apres.status === 'erro' && (
            <Button onClick={tentarNovamente} disabled={regenerando} className="bg-cyan-600 hover:bg-cyan-500">
              <RefreshCw className={`h-4 w-4 mr-1 ${regenerando ? 'animate-spin' : ''}`} /> Tentar novamente
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={deletar} className="text-rose-400 hover:bg-rose-500/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Estados */}
      {apres.status === 'pendente' && (
        <Card className="p-8 text-center border-dashed">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <h3 className="font-medium mb-1">Aguardando início da geração</h3>
          <p className="text-sm text-muted-foreground">Se ficar assim por mais de 1min, clique em "Tentar novamente".</p>
          <Button onClick={tentarNovamente} disabled={regenerando} className="mt-4">
            <Sparkles className="h-4 w-4 mr-1" /> Gerar agora
          </Button>
        </Card>
      )}

      {apres.status === 'gerando' && (
        <Card className="p-8 text-center border-dashed">
          <Loader2 className="h-8 w-8 mx-auto text-cyan-400 animate-spin mb-3" />
          <h3 className="font-medium mb-1">Claude Opus está montando seus slides</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Isso leva 30-60 segundos. A página atualiza automaticamente quando ficar pronto · não precisa recarregar.
          </p>
        </Card>
      )}

      {apres.status === 'erro' && (
        <Card className="p-6 border-rose-500/30 bg-rose-500/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-rose-300 mb-1">A geração falhou</h3>
              <p className="text-sm text-rose-200/80 mb-2 whitespace-pre-wrap">
                {apres.erro_mensagem || 'Erro desconhecido'}
              </p>
              <p className="text-xs text-muted-foreground">
                Causas comuns: timeout do Vercel (60s), erro de JSON da IA, prompt ambíguo demais. Tente regenerar.
              </p>
            </div>
          </div>
        </Card>
      )}

      {apres.status === 'pronto' && (
        <div className="space-y-4">
          {loadingHtml ? (
            <Card className="p-8 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Carregando viewer…</p>
            </Card>
          ) : (
            <div ref={wrapperRef} className="rounded-xl overflow-hidden border bg-black aspect-video relative">
              <iframe
                ref={iframeRef}
                srcDoc={html}
                className="w-full h-full block"
                title={apres.titulo}
                sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-forms"
                allowFullScreen
              />
            </div>
          )}

          <div className="text-xs text-muted-foreground text-center">
            Navegue com ← → · Pressione F pra tela cheia no slide · Use Ctrl+P pra salvar PDF
          </div>
        </div>
      )}

      {/* Detalhes do briefing + arquivos */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Briefing original</h4>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{apres.prompt}</p>
        </Card>
        <Card className="p-4">
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Detalhes</h4>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between"><dt className="text-muted-foreground">Criada</dt><dd>{fmtData(apres.created_at)}</dd></div>
            {apres.generated_at && (
              <div className="flex justify-between"><dt className="text-muted-foreground">Gerada</dt><dd>{fmtData(apres.generated_at)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-muted-foreground">Modelo</dt><dd className="font-mono">{apres.modelo_ia}</dd></div>
            {apres.tokens_input > 0 && (
              <>
                <div className="flex justify-between"><dt className="text-muted-foreground">Tokens in</dt><dd className="font-mono">{apres.tokens_input.toLocaleString()}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Tokens out</dt><dd className="font-mono">{apres.tokens_output.toLocaleString()}</dd></div>
              </>
            )}
          </dl>

          {arquivos.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Anexos ({arquivos.length})</h4>
              <ul className="space-y-1">
                {arquivos.map(a => (
                  <li key={a.id} className="flex items-center gap-2 text-xs">
                    <FileText className="h-3 w-3 opacity-60" />
                    <span className="truncate flex-1">{a.nome}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
