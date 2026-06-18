import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { next as nextApi } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  Loader2, Plus, Users, GraduationCap, CalendarDays, Search,
  CheckCircle2, AlertTriangle, X, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

const JornadaConvertidos = lazy(() => import('../../components/JornadaConvertidos'));

const C = { primary: '#00B39D', warn: '#f59e0b', danger: '#ef4444', info: '#3b82f6', gray: '#737373' };

type Status = 'matriculado' | 'formado' | 'incompleto' | 'desistiu';
type Encontro = { id: string; turma_id: string; numero: number; data?: string | null; tema?: string | null };
type Matricula = {
  id: string; turma_id?: string | null; nome: string; sobrenome?: string | null;
  cpf?: string | null; telefone?: string | null; email?: string | null;
  status: Status; observacoes?: string | null;
};
type Presenca = { encontro_id: string; matricula_id: string; presente: boolean };
type Turma = {
  id: string; nome: string; status: 'aberta' | 'encerrada' | 'cancelada';
  responsavel_id?: string | null; observacoes?: string | null;
  contagem?: { total: number; formado?: number; matriculado?: number; incompleto?: number; encontros?: number };
};
type TurmaDetalhe = Turma & { encontros: Encontro[]; matriculas: Matricula[]; presencas: Presenca[] };

const STATUS_LABEL: Record<Status, string> = {
  matriculado: 'Matriculado', formado: 'Formado', incompleto: 'Incompleto', desistiu: 'Desistiu',
};
const STATUS_COLOR: Record<Status, string> = {
  matriculado: C.info, formado: C.primary, incompleto: C.warn, desistiu: C.gray,
};

