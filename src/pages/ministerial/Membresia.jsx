import { useState, useEffect, useCallback } from 'react';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { useAuth } from '../../contexts/AuthContext';
import { membresia } from '../../api';
import {
  Users, Search, Plus, ChevronRight, X,
  Phone, Mail, MapPin, Heart, Calendar, Star,
  CheckCircle2, Circle, UserPlus, Home, Pencil,
  AlertCircle, LogOut, MapPin as MapPinIcon, Clock, Trash2,
  DollarSign, HandCoins, Sparkles, Activity, Inbox,
  Copy, Share2, Download, QrCode,
} from 'lucide-react';
import { toast } from 'sonner';
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
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '../../components/ui/tabs';
import TabCadastros from './TabCadastros';

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

const PARENTESCO_OPTIONS = {
  responsavel: { label: 'Responsável', cor: '#00B39D', bg: '#00B39D18' },
  conjuge: { label: 'Cônjuge', cor: '#8b5cf6', bg: '#8b5cf618' },
  filho: { label: 'Filho(a)', cor: '#3b82f6', bg: '#3b82f618' },
  outro: { label: 'Outro', cor: '#737373', bg: '#73737318' },
};

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const TIPOS_CONTRIBUICAO = {
  dizimo: { label: 'Dízimo', cor: '#10b981', bg: '#10b98118' },
  oferta: { label: 'Oferta', cor: '#3b82f6', bg: '#3b82f618' },
  campanha: { label: 'Campanha', cor: '#f59e0b', bg: '#f59e0b18' },
};

const FORMAS_PAGAMENTO = ['PIX', 'Dinheiro', 'Cartão', 'Transferência', 'Boleto'];

const NIVEIS_GENEROSIDADE = {
  ativo: { label: 'Ativo', cor: '#10b981', bg: '#10b98118', desc: 'Contribuiu nos últimos 30 dias' },
  irregular: { label: 'Irregular', cor: '#f59e0b', bg: '#f59e0b18', desc: 'Contribuiu nos últimos 5 meses' },
  inativo: { label: 'Inativo', cor: '#ef4444', bg: '#ef444418', desc: 'Sem contribuições há mais de 5 meses' },
  nunca_contribuiu: { label: 'Nunca contribuiu', cor: '#737373', bg: '#73737318', desc: 'Nenhum registro de contribuição' },
};

const NIVEIS_SERVICO = {
  ativo: { label: 'Servindo', cor: '#10b981', bg: '#10b98118', desc: 'Fez check-in nos últimos 60 dias' },
  ausente: { label: 'Ausente', cor: '#f59e0b', bg: '#f59e0b18', desc: 'Sem check-in há mais de 60 dias' },
  nunca_serviu: { label: 'Nunca serviu', cor: '#737373', bg: '#73737318', desc: 'Nenhum check-in registrado' },
};

function diasSemGrupo(dataSaida) {
  if (!dataSaida) return null;
  const diff = Date.now() - new Date(dataSaida).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function fmtMoeda(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const EMPTY_FORM = {
  nome: '', email: '', telefone: '', data_nascimento: '', estado_civil: '',
  endereco: '', bairro: '', cidade: '', cep: '', profissao: '',
  ministerio: '', grupo: '', status: 'visitante',
  familia_id: '', familia_nome_novo: '', parentesco: '', observacoes: '',
};

const Badge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.visitante;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: s.c, background: s.bg }}>
      {s.label}
    </span>
  );
};

