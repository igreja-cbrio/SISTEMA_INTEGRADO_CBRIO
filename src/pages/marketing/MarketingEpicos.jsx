// ============================================================================
// DORMANTE desde 17/08/2026 — nenhuma tela monta este componente
// ============================================================================
// Pedido do Marcos: *"pode tirar aquela faixa escrito quadro/épico de kanban,
// deixe apenas essa visualização, não precisa mais ter essa visualização"*.
// A faixa de alternância saiu do `MarketingKanban.jsx` e com ela o único
// caminho até aqui — o arquivo FICA porque a visão por campanha/evento pode
// voltar, e porque ele é o motivo pelo qual `GET /marketing/cards` (que o
// Kanban deixou de usar em favor de `GET /marketing/kanban`) segue existindo:
// apagar a tela faria a próxima sessão concluir que a rota está órfã.
//
// Pra reativar: montar de novo em MarketingKanban (ou em rota própria) — o
// componente não depende de nada que tenha sido removido.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { marketing as api } from '../../api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  GitBranch, Megaphone, Loader2, ChevronDown, ChevronRight, ExternalLink,
  Users, Tag, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

// Visão de ÉPICOS (consolidação F-C) · um épico = uma campanha (dor) ou um evento,
// agrupando suas subdemandas (cards reais) por fase, com progresso. Absorve a antiga
// aba Ciclo Criativo (eventos→fases→tarefas + batch + link Eventos) e estende a campanhas.
const NONE = '__none__';
const ehConcluido = (e) => e === 'concluido';

function ProgressBar({ feitos, total }) {
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="h-1.5 w-20 sm:w-28 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${pct === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">{feitos}/{total} · {pct}%</span>
    </div>
  );
}

