import { useState, useEffect, useCallback } from 'react';
import { membresia } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import {
  Users, Plus, Pencil, Trash2, X, Search, Sparkles, UserMinus, LogOut,
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

const CORES_SUGERIDAS = [
  '#00B39D', '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#84cc16',
];

const EMPTY = {
  nome: '', descricao: '', lider_id: '', cor: '#00B39D', ativo: true,
};

function MinisterioFormModal({ open, onOpenChange, editData, membros, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editData;

  useEffect(() => {
    if (editData) {
      setForm({
        nome: editData.nome || '',
        descricao: editData.descricao || '',
        lider_id: editData.lider_id || '',
        cor: editData.cor || '#00B39D',
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
      if (isEdit) await membresia.ministerios.update(editData.id, payload);
      else await membresia.ministerios.create(payload);
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
          <DialogTitle>{isEdit ? 'Editar Ministério' : 'Novo Ministério'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Louvor, Kids, Recepção" />
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
            <Label>Cor</Label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {CORES_SUGERIDAS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('cor', c)}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', background: c,
                    border: form.cor === c ? `2px solid ${C.text}` : `1px solid ${C.border}`,
                    cursor: 'pointer',
                  }}
                />
              ))}
              <Input type="color" value={form.cor} onChange={e => set('cor', e.target.value)} style={{ width: 36, height: 30, padding: 2 }} />
            </div>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} placeholder="O que esse ministério faz?" />
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

function MinisterioDetailModal({ ministerio, onClose, onRefresh, isDiretor, membros }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ membro_id: '', papel: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ministerio) return;
    setLoading(true);
    try {
      const res = await membresia.ministerios.get(ministerio.id);
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [ministerio]);

  useEffect(() => { load(); }, [load]);

  const adicionarMembro = async () => {
    if (!addForm.membro_id) return;
    setSaving(true);
    try {
      const payload = {
        membro_id: addForm.membro_id,
        ministerio_id: ministerio.id,
      };
      if (addForm.papel) payload.papel = addForm.papel;
      await membresia.voluntarios.create(payload);
      setAddForm({ membro_id: '', papel: '' });
      setShowAdd(false);
      await load();
      onRefresh?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const removerMembro = async (voluntarioId) => {
    const motivo = prompt('Motivo da saída (opcional):') ?? null;
    if (motivo === null && !confirm('Registrar saída do voluntário?')) return;
    try {
      await membresia.voluntarios.sair(voluntarioId, motivo);
      await load();
      onRefresh?.();
    } catch (e) {
      console.error(e);
    }
  };

  if (!ministerio) return null;

  const ativos = data?.ativos || [];
  const ativosMembroIds = new Set(ativos.map(a => a.membro?.id).filter(Boolean));
  const disponiveis = membros.filter(m => !ativosMembroIds.has(m.id));
  const cor = ministerio.cor || C.primary;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 20, width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto', border: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '24px 28px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
            <div style={{ width: 12, height: 44, borderRadius: 4, background: cor, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>{ministerio.nome}</h2>
              {ministerio.lider?.nome && <div style={{ fontSize: 13, color: C.text3, marginTop: 2 }}>Líder: {ministerio.lider.nome}</div>}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X style={{ width: 18, height: 18 }} /></Button>
        </div>

        <div style={{ padding: '20px 28px' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.text3, fontSize: 13 }}>Carregando...</div>
          ) : data ? (
            <>
              {data.descricao && (
                <div style={{ marginBottom: 20, padding: '10px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10, fontSize: 13, color: C.text, whiteSpace: 'pre-wrap' }}>
                  {data.descricao}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text2, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Voluntários ({ativos.length})
                </h3>
                {isDiretor && !showAdd && disponiveis.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
                    <Plus style={{ width: 14, height: 14 }} /> Adicionar
                  </Button>
                )}
              </div>

              {isDiretor && showAdd && (
                <div style={{ padding: 14, background: 'var(--cbrio-input-bg)', borderRadius: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <Label style={{ fontSize: 11 }}>Membro *</Label>
                      <Select value={addForm.membro_id} onValueChange={v => setAddForm(f => ({ ...f, membro_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent className="z-[1001]">
                          {disponiveis.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label style={{ fontSize: 11 }}>Papel / função</Label>
                      <Input value={addForm.papel} onChange={e => setAddForm(f => ({ ...f, papel: e.target.value }))} placeholder="Ex: Vocal, Monitor" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button variant="outline" onClick={() => { setShowAdd(false); setAddForm({ membro_id: '', papel: '' }); }}>Cancelar</Button>
                    <Button onClick={adicionarMembro} disabled={saving || !addForm.membro_id}>
                      {saving ? 'Salvando...' : 'Adicionar'}
                    </Button>
                  </div>
                </div>
              )}

              {ativos.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ativos.map(v => (
                    <div key={v.id} style={{ padding: '10px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{v.membro?.nome || '—'}</div>
                        <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                          {v.papel && `${v.papel} · `}
                          desde {new Date(v.desde).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      {isDiretor && (
                        <Button variant="ghost" size="icon" onClick={() => removerMembro(v.id)} title="Registrar saída">
                          <LogOut style={{ width: 14, height: 14, color: C.red }} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: C.text3, fontSize: 13 }}>Nenhum voluntário ativo</div>
              )}

              {data.historico?.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Histórico
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {data.historico.map(v => (
                      <div key={v.id} style={{ padding: '8px 12px', background: 'var(--cbrio-input-bg)', borderRadius: 10, opacity: 0.75 }}>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{v.membro?.nome || '—'}</div>
                        <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                          {new Date(v.desde).toLocaleDateString('pt-BR')} — {new Date(v.ate).toLocaleDateString('pt-BR')}
                          {v.motivo_saida && ` · ${v.motivo_saida}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function TabMinisterios() {
  const { isDiretor } = useAuth();
  const [ministerios, setMinisterios] = useState([]);
  const [membros, setMembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editMin, setEditMin] = useState(null);
  const [detailMin, setDetailMin] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [mi, me] = await Promise.all([
        membresia.ministerios.list(),
        membresia.membros.list(),
      ]);
      setMinisterios(mi);
      setMembros(me);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (ministerio) => {
    if (!confirm(`Desativar o ministério "${ministerio.nome}"?`)) return;
    await membresia.ministerios.remove(ministerio.id);
    fetchData();
  };

  const handleSaved = () => {
    setEditMin(null);
    fetchData();
  };

  const filtrados = ministerios.filter(m =>
    !busca || m.nome.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: C.text3, zIndex: 1 }} />
          <Input placeholder="Buscar ministério..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        {isDiretor && (
          <Button onClick={() => { setEditMin(null); setShowForm(true); }}>
            <Plus style={{ width: 16, height: 16 }} /> Novo Ministério
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.text3, fontSize: 13 }}>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.text3, fontSize: 13, background: C.card, borderRadius: 14, border: `1px solid ${C.border}` }}>
          Nenhum ministério cadastrado
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map(m => {
            const cor = m.cor || C.primary;
            return (
              <div
                key={m.id}
                onClick={() => setDetailMin(m)}
                style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: 16, cursor: 'pointer', transition: 'border-color 0.15s', display: 'flex', flexDirection: 'column', gap: 10, borderLeft: `4px solid ${cor}`, opacity: m.ativo === false ? 0.6 : 1 }}
                onMouseEnter={e => e.currentTarget.style.borderColor = cor}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Sparkles style={{ width: 16, height: 16, color: cor, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{m.nome}</div>
                      {m.ativo === false && (
                        <div style={{ fontSize: 10, color: C.red, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Inativo</div>
                      )}
                    </div>
                  </div>
                  {isDiretor && (
                    <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => { setEditMin(m); setShowForm(true); }} title="Editar">
                        <Pencil style={{ width: 14, height: 14 }} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(m)} title="Desativar">
                        <Trash2 style={{ width: 14, height: 14, color: C.red }} />
                      </Button>
                    </div>
                  )}
                </div>
                {m.lider?.nome && (
                  <div style={{ fontSize: 12, color: C.text2, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Users style={{ width: 12, height: 12, color: C.text3 }} /> {m.lider.nome}
                  </div>
                )}
                {m.descricao && (
                  <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {m.descricao}
                  </div>
                )}
                <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.text2 }}>
                  <strong style={{ color: C.text }}>{m.total_voluntarios || 0}</strong> {m.total_voluntarios === 1 ? 'voluntário' : 'voluntários'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MinisterioFormModal
        open={showForm}
        onOpenChange={setShowForm}
        editData={editMin}
        membros={membros}
        onSaved={handleSaved}
      />

      {detailMin && (
        <MinisterioDetailModal
          ministerio={detailMin}
          onClose={() => setDetailMin(null)}
          onRefresh={fetchData}
          isDiretor={isDiretor}
          membros={membros}
        />
      )}
    </div>
  );
}
