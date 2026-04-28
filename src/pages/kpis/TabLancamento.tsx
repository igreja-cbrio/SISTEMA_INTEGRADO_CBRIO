import { useState, useEffect, useCallback } from 'react';
import { kpis as kpisApi } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  Loader2, Save, X, ChevronRight, AlertCircle, CheckCircle2, Clock,
  Calendar, MessageSquare, Edit2, History, ArrowLeft, Bot, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const C = {
  primary: '#00B39D',
  warn: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  purple: '#8B5CF6',
};

const AREA_LABELS: Record<string, string> = {
  ami: 'AMI & Bridge',
  next: 'NEXT',
  generosidade: 'Generosidade',
  kids: 'CBKids',
  cuidados: 'Cuidados',
  grupos: 'Grupos',
  integracao: 'Integração',
  voluntariado: 'Voluntariado',
  cba: 'CBA',
};

const PERIODICIDADE_LABEL: Record<string, string> = {
  semanal: 'Semanal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

interface AreaSummary {
  area: string;
  total: number;
  verde: number;
  vermelho: number;
  pendente: number;
  pendentes_ou_atrasados: number;
  pct_verde: number;
}

interface Tatico {
  id: string;
  area: string;
  indicador: string;
  descricao?: string;
  periodicidade: string;
  meta_descricao?: string;
  meta_valor?: number;
  unidade?: string;
  responsavel_area?: string;
  apuracao?: string;
  periodo_atual?: string;
  ultimo_periodo?: string;
  ultimo_valor?: number;
  ultima_data?: string;
  ultima_origem?: 'manual' | 'auto' | null;
  fonte_auto?: string | null;
  status: 'verde' | 'vermelho' | 'pendente';
  sort_order?: number;
}

function statusColor(s: string): string {
  if (s === 'verde') return C.primary;
  if (s === 'vermelho') return C.danger;
  return '#6B7280';
}

function statusIcon(s: string) {
  const cor = statusColor(s);
  if (s === 'verde') return <CheckCircle2 className="h-4 w-4" style={{ color: cor }} />;
  if (s === 'vermelho') return <AlertCircle className="h-4 w-4" style={{ color: cor }} />;
  return <Clock className="h-4 w-4" style={{ color: cor }} />;
}

function statusLabel(s: string): string {
  if (s === 'verde') return 'Em dia';
  if (s === 'vermelho') return 'Atrasado';
  return 'Pendente';
}

// ────────────────────────────────────────────────────────────────────────────
// Picker de periodo adaptado a periodicidade
// ────────────────────────────────────────────────────────────────────────────
function periodoToDateString(periodo: string, periodicidade: string): string {
  if (!periodo) return '';
  if (periodicidade === 'trimestral' && periodo.includes('Q')) {
    const [y, q] = periodo.split('-Q').map(Number);
    const month = (q - 1) * 3;
    return `${y}-${String(month + 1).padStart(2, '0')}-01`;
  }
  if (periodicidade === 'semestral' && periodo.includes('S')) {
    const [y, s] = periodo.split('-S').map(Number);
    const month = (s - 1) * 6;
    return `${y}-${String(month + 1).padStart(2, '0')}-01`;
  }
  return '';
}

function PeriodoInput({ periodicidade, value, onChange, inputCls }: {
  periodicidade: string;
  value: string;
  onChange: (v: string) => void;
  inputCls: string;
}) {
  if (periodicidade === 'semanal') {
    return (
      <input
        type="week"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }
  if (periodicidade === 'mensal') {
    return (
      <input
        type="month"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }
  if (periodicidade === 'trimestral' || periodicidade === 'semestral') {
    return (
      <div className="space-y-1">
        <input
          type="date"
          value={periodoToDateString(value, periodicidade)}
          onChange={e => {
            const [y, m] = e.target.value.split('-').map(Number);
            if (!y || !m) return;
            const periodo = periodicidade === 'trimestral'
              ? `${y}-Q${Math.floor((m - 1) / 3) + 1}`
              : `${y}-S${m <= 6 ? 1 : 2}`;
            onChange(periodo);
          }}
          className={inputCls}
        />
        {value && (
          <p className="text-[10px] text-muted-foreground/80">
            Periodo: <strong className="text-foreground font-mono">{value}</strong>
          </p>
        )}
      </div>
    );
  }
  if (periodicidade === 'anual') {
    return (
      <input
        type="number"
        min={2020}
        max={2100}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Modal de lançamento
// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// Modal de edicao do indicador (apenas admin/diretor)
// ────────────────────────────────────────────────────────────────────────────
function ModalEditarIndicador({ tatico, onClose, onSaved }: {
  tatico: Tatico;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    indicador: tatico.indicador || '',
    descricao: tatico.descricao || '',
    meta_descricao: tatico.meta_descricao || '',
    meta_valor: tatico.meta_valor != null ? String(tatico.meta_valor) : '',
    unidade: tatico.unidade || '',
    responsavel_area: tatico.responsavel_area || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.indicador.trim()) {
      toast.error('Nome do indicador e obrigatorio');
      return;
    }
    setSaving(true);
    try {
      await kpisApi.v2.taticoUpdate(tatico.id, {
        indicador: form.indicador.trim(),
        descricao: form.descricao.trim() || null,
        meta_descricao: form.meta_descricao.trim() || null,
        meta_valor: form.meta_valor === '' ? null : Number(form.meta_valor),
        unidade: form.unidade.trim() || null,
        responsavel_area: form.responsavel_area.trim() || null,
      });
      toast.success('Indicador atualizado!');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-border bg-input text-foreground text-sm outline-none focus:border-[#00B39D] transition-colors';
  const labelCls = 'block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5';

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
      style={{ background: 'var(--cbrio-overlay)' }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Pencil className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground truncate">Editar indicador {tatico.id}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Nome do indicador *</label>
            <input
              value={form.indicador}
              onChange={e => setForm(f => ({ ...f, indicador: e.target.value }))}
              className={inputCls}
              autoFocus
            />
          </div>
          <div>
            <label className={labelCls}>Descricao (o que mede / contexto)</label>
            <textarea
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              rows={3}
              className={inputCls}
              placeholder="Explique o que este indicador mede e por que e importante"
            />
          </div>
          <div>
            <label className={labelCls}>Meta (descricao)</label>
            <input
              value={form.meta_descricao}
              onChange={e => setForm(f => ({ ...f, meta_descricao: e.target.value }))}
              className={inputCls}
              placeholder="Ex: +15% em 6m, +30% em 12m (base 200)"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Meta (valor numerico)</label>
              <input
                type="number"
                step="any"
                value={form.meta_valor}
                onChange={e => setForm(f => ({ ...f, meta_valor: e.target.value }))}
                className={inputCls}
                placeholder="Ex: 15"
              />
            </div>
            <div>
              <label className={labelCls}>Unidade</label>
              <input
                value={form.unidade}
                onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                className={inputCls}
                placeholder="%, #, R$, nota..."
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Responsavel da area</label>
            <input
              value={form.responsavel_area}
              onChange={e => setForm(f => ({ ...f, responsavel_area: e.target.value }))}
              className={inputCls}
              placeholder="Ex: Lideranca AMI"
            />
          </div>
          <div className="rounded-xl bg-muted/30 border border-border p-3">
            <p className="text-[11px] text-muted-foreground">
              <strong className="text-foreground">Periodicidade</strong> e <strong className="text-foreground">area</strong> nao podem ser alterados pelo formulario (afetam estrutura). Para mudar, contate o administrador.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar alteracoes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModalLancar({ tatico, onClose, onSaved }: {
  tatico: Tatico;
  onClose: () => void;
  onSaved: () => void;
}) {
  const periodoSugerido = tatico.periodo_atual || '';
  const [form, setForm] = useState({
    valor_realizado: tatico.ultimo_periodo === periodoSugerido && tatico.ultimo_valor != null
      ? String(tatico.ultimo_valor)
      : '',
    periodo_referencia: periodoSugerido,
    observacoes: '',
  });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    kpisApi.v2.taticoDetail(tatico.id, 12).then((d: any) => {
      setHistory(d?.historico || []);
    }).catch(() => {});
  }, [tatico.id]);

  const handleSave = async () => {
    if (!form.periodo_referencia) {
      toast.error('Período de referência é obrigatório');
      return;
    }
    if (form.valor_realizado === '' && !form.observacoes) {
      toast.error('Informe o valor ou pelo menos uma observação');
      return;
    }
    setSaving(true);
    try {
      await kpisApi.v2.registros.create({
        indicador_id: tatico.id,
        periodo_referencia: form.periodo_referencia,
        valor_realizado: form.valor_realizado === '' ? null : Number(form.valor_realizado),
        observacoes: form.observacoes || null,
      });
      toast.success('Registro salvo!');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-border bg-input text-foreground text-sm outline-none focus:border-[#00B39D] transition-colors';
  const labelCls = 'block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5';

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: 'var(--cbrio-overlay)' }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase shrink-0">
              {tatico.id}
            </span>
            <h3 className="font-semibold text-foreground truncate">{tatico.indicador}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Info do indicador */}
          <div className="rounded-xl bg-muted/30 border border-border p-3 space-y-1.5">
            {tatico.descricao && (
              <p className="text-sm text-foreground leading-relaxed mb-2 pb-2 border-b border-border">
                {tatico.descricao}
              </p>
            )}
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Periodicidade:</span>
              <span className="font-medium">{PERIODICIDADE_LABEL[tatico.periodicidade] || tatico.periodicidade}</span>
            </div>
            {tatico.meta_descricao && (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">Meta:</span>
                <span className="font-medium text-foreground">{tatico.meta_descricao}</span>
              </div>
            )}
            {tatico.responsavel_area && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Responsável:</span>
                <span className="font-medium">{tatico.responsavel_area}</span>
              </div>
            )}
            {tatico.fonte_auto && (
              <div className="flex items-start gap-2 text-xs pt-1.5 mt-1.5 border-t border-border">
                <Bot className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: C.primary }} />
                <span className="text-muted-foreground">
                  Este indicador é preenchido automaticamente pelo sistema todo dia às 04h.
                  {tatico.ultima_origem === 'auto' && ' O último valor veio do sistema.'}
                  {' '}Você pode sobrescrever manualmente.
                </span>
              </div>
            )}
          </div>

          {/* Form */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Período de referência</label>
              <PeriodoInput
                periodicidade={tatico.periodicidade}
                value={form.periodo_referencia}
                onChange={v => setForm(f => ({ ...f, periodo_referencia: v }))}
                inputCls={inputCls}
              />
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Sugerido: <strong>{periodoSugerido}</strong>
              </p>
            </div>
            <div>
              <label className={labelCls}>Valor realizado {tatico.unidade ? `(${tatico.unidade})` : ''}</label>
              <input
                type="number"
                value={form.valor_realizado}
                onChange={e => setForm(f => ({ ...f, valor_realizado: e.target.value }))}
                className={inputCls}
                placeholder="0"
                step="any"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Observações</label>
            <textarea
              value={form.observacoes}
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              rows={3}
              className={inputCls}
              placeholder="Contexto, justificativas, dados qualitativos..."
            />
          </div>

          {/* Histórico */}
          {history.length > 0 && (
            <div className="border-t border-border pt-4">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                <History className="h-3.5 w-3.5" />
                Histórico ({history.length})
                <ChevronRight className={`h-3 w-3 transition-transform ${showHistory ? 'rotate-90' : ''}`} />
              </button>
              {showHistory && (
                <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {history.map(h => (
                    <div key={h.id} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-muted/30">
                      <span className="font-mono text-muted-foreground">{h.periodo_referencia}</span>
                      <span className="font-bold tabular-nums">
                        {h.valor_realizado != null ? h.valor_realizado.toLocaleString('pt-BR') : '—'}
                        {tatico.unidade && h.valor_realizado != null ? ` ${tatico.unidade}` : ''}
                      </span>
                      <span className="text-muted-foreground/60 truncate ml-2">{h.responsavel || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#00B39D] hover:bg-[#00B39D]/90 text-white gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar registro'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Lista de táticos de uma área
// ────────────────────────────────────────────────────────────────────────────
function AreaDetail({ area, onBack, onChanged }: { area: string; onBack: () => void; onChanged: () => void }) {
  const { isAdmin, user } = useAuth() as any;
  const podeEditar = isAdmin || user?.role === 'diretor';
  const [taticos, setTaticos] = useState<Tatico[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tatico | null>(null);
  const [editingConfig, setEditingConfig] = useState<Tatico | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kpisApi.v2.taticos({ area });
      setTaticos(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [area]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Ordenar: pendentes/atrasados primeiro, depois verdes
  const sorted = [...taticos].sort((a, b) => {
    const order: Record<string, number> = { vermelho: 0, pendente: 1, verde: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3) || (a.sort_order || 0) - (b.sort_order || 0);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack} className="gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <h2 className="text-xl font-bold text-foreground">{AREA_LABELS[area] || area}</h2>
        <span className="text-sm text-muted-foreground">
          {taticos.length} indicador(es)
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Indicador</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Periodicidade</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meta</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Último</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map(t => (
              <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {statusIcon(t.status)}
                    <span className="text-xs font-medium" style={{ color: statusColor(t.status) }}>
                      {statusLabel(t.status)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground/60">{t.id}</span>
                      {t.fonte_auto && (
                        <span
                          title={`Lancado automaticamente pelo sistema (fonte: ${t.fonte_auto})`}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase"
                          style={{ background: `${C.primary}15`, color: C.primary }}
                        >
                          <Bot className="h-2.5 w-2.5" /> auto
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-foreground">{t.indicador}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {PERIODICIDADE_LABEL[t.periodicidade] || t.periodicidade}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate" title={t.meta_descricao || ''}>
                  {t.meta_descricao || '—'}
                </td>
                <td className="px-4 py-3">
                  {t.ultimo_valor != null ? (
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold tabular-nums text-foreground">
                          {Number(t.ultimo_valor).toLocaleString('pt-BR')}
                          {t.unidade ? ` ${t.unidade}` : ''}
                        </p>
                        {t.ultima_origem === 'auto' && (
                          <Bot className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 font-mono">{t.ultimo_periodo}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">Nunca lançado</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {podeEditar && (
                      <button
                        onClick={() => setEditingConfig(t)}
                        title="Editar nome / meta do indicador"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => setEditing(t)}
                      className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90 text-white text-xs"
                    >
                      <Edit2 className="h-3 w-3" /> Lançar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ModalLancar
          tatico={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { load(); onChanged(); }}
        />
      )}

      {editingConfig && (
        <ModalEditarIndicador
          tatico={editingConfig}
          onClose={() => setEditingConfig(null)}
          onSaved={() => { load(); onChanged(); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Cards de áreas
// ────────────────────────────────────────────────────────────────────────────
function AreaCard({ summary, onClick }: { summary: AreaSummary; onClick: () => void }) {
  const cor = summary.pendentes_ou_atrasados === 0
    ? C.primary
    : summary.vermelho > 0 ? C.danger : C.warn;
  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl border border-border bg-card p-5 transition-all hover:border-[#00B39D]/50 hover:shadow-md hover:-translate-y-0.5"
      style={{ borderLeftWidth: 4, borderLeftColor: cor }}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-bold text-foreground">{AREA_LABELS[summary.area] || summary.area}</h3>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Em dia</span>
          <span className="font-bold tabular-nums" style={{ color: C.primary }}>
            {summary.verde}/{summary.total}
          </span>
        </div>
        {summary.vermelho > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" style={{ color: C.danger }} />
              Atrasados
            </span>
            <span className="font-bold tabular-nums" style={{ color: C.danger }}>{summary.vermelho}</span>
          </div>
        )}
        {summary.pendente > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-500" />
              Pendentes
            </span>
            <span className="font-bold tabular-nums text-gray-500">{summary.pendente}</span>
          </div>
        )}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${summary.pct_verde}%`, background: cor }}
          />
        </div>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────────────
export default function TabLancamento() {
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kpisApi.v2.areas();
      setAreas(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selectedArea) {
    return <AreaDetail area={selectedArea} onBack={() => setSelectedArea(null)} onChanged={load} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalAtrasados = areas.reduce((s, a) => s + a.vermelho, 0);
  const totalPendentes = areas.reduce((s, a) => s + a.pendente, 0);
  const totalIndicadores = areas.reduce((s, a) => s + a.total, 0);
  const totalVerde = areas.reduce((s, a) => s + a.verde, 0);

  return (
    <div className="space-y-6">
      {/* Resumo geral */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total</p>
          <p className="text-2xl font-bold tabular-nums">{totalIndicadores}</p>
          <p className="text-xs text-muted-foreground mt-0.5">indicadores</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4" style={{ borderLeftWidth: 3, borderLeftColor: C.primary }}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Em dia</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: C.primary }}>{totalVerde}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalIndicadores > 0 ? Math.round(totalVerde / totalIndicadores * 100) : 0}% do total
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4" style={{ borderLeftWidth: 3, borderLeftColor: C.danger }}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Atrasados</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: C.danger }}>{totalAtrasados}</p>
          <p className="text-xs text-muted-foreground mt-0.5">para lançar agora</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4" style={{ borderLeftWidth: 3, borderLeftColor: '#6B7280' }}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pendentes</p>
          <p className="text-2xl font-bold tabular-nums text-gray-500">{totalPendentes}</p>
          <p className="text-xs text-muted-foreground mt-0.5">nunca lançados</p>
        </div>
      </div>

      {/* Instruções */}
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-4">
        <p className="text-sm font-semibold text-foreground mb-1">Como lançar</p>
        <p className="text-xs text-muted-foreground">
          Clique na sua área abaixo, encontre o indicador a lançar (atrasados aparecem primeiro),
          clique em <strong className="text-foreground">Lançar</strong>, preencha o valor e salve.
          O sistema reconhece automaticamente o período corrente (semana/mês/trimestre).
        </p>
      </div>

      {/* Áreas */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Áreas
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {areas.map(a => (
            <AreaCard key={a.area} summary={a} onClick={() => setSelectedArea(a.area)} />
          ))}
        </div>
      </div>
    </div>
  );
}
