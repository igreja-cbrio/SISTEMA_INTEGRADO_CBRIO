import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { grupos as api, membresia } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Users, MapPin, Clock, Plus, Search, ChevronLeft, UserPlus, X, ArrowRightLeft, FileUp, Trash2, FileText, Image, File as FileIcon, Map as MapIcon, ListChecks, ClipboardCheck, Calendar } from 'lucide-react';
import ProcessosTarefas from '../../components/ProcessosTarefas';
import { GruposMapView } from '@/components/grupos/GruposMapView';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6',
};

const DIAS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
const RECORRENCIAS = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
];

const TIPOS_GRUPO = ['Conexao', 'Estudo', 'Jornada 180', 'Discipulado', 'Casais', 'Jovens', 'Mulheres', 'Homens', 'Misto'];

function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } }

// v2 - tabs membros/arquivos
export default function Grupos() {
  const { profile } = useAuth();
  const [gruposList, setGruposList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addMembroOpen, setAddMembroOpen] = useState(false);
  const [membrosSearch, setMembrosSearch] = useState('');
  const [allMembros, setAllMembros] = useState([]);
  const [gruposForSelect, setGruposForSelect] = useState([]);
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterDia, setFilterDia] = useState('all');
  const [filterLocal, setFilterLocal] = useState('all');
  const [filterTema, setFilterTema] = useState('all');
  const [pageTab, setPageTab] = useState('grupos');
  const [materiais, setMateriais] = useState([]);
  const [materiaisFilter, setMateriaisFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [uploadComment, setUploadComment] = useState('');
  const [uploadEtiquetas, setUploadEtiquetas] = useState(['Todos']);
  const [uploadGrupoIds, setUploadGrupoIds] = useState([]);
  const [customTag, setCustomTag] = useState('');
  const [chamadaOpen, setChamadaOpen] = useState(false);
  const [encontros, setEncontros] = useState([]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.list();
      setGruposList(data || []);
      setGruposForSelect((data || []).filter(g => g.ativo));
    } catch { toast.error('Erro ao carregar grupos'); }
    finally { setLoading(false); }
  }, []);

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const data = await api.get(id);
      setDetailData(data);
    } catch { toast.error('Erro ao carregar detalhe'); }
    finally { setDetailLoading(false); }
  }, []);

  // Render otimista: ao clicar num card, monta detailData a partir do
  // item da lista para a transicao ser instantanea; loadDetail
  // enriquece em segundo plano com membros/historico/multiplicacoes.
  const openGrupo = useCallback((g) => {
    if (!g) return;
    setSelectedGrupo(g.id);
    setDetailData({
      ...g,
      lider: g.lider_id ? { id: g.lider_id, nome: g.lider_nome, foto_url: g.lider_foto } : null,
      grupo_origem: g.grupo_origem_id ? { id: g.grupo_origem_id, nome: g.grupo_origem_nome } : null,
      membros: [],
      multiplicacoes: [],
      historico: [],
      _optimistic: true,
    });
  }, []);

  const openGrupoById = useCallback((id) => {
    const g = gruposList.find(x => x.id === id);
    if (g) openGrupo(g);
    else setSelectedGrupo(id);
  }, [gruposList, openGrupo]);

  const loadMateriais = useCallback(async () => {
    try {
      const params = materiaisFilter !== 'all' ? { etiqueta: materiaisFilter } : {};
      const data = await api.materiais(params);
      setMateriais(data || []);
    } catch {}
  }, [materiaisFilter]);

  const loadEncontros = useCallback(async (id) => {
    try {
      const data = await api.encontros(id, { limit: 10 });
      setEncontros(data || []);
    } catch { setEncontros([]); }
  }, []);

  const handleRegistrarEncontro = async ({ data, tema, observacoes, membros_presentes }) => {
    try {
      await api.registrarEncontro(selectedGrupo, { data, tema, observacoes, membros_presentes });
      toast.success(`Encontro registrado (${membros_presentes.length} presentes)`);
      setChamadaOpen(false);
      loadEncontros(selectedGrupo);
      loadDetail(selectedGrupo);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Erro ao registrar encontro';
      toast.error(msg);
    }
  };

  const handleRemoverEncontro = async (encontroId) => {
    if (!window.confirm('Remover este encontro? As presencas serao revertidas.')) return;
    try {
      await api.removerEncontro(encontroId);
      toast.success('Encontro removido');
      loadEncontros(selectedGrupo);
      loadDetail(selectedGrupo);
    } catch { toast.error('Erro ao remover encontro'); }
  };

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (pageTab === 'materiais') loadMateriais(); }, [pageTab, loadMateriais]);

  useEffect(() => {
    if (selectedGrupo) {
      loadDetail(selectedGrupo);
      loadEncontros(selectedGrupo);
    } else {
      setEncontros([]);
    }
  }, [selectedGrupo, loadDetail, loadEncontros]);

  const openCreate = () => { setEditData(null); setModalOpen(true); };
  const openEdit = () => { setEditData(detailData); setModalOpen(true); };

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (form.id) {
        await api.update(form.id, form);
        toast.success('Grupo atualizado');
      } else {
        await api.create(form);
        toast.success('Grupo criado');
      }
      setModalOpen(false);
      await loadList();
      if (form.id) loadDetail(form.id);
    } catch (e) { toast.error(e.message || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!detailData?.id) return;
    if (!window.confirm('Desativar este grupo?')) return;
    try {
      await api.remove(detailData.id);
      toast.success('Grupo desativado');
      setSelectedGrupo(null);
      setDetailData(null);
      loadList();
    } catch { toast.error('Erro ao desativar'); }
  };

  const handleAddMembro = async (membroId) => {
    try {
      await api.addMembro(selectedGrupo, { membro_id: membroId });
      toast.success('Membro adicionado');
      setAddMembroOpen(false);
      loadDetail(selectedGrupo);
      loadList();
    } catch (e) { toast.error(e.message || 'Erro ao adicionar'); }
  };

  const handleRemoveMembro = async (participacaoId) => {
    if (!window.confirm('Remover este membro do grupo?')) return;
    try {
      await api.sairMembro(participacaoId, { motivo: 'Removido pelo lider' });
      toast.success('Membro removido');
      loadDetail(selectedGrupo);
      loadList();
    } catch { toast.error('Erro ao remover'); }
  };

  const handleUploadMaterial = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo deve ter no maximo 10MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('arquivo', file);
      fd.append('nome', file.name);
      fd.append('comentario', uploadComment || `Upload por ${profile?.name || 'usuario'}`);
      fd.append('etiquetas', JSON.stringify(uploadEtiquetas.length > 0 ? uploadEtiquetas : ['Todos']));
      fd.append('grupo_ids', JSON.stringify(uploadGrupoIds));
      await api.uploadMaterial(fd);
      toast.success('Material enviado');
      setUploadComment('');
      setUploadEtiquetas(['Todos']);
      setUploadGrupoIds([]);
      loadMateriais();
    } catch (e) { toast.error(e.message || 'Erro ao enviar'); }
    finally { setUploading(false); }
  };

  const handleDeleteMaterial = async (docId) => {
    if (!window.confirm('Remover este material?')) return;
    try {
      await api.removeMaterial(docId);
      toast.success('Material removido');
      loadMateriais();
    } catch { toast.error('Erro ao remover'); }
  };

  const loadMembros = async () => {
    try {
      const data = await membresia.membros.list();
      setAllMembros(data || []);
    } catch {}
  };

  // Extrair opcoes unicas para filtros
  const tiposUnicos = [...new Set(gruposList.map(g => g.categoria).filter(Boolean))].sort();
  const locaisUnicos = [...new Set(gruposList.map(g => g.local).filter(Boolean))].sort();
  const temasUnicos = [...new Set(gruposList.map(g => g.tema).filter(Boolean))].sort();

  const filtered = gruposList.filter(g => {
    if (search) {
      const s = search.toLowerCase();
      if (!(g.nome?.toLowerCase().includes(s) || g.lider_nome?.toLowerCase().includes(s) || g.local?.toLowerCase().includes(s) || g.tema?.toLowerCase().includes(s))) return false;
    }
    if (filterTipo !== 'all' && g.categoria !== filterTipo) return false;
    if (filterDia !== 'all' && String(g.dia_semana) !== filterDia) return false;
    if (filterLocal !== 'all' && g.local !== filterLocal) return false;
    if (filterTema !== 'all' && g.tema !== filterTema) return false;
    return true;
  });

  const hasActiveFilters = filterTipo !== 'all' || filterDia !== 'all' || filterLocal !== 'all' || filterTema !== 'all';

  // ── DETALHE DO GRUPO ──
  if (selectedGrupo && detailData) {
    const g = detailData;
    const isOptimistic = g._optimistic === true;
    const membrosAtivos = g.membros || [];
    const visitantes = membrosAtivos.filter(m => m.is_visitante);
    const regulares = membrosAtivos.filter(m => !m.is_visitante);
    const totalMembros = isOptimistic ? (g.membros_count ?? null) : membrosAtivos.length;

    return (
      <div key={selectedGrupo} style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto', animation: 'cbrio-stagger-in 0.18s ease-out' }}>
        <button onClick={() => { setSelectedGrupo(null); setDetailData(null); }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          <ChevronLeft size={16} /> Voltar para grupos
        </button>

        {/* Header */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
          <div style={{ width: 80, height: 80, borderRadius: 16, background: g.foto_url ? `url(${g.foto_url}) center/cover` : C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {!g.foto_url && <Users size={32} style={{ color: C.primary }} />}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{g.nome}</h1>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              {g.lider && <span style={{ fontSize: 13, color: C.t2 }}>Lider: <strong style={{ color: C.text }}>{g.lider.nome}</strong></span>}
              {g.local && <span style={{ fontSize: 13, color: C.t2, display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {g.local}</span>}
              {g.dia_semana != null && <span style={{ fontSize: 13, color: C.t2, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {DIAS[g.dia_semana]} {g.horario?.slice(0, 5)}</span>}
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: g.ativo ? '#10b98120' : '#ef444420', color: g.ativo ? C.green : C.red, fontWeight: 600 }}>{g.ativo ? 'Ativo' : 'Inativo'}</span>
            </div>
            {g.tema && <div style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>Tema: {g.tema}</div>}
            {g.descricao && <div style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>{g.descricao}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button size="sm" variant="outline" onClick={openEdit}>Editar</Button>
            <Button size="sm" variant="destructive" onClick={handleDelete}>Desativar</Button>
          </div>
        </div>

        {/* Info cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Membros', value: isOptimistic ? null : regulares.length, color: C.primary },
            { label: 'Visitantes', value: isOptimistic ? null : visitantes.length, color: C.amber },
            { label: 'Total', value: totalMembros, color: C.blue },
            { label: 'Multiplicacoes', value: isOptimistic ? null : (g.multiplicacoes?.length || 0), color: '#8b5cf6' },
          ].map(k => (
            <div key={k.label} style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: k.color, opacity: k.value == null ? 0.3 : 1 }}>
                {k.value == null ? '—' : k.value}
              </div>
              <div style={{ fontSize: 12, color: C.t3 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Grupo de origem e multiplicacoes */}
        {(g.grupo_origem || g.multiplicacoes?.length > 0) && (
          <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ArrowRightLeft size={16} style={{ color: C.primary }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Arvore de multiplicacao</span>
            </div>
            {g.grupo_origem && (
              <div style={{ fontSize: 13, color: C.t2, marginBottom: 4 }}>
                Nasceu de: <button onClick={() => openGrupoById(g.grupo_origem.id)} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontWeight: 600 }}>{g.grupo_origem.nome}</button>
              </div>
            )}
            {g.multiplicacoes?.length > 0 && (
              <div style={{ fontSize: 13, color: C.t2 }}>
                Multiplicou em: {g.multiplicacoes.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && ', '}
                    <button onClick={() => openGrupoById(m.id)} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontWeight: 600 }}>{m.nome}</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Membros */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              Membros ({isOptimistic ? (g.membros_count ?? '...') : membrosAtivos.length})
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="outline" disabled={isOptimistic || membrosAtivos.length === 0} onClick={() => setChamadaOpen(true)}>
                <ClipboardCheck size={14} style={{ marginRight: 4 }} /> Registrar encontro
              </Button>
              <Button size="sm" onClick={() => { loadMembros(); setAddMembroOpen(true); }}>
                <UserPlus size={14} style={{ marginRight: 4 }} /> Adicionar
              </Button>
            </div>
          </div>
          {isOptimistic ? (
            <div>
              {Array.from({ length: Math.min(g.membros_count || 3, 5) }).map((_, i) => (
                <div key={i} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.border}`, opacity: 0.5 - (i * 0.08), animation: 'cbrio-pulse 1.4s ease-in-out infinite' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.border, flexShrink: 0 }} />
                  <div style={{ height: 12, borderRadius: 6, background: C.border, flex: 1, maxWidth: 200 }} />
                  <div style={{ height: 10, borderRadius: 5, background: C.border, width: 80 }} />
                </div>
              ))}
            </div>
          ) : membrosAtivos.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum membro neste grupo</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--cbrio-table-header)' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Nome</th>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Telefone</th>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Entrou em</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Presencas</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Tipo</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3 }}></th>
                </tr>
              </thead>
              <tbody>
                {membrosAtivos.map(m => (
                  <tr key={m.participacao_id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.foto_url ? `url(${m.foto_url}) center/cover` : C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: C.primary }}>
                        {!m.foto_url && (m.nome?.charAt(0) || '?')}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.nome}</span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: C.t2 }}>{m.telefone || '-'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: C.t2 }}>{fmtDate(m.entrou_em)}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: C.t2, textAlign: 'center' }}>{m.presencas}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: m.is_visitante ? '#f59e0b20' : '#10b98120', color: m.is_visitante ? C.amber : C.green, fontWeight: 600 }}>
                        {m.is_visitante ? 'Visitante' : 'Membro'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <button onClick={() => handleRemoveMembro(m.participacao_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 11 }}><X size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Encontros recentes */}
        {!isOptimistic && (
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginTop: 16 }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={14} style={{ color: C.primary }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Encontros recentes ({encontros.length})</span>
            </div>
            {encontros.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>
                Nenhum encontro registrado. Clique em "Registrar encontro" para fazer a primeira chamada.
              </div>
            ) : (
              <div>
                {encontros.map(enc => (
                  <div key={enc.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: C.primaryBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: C.primary, textTransform: 'uppercase' }}>{new Date(enc.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.primary, lineHeight: 1 }}>{new Date(enc.data + 'T12:00:00').getDate()}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{enc.tema || 'Encontro'}</div>
                      <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                        {enc.total_presentes} presentes
                        {enc.registrado_por_nome && ` · ${enc.registrado_por_nome}`}
                      </div>
                      {enc.observacoes && <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>{enc.observacoes}</div>}
                    </div>
                    <button onClick={() => handleRemoverEncontro(enc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, padding: 6 }} title="Remover encontro"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Observacoes */}
        {g.observacoes && (
          <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Observacoes</div>
            <div style={{ fontSize: 13, color: C.t2, whiteSpace: 'pre-wrap' }}>{g.observacoes}</div>
          </div>
        )}

        {/* Modal de chamada */}
        <ChamadaModal
          open={chamadaOpen}
          onClose={() => setChamadaOpen(false)}
          membros={membrosAtivos}
          onSubmit={handleRegistrarEncontro}
        />

        {/* Modal adicionar membro */}
        <Dialog open={addMembroOpen} onOpenChange={setAddMembroOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Adicionar membro ao grupo</DialogTitle></DialogHeader>
            <Input placeholder="Buscar membro..." value={membrosSearch} onChange={e => setMembrosSearch(e.target.value)} />
            <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8 }}>
              {allMembros
                .filter(m => m.nome?.toLowerCase().includes(membrosSearch.toLowerCase()))
                .filter(m => !membrosAtivos.some(a => a.id === m.id))
                .slice(0, 20)
                .map(m => (
                  <div key={m.id} onClick={() => handleAddMembro(m.id)} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8 }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.primary }}>{m.nome?.charAt(0)}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.nome}</div>
                      <div style={{ fontSize: 11, color: C.t3 }}>{m.telefone || m.email || ''}</div>
                    </div>
                  </div>
                ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal editar grupo */}
        <GrupoFormModal open={modalOpen} onClose={() => setModalOpen(false)} data={editData} onSave={handleSave} saving={saving} gruposForSelect={gruposForSelect} allMembros={allMembros} loadMembros={loadMembros} />
      </div>
    );
  }

  // ── LISTA DE GRUPOS ──
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Grupos</h1>
        {pageTab === 'grupos' && <Button onClick={openCreate}><Plus size={16} style={{ marginRight: 6 }} /> Novo Grupo</Button>}
      </div>

      {/* Tabs principais: Grupos | Mapa | Materiais */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
        {[
          { key: 'grupos', label: 'Grupos', icon: Users },
          { key: 'mapa', label: 'Mapa', icon: MapIcon },
          { key: 'materiais', label: 'Materiais', icon: FileText },
          { key: 'tarefas', label: 'Tarefas', icon: ListChecks },
        ].map(tab => (
          <button key={tab.key} onClick={() => setPageTab(tab.key)} style={{
            padding: '10px 24px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: pageTab === tab.key ? 700 : 400,
            color: pageTab === tab.key ? C.primary : C.t3,
            borderBottom: pageTab === tab.key ? `2px solid ${C.primary}` : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
          }}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB MAPA ═══ */}
      {pageTab === 'mapa' && (
        <div style={{ height: 'calc(100vh - 220px)', minHeight: 500, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>
          ) : (
            <GruposMapView
              grupos={gruposList.filter(g => g.ativo)}
              variant="admin"
              defaultTheme="dark"
            />
          )}
        </div>
      )}

      {/* ═══ TAB MATERIAIS ═══ */}
      {pageTab === 'materiais' && (
        <div>
          {/* Upload */}
          <div style={{ background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileUp size={16} /> Enviar material
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Label style={{ fontSize: 11 }}>Comentario</Label>
                <Input placeholder="Ex: Roteiro semana 14/04, Devocional igreja..." value={uploadComment} onChange={e => setUploadComment(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <Label style={{ fontSize: 11 }}>Etiquetas (para quem vai esse material?)</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {['Todos', ...TIPOS_GRUPO].map(tag => {
                  const active = uploadEtiquetas.includes(tag);
                  return (
                    <button key={tag} onClick={() => {
                      if (tag === 'Todos') { setUploadEtiquetas(['Todos']); return; }
                      setUploadEtiquetas(prev => {
                        const without = prev.filter(t => t !== 'Todos');
                        return active ? without.filter(t => t !== tag) : [...without, tag];
                      });
                    }} style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer',
                      border: active ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                      background: active ? C.primaryBg : 'transparent', color: active ? C.primary : C.t3,
                    }}>{tag}</button>
                  );
                })}
                {/* Etiqueta livre */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input placeholder="Customizada..." value={customTag} onChange={e => setCustomTag(e.target.value)} style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, border: `1px solid ${C.border}`,
                    background: 'transparent', color: C.text, width: 120, outline: 'none',
                  }} onKeyDown={e => {
                    if (e.key === 'Enter' && customTag.trim()) {
                      setUploadEtiquetas(prev => [...prev.filter(t => t !== 'Todos'), customTag.trim()]);
                      setCustomTag('');
                    }
                  }} />
                </div>
              </div>
              {uploadEtiquetas.length > 0 && (
                <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>
                  Selecionado: {uploadEtiquetas.join(', ')}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 10 }}>
              <Label style={{ fontSize: 11 }}>Grupos especificos (opcional)</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {gruposList.filter(g => g.ativo).map(g => {
                  const active = uploadGrupoIds.includes(g.id);
                  return (
                    <button key={g.id} onClick={() => setUploadGrupoIds(prev => active ? prev.filter(x => x !== g.id) : [...prev, g.id])} style={{
                      padding: '3px 10px', borderRadius: 16, fontSize: 10, cursor: 'pointer',
                      border: active ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                      background: active ? '#3b82f620' : 'transparent', color: active ? C.blue : C.t3, fontWeight: active ? 600 : 400,
                    }}>{g.nome}</button>
                  );
                })}
              </div>
            </div>
            <label style={{
              padding: '8px 20px', borderRadius: 8, background: C.primary, color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, opacity: uploading ? 0.6 : 1,
            }}>
              <FileUp size={14} /> {uploading ? 'Enviando...' : 'Escolher arquivo e enviar'}
              <input type="file" hidden disabled={uploading} onChange={e => { if (e.target.files?.[0]) handleUploadMaterial(e.target.files[0]); e.target.value = ''; }} />
            </label>
            <span style={{ fontSize: 11, color: C.t3, marginLeft: 10 }}>Max 10MB. Vai automaticamente para o SharePoint.</span>
          </div>

          {/* Filtro de etiquetas */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.t2, fontWeight: 600 }}>Filtrar:</span>
            {['all', 'Todos', ...TIPOS_GRUPO].map(tag => {
              const active = materiaisFilter === tag;
              return (
                <button key={tag} onClick={() => setMateriaisFilter(tag)} style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  border: active ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                  background: active ? C.primaryBg : 'transparent', color: active ? C.primary : C.t3, fontWeight: active ? 600 : 400,
                }}>{tag === 'all' ? 'Tudo' : tag}</button>
              );
            })}
            <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>{materiais.length} materiais</span>
          </div>

          {/* Lista */}
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {materiais.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum material encontrado</div>
            ) : materiais.map(doc => {
              const ext = doc.tipo || doc.nome?.split('.').pop() || '';
              const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext.toLowerCase());
              const isPdf = ext.toLowerCase() === 'pdf';
              const DocIcon = isImg ? Image : isPdf ? FileText : FileIcon;
              const iconColor = isImg ? '#ec4899' : isPdf ? '#ef4444' : C.blue;
              const url = doc.sharepoint_url || doc.storage_path;
              return (
                <div key={doc.id} style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${iconColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <DocIcon size={20} style={{ color: iconColor }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                      {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: C.text, textDecoration: 'none' }} onMouseEnter={e => e.target.style.color = C.primary} onMouseLeave={e => e.target.style.color = C.text}>{doc.nome}</a> : doc.nome}
                    </div>
                    <div style={{ fontSize: 11, color: C.t3, display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                      {doc.uploaded_by_name && <span>{doc.uploaded_by_name}</span>}
                      <span>{fmtDate(doc.created_at?.split('T')[0])}</span>
                      {doc.comentario && <span style={{ color: C.t2 }}>- {doc.comentario}</span>}
                    </div>
                    {(doc.etiquetas?.length > 0) && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {doc.etiquetas.map(tag => (
                          <span key={tag} style={{ fontSize: 10, padding: '1px 8px', borderRadius: 99, background: tag === 'Todos' ? '#10b98118' : C.primaryBg, color: tag === 'Todos' ? C.green : C.primary, fontWeight: 500 }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                    {doc.sharepoint_url && <a href={doc.sharepoint_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.primary, fontWeight: 600 }}>SharePoint</a>}
                    <button onClick={() => handleDeleteMaterial(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red }}><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ TAB TAREFAS ═══ */}
      {pageTab === 'tarefas' && <ProcessosTarefas area="Grupos" />}

      {/* ═══ TAB GRUPOS ═══ */}
      {pageTab === 'grupos' && <>
      <div style={{ marginBottom: 12, position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
        <Input placeholder="Buscar grupo, lider, local ou tema..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <ShadSelect value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {tiposUnicos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            {TIPOS_GRUPO.filter(t => !tiposUnicos.includes(t)).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </ShadSelect>

        <ShadSelect value={filterDia} onValueChange={setFilterDia}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Dia" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os dias</SelectItem>
            {DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
          </SelectContent>
        </ShadSelect>

        <ShadSelect value={filterLocal} onValueChange={setFilterLocal}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Local" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os locais</SelectItem>
            {locaisUnicos.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </ShadSelect>

        <ShadSelect value={filterTema} onValueChange={setFilterTema}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Tema" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os temas</SelectItem>
            {temasUnicos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </ShadSelect>

        {hasActiveFilters && (
          <button onClick={() => { setFilterTipo('all'); setFilterDia('all'); setFilterLocal('all'); setFilterTema('all'); }}
            style={{ fontSize: 11, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <X size={12} /> Limpar filtros
          </button>
        )}

        <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>{filtered.length} de {gruposList.length} grupos</span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>
          {search ? 'Nenhum grupo encontrado' : 'Nenhum grupo cadastrado'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(g => (
            <div key={g.id} onClick={() => openGrupo(g)} style={{
              background: C.card, borderRadius: 14, padding: 18, border: `1px solid ${C.border}`,
              cursor: 'pointer', transition: 'border-color 0.15s, transform 0.1s',
            }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.99)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.primary}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: g.foto_url ? `url(${g.foto_url}) center/cover` : C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {!g.foto_url && <Users size={22} style={{ color: C.primary }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{g.nome}</div>
                  {g.lider_nome && <div style={{ fontSize: 12, color: C.t2, marginBottom: 2 }}>Lider: {g.lider_nome}</div>}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                    {g.dia_semana != null && (
                      <span style={{ fontSize: 11, color: C.t3, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={11} /> {DIAS[g.dia_semana]} {g.horario?.slice(0, 5)}
                      </span>
                    )}
                    {g.local && (
                      <span style={{ fontSize: 11, color: C.t3, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <MapPin size={11} /> {g.local}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.primary }}>{g.membros_count}</div>
                  <div style={{ fontSize: 10, color: C.t3 }}>membros</div>
                </div>
              </div>
              {g.grupo_origem_nome && (
                <div style={{ fontSize: 11, color: C.t3, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                  Multiplicado de: {g.grupo_origem_nome}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      </>}

      <GrupoFormModal open={modalOpen} onClose={() => setModalOpen(false)} data={editData} onSave={handleSave} saving={saving} gruposForSelect={gruposForSelect} allMembros={allMembros} loadMembros={loadMembros} />
    </div>
  );
}

// ── MODAL DE FORMULARIO ──
function GrupoFormModal({ open, onClose, data, onSave, saving, gruposForSelect, allMembros, loadMembros }) {
  const [form, setForm] = useState({});
  const [liderSearch, setLiderSearch] = useState('');

  useEffect(() => {
    if (open) {
      loadMembros();
      setForm(data ? { ...data } : {
        nome: '', categoria: '', lider_id: '', local: '', endereco: '',
        dia_semana: '', horario: '', recorrencia: 'semanal', tema: '',
        foto_url: '', observacoes: '', grupo_origem_id: '', descricao: '',
      });
      setLiderSearch(data?.lider?.nome || '');
    }
  }, [open, data]);

  const liderNome = form.lider?.nome
    || allMembros.find(m => m.id === form.lider_id)?.nome
    || null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nome?.trim()) { toast.error('Nome e obrigatorio'); return; }
    const { _geocoding, ...rest } = form;
    onSave({
      ...rest,
      dia_semana: rest.dia_semana === '' ? null : Number(rest.dia_semana),
      lider_id: rest.lider_id || null,
      grupo_origem_id: rest.grupo_origem_id || null,
      lat: rest.lat || null,
      lng: rest.lng || null,
      cep: rest.cep || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.id ? 'Editar Grupo' : 'Novo Grupo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Label>Nome do grupo *</Label>
            <Input value={form.nome || ''} onChange={e => set('nome', e.target.value)} placeholder="Ex: Conexao Barra" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Tipo de grupo</Label>
              <ShadSelect value={form.categoria || ''} onValueChange={v => set('categoria', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_GRUPO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </ShadSelect>
            </div>
            <div>
              <Label>Recorrencia</Label>
              <ShadSelect value={form.recorrencia || 'semanal'} onValueChange={v => set('recorrencia', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECORRENCIAS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </ShadSelect>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Dia da semana</Label>
              <ShadSelect value={form.dia_semana?.toString() ?? ''} onValueChange={v => set('dia_semana', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </ShadSelect>
            </div>
            <div>
              <Label>Horario</Label>
              <Input type="time" value={form.horario || ''} onChange={e => set('horario', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Local</Label>
              <Input value={form.local || ''} onChange={e => set('local', e.target.value)} placeholder="Ex: Barra da Tijuca" />
            </div>
            <div>
              <Label>Endereco</Label>
              <Input value={form.endereco || ''} onChange={e => set('endereco', e.target.value)} placeholder="Rua, numero" />
            </div>
          </div>

          <div>
            <Label>CEP (para localizar no mapa)</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                value={form.cep || ''}
                onChange={e => set('cep', e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="00000000"
                maxLength={8}
                style={{ flex: 1 }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!form.cep || form.cep.length < 8 || form._geocoding}
                onClick={async () => {
                  set('_geocoding', true);
                  try {
                    const { membresia: mApi } = await import('../../api');
                    const geo = await mApi.totem.geocodeCep(form.cep);
                    set('lat', geo.lat);
                    set('lng', geo.lng);
                    if (geo.logradouro && !form.endereco) set('endereco', geo.logradouro);
                    if (geo.cidade && !form.local) set('local', geo.cidade);
                    toast.success('Localização encontrada');
                  } catch { toast.error('CEP não encontrado'); }
                  set('_geocoding', false);
                }}
              >
                {form._geocoding ? 'Buscando...' : 'Localizar'}
              </Button>
            </div>
            {form.lat && form.lng && (
              <div style={{ fontSize: 11, color: C.primary, marginTop: 4 }}>
                Coordenadas salvas: {Number(form.lat).toFixed(5)}, {Number(form.lng).toFixed(5)}
              </div>
            )}
          </div>

          <div>
            <Label>Lider</Label>
            <Input placeholder="Buscar lider..." value={liderSearch} onChange={e => setLiderSearch(e.target.value)} />
            {liderSearch.length >= 2 && (
              <div style={{ maxHeight: 150, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, background: C.card }}>
                {allMembros.filter(m => m.nome?.toLowerCase().includes(liderSearch.toLowerCase())).slice(0, 10).map(m => (
                  <div key={m.id} onClick={() => { set('lider_id', m.id); setLiderSearch(m.nome); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {m.nome}
                  </div>
                ))}
              </div>
            )}
            {form.lider_id && !liderSearch && (
              <div style={{ fontSize: 12, color: C.t3, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                Lider selecionado: <strong style={{ color: C.text }}>{liderNome || '...'}</strong>
                <button type="button" onClick={() => set('lider_id', '')} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 11, padding: 0 }}>remover</button>
              </div>
            )}
          </div>

          <div>
            <Label>Tema atual</Label>
            <Input value={form.tema || ''} onChange={e => set('tema', e.target.value)} placeholder="Ex: Serie Inabalavel" />
          </div>

          <div>
            <Label>Grupo de origem (multiplicacao)</Label>
            <ShadSelect value={form.grupo_origem_id || '_none'} onValueChange={v => set('grupo_origem_id', v === '_none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Nenhum</SelectItem>
                {gruposForSelect.filter(g => g.id !== form.id).map(g => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
              </SelectContent>
            </ShadSelect>
          </div>

          <div>
            <Label>Foto (URL)</Label>
            <Input value={form.foto_url || ''} onChange={e => set('foto_url', e.target.value)} placeholder="https://..." />
          </div>

          <div>
            <Label>Descricao</Label>
            <Textarea value={form.descricao || ''} onChange={e => set('descricao', e.target.value)} rows={2} />
          </div>

          <div>
            <Label>Observacoes</Label>
            <Textarea value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)} rows={3} />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : (data?.id ? 'Salvar' : 'Criar Grupo')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── MODAL DE CHAMADA / REGISTRO DE ENCONTRO ──
function ChamadaModal({ open, onClose, membros, onSubmit }) {
  const [data, setData] = useState('');
  const [tema, setTema] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [presentes, setPresentes] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setData(new Date().toISOString().split('T')[0]);
      setTema('');
      setObservacoes('');
      // Default: todos selecionados (mais comum o lider desmarcar quem faltou)
      setPresentes(new Set(membros.map(m => m.id)));
      setSaving(false);
    }
  }, [open, membros]);

  const toggle = (id) => {
    setPresentes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const todosMarcados = membros.length > 0 && membros.every(m => presentes.has(m.id));
  const toggleAll = () => {
    if (todosMarcados) setPresentes(new Set());
    else setPresentes(new Set(membros.map(m => m.id)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!data) { toast.error('Data obrigatoria'); return; }
    setSaving(true);
    await onSubmit({
      data,
      tema: tema.trim(),
      observacoes: observacoes.trim(),
      membros_presentes: Array.from(presentes),
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Registrar encontro</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div>
              <Label style={{ fontSize: 11 }}>Data *</Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} max={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <Label style={{ fontSize: 11 }}>Tema (opcional)</Label>
              <Input value={tema} onChange={e => setTema(e.target.value)} placeholder="Ex: Mateus 5 - Bem-aventurancas" />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Label style={{ fontSize: 11 }}>Presentes ({presentes.size}/{membros.length})</Label>
              <button type="button" onClick={toggleAll} style={{ fontSize: 11, background: 'none', border: 'none', color: '#00B39D', cursor: 'pointer', fontWeight: 600 }}>
                {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto', border: `1px solid var(--cbrio-border)`, borderRadius: 8 }}>
              {membros.map(m => {
                const ativo = presentes.has(m.id);
                return (
                  <label key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderBottom: `1px solid var(--cbrio-border)`, cursor: 'pointer',
                    background: ativo ? '#00B39D12' : 'transparent',
                  }}>
                    <input type="checkbox" checked={ativo} onChange={() => toggle(m.id)} style={{ accentColor: '#00B39D' }} />
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.foto_url ? `url(${m.foto_url}) center/cover` : '#00B39D18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#00B39D', flexShrink: 0 }}>
                      {!m.foto_url && (m.nome?.charAt(0) || '?')}
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--cbrio-text)', fontWeight: ativo ? 600 : 400 }}>{m.nome}</span>
                    {m.is_visitante && <span style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#f59e0b20', color: '#f59e0b', fontWeight: 600 }}>Visitante</span>}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <Label style={{ fontSize: 11 }}>Observacoes (opcional)</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} placeholder="Notas do encontro, oracoes, decisoes..." />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : `Registrar (${presentes.size} presentes)`}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
