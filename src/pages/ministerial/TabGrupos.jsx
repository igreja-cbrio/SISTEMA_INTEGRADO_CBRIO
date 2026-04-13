import { useState, useEffect, useCallback } from 'react';
import { membresia } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import {
  Users, Plus, Pencil, Trash2, X, MapPin, Calendar, UserMinus, Search,
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
  border: 'var(--cbrio-border)', red: '#ef4444', redBg: '#ef444418',
};

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const CATEGORIAS_PADRAO = ['Homens', 'Mulheres', 'Jovens', 'Casais', 'Família', 'Misto'];

const EMPTY = {
  nome: '', categoria: '', lider_id: '', local: '', endereco: '',
  dia_semana: '', horario: '', descricao: '', ativo: true,
};

function GrupoFormModal({ open, onOpenChange, editData, membros, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editData;

  useEffect(() => {
    if (editData) {
      setForm({
        nome: editData.nome || '',
        categoria: editData.categoria || '',
        lider_id: editData.lider_id || '',
        local: editData.local || '',
        endereco: editData.endereco || '',
        dia_semana: editData.dia_semana != null ? String(editData.dia_semana) : '',
        horario: editData.horario ? editData.horario.slice(0, 5) : '',
        descricao: editData.descricao || '',
        ativo: editData.ativo !== false,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editData, open]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.dia_semana !== '') payload.dia_semana = Number(payload.dia_semana);
      if (isEdit) await membresia.grupos.update(editData.id, payload);
      else await membresia.grupos.create(payload);
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto z-[1000]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Grupo' : 'Novo Grupo de Conexão'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: GV Tijuca" />
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={form.categoria || '__none__'} onValueChange={v => set('categoria', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent className="z-[1001]">
                <SelectItem value="__none__">Não informado</SelectItem>
                {CATEGORIAS_PADRAO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Líder</Label>
            <Select value={form.lider_id || '__none__'} onValueChange={v => set('lider_id', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent className="z-[1001]">
                <SelectItem value="__none__">Sem líder</SelectItem>
                {membros.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Dia da semana</Label>
            <Select value={form.dia_semana || '__none__'} onValueChange={v => set('dia_semana', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent className="z-[1001]">
                <SelectItem value="__none__">Não definido</SelectItem>
                {DIAS_SEMANA.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Horário</Label>
            <Input type="time" value={form.horario} onChange={e => set('horario', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Local (apelido)</Label>
            <Input value={form.local} onChange={e => set('local', e.target.value)} placeholder="Ex: Casa do João" />
          </div>
          <div className="space-y-1.5">
            <Label>Endereço</Label>
            <Input value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, bairro" />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} />
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

function GrupoDetailModal({ grupo, onClose, onRefresh, isDiretor }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    if (!grupo) return;
    setLoading(true);
    try {
      const res = await membresia.grupos.get(grupo.id);
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [grupo]);

  useEffect(() => { load(); }, [load]);

  const handleRemover = async (participacaoId) => {
    if (!confirm('Remover este membro do grupo?')) return;
    setRemoving(participacaoId);
    try {
      await membresia.grupos.sairMembro(participacaoId, {});
      await load();
      onRefresh?.();
    } finally {
      setRemoving(null);
    }
  };

  if (!grupo) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 20, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto', border: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '24px 28px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>{grupo.nome}</h2>
            {grupo.categoria && <div style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>{grupo.categoria}</div>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X style={{ width: 18, height: 18 }} /></Button>
        </div>

        <div style={{ padding: '20px 28px' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.text3, fontSize: 13 }}>Carregando...</div>
          ) : data ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
                {data.lider?.nome && (
                  <div><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Líder</div><div style={{ fontSize: 14, color: C.text, marginTop: 2 }}>{data.lider.nome}</div></div>
                )}
                {data.dia_semana != null && (
                  <div><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Quando</div><div style={{ fontSize: 14, color: C.text, marginTop: 2 }}>{DIAS_SEMANA[data.dia_semana]}{data.horario ? ` · ${data.horario.slice(0, 5)}` : ''}</div></div>
                )}
                {(data.local || data.endereco) && (
                  <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Local</div><div style={{ fontSize: 14, color: C.text, marginTop: 2 }}>{[data.local, data.endereco].filter(Boolean).join(' · ')}</div></div>
                )}
                {data.descricao && (
                  <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Descrição</div><div style={{ fontSize: 13, color: C.text, marginTop: 2, whiteSpace: 'pre-wrap' }}>{data.descricao}</div></div>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Membros ({data.ativos?.length || 0})
                </h3>
                {data.ativos?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {data.ativos.map(p => (
                      <div key={p.id} style={{ padding: '10px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{p.membro?.nome || '—'}</div>
                          <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>Desde {new Date(p.entrou_em).toLocaleDateString('pt-BR')}</div>
                        </div>
                        {isDiretor && (
                          <Button variant="ghost" size="sm" onClick={() => handleRemover(p.id)} disabled={removing === p.id} title="Remover">
                            <UserMinus style={{ width: 14, height: 14, color: C.red }} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 20, textAlign: 'center', color: C.text3, fontSize: 13 }}>Nenhum membro ativo</div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function TabGrupos() {
  const { isDiretor } = useAuth();
  const [grupos, setGrupos] = useState([]);
  const [membros, setMembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editGrupo, setEditGrupo] = useState(null);
  const [detailGrupo, setDetailGrupo] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([
        membresia.grupos.list(),
        membresia.membros.list(),
      ]);
      setGrupos(g);
      setMembros(m);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (grupo) => {
    if (!confirm(`Desativar o grupo "${grupo.nome}"?`)) return;
    await membresia.grupos.remove(grupo.id);
    fetchData();
  };

  const handleSaved = () => {
    setEditGrupo(null);
    fetchData();
  };

  const filtrados = grupos.filter(g =>
    !busca || g.nome.toLowerCase().includes(busca.toLowerCase()) || (g.categoria || '').toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: C.text3, zIndex: 1 }} />
          <Input placeholder="Buscar grupo..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        {isDiretor && (
          <Button onClick={() => { setEditGrupo(null); setShowForm(true); }}>
            <Plus style={{ width: 16, height: 16 }} /> Novo Grupo
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.text3, fontSize: 13 }}>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.text3, fontSize: 13, background: C.card, borderRadius: 14, border: `1px solid ${C.border}` }}>
          Nenhum grupo cadastrado
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map(g => (
            <div
              key={g.id}
              onClick={() => setDetailGrupo(g)}
              style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: 16, cursor: 'pointer', transition: 'border-color 0.15s', display: 'flex', flexDirection: 'column', gap: 10 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.primary}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{g.nome}</div>
                  {g.categoria && <div style={{ fontSize: 11, color: C.primary, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{g.categoria}</div>}
                </div>
                {isDiretor && (
                  <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => { setEditGrupo(g); setShowForm(true); }} title="Editar">
                      <Pencil style={{ width: 14, height: 14 }} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(g)} title="Desativar">
                      <Trash2 style={{ width: 14, height: 14, color: C.red }} />
                    </Button>
                  </div>
                )}
              </div>
              {g.lider?.nome && (
                <div style={{ fontSize: 12, color: C.text2, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Users style={{ width: 12, height: 12, color: C.text3 }} /> {g.lider.nome}
                </div>
              )}
              {g.dia_semana != null && (
                <div style={{ fontSize: 12, color: C.text2, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Calendar style={{ width: 12, height: 12, color: C.text3 }} />
                  {DIAS_SEMANA[g.dia_semana]}{g.horario ? ` · ${g.horario.slice(0, 5)}` : ''}
                </div>
              )}
              {g.local && (
                <div style={{ fontSize: 12, color: C.text2, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <MapPin style={{ width: 12, height: 12, color: C.text3 }} /> {g.local}
                </div>
              )}
              <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.text2 }}>
                <strong style={{ color: C.text }}>{g.total_ativos || 0}</strong> {g.total_ativos === 1 ? 'membro' : 'membros'}
              </div>
            </div>
          ))}
        </div>
      )}

      <GrupoFormModal
        open={showForm}
        onOpenChange={setShowForm}
        editData={editGrupo}
        membros={membros}
        onSaved={handleSaved}
      />

      {detailGrupo && (
        <GrupoDetailModal
          grupo={detailGrupo}
          onClose={() => setDetailGrupo(null)}
          onRefresh={fetchData}
          isDiretor={isDiretor}
        />
      )}
    </div>
  );
}
