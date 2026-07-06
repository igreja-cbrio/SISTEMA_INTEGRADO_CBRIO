// ════════════════════════════════════════════════════════════════════════════
// Minhas Tarefas · página pessoal (/tarefas · visível pra qualquer autenticado)
// Cada usuário vê SÓ as próprias tarefas (escopo no backend + RLS dono-only).
// 3 visualizações: Lista (agrupada por prazo) · Kanban (status, drag-drop
// nativo · padrão do MarketingKanban) · Calendário (grade mensal · padrão do
// EventosExternos). Alertas de prazo chegam pelo sino (cron diário).
// ════════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tarefas as api } from '../api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  ListChecks, Plus, Pencil, Trash2, Loader2, CalendarDays, KanbanSquare,
  List as ListIcon, ChevronLeft, ChevronRight, Clock, Repeat,
} from 'lucide-react';

const C = { primary: '#00B39D' };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hojeStr = () => ymd(new Date());

const PRIO = {
  alta:  { label: 'Alta',  cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  media: { label: 'Média', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  baixa: { label: 'Baixa', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
};
const COLUNAS = [
  { key: 'a_fazer',   label: 'A fazer',   dot: '#94a3b8' },
  { key: 'fazendo',   label: 'Fazendo',   dot: '#f59e0b' },
  { key: 'concluida', label: 'Concluída', dot: '#00B39D' },
];
const RECORRENCIAS = [
  { value: 'unica', label: 'Não se repete' },
  { value: 'diaria', label: 'Todo dia' },
  { value: 'semanal', label: 'Toda semana' },
  { value: 'quinzenal', label: 'A cada 15 dias' },
  { value: 'mensal', label: 'Todo mês' },
];

function fmtDataCurta(iso) {
  if (!iso) return null;
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function MinhasTarefas() {
  const qc = useQueryClient();
  const [view, setView] = useState('lista');
  const [modal, setModal] = useState(null); // null | 'nova' | tarefa
  const [excluir, setExcluir] = useState(null);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ['tarefas'],
    queryFn: () => api.list(),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['tarefas'] });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.update(id, { status }),
    onSuccess: invalidar,
    onError: (e) => toast.error(e.message || 'Erro ao atualizar'),
  });

  const excluirMut = useMutation({
    mutationFn: ({ id, serie }) => api.remove(id, serie),
    onSuccess: () => { toast.success('Tarefa excluída'); setExcluir(null); invalidar(); },
    onError: (e) => toast.error(e.message || 'Erro ao excluir'),
  });

  const pendentes = itens.filter(t => t.status !== 'concluida');
  const atrasadas = pendentes.filter(t => t.data && t.data < hojeStr());

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ListChecks className="h-5 w-5" style={{ color: C.primary }} /> Minhas Tarefas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pendentes.length} pendente{pendentes.length === 1 ? '' : 's'}
            {atrasadas.length > 0 && <span className="text-red-500"> · {atrasadas.length} atrasada{atrasadas.length === 1 ? '' : 's'}</span>}
            {' '}· só você vê suas tarefas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="lista" className="gap-1.5"><ListIcon className="h-3.5 w-3.5" /> Lista</TabsTrigger>
              <TabsTrigger value="kanban" className="gap-1.5"><KanbanSquare className="h-3.5 w-3.5" /> Kanban</TabsTrigger>
              <TabsTrigger value="calendario" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Calendário</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => setModal('nova')}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova tarefa
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : view === 'lista' ? (
        <VistaLista itens={itens} onToggle={(t) => statusMut.mutate({ id: t.id, status: t.status === 'concluida' ? 'a_fazer' : 'concluida' })} onEditar={setModal} onExcluir={setExcluir} />
      ) : view === 'kanban' ? (
        <VistaKanban itens={itens} onMover={(id, status) => statusMut.mutate({ id, status })} onEditar={setModal} />
      ) : (
        <VistaCalendario itens={itens} onEditar={setModal} />
      )}

      {modal && (
        <TarefaModal
          tarefa={modal === 'nova' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); invalidar(); }}
        />
      )}

      {excluir && (
        <Dialog open onOpenChange={(o) => { if (!o) setExcluir(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Excluir tarefa?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">"{excluir.titulo}"</p>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setExcluir(null)}>Cancelar</Button>
              {excluir.recorrencia_id && (
                <Button variant="outline" onClick={() => excluirMut.mutate({ id: excluir.id, serie: true })} disabled={excluirMut.isPending}>
                  <Repeat className="h-4 w-4 mr-1.5" /> Excluir esta e as futuras
                </Button>
              )}
              <Button variant="destructive" onClick={() => excluirMut.mutate({ id: excluir.id, serie: false })} disabled={excluirMut.isPending}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Linha de tarefa (lista) ──────────────────────────────────────────────────
function TarefaLinha({ t, onToggle, onEditar, onExcluir }) {
  const atrasada = t.status !== 'concluida' && t.data && t.data < hojeStr();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 group">
      <Checkbox checked={t.status === 'concluida'} onCheckedChange={() => onToggle(t)} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${t.status === 'concluida' ? 'line-through text-muted-foreground' : ''}`}>
          {t.titulo}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {t.data && (
            <span className={`text-xs inline-flex items-center gap-1 ${atrasada ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
              <Clock className="h-3 w-3" /> {fmtDataCurta(t.data)}{t.horario ? ` · ${t.horario.slice(0, 5)}` : ''}
            </span>
          )}
          <Badge variant="outline" className={`border-0 text-[10px] px-1.5 py-0 ${PRIO[t.prioridade]?.cls || PRIO.media.cls}`}>
            {PRIO[t.prioridade]?.label || 'Média'}
          </Badge>
          {t.recorrencia && t.recorrencia !== 'unica' && <Repeat className="h-3 w-3 text-muted-foreground" />}
          {t.status === 'fazendo' && <span className="text-[10px] text-amber-500 font-semibold uppercase">fazendo</span>}
        </div>
      </div>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditar(t)} title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onExcluir(t)} title="Excluir">
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </Button>
      </div>
    </div>
  );
}

// ── Lista agrupada por prazo ─────────────────────────────────────────────────
function VistaLista({ itens, onToggle, onEditar, onExcluir }) {
  const hoje = hojeStr();
  const fimSemana = ymd(new Date(Date.now() + 6 * 86400000));
  const grupos = useMemo(() => {
    const pend = itens.filter(t => t.status !== 'concluida');
    return [
      { titulo: 'Atrasadas', cls: 'text-red-500', itens: pend.filter(t => t.data && t.data < hoje) },
      { titulo: 'Hoje', cls: '', itens: pend.filter(t => t.data === hoje) },
      { titulo: 'Próximos 7 dias', cls: '', itens: pend.filter(t => t.data && t.data > hoje && t.data <= fimSemana) },
      { titulo: 'Mais tarde', cls: '', itens: pend.filter(t => t.data && t.data > fimSemana) },
      { titulo: 'Sem prazo', cls: '', itens: pend.filter(t => !t.data) },
      { titulo: 'Concluídas', cls: 'text-muted-foreground', itens: itens.filter(t => t.status === 'concluida').slice(-30).reverse() },
    ].filter(g => g.itens.length > 0);
  }, [itens, hoje, fimSemana]);

  if (!grupos.length) {
    return (
      <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">
        Nenhuma tarefa ainda. Clique em "Nova tarefa" pra começar.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-5">
      {grupos.map(g => (
        <div key={g.titulo}>
          <h2 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${g.cls || 'text-muted-foreground'}`}>
            {g.titulo} ({g.itens.length})
          </h2>
          <div className="space-y-1.5">
            {g.itens.map(t => <TarefaLinha key={t.id} t={t} onToggle={onToggle} onEditar={onEditar} onExcluir={onExcluir} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Kanban (drag-drop nativo · padrão MarketingKanban) ──────────────────────
function VistaKanban({ itens, onMover, onEditar }) {
  const [dragOver, setDragOver] = useState(null);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {COLUNAS.map(col => {
        const cards = itens.filter(t => (t.status || 'a_fazer') === col.key);
        return (
          <div
            key={col.key}
            className={`rounded-xl border bg-card/60 p-2 min-h-[300px] transition-colors ${dragOver === col.key ? 'border-primary bg-primary/5' : 'border-border'}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(null);
              const id = e.dataTransfer.getData('text/plain');
              if (id) onMover(id, col.key);
            }}
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.dot }} />
              <span className="text-sm font-semibold">{col.label}</span>
              <span className="text-xs text-muted-foreground ml-auto">{cards.length}</span>
            </div>
            <div className="space-y-1.5 mt-1">
              {cards.map(t => {
                const atrasada = col.key !== 'concluida' && t.data && t.data < hojeStr();
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                    onClick={() => onEditar(t)}
                    className="rounded-lg border border-border bg-card px-3 py-2 cursor-grab active:cursor-grabbing hover:border-primary/50"
                  >
                    <p className={`text-sm font-medium ${col.key === 'concluida' ? 'line-through text-muted-foreground' : ''}`}>{t.titulo}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {t.data && (
                        <span className={`text-[11px] inline-flex items-center gap-1 ${atrasada ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                          <Clock className="h-3 w-3" /> {fmtDataCurta(t.data)}
                        </span>
                      )}
                      <Badge variant="outline" className={`border-0 text-[10px] px-1.5 py-0 ${PRIO[t.prioridade]?.cls || PRIO.media.cls}`}>
                        {PRIO[t.prioridade]?.label || 'Média'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Calendário mensal (padrão EventosExternos) ──────────────────────────────
function VistaCalendario({ itens, onEditar }) {
  const [mesRef, setMesRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const hoje = hojeStr();

  const celulas = useMemo(() => {
    const ini = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
    const fim = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0);
    const arr = [];
    for (let i = 0; i < ini.getDay(); i++) arr.push(null);
    for (let d = 1; d <= fim.getDate(); d++) arr.push(new Date(mesRef.getFullYear(), mesRef.getMonth(), d));
    return arr;
  }, [mesRef]);

  const porDia = useMemo(() => {
    const map = {};
    for (const t of itens) {
      if (!t.data) continue;
      (map[t.data] = map[t.data] || []).push(t);
    }
    return map;
  }, [itens]);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="sm" onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold capitalize">
            {mesRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground mb-1">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {celulas.map((d, i) => {
            if (!d) return <div key={`v-${i}`} />;
            const key = ymd(d);
            const doDia = porDia[key] || [];
            const ehHoje = key === hoje;
            return (
              <div key={key} className={`min-h-[76px] rounded-lg border p-1 ${ehHoje ? 'border-primary ring-1 ring-primary/40' : 'border-border'}`}>
                <span className={`text-[11px] font-medium ${ehHoje ? 'text-primary' : 'text-muted-foreground'}`}>{d.getDate()}</span>
                <div className="space-y-0.5 mt-0.5">
                  {doDia.slice(0, 3).map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onEditar(t)}
                      className={`block w-full text-left text-[10px] leading-tight rounded px-1 py-0.5 truncate ${
                        t.status === 'concluida'
                          ? 'bg-muted text-muted-foreground line-through'
                          : t.data < hoje
                            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                            : 'bg-primary/10 text-primary'
                      }`}
                      title={t.titulo}
                    >
                      {t.titulo}
                    </button>
                  ))}
                  {doDia.length > 3 && <span className="text-[10px] text-muted-foreground px-1">+{doDia.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Modal criar/editar ───────────────────────────────────────────────────────
function TarefaModal({ tarefa, onClose, onSaved }) {
  const [titulo, setTitulo] = useState(tarefa?.titulo || '');
  const [descricao, setDescricao] = useState(tarefa?.descricao || '');
  const [data, setData] = useState(tarefa?.data || '');
  const [horario, setHorario] = useState(tarefa?.horario?.slice(0, 5) || '');
  const [prioridade, setPrioridade] = useState(tarefa?.prioridade || 'media');
  const [status, setStatus] = useState(tarefa?.status || 'a_fazer');
  const [recorrencia, setRecorrencia] = useState('unica');

  const salvarMut = useMutation({
    mutationFn: () => {
      const body = {
        titulo, descricao: descricao || null,
        data: data || null, horario: horario || null,
        prioridade, status,
      };
      if (tarefa) return api.update(tarefa.id, body);
      return api.create({ ...body, recorrencia });
    },
    onSuccess: () => { toast.success(tarefa ? 'Tarefa atualizada' : 'Tarefa criada'); onSaved(); },
    onError: (e) => toast.error(e.message || 'Erro ao salvar'),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tarefa ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Título</label>
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="O que precisa ser feito?" autoFocus maxLength={200} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição (opcional)</label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} maxLength={2000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Prazo (opcional)</label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Horário</label>
              <Input type="time" value={horario} onChange={e => setHorario(e.target.value)} disabled={!data} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Prioridade</label>
              <Select value={prioridade} onValueChange={setPrioridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tarefa ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUNAS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Repetir</label>
                <Select value={recorrencia} onValueChange={setRecorrencia} disabled={!data}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECORRENCIAS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvarMut.mutate()} disabled={!titulo.trim() || salvarMut.isPending}>
            {salvarMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            {tarefa ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
