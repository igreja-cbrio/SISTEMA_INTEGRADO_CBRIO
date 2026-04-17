import { useState, useEffect, useCallback } from 'react';
import { kpis as kpisApi } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { format, subWeeks, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Users, TrendingUp, TrendingDown, Droplets, Youtube,
  Plus, RefreshCw, ChevronRight, AlertTriangle, CheckCircle2,
  Target, Edit2, Save, X, Loader2, Calendar, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

function KpiCard({ label, value, meta, unit = '', icon: Icon, color = C.primary, sublabel }: {
  label: string; value: number | null; meta?: number | null; unit?: string;
  icon: any; color?: string; sublabel?: string;
}) {
  const status = kpiStatus(value, meta ?? null);
  const pct = meta && value !== null ? Math.round(value / meta * 100) : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: color + '20' }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        {meta && <StatusDot status={status} />}
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

function TabCultos({ serviceTypes }: { serviceTypes: any[] }) {
  const [cultos, setCultos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCultos(await kpisApi.cultos.list({ limit: 50 })); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este culto?')) return;
    try { await kpisApi.cultos.remove(id); toast.success('Removido'); load(); } catch (e: any) { toast.error(e.message); }
  };

  const stColor = (id: string) => serviceTypes.find(s => s.id === id)?.color || '#6B7280';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{cultos.length} cultos registrados</p>
        <Button onClick={() => { setEditing(null); setShowModal(true); }} className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white gap-2 text-sm">
          <Plus className="h-4 w-4" /> Registrar Culto
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : cultos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhum culto registrado ainda.</div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Culto','Data','Presencial Adulto','Kids','Taxa Ocup.','Decisões','Online Pico','DS (D+1)','DDUS (D+7)',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cultos.map((c, i) => (
                <tr key={c.id} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: stColor(c.service_type_id) }} />
                      <span className="font-medium text-foreground text-xs leading-tight">{c.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {format(new Date(c.data + 'T12:00:00'), "dd/MM/yy", { locale: ptBR })}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">{(c.presencial_adulto || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">{c.presencial_kids || 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      (c.taxa_ocupacao || 0) >= 80 ? 'bg-red-500/15 text-red-500'
                      : (c.taxa_ocupacao || 0) >= 60 ? 'bg-amber-500/15 text-amber-500'
                      : 'bg-emerald-500/15 text-emerald-500'
                    }`}>
                      {c.taxa_ocupacao ? `${c.taxa_ocupacao}%` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {((c.decisoes_presenciais || 0) + (c.decisoes_online || 0)) || 0}
                    <span className="text-muted-foreground text-[10px] ml-1">({c.decisoes_presenciais || 0}+{c.decisoes_online || 0})</span>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">{c.online_pico ?? '—'}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">
                    {c.online_ds ? c.online_ds.toLocaleString() : (c.youtube_video_id ? <span className="text-amber-500 text-xs">Pendente</span> : '—')}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">
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
              ))}
            </tbody>
          </table>
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

function TabVisaoGeral({ data: dash, loading }: { data: any; loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!dash) return null;

  const cultos: any[] = dash.cultos || [];

  // Agrupar por semana para o gráfico de linha
  const semanas = cultos.reduce((acc: any, c: any) => {
    const semana = format(startOfWeek(new Date(c.data + 'T12:00:00'), { weekStartsOn: 0 }), 'dd/MM', { locale: ptBR });
    if (!acc[semana]) acc[semana] = { semana, adulto: 0, kids: 0, decisoes: 0, online: 0 };
    acc[semana].adulto   += c.presencial_adulto || 0;
    acc[semana].kids     += c.presencial_kids   || 0;
    acc[semana].decisoes += (c.decisoes_presenciais || 0) + (c.decisoes_online || 0);
    acc[semana].online   += c.online_pico || 0;
    return acc;
  }, {});
  const chartData = Object.values(semanas).slice(-12);

  // Últimos 4 cultos para cards
  const ultCultos = [...cultos].reverse().slice(0, 4);
  const totalAdulto  = ultCultos.reduce((s, c) => s + (c.presencial_adulto || 0), 0);
  const totalKids    = ultCultos.reduce((s, c) => s + (c.presencial_kids   || 0), 0);
  const totalDecisoes = ultCultos.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
  const mediaOcup    = ultCultos.length ? Math.round(ultCultos.reduce((s, c) => s + (c.taxa_ocupacao || 0), 0) / ultCultos.length) : 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Frequência Adultos" value={totalAdulto} icon={Users} color={C.primary}
          sublabel={`Últimos ${ultCultos.length} cultos`} />
        <KpiCard label="Frequência Kids" value={totalKids} icon={Users} color={C.info}
          sublabel={`Últimos ${ultCultos.length} cultos`} />
        <KpiCard label="Taxa Ocupação Média" value={mediaOcup} unit="%" icon={Target} color={C.warn}
          sublabel="1.300 cadeiras" />
        <KpiCard label="Decisões Totais" value={totalDecisoes} icon={TrendingUp} color={C.purple}
          sublabel={`Últimos ${ultCultos.length} cultos`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Batismos Pendentes" value={dash.batismos?.pendentes} icon={Droplets} color="#6366F1" />
        <KpiCard label="Batismos Realizados" value={dash.batismos?.realizados} icon={CheckCircle2} color={C.primary}
          meta={dash.metas?.find((m: any) => m.indicador === 'batismos_semestre1')?.meta_6m} />
        <KpiCard label="Voluntários Ativos" value={dash.voluntarios_ativos} icon={Users} color={C.info}
          meta={dash.metas?.find((m: any) => m.indicador === 'voluntarios_ativos')?.meta_6m} />
        <KpiCard label="Grupos Ativos" value={dash.total_grupos} icon={Users} color={C.warn} />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-5">Evolução de Frequência por Semana</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="adulto" stroke={C.primary} strokeWidth={2} dot={false} name="Adultos" />
              <Line type="monotone" dataKey="kids"   stroke={C.info}    strokeWidth={2} dot={false} name="Kids" />
              <Line type="monotone" dataKey="decisoes" stroke={C.purple} strokeWidth={2} dot={false} name="Decisões" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Por tipo de culto */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-5">Frequência por Semana</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="adulto" fill={C.primary} name="Adultos" radius={[4,4,0,0]} />
              <Bar dataKey="kids"   fill={C.info}    name="Kids"    radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Main KPIs page ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'geral',    label: 'Visão Geral' },
  { id: 'cultos',   label: 'Cultos' },
  { id: 'batismos', label: 'Batismos' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function KPIs() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<TabId>('geral');
  const [dash, setDash] = useState<any>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [syncingYt, setSyncingYt] = useState(false);
  const [periodo, setPeriodo] = useState(12);

  const loadDash = useCallback(async () => {
    setDashLoading(true);
    try { setDash(await kpisApi.dashboard(periodo)); } catch {}
    setDashLoading(false);
  }, [periodo]);

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
          {isAdmin && (
            <Button variant="outline" onClick={handleYtSync} disabled={syncingYt} className="gap-2 text-sm">
              {syncingYt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4 text-red-500" />}
              Sync YouTube
            </Button>
          )}
          <Button variant="outline" onClick={loadDash} className="gap-2 text-sm">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
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
      {tab === 'geral'    && <TabVisaoGeral data={dash} loading={dashLoading} />}
      {tab === 'cultos'   && <TabCultos serviceTypes={serviceTypes} />}
      {tab === 'batismos' && <TabBatismos />}
    </div>
  );
}
