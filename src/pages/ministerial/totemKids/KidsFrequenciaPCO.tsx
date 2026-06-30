// Kids · Frequência (PCO) — validação da frequência das crianças por culto a
// partir dos check-ins do Planning Center. Escolhe a data (default último
// domingo), mostra o total por culto e, ao clicar no culto, a lista nominal das
// crianças que fizeram check-in (pra conferir se foram crianças mesmo). Mostra
// também quem o PCO NÃO contou como criança. Só leitura — não grava nem envia.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { totemKids as api } from '../../../api';
import { Card } from '../../../components/ui/card';
import { toast } from 'sonner';
import { BarChart3, Loader2, ChevronDown, ChevronRight, ArrowLeft, Baby, RefreshCw } from 'lucide-react';

// Último domingo (local) em YYYY-MM-DD.
function ultimoDomingo() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

export default function KidsFrequenciaPCO() {
  const navigate = useNavigate();
  const [data, setData] = useState(ultimoDomingo());
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [verExcluidos, setVerExcluidos] = useState(false);

  async function buscar(d = data) {
    setLoading(true);
    setRes(null);
    setAberto(null);
    try {
      const r: any = await api.resumoPcoTestar(d);
      setRes(r);
      if ((r?.por_culto || []).length === 1) setAberto(r.por_culto[0].culto_id);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível consultar o Planning Center.');
    } finally { setLoading(false); }
  }

  useEffect(() => { buscar(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
      <button onClick={() => navigate('/ministerial/kids')} className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar pro Kids
      </button>

      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><BarChart3 className="h-6 w-6 text-sky-500" /> Frequência do Kids (PCO)</h1>
        <p className="text-sm text-muted-foreground">Check-ins das crianças no Planning Center, por culto. Clique num culto pra ver a lista nominal e validar.</p>
      </div>

      <Card className="glass-solid p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Data do culto</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)}
            className="bg-[var(--cbrio-input-bg)] border border-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={() => buscar()} disabled={loading}
          className="bg-primary text-primary-foreground text-sm px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Buscar
        </button>
      </Card>

      {loading && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}

      {res && !loading && (
        <>
          <Card className="glass-solid p-4 text-sm">
            <div className="text-muted-foreground">
              <b className="text-foreground text-base">{res.total_criancas}</b> crianças no check-in em {res.data?.split('-').reverse().join('/')}
              {' '}· {res.total_checkins} check-ins no total{res.sem_culto_casado ? ` · ${res.sem_culto_casado} sem culto casado` : ''}
            </div>
          </Card>

          {(res.por_culto || []).length === 0 ? (
            <Card className="glass-solid p-6 text-center text-muted-foreground text-sm">Nenhuma criança no check-in nesse dia.</Card>
          ) : (
            <div className="space-y-2">
              {res.por_culto.map((c: any) => {
                const open = aberto === c.culto_id;
                return (
                  <Card key={c.culto_id} className="glass-solid overflow-hidden">
                    <button onClick={() => setAberto(open ? null : c.culto_id)}
                      className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-foreground/5">
                      <span className="flex items-center gap-2 font-medium">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {c.nome}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-bold tabular-nums">
                        <Baby className="h-4 w-4 text-pink-500" /> {c.total}
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-border/50 px-4 py-2">
                        {(c.criancas || []).length === 0 ? (
                          <div className="text-xs text-muted-foreground py-2">Sem lista nominal.</div>
                        ) : (
                          <ol className="text-sm divide-y divide-border/40">
                            {c.criancas.map((k: any, i: number) => (
                              <li key={i} className="flex items-center justify-between py-1.5">
                                <span><span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>{k.nome}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">{k.hora || ''}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {(res.nao_contadas || []).length > 0 && (
            <Card className="glass-solid p-4">
              <button onClick={() => setVerExcluidos(!verExcluidos)} className="w-full flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  {verExcluidos ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Não contadas (PCO não marcou como criança)
                </span>
                <span className="font-semibold tabular-nums text-muted-foreground">{res.nao_contadas.length}</span>
              </button>
              {verExcluidos && (
                <ol className="mt-2 text-sm divide-y divide-border/40 border-t border-border/50 pt-2">
                  {res.nao_contadas.map((k: any, i: number) => (
                    <li key={i} className="flex items-center justify-between py-1.5">
                      <span><span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>{k.nome}</span>
                      <span className="text-xs text-muted-foreground">{[k.culto, k.hora].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
