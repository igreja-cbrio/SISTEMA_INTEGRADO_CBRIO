// Kids · Frequência — check-ins das crianças por culto, direto do NOSSO totem
// (kids_checkins). Escolhe a data (default último domingo), mostra o total por
// culto e, ao clicar, a lista nominal (hora, quem trouxe, se já saiu). Embaixo,
// o comparativo do mês/ano confere se o número CONSOLIDADO de cada culto
// (cultos.presencial_kids) bate com os check-ins reais — sessão esquecida sem
// encerrar aparece como diferença. O Planning Center saiu do código (2026-07-20).
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

const fmtData = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '');
const MES_NOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const mesAtual = () => new Date().toISOString().slice(0, 7);

export default function KidsFrequencia() {
  const navigate = useNavigate();
  const [data, setData] = useState(ultimoDomingo());
  const [loading, setLoading] = useState(false);
  const [sistema, setSistema] = useState<any>(null);
  const [abertoSist, setAbertoSist] = useState<string | null>(null);

  // ── Comparativo mensal · consolidado (presencial_kids) × check-ins do totem ──
  const [mesComp, setMesComp] = useState(mesAtual());
  const [compLoading, setCompLoading] = useState(false);
  const [comp, setComp] = useState<any>(null);
  const [soDiferencas, setSoDiferencas] = useState(true);

  async function comparar() {
    setCompLoading(true);
    setComp(null);
    try {
      const base: any = await api.comparativoMes(mesComp);
      const linhas = (base?.cultos || [])
        .filter((c: any) => c.has_kids)
        .map((c: any) => {
          const totem = c.checkins_totem ?? 0;
          const consolidado = c.presencial_kids ?? 0;
          return { ...c, totem, consolidado, diff: totem - consolidado };
        });
      if (!linhas.length) {
        toast.error('Nenhum culto com Kids encontrado nesse mês.');
        return;
      }
      const totais = {
        consolidado: linhas.reduce((s: number, l: any) => s + l.consolidado, 0),
        totem: linhas.reduce((s: number, l: any) => s + l.totem, 0),
      };
      setComp({ mes: base.mes, linhas, totais });
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível montar o comparativo.');
    } finally {
      setCompLoading(false);
    }
  }

  // ── Comparativo do ANO inteiro (mês a mês) ──
  const [anoComp, setAnoComp] = useState(String(new Date().getFullYear()));
  const [anoLoading, setAnoLoading] = useState(false);
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
        try {
          const base: any = await api.comparativoMes(mes);
          const kids = (base?.cultos || []).filter((c: any) => c.has_kids);
          const consolidado = kids.reduce((s: number, c: any) => s + (c.presencial_kids || 0), 0);
          const totem = kids.reduce((s: number, c: any) => s + (c.checkins_totem || 0), 0);
          meses.push({ mes, consolidado, totem, diff: totem - consolidado });
        } catch {
          erros.push(mes);
        }
      }
      setAnoRes({ ano, meses, erros });
    } finally {
      setAnoLoading(false);
    }
  }

  async function buscar(d = data) {
    setLoading(true);
    setSistema(null);
    setAbertoSist(null);
    try {
      const s: any = await api.frequenciaSistema(d);
      setSistema(s);
      if ((s?.por_culto || []).length === 1) setAbertoSist(s.por_culto[0].culto_id);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar os check-ins.');
      setSistema({ por_culto: [], total_criancas: 0, total_checkins: 0 });
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
        <p className="text-sm text-muted-foreground">Check-ins das crianças por culto, direto do totem. Clique num culto pra ver a lista nominal.</p>
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

      {sistema && !loading && (
        <div className="space-y-2">
          <Card className="glass-solid p-4 text-sm text-muted-foreground">
            <b className="text-foreground text-base">{sistema.total_criancas || 0}</b> crianças distintas no dia ·{' '}
            {sistema.total_checkins || 0} check-ins em {fmtData(sistema.data || data)}
            <div className="text-xs mt-1.5">
              Abaixo é a <b>ocupação por culto</b> — uma criança que fica em mais de um culto aparece em cada um,
              então a soma dos cultos pode ser maior que o total de crianças distintas.
            </div>
          </Card>
          {(sistema.por_culto || []).length === 0 ? (
            <Card className="glass-solid p-6 text-center text-muted-foreground text-sm">Nenhum check-in nesse dia.</Card>
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
                                {k.trazida_por && <span className="ml-2 text-xs text-muted-foreground">· com {k.trazida_por}</span>}
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

      {/* ── Comparativo · consolidado × check-ins do totem ── */}
      <div className="space-y-2 pt-2">
        <h2 className="text-sm font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide">Comparativo · consolidado × check-ins</h2>
        <Card className="glass-solid p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Compara, culto a culto, o número <b>consolidado</b> (gravado em <code>presencial_kids</code> ao
            encerrar a sessão) com a contagem de <b>crianças únicas nos check-ins do totem</b>. Diferença
            geralmente significa sessão que não foi encerrada ou ajuste manual. O totem opera desde
            julho/2026 — meses anteriores mostram só o consolidado (2025 veio da planilha "Dados Reconfigurados").
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
            <div className="pt-2 sm:pt-0 sm:pl-4 sm:border-l border-border/50 flex items-end gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Ano inteiro (mês a mês)</label>
                <input type="number" min={2020} max={2030} value={anoComp} onChange={(e) => setAnoComp(e.target.value)}
                  className="bg-[var(--cbrio-input-bg)] border border-border rounded-lg px-3 py-2 text-sm w-24" />
              </div>
              <button onClick={compararAno} disabled={anoLoading || compLoading || !/^\d{4}$/.test(anoComp)}
                className="bg-primary text-primary-foreground text-sm px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60">
                {anoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />} Comparar o ano
              </button>
            </div>
          </div>
        </Card>

        {anoRes && !anoLoading && (
          <Card className="glass-solid overflow-hidden">
            <div className="px-4 py-2 border-b border-border/50 text-xs text-muted-foreground">
              Frequência Kids {anoRes.ano} · mês a mês · consolidado × check-ins do totem
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground text-left border-b border-border/50">
                    <th className="px-4 py-2 font-medium">Mês</th>
                    <th className="px-4 py-2 font-medium text-right">Consolidado</th>
                    <th className="px-4 py-2 font-medium text-right">Check-ins (totem)</th>
                    <th className="px-4 py-2 font-medium text-right">Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {anoRes.meses.map((l: any) => (
                    <tr key={l.mes}>
                      <td className="px-4 py-1.5">{MES_NOME[Number(l.mes.slice(5)) - 1]}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{l.consolidado}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{l.totem}</td>
                      <td className={`px-4 py-1.5 text-right tabular-nums font-semibold ${l.diff === 0 ? 'text-muted-foreground' : l.diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {l.diff > 0 ? '+' : ''}{l.diff}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border/60 font-semibold">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right tabular-nums">{anoRes.meses.reduce((s: number, l: any) => s + l.consolidado, 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{anoRes.meses.reduce((s: number, l: any) => s + l.totem, 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {(() => { const d = anoRes.meses.reduce((s: number, l: any) => s + l.diff, 0); return `${d > 0 ? '+' : ''}${d}`; })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {(anoRes.erros || []).length > 0 && (
              <div className="px-4 py-2 text-xs text-amber-600 border-t border-border/50">
                Meses com erro na consulta: {anoRes.erros.join(', ')}.
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
                <span>Consolidado: <b className="tabular-nums">{comp.totais.consolidado}</b></span>
                <span>Check-ins (totem): <b className="tabular-nums">{comp.totais.totem}</b></span>
                <span>
                  Diferença:{' '}
                  <b className={`tabular-nums ${comp.totais.totem - comp.totais.consolidado === 0 ? '' : 'text-amber-600'}`}>
                    {comp.totais.totem - comp.totais.consolidado > 0 ? '+' : ''}{comp.totais.totem - comp.totais.consolidado}
                  </b>
                </span>
              </div>
            </Card>

            <Card className="glass-solid overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
                <span className="text-xs text-muted-foreground">
                  {soDiferencas ? 'Mostrando só cultos com diferença' : 'Mostrando todos os cultos com Kids do mês'}
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
                      <th className="px-4 py-2 font-medium text-right">Consolidado</th>
                      <th className="px-4 py-2 font-medium text-right">Check-ins</th>
                      <th className="px-4 py-2 font-medium text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {comp.linhas
                      .filter((l: any) => (soDiferencas ? l.diff !== 0 : l.consolidado > 0 || l.totem > 0))
                      .map((l: any) => (
                        <tr key={l.culto_id}>
                          <td className="px-4 py-1.5 tabular-nums whitespace-nowrap">{fmtData(l.data)}</td>
                          <td className="px-4 py-1.5">{l.nome}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums">{l.consolidado}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums">{l.totem}</td>
                          <td className={`px-4 py-1.5 text-right tabular-nums font-semibold ${l.diff === 0 ? 'text-muted-foreground' : l.diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {l.diff > 0 ? '+' : ''}{l.diff}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {comp.linhas.filter((l: any) => (soDiferencas ? l.diff !== 0 : l.consolidado > 0 || l.totem > 0)).length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {soDiferencas ? 'Nenhuma diferença entre o consolidado e os check-ins nesse mês.' : 'Nenhum culto com número de Kids nesse mês.'}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