export default function MarketingEpicos({ isCoord }) {
  const [eventos, setEventos] = useState([]);
  const [campanhas, setCampanhas] = useState([]);
  const [cards, setCards] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [membros, setMembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exp, setExp] = useState({});

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [g, camp, c, e, m] = await Promise.all([
        api.ciclo.list().catch(() => []),
        api.campanhas.list().catch(() => []),
        api.cards().catch(() => []),
        api.etiquetas(),
        api.membros(),
      ]);
      const ev = {};
      for (const grp of (g || [])) {
        const eid = grp.event_id || 'sem';
        if (!ev[eid]) ev[eid] = { event_id: grp.event_id, event_name: grp.event_name, fases: [] };
        ev[eid].fases.push(grp);
      }
      setEventos(Object.values(ev));
      setCampanhas((camp || []).filter(k => k.status !== 'triagem'));
      setCards(Array.isArray(c) ? c : []);
      setTipos(e.tipos || []);
      setMembros(m || []);
    } catch (err) { toast.error(err.message || 'Erro ao carregar épicos'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const cardsPorCampanha = useMemo(() => {
    const m = {};
    cards.forEach(c => { if (c.campanha_id) { if (!m[c.campanha_id]) m[c.campanha_id] = []; m[c.campanha_id].push(c); } });
    return m;
  }, [cards]);

  async function salvarCard(cardId, payload) {
    try { await api.atualizarCard(cardId, payload); carregar(); }
    catch (e) { toast.error(e.message || 'Erro ao salvar'); }
  }
  async function aplicarBatch(cardIds, payload) {
    try { await api.ciclo.batch(cardIds, payload); toast.success(`${cardIds.length} card(s) atualizados`); carregar(); }
    catch (e) { toast.error(e.message || 'Erro no batch'); }
  }

  if (loading) return <div className="flex justify-center my-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (eventos.length === 0 && campanhas.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Sem épicos ainda. Campanhas triadas e eventos com tarefas de marketing aparecem aqui, cada um com suas subdemandas e progresso.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {campanhas.map(camp => {
        const cs = cardsPorCampanha[camp.id] || [];
        const feitos = cs.filter(c => ehConcluido(c.estado)).length;
        const key = `camp-${camp.id}`;
        const aberto = exp[key];
        return (
          <Card key={key} className="overflow-hidden border-l-4 border-l-pink-500">
            <button onClick={() => setExp(s => ({ ...s, [key]: !aberto }))} className="w-full p-3 flex items-center gap-2 hover:bg-accent/40 transition-colors text-left">
              {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <Megaphone className="h-4 w-4 text-pink-500 shrink-0" />
              <span className="font-semibold flex-1 truncate">{camp.titulo}</span>
              {camp.eh_urgente && <Badge className="text-[10px] bg-rose-500/15 text-rose-700 dark:text-rose-400">Urgente</Badge>}
              <ProgressBar feitos={feitos} total={cs.length} />
            </button>
            {aberto && (
              <div className="border-t border-border divide-y divide-border">
                {cs.length === 0 && <p className="p-3 text-xs text-muted-foreground">Sem entregáveis ainda.</p>}
                {cs.map(c => <LinhaCard key={c.id} card={c} tipos={tipos} membros={membros} isCoord={isCoord} onSalvar={salvarCard} />)}
              </div>
            )}
          </Card>
        );
      })}

      {eventos.map(ev => {
        const tarefas = ev.fases.flatMap(f => f.tarefas);
        const feitos = tarefas.filter(t => ehConcluido(t.estado)).length;
        const key = `ev-${ev.event_id || 'sem'}`;
        const aberto = exp[key];
        return (
          <Card key={key} className="overflow-hidden border-l-4 border-l-purple-500">
            <button onClick={() => setExp(s => ({ ...s, [key]: !aberto }))} className="w-full p-3 flex items-center gap-2 hover:bg-accent/40 transition-colors text-left">
              {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <GitBranch className="h-4 w-4 text-purple-500 shrink-0" />
              <span className="font-semibold flex-1 truncate">{ev.event_name || '(sem evento)'}</span>
              <ProgressBar feitos={feitos} total={tarefas.length} />
              {ev.event_id && (
                <a href={`/eventos/${ev.event_id}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0">
                  Abrir <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </button>
            {aberto && (
              <div className="border-t border-border">
                {ev.fases.map(f => (
                  <FaseGrupo key={f.fase} fase={f} tipos={tipos} membros={membros} isCoord={isCoord} onSalvar={salvarCard} onBatch={aplicarBatch} />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// Fase de um evento · batch (etiqueta/dono) + linhas
function FaseGrupo({ fase, tipos, membros, isCoord, onSalvar, onBatch }) {
  const [batchTipo, setBatchTipo] = useState('');
  const [batchMembro, setBatchMembro] = useState('');
  const ativas = fase.tarefas.filter(t => !ehConcluido(t.estado));

  function batchTipoFn() {
    if (!batchTipo) return;
    if (!confirm(`Aplicar "${tipos.find(t => t.id === batchTipo)?.nome}" a ${ativas.length} tarefa(s)?`)) return;
    onBatch(ativas.map(t => t.id), { etiqueta_tipo_id: batchTipo }); setBatchTipo('');
  }
  function batchMembroFn() {
    if (!batchMembro) return;
    if (!confirm(`Atribuir "${membros.find(m => m.id === batchMembro)?.profile?.name}" a ${ativas.length} tarefa(s)?`)) return;
    onBatch(ativas.map(t => t.id), { atribuido_a: batchMembro }); setBatchMembro('');
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="p-2.5 bg-purple-500/5 flex flex-wrap items-center gap-2">
        <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400">{fase.fase || '(sem fase)'}</Badge>
        <span className="text-xs text-muted-foreground">{fase.tarefas.length} tarefa(s)</span>
        {isCoord && ativas.length > 0 && (
          <div className="ml-auto flex items-center gap-1 flex-wrap">
            <Select value={batchTipo} onValueChange={setBatchTipo}>
              <SelectTrigger className="w-[130px] h-7 text-xs"><SelectValue placeholder="Etiqueta..." /></SelectTrigger>
              <SelectContent>{tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={batchTipoFn} disabled={!batchTipo} className="h-7 text-xs"><Tag className="h-3 w-3 mr-1" />Aplicar</Button>
            <Select value={batchMembro} onValueChange={setBatchMembro}>
              <SelectTrigger className="w-[140px] h-7 text-xs"><SelectValue placeholder="Dono..." /></SelectTrigger>
              <SelectContent>{membros.map(m => <SelectItem key={m.id} value={m.id}>{m.profile?.name || '—'}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={batchMembroFn} disabled={!batchMembro} className="h-7 text-xs"><Users className="h-3 w-3 mr-1" />Atribuir</Button>
          </div>
        )}
      </div>
      <div className="divide-y divide-border">
        {fase.tarefas.map(t => <LinhaCard key={t.id} card={t} tipos={tipos} membros={membros} isCoord={isCoord} onSalvar={onSalvar} />)}
      </div>
    </div>
  );
}

// Subdemanda (card real) · select inline de etiqueta + dono + link Eventos
function LinhaCard({ card, tipos, membros, isCoord, onSalvar }) {
  const concluido = ehConcluido(card.estado);
  const link = card.cycle_phase_task?.link;
  return (
    <div className={`p-2.5 flex flex-wrap items-center gap-2 ${concluido ? 'opacity-60' : ''}`}>
      <div className="flex-1 min-w-[180px]">
        <p className="text-sm font-medium truncate flex items-center gap-1.5">
          {concluido && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
          {card.titulo}
        </p>
      </div>
      <Select value={card.etiqueta_tipo_id || NONE} onValueChange={v => onSalvar(card.id, { etiqueta_tipo_id: v === NONE ? null : v })} disabled={!isCoord || concluido}>
        <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Etiqueta..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>(sem etiqueta)</SelectItem>
          {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}{t.esforco_max_h ? ` · ${t.esforco_max_h}h` : ''}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={card.atribuido_a || NONE} onValueChange={v => onSalvar(card.id, { atribuido_a: v === NONE ? null : v })} disabled={!isCoord || concluido}>
        <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Dono..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>(sem dono)</SelectItem>
          {membros.map(m => <SelectItem key={m.id} value={m.id}>{m.profile?.name || '—'}</SelectItem>)}
        </SelectContent>
      </Select>
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center"><ExternalLink className="h-3 w-3" /></a>
      )}
    </div>
  );
}
