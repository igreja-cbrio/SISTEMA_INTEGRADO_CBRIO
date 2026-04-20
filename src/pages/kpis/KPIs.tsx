import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { kpis as kpisApi } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameMonth, isSameDay, subWeeks,
  addMonths, subMonths, isWithinInterval, parseISO,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area,
  RadialBarChart, RadialBar, Cell, PieChart, Pie,
} from 'recharts';
import {
  Users, TrendingUp, Droplets, Youtube, HandHeart,
  Plus, RefreshCw, CheckCircle2, BookOpen, Baby,
  Target, Edit2, Save, X, Loader2, ArrowRight, UserCheck,
  Heart, Building2, DoorOpen, Activity, ChevronLeft, ChevronRight,
  LayoutGrid, List, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// ── Helpers ───────────────────────────────────────────────────────────────────

const C = {
  primary: '#00B39D',
  warn: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  purple: '#8B5CF6',
};

function kpiStatus(valor: number | null, meta: number | null): 'ok' | 'warn' | 'bad' | 'none' {
  if (!meta || valor === null) return 'none';
  const pct = valor / meta;
  if (pct >= 0.9) return 'ok';
  if (pct >= 0.7) return 'warn';
  return 'bad';
}

function StatusDot({ status }: { status: 'ok' | 'warn' | 'bad' | 'none' }) {
  const colors = { ok: C.primary, warn: C.warn, bad: C.danger, none: '#6B7280' };
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colors[status], marginRight: 6 }} />;
}

