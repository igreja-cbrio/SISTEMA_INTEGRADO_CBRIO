import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Loader2, Maximize2, CalendarCheck, Minus, Plus, RefreshCw, ListPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { marketingLinha } from '../../api';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { useCanvasPanZoom } from './linha/useCanvasPanZoom';
import { G, FRENTES, laneY, montarLayout, orth, ramo, ddmm, mesDe } from './linha/layout';
import { BlocosFrentes, NotaPerfil, BlocoSerie } from './linha/QuadroFrentes';
import CartaoTarefa from './linha/CartaoTarefa';
import CartaoEtapa from './linha/CartaoEtapa';
import ModalTarefa from './linha/ModalTarefa';
import EditorTarefa from './linha/EditorTarefa';
import './linha/linha.css';

// Demandas do Marketing (a "linha do tempo" · Fase 3). Abre em TELA CHEIA, por
// cima do menu e do cabeçalho do sistema, sempre no tema claro; só sai pelo X.
// Portal no <body> de propósito: `position: fixed` dentro do AppShell se ancora
// em qualquer ancestral com backdrop-filter (tema Vidro) em vez da janela. Canvas infinito: semanas do ano nas
// colunas, as 4 frentes à esquerda. Os dados vêm já recortados pelo perfil de
// quem vê (GET /marketing/linha); a tela só posiciona.

function indexarTarefas(dados) {
  const m = new Map();
  if (!dados) return m;
  for (const s of dados.frentes?.ins?.series || []) {
    for (const e of s.etapas || []) for (const t of e.faixas || []) m.set(String(t.id), t);
  }
  for (const k of ['sis', 'int', 'rot']) {
    for (const t of dados.frentes?.[k]?.tarefas || []) m.set(String(t.id), t);
  }
  return m;
}

function Cabecalhos({ layout, CH }) {
  let mesAnterior = null;
  return layout.colunas.map((c) => {
    const mes = c.antes ? '' : mesDe(c.inicio);
    const mostraMes = mes && mes !== mesAnterior ? mes : '';
    if (mes) mesAnterior = mes;
    const cls = c.atrasada ? 'late' : c.atual ? 'now' : '';
    return (
      <div key={`c-${c.n}`}>
        {(c.atrasada || c.atual) && (
          <div className={`ml-abs ml-band ${c.atrasada ? 'late' : 'now'}`}
            style={{ left: c.x + 4, top: G.HY - 16, width: G.COLW - 8, height: CH - G.HY + 6 }} />
        )}
        <div className="ml-abs ml-vdiv" style={{ left: c.x, top: G.HY - 16, height: CH - G.HY + 6 }} />
        <div className={`ml-abs ml-colhead ${cls}`} style={{ left: c.x + G.SPX, top: G.HY }}>
          <i className="mo" style={{ fontStyle: 'normal' }}>{mostraMes}</i>
          <b>{c.antes ? 'Antes do ano' : `Semana ${c.n}`}</b>
          <span>{c.antes ? 'pendências antigas' : `${ddmm(c.inicio)} – ${ddmm(c.fim)}`}</span>
          {c.atual ? <em>Esta semana</em> : c.atrasada ? <em>Atrasada</em> : null}
        </div>
      </div>
    );
  });
}

function Arestas({ layout, aberta, CW, CH }) {
  if (!aberta || !layout.grupos.length) return null;
  const lc = `l-${aberta}`;
  const cols = layout.colunas;
  const xEnd = (cols.length ? cols[cols.length - 1].x + G.COLW : G.BX + G.BW + 200) - 20;
  const idxFut = cols.findIndex(c => c.futura);
  const splitX = idxFut < 0 ? xEnd : cols[idxFut].x + G.SPX;
  const multi = aberta === 'ins';
  const yLane = laneY(layout.li);
  const partes = [];
  layout.grupos.forEach((g) => {
    if (multi) partes.push(<path key={`sp-${g.gi}`} className={`${lc} spine`} d={orth(G.BX + G.BW, yLane, G.SBX, g.yc, G.BX + G.BW + 34)} />);
    const ate = Math.min(splitX, xEnd);
    if (ate > g.x0) partes.push(<path key={`h-${g.gi}`} className={`${lc} spine`} d={`M${g.x0},${g.yc} L${ate},${g.yc}`} />);
    if (splitX < xEnd) partes.push(<path key={`f-${g.gi}`} className={`${lc} spine fut`} d={`M${Math.max(splitX, g.x0)},${g.yc} L${xEnd},${g.yc}`} />);
  });
  layout.nos.forEach((n) => {
    const g = layout.grupos[n.gi];
    const sx = cols[n.ci].x + G.SPX;
    partes.push(<path key={`b-${n.key}`} className={`${lc} br ${n.fut ? 'fut' : ''}`} d={ramo(sx, g.yc, n.x, n.y + 30)} />);
  });
  layout.grupos.forEach((g) => {
    cols.forEach((c, i) => {
      const cls = c.futura ? 'fut' : c.atrasada && g.colsComNo.has(i) ? 'late' : '';
      partes.push(<circle key={`o-${g.gi}-${c.n}`} className={`${lc} ${cls}`} cx={c.x + G.SPX} cy={g.yc} r={c.atual ? 7 : 5} />);
    });
  });
  return <svg className="ml-edges" width={CW} height={CH}>{partes}</svg>;
}

