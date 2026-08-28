import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { marketing as api } from '../../api';
import MarketingPagina from './MarketingPagina';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import {
  ChevronLeft, ChevronRight, Loader2, Users, AlertCircle, GripHorizontal
} from 'lucide-react';
import { toast } from 'sonner';

// Planner de capacidade (Fase 4b) · Gantt mensal de DIAS ÚTEIS (seg-sex).
// Raias por pessoa · barras continuas (data_inicio -> data_fim) · arrastaveis.
const COL_W = 44;    // largura px por dia útil
const LANE_H = 26;   // altura px por faixa (lane de empilhamento)
const NOME_W = 156;  // largura da coluna de nomes
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; // getDay 0..6

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ehFds = (d) => { const g = d.getDay(); return g === 0 || g === 6; };
const parseYmd = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00');

function diasUteisDoMes(ano, mes) {
  const out = [];
  const d = new Date(ano, mes, 1);
  while (d.getMonth() === mes) {
    if (!ehFds(d)) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// dias úteis inclusive entre 2 Date
function contaDiasUteis(ini, fim) {
  if (fim < ini) return 1;
  let n = 0; const d = new Date(ini);
  while (d <= fim) { if (!ehFds(d)) n++; d.setDate(d.getDate() + 1); }
  return Math.max(1, n);
}

// Date do n-esimo dia útil a partir de ini (inclusive · pula fds)
function addDiasUteis(ini, nUteis) {
  let restante = Math.max(1, nUteis);
  const d = new Date(ini);
  while (ehFds(d)) d.setDate(d.getDate() + 1);
  while (restante > 1) { d.setDate(d.getDate() + 1); if (!ehFds(d)) restante--; }
  return d;
}

export default function MarketingPlanner() {
  const navigate = useNavigate();
  const { isAdmin, modulePerms } = useAuth();
  const lvl = useMemo(() => {
    const m = modulePerms?.marketing || modulePerms?.Marketing;
    return Math.max(m?.leitura || 0, m?.escrita || 0);
  }, [modulePerms]);
  const podeEditar = isAdmin || lvl >= 5;

  const [ref, setRef] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [membros, setMembros] = useState([]);
  const [cards, setCards] = useState([]);
  const [semPlano, setSemPlano] = useState([]);
  const [semRaia, setSemRaia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState('');
  const dragRef = useRef(null); // { cardId, durUteis }

  const dias = useMemo(() => diasUteisDoMes(ref.getFullYear(), ref.getMonth()), [ref]);
  const hojeStr = ymd(new Date());

  const carregar = useCallback(async () => {
    if (!dias.length) return;
    setLoading(true);
    try {
      const r = await api.planner(ymd(dias[0]), ymd(dias[dias.length - 1]));
      setMembros(r?.membros || []);
      setCards(r?.cards || []);
      // ⚠️ Atribuído que NÃO ocupa dia nenhum é DECLARADO, não some: era
      // exatamente isso que acontecia com 83 de 83 cards ("coloquei a tarefa
      // pra alguém e não ocupou o trabalho da pessoa").
      setSemPlano(r?.sem_plano || []);
      setSemRaia(r?.sem_raia || []);
    } catch (e) { toast.error(e.message || 'Erro ao carregar planner'); }
    finally { setLoading(false); }
  }, [dias]);
  useEffect(() => { carregar(); }, [carregar]);

  const membrosVis = useMemo(() => (filtro ? membros.filter(m => m.id === filtro) : membros), [membros, filtro]);
  const cardsPorMembro = useMemo(() => {
    const m = {};
    cards.forEach(c => { if (!m[c.atribuido_a]) m[c.atribuido_a] = []; m[c.atribuido_a].push(c); });
    return m;
  }, [cards]);

  async function moverCard(cardId, novoMembroId, colIdx) {
    if (!podeEditar) return;
    const card = cards.find(c => c.id === cardId);
    if (!card || !dias[colIdx]) return;
    // ⚠️ Barra do CICLO CRIATIVO não se arrasta: o intervalo dela é a data
    // prevista da FASE (vem do /eventos), não um plano desenhado aqui. Arrastar
    // gravaria data própria no card e ele passaria a discordar da própria fase.
    if (card.plano === 'fase') {
      toast.info('Esta é uma tarefa do ciclo criativo · o período vem da fase, no módulo Eventos.');
      return;
    }
    const novoIni = dias[colIdx];
    const dur = contaDiasUteis(parseYmd(card.data_inicio), parseYmd(card.data_fim));
    const novoFim = addDiasUteis(novoIni, dur);
    const iniStr = ymd(novoIni), fimStr = ymd(novoFim);
    if (iniStr === card.data_inicio && novoMembroId === card.atribuido_a) return; // nada mudou
    setSalvando(true);
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, data_inicio: iniStr, data_fim: fimStr, atribuido_a: novoMembroId } : c));
    try {
      await api.atualizarCard(cardId, { data_inicio: iniStr, data_fim: fimStr, atribuido_a: novoMembroId });
    } catch (e) { toast.error(e.message || 'Falhou ao mover'); carregar(); }
    finally { setSalvando(false); }
  }

  const navega = (n) => setRef(r => new Date(r.getFullYear(), r.getMonth() + n, 1));
  const irHoje = () => { const n = new Date(); setRef(new Date(n.getFullYear(), n.getMonth(), 1)); };

  return (
    <MarketingPagina subtitulo={`Planner de capacidade · ${podeEditar ? 'arraste os entregáveis' : 'somente leitura'}${salvando ? ' · salvando…' : ''}`}>
      {/* Navegação de mês + filtro de equipe. ⚠️ Isto NÃO é cabeçalho: ficou
          dentro do conteúdo de propósito — só o título e o menu do módulo vivem
          no MarketingPagina. */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/30 rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navega(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium min-w-[130px] text-center capitalize">{MESES[ref.getMonth()]} {ref.getFullYear()}</span>
          <Button variant="outline" size="sm" onClick={() => navega(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={irHoje}>Hoje</Button>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="text-sm bg-card border border-border rounded px-2 py-1.5">
            <option value="">Toda a equipe</option>
            {membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : membrosVis.length === 0 ? (
        <Card className="p-8 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sem membros ativos na equipe de marketing</p>
        </Card>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <div style={{ minWidth: NOME_W + dias.length * COL_W }}>
            {/* Cabecalho dos dias */}
            <div className="flex border-b border-border bg-muted/40">
              <div className="shrink-0 p-2 text-xs font-medium text-muted-foreground" style={{ width: NOME_W }}>Equipe</div>
              {dias.map((d, i) => {
                const isHoje = ymd(d) === hojeStr;
                return (
                  <div key={i} className={`shrink-0 text-center py-1 border-l border-border ${isHoje ? 'bg-primary/10' : ''}`} style={{ width: COL_W }}>
                    <div className="text-[10px] text-muted-foreground">{DOW[d.getDay()]}</div>
                    <div className={`text-xs ${isHoje ? 'font-bold text-primary' : ''}`}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
            {/* Raias */}
            {membrosVis.map(m => (
              <RaiaMembro
                key={m.id}
                membro={m}
                cards={cardsPorMembro[m.id] || []}
                dias={dias}
                hojeStr={hojeStr}
                podeEditar={podeEditar}
                onDragStartCard={(cardId, durUteis) => { dragRef.current = { cardId, durUteis }; }}
                onDropCol={(colIdx) => { const di = dragRef.current; dragRef.current = null; if (di) moverCard(di.cardId, m.id, colIdx); }}
                onClickCard={() => navigate('/marketing')}
              />
            ))}
          </div>
        </div>
      )}

      {/* ⚠️ Atribuído sem período não ocupa dia nenhum — e some do Planner. Isso
          precisa ser DITO: era a reclamação de origem ("coloquei a tarefa pra
          alguém e não ocupou o trabalho da pessoa"). */}
      {semPlano.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {semPlano.length} tarefa{semPlano.length > 1 ? 's' : ''} com dono mas SEM período — não ocupa a agenda de ninguém
          </p>
          <p className="text-muted-foreground mt-1">
            Elas não aparecem nas raias abaixo. Defina quando começa e quantos dias ocupa
            (na triagem, ao criar o entregável) pra que entrem no planejamento.
          </p>
          <ul className="mt-2 space-y-0.5 text-muted-foreground">
            {semPlano.slice(0, 6).map(t => <li key={t.id} className="truncate">· {t.titulo}</li>)}
            {semPlano.length > 6 && <li>· e outras {semPlano.length - 6}</li>}
          </ul>
        </div>
      )}

      {/* ⚠️ Tarefa com período mas cujo dono NÃO tem raia (o coordenador fica
          fora delas por decisão: ele distribui, não executa). Medido em 17/08: as
          10 tarefas do ciclo de agosto estavam TODAS no coordenador — sem este
          aviso, o Planner pareceria vazio e ninguém saberia por quê. */}
      {semRaia.length > 0 && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs">
          <p className="font-medium text-sky-800 dark:text-sky-300">
            {semRaia.length} tarefa{semRaia.length > 1 ? 's' : ''} ainda no coordenador — sem raia, não ocupa a agenda de ninguém
          </p>
          <p className="text-muted-foreground mt-1">
            Parte delas é de coordenação mesmo (reunião, alinhamento) e pode ficar assim.
            As que forem de execução: distribua no calendário do dashboard (clique na
            fase) se forem do ciclo criativo, ou no card do Kanban.
          </p>
          <ul className="mt-2 space-y-0.5 text-muted-foreground">
            {semRaia.slice(0, 6).map(t => <li key={t.id} className="truncate">· {t.titulo}</li>)}
            {semRaia.length > 6 && <li>· e outras {semRaia.length - 6}</li>}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <GripHorizontal className="h-3.5 w-3.5 shrink-0" />
        Arraste uma barra pra outro dia ou outra pessoa (mantém a duração em dias úteis). Dias em excesso ({'>'} slots) ficam em vermelho · 🎯 = foco (sem paralela) · barra tracejada = tarefa do ciclo criativo (período vem da fase, não se arrasta). Fim de semana não aparece.
      </p>
    </MarketingPagina>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Raia de uma pessoa · barras continuas empilhadas em lanes + drop por dia
// ═══════════════════════════════════════════════════════════════════════
function RaiaMembro({ membro, cards, dias, hojeStr, podeEditar, onDragStartCard, onDropCol, onClickCard }) {
  const N = dias.length;

  const { items, lanes } = useMemo(() => {
    const arr = cards.map(c => {
      const ini = parseYmd(c.data_inicio), fim = parseYmd(c.data_fim);
      let s = -1, e = -1;
      dias.forEach((d, i) => { if (d >= ini && d <= fim) { if (s === -1) s = i; e = i; } });
      if (s === -1) return null;
      return { ...c, s, e, durUteis: contaDiasUteis(ini, fim) };
    }).filter(Boolean);
    arr.sort((a, b) => a.s - b.s || a.e - b.e);
    const laneEnd = []; // último endIdx ocupado por lane
    arr.forEach(it => {
      let lane = laneEnd.findIndex(end => end < it.s);
      if (lane === -1) { lane = laneEnd.length; laneEnd.push(it.e); } else laneEnd[lane] = it.e;
      it.lane = lane;
    });
    return { items: arr, lanes: Math.max(1, laneEnd.length) };
  }, [cards, dias]);

  // ocupacao por dia (paralela=1 · foco enche) -> sobrecarga
  const sobre = useMemo(() => {
    const occ = new Array(N).fill(0);
    items.forEach(it => { for (let i = it.s; i <= it.e; i++) occ[i] += it.pode_paralelo ? 1 : membro.slots_dia; });
    return occ.map(o => o > membro.slots_dia);
  }, [items, N, membro.slots_dia]);

  const areaH = lanes * LANE_H + 8;

  const handleDrop = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.max(0, Math.min(N - 1, Math.floor((e.clientX - rect.left) / COL_W)));
    onDropCol(col);
  };

  return (
    <div className="flex border-b border-border">
      <div className="shrink-0 p-2 border-r border-border" style={{ width: NOME_W }}>
        <p className="text-sm font-medium truncate">{membro.nome}</p>
        <p className="text-[10px] text-muted-foreground truncate">{membro.habilidade || '—'} · {membro.slots_dia}/dia</p>
        <p className="text-[10px] text-muted-foreground">{cards.length} entregável{cards.length === 1 ? '' : 'is'}</p>
      </div>
      <div
        className="relative bg-card"
        style={{ width: N * COL_W, height: areaH }}
        onDragOver={podeEditar ? (e) => e.preventDefault() : undefined}
        onDrop={podeEditar ? handleDrop : undefined}
      >
        {/* Fundo · colunas (sobrecarga / hoje) */}
        {dias.map((d, i) => (
          <div
            key={i}
            className={`absolute top-0 bottom-0 border-l border-border/60 ${sobre[i] ? 'bg-rose-500/10' : ymd(d) === hojeStr ? 'bg-primary/[0.04]' : ''}`}
            style={{ left: i * COL_W, width: COL_W }}
          />
        ))}
        {/* Barras */}
        {items.map(it => {
          const cor = it.cor || '#6366f1';
          // Tarefa do ciclo criativo: o período é a data prevista da FASE, então
          // ela OCUPA a agenda (senão o Planner mentiria sobre a capacidade) mas
          // não se arrasta — quem manda no prazo é o ciclo, no /eventos.
          const doCiclo = it.plano === 'fase';
          const arrastavel = podeEditar && !doCiclo;
          return (
            <div
              key={it.id}
              draggable={arrastavel}
              onDragStart={arrastavel ? () => onDragStartCard(it.id, it.durUteis) : undefined}
              onClick={() => onClickCard(it)}
              title={`${it.titulo} · ${it.durUteis} dia(s) úteis${it.pode_paralelo ? '' : ' · foco'}${doCiclo ? ' · ciclo criativo (período da fase)' : ''}`}
              className={`absolute rounded px-1.5 flex items-center text-[10px] font-medium truncate ${doCiclo ? 'border-2 border-dashed' : 'border'} ${arrastavel ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
              style={{
                left: it.s * COL_W + 2,
                width: (it.e - it.s + 1) * COL_W - 4,
                top: it.lane * LANE_H + 4,
                height: LANE_H - 4,
                backgroundColor: `${cor}22`,
                borderColor: `${cor}66`,
                color: cor,
              }}
            >
              {!it.pode_paralelo && '🎯 '}{it.titulo}
            </div>
          );
        })}
      </div>
    </div>
  );
}
