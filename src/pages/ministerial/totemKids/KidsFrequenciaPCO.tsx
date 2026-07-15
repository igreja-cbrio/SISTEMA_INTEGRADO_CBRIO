// Kids · Frequência (PCO) — validação da frequência das crianças por culto a
// partir dos check-ins do Planning Center. Escolhe a data (default último
// domingo), mostra o total por culto e, ao clicar no culto, a lista nominal das
// crianças que fizeram check-in (pra conferir se foram crianças mesmo). Mostra
// também quem o PCO NÃO contou como criança. Só leitura — não grava nem envia.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { totemKids as api } from '../../../api';
import { Card } from '../../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { toast } from 'sonner';
import { BarChart3, Loader2, ChevronDown, ChevronRight, ArrowLeft, Baby, RefreshCw, Clock, Phone, User } from 'lucide-react';

// Último domingo (local) em YYYY-MM-DD.
function ultimoDomingo() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function idadeDe(nasc?: string | null) {
  if (!nasc) return null;
  try {
    const n = new Date(); const b = new Date(nasc + 'T00:00:00');
    let a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return a;
  } catch { return null; }
}
const fmtData = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '');

export default function KidsFrequenciaPCO() {
  const navigate = useNavigate();
  const [data, setData] = useState(ultimoDomingo());
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [sistema, setSistema] = useState<any>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [abertoSist, setAbertoSist] = useState<string | null>(null);
  const [verExcluidos, setVerExcluidos] = useState(false);
  const [pessoaSel, setPessoaSel] = useState<any>(null);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [loadingDet, setLoadingDet] = useState(false);

  // ── Comparativo mensal · o que está gravado no sistema × check-ins do PCO ──
  const [mesComp, setMesComp] = useState('2025-01');
  const [compLoading, setCompLoading] = useState(false);
  const [compProg, setCompProg] = useState({ feito: 0, total: 0 });
  const [comp, setComp] = useState<any>(null);
  const [soDiferencas, setSoDiferencas] = useState(true);

  async function comparar() {
    setCompLoading(true);
    setComp(null);
    try {
      const base: any = await api.comparativoMes(mesComp);
      const datas: string[] = base?.datas || [];
      if (!datas.length) {
        toast.error('Nenhum culto encontrado nesse mês.');
        return;
      }
      setCompProg({ feito: 0, total: datas.length });
      const pcoPorCulto = new Map<string, number>();
      let pcoSemCulto = 0;
      const erros: string[] = [];
      // Sequencial de propósito: cada dia é uma varredura paginada na API do
      // Planning Center (respeita o rate limit deles).
      for (let i = 0; i < datas.length; i++) {
        const d = datas[i];
        try {
          const r: any = await api.resumoPcoTestar(d);
          for (const c of r?.por_culto || []) pcoPorCulto.set(c.culto_id, c.total || 0);
          pcoSemCulto += r?.sem_culto_casado || 0;
        } catch {
          erros.push(d);
        }
        setCompProg({ feito: i + 1, total: datas.length });
      }
      const linhas = (base?.cultos || []).map((c: any) => {
        const pco = pcoPorCulto.get(c.culto_id) ?? 0;
        const sistema = c.presencial_kids ?? 0;
        return { ...c, pco, sistema, diff: pco - sistema };
      });
      const totais = {
        sistema: linhas.reduce((s: number, l: any) => s + l.sistema, 0),
        pco: linhas.reduce((s: number, l: any) => s + l.pco, 0),
      };
      setComp({ mes: base.mes, linhas, totais, erros, pcoSemCulto });
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível montar o comparativo.');
    } finally {
      setCompLoading(false);
    }
  }

  // ── Comparativo do ANO inteiro (mês a mês) ──
  const [anoComp, setAnoComp] = useState('2025');
  const [anoLoading, setAnoLoading] = useState(false);
  const [anoProg, setAnoProg] = useState<{ mes: string; feito: number; total: number } | null>(null);
  const [anoRes, setAnoRes] = useState<any>(null);

  async function compararAno() {
    setAnoLoading(true);
    setAnoRes(null);
    const ano = Number(anoComp);
    const hoje = new Date();
    const mesLimite = ano < hoje.getFullYear() ? 12 : hoje.getMonth() + 1;
    const meses: any[] = [];
    const erros: string[] = [];
    try {
      for (let m = 1; m <= mesLimite; m++) {
        const mes = `${ano}-${String(m).padStart(2, '0')}`;
        let base: any;
        try {
          base = await api.comparativoMes(mes);
        } catch {
          erros.push(mes);
          continue;
        }
        const datas: string[] = base?.datas || [];
        const pcoPorCulto = new Map<string, number>();
        for (let i = 0; i < datas.length; i++) {
          setAnoProg({ mes, feito: i + 1, total: datas.length });
          try {
            const r: any = await api.resumoPcoTestar(datas[i]);
            for (const c of r?.por_culto || []) pcoPorCulto.set(c.culto_id, c.total || 0);
          } catch {
            erros.push(datas[i]);
          }
        }
        const sistema = (base?.cultos || []).reduce((s: number, c: any) => s + (c.presencial_kids || 0), 0);
        const pco = (base?.cultos || []).reduce((s: number, c: any) => s + (pcoPorCulto.get(c.culto_id) ?? 0), 0);
        meses.push({ mes, sistema, pco, diff: pco - sistema });
      }
      setAnoRes({ ano, meses, erros });
    } finally {
      setAnoLoading(false);
      setAnoProg(null);
    }
  }

  const MES_NOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  async function abrirPessoa(k: any) {
    if (!k?.pco_id) { toast.error('Sem vínculo com o Planning Center pra esta pessoa.'); return; }
    setPessoaSel(k);
    setDetalhe(null);
    setLoadingDet(true);
    try {
      const r: any = await api.pcoPessoa(k.pco_id);
      setDetalhe(r);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar a ficha.');
      setPessoaSel(null);
    } finally { setLoadingDet(false); }
  }

  async function buscar(d = data) {
    setLoading(true);
    setRes(null);
    setSistema(null);
    setAberto(null);
    setAbertoSist(null);
    // Sistema (totem) — independente do PCO; não deixa o PCO derrubar essa parte
    api.frequenciaSistema(d)
      .then((s: any) => {
        setSistema(s);
        if ((s?.por_culto || []).length === 1) setAbertoSist(s.por_culto[0].culto_id);
      })
      .catch(() => setSistema({ por_culto: [], total_criancas: 0, total_checkins: 0 }));
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
      <button onClick={() => navigate('/kids')} className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar ao Kids
      </button>

      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><BarChart3 className="h-6 w-6 text-sky-500" /> Frequência do Kids</h1>
        <p className="text-sm text-muted-foreground">Check-ins das crianças por culto — do <b>sistema (totem)</b> e do <b>Planning Center</b>. Clique num culto pra ver a lista nominal.</p>
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

      {/* ── Check-ins pelo SISTEMA (totem) ── */}
      {sistema && !loading && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wide">Sistema (totem)</h2>
          <Card className="glass-solid p-4 text-sm text-muted-foreground">
            <b className="text-foreground text-base">{sistema.total_criancas || 0}</b> crianças distintas no dia ·{' '}
            {sistema.total_checkins || 0} check-ins pelo sistema em {fmtData(sistema.data || data)}
            <div className="text-xs mt-1.5">
              Abaixo é a <b>ocupação por culto</b> — uma criança que fica em mais de um culto aparece em cada um,
              então a soma dos cultos pode ser maior que o total de crianças distintas.
            </div>
          </Card>
          {(sistema.por_culto || []).length === 0 ? (
            <Card className="glass-solid p-6 text-center text-muted-foreground text-sm">Nenhum check-in pelo sistema nesse dia.</Card>
          ) : (
            sistema.por_culto.map((c: any) => {
              const open = abertoSist === c.culto_id;
              return (
                <Card key={c.culto_id} className="glass-solid overflow-hidden">
                  <button onClick={() => setAbertoSist(open ? null : c.culto_id)}
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
                              <span>
                                <span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>{k.nome}
                                {k.saiu && <span className="ml-2 text-[10px] text-muted-foreground border border-border rounded px-1">saiu</span>}
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">{k.hora || ''}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {res && !loading && (
        <>
          <h2 className="text-sm font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wide">Planning Center</h2>
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
                              <li key={i}>
                                <button onClick={() => abrirPessoa(k)} disabled={!k.pco_id}
                                  className="w-full flex items-center justify-between py-1.5 text-left rounded hover:text-primary disabled:opacity-70 disabled:hover:text-inherit">
                                  <span><span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>{k.nome}</span>
                                  <span className="text-xs text-muted-foreground tabular-nums">{k.hora || ''}</span>
                                </button>
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
                    <li key={i}>
                      <button onClick={() => abrirPessoa(k)} disabled={!k.pco_id}
                        className="w-full flex items-center justify-between py-1.5 text-left rounded hover:text-primary disabled:opacity-70 disabled:hover:text-inherit">
                        <span><span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>{k.nome}</span>
                        <span className="text-xs text-muted-foreground">{[k.motivo, k.evento, k.culto, k.hora].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
        </>
      )}

      {/* ── Comparativo mensal · sistema × PCO ── */}
      <div className="space-y-2 pt-2">
        <h2 className="text-sm font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide">Comparativo mensal · sistema × PCO</h2>
        <Card className="glass-solid p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Compara, culto a culto, o número gravado no sistema com a contagem de crianças nos check-ins do
            Planning Center. Em <b>2025</b>, o valor do sistema veio da planilha "Dados Reconfigurados"
            (backfill de 27/05/2026); de 2026 em diante vem do totem/coleta. PCO = check-ins em eventos do
            Kids, excluindo voluntários.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Mês</label>
              <input type="month" value={mesComp} onChange={(e) => setMesComp(e.target.value)}
                className="bg-[var(--cbrio-input-bg)] border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <button onClick={comparar} disabled={compLoading || !/^\d{4}-\d{2}$/.test(mesComp)}
              className="bg-primary text-primary-foreground text-sm px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60">
              {compLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />} Comparar
            </button>
            {compLoading && compProg.total > 0 && (
              <span className="text-xs text-muted-foreground pb-2">
                Consultando o Planning Center · dia {compProg.feito}/{compProg.total}…
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border/50">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Ano inteiro (mês a mês)</label>
              <input type="number" min={2020} max={2030} value={anoComp} onChange={(e) => setAnoComp(e.target.value)}
                className="bg-[var(--cbrio-input-bg)] border border-border rounded-lg px-3 py-2 text-sm w-24" />
            </div>
            <button onClick={compararAno} disabled={anoLoading || compLoading || !/^\d{4}$/.test(anoComp)}
              className="bg-primary text-primary-foreground text-sm px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60">
              {anoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />} Comparar o ano
            </button>
            {anoLoading && (
              <span className="text-xs text-muted-foreground pb-2">
                {anoProg
                  ? <>Varrendo {MES_NOME[Number(anoProg.mes.slice(5)) - 1]}/{anoProg.mes.slice(0, 4)} · dia {anoProg.feito}/{anoProg.total}… (leva alguns minutos · deixe a aba aberta)</>
                  : 'Preparando…'}
              </span>
            )}
          </div>
        </Card>

        {anoRes && !anoLoading && (
          <Card className="glass-solid overflow-hidden">
            <div className="px-4 py-2 border-b border-border/50 text-xs text-muted-foreground">
              Frequência Kids {anoRes.ano} · mês a mês · No sistema × check-ins do PCO
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground text-left border-b border-border/50">
                    <th className="px-4 py-2 font-medium">Mês</th>
                    <th className="px-4 py-2 font-medium text-right">No sistema</th>
                    <th className="px-4 py-2 font-medium text-right">PCO</th>
                    <th className="px-4 py-2 font-medium text-right">Δ</th>
                    <th className="px-4 py-2 font-medium text-right">Δ%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {anoRes.meses.map((l: any) => (
                    <tr key={l.mes}>
                      <td className="px-4 py-1.5">{MES_NOME[Number(l.mes.slice(5)) - 1]}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{l.sistema}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{l.pco}</td>
                      <td className={`px-4 py-1.5 text-right tabular-nums font-semibold ${l.diff === 0 ? 'text-muted-foreground' : l.diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {l.diff > 0 ? '+' : ''}{l.diff}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-xs text-muted-foreground">
                        {l.sistema > 0 ? `${((l.diff / l.sistema) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border/60 font-semibold">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right tabular-nums">{anoRes.meses.reduce((s: number, l: any) => s + l.sistema, 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{anoRes.meses.reduce((s: number, l: any) => s + l.pco, 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {(() => { const d = anoRes.meses.reduce((s: number, l: any) => s + l.diff, 0); return `${d > 0 ? '+' : ''}${d}`; })()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground">
                      {(() => {
                        const sis = anoRes.meses.reduce((s: number, l: any) => s + l.sistema, 0);
                        const d = anoRes.meses.reduce((s: number, l: any) => s + l.diff, 0);
                        return sis > 0 ? `${((d / sis) * 100).toFixed(1)}%` : '—';
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {(anoRes.erros || []).length > 0 && (
              <div className="px-4 py-2 text-xs text-amber-600 border-t border-border/50">
                Consultas com erro (não entraram no PCO): {anoRes.erros.join(', ')}.
              </div>
            )}
            <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border/50">
              Pra ver o detalhe culto a culto de um mês, use o comparativo mensal acima.
            </div>
          </Card>
        )}

        {comp && !compLoading && (
          <>
            <Card className="glass-solid p-4 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>No sistema: <b className="tabular-nums">{comp.totais.sistema}</b></span>
                <span>PCO: <b className="tabular-nums">{comp.totais.pco}</b></span>
                <span>
                  Diferença:{' '}
                  <b className={`tabular-nums ${comp.totais.pco - comp.totais.sistema === 0 ? '' : 'text-amber-600'}`}>
                    {comp.totais.pco - comp.totais.sistema > 0 ? '+' : ''}{comp.totais.pco - comp.totais.sistema}
                  </b>
                  {comp.totais.sistema > 0 && (
                    <span className="text-muted-foreground text-xs">
                      {' '}({(((comp.totais.pco - comp.totais.sistema) / comp.totais.sistema) * 100).toFixed(1)}%)
                    </span>
                  )}
                </span>
              </div>
              {(comp.pcoSemCulto > 0 || (comp.erros || []).length > 0) && (
                <div className="text-xs text-amber-600 mt-1.5">
                  {comp.pcoSemCulto > 0 && <span>{comp.pcoSemCulto} check-in(s) do PCO sem culto casado (fora do total PCO por culto). </span>}
                  {(comp.erros || []).length > 0 && <span>Dias com erro na consulta: {comp.erros.map(fmtData).join(', ')}.</span>}
                </div>
              )}
            </Card>

            <Card className="glass-solid overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
                <span className="text-xs text-muted-foreground">
                  {soDiferencas ? 'Mostrando só cultos com diferença' : 'Mostrando todos os cultos do mês'}
                </span>
                <button onClick={() => setSoDiferencas(!soDiferencas)} className="text-xs text-primary hover:underline">
                  {soDiferencas ? 'Ver todos' : 'Ver só diferenças'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground text-left border-b border-border/50">
                      <th className="px-4 py-2 font-medium">Data</th>
                      <th className="px-4 py-2 font-medium">Culto</th>
                      <th className="px-4 py-2 font-medium text-right">No sistema</th>
                      <th className="px-4 py-2 font-medium text-right">PCO</th>
                      <th className="px-4 py-2 font-medium text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {comp.linhas
                      .filter((l: any) => (soDiferencas ? l.diff !== 0 : l.sistema > 0 || l.pco > 0))
                      .map((l: any) => (
                        <tr key={l.culto_id}>
                          <td className="px-4 py-1.5 tabular-nums whitespace-nowrap">{fmtData(l.data)}</td>
                          <td className="px-4 py-1.5">{l.nome}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums">{l.sistema}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums">{l.pco}</td>
                          <td className={`px-4 py-1.5 text-right tabular-nums font-semibold ${l.diff === 0 ? 'text-muted-foreground' : l.diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {l.diff > 0 ? '+' : ''}{l.diff}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {comp.linhas.filter((l: any) => (soDiferencas ? l.diff !== 0 : l.sistema > 0 || l.pco > 0)).length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {soDiferencas ? 'Nenhuma diferença entre o sistema e o PCO nesse mês.' : 'Nenhum culto com número de Kids nesse mês.'}
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <Dialog open={!!pessoaSel} onOpenChange={(o) => { if (!o) { setPessoaSel(null); setDetalhe(null); } }}>
        <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><User className="h-5 w-5 text-sky-500" /> {pessoaSel?.nome || detalhe?.pessoa?.nome || 'Criança'}</DialogTitle>
          </DialogHeader>
          {loadingDet ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : detalhe ? (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4 text-sm">
              {/* Ficha */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                {(() => { const id = idadeDe(detalhe.crianca_local?.data_nascimento || detalhe.pessoa?.birthdate); return id != null ? <span>Idade: <b className="text-foreground">{id} ano{id === 1 ? '' : 's'}</b></span> : null; })()}
                {detalhe.crianca_local?.sexo && <span>Sexo: <b className="text-foreground">{detalhe.crianca_local.sexo}</b></span>}
                <span>PCO: {detalhe.pessoa?.child ? <b className="text-emerald-600">criança</b> : <b className="text-amber-600">não-criança</b>}</span>
                {detalhe.crianca_local?.visitante ? <span className="text-amber-600">visitante</span> : null}
              </div>
              {!detalhe.crianca_local && (
                <div className="text-xs text-amber-600">Sem ficha local (ainda não sincronizada do PCO pro cadastro de crianças).</div>
              )}

              {/* Responsáveis */}
              {(detalhe.responsaveis || []).length > 0 && (
                <div>
                  <div className="font-semibold mb-1">Responsáveis</div>
                  <div className="space-y-1">
                    {detalhe.responsaveis.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between border-b border-border/40 py-1">
                        <span>{r.nome || '—'}{r.parentesco ? <span className="text-muted-foreground"> · {r.parentesco}</span> : ''}{r.autorizado_buscar ? <span className="text-emerald-600 text-xs"> · pode buscar</span> : ''}</span>
                        {r.telefone && <a href={`https://wa.me/55${String(r.telefone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.telefone}</a>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico de check-ins */}
              <div>
                <div className="font-semibold mb-1 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" /> Histórico de check-ins
                  <span className="text-muted-foreground font-normal">({detalhe.total_checkins || 0})</span>
                </div>
                {(detalhe.historico || []).length === 0 ? (
                  <div className="text-muted-foreground text-xs py-2">Sem check-ins no Planning Center.</div>
                ) : (
                  <ol className="divide-y divide-border/40">
                    {detalhe.historico.map((h: any, i: number) => (
                      <li key={i} className="flex items-center justify-between py-1.5">
                        <span>{fmtData(h.data)}{h.evento ? <span className="text-muted-foreground"> · {h.evento}</span> : ''}{h.local ? <span className="text-muted-foreground"> · {h.local}</span> : ''}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{h.hora || ''}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