export default function MarketingLinhaDoTempo() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState(null);
  const [esconder, setEsconder] = useState(false);
  const [tarefaId, setTarefaId] = useState(null);
  const [editor, setEditor] = useState(null); // { modo, pendente?, tarefa? }
  const iniciadoAno = useRef(null);
  const navigate = useNavigate();

  // Tema claro só enquanto a tela está aberta; ao sair, volta o que estava (sem
  // gravar preferência — quem decide o tema do sistema é o ThemeContext).
  useEffect(() => {
    const html = document.documentElement;
    const temaAntes = html.getAttribute('data-theme');
    const escuroAntes = html.classList.contains('dark');
    const overflowAntes = document.body.style.overflow;
    html.setAttribute('data-theme', 'light');
    html.classList.remove('dark');
    document.body.style.overflow = 'hidden';
    return () => {
      if (temaAntes) html.setAttribute('data-theme', temaAntes); else html.removeAttribute('data-theme');
      html.classList.toggle('dark', escuroAntes);
      document.body.style.overflow = overflowAntes;
    };
  }, []);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const r = await marketingLinha.get(ano);
      setDados(r);
      setErro(null);
    } catch (e) {
      // Erro nunca vira tela vazia: sem dado anterior mostra o cartão vermelho;
      // com dado anterior, avisa e mantém o que já estava na tela.
      if (silencioso) toast.error(`Não foi possível atualizar: ${e?.message || 'erro'}`);
      else { setErro(e?.message || 'Erro ao carregar'); setDados(null); }
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [ano]);

  useEffect(() => { carregar(); }, [carregar]);

  const pz = useCanvasPanZoom(!!dados);
  const layout = useMemo(() => (dados ? montarLayout(dados, aberta, esconder) : null), [dados, aberta, esconder]);
  const tarefas = useMemo(() => indexarTarefas(dados), [dados]);
  const tarefaAberta = tarefaId ? tarefas.get(String(tarefaId)) : null;

  // Enquadramento inicial: quadrados + primeiras semanas, uma vez por ano carregado.
  const { viewportRef, setView } = pz;
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!dados || !vp || iniciadoAno.current === dados.ano) return;
    iniciadoAno.current = dados.ano;
    const zoom = Math.min(0.9, vp.clientWidth / (G.BX + G.BW + 100 + 4 * G.COLW + 40), vp.clientHeight / (G.NOTE_Y + 160));
    setView({ zoom, x: 16 - 20 * zoom, y: 12 });
  }, [dados, viewportRef, setView]);

  const irParaHoje = () => {
    if (!layout) return;
    const c = layout.colunas.find(col => col.atual) || layout.colunas[0];
    if (c) pz.centerX(c.x + G.COLW / 2);
  };

  const acoes = (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Ano
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        value={ano}
        onChange={(e) => { setAberta(null); setAno(Number(e.target.value)); }}
      >
        {[anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}
      </select>
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 z-[900] flex flex-col bg-white text-foreground" role="dialog" aria-label="Demandas do Marketing">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Marketing</p>
          <h1 className="text-lg font-semibold leading-tight">Demandas</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {acoes}
          <Button size="icon" variant="ghost" onClick={() => navigate('/marketing')} aria-label="Fechar demandas" title="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3">
      {carregando && !dados && (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {!carregando && erro && !dados && (
        <Card className="p-4 border-destructive/50 bg-destructive/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="space-y-2">
              <p className="font-medium text-destructive">Não foi possível carregar a linha do tempo.</p>
              <p className="text-sm text-muted-foreground">{erro}</p>
              <Button size="sm" variant="outline" onClick={() => carregar()}><RefreshCw className="h-4 w-4 mr-1" /> Tentar de novo</Button>
            </div>
          </div>
        </Card>
      )}

      {dados && layout && (
        <div className="flex h-full flex-col gap-3">
          {(dados.avisos || []).length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300 space-y-1">
              {dados.avisos.map((a, i) => (
                <p key={i} className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{a}</p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => pz.fit(layout.CW, layout.CH)}><Maximize2 className="h-4 w-4 mr-1" /> Ajustar</Button>
            <Button size="sm" variant="outline" onClick={irParaHoje}><CalendarCheck className="h-4 w-4 mr-1" /> Ir para hoje</Button>
            {dados.perfil?.lider && (
              <Button size="sm" onClick={() => setEditor({ modo: 'nova' })}><ListPlus className="h-4 w-4 mr-1" /> Nova tarefa</Button>
            )}
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => pz.zoomStep(1 / 1.2)} aria-label="Diminuir zoom"><Minus className="h-4 w-4" /></Button>
              <span ref={pz.labelRef} className="w-12 text-center text-xs tabular-nums text-muted-foreground">100%</span>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => pz.zoomStep(1.2)} aria-label="Aumentar zoom"><Plus className="h-4 w-4" /></Button>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground ml-1">
              <input type="checkbox" className="h-4 w-4 accent-[#00B39D]" checked={esconder} onChange={(e) => setEsconder(e.target.checked)} />
              Esconder semanas concluídas
            </label>
            {dados.sem_data > 0 && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-700 dark:text-amber-300"
                title="Tarefas sem prazo definido não têm semana na linha do tempo">
                {dados.sem_data} sem data
              </span>
            )}
            <div className="ml-legend mkt-linha ml-auto hidden md:flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><i className="lg-red" />Em aberto até hoje</span>
              <span className="flex items-center gap-1"><i className="lg-green" />Em dia</span>
              <span className="flex items-center gap-1"><i className="lg-gray" />Indisponível</span>
              <span className="flex items-center gap-1"><i className="lg-late" />Semana atrasada</span>
              <span className="flex items-center gap-1"><i className="lg-now" />Esta semana</span>
              <span className="flex items-center gap-1"><i className="lg-fut" />Previsto</span>
            </div>
          </div>

          <div className="mkt-linha flex-1 min-h-0 rounded-xl border border-border overflow-hidden">
            <div ref={pz.viewportRef} className="ml-viewport" style={{ height: '100%', minHeight: 420 }}>
              <div ref={pz.canvasRef} className="ml-canvas" style={{ width: layout.CW, height: layout.CH }}>
                <Arestas layout={layout} aberta={aberta} CW={layout.CW} CH={layout.CH} />
                <div className="ml-abs ml-yr" style={{ left: G.BX, top: 34 }}>
                  <b>{dados.ano}</b>
                  <span>Marketing · demandas</span>
                </div>
                <Cabecalhos layout={layout} CH={layout.CH} />
                <BlocosFrentes dados={dados} aberta={aberta} onToggle={setAberta} />
                <NotaPerfil dados={dados} />
                {aberta === 'ins' && layout.grupos.map(g => g.serie && (
                  <BlocoSerie key={`s-${g.gi}`} grupo={g} semanaAtual={layout.semanaAtual} />
                ))}
                {aberta === 'ins' && layout.vazioIns && (
                  <div className="ml-abs ml-note" style={{ left: G.SBX, top: laneY(0) - 30, width: G.SBW }}>
                    Nenhuma série neste ano.
                  </div>
                )}
                {aberta && !layout.vazioIns && layout.nos.length === 0 && (
                  <div className="ml-abs ml-note" style={{ left: layout.X0 + G.NX, top: laneY(layout.li) - 30, width: 260 }}>
                    Nenhuma pendência nem previsão nas semanas mostradas para {FRENTES[layout.li]?.nome}.
                  </div>
                )}
                {layout.nos.map(no => (no.tipo === 'etapa'
                  ? <CartaoEtapa key={no.key} no={no} semanaAtual={layout.semanaAtual} membros={dados.membros} onAbrir={(t) => setTarefaId(t.id)} />
                  : <CartaoTarefa key={no.key} no={no} membros={dados.membros} onAbrir={(t) => (t.frente === 'pen' ? setEditor({ modo: 'alocar', pendente: t }) : setTarefaId(t.id))} />
                ))}
              </div>
              <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-full border border-border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground md:block">
                Arraste para mover · role para aproximar · clique num quadrado para abrir a frente
              </div>
            </div>
          </div>
        </div>
      )}

      {tarefaAberta && dados && (
        <ModalTarefa
          tarefa={tarefaAberta}
          dados={dados}
          onClose={() => setTarefaId(null)}
          onChanged={() => carregar(true)}
          onEditar={dados.perfil?.lider ? () => { setEditor({ modo: 'editar', tarefa: tarefaAberta }); setTarefaId(null); } : undefined}
        />
      )}

      {editor && dados && (
        <EditorTarefa
          {...editor}
          dados={dados}
          onClose={() => setEditor(null)}
          onSalvo={async () => {
            toast.success(editor.modo === 'alocar' ? 'Pedido alocado' : editor.modo === 'nova' ? 'Tarefa criada' : 'Tarefa atualizada');
            setEditor(null);
            await carregar(true);
          }}
        />
      )}
      </div>
    </div>,
    document.body,
  );
}
