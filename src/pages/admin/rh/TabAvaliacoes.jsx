import { useState, useEffect, useCallback, useMemo } from 'react';
import { rh, pcs } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Star, Target, ClipboardList, UserCheck, Settings2, CheckCircle2, PlayCircle, X, ChevronRight, Sparkles, Calendar } from 'lucide-react';

const C = {
  primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
  green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418',
  amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
  purple: '#8b5cf6', purpleBg: '#8b5cf618',
};

const STATUS_LABEL = {
  metas_pendentes: { label: 'Metas pendentes', color: C.text3, bg: '#73737318' },
  em_andamento:    { label: 'Em andamento', color: C.blue, bg: C.blueBg },
  autoavaliada:    { label: 'Autoavaliada', color: C.amber, bg: C.amberBg },
  avaliada_lider:  { label: 'Avaliada por líder', color: C.purple, bg: C.purpleBg },
  calibrada:       { label: 'Calibrada', color: C.green, bg: C.greenBg },
  concluida:       { label: 'Concluída', color: C.primary, bg: C.primaryBg },
  cancelada:       { label: 'Cancelada', color: C.red, bg: C.redBg },
};

const FASES_CICLO = [
  { mes: 'Jan-Fev', label: 'Definição de metas', desc: 'Liderança define metas SMART', icon: Target },
  { mes: 'Mar-Nov', label: 'Acompanhamento contínuo', desc: 'Feedbacks trimestrais', icon: ClipboardList },
  { mes: 'Dezembro', label: 'Avaliação formal', desc: 'Autoavaliação + líder', icon: Star },
  { mes: 'Janeiro', label: 'Calibração e decisão', desc: 'Comitê RH revisa', icon: UserCheck },
  { mes: 'Março', label: 'Aplicação de reajustes', desc: 'Reajustes na folha', icon: Sparkles },
];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

function NotaStars({ value, onChange }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange?.(n)} disabled={!onChange}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}>
          <Star className={`h-5 w-5 ${n <= (value || 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
        </button>
      ))}
    </div>
  );
}

function FaseCiclo({ idx, fase, ativa }) {
  const Icon = fase.icon;
  return (
    <div className={`flex-1 min-w-[140px] rounded-lg border p-2.5 ${ativa ? 'border-primary bg-primary/5' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-3.5 w-3.5 ${ativa ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: ativa ? C.primary : C.text3 }}>{fase.mes}</span>
      </div>
      <div className="text-xs font-semibold">{fase.label}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{fase.desc}</div>
    </div>
  );
}

function Pill({ status }) {
  const s = STATUS_LABEL[status] || STATUS_LABEL.em_andamento;
  return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: s.color, background: s.bg }}>{s.label}</span>;
}