/* ── Autocomplete de Família (buscar + criar inline) ── */
function FamiliaAutocomplete({ familias, value, onChange, placeholder = 'Buscar ou criar família...', autoFocus = false }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value) {
      const f = familias.find(x => x.id === value);
      setQuery(f?.nome || '');
    } else {
      setQuery('');
    }
  }, [value, familias]);

  const q = query.trim().toLowerCase();
  const filtradas = q
    ? familias.filter(f => f.nome.toLowerCase().includes(q))
    : familias.slice(0, 10);
  const exatoExiste = q && familias.some(f => f.nome.toLowerCase() === q);
  const podeCriar = q.length >= 2 && !exatoExiste;

  const selecionar = (id, nome) => {
    onChange({ familia_id: id, familia_nome_novo: '' });
    setQuery(nome);
    setOpen(false);
  };
  const criar = () => {
    onChange({ familia_id: '', familia_nome_novo: query.trim() });
    setOpen(false);
  };
  const limpar = () => {
    onChange({ familia_id: '', familia_nome_novo: '' });
    setQuery('');
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#737373', zIndex: 1, pointerEvents: 'none' }} />
        <Input
          value={query}
          autoFocus={autoFocus}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange({ familia_id: '', familia_nome_novo: '' }); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          style={{ paddingLeft: 32, paddingRight: query ? 32 : 12 }}
        />
        {query && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); limpar(); }}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#737373', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
            title="Limpar"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
      {open && (filtradas.length > 0 || podeCriar) && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1100, background: 'var(--cbrio-modal-bg, var(--cbrio-card))', border: '1px solid var(--cbrio-border)', borderRadius: 10, maxHeight: 240, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
          {filtradas.map(f => (
            <button
              key={f.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); selecionar(f.id, f.nome); }}
              style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--cbrio-text)', fontSize: 13, borderBottom: '1px solid var(--cbrio-border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--cbrio-input-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Home style={{ width: 14, height: 14, color: '#00B39D', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</span>
              {f.membros?.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--cbrio-text3)', flexShrink: 0 }}>
                  {f.membros.length} {f.membros.length === 1 ? 'membro' : 'membros'}
                </span>
              )}
            </button>
          ))}
          {podeCriar && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); criar(); }}
              style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: '#00B39D', fontSize: 13, fontWeight: 600 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--cbrio-input-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Plus style={{ width: 14, height: 14, flexShrink: 0 }} />
              <span>Criar família "<strong>{query.trim()}</strong>"</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
        familia_nome_novo: '',
        parentesco: editData.parentesco || '',
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
      const novoNome = payload.familia_nome_novo?.trim();
      delete payload.familia_nome_novo;

      // Cria a família nova antes de salvar o membro
      if (!payload.familia_id && novoNome) {
        const novaFam = await membresia.familias.create({ nome: novoNome });
        payload.familia_id = novaFam.id;
      }

      if (!payload.familia_id) {
        delete payload.familia_id;
        payload.parentesco = null;
      }
      if (!payload.parentesco) delete payload.parentesco;
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
            <FamiliaAutocomplete
              familias={familias}
              value={form.familia_id}
              onChange={({ familia_id, familia_nome_novo }) => setForm(prev => ({
                ...prev,
                familia_id,
                familia_nome_novo,
                parentesco: (familia_id || familia_nome_novo) ? prev.parentesco : '',
              }))}
            />
            {form.familia_nome_novo && (
              <div style={{ fontSize: 11, color: '#00B39D', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus style={{ width: 12, height: 12 }} /> Nova família: <strong>{form.familia_nome_novo}</strong>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Parentesco</Label>
            <Select
              value={form.parentesco || '__none__'}
              onValueChange={v => set('parentesco', v === '__none__' ? '' : v)}
              disabled={!form.familia_id && !form.familia_nome_novo}
            >
              <SelectTrigger><SelectValue placeholder={(form.familia_id || form.familia_nome_novo) ? 'Selecionar' : 'Vincule uma família primeiro'} /></SelectTrigger>
              <SelectContent className="z-[1001]">
                <SelectItem value="__none__">Não informado</SelectItem>
                {Object.entries(PARENTESCO_OPTIONS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
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
  const [activeTab, setActiveTab] = useState('info');
  const [novoHist, setNovoHist] = useState('');
  const [salvandoHist, setSalvandoHist] = useState(false);
  const [togglingEtapa, setTogglingEtapa] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [grupoSelecionado, setGrupoSelecionado] = useState('');
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  const [pageTab, setPageTab] = useState('membros');
  const [showShareLink, setShowShareLink] = useState(false);
  const [showContribForm, setShowContribForm] = useState(false);
  const [contribForm, setContribForm] = useState({ tipo: 'dizimo', valor: '', data: new Date().toISOString().slice(0, 10), forma_pagamento: '', campanha: '', observacoes: '' });
  const [salvandoContrib, setSalvandoContrib] = useState(false);
  const [ministeriosList, setMinisteriosList] = useState([]);
  const [showVolForm, setShowVolForm] = useState(false);
  const [volForm, setVolForm] = useState({ ministerio_id: '', papel: '' });
  const [salvandoVol, setSalvandoVol] = useState(false);
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [checkinForm, setCheckinForm] = useState({ ministerio_id: '', data: new Date().toISOString().slice(0, 10), culto: '' });
  const [salvandoCheckin, setSalvandoCheckin] = useState(false);
  const [showFamiliaEdit, setShowFamiliaEdit] = useState(false);
  const [familiaLinkForm, setFamiliaLinkForm] = useState({ familia_id: '', familia_nome_novo: '', parentesco: '' });
  const [salvandoFamilia, setSalvandoFamilia] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError('');
      const params = {};
      if (busca) params.busca = busca;
      if (filterStatus) params.status = filterStatus;
      const [m, k, f, g, mi] = await Promise.all([
        membresia.membros.list(Object.keys(params).length ? params : null),
        membresia.kpis(),
        membresia.familias.list(),
        membresia.grupos.list({ ativo: 'true' }).catch(() => []),
        membresia.ministerios.list({ ativo: 'true' }).catch(() => []),
      ]);
      setMembros(m);
      setKpis(k);
      setFamilias(f);
      setGrupos(g);
      setMinisteriosList(mi);
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
      setActiveTab('info');
      setNovoHist('');
      setShowFamiliaEdit(false);
      setShowVolForm(false);
      setShowCheckinForm(false);
      setShowContribForm(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const reloadDetail = async () => {
    if (!selectedMembro?.id) return;
    try {
      const data = await membresia.membros.get(selectedMembro.id);
      setSelectedMembro(data);
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleEtapa = async (etapaKey) => {
    if (!isDiretor || !selectedMembro) return;
    const registro = selectedMembro.trilha?.find(t => t.etapa === etapaKey);
    setTogglingEtapa(etapaKey);
    try {
      if (registro) {
        const novaConclusao = !registro.concluida;
        await membresia.trilha.update(registro.id, {
          concluida: novaConclusao,
          data_conclusao: novaConclusao ? new Date().toISOString().slice(0, 10) : null,
        });
      } else {
        await membresia.trilha.create({
          membro_id: selectedMembro.id,
          etapa: etapaKey,
          concluida: true,
          data_conclusao: new Date().toISOString().slice(0, 10),
        });
      }
      await reloadDetail();
    } catch (e) {
      setError(e.message);
    } finally {
      setTogglingEtapa(null);
    }
  };

  const adicionarAGrupo = async () => {
    if (!grupoSelecionado || !selectedMembro) return;
    setSalvandoGrupo(true);
    try {
      await membresia.grupos.adicionarMembro(grupoSelecionado, { membro_id: selectedMembro.id });
      setGrupoSelecionado('');
      await reloadDetail();
    } catch (e) {
      setError(e.message);
    } finally {
      setSalvandoGrupo(false);
    }
  };

  const sairDoGrupo = async () => {
    if (!selectedMembro?.grupo_atual?.id) return;
    if (!confirm('Remover este membro do grupo atual?')) return;
    setSalvandoGrupo(true);
    try {
      await membresia.grupos.sairMembro(selectedMembro.grupo_atual.id, {});
      await reloadDetail();
    } catch (e) {
      setError(e.message);
    } finally {
      setSalvandoGrupo(false);
    }
  };

  const adicionarContribuicao = async () => {
    if (!selectedMembro) return;
    const valor = Number(contribForm.valor);
    if (!valor || valor <= 0) return;
    setSalvandoContrib(true);
    try {
      const payload = {
        membro_id: selectedMembro.id,
        tipo: contribForm.tipo,
        valor,
        data: contribForm.data,
      };
      if (contribForm.forma_pagamento) payload.forma_pagamento = contribForm.forma_pagamento;
      if (contribForm.campanha) payload.campanha = contribForm.campanha;
      if (contribForm.observacoes) payload.observacoes = contribForm.observacoes;
      await membresia.contribuicoes.create(payload);
      setContribForm({ tipo: 'dizimo', valor: '', data: new Date().toISOString().slice(0, 10), forma_pagamento: '', campanha: '', observacoes: '' });
      setShowContribForm(false);
      await reloadDetail();
      fetchData();
    } catch (e) {
      setError(e.message);
    } finally {
      setSalvandoContrib(false);
    }
  };

  const removerContribuicao = async (id) => {
    if (!confirm('Remover esta contribuição?')) return;
    try {
      await membresia.contribuicoes.remove(id);
      await reloadDetail();
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  const adicionarVoluntario = async () => {
    if (!selectedMembro || !volForm.ministerio_id) return;
    setSalvandoVol(true);
    try {
      const payload = {
        membro_id: selectedMembro.id,
        ministerio_id: volForm.ministerio_id,
      };
      if (volForm.papel) payload.papel = volForm.papel;
      await membresia.voluntarios.create(payload);
      setVolForm({ ministerio_id: '', papel: '' });
      setShowVolForm(false);
      await reloadDetail();
    } catch (e) {
      setError(e.message);
    } finally {
      setSalvandoVol(false);
    }
  };

  const sairVoluntario = async (voluntarioId) => {
    const motivo = prompt('Motivo da saída (opcional):') ?? null;
    if (motivo === null && !confirm('Registrar saída do ministério?')) return;
    try {
      await membresia.voluntarios.sair(voluntarioId, motivo);
      await reloadDetail();
    } catch (e) {
      setError(e.message);
    }
  };

  const registrarCheckin = async () => {
    if (!selectedMembro) return;
    setSalvandoCheckin(true);
    try {
      const payload = {
        membro_id: selectedMembro.id,
        data: checkinForm.data,
      };
      if (checkinForm.ministerio_id) payload.ministerio_id = checkinForm.ministerio_id;
      if (checkinForm.culto) payload.culto = checkinForm.culto;
      await membresia.checkins.create(payload);
      setCheckinForm({ ministerio_id: '', data: new Date().toISOString().slice(0, 10), culto: '' });
      setShowCheckinForm(false);
      await reloadDetail();
    } catch (e) {
      setError(e.message);
    } finally {
      setSalvandoCheckin(false);
    }
  };

  const removerCheckin = async (id) => {
    if (!confirm('Remover este check-in?')) return;
    try {
      await membresia.checkins.remove(id);
      await reloadDetail();
    } catch (e) {
      setError(e.message);
    }
  };

  const abrirEdicaoFamilia = () => {
    setFamiliaLinkForm({
      familia_id: selectedMembro?.familia_id || '',
      familia_nome_novo: '',
      parentesco: selectedMembro?.parentesco || '',
    });
    setShowFamiliaEdit(true);
  };

  const salvarVinculoFamilia = async () => {
    if (!selectedMembro) return;
    setSalvandoFamilia(true);
    try {
      let familia_id = familiaLinkForm.familia_id;
      const novoNome = familiaLinkForm.familia_nome_novo?.trim();
      if (!familia_id && novoNome) {
        const nova = await membresia.familias.create({ nome: novoNome });
        familia_id = nova.id;
      }
      await membresia.familias.vincular(selectedMembro.id, {
        familia_id: familia_id || null,
        parentesco: familia_id ? (familiaLinkForm.parentesco || null) : null,
      });
      setShowFamiliaEdit(false);
      setFamiliaLinkForm({ familia_id: '', familia_nome_novo: '', parentesco: '' });
      await reloadDetail();
      fetchData();
    } catch (e) {
      setError(e.message);
    } finally {
      setSalvandoFamilia(false);
    }
  };

  const desvincularFamilia = async () => {
    if (!selectedMembro || !confirm('Desvincular da família?')) return;
    try {
      await membresia.familias.vincular(selectedMembro.id, { familia_id: null, parentesco: null });
      await reloadDetail();
      fetchData();
    } catch (e) {
      setError(e.message);
    }
  };

  const adicionarHistorico = async () => {
    if (!novoHist.trim() || !selectedMembro) return;
    setSalvandoHist(true);
    try {
      await membresia.historico.create({
        membro_id: selectedMembro.id,
        descricao: novoHist.trim(),
        data: new Date().toISOString().slice(0, 10),
      });
      setNovoHist('');
      await reloadDetail();
    } catch (e) {
      setError(e.message);
    } finally {
      setSalvandoHist(false);
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
          <p style={{ fontSize: 14, color: C.text2, marginTop: 4, lineHeight: 1.5 }}>Membros, famílias, generosidade e trilha dos valores</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={() => setShowShareLink(true)}>
            <QrCode style={{ width: 16, height: 16 }} /> Link de cadastro
          </Button>
          {isDiretor && (
            <Button onClick={openCreate}>
              <UserPlus style={{ width: 16, height: 16 }} /> Novo Membro
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}30`, color: C.red, borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <X style={{ width: 16, height: 16, cursor: 'pointer' }} onClick={() => setError('')} />
        </div>
      )}

      {/* Page Tabs: Membros × Cadastros pendentes */}
      <Tabs value={pageTab} onValueChange={setPageTab}>
        <TabsList className="inline-flex h-auto w-auto bg-transparent p-0 gap-1 border-b border-border rounded-none mb-5">
          {[
            { key: 'membros', label: 'Membros', icon: Users },
            { key: 'cadastros', label: 'Cadastros pendentes', icon: Inbox },
          ].map(t => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="relative rounded-none border-b-2 border-transparent px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-b-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent"
              >
                <Icon className="size-3.5 mr-1.5 hidden sm:inline-block" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="membros">

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-7">
        <StatisticsCard title="Total Membros" value={kpis.total} icon={Users} iconColor="#00B39D" />
        <StatisticsCard title="Membros Ativos" value={kpis.byStatus?.membro_ativo || 0} icon={Users} iconColor="#10b981" />
        <StatisticsCard title="Visitantes" value={kpis.byStatus?.visitante || 0} icon={UserPlus} iconColor="#3b82f6" />
        <StatisticsCard title="Famílias" value={kpis.familias} icon={Home} iconColor="#f59e0b" />
        <StatisticsCard title="Contribuintes Ativos" value={kpis.contribuintes_ativos || 0} icon={HandCoins} iconColor="#22c55e" />
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
        </TabsContent>

        <TabsContent value="cadastros">
          <TabCadastros />
        </TabsContent>
      </Tabs>

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

            <div style={{ padding: '20px 32px 28px' }}>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="inline-flex h-auto w-auto bg-transparent p-0 gap-1 border-b border-border rounded-none mb-4">
                  {[
                    { key: 'info', label: 'Informações', icon: Users },
                    { key: 'familia', label: 'Família', icon: Home },
                    { key: 'grupo', label: 'Grupo', icon: Users },
                    { key: 'generosidade', label: 'Generosidade', icon: HandCoins },
                    { key: 'servico', label: 'Serviço', icon: Sparkles },
                    { key: 'trilha', label: 'Trilha', icon: Star },
                    { key: 'historico', label: 'Histórico', icon: Calendar },
                  ].map(t => {
                    const Icon = t.icon;
                    return (
                      <TabsTrigger
                        key={t.key}
                        value={t.key}
                        className="relative rounded-none border-b-2 border-transparent px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-b-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent"
                      >
                        <Icon className="size-3.5 mr-1.5 hidden sm:inline-block" />
                        {t.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {/* Aba: Informações */}
                <TabsContent value="info" className="mt-4">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
                  {selectedMembro.observacoes && (
                    <div style={{ marginTop: 24, padding: '12px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10 }}>
                      <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Observações</div>
                      <div style={{ fontSize: 13, color: C.text, whiteSpace: 'pre-wrap' }}>{selectedMembro.observacoes}</div>
                    </div>
                  )}
                </TabsContent>

                {/* Aba: Família */}
                <TabsContent value="familia" className="mt-4">
                  {/* Cabeçalho: família atual + parentesco */}
                  {selectedMembro.familia?.nome ? (
                    <div style={{ padding: 14, borderRadius: 12, background: C.primaryBg, border: `1px solid ${C.primary}30`, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Home style={{ width: 18, height: 18, color: C.primary, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>Família</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginTop: 2 }}>{selectedMembro.familia.nome}</div>
                          {selectedMembro.parentesco && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, color: PARENTESCO_OPTIONS[selectedMembro.parentesco]?.cor || C.text3, background: PARENTESCO_OPTIONS[selectedMembro.parentesco]?.bg || '#73737318', fontWeight: 600 }}>
                                {PARENTESCO_OPTIONS[selectedMembro.parentesco]?.label || selectedMembro.parentesco}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {isDiretor && !showFamiliaEdit && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <Button variant="ghost" size="icon" onClick={abrirEdicaoFamilia} title="Editar vínculo">
                            <Pencil style={{ width: 14, height: 14 }} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={desvincularFamilia} title="Desvincular">
                            <X style={{ width: 16, height: 16, color: C.red }} />
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: 14, borderRadius: 12, background: 'var(--cbrio-input-bg)', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.text3, fontSize: 13 }}>
                        <Home style={{ width: 16, height: 16 }} />
                        Nenhuma família vinculada
                      </div>
                      {isDiretor && !showFamiliaEdit && (
                        <Button variant="outline" size="sm" onClick={abrirEdicaoFamilia}>
                          <Plus style={{ width: 14, height: 14 }} /> Vincular
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Formulário inline de vínculo */}
                  {isDiretor && showFamiliaEdit && (
                    <div style={{ padding: 14, background: 'var(--cbrio-input-bg)', borderRadius: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <Label style={{ fontSize: 11 }}>Família</Label>
                        <FamiliaAutocomplete
                          familias={familias}
                          value={familiaLinkForm.familia_id}
                          onChange={({ familia_id, familia_nome_novo }) => setFamiliaLinkForm(prev => ({
                            ...prev,
                            familia_id,
                            familia_nome_novo,
                            parentesco: (familia_id || familia_nome_novo) ? prev.parentesco : '',
                          }))}
                        />
                        {familiaLinkForm.familia_nome_novo && (
                          <div style={{ fontSize: 11, color: C.primary, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Plus style={{ width: 12, height: 12 }} /> Nova família: <strong>{familiaLinkForm.familia_nome_novo}</strong>
                          </div>
                        )}
                      </div>
                      <div>
                        <Label style={{ fontSize: 11 }}>Parentesco</Label>
                        <Select
                          value={familiaLinkForm.parentesco || '__none__'}
                          onValueChange={v => setFamiliaLinkForm(f => ({ ...f, parentesco: v === '__none__' ? '' : v }))}
                          disabled={!familiaLinkForm.familia_id && !familiaLinkForm.familia_nome_novo}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                          <SelectContent className="z-[1001]">
                            <SelectItem value="__none__">Não informado</SelectItem>
                            {Object.entries(PARENTESCO_OPTIONS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                        <Button variant="outline" onClick={() => setShowFamiliaEdit(false)}>Cancelar</Button>
                        <Button onClick={salvarVinculoFamilia} disabled={salvandoFamilia || (!familiaLinkForm.familia_id && !familiaLinkForm.familia_nome_novo?.trim())}>
                          {salvandoFamilia ? 'Salvando...' : 'Salvar'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Lista de familiares */}
                  {selectedMembro.familia?.nome && (
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Familiares ({selectedMembro.familiares?.length || 0})
                    </h3>
                  )}
                  {selectedMembro.familiares?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {selectedMembro.familiares.map(f => {
                        const pOpt = PARENTESCO_OPTIONS[f.parentesco];
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => openDetail(f.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = C.primaryBg}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--cbrio-input-bg)'}
                          >
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                              {f.nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{f.nome}</div>
                              {pOpt && (
                                <div style={{ marginTop: 2 }}>
                                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, color: pOpt.cor, background: pOpt.bg, fontWeight: 600 }}>
                                    {pOpt.label}
                                  </span>
                                </div>
                              )}
                            </div>
                            {f.status && <Badge status={f.status} />}
                          </button>
                        );
                      })}
                    </div>
                  ) : selectedMembro.familia?.nome ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: C.text3, fontSize: 13 }}>
                      Nenhum outro familiar cadastrado nesta família
                    </div>
                  ) : null}
                </TabsContent>

                {/* Aba: Grupo de Conexão */}
                <TabsContent value="grupo" className="mt-4">
                  {selectedMembro.grupo_atual ? (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ padding: 16, background: C.primaryBg, borderRadius: 12, border: `1px solid ${C.primary}30` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>
                              Grupo atual
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
                              {selectedMembro.grupo_atual.grupo?.nome}
                            </div>
                            {selectedMembro.grupo_atual.grupo?.categoria && (
                              <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{selectedMembro.grupo_atual.grupo.categoria}</div>
                            )}
                          </div>
                          {isDiretor && (
                            <Button variant="ghost" size="sm" onClick={sairDoGrupo} disabled={salvandoGrupo} title="Remover do grupo">
                              <LogOut style={{ width: 14, height: 14 }} />
                            </Button>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                          {selectedMembro.grupo_atual.grupo?.lider?.nome && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: C.text2 }}>
                              <Users style={{ width: 14, height: 14, color: C.text3 }} />
                              Líder: <span style={{ color: C.text, fontWeight: 500 }}>{selectedMembro.grupo_atual.grupo.lider.nome}</span>
                            </div>
                          )}
                          {selectedMembro.grupo_atual.grupo?.dia_semana != null && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: C.text2 }}>
                              <Calendar style={{ width: 14, height: 14, color: C.text3 }} />
                              {DIAS_SEMANA[selectedMembro.grupo_atual.grupo.dia_semana]}
                              {selectedMembro.grupo_atual.grupo.horario && ` · ${selectedMembro.grupo_atual.grupo.horario.slice(0, 5)}`}
                            </div>
                          )}
                          {selectedMembro.grupo_atual.grupo?.local && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: C.text2, gridColumn: '1 / -1' }}>
                              <MapPinIcon style={{ width: 14, height: 14, color: C.text3 }} />
                              {selectedMembro.grupo_atual.grupo.local}
                            </div>
                          )}
                        </div>
                        {selectedMembro.grupo_atual.entrou_em && (
                          <div style={{ fontSize: 11, color: C.text3, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                            Desde {new Date(selectedMembro.grupo_atual.entrou_em).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ padding: 14, background: C.amberBg, borderRadius: 12, border: `1px solid ${C.amber}30`, display: 'flex', alignItems: 'start', gap: 12 }}>
                        <AlertCircle style={{ width: 18, height: 18, color: C.amber, flexShrink: 0, marginTop: 1 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Sem grupo de conexão</div>
                          {(() => {
                            const ultimo = selectedMembro.grupo_historico?.[0];
                            const dias = ultimo ? diasSemGrupo(ultimo.saiu_em) : null;
                            if (dias != null) {
                              return (
                                <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                                  Há {dias} {dias === 1 ? 'dia' : 'dias'} sem grupo (saiu do {ultimo.grupo?.nome || '—'} em {new Date(ultimo.saiu_em).toLocaleDateString('pt-BR')})
                                </div>
                              );
                            }
                            return <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>Este membro ainda não participou de nenhum grupo.</div>;
                          })()}
                        </div>
                      </div>

                      {isDiretor && grupos.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <Select value={grupoSelecionado || '__none__'} onValueChange={v => setGrupoSelecionado(v === '__none__' ? '' : v)}>
                            <SelectTrigger><SelectValue placeholder="Selecionar grupo..." /></SelectTrigger>
                            <SelectContent className="z-[1001]">
                              <SelectItem value="__none__">Selecionar grupo...</SelectItem>
                              {grupos.map(g => (
                                <SelectItem key={g.id} value={g.id}>
                                  {g.nome}{g.categoria ? ` · ${g.categoria}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button onClick={adicionarAGrupo} disabled={!grupoSelecionado || salvandoGrupo}>
                            {salvandoGrupo ? 'Salvando...' : 'Adicionar'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Histórico de grupos */}
                  {selectedMembro.grupo_historico?.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Histórico
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selectedMembro.grupo_historico.map(p => (
                          <div key={p.id} style={{ padding: '10px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{p.grupo?.nome || '—'}</div>
                              {p.motivo_saida && (
                                <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{p.motivo_saida}</div>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: C.text3, flexShrink: 0, textAlign: 'right' }}>
                              {new Date(p.entrou_em).toLocaleDateString('pt-BR')}<br />
                              → {new Date(p.saiu_em).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Aba: Generosidade */}
                <TabsContent value="generosidade" className="mt-4">
                  {(() => {
                    const nivel = NIVEIS_GENEROSIDADE[selectedMembro.nivel_generosidade] || NIVEIS_GENEROSIDADE.nunca_contribuiu;
                    const totais = selectedMembro.totais_ano || { dizimo: 0, oferta: 0, campanha: 0, total: 0 };
                    return (
                      <>
                        {/* Card de status */}
                        <div style={{ padding: 14, borderRadius: 12, background: nivel.bg, border: `1px solid ${nivel.cor}30`, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: nivel.cor, fontWeight: 700 }}>Nível de Generosidade</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 2 }}>{nivel.label}</div>
                            <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{nivel.desc}</div>
                          </div>
                          {selectedMembro.ultima_contribuicao && (
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Última</div>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 2 }}>
                                {new Date(selectedMembro.ultima_contribuicao).toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Totais do ano */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
                          {[
                            { label: 'Dízimos', valor: totais.dizimo, cor: TIPOS_CONTRIBUICAO.dizimo.cor, bg: TIPOS_CONTRIBUICAO.dizimo.bg },
                            { label: 'Ofertas', valor: totais.oferta, cor: TIPOS_CONTRIBUICAO.oferta.cor, bg: TIPOS_CONTRIBUICAO.oferta.bg },
                            { label: 'Campanhas', valor: totais.campanha, cor: TIPOS_CONTRIBUICAO.campanha.cor, bg: TIPOS_CONTRIBUICAO.campanha.bg },
                            { label: 'Total ano', valor: totais.total, cor: C.primary, bg: C.primaryBg },
                          ].map((t, i) => (
                            <div key={i} style={{ padding: 10, borderRadius: 10, background: t.bg, border: `1px solid ${t.cor}20` }}>
                              <div style={{ fontSize: 10, color: t.cor, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{t.label}</div>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 4 }}>{fmtMoeda(t.valor)}</div>
                            </div>
                          ))}
                        </div>

                        {/* Botão + formulário */}
                        {isDiretor && (
                          showContribForm ? (
                            <div style={{ padding: 14, background: 'var(--cbrio-input-bg)', borderRadius: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                  <Label style={{ fontSize: 11 }}>Tipo *</Label>
                                  <Select value={contribForm.tipo} onValueChange={v => setContribForm(f => ({ ...f, tipo: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent className="z-[1001]">
                                      {Object.entries(TIPOS_CONTRIBUICAO).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label style={{ fontSize: 11 }}>Valor *</Label>
                                  <Input type="number" step="0.01" min="0" value={contribForm.valor} onChange={e => setContribForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
                                </div>
                                <div>
                                  <Label style={{ fontSize: 11 }}>Data *</Label>
                                  <Input type="date" value={contribForm.data} onChange={e => setContribForm(f => ({ ...f, data: e.target.value }))} />
                                </div>
                                <div>
                                  <Label style={{ fontSize: 11 }}>Forma de pagamento</Label>
                                  <Select value={contribForm.forma_pagamento || '__none__'} onValueChange={v => setContribForm(f => ({ ...f, forma_pagamento: v === '__none__' ? '' : v }))}>
                                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                                    <SelectContent className="z-[1001]">
                                      <SelectItem value="__none__">Não informado</SelectItem>
                                      {FORMAS_PAGAMENTO.map(fp => <SelectItem key={fp} value={fp}>{fp}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                {contribForm.tipo === 'campanha' && (
                                  <div style={{ gridColumn: '1 / -1' }}>
                                    <Label style={{ fontSize: 11 }}>Nome da campanha</Label>
                                    <Input value={contribForm.campanha} onChange={e => setContribForm(f => ({ ...f, campanha: e.target.value }))} placeholder="Ex: Missões 2026" />
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                                <Button variant="outline" onClick={() => setShowContribForm(false)}>Cancelar</Button>
                                <Button onClick={adicionarContribuicao} disabled={salvandoContrib || !contribForm.valor}>
                                  {salvandoContrib ? 'Salvando...' : 'Registrar'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => setShowContribForm(true)} style={{ marginBottom: 16 }}>
                              <Plus style={{ width: 14, height: 14 }} /> Registrar contribuição
                            </Button>
                          )
                        )}

                        {/* Lista de contribuições recentes */}
                        <div>
                          <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Últimas contribuições
                          </h3>
                          {selectedMembro.contribuicoes?.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {selectedMembro.contribuicoes.map(c => {
                                const tipo = TIPOS_CONTRIBUICAO[c.tipo] || { label: c.tipo, cor: C.text3, bg: '#73737318' };
                                return (
                                  <div key={c.id} style={{ padding: '10px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
                                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, color: tipo.cor, background: tipo.bg, fontWeight: 600, flexShrink: 0 }}>
                                        {tipo.label}
                                      </span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{fmtMoeda(c.valor)}</div>
                                        <div style={{ fontSize: 11, color: C.text3, marginTop: 1 }}>
                                          {new Date(c.data).toLocaleDateString('pt-BR')}
                                          {c.forma_pagamento && ` · ${c.forma_pagamento}`}
                                          {c.campanha && ` · ${c.campanha}`}
                                          {c.origem && c.origem !== 'manual' && ` · ${c.origem}`}
                                        </div>
                                      </div>
                                    </div>
                                    {isDiretor && (
                                      <Button variant="ghost" size="icon" onClick={() => removerContribuicao(c.id)} title="Remover">
                                        <Trash2 style={{ width: 14, height: 14, color: C.red }} />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ padding: '24px 0', textAlign: 'center', color: C.text3, fontSize: 13 }}>
                              Nenhuma contribuição registrada
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </TabsContent>

                {/* Aba: Serviço (Ministérios / Voluntariado / Check-ins) */}
                <TabsContent value="servico" className="mt-4">
                  {(() => {
                    const nivel = NIVEIS_SERVICO[selectedMembro.nivel_servico] || NIVEIS_SERVICO.nunca_serviu;
                    const ativos = selectedMembro.ministerios_ativos || [];
                    const historico = selectedMembro.ministerios_historico || [];
                    const checkins = selectedMembro.checkins || [];
                    const escalas = selectedMembro.escalas_futuras || [];
                    const disponiveis = ministeriosList.filter(m => !ativos.some(a => a.ministerio_id === m.id));
                    return (
                      <>
                        {/* Card de status */}
                        <div style={{ padding: 14, borderRadius: 12, background: nivel.bg, border: `1px solid ${nivel.cor}30`, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: nivel.cor, fontWeight: 700 }}>Nível de Serviço</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 2 }}>{nivel.label}</div>
                            <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{nivel.desc}</div>
                          </div>
                          {selectedMembro.ultimo_checkin && (
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Último check-in</div>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 2 }}>
                                {new Date(selectedMembro.ultimo_checkin).toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Ministérios ativos */}
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text2, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Ministérios atuais
                            </h3>
                            {isDiretor && disponiveis.length > 0 && !showVolForm && (
                              <Button variant="outline" size="sm" onClick={() => setShowVolForm(true)}>
                                <Plus style={{ width: 14, height: 14 }} /> Adicionar
                              </Button>
                            )}
                          </div>

                          {isDiretor && showVolForm && (
                            <div style={{ padding: 14, background: 'var(--cbrio-input-bg)', borderRadius: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                  <Label style={{ fontSize: 11 }}>Ministério *</Label>
                                  <Select value={volForm.ministerio_id} onValueChange={v => setVolForm(f => ({ ...f, ministerio_id: v }))}>
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
                                  <Input value={volForm.papel} onChange={e => setVolForm(f => ({ ...f, papel: e.target.value }))} placeholder="Ex: Vocal, Monitor..." />
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <Button variant="outline" onClick={() => { setShowVolForm(false); setVolForm({ ministerio_id: '', papel: '' }); }}>Cancelar</Button>
                                <Button onClick={adicionarVoluntario} disabled={salvandoVol || !volForm.ministerio_id}>
                                  {salvandoVol ? 'Salvando...' : 'Adicionar'}
                                </Button>
                              </div>
                            </div>
                          )}

                          {ativos.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {ativos.map(v => {
                                const cor = v.ministerio?.cor || C.primary;
                                return (
                                  <div key={v.id} style={{ padding: '10px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderLeft: `3px solid ${cor}` }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{v.ministerio?.nome || '—'}</div>
                                      <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                                        {v.papel && `${v.papel} · `}
                                        desde {new Date(v.desde).toLocaleDateString('pt-BR')}
                                      </div>
                                    </div>
                                    {isDiretor && (
                                      <Button variant="ghost" size="icon" onClick={() => sairVoluntario(v.id)} title="Registrar saída">
                                        <LogOut style={{ width: 14, height: 14, color: C.red }} />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ padding: '16px 0', textAlign: 'center', color: C.text3, fontSize: 13 }}>
                              Não é voluntário em nenhum ministério
                            </div>
                          )}
                        </div>

                        {/* Próximas escalas */}
                        {escalas.length > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Próximas escalas
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {escalas.slice(0, 5).map(e => (
                                <div key={e.id} style={{ padding: '8px 12px', background: 'var(--cbrio-input-bg)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
                                      {e.ministerio?.nome || '—'}
                                      {e.papel && <span style={{ color: C.text3, fontWeight: 400 }}> · {e.papel}</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                                      {new Date(e.data).toLocaleDateString('pt-BR')}
                                      {e.culto && ` · ${e.culto}`}
                                    </div>
                                  </div>
                                  {e.confirmado ? (
                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, color: C.green, background: C.greenBg, fontWeight: 600 }}>Confirmado</span>
                                  ) : (
                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, color: C.amber, background: C.amberBg, fontWeight: 600 }}>Pendente</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Check-ins */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text2, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Check-ins recentes
                            </h3>
                            {isDiretor && !showCheckinForm && (
                              <Button variant="outline" size="sm" onClick={() => setShowCheckinForm(true)}>
                                <Plus style={{ width: 14, height: 14 }} /> Registrar
                              </Button>
                            )}
                          </div>

                          {isDiretor && showCheckinForm && (
                            <div style={{ padding: 14, background: 'var(--cbrio-input-bg)', borderRadius: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                  <Label style={{ fontSize: 11 }}>Data *</Label>
                                  <Input type="date" value={checkinForm.data} onChange={e => setCheckinForm(f => ({ ...f, data: e.target.value }))} />
                                </div>
                                <div>
                                  <Label style={{ fontSize: 11 }}>Ministério</Label>
                                  <Select value={checkinForm.ministerio_id || '__none__'} onValueChange={v => setCheckinForm(f => ({ ...f, ministerio_id: v === '__none__' ? '' : v }))}>
                                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                                    <SelectContent className="z-[1001]">
                                      <SelectItem value="__none__">Não informado</SelectItem>
                                      {ministeriosList.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <Label style={{ fontSize: 11 }}>Culto</Label>
                                  <Input value={checkinForm.culto} onChange={e => setCheckinForm(f => ({ ...f, culto: e.target.value }))} placeholder="Ex: Culto da manhã" />
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <Button variant="outline" onClick={() => { setShowCheckinForm(false); setCheckinForm({ ministerio_id: '', data: new Date().toISOString().slice(0, 10), culto: '' }); }}>Cancelar</Button>
                                <Button onClick={registrarCheckin} disabled={salvandoCheckin}>
                                  {salvandoCheckin ? 'Salvando...' : 'Registrar'}
                                </Button>
                              </div>
                            </div>
                          )}

                          {checkins.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {checkins.slice(0, 10).map(ci => {
                                const cor = ci.ministerio?.cor || C.text3;
                                return (
                                  <div key={ci.id} style={{ padding: '8px 12px', background: 'var(--cbrio-input-bg)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
                                      <Activity style={{ width: 14, height: 14, color: cor, flexShrink: 0 }} />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
                                          {ci.ministerio?.nome || 'Check-in geral'}
                                        </div>
                                        <div style={{ fontSize: 11, color: C.text3, marginTop: 1 }}>
                                          {new Date(ci.data).toLocaleDateString('pt-BR')}
                                          {ci.culto && ` · ${ci.culto}`}
                                          {ci.origem && ci.origem !== 'manual' && ` · ${ci.origem}`}
                                        </div>
                                      </div>
                                    </div>
                                    {isDiretor && (
                                      <Button variant="ghost" size="icon" onClick={() => removerCheckin(ci.id)} title="Remover">
                                        <Trash2 style={{ width: 14, height: 14, color: C.red }} />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ padding: '16px 0', textAlign: 'center', color: C.text3, fontSize: 13 }}>
                              Nenhum check-in registrado
                            </div>
                          )}
                        </div>

                        {/* Histórico de ministérios */}
                        {historico.length > 0 && (
                          <div>
                            <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Ministérios passados
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {historico.map(v => (
                                <div key={v.id} style={{ padding: '8px 12px', background: 'var(--cbrio-input-bg)', borderRadius: 10, opacity: 0.75 }}>
                                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{v.ministerio?.nome || '—'}</div>
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
                    );
                  })()}
                </TabsContent>

                {/* Aba: Trilha dos Valores */}
                <TabsContent value="trilha" className="mt-4">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {TRILHA_ETAPAS.map((etapa, i) => {
                      const registro = selectedMembro.trilha?.find(t => t.etapa === etapa.key);
                      const concluida = registro?.concluida;
                      const carregando = togglingEtapa === etapa.key;
                      return (
                        <div key={etapa.key} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                            <button
                              type="button"
                              onClick={() => toggleEtapa(etapa.key)}
                              disabled={!isDiretor || carregando}
                              title={isDiretor ? (concluida ? 'Marcar como pendente' : 'Marcar como concluída') : ''}
                              style={{
                                width: 24, height: 24, borderRadius: '50%',
                                background: concluida ? C.primary : 'transparent',
                                border: `2px solid ${concluida ? C.primary : C.border}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: 0,
                                cursor: isDiretor && !carregando ? 'pointer' : 'default',
                                opacity: carregando ? 0.5 : 1,
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {concluida ? (
                                <CheckCircle2 style={{ width: 14, height: 14, color: 'var(--cbrio-bg)' }} />
                              ) : (
                                <Circle style={{ width: 10, height: 10, color: C.text3 }} />
                              )}
                            </button>
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
                  {isDiretor && (
                    <div style={{ fontSize: 11, color: C.text3, marginTop: 16, fontStyle: 'italic' }}>
                      Clique em um círculo para marcar/desmarcar a etapa.
                    </div>
                  )}
                </TabsContent>

                {/* Aba: Histórico */}
                <TabsContent value="historico" className="mt-4">
                  {isDiretor && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <Input
                        value={novoHist}
                        onChange={e => setNovoHist(e.target.value)}
                        placeholder="Registrar novo evento..."
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); adicionarHistorico(); } }}
                      />
                      <Button onClick={adicionarHistorico} disabled={salvandoHist || !novoHist.trim()}>
                        {salvandoHist ? 'Salvando...' : 'Adicionar'}
                      </Button>
                    </div>
                  )}
                  {selectedMembro.historico?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {selectedMembro.historico.map(h => (
                        <div key={h.id} style={{ padding: '10px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: C.text, wordBreak: 'break-word' }}>{h.descricao}</div>
                            {h.registrado?.name && (
                              <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>por {h.registrado.name}</div>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: C.text3, flexShrink: 0 }}>
                            {new Date(h.data).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: C.text3, fontSize: 13 }}>
                      Nenhum registro no histórico
                    </div>
                  )}
                </TabsContent>
              </Tabs>
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

      {/* Share Link / QR Code Modal */}
      <ShareCadastroLinkDialog open={showShareLink} onOpenChange={setShowShareLink} />
    </div>
  );
}

function ShareCadastroLinkDialog({ open, onOpenChange }) {
  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/cadastro-membresia`
    : '/cadastro-membresia';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(publicUrl)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Link copiado para a área de transferência');
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  const shareLink = async () => {
    const shareData = {
      title: 'Cadastro de Membresia - CBRio',
      text: 'Preencha seu cadastro de membresia:',
      url: publicUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await copyLink();
      }
    } catch {
      /* usuário cancelou o compartilhamento */
    }
  };

  const downloadQr = async () => {
    try {
      const resp = await fetch(qrUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cadastro-membresia-qrcode.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Não foi possível baixar o QR Code');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <QrCode style={{ width: 18, height: 18, color: '#00B39D' }} />
            Link público de cadastro
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--cbrio-text2)', textAlign: 'center', margin: 0 }}>
            Compartilhe este link ou QR Code para que novos membros preencham o formulário público.
          </p>

          <div style={{
            padding: 12,
            borderRadius: 12,
            border: '1px solid var(--cbrio-border)',
            background: '#fff',
          }}>
            <img
              src={qrUrl}
              alt="QR Code para cadastro público"
              width={240}
              height={240}
              style={{ display: 'block', width: 240, height: 240 }}
            />
          </div>

          <div style={{ display: 'flex', width: '100%', gap: 8 }}>
            <Input readOnly value={publicUrl} onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" onClick={copyLink} title="Copiar link">
              <Copy style={{ width: 16, height: 16 }} />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={downloadQr}>
            <Download style={{ width: 16, height: 16 }} /> Baixar QR Code
          </Button>
          <Button type="button" onClick={shareLink}>
            <Share2 style={{ width: 16, height: 16 }} /> Compartilhar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
