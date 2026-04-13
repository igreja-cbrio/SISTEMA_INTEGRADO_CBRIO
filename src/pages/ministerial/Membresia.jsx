import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { membresia } from '../../api';
import {
  Users, Search, Plus, ChevronRight, X,
  Phone, Mail, MapPin, Heart, Calendar, Star,
  CheckCircle2, Circle, UserPlus, Home, Pencil,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const STATUS_MAP = {
  visitante: { c: C.text3, bg: '#52525218', label: 'Visitante' },
  frequentador: { c: C.blue, bg: C.blueBg, label: 'Frequentador' },
  membro: { c: C.green, bg: C.greenBg, label: 'Membro' },
  membro_ativo: { c: C.primary, bg: C.primaryBg, label: 'Membro Ativo' },
  inativo: { c: C.red, bg: C.redBg, label: 'Inativo' },
  transferido: { c: C.amber, bg: C.amberBg, label: 'Transferido' },
};

const TRILHA_ETAPAS = [
  { key: 'primeiro_contato', label: 'Primeiro Contato', icon: Star },
  { key: 'cafe_boas_vindas', label: 'Café de Boas-Vindas', icon: Heart },
  { key: 'classe_batismo', label: 'Classe de Batismo', icon: Calendar },
  { key: 'batismo', label: 'Batismo', icon: CheckCircle2 },
  { key: 'classe_membresia', label: 'Classe de Membresia', icon: Users },
  { key: 'membresia', label: 'Membresia', icon: CheckCircle2 },
  { key: 'classe_valores', label: 'Classe dos Valores', icon: Star },
  { key: 'grupo_vida', label: 'Grupo de Vida', icon: Home },
  { key: 'escola_lideres', label: 'Escola de Líderes', icon: Users },
  { key: 'lider_grupo', label: 'Líder de Grupo', icon: Star },
  { key: 'ministerio', label: 'Ministério', icon: Heart },
];

const ESTADO_CIVIL_OPTIONS = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'Outros'];

const EMPTY_FORM = {
  nome: '', email: '', telefone: '', data_nascimento: '', estado_civil: '',
  endereco: '', bairro: '', cidade: '', cep: '', profissao: '',
  ministerio: '', grupo: '', status: 'visitante', familia_id: '', observacoes: '',
};

const Badge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.visitante;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: s.c, background: s.bg }}>
      {s.label}
    </span>
  );
};