function KpiCard({ label, value, meta, unit = '', icon: Icon, color = C.primary, sublabel, onClick }: {
  label: string; value: number | null; meta?: number | null; unit?: string;
  icon: any; color?: string; sublabel?: string; onClick?: () => void;
}) {
  const status = kpiStatus(value, meta ?? null);
  const pct = meta && value !== null ? Math.round(value / meta * 100) : null;
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-border bg-card p-5 flex flex-col gap-3 transition-all ${onClick ? 'cursor-pointer hover:border-[#00B39D]/50 hover:shadow-md hover:-translate-y-0.5' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: color + '20' }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div className="flex items-center gap-1.5">
          {meta && <StatusDot status={status} />}
          {onClick && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">
          {value !== null ? value.toLocaleString('pt-BR') : '—'}{unit && value !== null ? unit : ''}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground/60 mt-0.5">{sublabel}</p>}
      </div>
      {meta && (
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Meta: {meta.toLocaleString('pt-BR')}{unit}</span>
            <span style={{ color: status === 'ok' ? C.primary : status === 'warn' ? C.warn : status === 'bad' ? C.danger : '#6B7280' }}>
              {pct !== null ? `${pct}%` : '—'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.min(pct ?? 0, 100)}%`,
              background: status === 'ok' ? C.primary : status === 'warn' ? C.warn : C.danger,
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal: Registrar Culto ────────────────────────────────────────────────────

function ModalRegistrarCulto({ serviceTypes, onClose, onSaved, editing }: {
  serviceTypes: any[]; onClose: () => void; onSaved: () => void; editing?: any;
}) {
  const [form, setForm] = useState({
    service_type_id: editing?.service_type_id || '',
    nome: editing?.nome || '',
    data: editing?.data || format(new Date(), 'yyyy-MM-dd'),
    hora: editing?.hora?.slice(0, 5) || '',
    presencial_adulto: editing?.presencial_adulto ?? '',
    presencial_kids: editing?.presencial_kids ?? '',
    decisoes_presenciais: editing?.decisoes_presenciais ?? '',
    decisoes_online: editing?.decisoes_online ?? '',
    youtube_video_id: editing?.youtube_video_id || '',
    online_pico: editing?.online_pico ?? '',
  });
  const [saving, setSaving] = useState(false);

  const setField = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setForm(f => {
      const next = { ...f, [k]: val };
      // Auto-preenche nome quando seleciona tipo + data
      if ((k === 'service_type_id' || k === 'data') && next.service_type_id && next.data) {
        const st = serviceTypes.find(s => s.id === next.service_type_id);
        if (st) {
          const d = format(new Date(next.data + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR });
          next.nome = `${st.name} — ${d}`;
          if (!next.hora && st.recurrence_time) next.hora = st.recurrence_time.slice(0, 5);
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.data || !form.hora || !form.nome) { toast.error('Data, hora e nome são obrigatórios'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        presencial_adulto: Number(form.presencial_adulto) || 0,
        presencial_kids:   Number(form.presencial_kids)   || 0,
        decisoes_presenciais: Number(form.decisoes_presenciais) || 0,
        decisoes_online:      Number(form.decisoes_online)      || 0,
        online_pico: form.online_pico !== '' ? Number(form.online_pico) : null,
      };
      if (editing) {
        await kpisApi.cultos.update(editing.id, payload);
      } else {
        await kpisApi.cultos.create(payload);
      }
      toast.success(editing ? 'Culto atualizado!' : 'Culto registrado!');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-border bg-input text-foreground text-sm outline-none focus:border-[#00B39D] transition-colors';
  const labelCls = 'block text-xs text-muted-foreground mb-1';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{ background: 'var(--cbrio-overlay)' }}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">{editing ? 'Editar Culto' : 'Registrar Culto'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Tipo de culto</label>
              <select value={form.service_type_id} onChange={setField('service_type_id')} className={inputCls}>
                <option value="">Selecionar...</option>
                {serviceTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Data</label>
              <input type="date" value={form.data} onChange={setField('data')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Hora</label>
              <input type="time" value={form.hora} onChange={setField('hora')} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Nome (auto-preenchido)</label>
              <input value={form.nome} onChange={setField('nome')} className={inputCls} placeholder="Ex: Domingo 10:00 — 20/04/2026" />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Frequência Presencial</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Adultos</label>
                <input type="number" min="0" value={form.presencial_adulto} onChange={setField('presencial_adulto')} className={inputCls} placeholder="0" />
              </div>
              <div>
                <label className={labelCls}>Kids</label>
                <input type="number" min="0" value={form.presencial_kids} onChange={setField('presencial_kids')} className={inputCls} placeholder="0" />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Decisões</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Presenciais</label>
                <input type="number" min="0" value={form.decisoes_presenciais} onChange={setField('decisoes_presenciais')} className={inputCls} placeholder="0" />
              </div>
              <div>
                <label className={labelCls}>Online</label>
                <input type="number" min="0" value={form.decisoes_online} onChange={setField('decisoes_online')} className={inputCls} placeholder="0" />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Online / YouTube</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>ID do vídeo no YouTube</label>
                <input value={form.youtube_video_id} onChange={setField('youtube_video_id')} className={inputCls} placeholder="Ex: dQw4w9WgXcQ" />
                <p className="text-[10px] text-muted-foreground/60 mt-1">D+1 e D+7 serão coletados automaticamente pelo cron</p>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Pico simultâneo (manual)</label>
                <input type="number" min="0" value={form.online_pico} onChange={setField('online_pico')} className={inputCls} placeholder="0" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Registrar Batismo ──────────────────────────────────────────────────

function ModalBatismo({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ nome: '', sobrenome: '', cpf: '', data_nascimento: '', telefone: '', email: '', observacoes: '' });
  const [saving, setSaving] = useState(false);

  const maskCpf = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  const setField = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: k === 'cpf' ? maskCpf(e.target.value) : e.target.value }));

  const handleSave = async () => {
    if (!form.nome || !form.sobrenome) { toast.error('Nome e sobrenome são obrigatórios'); return; }
    setSaving(true);
    try {
      await kpisApi.batismos.create({ ...form, origem: 'manual' });
      toast.success('Inscrito no batismo!');
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message || 'Erro ao salvar'); }
    setSaving(false);
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-border bg-input text-foreground text-sm outline-none focus:border-[#00B39D] transition-colors';
  const labelCls = 'block text-xs text-muted-foreground mb-1';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{ background: 'var(--cbrio-overlay)' }}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold">Inscrever para Batismo</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nome *</label>
              <input value={form.nome} onChange={setField('nome')} className={inputCls} placeholder="Nome" />
            </div>
            <div>
              <label className={labelCls}>Sobrenome *</label>
              <input value={form.sobrenome} onChange={setField('sobrenome')} className={inputCls} placeholder="Sobrenome" />
            </div>
          </div>
          <div>
            <label className={labelCls}>CPF (se disponível)</label>
            <input value={form.cpf} onChange={setField('cpf')} className={inputCls} placeholder="000.000.000-00" inputMode="numeric" />
            <p className="text-[10px] text-muted-foreground/60 mt-1">Se já cadastrado, será vinculado automaticamente</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Data de nascimento</label>
              <input type="date" value={form.data_nascimento} onChange={setField('data_nascimento')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Telefone</label>
              <input value={form.telefone} onChange={setField('telefone')} className={inputCls} placeholder="(21) 9..." />
            </div>
          </div>
          <div>
            <label className={labelCls}>E-mail</label>
            <input type="email" value={form.email} onChange={setField('email')} className={inputCls} placeholder="email@exemplo.com" />
          </div>
          <div>
            <label className={labelCls}>Observações</label>
            <textarea value={form.observacoes} onChange={setField('observacoes')} rows={2}
              className="w-full px-3 py-2 rounded-xl border border-border bg-input text-foreground text-sm outline-none focus:border-[#00B39D] transition-colors resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#6366F1] hover:bg-[#6366F1]/90 text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Droplets className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Inscrever'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Cultos ────────────────────────────────────────────────────────────────

type FilterId = 'semana_passada' | 'esta_semana' | 'mes_atual' | 'todas';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'semana_passada', label: 'Semana passada' },
  { id: 'esta_semana',    label: 'Esta semana' },
  { id: 'mes_atual',      label: 'Este mês' },
  { id: 'todas',          label: 'Todas' },
];

function filterCultos(cultos: any[], filterId: FilterId) {
  const now = new Date();
  if (filterId === 'semana_passada') {
    const semPassada = subWeeks(now, 1);
    const ini = startOfWeek(semPassada, { weekStartsOn: 0 });
    const fim = endOfWeek(semPassada, { weekStartsOn: 0 });
    return cultos.filter(c => isWithinInterval(parseISO(c.data), { start: ini, end: fim }));
  }
  if (filterId === 'esta_semana') {
    const ini = startOfWeek(now, { weekStartsOn: 0 });
    const fim = endOfWeek(now, { weekStartsOn: 0 });
    return cultos.filter(c => isWithinInterval(parseISO(c.data), { start: ini, end: fim }));
  }
  if (filterId === 'mes_atual') {
    const ini = startOfMonth(now);
    const fim = endOfMonth(now);
    return cultos.filter(c => isWithinInterval(parseISO(c.data), { start: ini, end: fim }));
  }
  return cultos;
}

function CalendarioCultos({ cultos, serviceTypes, calMes, onDayClick, selectedDay }: {
  cultos: any[]; serviceTypes: any[]; calMes: Date;
  onDayClick: (d: Date) => void; selectedDay: Date | null;
}) {
  const primeiroDia = startOfMonth(calMes);
  const ultimoDia = endOfMonth(calMes);
  const grid = eachDayOfInterval({
    start: startOfWeek(primeiroDia, { weekStartsOn: 0 }),
    end: endOfWeek(ultimoDia, { weekStartsOn: 0 }),
  });
  const cultosNodia = (d: Date) => cultos.filter(c => isSameDay(parseISO(c.data), d));
  const stColor = (id: string) => serviceTypes.find(s => s.id === id)?.color || '#6B7280';
  const semanas = [];
  for (let i = 0; i < grid.length; i += 7) semanas.push(grid.slice(i, i + 7));

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{d}</div>
        ))}
      </div>
      {semanas.map((semana, si) => (
        <div key={si} className="grid grid-cols-7 border-b border-border last:border-0">
          {semana.map((dia, di) => {
            const cultosDia = cultosNodia(dia);
            const isHoje = isSameDay(dia, new Date());
            const isSelected = selectedDay && isSameDay(dia, selectedDay);
            const isOutro = !isSameMonth(dia, calMes);
            return (
              <div
                key={di}
                onClick={() => cultosDia.length > 0 && onDayClick(dia)}
                className={`min-h-[72px] p-1.5 border-r border-border last:border-r-0 transition-colors
                  ${cultosDia.length > 0 ? 'cursor-pointer hover:bg-muted/30' : ''}
                  ${isSelected ? 'bg-primary/5' : ''}
                  ${isOutro ? 'bg-muted/20' : ''}
                `}
              >
                <span className={`text-xs font-medium inline-flex h-5 w-5 items-center justify-center rounded-full
                  ${isHoje ? 'bg-primary text-white' : isOutro ? 'text-muted-foreground/40' : 'text-foreground'}`}>
                  {format(dia, 'd')}
                </span>
                <div className="mt-1 space-y-0.5">
                  {cultosDia.map(c => (
                    <div key={c.id} className="text-[9px] leading-tight px-1 py-0.5 rounded font-medium truncate text-white"
                      style={{ background: stColor(c.service_type_id) }}>
                      {c.nome.split('—')[0].trim()}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TabCultos({ serviceTypes }: { serviceTypes: any[] }) {
  const [cultos, setCultos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filtro, setFiltro] = useState<FilterId>('semana_passada');
  const [view, setView] = useState<'calendar' | 'table'>('calendar');
  const [calMes, setCalMes] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCultos(await kpisApi.cultos.list({ limit: 200 })); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este culto?')) return;
    try { await kpisApi.cultos.remove(id); toast.success('Removido'); load(); } catch (e: any) { toast.error(e.message); }
  };

  const stColor = (id: string) => serviceTypes.find(s => s.id === id)?.color || '#6B7280';
  const filtered = view === 'table' ? filterCultos(cultos, filtro) : cultos;
  const listaCal = selectedDay
    ? cultos.filter(c => isSameDay(parseISO(c.data), selectedDay))
    : cultos.filter(c => isSameMonth(parseISO(c.data), calMes));

  // Chart data: frequência por semana
  const chartData = (() => {
    const map: Record<string, any> = {};
    cultos.slice().reverse().forEach(c => {
      const sem = format(startOfWeek(parseISO(c.data), { weekStartsOn: 0 }), 'dd/MM', { locale: ptBR });
      if (!map[sem]) map[sem] = { semana: sem, adulto: 0, kids: 0, decisoes: 0 };
      map[sem].adulto   += c.presencial_adulto || 0;
      map[sem].kids     += c.presencial_kids   || 0;
      map[sem].decisoes += (c.decisoes_presenciais || 0) + (c.decisoes_online || 0);
    });
    return Object.values(map).slice(-12);
  })();

  const CultoRow = ({ c, i }: { c: any; i: number }) => (
    <tr className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: stColor(c.service_type_id) }} />
          <span className="font-medium text-foreground text-xs leading-tight">{c.nome}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
        {format(parseISO(c.data), "dd/MM/yy", { locale: ptBR })}
      </td>
      <td className="px-4 py-3 font-mono tabular-nums text-sm">{(c.presencial_adulto || 0).toLocaleString()}</td>
      <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground text-sm">{c.presencial_kids || 0}</td>
      <td className="px-4 py-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          (c.taxa_ocupacao || 0) >= 80 ? 'bg-red-500/15 text-red-500'
          : (c.taxa_ocupacao || 0) >= 60 ? 'bg-amber-500/15 text-amber-500'
          : 'bg-emerald-500/15 text-emerald-500'
        }`}>
          {c.taxa_ocupacao ? `${c.taxa_ocupacao}%` : '—'}
        </span>
      </td>
      <td className="px-4 py-3 font-mono tabular-nums text-sm">
        {((c.decisoes_presenciais || 0) + (c.decisoes_online || 0)) || 0}
        <span className="text-muted-foreground text-[10px] ml-1">({c.decisoes_presenciais || 0}+{c.decisoes_online || 0})</span>
      </td>
      <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground text-sm">{c.online_pico ?? '—'}</td>
      <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground text-sm">
        {c.online_ds ? c.online_ds.toLocaleString() : (c.youtube_video_id ? <span className="text-amber-500 text-xs">Pendente</span> : '—')}
      </td>
      <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground text-sm">
        {c.online_ddus ? c.online_ddus.toLocaleString() : (c.online_ds ? <span className="text-amber-500 text-xs">Pendente</span> : '—')}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button onClick={() => { setEditing(c); setShowModal(true); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {/* View toggle */}
          <div className="flex rounded-xl border border-border overflow-hidden">
            <button onClick={() => setView('calendar')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${view === 'calendar' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Calendário
            </button>
            <button onClick={() => setView('table')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${view === 'table' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}>
              <List className="h-3.5 w-3.5" /> Tabela
            </button>
          </div>
          {/* Filters (table only) */}
          {view === 'table' && (
            <div className="flex items-center gap-1 ml-2">
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFiltro(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                    filtro === f.id ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:bg-muted'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button onClick={() => { setEditing(null); setShowModal(true); }} className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white gap-2 text-sm">
          <Plus className="h-4 w-4" /> Registrar Culto
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : view === 'calendar' ? (
        /* ── Calendar view ── */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div className="space-y-3">
            {/* Month nav */}
            <div className="flex items-center justify-between px-1">
              <button onClick={() => { setCalMes(m => subMonths(m, 1)); setSelectedDay(null); }}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-foreground capitalize">
                {format(calMes, 'MMMM yyyy', { locale: ptBR })}
              </span>
              <button onClick={() => { setCalMes(m => addMonths(m, 1)); setSelectedDay(null); }}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <CalendarioCultos
              cultos={cultos} serviceTypes={serviceTypes}
              calMes={calMes} onDayClick={setSelectedDay} selectedDay={selectedDay}
            />
          </div>

          {/* Sidebar list */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                {selectedDay ? format(selectedDay, "dd 'de' MMMM", { locale: ptBR }) : format(calMes, 'MMMM', { locale: ptBR })}
              </span>
              {selectedDay && (
                <button onClick={() => setSelectedDay(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {listaCal.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
                  <span className="text-xs">Nenhum culto neste período</span>
                </div>
              ) : listaCal.map(c => (
                <div key={c.id} className="p-3 hover:bg-muted/20 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0 mt-1" style={{ background: stColor(c.service_type_id) }} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{c.nome}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(parseISO(c.data), 'dd/MM', { locale: ptBR })} · {c.hora?.slice(0, 5)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => { setEditing(c); setShowModal(true); }} className="p-1 rounded hover:bg-muted"><Edit2 className="h-3 w-3 text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(c.id)} className="p-1 rounded hover:bg-red-500/10"><X className="h-3 w-3 text-muted-foreground hover:text-red-500" /></button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <div className="rounded-lg bg-muted/50 px-2 py-1 text-center">
                      <p className="text-xs font-bold tabular-nums">{(c.presencial_adulto || 0).toLocaleString()}</p>
                      <p className="text-[9px] text-muted-foreground">Adultos</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-2 py-1 text-center">
                      <p className="text-xs font-bold tabular-nums">{c.presencial_kids || 0}</p>
                      <p className="text-[9px] text-muted-foreground">Kids</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-2 py-1 text-center">
                      <p className="text-xs font-bold tabular-nums">{((c.decisoes_presenciais || 0) + (c.decisoes_online || 0))}</p>
                      <p className="text-[9px] text-muted-foreground">Decisões</p>
                    </div>
                  </div>
                  {c.taxa_ocupacao && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(c.taxa_ocupacao, 100)}%`,
                          background: c.taxa_ocupacao >= 80 ? '#EF4444' : c.taxa_ocupacao >= 60 ? '#F59E0B' : C.primary,
                        }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground tabular-nums">{c.taxa_ocupacao}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Table view ── */
        filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum culto neste período.</div>
        ) : (
          <div className="rounded-2xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Culto','Data','Adultos','Kids','Taxa Ocup.','Decisões','Online Pico','DS (D+1)','DDUS (D+7)',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>{filtered.map((c, i) => <CultoRow key={c.id} c={c} i={i} />)}</tbody>
            </table>
          </div>
        )
      )}

      {/* Chart */}
      {!loading && chartData.length > 1 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-5">Frequência por Semana (últimas 12 semanas)</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradAdulto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradKids" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.info} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.info} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="adulto" stroke={C.primary} strokeWidth={2} fill="url(#gradAdulto)" name="Adultos" />
              <Area type="monotone" dataKey="kids" stroke={C.info} strokeWidth={2} fill="url(#gradKids)" name="Kids" />
              <Bar dataKey="decisoes" fill={C.purple} name="Decisões" radius={[4, 4, 0, 0]} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {showModal && (
        <ModalRegistrarCulto
          serviceTypes={serviceTypes}
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── Tab: Batismos ─────────────────────────────────────────────────────────────

const STATUS_BATISMO = {
  pendente:   { label: 'Pendente',   color: C.warn },
  confirmado: { label: 'Confirmado', color: C.info },
  realizado:  { label: 'Realizado',  color: C.primary },
  cancelado:  { label: 'Cancelado',  color: C.danger },
};

function TabBatismos() {
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLista(await kpisApi.batismos.list()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try { await kpisApi.batismos.update(id, { status }); load(); } catch (e: any) { toast.error(e.message); }
    setUpdatingId(null);
  };

  const counts = lista.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(STATUS_BATISMO).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-1">
            <p className="text-2xl font-bold tabular-nums">{counts[k] || 0}</p>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: v.color }} />
              <p className="text-sm text-muted-foreground">{v.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{lista.length} inscrições no total</p>
        <Button onClick={() => setShowModal(true)} className="bg-[#6366F1] hover:bg-[#6366F1]/90 text-white gap-2 text-sm">
          <Droplets className="h-4 w-4" /> Inscrever Pessoa
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Nome','CPF','Nascimento','Contato','Origem','Status','Ações'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((b) => {
                const st = STATUS_BATISMO[b.status as keyof typeof STATUS_BATISMO];
                return (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{b.nome} {b.sobrenome}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{b.cpf ? `${b.cpf.slice(0,3)}.***.***-${b.cpf.slice(-2)}` : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{b.data_nascimento ? format(new Date(b.data_nascimento + 'T12:00:00'), 'dd/MM/yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{b.telefone || b.email || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">{b.origem}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: st.color + '20', color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {updatingId === b.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <select
                          value={b.status}
                          onChange={e => handleStatus(b.id, e.target.value)}
                          className="text-xs border border-border rounded-lg px-2 py-1 bg-input text-foreground outline-none"
                        >
                          {Object.entries(STATUS_BATISMO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
              {lista.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">Nenhuma inscrição ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <ModalBatismo onClose={() => setShowModal(false)} onSaved={load} />}
    </div>
  );
}

// ── Tab: Visão Geral ──────────────────────────────────────────────────────────

function SectionHeader({ title, onVerTudo }: { title: string; onVerTudo?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</p>
      {onVerTudo && (
        <button onClick={onVerTudo} className="flex items-center gap-1 text-xs text-[#00B39D] hover:underline font-medium">
          Ver detalhes <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function TabVisaoGeral({ data: dash, loading, onTab }: { data: any; loading: boolean; onTab: (t: string) => void }) {
  const [chartGran, setChartGran] = useState<'semana' | 'dia'>('semana');

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!dash) return null;

  const cultos: any[] = dash.cultos || [];
  const metas: any[] = dash.metas || [];
  const getMeta = (area: string, ind: string, campo: 'meta_6m' | 'meta_12m' | 'meta_24m' = 'meta_6m') =>
    metas.find(m => m.area === area && m.indicador === ind)?.[campo] ?? null;

  // Agregação completa do período
  const totalAdulto      = cultos.reduce((s: number, c: any) => s + (c.presencial_adulto || 0), 0);
  const totalKids        = cultos.reduce((s: number, c: any) => s + (c.presencial_kids   || 0), 0);
  const totalDecPresenc  = cultos.reduce((s: number, c: any) => s + (c.decisoes_presenciais || 0), 0);
  const totalDecOnline   = cultos.reduce((s: number, c: any) => s + (c.decisoes_online    || 0), 0);
  const totalDecisoes    = totalDecPresenc + totalDecOnline;
  const totalOnline      = cultos.reduce((s: number, c: any) => s + (c.online_pico || 0), 0);
  const totalDS          = cultos.reduce((s: number, c: any) => s + (c.online_ds    || 0), 0);
  const mediaOcup        = cultos.length ? Math.round(cultos.reduce((s: number, c: any) => s + (c.taxa_ocupacao || 0), 0) / cultos.length) : 0;
  const mediaVisitantes  = cultos.length ? Math.round(cultos.reduce((s: number, c: any) => s + (c.visitantes || 0), 0) / cultos.length) : null;
  const sublabel         = `${cultos.length} culto${cultos.length !== 1 ? 's' : ''} no período`;

  // Dados do gráfico com granularidade configurável
  const chartData = (() => {
    const map: Record<string, any> = {};
    cultos.forEach((c: any) => {
      const key = chartGran === 'semana'
        ? format(startOfWeek(new Date(c.data + 'T12:00:00'), { weekStartsOn: 0 }), 'dd/MM', { locale: ptBR })
        : format(new Date(c.data + 'T12:00:00'), 'dd/MM', { locale: ptBR });
      if (!map[key]) map[key] = { semana: key, adulto: 0, kids: 0, decisoes: 0, online: 0 };
      map[key].adulto   += c.presencial_adulto || 0;
      map[key].kids     += c.presencial_kids   || 0;
      map[key].decisoes += (c.decisoes_presenciais || 0) + (c.decisoes_online || 0);
      map[key].online   += c.online_pico || 0;
    });
    return Object.values(map);
  })();

  return (
    <div className="space-y-8">
      {/* ── Cultos / Frequência ── */}
      <div>
        <SectionHeader title="Cultos & Frequência" onVerTudo={() => onTab('cultos')} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Frequência Adultos" value={totalAdulto} icon={Users} color={C.primary}
            sublabel={sublabel} onClick={() => onTab('cultos')} />
          <KpiCard label="Frequência Kids" value={totalKids} icon={Baby} color={C.info}
            sublabel={sublabel} onClick={() => onTab('cultos')} />
          <KpiCard label="Taxa Ocupação Média" value={mediaOcup} unit="%" icon={Target} color={C.warn}
            sublabel="1.300 cadeiras" onClick={() => onTab('cultos')} />
          <KpiCard label="Decisões Totais" value={totalDecisoes} icon={TrendingUp} color={C.purple}
            sublabel={sublabel} onClick={() => onTab('cultos')} />
        </div>
      </div>

      {/* ── Online / YouTube ── */}
      <div>
        <SectionHeader title="Online & YouTube" onVerTudo={() => onTab('cultos')} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Pico Simultâneo" value={totalOnline || null} icon={Youtube} color="#EF4444"
            sublabel={sublabel} onClick={() => onTab('cultos')} />
          <KpiCard label="Views D+1 (soma)" value={totalDS || null} icon={TrendingUp} color={C.warn}
            sublabel="Às 10h do dia seguinte" onClick={() => onTab('cultos')} />
          <KpiCard label="Decisões Online" value={totalDecOnline} icon={CheckCircle2} color={C.primary}
            sublabel={sublabel} onClick={() => onTab('cultos')} />
          <KpiCard label="Decisões Presenciais" value={totalDecPresenc} icon={UserCheck} color={C.purple}
            sublabel={sublabel} onClick={() => onTab('cultos')} />
        </div>
      </div>

      {/* ── Batismos ── */}
      <div>
        <SectionHeader title="Batismos" onVerTudo={() => onTab('batismos')} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Pendentes" value={dash.batismos?.pendentes} icon={Droplets} color="#6366F1"
            onClick={() => onTab('batismos')} />
          <KpiCard label="Realizados — 1º Sem." value={dash.batismos?.realizados} icon={CheckCircle2} color={C.primary}
            meta={getMeta('ami', 'batismos_semestre1')} onClick={() => onTab('batismos')} />
          <KpiCard label="Meta Anual" value={dash.batismos?.realizados} icon={Target} color={C.warn}
            meta={getMeta('ami', 'batismos_semestre2', 'meta_12m')} onClick={() => onTab('batismos')} />
          <KpiCard label="Confirmados" value={dash.batismos?.confirmados ?? null} icon={CheckCircle2} color={C.info}
            onClick={() => onTab('batismos')} />
        </div>
      </div>

      {/* ── Voluntariado ── */}
      <div>
        <SectionHeader title="Voluntariado" onVerTudo={() => onTab('voluntariado')} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Voluntários Ativos" value={dash.voluntarios_ativos} icon={HandHeart} color={C.primary}
            meta={getMeta('voluntariado', 'voluntarios_ativos')} onClick={() => onTab('voluntariado')} />
          <KpiCard label="Meta 12 meses" value={dash.voluntarios_ativos} icon={Target} color={C.info}
            meta={getMeta('voluntariado', 'voluntarios_ativos', 'meta_12m')} onClick={() => onTab('voluntariado')} />
          <KpiCard label="Meta 24 meses" value={dash.voluntarios_ativos} icon={TrendingUp} color={C.warn}
            meta={getMeta('voluntariado', 'voluntarios_ativos', 'meta_24m')} onClick={() => onTab('voluntariado')} />
          <KpiCard label="% Igreja Servindo" value={null} unit="%" icon={Users} color={C.purple}
            meta={getMeta('voluntariado', 'pct_igreja_servindo')} onClick={() => onTab('voluntariado')} />
        </div>
      </div>

      {/* ── Grupos ── */}
      <div>
        <SectionHeader title="Grupos de Conexão" onVerTudo={() => onTab('grupos')} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Grupos Ativos" value={dash.total_grupos} icon={Users} color={C.primary}
            meta={getMeta('grupos', 'total_grupos')} onClick={() => onTab('grupos')} />
          <KpiCard label="Participantes" value={dash.grupos_participantes ?? null} icon={Users} color={C.info}
            meta={getMeta('grupos', 'participantes')} onClick={() => onTab('grupos')} />
          <KpiCard label="% Jovens em Grupos" value={null} unit="%" icon={TrendingUp} color={C.warn}
            meta={getMeta('grupos', 'pct_jovens_grupos')} onClick={() => onTab('grupos')} />
          <KpiCard label="Meta % Jovens (12m)" value={null} unit="%" icon={Target} color={C.purple}
            meta={getMeta('grupos', 'pct_jovens_grupos', 'meta_12m')} onClick={() => onTab('grupos')} />
        </div>
      </div>

      {/* ── Kids ── */}
      <div>
        <SectionHeader title="CBKids" onVerTudo={() => onTab('kids')} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Aceitações/mês" value={null} icon={Baby} color={C.primary}
            meta={getMeta('kids', 'aceitacoes')} onClick={() => onTab('kids')} />
          <KpiCard label="Batismos Kids/mês" value={null} icon={Droplets} color="#6366F1"
            meta={getMeta('kids', 'batismos')} onClick={() => onTab('kids')} />
          <KpiCard label="Famílias c/ Devocionais" value={null} icon={BookOpen} color={C.warn}
            meta={getMeta('kids', 'devocionais')} onClick={() => onTab('kids')} />
          <KpiCard label="Meta Devocionais 6m" value={null} icon={Target} color={C.info}
            meta={getMeta('kids', 'devocionais')} onClick={() => onTab('kids')} />
        </div>
      </div>

      {/* ── Integração ── */}
      <div>
        <SectionHeader title="Integração" onVerTudo={() => onTab('integracao')} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Visitantes/Culto" value={null} icon={DoorOpen} color={C.primary}
            sublabel="Semanal" onClick={() => onTab('integracao')} />
          <KpiCard label="Conversões/Culto" value={null} icon={TrendingUp} color={C.info}
            sublabel="Semanal" onClick={() => onTab('integracao')} />
          <KpiCard label="Voluntários na Recepção" value={null} icon={HandHeart} color={C.warn}
            sublabel="Semanal" onClick={() => onTab('integracao')} />
          <KpiCard label="% Voluntários Treinados" value={null} unit="%" icon={Target} color={C.purple}
            meta={getMeta('integracao', 'pct_voluntarios_treinados')} onClick={() => onTab('integracao')} />
        </div>
      </div>

      {/* ── Cuidados ── */}
      <div>
        <SectionHeader title="Cuidados" onVerTudo={() => onTab('cuidados')} />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard label="Pessoas Acompanhadas" value={null} icon={Heart} color={C.primary}
            sublabel="Mensal" onClick={() => onTab('cuidados')} />
          <KpiCard label="Aconselhamentos" value={null} icon={BookOpen} color={C.info}
            sublabel="Mensal" onClick={() => onTab('cuidados')} />
          <KpiCard label="Atendimentos Capelania" value={null} icon={HandHeart} color={C.warn}
            sublabel="Mensal" onClick={() => onTab('cuidados')} />
        </div>
      </div>

      {/* Integração — visitantes e conversões com dados reais */}
      <div>
        <SectionHeader title="Integração" onVerTudo={() => onTab('integracao')} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Visitantes/Culto (média)" value={mediaVisitantes} icon={DoorOpen} color={C.primary}
            sublabel={sublabel} onClick={() => onTab('integracao')} />
          <KpiCard label="Decisões/Culto (média)" value={cultos.length ? Math.round(totalDecisoes / cultos.length) : null} icon={TrendingUp} color={C.info}
            sublabel={sublabel} onClick={() => onTab('integracao')} />
          <KpiCard label="Visitantes (soma)" value={cultos.reduce((s: number, c: any) => s + (c.visitantes || 0), 0) || null} icon={Users} color={C.warn}
            sublabel={sublabel} onClick={() => onTab('integracao')} />
          <KpiCard label="Visitantes Online (soma)" value={cultos.reduce((s: number, c: any) => s + (c.visitantes_online || 0), 0) || null} icon={Youtube} color={C.purple}
            sublabel={sublabel} onClick={() => onTab('integracao')} />
        </div>
      </div>

      {/* Gráficos */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          {/* Area chart frequência */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm font-semibold text-foreground">Frequência por {chartGran === 'semana' ? 'Semana' : 'Dia'}</p>
              <div className="flex rounded-xl border border-border overflow-hidden text-xs">
                <button onClick={() => setChartGran('semana')}
                  className={`px-3 py-1.5 font-medium transition-colors ${chartGran === 'semana' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}>
                  Semana
                </button>
                <button onClick={() => setChartGran('dia')}
                  className={`px-3 py-1.5 font-medium transition-colors ${chartGran === 'dia' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}>
                  Dia
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gAdulto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.primary} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gKids" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.info} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={C.info} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="semana" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="adulto" stroke={C.primary} strokeWidth={2} fill="url(#gAdulto)" name="Adultos" dot={false} />
                <Area type="monotone" dataKey="kids" stroke={C.info} strokeWidth={2} fill="url(#gKids)" name="Kids" dot={false} />
                <Line type="monotone" dataKey="decisoes" stroke={C.purple} strokeWidth={2} dot={false} name="Decisões" strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Batismos donut */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold text-foreground mb-1">Batismos — Status</p>
            <p className="text-xs text-muted-foreground mb-4">Visão consolidada das inscrições</p>
            {(() => {
              const total = (dash?.batismos?.pendentes || 0) + (dash?.batismos?.realizados || 0);
              if (!total) return <div className="flex items-center justify-center h-44 text-muted-foreground text-xs">Sem dados</div>;
              const pieData = [
                { name: 'Realizados', value: dash?.batismos?.realizados || 0, color: C.primary },
                { name: 'Pendentes',  value: dash?.batismos?.pendentes  || 0, color: '#6366F1' },
              ];
              return (
                <div className="flex flex-col items-center gap-3">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={3} dataKey="value">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 text-xs">
                    {pieData.map(d => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                        <span className="text-muted-foreground">{d.name}: <strong className="text-foreground">{d.value}</strong></span>
                      </div>
                    ))}
                  </div>
                  <div className="w-full rounded-xl bg-muted/30 p-3 text-center">
                    <p className="text-xl font-bold tabular-nums">{total}</p>
                    <p className="text-xs text-muted-foreground">inscrições totais</p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Voluntariado ────────────────────────────────────────────────────────

function TabVoluntariado({ data: dash, loading }: { data: any; loading: boolean }) {
  const navigate = useNavigate();
  const metas: any[] = dash?.metas || [];
  const getMeta = (ind: string, campo: 'meta_6m' | 'meta_12m' | 'meta_24m' = 'meta_6m') =>
    metas.find(m => m.area === 'voluntariado' && m.indicador === ind)?.[campo] ?? null;

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Voluntários Ativos" value={dash?.voluntarios_ativos ?? null} icon={HandHeart} color={C.primary}
          meta={getMeta('voluntarios_ativos')} sublabel="Últimos 3 meses"
          onClick={() => navigate('/ministerial/voluntariado')} />
        <KpiCard label="Meta 6 meses" value={dash?.voluntarios_ativos ?? null} icon={Target} color={C.info}
          meta={getMeta('voluntarios_ativos')} onClick={() => navigate('/ministerial/voluntariado')} />
        <KpiCard label="Meta 12 meses" value={dash?.voluntarios_ativos ?? null} icon={TrendingUp} color={C.warn}
          meta={getMeta('voluntarios_ativos', 'meta_12m')} onClick={() => navigate('/ministerial/voluntariado')} />
        <KpiCard label="Meta 24 meses" value={dash?.voluntarios_ativos ?? null} icon={Users} color={C.purple}
          meta={getMeta('voluntarios_ativos', 'meta_24m')} onClick={() => navigate('/ministerial/voluntariado')} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="% Igreja Servindo" value={null} unit="%" icon={Users} color={C.primary}
          meta={getMeta('pct_igreja_servindo')} sublabel="Meta 6m: 30%" />
        <KpiCard label="% Igreja Servindo 12m" value={null} unit="%" icon={TrendingUp} color={C.info}
          meta={getMeta('pct_igreja_servindo', 'meta_12m')} sublabel="Meta 12m: 40%" />
        <KpiCard label="% Igreja Servindo 24m" value={null} unit="%" icon={Target} color={C.warn}
          meta={getMeta('pct_igreja_servindo', 'meta_24m')} sublabel="Meta 24m: 50%" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="% Escalados no Services" value={null} unit="%" icon={CheckCircle2} color={C.primary}
          meta={getMeta('pct_escalados_services')} sublabel="Meta contínua: 95%" />
        <KpiCard label="% Interessados Integrados" value={null} unit="%" icon={UserCheck} color={C.info}
          meta={getMeta('pct_interessados_integrados')} sublabel="Meta contínua: 90%" />
        <KpiCard label="% Desaparecidos Recuperados" value={null} unit="%" icon={Activity} color={C.purple}
          meta={getMeta('pct_desaparecidos_recuperados')} sublabel="Meta contínua: 60%" />
      </div>
      {/* Radial progress chart */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-4">Progresso das Metas de Voluntariado</p>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '6 meses', meta: getMeta('voluntarios_ativos'), atual: dash?.voluntarios_ativos, color: C.primary },
            { label: '12 meses', meta: getMeta('voluntarios_ativos', 'meta_12m'), atual: dash?.voluntarios_ativos, color: C.info },
            { label: '24 meses', meta: getMeta('voluntarios_ativos', 'meta_24m'), atual: dash?.voluntarios_ativos, color: C.warn },
          ].map(({ label, meta, atual, color }) => {
            const pct = meta && atual ? Math.min(Math.round(atual / meta * 100), 100) : 0;
            const radData = [{ value: pct }, { value: 100 - pct }];
            return (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className="relative">
                  <ResponsiveContainer width={100} height={100}>
                    <PieChart>
                      <Pie data={radData} cx="50%" cy="50%" innerRadius={32} outerRadius={44} startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
                        <Cell fill={color} />
                        <Cell fill="var(--muted)" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold" style={{ color }}>{pct}%</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-foreground">Meta {label}</p>
                  <p className="text-[10px] text-muted-foreground">{atual ?? '—'} / {meta ?? '—'}</p>
                </div>
              </div>
            );
          })}
        </div>
        <Button onClick={() => navigate('/ministerial/voluntariado')} className="mt-4 gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
          <HandHeart className="h-4 w-4" /> Ir para Voluntariado
        </Button>
      </div>
    </div>
  );
}

// ── Tab: Grupos ───────────────────────────────────────────────────────────────

function TabGrupos({ data: dash, loading }: { data: any; loading: boolean }) {
  const navigate = useNavigate();
  const metas: any[] = dash?.metas || [];
  const getMeta = (ind: string, campo: 'meta_6m' | 'meta_12m' = 'meta_6m') =>
    metas.find(m => m.area === 'grupos' && m.indicador === ind)?.[campo] ?? null;

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Grupos Ativos" value={dash?.total_grupos ?? null} icon={Users} color={C.primary}
          meta={getMeta('total_grupos')} onClick={() => navigate('/grupos')} />
        <KpiCard label="Participantes em Grupos" value={dash?.grupos_participantes ?? null} icon={Users} color={C.info}
          meta={getMeta('participantes')} onClick={() => navigate('/grupos')} />
        <KpiCard label="% Jovens em Grupos" value={null} unit="%" icon={TrendingUp} color={C.warn}
          meta={getMeta('pct_jovens_grupos')} sublabel="Meta 6m: 50%" />
        <KpiCard label="% Jovens — Meta 12m" value={null} unit="%" icon={Target} color={C.purple}
          meta={getMeta('pct_jovens_grupos', 'meta_12m')} sublabel="Meta 12m: 70%" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="% Igreja em Grupos (+30% anual)" value={null} unit="%" icon={TrendingUp} color={C.primary}
          sublabel="Meta 2026: aumentar 30% ao ano" />
        <KpiCard label="% Igreja em Grupos (2 anos)" value={null} unit="%" icon={Target} color={C.info}
          sublabel="Meta 2 anos: 50%" />
        <KpiCard label="% Igreja em Grupos (5 anos)" value={null} unit="%" icon={BookOpen} color={C.warn}
          sublabel="Meta 5 anos: 70%" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground mb-4">
          Visualize todos os grupos, líderes, participantes e horários no módulo de Grupos de Conexão.
        </p>
        <Button onClick={() => navigate('/grupos')} className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
          <Users className="h-4 w-4" /> Ir para Grupos
        </Button>
      </div>
    </div>
  );
}

// ── Tab: Kids ─────────────────────────────────────────────────────────────────

function TabKids({ data: dash, loading }: { data: any; loading: boolean }) {
  const metas: any[] = dash?.metas || [];
  const getMeta = (ind: string, campo: 'meta_6m' | 'meta_12m' = 'meta_6m') =>
    metas.find(m => m.area === 'kids' && m.indicador === ind)?.[campo] ?? null;

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Aceitações/mês" value={null} icon={Baby} color={C.primary}
          meta={getMeta('aceitacoes')} sublabel={`Base: ${metas.find(m => m.area === 'kids' && m.indicador === 'aceitacoes')?.valor_base ?? 8}/mês`} />
        <KpiCard label="Batismos Kids/mês" value={null} icon={Droplets} color="#6366F1"
          meta={getMeta('batismos')} sublabel={`Base: ${metas.find(m => m.area === 'kids' && m.indicador === 'batismos')?.valor_base ?? 3}/mês`} />
        <KpiCard label="Famílias c/ Devocionais" value={null} icon={BookOpen} color={C.warn}
          meta={getMeta('devocionais')} sublabel={`Base: ${metas.find(m => m.area === 'kids' && m.indicador === 'devocionais')?.valor_base ?? 10} famílias`} />
        <KpiCard label="Meta Devocionais 6m" value={null} icon={Target} color={C.info}
          meta={getMeta('devocionais')} sublabel="Meta 6m: 50 famílias" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Saída Voluntários Kids" value={null} icon={Activity} color={C.danger}
          sublabel="Base: 7 saídas/ano (jan–out/25)" />
        <KpiCard label="Meta Redução Saídas" value={null} icon={Target} color={C.warn}
          sublabel="Meta: -30% (máx. 4,9/ano)" />
        <KpiCard label="Aceitações +25%/mês" value={null} unit="%" icon={TrendingUp} color={C.primary}
          meta={getMeta('pct_aceitacoes')} sublabel="Crescimento mensal" />
        <KpiCard label="Batismos +67%/mês" value={null} unit="%" icon={Droplets} color="#6366F1"
          meta={getMeta('pct_batismos')} sublabel="Crescimento mensal" />
      </div>
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <Baby className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">Registro manual de dados Kids</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          Os dados de aceitações, batismos e devocionais do CBKids ainda precisam de integração com o sistema de Kids. Por enquanto, registre manualmente.
        </p>
      </div>
    </div>
  );
}

// ── Tab: AMI & Bridge ─────────────────────────────────────────────────────────

function TabAMI({ data: dash, loading }: { data: any; loading: boolean }) {
  const metas: any[] = dash?.metas || [];
  const getMeta = (area: string, ind: string, campo: 'meta_6m' | 'meta_12m' = 'meta_6m') =>
    metas.find(m => m.area === area && m.indicador === ind)?.[campo] ?? null;

  const cultos: any[] = (dash?.cultos || []).filter((c: any) =>
    c.nome?.toLowerCase().includes('ami') || c.nome?.toLowerCase().includes('bridge') || c.nome?.toLowerCase().includes('sábado')
  );
  const totalAMI = cultos.slice(-4).reduce((s: number, c: any) => s + (c.presencial_adulto || 0), 0);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Freq. AMI + Bridge" value={totalAMI || null} icon={Users} color={C.primary}
          meta={getMeta('ami_bridge', 'frequencia_cultos')} sublabel="Últimos 4 cultos" />
        <KpiCard label="Batismos 1º Sem." value={dash?.batismos?.realizados ?? null} icon={Droplets} color="#6366F1"
          meta={getMeta('ami', 'batismos_semestre1')} />
        <KpiCard label="Batismos Anual" value={dash?.batismos?.realizados ?? null} icon={CheckCircle2} color={C.primary}
          meta={getMeta('ami', 'batismos_semestre2', 'meta_12m')} />
        <KpiCard label="Inscritos Next" value={null} icon={ArrowRight} color={C.warn}
          meta={getMeta('ami', 'next_inscritos')} sublabel="Jornada de membros" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Escola de Discípulos" value={null} icon={BookOpen} color={C.info}
          meta={getMeta('ami', 'escola_discipulos')} />
        <KpiCard label="Aumento Escola (6m)" value={null} unit="%" icon={TrendingUp} color={C.primary}
          meta={getMeta('ami_bridge', 'pct_escola_discipulos')} sublabel="Meta: +50% participantes" />
        <KpiCard label="Aumento Freq. (6m)" value={null} unit="%" icon={Activity} color={C.warn}
          meta={getMeta('ami_bridge', 'pct_aumento_frequencia')} sublabel="Meta: +15%" />
        <KpiCard label="Aumento Freq. (12m)" value={null} unit="%" icon={Target} color={C.purple}
          meta={getMeta('ami_bridge', 'pct_aumento_frequencia', 'meta_12m')} sublabel="Meta: +30%" />
      </div>
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm font-medium text-foreground">Dados de Next e Escola de Discípulos</p>
        <p className="text-xs text-muted-foreground mt-1">Estes indicadores precisam de integração com o módulo de trilha de membros.</p>
      </div>
    </div>
  );
}

// ── Tab: Integração ───────────────────────────────────────────────────────────

function TabIntegracao({ data: dash, loading }: { data: any; loading: boolean }) {
  const metas: any[] = dash?.metas || [];
  const getMeta = (ind: string, campo: 'meta_6m' | 'meta_12m' = 'meta_6m') =>
    metas.find(m => m.area === 'integracao' && m.indicador === ind)?.[campo] ?? null;

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const cultos: any[] = dash?.cultos || [];
  const n = cultos.length || 1;
  const mediaVisit  = cultos.length ? Math.round(cultos.reduce((s: number, c: any) => s + (c.visitantes || 0), 0) / n) : null;
  const mediaConv   = cultos.length ? Math.round(cultos.reduce((s: number, c: any) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0) / n) : null;
  const somaVisit   = cultos.reduce((s: number, c: any) => s + (c.visitantes || 0), 0) || null;
  const somaVisitOL = cultos.reduce((s: number, c: any) => s + (c.visitantes_online || 0), 0) || null;
  const sublabel    = `${cultos.length} cultos no período`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Visitantes/Culto (média)" value={mediaVisit} icon={DoorOpen} color={C.primary} sublabel={sublabel} />
        <KpiCard label="Conversões/Culto (média)" value={mediaConv} icon={TrendingUp} color={C.info} sublabel={sublabel} />
        <KpiCard label="Visitantes (soma período)" value={somaVisit} icon={Users} color={C.warn} sublabel={sublabel} />
        <KpiCard label="Visitantes Online (soma)" value={somaVisitOL} icon={Youtube} color={C.purple} sublabel={sublabel} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="% Voluntários Treinados" value={null} unit="%" icon={Target} color={C.primary}
          meta={getMeta('pct_voluntarios_treinados')} sublabel="Meta: 90%" />
        <KpiCard label="Abordagens por Voluntário" value={null} icon={UserCheck} color={C.info}
          meta={getMeta('abordagens_por_voluntario')} sublabel="Meta: 5 pessoas/culto" />
        <KpiCard label="Encontros 1x1 Mensal" value={null} icon={Users} color={C.info}
          meta={getMeta('encontros_1x1')} sublabel="Meta: 1 encontro/mês por dupla" />
        <KpiCard label="Participação Semestral" value={null} icon={CheckCircle2} color={C.warn}
          sublabel="Meta: cada voluntário 1x/semestre" />
        <KpiCard label="Questionários Trimestrais" value={null} icon={Activity} color={C.purple}
          sublabel="Meta: aplicar trimestralmente" />
      </div>
    </div>
  );
}

// ── Tab: Cuidados ─────────────────────────────────────────────────────────────

function useCuidadosMensal() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: rows } = await supabase.from('vw_cuidados_mensal' as any).select('*').limit(1);
        if (alive) setData(rows?.[0] ?? null);
      } catch { /* noop */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);
  return { data, loading };
}

function TabCuidados({ loading }: { data: any; loading: boolean }) {
  const { data: cui, loading: cuiLoading } = useCuidadosMensal();
  if (loading || cuiLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const c = cui || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Pessoas Acompanhadas" value={c.pessoas_acompanhadas ?? 0} icon={Heart} color={C.primary} sublabel="Mensal" />
        <KpiCard label="Aconselhamentos" value={c.aconselhamentos ?? 0} icon={BookOpen} color={C.info} sublabel="Mensal" />
        <KpiCard label="Atendimentos Capelania" value={c.capelania ?? 0} icon={HandHeart} color={C.warn} sublabel="Mensal" />
        <KpiCard label="Encontros Jornada 180" value={c.jornada180_encontros ?? 0} icon={Users} color={C.purple} sublabel="Mensal" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Convertidos Atendidos Pós-Culto" value={c.convertidos_atendidos ?? 0} icon={UserCheck} color={C.primary} sublabel="Mensal" />
        <KpiCard label="Convertidos Cadastrados" value={c.convertidos_cadastrados ?? 0} icon={CheckCircle2} color={C.info} sublabel="Mensal" />
        <KpiCard label="Devocionais Enviados" value={null} icon={BookOpen} color={C.warn} sublabel="Diário — Jornada 180" />
        <KpiCard label="Papo com o Pastor (staff)" value={null} icon={Activity} color={C.purple} sublabel="Mensal" />
      </div>
    </div>
  );
}

// ── Tab: CBA ──────────────────────────────────────────────────────────────────

function TabCBA({ loading }: { data: any; loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Conversões (trimestral)" value={null} icon={TrendingUp} color={C.primary} sublabel="Acompanhamento trimestral" />
        <KpiCard label="Reuniões Realizadas" value={null} icon={Building2} color={C.info} sublabel="Acompanhamento trimestral" />
        <KpiCard label="Participantes nas Reuniões" value={null} icon={Users} color={C.warn} sublabel="Acompanhamento trimestral" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-2">Sobre a CBA</p>
        <p className="text-sm text-muted-foreground mb-4">
          A Comunidade Batista Associada apoia igrejas estagnadas e decadentes a retornarem ao propósito da Igreja,
          e apoia o desenvolvimento de pastores para o crescimento do Reino.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'N° de conversões', freq: 'Trimestral' },
            { label: 'N° de reuniões realizadas', freq: 'Trimestral' },
            { label: 'N° de participantes', freq: 'Trimestral' },
          ].map(i => (
            <div key={i.label} className="rounded-xl bg-muted/30 p-3">
              <p className="text-sm font-medium text-foreground">{i.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{i.freq}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Online (YouTube / transmissão) ──────────────────────────────────────

function statusColetaCulto(c: any): { label: string; color: string } {
  if (!c.youtube_video_id) return { label: 'Sem vídeo', color: '#6B7280' };
  if (c.online_ds && c.online_ddus) return { label: 'Coletado', color: '#00B39D' };
  const dataCulto = new Date(c.data + 'T12:00:00');
  const diasPassados = Math.floor((Date.now() - dataCulto.getTime()) / 86400000);
  if (diasPassados >= 7 && !c.online_ddus) return { label: 'Pendente D+7', color: '#F59E0B' };
  if (diasPassados >= 1 && !c.online_ds) return { label: 'Pendente D+1', color: '#F59E0B' };
  return { label: 'Aguardando', color: '#3B82F6' };
}

function ModalEditarOnline({ culto, serviceTypes, onClose, onSaved }: {
  culto: any; serviceTypes: any[]; onClose: () => void; onSaved: () => void;
}) {
  return <ModalRegistrarCulto serviceTypes={serviceTypes} onClose={onClose} onSaved={onSaved} editing={culto} />;
}

function TabOnline({ data: dash, loading, serviceTypes, onSync, syncing, onReload }: {
  data: any; loading: boolean; serviceTypes: any[];
  onSync: () => void; syncing: boolean; onReload: () => void;
}) {
  const [editing, setEditing] = useState<any>(null);
  const [ytStatus, setYtStatus] = useState<{ apiKeyConfigured: boolean; lastSync: string | null } | null>(null);
  const [creatingCultos, setCreatingCultos] = useState(false);

  useEffect(() => {
    kpisApi.youtubeStatus().then(setYtStatus).catch(() => setYtStatus(null));
  }, []);

  const handleAutoCreate = async () => {
    setCreatingCultos(true);
    try {
      const r = await kpisApi.cultosAutoCreate(2);
      if (r.created > 0) {
        toast.success(`${r.created} culto(s) criado(s) (${r.skipped} já existiam).`);
        onReload();
      } else {
        toast.info(`Nenhum culto novo. ${r.skipped} já existiam no período.`);
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar cultos');
    }
    setCreatingCultos(false);
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const cultos: any[] = (dash?.cultos || []).slice().sort((a: any, b: any) =>
    (b.data || '').localeCompare(a.data || ''),
  );

  const totalPico = cultos.reduce((s, c) => s + (c.online_pico || 0), 0);
  const totalDS   = cultos.reduce((s, c) => s + (c.online_ds || 0), 0);
  const totalDDUS = cultos.reduce((s, c) => s + (c.online_ddus || 0), 0);
  const totalDecOnline = cultos.reduce((s, c) => s + (c.decisoes_online || 0), 0);
  const cultosComVideo = cultos.filter(c => c.youtube_video_id).length;
  const cultosPendentes = cultos.filter(c => {
    const st = statusColetaCulto(c);
    return st.label.startsWith('Pendente');
  }).length;
  const sublabel = `${cultos.length} culto${cultos.length !== 1 ? 's' : ''} no período`;

  // Gráfico evolução (cronológico)
  const chartData = cultos.slice().reverse().map(c => ({
    data: format(new Date(c.data + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
    pico: c.online_pico || 0,
    ds: c.online_ds || 0,
    ddus: c.online_ddus || 0,
  }));

  return (
    <div className="space-y-6">
      {/* Banner status YouTube API */}
      {ytStatus && !ytStatus.apiKeyConfigured && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
          <Youtube className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-foreground">YouTube API não configurada</p>
            <p className="text-muted-foreground mt-0.5">
              A variável <code className="text-xs bg-muted px-1 py-0.5 rounded">YOUTUBE_API_KEY</code> não está definida no servidor.
              A sincronização automática de views (D+1 e D+7) está desativada. Os campos de pico e views ainda podem ser preenchidos manualmente.
            </p>
          </div>
        </div>
      )}

      {/* Banner: cultos recentes (últimas 48h) sem youtube_video_id */}
      {(() => {
        const limite = Date.now() - 2 * 86400000;
        const recentesSemVideo = cultos.filter(c => {
          if (c.youtube_video_id) return false;
          if (c.has_online_stream === false) return false; // ignora cultos sem online (ex.: Bridge)
          const t = new Date(c.data + 'T12:00:00').getTime();
          return t >= limite && t <= Date.now();
        });
        if (recentesSemVideo.length === 0) return null;
        return (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
            <Activity className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-foreground">{recentesSemVideo.length} culto(s) recente(s) sem vídeo do YouTube</p>
              <p className="text-muted-foreground mt-0.5">
                Sem o ID do vídeo, a coleta D+1 não acontece amanhã às 10h. Vincule agora:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {recentesSemVideo.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setEditing(c)}
                    className="text-xs font-medium px-2.5 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  >
                    {c.nome} →
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header da aba com botões */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Métricas de Transmissão Online</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ytStatus?.lastSync
              ? `Última sincronização: ${format(new Date(ytStatus.lastSync), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
              : 'Sem registros de sincronização'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleAutoCreate} disabled={creatingCultos} variant="outline" className="gap-2">
            {creatingCultos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creatingCultos ? 'Criando...' : 'Criar cultos da semana'}
          </Button>
          <Button onClick={onSync} disabled={syncing || !ytStatus?.apiKeyConfigured} className="gap-2 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </Button>
        </div>
      </div>

      {/* Cards agregados */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Pico simultâneo (soma)" value={totalPico || null} icon={Youtube} color="#EF4444" sublabel={sublabel} />
        <KpiCard label="Views D+1 (soma)" value={totalDS || null} icon={TrendingUp} color={C.warn} sublabel="24h após o culto" />
        <KpiCard label="Views D+7 (soma)" value={totalDDUS || null} icon={TrendingUp} color={C.purple} sublabel="7 dias após o culto" />
        <KpiCard label="Decisões Online" value={totalDecOnline || null} icon={CheckCircle2} color={C.primary} sublabel={sublabel} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Cultos com vídeo" value={cultosComVideo} icon={Youtube} color={C.info} sublabel={`de ${cultos.length} cultos`} />
        <KpiCard label="Pendentes de coleta" value={cultosPendentes} icon={Activity} color={C.warn} sublabel="Aguardando D+1 / D+7" />
        <KpiCard label="Média Pico/culto" value={cultos.length ? Math.round(totalPico / cultos.length) : null} icon={Activity} color={C.purple} sublabel={sublabel} />
        <KpiCard label="Média D+7/culto" value={cultosComVideo ? Math.round(totalDDUS / Math.max(cultosComVideo, 1)) : null} icon={TrendingUp} color={C.primary} sublabel="Cultos com vídeo" />
      </div>

      {/* Gráfico de evolução */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Evolução por culto — Pico, D+1 e D+7</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="data" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="pico" stroke="#EF4444" strokeWidth={2} name="Pico simultâneo" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="ds" stroke={C.warn} strokeWidth={2} name="Views D+1" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="ddus" stroke={C.purple} strokeWidth={2} name="Views D+7" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela de cultos online */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Cultos online</p>
          <span className="text-xs text-muted-foreground">{cultos.length} cultos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Culto</th>
                <th className="px-4 py-3 text-left font-medium">Data</th>
                <th className="px-4 py-3 text-left font-medium">Vídeo</th>
                <th className="px-4 py-3 text-right font-medium">Pico</th>
                <th className="px-4 py-3 text-right font-medium">D+1</th>
                <th className="px-4 py-3 text-right font-medium">D+7</th>
                <th className="px-4 py-3 text-right font-medium">Decisões</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {cultos.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Nenhum culto no período.</td></tr>
              )}
              {cultos.map(c => {
                const st = statusColetaCulto(c);
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-foreground">{c.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(new Date(c.data + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3">
                      {c.youtube_video_id ? (
                        <a
                          href={`https://youtu.be/${c.youtube_video_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00B39D] hover:underline inline-flex items-center gap-1 text-xs"
                        >
                          <Youtube className="h-3.5 w-3.5" /> Abrir
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.online_pico?.toLocaleString('pt-BR') || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.online_ds?.toLocaleString('pt-BR') || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.online_ddus?.toLocaleString('pt-BR') || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.decisoes_online?.toLocaleString('pt-BR') || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: st.color }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(c)}
                        className="text-xs text-[#00B39D] hover:underline inline-flex items-center gap-1"
                      >
                        <Edit2 className="h-3 w-3" /> Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ModalEditarOnline
          culto={editing}
          serviceTypes={serviceTypes}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onReload(); }}
        />
      )}
    </div>
  );
}

// ── Main KPIs page ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'geral',        label: 'Visão Geral' },
  { id: 'cultos',       label: 'Cultos' },
  { id: 'online',       label: 'Online' },
  { id: 'batismos',     label: 'Batismos' },
  { id: 'voluntariado', label: 'Voluntariado' },
  { id: 'grupos',       label: 'Grupos' },
  { id: 'kids',         label: 'CBKids' },
  { id: 'ami',          label: 'AMI & Bridge' },
  { id: 'integracao',   label: 'Integração' },
  { id: 'cuidados',     label: 'Cuidados' },
  { id: 'cba',          label: 'CBA' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function KPIs() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('geral');
  const [dash, setDash] = useState<any>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [syncingYt, setSyncingYt] = useState(false);
  const [periodo, setPeriodo] = useState(12);
  const [serviceTypeFilter, setServiceTypeFilter] = useState('');

  const loadDash = useCallback(async () => {
    setDashLoading(true);
    try { setDash(await kpisApi.dashboard(periodo)); } catch {}
    setDashLoading(false);
  }, [periodo]);

  const filteredDash = useMemo(() => {
    if (!dash) return dash;
    if (!serviceTypeFilter) return dash;
    const cultos = serviceTypeFilter === 'domingo'
      ? (dash.cultos || []).filter((c: any) => c.service_type_name?.toLowerCase().startsWith('domingo'))
      : (dash.cultos || []).filter((c: any) => c.service_type_id === serviceTypeFilter);
    return { ...dash, cultos };
  }, [dash, serviceTypeFilter]);

  useEffect(() => {
    loadDash();
    kpisApi.serviceTypes().then(setServiceTypes).catch(() => {});
  }, [loadDash]);

  const handleYtSync = async () => {
    setSyncingYt(true);
    try {
      const r = await kpisApi.youtubeSync();
      toast.success(`YouTube: ${r.synced} vídeo(s) sincronizado(s)`);
    } catch (e: any) { toast.error(e.message || 'Erro na sincronização'); }
    setSyncingYt(false);
  };

  return (
    <div className="space-y-6 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">KPIs & Indicadores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Metas e Indicadores 2026 — CBRio</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={periodo}
            onChange={e => setPeriodo(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-border bg-input text-foreground text-sm outline-none focus:border-[#00B39D] transition-colors"
          >
            <option value={4}>Últimas 4 semanas</option>
            <option value={8}>Últimas 8 semanas</option>
            <option value={12}>Últimas 12 semanas</option>
            <option value={24}>Últimas 24 semanas</option>
            <option value={52}>Último ano</option>
          </select>
          <select
            value={serviceTypeFilter}
            onChange={e => setServiceTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-input text-foreground text-sm outline-none focus:border-[#00B39D] transition-colors"
          >
            <option value="">Todos os cultos</option>
            <option value="domingo">Domingos</option>
            {serviceTypes.map(st => (
              <option key={st.id} value={st.id}>{st.name}</option>
            ))}
          </select>
          {isAdmin && (
            <Button variant="outline" onClick={handleYtSync} disabled={syncingYt} className="gap-2 text-sm">
              {syncingYt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4 text-red-500" />}
              Sync YouTube
            </Button>
          )}
          <Link to="/kpis/guia">
            <Button variant="outline" className="gap-2 text-sm">
              <FileText className="h-4 w-4" /> Guia de Coleta
            </Button>
          </Link>
          <Button variant="outline" onClick={loadDash} className="gap-2 text-sm">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-[#00B39D] text-[#00B39D]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'geral'        && <TabVisaoGeral data={filteredDash} loading={dashLoading} onTab={(t) => setTab(t as TabId)} />}
      {tab === 'cultos'       && <TabCultos serviceTypes={serviceTypes} />}
      {tab === 'online'       && <TabOnline data={filteredDash} loading={dashLoading} serviceTypes={serviceTypes} onSync={handleYtSync} syncing={syncingYt} onReload={loadDash} />}
      {tab === 'batismos'     && <TabBatismos />}
      {tab === 'voluntariado' && <TabVoluntariado data={filteredDash} loading={dashLoading} />}
      {tab === 'grupos'       && <TabGrupos data={filteredDash} loading={dashLoading} />}
      {tab === 'kids'         && <TabKids data={filteredDash} loading={dashLoading} />}
      {tab === 'ami'          && <TabAMI data={filteredDash} loading={dashLoading} />}
      {tab === 'integracao'   && <TabIntegracao data={filteredDash} loading={dashLoading} />}
      {tab === 'cuidados'     && <TabCuidados data={filteredDash} loading={dashLoading} />}
      {tab === 'cba'          && <TabCBA data={filteredDash} loading={dashLoading} />}
    </div>
  );
}
