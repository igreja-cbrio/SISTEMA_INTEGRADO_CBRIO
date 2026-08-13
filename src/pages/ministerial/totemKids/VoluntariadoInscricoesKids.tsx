// Kids · Inscrições de voluntariado — quem se inscreveu no voluntariado
// indicando o Kids (vol_inscricoes.area='kids'). A coordenação do Kids
// (Mariane Gaia / Milena) vê, contata (WhatsApp) e encaminha ao ministério.
// Integrar (com verificação de antecedentes · ECA/LGPD) é no módulo Voluntariado.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { hrefConversa } from '@/lib/conversas';
import { totemKids as api } from '../../../api';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Textarea } from '../../../components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Search, Loader2, Send, Undo2, MessageSquare, Phone, Users } from 'lucide-react';

type Insc = {
  id: string; nome_completo: string | null; nome: string | null; sobrenome: string | null;
  telefone: string | null; email: string | null; status: string;
  ministerios_interesse: string | null; dom_predominante: string | null;
  data_inscricao: string | null; feedback: string | null; integrado_em: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  inscrito: { label: 'Inscrito', cls: 'border-amber-400/50 text-amber-600 dark:text-amber-400' },
  enviado_ministerio: { label: 'Encaminhado', cls: 'border-sky-400/50 text-sky-600 dark:text-sky-400' },
  integrado: { label: 'Integrado', cls: 'border-emerald-400/50 text-emerald-600 dark:text-emerald-400' },
};

function waHref(tel: string | null): string | null {
  if (!tel) return null;
  let d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}`;
}
function primeiroNome(i: Insc): string {
  return (i.nome_completo || i.nome || '').trim().split(/\s+/)[0] || 'voluntário(a)';
}

export default function VoluntariadoInscricoesKids() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Insc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'inscrito' | 'enviado_ministerio'>('todos');
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [notaId, setNotaId] = useState<string | null>(null);
  const [nota, setNota] = useState('');

  const carregar = useCallback(() => {
    setLoading(true);
    api.voluntariadoInscricoes()
      .then((d: any) => setRows(Array.isArray(d?.rows) ? d.rows : []))
      .catch(() => toast.error('Erro ao carregar inscrições'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return rows.filter(r => {
      if (filtro !== 'todos' && r.status !== filtro) return false;
      if (t && !((r.nome_completo || '').toLowerCase().includes(t))) return false;
      return true;
    });
  }, [rows, busca, filtro]);

  const contagem = useMemo(() => ({
    total: rows.length,
    inscrito: rows.filter(r => r.status === 'inscrito').length,
    enviado: rows.filter(r => r.status === 'enviado_ministerio').length,
  }), [rows]);

  async function mudarStatus(i: Insc, status: string) {
    setSalvandoId(i.id);
    try {
      const atual = await api.voluntariadoInscricaoUpdate(i.id, { status });
      setRows(rs => rs.map(r => (r.id === i.id ? { ...r, status: atual.status } : r)));
      toast.success(status === 'enviado_ministerio' ? 'Encaminhado ao ministério.' : 'Voltou para inscrito.');
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível atualizar.');
    } finally { setSalvandoId(null); }
  }

  async function salvarNota(i: Insc) {
    setSalvandoId(i.id);
    try {
      await api.voluntariadoInscricaoUpdate(i.id, { feedback: nota });
      setRows(rs => rs.map(r => (r.id === i.id ? { ...r, feedback: nota } : r)));
      setNotaId(null); setNota('');
      toast.success('Anotação salva.');
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar a anotação.');
    } finally { setSalvandoId(null); }
  }

  return (
    <div className="px-6 py-6 space-y-4 max-w-3xl mx-auto">
      <button onClick={() => navigate('/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Kids
      </button>

      <div>
        <h1 className="text-lg font-bold flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Voluntariado · inscrições do Kids</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Quem se inscreveu querendo servir no Kids. Contate pelo WhatsApp e encaminhe ao ministério.
        </p>
      </div>

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por nome..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        {([['todos', `Todos (${contagem.total})`], ['inscrito', `Inscritos (${contagem.inscrito})`], ['enviado_ministerio', `Encaminhados (${contagem.enviado})`]] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setFiltro(v as any)}
            className={`px-2.5 py-1.5 rounded-md border text-xs transition ${filtro === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtradas.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma inscrição encontrada.</Card>
      ) : (
        <div className="space-y-2">
          {filtradas.map(i => {
            const wa = waHref(i.telefone);
            const meta = STATUS_META[i.status] || { label: i.status, cls: 'border-border text-muted-foreground' };
            const saving = salvandoId === i.id;
            const integrado = i.status === 'integrado';
            return (
              <Card key={i.id} className="p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{i.nome_completo || `${i.nome || ''} ${i.sobrenome || ''}`.trim() || '—'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {i.ministerios_interesse ? `Interesse: ${i.ministerios_interesse}` : 'Kids'}
                      {i.dom_predominante ? ` · Dom: ${i.dom_predominante}` : ''}
                      {i.data_inscricao ? ` · ${new Date(i.data_inscricao).toLocaleDateString('pt-BR')}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className={`${meta.cls} shrink-0`}>{meta.label}</Badge>
                </div>

                {i.feedback && notaId !== i.id && (
                  <p className="text-xs text-muted-foreground italic bg-muted/40 rounded-md px-2 py-1.5">“{i.feedback}”</p>
                )}

                {notaId === i.id ? (
                  <div className="space-y-2">
                    <Textarea rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Anotação sobre o contato / observações" />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => { setNotaId(null); setNota(''); }}>Cancelar</Button>
                      <Button size="sm" onClick={() => salvarNota(i)} disabled={saving}>{saving ? 'Salvando...' : 'Salvar anotação'}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {wa ? (
                      <Link to={hrefConversa(i.telefone)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs hover:bg-emerald-500/10 transition">
                        <Phone className="h-3.5 w-3.5" /> WhatsApp
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground px-1 py-1.5">sem telefone</span>
                    )}
                    <button type="button" onClick={() => { setNotaId(i.id); setNota(i.feedback || ''); }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs hover:border-primary transition">
                      <MessageSquare className="h-3.5 w-3.5" /> Anotação
                    </button>
                    {!integrado && i.status !== 'enviado_ministerio' && (
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => mudarStatus(i, 'enviado_ministerio')}
                        className="h-auto py-1.5 text-xs">
                        <Send className="h-3.5 w-3.5 mr-1.5" /> Encaminhar ao ministério
                      </Button>
                    )}
                    {i.status === 'enviado_ministerio' && (
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => mudarStatus(i, 'inscrito')}
                        className="h-auto py-1.5 text-xs text-muted-foreground">
                        <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Voltar a inscrito
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70 pt-1">
        Para <span className="font-medium">integrar</span> um voluntário (exige verificação de antecedentes), use o módulo Voluntariado.
      </p>
    </div>
  );
}