export default function TabAvaliacoes({ funcionarios = [] }) {
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [criterios, setCriterios] = useState([]);
  const [graus, setGraus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroCiclo, setFiltroCiclo] = useState(new Date().getFullYear());
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroFunc, setFiltroFunc] = useState('');
  const [openAvaliacao, setOpenAvaliacao] = useState(null);
  const [flash, setFlash] = useState(null);

  const showFlash = (msg, kind = 'info') => {
    setFlash({ msg, kind });
    setTimeout(() => setFlash(null), 4500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c, g] = await Promise.all([
        rh.avaliacoes.list(),
        pcs.criterios.list(),
        pcs.graus.list(),
      ]);
      setAvaliacoes(a || []);
      setCriterios(c || []);
      setGraus(g || []);
    } catch (e) {
      console.error(e);
      showFlash('Erro ao carregar avaliações: ' + e.message, 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const lista = useMemo(() => avaliacoes.filter(a => {
    if (filtroCiclo && a.ciclo_ano !== Number(filtroCiclo)) return false;
    if (filtroStatus && a.status !== filtroStatus) return false;
    if (filtroFunc && a.funcionario_id !== filtroFunc) return false;
    return true;
  }), [avaliacoes, filtroCiclo, filtroStatus, filtroFunc]);

  const iniciarCiclo = async () => {
    if (!confirm(`Iniciar ciclo ${filtroCiclo} para todos os colaboradores ativos? Cria 1 avaliação pendente por colaborador.`)) return;
    try {
      const r = await rh.avaliacoes.iniciarCiclo({ ciclo_ano: Number(filtroCiclo) });
      showFlash(`Ciclo ${filtroCiclo} iniciado · ${r.criadas} avaliações criadas`, 'success');
      load();
    } catch (e) { showFlash(e.message, 'error'); }
  };

  // Identifica fase atual do ciclo baseada na data
  const mes = new Date().getMonth() + 1;
  const faseAtualIdx = mes <= 2 ? 0 : mes <= 11 ? 1 : mes === 12 ? 2 : 3;

  // Resumo numérico
  const resumo = {
    total: lista.length,
    pendentes: lista.filter(a => a.status === 'metas_pendentes' || a.status === 'em_andamento').length,
    autoavaliadas: lista.filter(a => a.status === 'autoavaliada').length,
    avaliadas: lista.filter(a => a.status === 'avaliada_lider').length,
    concluidas: lista.filter(a => a.status === 'concluida' || a.status === 'calibrada').length,
    media: lista.filter(a => a.pontuacao_final).reduce((acc, a, _, arr) => acc + Number(a.pontuacao_final) / arr.length, 0),
  };

  return (
    <div className="space-y-4">
      {flash && (
        <div className="fixed top-5 right-5 z-[9999] flex items-center gap-2 rounded-xl border bg-card p-3 pr-4 shadow-lg max-w-[400px]"
          style={{ borderLeft: `4px solid ${flash.kind === 'error' ? C.red : flash.kind === 'success' ? C.green : C.blue}` }}>
          <span className="text-sm">{flash.msg}</span>
          <button onClick={() => setFlash(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Ciclo de Avaliação {filtroCiclo}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Avaliação 360° baseada nos 6 critérios do PCS · pontuação alimenta o enquadramento e a progressão por mérito
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <ShadSelect value={String(filtroCiclo)} onValueChange={v => setFiltroCiclo(Number(v))}>
                <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 1, 2].map(o => {
                    const ano = new Date().getFullYear() - o;
                    return <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>;
                  })}
                </SelectContent>
              </ShadSelect>
              <Button size="sm" onClick={iniciarCiclo}><PlayCircle className="h-3.5 w-3.5 mr-1.5" /> Iniciar ciclo</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {FASES_CICLO.map((f, i) => <FaseCiclo key={i} idx={i} fase={f} ativa={i === faseAtualIdx} />)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <ResumoCard label="Total" value={resumo.total} />
            <ResumoCard label="Pendentes" value={resumo.pendentes} color={C.text3} />
            <ResumoCard label="Autoavaliadas" value={resumo.autoavaliadas} color={C.amber} />
            <ResumoCard label="Avaliadas líder" value={resumo.avaliadas} color={C.purple} />
            <ResumoCard label="Concluídas" value={resumo.concluidas} color={C.green} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold">Avaliações do ciclo</CardTitle>
          <div className="flex gap-2">
            <ShadSelect value={filtroStatus || '__all__'} onValueChange={v => setFiltroStatus(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </ShadSelect>
            <ShadSelect value={filtroFunc || '__all__'} onValueChange={v => setFiltroFunc(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {funcionarios.filter(f => f.status === 'ativo').map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </ShadSelect>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Carregando...</div>
          ) : !lista.length ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhuma avaliação para esse filtro. Inicie o ciclo para criar uma por colaborador ativo.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Colaborador</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Nota final (0-5)</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Pontos PCS</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Grau sugerido</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Última atualização</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map(a => (
                  <tr key={a.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 font-semibold">{a.funcionario?.nome || '—'}<div className="text-xs text-muted-foreground font-normal">{a.funcionario?.cargo}</div></td>
                    <td className="px-3 py-2"><Pill status={a.status} /></td>
                    <td className="px-3 py-2 text-center tabular-nums font-semibold" style={{ color: a.pontuacao_final >= 4 ? C.primary : a.pontuacao_final >= 3.5 ? C.green : a.pontuacao_final ? C.amber : C.text3 }}>
                      {a.pontuacao_final ? Number(a.pontuacao_final).toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-xs">{a.pontuacao_pcs || '—'}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{a.grau_sugerido?.codigo || '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(a.updated_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setOpenAvaliacao(a)}>
                        Abrir <ChevronRight className="h-3 w-3 ml-0.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {openAvaliacao && (
        <ModalAvaliacao
          avaliacao={openAvaliacao}
          criterios={criterios}
          graus={graus}
          onClose={() => setOpenAvaliacao(null)}
          onSaved={() => { setOpenAvaliacao(null); load(); }}
          flash={showFlash}
        />
      )}
    </div>
  );
}

function ResumoCard({ label, value, color }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5" style={{ color: color || C.text }}>{value}</div>
    </div>
  );
}

function ModalAvaliacao({ avaliacao, criterios, graus, onClose, onSaved, flash }) {
  const [tab, setTab] = useState('metas');
  const [metas, setMetas] = useState(avaliacao.metas || '');
  const [salvando, setSalvando] = useState(false);

  // Notas por fonte e critério
  const [notasAuto, setNotasAuto] = useState({});
  const [notasLider, setNotasLider] = useState({});
  const [notasCalib, setNotasCalib] = useState({});

  // Pré-popula com dados existentes
  useEffect(() => {
    const auto = {}, lid = {}, cal = {};
    for (const f of avaliacao.fatores || []) {
      if (f.fonte === 'autoavaliacao') auto[f.criterio_id] = f.nivel;
      if (f.fonte === 'lider')          lid[f.criterio_id] = f.nivel;
      if (f.fonte === 'calibracao')     cal[f.criterio_id] = f.nivel;
    }
    setNotasAuto(auto); setNotasLider(lid); setNotasCalib(cal);
  }, [avaliacao]);

  const salvarMetas = async () => {
    setSalvando(true);
    try {
      await rh.avaliacoes.update(avaliacao.id, { metas, status: 'em_andamento' });
      flash('Metas salvas', 'success');
      onSaved();
    } catch (e) { flash(e.message, 'error'); }
    setSalvando(false);
  };

  const submeterFatores = async (fonte, notas) => {
    const fatores = Object.entries(notas).map(([criterio_id, nivel]) => ({ criterio_id, nivel: Number(nivel) }));
    if (fatores.length !== criterios.length) {
      flash(`Avalie os ${criterios.length} critérios (${fatores.length} preenchidos)`, 'error');
      return;
    }
    setSalvando(true);
    try {
      const r = await rh.avaliacoes.submitFatores(avaliacao.id, { fonte, fatores });
      flash(`Notas registradas · ${r.pontos_total} pontos PCS · nota geral ${r.pontuacao_5}/5`, 'success');
      onSaved();
    } catch (e) { flash(e.message, 'error'); }
    setSalvando(false);
  };

  const concluir = async () => {
    if (!confirm('Concluir esta avaliação? Após concluir o ciclo é congelado.')) return;
    setSalvando(true);
    try {
      await rh.avaliacoes.concluir(avaliacao.id);
      flash('Avaliação concluída', 'success');
      onSaved();
    } catch (e) { flash(e.message, 'error'); }
    setSalvando(false);
  };

  const calcMediaPonderada = (notas) => {
    let soma = 0, pesoTotal = 0;
    for (const c of criterios) {
      if (notas[c.id]) {
        soma += notas[c.id] * Number(c.peso);
        pesoTotal += Number(c.peso);
      }
    }
    return pesoTotal > 0 ? soma / pesoTotal : 0;
  };

  return (
    <div className="fixed inset-0 z-[1000] flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-full max-w-2xl bg-popover overflow-y-auto flex flex-col shadow-2xl">
        <div className="sticky top-0 z-10 bg-popover px-6 pt-5 pb-3 border-b border-border flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold">{avaliacao.funcionario?.nome}</h2>
            <p className="text-xs text-muted-foreground">{avaliacao.funcionario?.cargo} · Ciclo {avaliacao.ciclo_ano}</p>
            <div className="mt-1.5"><Pill status={avaliacao.status} /></div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="px-6 pt-3 flex gap-2 border-b border-border">
          {[
            { k: 'metas',    l: 'Metas',        i: Target },
            { k: 'auto',     l: 'Autoavaliação', i: ClipboardList },
            { k: 'lider',    l: 'Avaliação líder', i: UserCheck },
            { k: 'calib',    l: 'Calibração',   i: Settings2 },
            { k: 'resumo',   l: 'Resumo',       i: Sparkles },
          ].map(t => {
            const I = t.i;
            return (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={`px-3 py-2 text-xs font-medium border-b-2 ${tab === t.k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                <I className="h-3 w-3 mr-1 inline-block" />{t.l}
              </button>
            );
          })}
        </div>

        <div className="flex-1 px-6 py-4 overflow-y-auto">
          {tab === 'metas' && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Metas SMART para o ciclo</h3>
              <p className="text-xs text-muted-foreground mb-3">Defina entre Janeiro e Fevereiro. Específicas, Mensuráveis, Atingíveis, Relevantes e Temporais.</p>
              <textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[200px]"
                value={metas} onChange={e => setMetas(e.target.value)} placeholder="1. ...&#10;2. ...&#10;3. ..." />
              <Button className="mt-3" onClick={salvarMetas} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar metas'}
              </Button>
            </div>
          )}

          {(tab === 'auto' || tab === 'lider' || tab === 'calib') && (
            <AvaliacaoFatores
              fonte={tab === 'auto' ? 'autoavaliacao' : tab === 'lider' ? 'lider' : 'calibracao'}
              criterios={criterios}
              notas={tab === 'auto' ? notasAuto : tab === 'lider' ? notasLider : notasCalib}
              setNotas={tab === 'auto' ? setNotasAuto : tab === 'lider' ? setNotasLider : setNotasCalib}
              media={calcMediaPonderada(tab === 'auto' ? notasAuto : tab === 'lider' ? notasLider : notasCalib)}
              salvando={salvando}
              onSubmit={() => submeterFatores(
                tab === 'auto' ? 'autoavaliacao' : tab === 'lider' ? 'lider' : 'calibracao',
                tab === 'auto' ? notasAuto : tab === 'lider' ? notasLider : notasCalib
              )}
            />
          )}

          {tab === 'resumo' && (
            <ResumoAvaliacao avaliacao={avaliacao} criterios={criterios} graus={graus}
              notasAuto={notasAuto} notasLider={notasLider} notasCalib={notasCalib}
              concluir={concluir} salvando={salvando} />
          )}
        </div>
      </div>
    </div>
  );
}

function AvaliacaoFatores({ fonte, criterios, notas, setNotas, media, salvando, onSubmit }) {
  const labels = {
    autoavaliacao: { titulo: 'Autoavaliação', desc: 'Como você avalia seu desempenho nos 6 critérios? Marque 1-5 estrelas.' },
    lider:         { titulo: 'Avaliação do líder', desc: 'Avaliação feita pela liderança imediata.' },
    calibracao:    { titulo: 'Calibração final', desc: 'Comitê de RH revisa as notas e define a nota final.' },
  };
  const cfg = labels[fonte];
  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">{cfg.titulo}</h3>
      <p className="text-xs text-muted-foreground mb-4">{cfg.desc}</p>
      <div className="space-y-2">
        {criterios.map(c => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex-1 mr-3">
              <div className="text-sm font-semibold">{c.nome} <span className="text-xs text-muted-foreground font-normal">· peso {(Number(c.peso) * 100).toFixed(0)}%</span></div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.descricao}</div>
              {notas[c.id] && c.niveis?.find(n => n.nivel === notas[c.id]) && (
                <div className="text-xs mt-1.5 italic" style={{ color: C.primary }}>
                  → {c.niveis.find(n => n.nivel === notas[c.id]).descricao}
                </div>
              )}
            </div>
            <NotaStars value={notas[c.id] || 0} onChange={v => setNotas({ ...notas, [c.id]: v })} />
          </div>
        ))}
      </div>
      {media > 0 && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
          <div className="text-xs text-muted-foreground">Nota ponderada (0-5)</div>
          <div className="text-3xl font-bold tabular-nums" style={{ color: C.primary }}>{media.toFixed(2)}</div>
        </div>
      )}
      <Button className="mt-4 w-full" onClick={onSubmit} disabled={salvando || Object.keys(notas).length !== criterios.length}>
        {salvando ? 'Salvando...' : `Enviar ${cfg.titulo.toLowerCase()}`}
      </Button>
    </div>
  );
}

function ResumoAvaliacao({ avaliacao, criterios, graus, notasAuto, notasLider, notasCalib, concluir, salvando }) {
  const grauSug = graus.find(g => g.id === avaliacao.grau_sugerido_id);
  const grauAtual = graus.find(g => g.id === avaliacao.funcionario?.grau_id);

  const calc = (n) => {
    let soma = 0, p = 0;
    for (const c of criterios) {
      if (n[c.id]) { soma += n[c.id] * Number(c.peso); p += Number(c.peso); }
    }
    return p > 0 ? soma / p : 0;
  };
  const mAuto = calc(notasAuto), mLid = calc(notasLider), mCal = calc(notasCalib);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="text-xs text-muted-foreground">Autoavaliação</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: C.amber }}>{mAuto ? mAuto.toFixed(2) : '—'}</div>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <div className="text-xs text-muted-foreground">Líder</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: C.purple }}>{mLid ? mLid.toFixed(2) : '—'}</div>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
          <div className="text-xs text-muted-foreground">Calibração final</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: C.primary }}>{mCal ? mCal.toFixed(2) : '—'}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h4 className="text-sm font-semibold mb-3">Enquadramento sugerido</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Grau atual</div>
            <div className="font-mono font-bold text-base">{grauAtual?.codigo || '—'}</div>
            <div className="text-xs text-muted-foreground">{grauAtual?.nivel}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Sugerido (pontuação {avaliacao.pontuacao_pcs || '—'})</div>
            <div className="font-mono font-bold text-base" style={{ color: C.primary }}>{grauSug?.codigo || '—'}</div>
            <div className="text-xs text-muted-foreground">{grauSug?.nivel}</div>
          </div>
        </div>
        {grauSug && grauAtual && grauSug.ordem > grauAtual.ordem && (
          <div className="mt-3 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs p-2.5 font-medium">
            Indica promoção · acesse a aba Progressão para aplicar.
          </div>
        )}
      </div>

      {avaliacao.status !== 'concluida' && mCal > 0 && (
        <Button onClick={concluir} disabled={salvando} className="w-full">
          <CheckCircle2 className="h-4 w-4 mr-2" /> Concluir avaliação
        </Button>
      )}
    </div>
  );
}