/* ── Modal Form ── */
function MembroFormModal({ open, onOpenChange, editData, familias, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isEdit = !!editData;

  useEffect(() => {
    if (editData) {
      setForm({
        nome: editData.nome || '',
        email: editData.email || '',
        telefone: editData.telefone || '',
        data_nascimento: editData.data_nascimento || '',
        estado_civil: editData.estado_civil || '',
        endereco: editData.endereco || '',
        bairro: editData.bairro || '',
        cidade: editData.cidade || '',
        cep: editData.cep || '',
        profissao: editData.profissao || '',
        ministerio: editData.ministerio || '',
        grupo: editData.grupo || '',
        status: editData.status || 'visitante',
        familia_id: editData.familia_id || '',
        observacoes: editData.observacoes || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editData, open]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.familia_id) delete payload.familia_id;
      if (!payload.data_nascimento) delete payload.data_nascimento;

      if (isEdit) {
        await membresia.membros.update(editData.id, payload);
      } else {
        await membresia.membros.create(payload);
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[1000]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Membro' : 'Novo Membro'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          {/* Nome */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" />
          </div>

          {/* Email / Telefone */}
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <Input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(00) 00000-0000" />
          </div>

          {/* Nascimento / Estado Civil */}
          <div className="space-y-1.5">
            <Label>Data de Nascimento</Label>
            <Input type="date" value={form.data_nascimento} onChange={e => set('data_nascimento', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado Civil</Label>
            <Select value={form.estado_civil || '__none__'} onValueChange={v => set('estado_civil', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent className="z-[1001]">
                <SelectItem value="__none__">Não informado</SelectItem>
                {ESTADO_CIVIL_OPTIONS.map(ec => <SelectItem key={ec} value={ec}>{ec}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Endereço */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Endereço</Label>
            <Input value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número" />
          </div>
          <div className="space-y-1.5">
            <Label>Bairro</Label>
            <Input value={form.bairro} onChange={e => set('bairro', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cidade</Label>
            <Input value={form.cidade} onChange={e => set('cidade', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>CEP</Label>
            <Input value={form.cep} onChange={e => set('cep', e.target.value)} placeholder="00000-000" />
          </div>
          <div className="space-y-1.5">
            <Label>Profissão</Label>
            <Input value={form.profissao} onChange={e => set('profissao', e.target.value)} />
          </div>

          {/* Ministério / Grupo */}
          <div className="space-y-1.5">
            <Label>Ministério</Label>
            <Input value={form.ministerio} onChange={e => set('ministerio', e.target.value)} placeholder="Ex: Louvor, Infantil" />
          </div>
          <div className="space-y-1.5">
            <Label>Grupo</Label>
            <Input value={form.grupo} onChange={e => set('grupo', e.target.value)} placeholder="Ex: Grupo Vida Centro" />
          </div>

          {/* Status / Família */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[1001]">
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Família</Label>
            <Select value={form.familia_id || '__none__'} onValueChange={v => set('familia_id', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar família" /></SelectTrigger>
              <SelectContent className="z-[1001]">
                <SelectItem value="__none__">Nenhuma</SelectItem>
                {familias.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !form.nome.trim()}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main ── */
export default function Membresia() {
  const { isDiretor } = useAuth();
  const [membros, setMembros] = useState([]);
  const [kpis, setKpis] = useState({ total: 0, byStatus: {}, familias: 0 });
  const [familias, setFamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedMembro, setSelectedMembro] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editMembro, setEditMembro] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError('');
      const params = {};
      if (busca) params.busca = busca;
      if (filterStatus) params.status = filterStatus;
      const [m, k, f] = await Promise.all([
        membresia.membros.list(Object.keys(params).length ? params : null),
        membresia.kpis(),
        membresia.familias.list(),
      ]);
      setMembros(m);
      setKpis(k);
      setFamilias(f);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [busca, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openDetail = async (id) => {
    try {
      const data = await membresia.membros.get(id);
      setSelectedMembro(data);
    } catch (e) {
      setError(e.message);
    }
  };

  const openEdit = (membro) => {
    setEditMembro(membro);
    setSelectedMembro(null);
    setShowForm(true);
  };

  const openCreate = () => {
    setEditMembro(null);
    setShowForm(true);
  };

  const handleSaved = () => {
    setEditMembro(null);
    fetchData();
  };

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: '0 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users style={{ width: 28, height: 28, color: C.primary }} />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.25 }}>Membresia</h1>
          </div>
          <p style={{ fontSize: 14, color: C.text2, marginTop: 4, lineHeight: 1.5 }}>Cadastro de membros, famílias e trilha dos valores</p>
        </div>
        {isDiretor && (
          <Button onClick={openCreate}>
            <UserPlus style={{ width: 16, height: 16 }} /> Novo Membro
          </Button>
        )}
      </div>

      {error && (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}30`, color: C.red, borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <X style={{ width: 16, height: 16, cursor: 'pointer' }} onClick={() => setError('')} />
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total Membros', value: kpis.total, color: C.primary },
          { label: 'Membros Ativos', value: kpis.byStatus?.membro_ativo || 0, color: C.green },
          { label: 'Visitantes', value: kpis.byStatus?.visitante || 0, color: C.blue },
          { label: 'Famílias', value: kpis.familias, color: C.amber },
        ].map((k, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 12, padding: '18px 22px', border: `1px solid ${C.border}`, borderLeft: `4px solid ${k.color}` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>{k.value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: C.text3, zIndex: 1 }} />
          <Input
            placeholder="Buscar membro..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <Select value={filterStatus || '__all__'} onValueChange={v => setFilterStatus(v === '__all__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Todos os status" /></SelectTrigger>
            <SelectContent className="z-[1001]">
              <SelectItem value="__all__">Todos os status</SelectItem>
              {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              {['Nome', 'Família', 'Status', 'Telefone', 'Ministério', ''].map((h, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '14px 18px', fontSize: 11, fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5, background: 'var(--cbrio-table-header)', borderBottom: `1px solid ${C.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></td></tr>
            ) : membros.length === 0 ? (
              <tr><td colSpan={6}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhum membro encontrado</span></div></td></tr>
            ) : membros.map((m) => (
              <tr key={m.id} className="cbrio-row" onClick={() => openDetail(m.id)}>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primary, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                      {m.nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{m.nome}</div>
                      {m.email && <div style={{ fontSize: 12, color: C.text3 }}>{m.email}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  {m.familia ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Home style={{ width: 14, height: 14, color: C.text3 }} />
                      <span style={{ fontSize: 13, color: C.text2 }}>{m.familia.nome}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: C.text3 }}>—</span>
                  )}
                </td>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  <Badge status={m.status} />
                </td>
                <td style={{ padding: '14px 18px', fontSize: 13, color: C.text2, borderBottom: `1px solid ${C.border}` }}>
                  {m.telefone || '—'}
                </td>
                <td style={{ padding: '14px 18px', fontSize: 13, color: C.text2, borderBottom: `1px solid ${C.border}` }}>
                  {m.ministerio || '—'}
                </td>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  <ChevronRight style={{ width: 16, height: 16, color: C.text3 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Member Detail Modal */}
      {selectedMembro && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setSelectedMembro(null)}>
          <div style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 20, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto', border: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '28px 32px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primary, fontWeight: 700, fontSize: 20 }}>
                  {selectedMembro.nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{selectedMembro.nome}</h2>
                  <Badge status={selectedMembro.status} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {isDiretor && (
                  <Button variant="ghost" size="icon" onClick={() => openEdit(selectedMembro)} title="Editar">
                    <Pencil style={{ width: 16, height: 16 }} />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setSelectedMembro(null)}>
                  <X style={{ width: 20, height: 20 }} />
                </Button>
              </div>
            </div>

            <div style={{ padding: '24px 32px' }}>
              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
                {[
                  { icon: Mail, label: 'Email', value: selectedMembro.email },
                  { icon: Phone, label: 'Telefone', value: selectedMembro.telefone },
                  { icon: MapPin, label: 'Endereço', value: [selectedMembro.endereco, selectedMembro.bairro, selectedMembro.cidade].filter(Boolean).join(', ') },
                  { icon: Calendar, label: 'Nascimento', value: selectedMembro.data_nascimento ? new Date(selectedMembro.data_nascimento).toLocaleDateString('pt-BR') : null },
                  { icon: Heart, label: 'Estado Civil', value: selectedMembro.estado_civil },
                  { icon: Home, label: 'Família', value: selectedMembro.familia?.nome },
                  { icon: Users, label: 'Ministério', value: selectedMembro.ministerio },
                  { icon: Star, label: 'Grupo', value: selectedMembro.grupo },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
                    <item.icon style={{ width: 16, height: 16, color: C.text3, marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
                      <div style={{ fontSize: 14, color: item.value ? C.text : C.text3, marginTop: 2 }}>{item.value || '—'}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Familiares */}
              {selectedMembro.familiares?.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Home style={{ width: 16, height: 16, color: C.primary }} /> Familiares
                  </h3>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {selectedMembro.familiares.map(f => (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: C.primaryBg, borderRadius: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.primary, color: 'var(--cbrio-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                          {f.nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{f.nome}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trilha dos Valores */}
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Star style={{ width: 16, height: 16, color: C.primary }} /> Trilha dos Valores
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {TRILHA_ETAPAS.map((etapa, i) => {
                    const registro = selectedMembro.trilha?.find(t => t.etapa === etapa.key);
                    const concluida = registro?.concluida;
                    return (
                      <div key={etapa.key} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: concluida ? C.primary : 'transparent',
                            border: `2px solid ${concluida ? C.primary : C.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {concluida ? (
                              <CheckCircle2 style={{ width: 14, height: 14, color: 'var(--cbrio-bg)' }} />
                            ) : (
                              <Circle style={{ width: 10, height: 10, color: C.text3 }} />
                            )}
                          </div>
                          {i < TRILHA_ETAPAS.length - 1 && (
                            <div style={{ width: 2, height: 28, background: concluida ? C.primary : C.border }} />
                          )}
                        </div>
                        <div style={{ padding: '6px 0', flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: concluida ? 600 : 400, color: concluida ? C.text : C.text3 }}>
                            {etapa.label}
                          </div>
                          {registro?.data_conclusao && (
                            <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                              {new Date(registro.data_conclusao).toLocaleDateString('pt-BR')}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Histórico */}
              {selectedMembro.historico?.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>Histórico</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedMembro.historico.map(h => (
                      <div key={h.id} style={{ padding: '10px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          <div style={{ fontSize: 13, color: C.text }}>{h.descricao}</div>
                          <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{h.registrado?.name || ''}</div>
                        </div>
                        <div style={{ fontSize: 11, color: C.text3, flexShrink: 0 }}>
                          {new Date(h.data).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      <MembroFormModal
        open={showForm}
        onOpenChange={setShowForm}
        editData={editMembro}
        familias={familias}
        onSaved={handleSaved}
      />
    </div>
  );
}
