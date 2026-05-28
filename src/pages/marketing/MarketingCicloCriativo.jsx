import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { marketing as api } from '../../api';
import MarketingNav from './MarketingNav';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  GitBranch, Loader2, ChevronDown, ChevronRight, ExternalLink,
  Users, Tag, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

const NONE = '__none__';

export default function MarketingCicloCriativo() {
  const { isAdmin, modulePerms } = useAuth();
  const isCoord = isAdmin || (modulePerms?.marketing?.escrita || 0) >= 5;

  const [grupos, setGrupos]       = useState([]);
  const [tipos, setTipos]         = useState([]);
  const [membros, setMembros]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [expandidos, setExpandidos] = useState({});

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [g, e, m] = await Promise.all([api.ciclo.list(), api.etiquetas(), api.membros()]);
      setGrupos(Array.isArray(g) ? g : []);
      setTipos(e.tipos || []);
      setMembros(m || []);
    } catch (err) {
      toast.error(err.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Agrupa por evento (nivel 1) · fases dentro (nivel 2)
  const eventos = useMemo(() => {
    const ev = {};
    for (const g of grupos) {
      const eid = g.event_id || 'sem_evento';
      if (!ev[eid]) ev[eid] = { event_id: g.event_id, event_name: g.event_name, fases: [] };
      ev[eid].fases.push(g);
    }
    return Object.values(ev);
  }, [grupos]);

  async function salvarCard(cardId, payload) {
    try {
      await api.atualizarCard(cardId, payload);
      // Atualiza local sem recarregar tudo
      setGrupos(prev => prev.map(g => ({
        ...g,
        tarefas: g.tarefas.map(t => t.id === cardId ? { ...t, ...payload } : t),
      })));
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
      carregar();
    }
  }

  async function aplicarBatch(cardIds, payload) {
    try {
      await api.ciclo.batch(cardIds, payload);
      toast.success(`${cardIds.length} card(s) atualizados`);
      carregar();
    } catch (e) {
      toast.error(e.message || 'Erro ao aplicar em batch');
    }
  }

  if (!isCoord) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center max-w-md mx-auto">
          <p className="text-muted-foreground">Acesso restrito · só coordenador.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" />
            Marketing · Ciclo Criativo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Planejamento de etiqueta + dono por fase · cards vão pro calendário da pessoa
          </p>
        </div>
        <MarketingNav />
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : eventos.length === 0 ? (
        <Card className="p-8 text-center">
          <GitBranch className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Sem tarefas de ciclo criativo no Marketing.
            <br />
            Crie via módulo Eventos com área = "marketing".
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            {eventos.length} evento(s) · {grupos.reduce((sum, g) => sum + g.tarefas.length, 0)} tarefa(s)
            <Button variant="outline" size="sm" onClick={carregar} className="gap-1 ml-auto">
              <RefreshCw className="h-3 w-3" /> Atualizar
            </Button>
          </div>

          {eventos.map(ev => {
            const evKey = ev.event_id || 'sem';
            const expandido = expandidos[evKey] !== false; // default expandido
            return (
              <Card key={evKey} className="overflow-hidden">
                <button
                  onClick={() => setExpandidos(s => ({ ...s, [evKey]: !expandido }))}
                  className="w-full p-3 flex items-center gap-2 hover:bg-accent/40 transition-colors text-left"
                >
                  {expandido ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-semibold flex-1 truncate">{ev.event_name || '(sem evento)'}</span>
                  <Badge variant="secondary">{ev.fases.reduce((s, f) => s + f.tarefas.length, 0)} tarefas</Badge>
                  {ev.event_id && (
                    <a
                      href={`/eventos/${ev.event_id}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Abrir <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </button>

                {expandido && (
                  <div className="border-t border-border">
                    {ev.fases.map(f => (
                      <FaseGrupo
                        key={`${evKey}-${f.fase}`}
                        fase={f}
                        tipos={tipos}
                        membros={membros}
                        onSalvar={salvarCard}
                        onBatch={aplicarBatch}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Grupo da fase · com tarefas + batch
// ═══════════════════════════════════════════════════════════════════════
function FaseGrupo({ fase, tipos, membros, onSalvar, onBatch }) {
  const [batchTipo, setBatchTipo] = useState('');
  const [batchMembro, setBatchMembro] = useState('');

  const tarefasAtivas = fase.tarefas.filter(t => t.estado !== 'concluido');

  function aplicarBatchTipo() {
    if (!batchTipo) { toast.error('Selecione um tipo'); return; }
    if (!confirm(`Aplicar etiqueta "${tipos.find(t => t.id === batchTipo)?.nome}" pra ${tarefasAtivas.length} tarefa(s)?`)) return;
    onBatch(tarefasAtivas.map(t => t.id), { etiqueta_tipo_id: batchTipo });
    setBatchTipo('');
  }

  function aplicarBatchMembro() {
    if (!batchMembro) { toast.error('Selecione um membro'); return; }
    if (!confirm(`Atribuir "${membros.find(m => m.id === batchMembro)?.profile?.name}" pra ${tarefasAtivas.length} tarefa(s)?`)) return;
    onBatch(tarefasAtivas.map(t => t.id), { atribuido_a: batchMembro });
    setBatchMembro('');
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="p-3 bg-purple-500/5 flex flex-wrap items-center gap-2">
        <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400">{fase.fase || '(sem fase)'}</Badge>
        <span className="text-xs text-muted-foreground">{fase.tarefas.length} tarefa(s)</span>

        {tarefasAtivas.length > 0 && (
          <div className="ml-auto flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground">Batch:</span>
            <Select value={batchTipo} onValueChange={setBatchTipo}>
              <SelectTrigger className="w-[140px] h-7 text-xs"><SelectValue placeholder="Etiqueta..." /></SelectTrigger>
              <SelectContent>
                {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={aplicarBatchTipo} disabled={!batchTipo} className="h-7 text-xs">
              <Tag className="h-3 w-3 mr-1" /> Aplicar
            </Button>

            <Select value={batchMembro} onValueChange={setBatchMembro}>
              <SelectTrigger className="w-[150px] h-7 text-xs"><SelectValue placeholder="Membro..." /></SelectTrigger>
              <SelectContent>
                {membros.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.profile?.name || '(sem nome)'} · {m.habilidade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={aplicarBatchMembro} disabled={!batchMembro} className="h-7 text-xs">
              <Users className="h-3 w-3 mr-1" /> Atribuir
            </Button>
          </div>
        )}
      </div>

      <div className="divide-y divide-border">
        {fase.tarefas.map(t => (
          <TarefaLinha key={t.id} tarefa={t} tipos={tipos} membros={membros} onSalvar={onSalvar} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Linha da tarefa · select inline tipo + membro
// ═══════════════════════════════════════════════════════════════════════
function TarefaLinha({ tarefa, tipos, membros, onSalvar }) {
  const tipo = tipos.find(t => t.id === tarefa.etiqueta_tipo_id);
  const membro = membros.find(m => m.id === tarefa.atribuido_a);
  const concluido = tarefa.estado === 'concluido';

  function onMudarTipo(v) {
    const newId = v === NONE ? null : v;
    onSalvar(tarefa.id, { etiqueta_tipo_id: newId });
  }
  function onMudarMembro(v) {
    const newId = v === NONE ? null : v;
    onSalvar(tarefa.id, { atribuido_a: newId });
  }

  return (
    <div className={`p-3 flex flex-wrap items-center gap-3 ${concluido ? 'opacity-60' : ''}`}>
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-medium truncate flex items-center gap-1.5">
          {concluido && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
          {tarefa.titulo}
        </p>
        {tarefa.descricao && (
          <p className="text-xs text-muted-foreground line-clamp-1">{tarefa.descricao}</p>
        )}
      </div>

      <Select value={tarefa.etiqueta_tipo_id || NONE} onValueChange={onMudarTipo} disabled={concluido}>
        <SelectTrigger className="w-[180px] h-8 text-xs">
          <SelectValue placeholder="Etiqueta..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>(sem etiqueta)</SelectItem>
          {tipos.map(t => (
            <SelectItem key={t.id} value={t.id}>
              {t.nome} {t.esforco_max_h ? `· ${t.esforco_max_h}h` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={tarefa.atribuido_a || NONE} onValueChange={onMudarMembro} disabled={concluido}>
        <SelectTrigger className="w-[170px] h-8 text-xs">
          <SelectValue placeholder="Dono..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>(sem dono)</SelectItem>
          {membros.map(m => (
            <SelectItem key={m.id} value={m.id}>
              {m.profile?.name || '(sem nome)'} · {m.habilidade}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {tarefa.cycle_phase_task?.link && (
        <a
          href={tarefa.cycle_phase_task.link}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