function ymdLocal(d?: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function NextTurmas() {
  const [view, setView] = useState<'turma' | 'pessoa' | 'nsm'>('turma');

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30">
        {([['turma', 'Por turma'], ['pessoa', 'Por pessoa'], ['nsm', 'NSM']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${view === v ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'turma' && <TurmasView />}
      {view === 'pessoa' && <PessoasView />}
      {view === 'nsm' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Acompanhamento dos convertidos (Data NSM) — quem fez/falta no Next nos primeiros 90 dias.
          </p>
          <Suspense fallback={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto my-8" />}>
            <JornadaConvertidos view="next" />
          </Suspense>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// POR TURMA
// ──────────────────────────────────────────────────────────────────────────
function TurmasView() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [loading, setLoading] = useState(true);
  const [novaOpen, setNovaOpen] = useState(false);
  const [turmaAberta, setTurmaAberta] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTurmas(await nextApi.turmas.list()); } catch (e: any) { toast.error(e?.message || 'Erro ao carregar turmas'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setNovaOpen(true)} className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
          <Plus className="h-4 w-4" /> Nova turma
        </Button>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
      ) : turmas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Nenhuma turma ainda. Crie a primeira turma do Next (2 encontros).
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {turmas.map(t => {
            const c = t.contagem || { total: 0 };
            return (
              <button
                key={t.id}
                onClick={() => setTurmaAberta(t.id)}
                className="text-left rounded-xl border border-border bg-card hover:bg-muted/40 hover:shadow-sm transition-all p-3 flex flex-col gap-2 min-h-[120px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground text-sm leading-tight">{t.nome}</span>
                  {t.status !== 'aberta' && (
                    <Badge variant="outline" className="text-[9px] uppercase shrink-0">{t.status}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{c.total || 0}</span>
                  <span className="flex items-center gap-1" style={{ color: C.primary }}>
                    <GraduationCap className="h-3.5 w-3.5" />{c.formado || 0}
                  </span>
                  <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{c.encontros || 0}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {novaOpen && <NovaTurmaModal onClose={() => setNovaOpen(false)} onCreated={() => { setNovaOpen(false); load(); }} />}
      {turmaAberta && (
        <TurmaDetalheModal
          turmaId={turmaAberta}
          onClose={() => setTurmaAberta(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function NovaTurmaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nome, setNome] = useState('');
  const [data1, setData1] = useState('');
  const [data2, setData2] = useState('');
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!nome.trim()) { toast.error('Informe o nome da turma'); return; }
    setSaving(true);
    try {
      await nextApi.turmas.create({
        nome: nome.trim(),
        encontros: [
          { numero: 1, data: data1 || null },
          { numero: 2, data: data2 || null },
        ],
      });
      toast.success('Turma criada');
      onCreated();
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar turma'); }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova turma do Next</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Next · junho/2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>1º encontro</Label>
              <Input type="date" value={data1} onChange={e => setData1(e.target.value)} />
            </div>
            <div>
              <Label>2º encontro</Label>
              <Input type="date" value={data2} onChange={e => setData2(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">A turma nasce com 2 encontros. Quem vier aos 2 se forma.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TurmaDetalheModal({ turmaId, onClose, onChanged }: { turmaId: string; onClose: () => void; onChanged: () => void }) {
  const [det, setDet] = useState<TurmaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDet(await nextApi.turmas.get(turmaId)); } catch (e: any) { toast.error(e?.message || 'Erro'); }
    setLoading(false);
  }, [turmaId]);
  useEffect(() => { load(); }, [load]);

  // present[encontroId] = Set de matricula_ids presentes
  const present: Record<string, Set<string>> = {};
  (det?.encontros || []).forEach(e => { present[e.id] = new Set(); });
  (det?.presencas || []).forEach(p => { if (p.presente && present[p.encontro_id]) present[p.encontro_id].add(p.matricula_id); });

  const totalEnc = det?.encontros.length || 0;
  const presCount = (matId: string) => (det?.encontros || []).reduce((n, e) => n + (present[e.id]?.has(matId) ? 1 : 0), 0);

  const togglePresenca = async (encontro: Encontro, matId: string) => {
    if (!det) return;
    const set = new Set(present[encontro.id]);
    if (set.has(matId)) set.delete(matId); else set.add(matId);
    try {
      await nextApi.encontros.setPresencas(encontro.id, [...set]);
      await load();
      onChanged();
    } catch (e: any) { toast.error(e?.message || 'Erro ao marcar presença'); }
  };

  const encerrar = async () => {
    try {
      await nextApi.turmas.update(turmaId, { status: 'encerrada' });
      toast.success('Turma encerrada');
      await load(); onChanged();
    } catch (e: any) { toast.error(e?.message || 'Erro'); }
  };

  const setData = async (encId: string, data: string) => {
    try { await nextApi.encontros.update(encId, { data: data || null }); await load(); } catch (e: any) { toast.error(e?.message); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        {loading || !det ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {det.nome}
                {det.status !== 'aberta' && <Badge variant="outline" className="text-[9px] uppercase">{det.status}</Badge>}
              </DialogTitle>
            </DialogHeader>

            {/* Encontros (datas) */}
            <div className="flex flex-wrap gap-3">
              {det.encontros.map(e => (
                <div key={e.id} className="rounded-lg border border-border p-2.5 flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Encontro {e.numero}</span>
                  <Input type="date" value={e.data || ''} onChange={ev => setData(e.id, ev.target.value)} className="h-8 w-[150px]" />
                </div>
              ))}
            </div>

            {/* Grade de presença */}
            <div className="rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-2 font-medium">Pessoa ({det.matriculas.length})</th>
                    {det.encontros.map(e => (
                      <th key={e.id} className="text-center p-2 font-medium whitespace-nowrap">
                        Enc. {e.numero}<div className="text-[10px] text-muted-foreground font-normal">{ymdLocal(e.data)}</div>
                      </th>
                    ))}
                    <th className="text-center p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {det.matriculas.length === 0 ? (
                    <tr><td colSpan={2 + totalEnc} className="p-4 text-center text-muted-foreground text-xs">Ninguém matriculado ainda.</td></tr>
                  ) : det.matriculas.map(m => {
                    const n = presCount(m.id);
                    const incompletoNaoFoi = totalEnc > 0 && n < totalEnc;
                    return (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="p-2">
                          <span className={incompletoNaoFoi && det.status === 'encerrada' ? 'text-amber-600' : ''}>{m.nome} {m.sobrenome || ''}</span>
                          {m.telefone && <span className="block text-[11px] text-muted-foreground">{m.telefone}</span>}
                        </td>
                        {det.encontros.map(e => (
                          <td key={e.id} className="text-center p-2">
                            <input
                              type="checkbox"
                              checked={present[e.id]?.has(m.id) || false}
                              onChange={() => togglePresenca(e, m.id)}
                              className="h-4 w-4 cursor-pointer accent-[#00B39D]"
                            />
                          </td>
                        ))}
                        <td className="text-center p-2">
                          <Badge variant="outline" className="text-[10px]" style={{ color: STATUS_COLOR[m.status], borderColor: STATUS_COLOR[m.status] + '60' }}>
                            {STATUS_LABEL[m.status]}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Worklist resumo */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" style={{ color: C.primary }} /> Formados: {det.matriculas.filter(m => presCount(m.id) >= totalEnc && totalEnc > 0).length}</span>
              <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" style={{ color: C.warn }} /> Faltou 1: {det.matriculas.filter(m => presCount(m.id) === totalEnc - 1 && totalEnc > 1).length}</span>
              <span className="flex items-center gap-1"><X className="h-3.5 w-3.5" style={{ color: C.danger }} /> Não foi: {det.matriculas.filter(m => presCount(m.id) === 0).length}</span>
            </div>

            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => setAddOpen(true)} className="gap-2">
                <UserPlus className="h-4 w-4" /> Matricular pessoa
              </Button>
              <div className="flex gap-2">
                {det.status === 'aberta' && (
                  <Button variant="outline" onClick={encerrar}>Encerrar turma</Button>
                )}
                <Button onClick={onClose}>Fechar</Button>
              </div>
            </DialogFooter>

            {addOpen && (
              <AddMatriculaModal
                turmaId={turmaId}
                onClose={() => setAddOpen(false)}
                onAdded={() => { setAddOpen(false); load(); onChanged(); }}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddMatriculaModal({ turmaId, onClose, onAdded }: { turmaId: string; onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ nome: '', sobrenome: '', telefone: '', email: '', cpf: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const salvar = async () => {
    if (!f.nome.trim()) { toast.error('Informe o nome'); return; }
    setSaving(true);
    try {
      await nextApi.matriculas.create({ ...f, turma_id: turmaId });
      toast.success('Pessoa matriculada');
      onAdded();
    } catch (e: any) { toast.error(e?.message || 'Erro'); }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Matricular na turma</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nome *</Label><Input value={f.nome} onChange={e => set('nome', e.target.value)} /></div>
            <div><Label>Sobrenome</Label><Input value={f.sobrenome} onChange={e => set('sobrenome', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Telefone</Label><Input value={f.telefone} onChange={e => set('telefone', e.target.value)} /></div>
            <div><Label>E-mail</Label><Input value={f.email} onChange={e => set('email', e.target.value)} /></div>
          </div>
          <div><Label>CPF (opcional)</Label><Input value={f.cpf} onChange={e => set('cpf', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Matricular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// POR PESSOA (lista de matrículas + fila de espera + encaixar)
// ──────────────────────────────────────────────────────────────────────────
function PessoasView() {
  const [lista, setLista] = useState<Matricula[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [soFila, setSoFila] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (soFila) params.fila = 'true';
      if (busca) params.search = busca;
      const [m, t] = await Promise.all([
        nextApi.matriculas.list(params),
        nextApi.turmas.list({ status: 'aberta' }),
      ]);
      setLista(m); setTurmas(t);
    } catch (e: any) { toast.error(e?.message || 'Erro'); }
    setLoading(false);
  }, [busca, soFila]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const encaixar = async (matId: string, turmaId: string) => {
    try {
      await nextApi.matriculas.update(matId, { turma_id: turmaId });
      toast.success('Encaixado na turma');
      load();
    } catch (e: any) { toast.error(e?.message || 'Erro'); }
  };

  const nomeTurma = (id?: string | null) => turmas.find(t => t.id === id)?.nome;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border p-0.5 bg-muted/30">
          <button onClick={() => setSoFila(false)} className={`px-3 py-1.5 text-xs rounded-lg ${!soFila ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>Todas</button>
          <button onClick={() => setSoFila(true)} className={`px-3 py-1.5 text-xs rounded-lg ${soFila ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>Fila (sem turma)</button>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, telefone ou e-mail" className="pl-9" />
        </div>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto my-12" />
      ) : lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {soFila ? 'Ninguém na fila de espera.' : 'Nenhuma matrícula ainda.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-2.5 font-medium">Nome</th>
                <th className="text-left p-2.5 font-medium hidden sm:table-cell">Turma</th>
                <th className="text-center p-2.5 font-medium">Status</th>
                <th className="text-right p-2.5 font-medium">{soFila ? 'Encaixar' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(m => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="p-2.5">
                    <span className="font-medium">{m.nome} {m.sobrenome || ''}</span>
                    {m.telefone && <span className="block text-[11px] text-muted-foreground">{m.telefone}</span>}
                  </td>
                  <td className="p-2.5 hidden sm:table-cell text-muted-foreground">
                    {m.turma_id ? (nomeTurma(m.turma_id) || '—') : <Badge variant="outline" className="text-[10px]" style={{ color: C.warn, borderColor: C.warn + '60' }}>fila</Badge>}
                  </td>
                  <td className="text-center p-2.5">
                    <Badge variant="outline" className="text-[10px]" style={{ color: STATUS_COLOR[m.status], borderColor: STATUS_COLOR[m.status] + '60' }}>
                      {STATUS_LABEL[m.status]}
                    </Badge>
                  </td>
                  <td className="text-right p-2.5">
                    {!m.turma_id && turmas.length > 0 && (
                      <Select onValueChange={(v) => encaixar(m.id, v)}>
                        <SelectTrigger className="h-8 w-[150px] ml-auto"><SelectValue placeholder="Encaixar em…" /></SelectTrigger>
                        <SelectContent>
                          {turmas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
