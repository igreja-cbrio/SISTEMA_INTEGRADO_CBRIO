// Kids · Apresentação de Crianças — respostas do formulário público, agrupadas
// por turma (data_apresentacao · 2º domingo do mês), estilo batismo. A equipe
// contata a família pra agendar o horário e atualiza o status.
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { totemKids as api } from '../../../api';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Baby, Loader2, Phone, Search, Copy, Share2, Check, Award } from 'lucide-react';
import { gerarCertificadoApresentacao } from '../../../lib/gerarCertificadoApresentacao';

const fmt = (d?: string | null) => { if (!d) return '—'; try { return new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR'); } catch { return d || '—'; } };
const STATUS_COR: Record<string, string> = {
  pendente: 'bg-amber-500/10 text-amber-600',
  confirmado: 'bg-emerald-500/10 text-emerald-600',
  realizado: 'bg-muted text-muted-foreground',
  cancelado: 'bg-red-500/10 text-red-600',
};
const STATUS_OPCOES = ['pendente', 'confirmado', 'realizado', 'cancelado'];

export default function ApresentacaoCriancas() {
  const navigate = useNavigate();
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [generos, setGeneros] = useState<Record<string, 'menino' | 'menina'>>({});
  const [gerandoId, setGerandoId] = useState<string | null>(null);

  const gerarCert = async (b: any) => {
    setGerandoId(b.id);
    try {
      await gerarCertificadoApresentacao({
        criancaNome: b.crianca_nome,
        nomePai: b.nome_pai,
        nomeMae: b.nome_mae,
        dataApresentacao: b.data_apresentacao,
        genero: generos[b.id] || 'menino',
      });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar certificado');
    } finally {
      setGerandoId(null);
    }
  };

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api.apresentacoes()
      .then((d: any) => setLista(Array.isArray(d) ? d : []))
      .catch(() => { if (!silent) toast.error('Erro ao carregar'); })
      .finally(() => { if (!silent) setLoading(false); });
  };
  // Carrega ao abrir + atualiza em segundo plano (polling 20s e ao focar a aba),
  // pra novas inscrições aparecerem sem precisar recarregar a página.
  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 20000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, []);

  const mudarStatus = async (id: string, status: string) => {
    try {
      await api.apresentacaoUpdate(id, { status });
      setLista(l => l.map(x => (x.id === id ? { ...x, status } : x)));
      toast.success('Status atualizado');
    } catch { toast.error('Erro ao atualizar'); }
  };

  const mudarData = async (id: string, data_apresentacao: string) => {
    if (!data_apresentacao) return;
    try {
      await api.apresentacaoUpdate(id, { data_apresentacao });
      setLista(l => l.map(x => (x.id === id ? { ...x, data_apresentacao } : x)));
      toast.success('Turma (data) atualizada');
    } catch { toast.error('Erro ao atualizar data'); }
  };

  const formUrl = `${window.location.origin}/apresentacao-criancas`;
  const [copiado, setCopiado] = useState(false);
  const copiarLink = async () => {
    try { await navigator.clipboard.writeText(formUrl); setCopiado(true); setTimeout(() => setCopiado(false), 2000); toast.success('Link copiado'); }
    catch { toast.error('Não consegui copiar'); }
  };
  const compartilharWpp = () => {
    const texto = `Inscreva sua criança para a Apresentação de Crianças na CBRio: ${formUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  };

  const t = busca.trim().toLowerCase();
  const filtradas = lista.filter((b) =>
    !t || `${b.crianca_nome || ''} ${b.nome_pai || ''} ${b.nome_mae || ''} ${b.telefone || ''}`.toLowerCase().includes(t));

  // Agrupa por turma (data_apresentacao) · mais recente primeiro
  const grupos = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtradas.forEach((b) => { const k = b.data_apresentacao || 'sem-data'; (map[k] = map[k] || []).push(b); });
    return Object.entries(map).sort((a, b) => {
      if (a[0] === 'sem-data') return 1;
      if (b[0] === 'sem-data') return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [filtradas]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate('/ministerial/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Voltar ao hub do Kids</button>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Baby className="h-5 w-5 text-fuchsia-500" /> Apresentação de Crianças</h1>
        <p className="text-sm text-muted-foreground">Respostas do formulário público (sempre no 2º domingo do mês), separadas por turma. Entre em contato com a família para agendar o horário.</p>
      </div>

      <Card className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium">Link do formulário de inscrição</div>
          <a href={formUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary truncate block">{formUrl}</a>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={copiarLink} className="inline-flex items-center gap-1.5 text-xs border border-border rounded-md px-2.5 py-1.5 hover:bg-muted transition-colors">
            {copiado ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} {copiado ? 'Copiado' : 'Copiar link'}
          </button>
          <button onClick={compartilharWpp} className="inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 text-white transition-opacity hover:opacity-90" style={{ background: '#25D366' }}>
            <Share2 className="h-3.5 w-3.5" /> Compartilhar no WhatsApp
          </button>
        </div>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar criança, pai, mãe ou telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtradas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma inscrição de apresentação no momento.</Card>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{filtradas.length} inscriç{filtradas.length !== 1 ? 'ões' : 'ão'} · {grupos.length} turma{grupos.length !== 1 ? 's' : ''}</div>
          {grupos.map(([data, items]) => (
            <div key={data} className="space-y-2">
              <div className="flex items-center gap-2 pt-2">
                <div className="text-sm font-semibold">{data === 'sem-data' ? 'Sem data definida' : `Turma · ${fmt(data)}`}</div>
                <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
              </div>
              {items.map((b) => (
                <Card key={b.id} className="p-3 flex flex-col gap-2">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-fuchsia-500/10 flex items-center justify-center shrink-0"><Baby className="h-5 w-5 text-fuchsia-500" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{b.crianca_nome}{b.crianca_idade ? ` · ${b.crianca_idade}` : ''}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[b.nome_pai, b.nome_mae].filter(Boolean).join(' / ') || '—'}
                      </div>
                      {b.observacoes && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{b.observacoes}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="date"
                        value={b.data_apresentacao || ''}
                        onChange={(e) => mudarData(b.id, e.target.value)}
                        title="Data da apresentação (turma)"
                        className="h-7 text-[11px] rounded-md border border-border bg-background px-1.5 text-muted-foreground"
                      />
                      <Select value={b.status || 'pendente'} onValueChange={(v) => mudarStatus(b.id, v)}>
                        <SelectTrigger className={`h-7 text-[11px] w-[120px] ${STATUS_COR[b.status] || ''}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPCOES.map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {b.telefone && <a href={`https://wa.me/55${String(b.telefone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600" title="Falar com a família no WhatsApp"><Phone className="h-4 w-4" /></a>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 justify-end border-t border-border/50 pt-2">
                    <select
                      value={generos[b.id] || 'menino'}
                      onChange={(e) => setGeneros(g => ({ ...g, [b.id]: e.target.value as 'menino' | 'menina' }))}
                      title="Usado na concordância do certificado (filho/filha)"
                      className="h-7 text-[11px] rounded-md border border-border bg-background px-1.5"
                    >
                      <option value="menino">Menino</option>
                      <option value="menina">Menina</option>
                    </select>
                    <button
                      onClick={() => gerarCert(b)}
                      disabled={gerandoId === b.id || !b.data_apresentacao}
                      title={!b.data_apresentacao ? 'Defina a data da apresentação primeiro' : 'Gerar certificado (.pptx)'}
                      className="inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: '#407F96' }}
                    >
                      {gerandoId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Award className="h-3.5 w-3.5" />}
                      Gerar certificado
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
