/**
 * Jornada 180 · gestão de turmas dentro de Cuidados (dado sensível · separado dos grupos).
 * Turma → líder → participantes → encontros/frequência. Espelha a lógica de Grupos,
 * mas vive em Cuidados e alimenta os KPIs de J180 (valor Investir · ligado na Fase 3b).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { cuidados as cuidadosApi } from '../api';
import useConfirmarSaida from '../hooks/useConfirmarSaida';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Users, Plus, Trash2, Loader2, CalendarCheck, UserPlus, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

const C = { primary: '#00B39D', info: '#3b82f6', warn: '#f59e0b', purple: '#8b5cf6' };
const AREA_LABEL: Record<string, string> = { ami: 'AMI', sede: 'Sede', online: 'Online' };
const AREAS = ['ami', 'sede', 'online'];
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function fmtData(d: string | null) {
  return d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
}

// ── Modal de turma (criar/editar) ──
function TurmaFormModal({ open, initial, onClose, onSaved }: {
  open: boolean; initial?: any | null; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!initial?.id;
  const empty = { nome: '', area: 'sede', lider_nome: '', temporada: '', dia_semana: '', horario: '', descricao: '', ativo: true };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const snapRef = useRef<string>(JSON.stringify(empty));

  useEffect(() => {
    if (!open) return;
    const next = initial ? {
      nome: initial.nome || '', area: initial.area || 'sede', lider_nome: initial.lider_nome || '',
      temporada: initial.temporada || '', dia_semana: initial.dia_semana ?? '' as any,
      horario: initial.horario ? String(initial.horario).slice(0, 5) : '', descricao: initial.descricao || '',
      ativo: initial.ativo !== false,
    } : empty;
    setForm(next as any);
    snapRef.current = JSON.stringify(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const temAlteracoes = JSON.stringify(form) !== snapRef.current;
  const { tentarFechar } = useConfirmarSaida(temAlteracoes, onClose);

  async function save() {
    if (!form.nome) return toast.error('Nome da turma é obrigatório');
    setSaving(true);
    try {
      const payload: any = {
        nome: form.nome, area: form.area, lider_nome: form.lider_nome || null,
        temporada: form.temporada || null,
        dia_semana: form.dia_semana === '' ? null : Number(form.dia_semana),
        horario: form.horario || null, descricao: form.descricao || null, ativo: form.ativo,
      };
      if (editing) { await cuidadosApi.j180.turmas.update(initial.id, payload); toast.success('Turma atualizada'); }
      else { await cuidadosApi.j180.turmas.create(payload); toast.success('Turma criada'); }
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) tentarFechar(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? 'Editar turma' : 'Nova turma de Jornada 180'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Turma Quarta · Sede" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Área</Label>
              <Select value={form.area} onValueChange={v => setForm({ ...form, area: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AREAS.map(a => <SelectItem key={a} value={a}>{AREA_LABEL[a]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Líder</Label><Input value={form.lider_nome} onChange={e => setForm({ ...form, lider_nome: e.target.value })} placeholder="Nome do líder" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Dia</Label>
              <Select value={form.dia_semana === '' ? '__none' : String(form.dia_semana)} onValueChange={v => setForm({ ...form, dia_semana: v === '__none' ? '' : v as any })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Hora</Label><Input type="time" value={form.horario} onChange={e => setForm({ ...form, horario: e.target.value })} /></div>
            <div><Label>Temporada</Label><Input value={form.temporada} onChange={e => setForm({ ...form, temporada: e.target.value })} placeholder="Ex.: 2026.2" /></div>
          </div>
          <div><Label>Descrição</Label><Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
          {editing && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />Turma ativa</label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={tentarFechar}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal de registrar encontro (presença por checkbox do roster) ──
function RegistrarEncontroModal({ open, turma, membros, onClose, onSaved }: {
  open: boolean; turma: any; membros: any[]; onClose: () => void; onSaved: () => void;
}) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [tema, setTema] = useState('');
  const [presentes, setPresentes] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const snapRef = useRef<string>('');

  useEffect(() => {
    if (open) {
      const base = { data: new Date().toISOString().slice(0, 10), tema: '', presentes: {} };
      setData(base.data); setTema(''); setPresentes({});
      snapRef.current = JSON.stringify(base);
    }
  }, [open]);

  const temAlteracoes = JSON.stringify({ data, tema, presentes }) !== snapRef.current;
  const { tentarFechar } = useConfirmarSaida(temAlteracoes, onClose);

  async function save() {
    if (!data) return toast.error('Escolha a data do encontro');
    setSaving(true);
    try {
      const ids = membros.filter(m => presentes[m.id]).map(m => m.id);
      await cuidadosApi.j180.encontros.registrar(turma.id, { data, tema: tema || null, presentes: ids });
      toast.success('Encontro registrado');
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  if (!turma) return null;
  const totalPresentes = membros.filter(m => presentes[m.id]).length;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) tentarFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar encontro — {turma.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data *</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
            <div><Label>Tema</Label><Input value={tema} onChange={e => setTema(e.target.value)} /></div>
          </div>
          <div>
            <Label>Presentes <span className="text-muted-foreground font-normal">({totalPresentes}/{membros.length})</span></Label>
            <div className="mt-1 max-h-[40vh] overflow-y-auto rounded-md border border-border divide-y divide-border">
              {membros.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">Nenhum participante na turma ainda.</p>
              ) : membros.map(m => (
                <label key={m.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!presentes[m.id]} onChange={e => setPresentes(s => ({ ...s, [m.id]: e.target.checked }))} />
                  {m.nome}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={tentarFechar}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detalhe da turma (roster + encontros) ──
function TurmaDetailDialog({ turmaId, canWrite, onClose, onChanged }: {
  turmaId: string | null; canWrite: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [turma, setTurma] = useState<any>(null);
  const [encontros, setEncontros] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTel, setNovoTel] = useState('');
  const [addingMembro, setAddingMembro] = useState(false);
  const [modalEncontro, setModalEncontro] = useState(false);

  const reload = useCallback(() => {
    if (!turmaId) return;
    setLoading(true);
    Promise.all([
      cuidadosApi.j180.turmas.get(turmaId),
      cuidadosApi.j180.encontros.list(turmaId).catch(() => []),
    ]).then(([t, e]) => { setTurma(t); setEncontros(e || []); })
      .catch(() => setTurma(null)).finally(() => setLoading(false));
  }, [turmaId]);

  useEffect(() => { if (turmaId) reload(); }, [turmaId, reload]);

  async function addMembro() {
    if (!novoNome.trim()) return toast.error('Nome do participante');
    setAddingMembro(true);
    try {
      await cuidadosApi.j180.membros.add(turmaId, { nome: novoNome.trim(), telefone: novoTel.trim() || null });
      setNovoNome(''); setNovoTel('');
      reload(); onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setAddingMembro(false); }
  }

  async function removerMembro(id: string) {
    if (!confirm('Remover este participante da turma?')) return;
    try { await cuidadosApi.j180.membros.remove(id); reload(); onChanged(); }
    catch (e: any) { toast.error(e.message); }
  }

  const membros: any[] = turma?.membros || [];

  return (
    <Dialog open={!!turmaId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            {turma?.nome || 'Turma'}
            {turma && <Badge variant="secondary">{AREA_LABEL[turma.area] || turma.area}</Badge>}
          </DialogTitle>
        </DialogHeader>
        {loading && !turma ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !turma ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Turma não encontrada.</p>
        ) : (
          <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              {turma.lider_nome && <span>Líder: <strong className="text-foreground">{turma.lider_nome}</strong></span>}
              {turma.dia_semana != null && <span>{DIAS[turma.dia_semana]}{turma.horario ? ' · ' + String(turma.horario).slice(0, 5) : ''}</span>}
              {turma.temporada && <span>Temporada: {turma.temporada}</span>}
            </div>

            {/* Participantes */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Participantes ({membros.length})</h3>
              {canWrite && (
                <div className="flex items-end gap-2 mb-2">
                  <div className="flex-1"><Label className="text-xs">Nome</Label><Input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Novo participante" className="h-9" /></div>
                  <div className="w-40"><Label className="text-xs">Telefone</Label><Input value={novoTel} onChange={e => setNovoTel(e.target.value)} className="h-9" /></div>
                  <Button size="sm" onClick={addMembro} disabled={addingMembro}><UserPlus className="h-3.5 w-3.5 mr-1" />Adicionar</Button>
                </div>
              )}
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Entrou</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {membros.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem participantes ainda.</TableCell></TableRow>
                    ) : membros.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.nome}{m.membro_id && <Badge variant="secondary" className="ml-2 text-[10px]">membro</Badge>}</TableCell>
                        <TableCell className="text-sm">{m.telefone || '—'}</TableCell>
                        <TableCell className="text-sm">{fmtData(m.entrou_em)}</TableCell>
                        <TableCell className="text-right">
                          {canWrite && <Button variant="ghost" size="sm" onClick={() => removerMembro(m.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            {/* Encontros */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Encontros</h3>
                {canWrite && <Button size="sm" variant="outline" onClick={() => setModalEncontro(true)}><CalendarCheck className="h-3.5 w-3.5 mr-1" />Registrar encontro</Button>}
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tema</TableHead><TableHead>Presentes</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {encontros.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhum encontro registrado.</TableCell></TableRow>
                    ) : encontros.map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">{fmtData(e.data)}</TableCell>
                        <TableCell className="text-sm">{e.tema || '—'}</TableCell>
                        <TableCell className="text-sm">{(e.presentes || []).length}/{membros.length}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
      <RegistrarEncontroModal open={modalEncontro} turma={turma} membros={membros} onClose={() => setModalEncontro(false)} onSaved={() => { reload(); onChanged(); }} />
    </Dialog>
  );
}

export default function CuidadosJ180({ canWrite }: { canWrite: boolean }) {
  const [relatorio, setRelatorio] = useState<any>(null);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [areaFiltro, setAreaFiltro] = useState('todas');
  const [modalTurma, setModalTurma] = useState(false);
  const [editTurma, setEditTurma] = useState<any | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    const params: any = {};
    if (areaFiltro !== 'todas') params.area = areaFiltro;
    Promise.all([
      cuidadosApi.j180.turmas.list(Object.keys(params).length ? params : undefined).catch(() => []),
      cuidadosApi.j180.relatorio().catch(() => null),
    ]).then(([t, r]) => { setTurmas(t || []); setRelatorio(r); }).finally(() => setLoading(false));
  }, [areaFiltro]);

  useEffect(() => { reload(); }, [reload]);

  async function removerTurma(id: string) {
    if (!confirm('Remover esta turma? (os participantes e encontros saem da visão)')) return;
    try { await cuidadosApi.j180.turmas.remove(id); reload(); }
    catch (e: any) { toast.error(e.message); }
  }

  const freq = relatorio?.frequencia;
  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ResumoCard titulo="Turmas ativas" valor={relatorio?.total_turmas ?? 0} icon={GraduationCap} color={C.primary} />
        <ResumoCard titulo="Participantes" valor={relatorio?.total_participantes ?? 0} icon={Users} color={C.info} />
        <ResumoCard titulo="Líderes" valor={relatorio?.total_lideres ?? 0} icon={Users} color={C.purple} />
        <ResumoCard titulo="Freq. média/encontro" valor={freq?.media_por_encontro ?? 0} sub={`${freq?.total_encontros ?? 0} encontros · 180d`} icon={CalendarCheck} color={C.warn} />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={areaFiltro} onValueChange={setAreaFiltro}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as áreas</SelectItem>
            {AREAS.map(a => <SelectItem key={a} value={a}>{AREA_LABEL[a]}</SelectItem>)}
          </SelectContent>
        </Select>
        {canWrite && <Button onClick={() => { setEditTurma(null); setModalTurma(true); }}><Plus className="h-4 w-4 mr-2" />Nova turma</Button>}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Turma</TableHead><TableHead>Área</TableHead><TableHead>Líder</TableHead><TableHead>Participantes</TableHead><TableHead>Quando</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground inline" /></TableCell></TableRow>
            ) : turmas.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma turma de Jornada 180 cadastrada.</TableCell></TableRow>
            ) : turmas.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <button type="button" onClick={() => setDetalheId(t.id)} className="text-left hover:text-primary transition-colors underline-offset-2 hover:underline">{t.nome}</button>
                </TableCell>
                <TableCell><Badge variant="secondary">{AREA_LABEL[t.area] || t.area}</Badge></TableCell>
                <TableCell className="text-sm">{t.lider_nome || '—'}</TableCell>
                <TableCell className="text-sm">{t.participantes_count ?? 0}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{t.dia_semana != null ? DIAS[t.dia_semana] : '—'}{t.horario ? ' · ' + String(t.horario).slice(0, 5) : ''}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {canWrite && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => { setEditTurma(t); setModalTurma(true); }}>Editar</Button>
                      <Button variant="ghost" size="sm" onClick={() => removerTurma(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TurmaFormModal open={modalTurma} initial={editTurma} onClose={() => { setModalTurma(false); setEditTurma(null); }} onSaved={reload} />
      <TurmaDetailDialog turmaId={detalheId} canWrite={canWrite} onClose={() => setDetalheId(null)} onChanged={reload} />
    </div>
  );
}

function ResumoCard({ titulo, valor, sub, icon: Icon, color }: any) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
      <div className="rounded-lg p-2 shrink-0" style={{ background: color + '18' }}><Icon className="h-5 w-5" style={{ color }} /></div>
      <div>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{titulo}</p>
        <span className="text-2xl font-bold text-foreground">{valor}</span>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
