import { useState, useEffect, useCallback, useRef } from 'react';
import { ModuleHeader } from '../../components/layout/ModuleHeader';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AbrirRotaMenu } from '../../components/grupos/AbrirRotaMenu';
import { grupos as api, membresia, encaminhamentos } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Users, MapPin, Clock, Plus, Search, ChevronLeft, UserPlus, X, ArrowRightLeft, FileUp, Trash2, FileText, Image, File as FileIcon, Map as MapIcon, CalendarCheck, CalendarPlus, ClipboardCheck, Calendar, Activity, TrendingUp, TrendingDown, Minus, AlertTriangle, Inbox, QrCode, Compass, Copy, Check, Download, ExternalLink, Lock, BarChart3, GraduationCap, Star, UserCog, Eye, Settings, HeartHandshake, BookOpen } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import GruposEntrada from './GruposEntrada';
import InscricaoGruposQRCode from '../admin/InscricaoGruposQRCode';
import TemporadasGrupos from '../admin/TemporadasGrupos';
import TemporadaInscricoesCard from './TemporadaInscricoesCard';
import GruposVisitas, { AgendarVisitaModal } from './GruposVisitas';
import GruposPessoas from './GruposPessoas';
import GruposOrganograma from './GruposOrganograma';
import GruposDuplicatas from './GruposDuplicatas';
// Import ESTÁTICO de propósito (13/07): o chunk dinâmico do mapa quebrava em
// produção e derrubava a página em loop de reload. O GrupoSelector do form
// público já embute o GruposMapView estaticamente — o peso do maplibre já é
// pago onde mais importa; aqui é página de staff. Estático elimina a classe
// inteira de erro de chunk (não regredir pra lazy sem revalidar em prod).
import { GruposMapView } from '@/components/grupos/GruposMapView';
import { StatisticsCard } from '../../components/ui/statistics-card';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6',
};

const DIAS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

const STATUS_TEMPORADA = {
  ativo: { label: 'Ativo', cor: '#10b981', bg: '#10b98120' },
  novo: { label: 'Novo', cor: '#3b82f6', bg: '#3b82f620' },
  aguardando: { label: 'Aguardando', cor: '#f59e0b', bg: '#f59e0b20' },
  a_confirmar: { label: 'A confirmar', cor: '#a855f7', bg: '#a855f720' },
  encerrado: { label: 'Encerrado', cor: '#ef4444', bg: '#ef444420' },
};
const RECORRENCIAS = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
];

const TIPOS_GRUPO = ['Conexao', 'Estudo', 'Jornada 180', 'Discipulado', 'Casais', 'Jovens', 'Mulheres', 'Homens', 'Misto'];

// Mapa virou visualização da aba Grupos e Organograma virou visualização da
// aba Pessoas (Marcos · 2026-07-13): menos abas, mesma informação.
// A aba Configurações fundiu com a de QR (Marcos · 13/07): temporada, abrir/
// fechar inscrições e QR codes são o mesmo assunto — viraram a aba "Inscrições".
const PAGE_TABS = ['grupos', 'pessoas', 'relatorios', 'entrada', 'materiais', 'visitas', 'qrcode'];

// Tipo/papel do membro no grupo · vem da funcao (mem_grupo_membros). "Membro" é
// o padrão (frequentador); "Visitante" só quem foi marcado como tal (regra:
// quem vai >3 vezes vira membro). Líder/treinamento aparecem aqui também.
const TIPO_PAPEL = {
  visitante: { label: 'Visitante', cor: '#f59e0b', bg: '#f59e0b20' },
  frequentador: { label: 'Membro', cor: '#10b981', bg: '#10b98120' },
  lider_treinamento: { label: 'Líder em treinamento', cor: '#8b5cf6', bg: '#8b5cf620' },
  co_lider: { label: 'Co-líder', cor: '#0ea5e9', bg: '#0ea5e920' },
  lider: { label: 'Líder', cor: '#00B39D', bg: '#00B39D20' },
  supervisor: { label: 'Supervisor', cor: '#3b82f6', bg: '#3b82f620' },
  coordenador: { label: 'Coordenador', cor: '#8b5cf6', bg: '#8b5cf620' },
};
// Chaves antigas de aba (links/notificações) → aba nova
const TAB_LEGADO = {
  pedidos: 'entrada', encaminhados: 'entrada', tarefas: 'visitas',
  geocode: 'qrcode', temporadas: 'qrcode', config: 'qrcode', // Configurações fundiu com Inscrições (13/07)
  mapa: 'grupos', organograma: 'pessoas', // viraram visualizações internas (13/07)
};

function tabDaUrl() {
  try { return new URLSearchParams(window.location.search).get('tab'); } catch { return null; }
}
function viewDaUrl() {
  try { return new URLSearchParams(window.location.search).get('view'); } catch { return null; }
}

function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } }

// Campos exigidos pro cadastro do grupo estar completo (capacidade e foto são
// opcionais). Devolve os rótulos do que falta — lista vazia = cadastro completo.
// Telefone do líder: na lista vem em lider_telefone; no detalhe, em lider.telefone.
function camposFaltantes(g) {
  const faltas = [];
  if (!g.lider_id) faltas.push('Líder');
  else if (!(g.lider?.telefone ?? g.lider_telefone)) faltas.push('Telefone do líder');
  if (g.dia_semana == null) faltas.push('Dia da semana');
  if (!g.horario) faltas.push('Horário');
  if (!g.endereco) faltas.push('Endereço');
  if (!g.bairro) faltas.push('Bairro');
  if (!g.faixa_etaria) faltas.push('Faixa etária');
  // Grupo com cara de faixa etária (rótulo ou nome) sem limites numéricos vira
  // pendência pra liderança resolver (Marcos · 2026-07-13) — é o limite que arma
  // a trava de idade do form público. Grupos gerais não precisam.
  const rotuloEtario = ['adolescentes', 'jovens', 'jovens adultos'].includes(String(g.faixa_etaria || '').toLowerCase());
  const nomeEtario = /jovens|jovem|adolescente|teen/i.test(g.nome || '');
  if ((rotuloEtario || nomeEtario) && g.idade_min == null && g.idade_max == null) faltas.push('Idades da faixa (mín/máx)');
  if (!g.categoria) faltas.push('Categoria');
  if (!g.rede_id) faltas.push('Rede');
  return faltas;
}

// Seletor de visualização dentro da aba (Lista|Mapa · Pessoas|Organograma):
// mesma informação, projeções diferentes — uma ativa por vez (Marcos · 13/07).
function ViewToggle({ value, onChange, opcoes }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
      {opcoes.map(op => {
        const ativo = value === op.key;
        return (
          <button key={op.key} onClick={() => onChange(op.key)} type="button" style={{
            padding: '8px 18px', fontSize: 13, fontWeight: ativo ? 700 : 500, cursor: 'pointer',
            border: 'none', background: ativo ? C.primaryBg : 'transparent',
            color: ativo ? C.primary : C.t3, display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {op.Icon && <op.Icon size={15} />} {op.label}
          </button>
        );
      })}
    </div>
  );
}

// v2 - tabs membros/arquivos
export default function Grupos() {
  const navigate = useNavigate();
  const { profile, isAdmin, getAccessLevel } = useAuth();
  // Líder de área com nível 1 (so leitura) na matriz: ve tudo mas não edita.
  // Admin/diretor/lider com nível >=3 edita. Sincroniza com cargo_modulo_permissao.
  const podeEditarGrupos = isAdmin || (getAccessLevel?.(['grupos']) ?? 0) >= 3;
  // Definir/trocar o supervisor do grupo exige nível 5 (igual ao endpoint PUT /:id/supervisor).
  const podeGerenciarSupervisor = isAdmin || (getAccessLevel?.(['grupos']) ?? 0) >= 5;
  const [gruposList, setGruposList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [importLideresOpen, setImportLideresOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addMembroOpen, setAddMembroOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);
  const [membrosSearch, setMembrosSearch] = useState('');
  const [allMembros, setAllMembros] = useState([]);
  // Funil de entrada do botão "Adicionar": direcionados do Next + inscritos
  // neste grupo (em vez da base inteira). buscarBaseToda = escape hatch.
  const [candidatos, setCandidatos] = useState([]);
  const [candidatosLoading, setCandidatosLoading] = useState(false);
  const [buscarBaseToda, setBuscarBaseToda] = useState(false);
  const [supPickerOpen, setSupPickerOpen] = useState(false);
  const [supBusca, setSupBusca] = useState('');
  const [gruposForSelect, setGruposForSelect] = useState([]);
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterDia, setFilterDia] = useState('all');
  const [filterBairro, setFilterBairro] = useState('all');
  const [filterStatusTemp, setFilterStatusTemp] = useState('all');
  const [filterIncompleto, setFilterIncompleto] = useState(false);
  const [filterTemporada, setFilterTemporada] = useState('');
  const [temporadas, setTemporadas] = useState([]);
  // Aba inicial pode vir da URL (/grupos?tab=visitas · usado por notificações).
  // Chaves antigas (pedidos/encaminhados/geocode/temporadas) caem na aba nova
  // certa, com a sub-aba correspondente já selecionada.
  const [pageTab, setPageTab] = useState(() => {
    const t = tabDaUrl();
    if (PAGE_TABS.includes(t)) return t;
    return TAB_LEGADO[t] || 'grupos';
  });
  // Visualizações internas (13/07): Grupos = Lista|Mapa · Pessoas = Pessoas|Organograma.
  // A visualização vai na URL (?view=mapa/…): um reload — inclusive o reload
  // automático de chunk velho pós-deploy — volta exatamente onde a pessoa estava.
  // Deep-links antigos (?tab=mapa / ?tab=organograma) abrem a aba nova já na view certa.
  const [gruposView, setGruposView] = useState(() => (tabDaUrl() === 'mapa' || viewDaUrl() === 'mapa' ? 'mapa' : 'lista'));
  const [pessoasView, setPessoasView] = useState(() => {
    if (tabDaUrl() === 'organograma' || viewDaUrl() === 'organograma') return 'organograma';
    if (viewDaUrl() === 'duplicatas') return 'duplicatas';
    return 'censo';
  });
  // Sub-visualização da aba Inscrições: QR codes (default) | gestão de temporadas
  const [configTab, setConfigTab] = useState(() => (['temporadas', 'geocode', 'config'].includes(tabDaUrl()) ? 'temporadas' : 'qr'));

  const atualizarUrlView = (tab, view) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      if (view) url.searchParams.set('view', view); else url.searchParams.delete('view');
      window.history.replaceState({}, '', url);
    } catch {}
  };
  const trocarGruposView = (v) => { setGruposView(v); atualizarUrlView('grupos', v === 'mapa' ? 'mapa' : null); };
  const trocarPessoasView = (v) => { setPessoasView(v); atualizarUrlView('pessoas', v === 'censo' ? null : v); };
  const [visitaOpen, setVisitaOpen] = useState(false);
  // A aba Inscrições é visível a todos (mandar QR / ver a temporada no ar);
  // a seção de administração dentro dela só renderiza pra quem edita.
  const tabAtiva = pageTab;
  const [pedidosCount, setPedidosCount] = useState(0);
  const [encPendentes, setEncPendentes] = useState(0);
  const [historicoMembros, setHistoricoMembros] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [materiaisFilter, setMateriaisFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [uploadComment, setUploadComment] = useState('');
  const [uploadEtiquetas, setUploadEtiquetas] = useState(['Todos']);
  const [uploadGrupoIds, setUploadGrupoIds] = useState([]);
  const [customTag, setCustomTag] = useState('');
  const [chamadaOpen, setChamadaOpen] = useState(false);
  const [encontroEdit, setEncontroEdit] = useState(null);
  const [encontros, setEncontros] = useState([]);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [metricas, setMetricas] = useState(null);
  const [saudeAgregada, setSaudeAgregada] = useState(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (mostrarArquivados) params.ativo = 'all';
      if (filterTemporada) params.temporada = filterTemporada;
      const data = await api.list(Object.keys(params).length ? params : undefined);
      setGruposList(data || []);
      setGruposForSelect((data || []).filter(g => g.ativo));
    } catch { toast.error('Erro ao carregar grupos'); }
    finally { setLoading(false); }
  }, [mostrarArquivados, filterTemporada]);

  const loadTemporadas = useCallback(async () => {
    try {
      const data = await api.temporadas();
      setTemporadas(data || []);
      // Setar temporada ativa como default na primeira carga
      const ativa = (data || []).find(t => t.ativa);
      if (ativa && !filterTemporada) setFilterTemporada(ativa.id);
    } catch {}
  }, [filterTemporada]);

  useEffect(() => { loadTemporadas(); }, []);

  const loadPedidosCount = useCallback(async () => {
    try {
      const r = await api.contarPedidos();
      setPedidosCount(r?.pendentes || 0);
    } catch {}
  }, []);
  useEffect(() => { loadPedidosCount(); }, [loadPedidosCount, pageTab]);

  // Encaminhados do cuidado pastoral ainda sem desfecho (badge da Caixa de entrada)
  const loadEncPendentes = useCallback(async () => {
    try {
      const r = await encaminhamentos.resumo('grupos');
      setEncPendentes(r?.pendentes || 0);
    } catch {}
  }, []);
  useEffect(() => { loadEncPendentes(); }, [loadEncPendentes, pageTab]);

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const data = await api.get(id);
      setDetailData(data);
      try {
        const hist = await api.historicoMembros(id);
        setHistoricoMembros(hist || []);
      } catch { setHistoricoMembros([]); }
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

  const loadMetricas = useCallback(async (id) => {
    try {
      const data = await api.metricas(id);
      setMetricas(data);
    } catch { setMetricas(null); }
  }, []);

  const loadSaudeAgregada = useCallback(async () => {
    try {
      const data = await api.saudeAgregada(filterTemporada ? { temporada: filterTemporada } : undefined);
      setSaudeAgregada(data);
    } catch { setSaudeAgregada(null); }
  }, [filterTemporada]);

  const handleRegistrarEncontro = async ({ data, tema, observacoes, membros_presentes }) => {
    try {
      if (encontroEdit?.id) {
        await api.atualizarEncontro(encontroEdit.id, { data, tema, observacoes, membros_presentes });
        toast.success(`Encontro atualizado (${membros_presentes.length} presentes)`);
      } else {
        await api.registrarEncontro(selectedGrupo, { data, tema, observacoes, membros_presentes });
        toast.success(`Encontro registrado (${membros_presentes.length} presentes)`);
      }
      setChamadaOpen(false);
      setEncontroEdit(null);
      loadEncontros(selectedGrupo);
      loadDetail(selectedGrupo);
      loadMetricas(selectedGrupo);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Erro ao salvar encontro';
      toast.error(msg);
    }
  };

  const handleEditarEncontro = async (encontroId) => {
    try {
      const data = await api.encontro(encontroId);
      setEncontroEdit(data);
      setChamadaOpen(true);
    } catch { toast.error('Erro ao carregar encontro'); }
  };

  const handleRemoverEncontro = async (encontroId) => {
    if (!window.confirm('Remover este encontro? As presenças serão revertidas.')) return;
    try {
      await api.removerEncontro(encontroId);
      toast.success('Encontro removido');
      loadEncontros(selectedGrupo);
      loadDetail(selectedGrupo);
      loadMetricas(selectedGrupo);
    } catch { toast.error('Erro ao remover encontro'); }
  };

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (tabAtiva === 'materiais') loadMateriais(); }, [tabAtiva, loadMateriais]);

  useEffect(() => {
    if (selectedGrupo) {
      loadDetail(selectedGrupo);
      loadEncontros(selectedGrupo);
      loadMetricas(selectedGrupo);
    } else {
      setEncontros([]);
      setMetricas(null);
    }
  }, [selectedGrupo, loadDetail, loadEncontros, loadMetricas]);

  useEffect(() => {
    if (tabAtiva === 'grupos' && !selectedGrupo) loadSaudeAgregada();
  }, [tabAtiva, selectedGrupo, loadSaudeAgregada, gruposList.length]);

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

  const handleReativar = async () => {
    if (!detailData?.id) return;
    try {
      await api.update(detailData.id, { ...detailData, ativo: true });
      toast.success('Grupo reativado');
      loadDetail(detailData.id);
      loadList();
    } catch { toast.error('Erro ao reativar'); }
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

  // Adiciona uma pessoa do FUNIL DE ENTRADA ao grupo, resolvendo a origem:
  // Next → "engajar" (materializa o vínculo + alimenta NSM/KPI + sincroniza o
  // Next); Inscrição → "aprovar" o pedido (coloca neste grupo + notifica). Assim
  // a pessoa sai da fila e nada fica "pendente pra sempre".
  const handleAddCandidato = async (c) => {
    try {
      if (c.tipo === 'next') {
        await encaminhamentos.contato(c.fonte_id, {
          devolutiva: 'engajou', grupo_id: selectedGrupo,
          observacao: 'Adicionado ao grupo pelo líder',
        });
      } else {
        await api.aprovarPedido(c.fonte_id);
      }
      toast.success('Pessoa adicionada ao grupo');
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

  // Marca/desmarca um membro como "líder em treinamento" naquele grupo (opcional).
  const handleToggleTreinamento = async (participacaoId, emTreino) => {
    try {
      await api.setFuncaoMembro(participacaoId, emTreino ? 'frequentador' : 'lider_treinamento');
      toast.success(emTreino ? 'Removido de líder em treinamento' : 'Marcado como líder em treinamento');
      loadDetail(selectedGrupo);
    } catch (e) { toast.error(e.message || 'Erro ao atualizar função'); }
  };

  // Define/troca/remove o supervisor DESTE grupo (fonte da verdade por grupo;
  // o organograma / aba Supervisão agregam a partir daqui). membroId null = remove.
  const handleSetSupervisor = async (membroId) => {
    try {
      await api.setSupervisor(selectedGrupo, membroId || null);
      toast.success(membroId ? 'Supervisor definido' : 'Supervisor removido');
      setSupPickerOpen(false); setSupBusca('');
      loadDetail(selectedGrupo);
    } catch (e) { toast.error(e?.message || 'Erro ao definir supervisor'); }
  };

  // Marca/desmarca um membro como "líder" do grupo. Um grupo pode ter vários
  // líderes (o "principal" fica em mem_grupos.lider_id; os demais aqui via funcao).
  const handleToggleLider = async (participacaoId, isLider) => {
    try {
      await api.setFuncaoMembro(participacaoId, isLider ? 'frequentador' : 'lider');
      toast.success(isLider ? 'Removido de líder' : 'Marcado como líder');
      loadDetail(selectedGrupo);
    } catch (e) { toast.error(e.message || 'Erro ao atualizar função'); }
  };

  const handleUploadMaterial = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo deve ter no máximo 10MB'); return; }
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

  // Marca o material que o bot do WhatsApp envia aos líderes de grupos (1 por vez)
  const handleMarcarEstudo = async (doc) => {
    try {
      await api.marcarEstudoSemana(doc.id, !doc.estudo_semana);
      toast.success(!doc.estudo_semana
        ? 'Marcado como estudo da semana — o bot envia pros líderes no WhatsApp'
        : 'Desmarcado como estudo da semana');
      loadMateriais();
    } catch (e) { toast.error(e?.response?.data?.error || e.message || 'Erro ao marcar estudo'); }
  };

  const loadMembros = async () => {
    try {
      const data = await membresia.membros.list();
      setAllMembros(data || []);
    } catch {}
  };

  // Carrega o funil de entrada (Next + inscrições deste grupo) pro modal Adicionar
  const loadCandidatos = async (grupoId) => {
    setCandidatosLoading(true);
    try {
      const data = await api.candidatosAdicionar(grupoId);
      setCandidatos(data || []);
    } catch { setCandidatos([]); }
    finally { setCandidatosLoading(false); }
  };

  // Extrair opções únicas para filtros
  const tiposUnicos = [...new Set(gruposList.map(g => g.categoria).filter(Boolean))].sort();
  const diasUnicos = [...new Set(gruposList.map(g => g.dia_semana).filter(v => v != null))].sort((a, b) => a - b);
  const bairrosUnicos = [...new Set(gruposList.map(g => g.bairro).filter(Boolean))].sort();

  const filtered = gruposList.filter(g => {
    if (search) {
      const s = search.toLowerCase();
      if (!(g.codigo?.toLowerCase().includes(s) || g.nome?.toLowerCase().includes(s) || g.lider_nome?.toLowerCase().includes(s) || g.local?.toLowerCase().includes(s) || g.bairro?.toLowerCase().includes(s))) return false;
    }
    if (filterTipo !== 'all' && g.categoria !== filterTipo) return false;
    if (filterDia !== 'all' && String(g.dia_semana) !== filterDia) return false;
    if (filterBairro !== 'all' && g.bairro !== filterBairro) return false;
    if (filterStatusTemp !== 'all' && g.status_temporada !== filterStatusTemp) return false;
    if (filterIncompleto && camposFaltantes(g).length === 0) return false;
    return true;
  });

  const incompletosCount = gruposList.filter(g => camposFaltantes(g).length > 0).length;

  const hasActiveFilters = filterTipo !== 'all' || filterDia !== 'all' || filterBairro !== 'all' || filterStatusTemp !== 'all' || filterIncompleto;

  // ── DETALHE DO GRUPO ──
  if (selectedGrupo && detailData) {
    const g = detailData;
    const isOptimistic = g._optimistic === true;
    const membrosAtivos = g.membros || [];
    // Membro vs visitante vem da funcao (não do nº de presenças): quem o Matheus
    // subiu é frequentador = membro; visitante só quem foi marcado como tal.
    const visitantes = membrosAtivos.filter(m => m.funcao === 'visitante');
    const regulares = membrosAtivos.filter(m => m.funcao !== 'visitante');
    const totalMembros = isOptimistic ? (g.membros_count ?? null) : membrosAtivos.length;

    return (
      <div key={selectedGrupo} className="cbrio-grupos-page" style={{ padding: '24px 20px', maxWidth: 1240, margin: '0 auto', animation: 'cbrio-stagger-in 0.18s ease-out' }}>
        <button onClick={() => { setSelectedGrupo(null); setDetailData(null); }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          <ChevronLeft size={16} /> Voltar para grupos
        </button>

        {/* Header */}
        <div className="cbrio-grupos-detail-header" style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
          <div style={{ width: 80, height: 80, borderRadius: 16, background: g.foto_url ? `url(${g.foto_url}) center/cover` : C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {!g.foto_url && <Users size={32} style={{ color: C.primary }} />}
          </div>
          <div style={{ flex: 1 }}>
            {g.codigo && <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, fontFamily: 'monospace', marginBottom: 2 }}>{g.codigo}</div>}
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{g.nome}</h1>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              {(() => {
                const lid = [];
                if (g.lider) lid.push({ id: g.lider.id, nome: g.lider.nome });
                membrosAtivos.forEach(m => {
                  if ((m.funcao === 'lider' || m.funcao === 'co_lider') && !lid.some(l => l.id === m.id)) lid.push({ id: m.id, nome: m.nome });
                });
                if (!lid.length) return null;
                return <span style={{ fontSize: 13, color: C.t2 }}>{lid.length > 1 ? 'Líderes' : 'Líder'}: <strong style={{ color: C.text }}>{lid.map(l => l.nome).join(', ')}</strong></span>;
              })()}
              {(g.bairro || g.local) && (
                <AbrirRotaMenu
                  lat={g.lat} lng={g.lng}
                  endereco={[g.endereco, g.complemento, g.bairro, 'Rio de Janeiro'].filter(Boolean).join(', ')}
                  style={{
                    fontSize: 13, color: C.primary, display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'none', border: 'none', padding: 0,
                  }}
                >
                  <MapPin size={12} />
                  {g.bairro || ''}
                  {g.bairro && g.local ? ' · ' : ''}
                  {g.local || ''}
                  {g.complemento ? ` — ${g.complemento}` : ''}
                </AbrirRotaMenu>
              )}
              {g.dia_semana != null && <span style={{ fontSize: 13, color: C.t2, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {DIAS[g.dia_semana]} {g.horario?.slice(0, 5)}</span>}
              {g.status_temporada && STATUS_TEMPORADA[g.status_temporada] ? (
                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: STATUS_TEMPORADA[g.status_temporada].bg, color: STATUS_TEMPORADA[g.status_temporada].cor, fontWeight: 600 }}>
                  {STATUS_TEMPORADA[g.status_temporada].label}
                </span>
              ) : (
                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: g.ativo ? '#10b98120' : '#ef444420', color: g.ativo ? C.green : C.red, fontWeight: 600 }}>{g.ativo ? 'Ativo' : 'Inativo'}</span>
              )}
              {g.temporada && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: C.primaryBg, color: C.primary, fontWeight: 600 }}>{g.temporada}</span>}
            </div>
            {g.tema && <div style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>Tema: {g.tema}</div>}
            {g.descricao && <div style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>{g.descricao}</div>}
          </div>
          <div className="cbrio-grupos-detail-actions" style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}>
              <QrCode size={14} style={{ marginRight: 4 }} /> QR / Link
            </Button>
            <Button size="sm" variant="outline" onClick={() => setVisitaOpen(true)}>
              <CalendarPlus size={14} style={{ marginRight: 4 }} /> Agendar visita
            </Button>
            {podeEditarGrupos && (
              <>
                <Button size="sm" variant="outline" onClick={openEdit}>Editar</Button>
                {g.ativo
                  ? <Button size="sm" variant="destructive" onClick={handleDelete}>Desativar</Button>
                  : <Button size="sm" onClick={handleReativar}>Reativar</Button>
                }
              </>
            )}
          </div>
        </div>

        {/* Cadastro incompleto · checklist do que falta (não renderiza se completo) */}
        {(() => {
          const faltas = camposFaltantes(g);
          if (!faltas.length) return null;
          return (
            <div style={{ background: `${C.amber}12`, borderRadius: 12, padding: '12px 16px', border: `1px solid ${C.amber}40`, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertTriangle size={16} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.t2 }}>
                <strong style={{ color: C.amber }}>Cadastro incompleto</strong> — falta: {faltas.join(' · ')}
              </div>
            </div>
          );
        })()}

        {/* Supervisão do grupo · fonte da verdade do organograma (1 supervisor por grupo) */}
        <div style={{ background: C.card, borderRadius: 12, padding: '12px 16px', border: `1px solid ${C.border}`, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
            <Eye size={16} style={{ color: '#3b82f6', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.t2 }}>Supervisor:&nbsp;
              <strong style={{ color: g.supervisor ? C.text : C.t3 }}>{g.supervisor?.nome || 'sem supervisor definido'}</strong>
            </span>
          </div>
          {podeGerenciarSupervisor && (!supPickerOpen ? (
            <Button size="sm" variant="outline" onClick={() => { loadMembros(); setSupPickerOpen(true); }}>
              {g.supervisor ? 'Trocar' : 'Definir'} supervisor
            </Button>
          ) : (
            <div style={{ position: 'relative', minWidth: 260 }}>
              <Input autoFocus placeholder="Buscar pessoa pelo nome..." value={supBusca} onChange={e => setSupBusca(e.target.value)} />
              {supBusca.length >= 2 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                  {allMembros.filter(m => m.nome?.toLowerCase().includes(supBusca.toLowerCase())).slice(0, 10).map(m => (
                    <div key={m.id} onClick={() => handleSetSupervisor(m.id)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: `1px solid ${C.border}` }}>{m.nome}</div>
                  ))}
                  {allMembros.filter(m => m.nome?.toLowerCase().includes(supBusca.toLowerCase())).length === 0 && (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: C.t3 }}>Ninguém encontrado</div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 6, justifyContent: 'flex-end' }}>
                {g.supervisor && <button onClick={() => handleSetSupervisor(null)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12 }}>Remover supervisor</button>}
                <button onClick={() => { setSupPickerOpen(false); setSupBusca(''); }} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
              </div>
            </div>
          ))}
        </div>

        {/* Info cards */}
        <div className="cbrio-grupos-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Membros', value: isOptimistic ? null : regulares.length, color: C.primary },
            { label: 'Visitantes', value: isOptimistic ? null : visitantes.length, color: C.amber },
            { label: 'Total', value: totalMembros, color: C.blue },
            { label: 'Multiplicacoes', value: isOptimistic ? null : (g.multiplicacoes?.length || 0), color: '#8b5cf6' },
          ].map(k => (
            <div key={k.label} style={{
              position: 'relative', overflow: 'hidden',
              background: 'var(--panel)',
              WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)',
              border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)',
              borderRadius: 16, padding: 16,
            }}>
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${k.color}22, transparent 58%)`, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.9 }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color, opacity: k.value == null ? 0.3 : 1 }}>
                  {k.value == null ? '—' : k.value}
                </div>
                <div style={{ fontSize: 12, color: C.t3 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Saúde do grupo */}
        {!isOptimistic && metricas && metricas.total_encontros > 0 && (
          <SaudeDoGrupo metricas={metricas} />
        )}
        {!isOptimistic && metricas && metricas.total_encontros === 0 && (
          <div style={{ background: C.card, borderRadius: 16, padding: 16, border: '1px dashed var(--hairline)', boxShadow: 'var(--shadow)', marginBottom: 24, fontSize: 12, color: C.t3, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={14} /> Saude do grupo aparece aqui depois do primeiro encontro registrado.
          </div>
        )}

        {/* Grupo de origem e multiplicacoes */}
        {(g.grupo_origem || g.multiplicacoes?.length > 0) && (
          <div style={{ background: C.card, borderRadius: 16, padding: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', marginBottom: 24 }}>
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
        <div style={{ background: C.card, borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              Membros ({isOptimistic ? (g.membros_count ?? '...') : membrosAtivos.length})
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {podeEditarGrupos && (
                <>
                  <Button size="sm" variant="outline" disabled={isOptimistic || membrosAtivos.length === 0} onClick={() => setChamadaOpen(true)}>
                    <ClipboardCheck size={14} style={{ marginRight: 4 }} /> Registrar encontro
                  </Button>
                  <Button size="sm" onClick={() => { setBuscarBaseToda(false); setMembrosSearch(''); loadCandidatos(selectedGrupo); setAddMembroOpen(true); }}>
                    <UserPlus size={14} style={{ marginRight: 4 }} /> Adicionar
                  </Button>
                </>
              )}
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
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--cbrio-table-header)' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Nome</th>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Telefone</th>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Entrou em</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Presenças</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Tipo</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Líder</th>
                  <th style={{ padding: '8px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Treino</th>
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
                      {m.id ? (
                        <button
                          onClick={() => navigate(`/ministerial/membresia?membro=${m.id}`)}
                          title="Abrir ficha na Membresia"
                          style={{ fontSize: 13, fontWeight: 600, color: C.primary, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                        >
                          {m.nome}
                        </button>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.nome}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: C.t2 }}>{m.telefone || '-'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: C.t2 }}>{fmtDate(m.entrou_em)}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: C.t2, textAlign: 'center' }}>{m.presencas}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {(() => { const t = TIPO_PAPEL[m.funcao] || TIPO_PAPEL.frequentador; return (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: t.bg, color: t.cor, fontWeight: 600 }}>{t.label}</span>
                      ); })()}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {(() => {
                        const isPrincipal = g.lider && m.id === g.lider.id;
                        const isLider = m.funcao === 'lider' || m.funcao === 'co_lider';
                        if (isPrincipal) {
                          return (
                            <span title="Líder principal (definido em Editar)" style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, background: C.primaryBg, color: C.primary, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Star size={12} /> Principal
                            </span>
                          );
                        }
                        if (podeEditarGrupos) {
                          return (
                            <button
                              onClick={() => handleToggleLider(m.participacao_id, isLider)}
                              title={isLider ? 'Remover de líder' : 'Marcar como líder'}
                              style={{
                                fontSize: 11, padding: '2px 10px', borderRadius: 99, cursor: 'pointer', fontWeight: 600,
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                border: isLider ? `1px solid ${C.primary}` : `1px dashed ${C.border}`,
                                background: isLider ? C.primaryBg : 'transparent',
                                color: isLider ? C.primary : C.t3,
                              }}>
                              <Star size={12} /> {isLider ? 'Líder' : 'Marcar'}
                            </button>
                          );
                        }
                        return isLider ? (
                          <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, background: C.primaryBg, color: C.primary, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Star size={12} /> Líder
                          </span>
                        ) : <span style={{ fontSize: 11, color: C.t3 }}>—</span>;
                      })()}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {(() => {
                        const emTreino = m.funcao === 'lider_treinamento';
                        if (podeEditarGrupos) {
                          return (
                            <button
                              onClick={() => handleToggleTreinamento(m.participacao_id, emTreino)}
                              title={emTreino ? 'Remover de líder em treinamento' : 'Marcar como líder em treinamento'}
                              style={{
                                fontSize: 11, padding: '2px 10px', borderRadius: 99, cursor: 'pointer', fontWeight: 600,
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                border: emTreino ? '1px solid #8b5cf6' : `1px dashed ${C.border}`,
                                background: emTreino ? '#8b5cf620' : 'transparent',
                                color: emTreino ? '#8b5cf6' : C.t3,
                              }}>
                              <GraduationCap size={12} /> {emTreino ? 'Em treino' : 'Marcar'}
                            </button>
                          );
                        }
                        return emTreino ? (
                          <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, background: '#8b5cf620', color: '#8b5cf6', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <GraduationCap size={12} /> Em treino
                          </span>
                        ) : <span style={{ fontSize: 11, color: C.t3 }}>—</span>;
                      })()}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {podeEditarGrupos && (
                        <button onClick={() => handleRemoveMembro(m.participacao_id)} title="Remover do grupo" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 11 }}><X size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Encontros recentes */}
        {!isOptimistic && (
          <div style={{ background: C.card, borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', overflow: 'hidden', marginTop: 16 }}>
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
                  <div key={enc.id} onClick={() => handleEditarEncontro(enc.id)} style={{
                    padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex',
                    alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = C.primaryBg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    title="Clique para editar a chamada">
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
                    {podeEditarGrupos && (
                      <button onClick={e => { e.stopPropagation(); handleRemoverEncontro(enc.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, padding: 6 }} title="Remover encontro"><Trash2 size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Histórico completo de membros (entradas + saídas + transferencias) */}
        {!isOptimistic && historicoMembros.length > 0 && (() => {
          const saidas = historicoMembros.filter(h => h.saiu_em);
          if (saidas.length === 0) return null;
          return (
            <div style={{ background: C.card, borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', overflow: 'hidden', marginTop: 16 }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ArrowRightLeft size={14} style={{ color: C.t3 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Histórico de saídas e transferências ({saidas.length})</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                  <thead>
                    <tr style={{ background: 'var(--cbrio-table-header)' }}>
                      <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Membro</th>
                      <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Período</th>
                      <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Motivo</th>
                      <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.t3, textTransform: 'uppercase' }}>Foi para</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saidas.map(h => (
                      <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: C.text, fontWeight: 600 }}>{h.mem_membros?.nome || '—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: C.t2 }}>{fmtDate(h.entrou_em)} → {fmtDate(h.saiu_em)}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: C.t3 }}>{h.motivo_saida || '—'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12 }}>
                          {h.destino ? (
                            <button onClick={() => openGrupo({ id: h.destino.grupo_id })} style={{
                              background: 'none', border: 'none', color: C.primary, cursor: 'pointer',
                              padding: 0, fontSize: 12, fontWeight: 600, textAlign: 'left',
                            }}>
                              {h.destino.mem_grupos?.nome || h.destino.grupo_id}
                              {h.destino.mem_grupos?.codigo && (
                                <code style={{ marginLeft: 6, fontSize: 10, color: C.t3 }}>{h.destino.mem_grupos.codigo}</code>
                              )}
                            </button>
                          ) : <span style={{ color: C.t3 }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Observações */}
        {g.observacoes && (
          <div style={{ background: C.card, borderRadius: 16, padding: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Observações</div>
            <div style={{ fontSize: 13, color: C.t2, whiteSpace: 'pre-wrap' }}>{g.observacoes}</div>
          </div>
        )}

        {/* Modal de chamada / edição */}
        <ChamadaModal
          open={chamadaOpen}
          onClose={() => { setChamadaOpen(false); setEncontroEdit(null); }}
          membros={membrosAtivos}
          onSubmit={handleRegistrarEncontro}
          encontroEdit={encontroEdit}
        />

        {/* Modal adicionar pessoa — funil de entrada (Next + inscrições deste grupo) */}
        <Dialog open={addMembroOpen} onOpenChange={setAddMembroOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Adicionar pessoa ao grupo</DialogTitle></DialogHeader>
            <Input placeholder="Buscar por nome..." value={membrosSearch} onChange={e => setMembrosSearch(e.target.value)} />

            {!buscarBaseToda ? (
              <>
                <div style={{ fontSize: 11, color: C.t3, margin: '6px 2px' }}>
                  Direcionados do Next e inscritos neste grupo.
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 4 }}>
                  {candidatosLoading ? (
                    <div style={{ padding: 16, fontSize: 13, color: C.t3 }}>Carregando…</div>
                  ) : (() => {
                    const lista = candidatos.filter(c => c.nome?.toLowerCase().includes(membrosSearch.toLowerCase()));
                    if (lista.length === 0) return (
                      <div style={{ padding: 16, fontSize: 13, color: C.t3 }}>
                        {membrosSearch ? 'Ninguém na fila de entrada com esse nome.' : 'Ninguém na fila de entrada agora.'}
                      </div>
                    );
                    return lista.map(c => (
                      <div key={`${c.tipo}-${c.fonte_id}`} onClick={() => handleAddCandidato(c)} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8 }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.primary }}>{c.nome?.charAt(0)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.nome}</div>
                          <div style={{ fontSize: 11, color: C.t3 }}>{c.telefone || ''}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: c.tipo === 'next' ? '#8b5cf620' : '#3b82f620', color: c.tipo === 'next' ? '#8b5cf6' : '#3b82f6', whiteSpace: 'nowrap' }}>
                          {c.tipo === 'next' ? 'Next' : 'Inscrição'}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
                <button onClick={() => { setBuscarBaseToda(true); if (allMembros.length === 0) loadMembros(); }}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 4 }}>
                  Não está na lista? Buscar na base toda
                </button>
              </>
            ) : (
              <>
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
                <button onClick={() => setBuscarBaseToda(false)}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 4 }}>
                  ← Voltar à fila de entrada
                </button>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal editar grupo */}
        <GrupoFormModal open={modalOpen} onClose={() => setModalOpen(false)} data={editData} onSave={handleSave} saving={saving} gruposForSelect={gruposForSelect} allMembros={allMembros} loadMembros={loadMembros} temporadas={temporadas} bairrosUnicos={bairrosUnicos} />

        {/* Modal QR code do grupo */}
        <GrupoQRModal
          open={qrOpen}
          onClose={() => { setQrOpen(false); setQrCopied(false); }}
          grupo={g}
          temporada={(temporadas || []).find(t => t.id === g.temporada)}
          copied={qrCopied}
          setCopied={setQrCopied}
        />

        {/* Modal agendar/registrar visita · aparece depois na aba Visitas */}
        <AgendarVisitaModal
          open={visitaOpen}
          onClose={() => setVisitaOpen(false)}
          grupo={g}
        />
      </div>
    );
  }

  // ── LISTA DE GRUPOS ──
  return (
    <div className="cbrio-grupos-page" style={{ padding: '24px 20px', maxWidth: 1240, margin: '0 auto' }}>
      <ModuleHeader
        icon={Users}
        title="Grupos"
        subtitle="Grupos de conexão, caixa de entrada, supervisão e relatórios"
        accent={C.primary}
        actions={tabAtiva === 'grupos' && podeEditarGrupos ? (
          <>
            <Button variant="outline" onClick={() => setImportLideresOpen(true)}><FileUp size={16} style={{ marginRight: 6 }} /> Importar líderes</Button>
            <Button onClick={openCreate}><Plus size={16} style={{ marginRight: 6 }} /> Novo Grupo</Button>
          </>
        ) : undefined}
      />

      {/* Tabs principais · alinhadas à ESQUERDA, na margem do conteúdo (Marcos
          13/07: centralizadas flutuavam desalinhadas da página); quebram em 2
          linhas se faltar espaço */}
      <div className="cbrio-grupos-tabs" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 0, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
        {[
          { key: 'grupos', label: 'Grupos', icon: Users },
          { key: 'pessoas', label: 'Pessoas', icon: UserCog },
          { key: 'relatorios', label: 'Relatórios', icon: BarChart3 },
          { key: 'entrada', label: 'Caixa de entrada', icon: Inbox, badge: pedidosCount + encPendentes },
          { key: 'materiais', label: 'Materiais', icon: FileText },
          { key: 'visitas', label: 'Visitas', icon: CalendarCheck },
          { key: 'qrcode', label: 'Inscrições', icon: QrCode },
        ].filter(tab => !tab.soEditor || podeEditarGrupos).map(tab => (
          <button key={tab.key} onClick={() => { setPageTab(tab.key); atualizarUrlView(tab.key, null); }} style={{
            // Com menos abas (13/07), cada uma respira mais — padding e fonte maiores.
            padding: '12px 22px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14.5, fontWeight: tabAtiva === tab.key ? 700 : 400,
            color: tabAtiva === tab.key ? C.primary : C.t3,
            borderBottom: tabAtiva === tab.key ? `2px solid ${C.primary}` : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}>
            <tab.icon size={16} /> {tab.label}
            {tab.badge > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                background: '#ef4444', color: '#fff', minWidth: 18, textAlign: 'center',
              }}>{tab.badge > 99 ? '99+' : tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TAB CAIXA DE ENTRADA · lista única: pedidos de inscrição + direcionados do Next ═══ */}
      {tabAtiva === 'entrada' && (
        <GruposEntrada
          podeEditar={podeEditarGrupos}
          onMudou={() => { loadPedidosCount(); loadEncPendentes(); }}
        />
      )}

      {/* ═══ TAB MATERIAIS ═══ */}
      {tabAtiva === 'materiais' && (
        <div>
          {/* Upload · so quem edita */}
          {podeEditarGrupos && (
          <div style={{ background: C.card, borderRadius: 16, padding: 20, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileUp size={16} /> Enviar material
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Label style={{ fontSize: 11 }}>Comentário</Label>
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
          )}

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

          <p style={{ fontSize: 11, color: C.t3, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <BookOpen size={12} style={{ color: '#8b5cf6' }} />
            O material marcado como <strong>Estudo da semana</strong> é enviado pelo bot do WhatsApp aos líderes de grupos toda semana.
          </p>

          {/* Lista */}
          <div style={{ background: C.card, borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
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
                    {doc.estudo_semana && (
                      <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 99, background: '#8b5cf620', color: '#8b5cf6', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <BookOpen size={11} /> Estudo da semana
                      </span>
                    )}
                    {podeEditarGrupos && (
                      <button onClick={() => handleMarcarEstudo(doc)}
                        title={doc.estudo_semana ? 'Desmarcar estudo da semana' : 'Marcar como estudo da semana (o bot envia pros líderes no WhatsApp)'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: doc.estudo_semana ? '#8b5cf6' : C.t3 }}>
                        <BookOpen size={14} />
                      </button>
                    )}
                    {doc.sharepoint_url && <a href={doc.sharepoint_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.primary, fontWeight: 600 }}>SharePoint</a>}
                    {podeEditarGrupos && (
                      <button onClick={() => handleDeleteMaterial(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red }}><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ TAB PESSOAS · visualização Pessoas | Organograma ═══ */}
      {tabAtiva === 'pessoas' && (
        <div>
          <ViewToggle
            value={pessoasView}
            onChange={trocarPessoasView}
            opcoes={[
              { key: 'censo', label: 'Pessoas', Icon: UserCog },
              { key: 'organograma', label: 'Organograma', Icon: Compass },
              { key: 'duplicatas', label: 'Duplicatas', Icon: Copy },
            ]}
          />
          {pessoasView === 'organograma' ? (
            <GruposOrganograma onOpenGrupo={openGrupoById} />
          ) : pessoasView === 'duplicatas' ? (
            <GruposDuplicatas podeResolver={podeGerenciarSupervisor} />
          ) : (
            <GruposPessoas
              onOpenGrupo={openGrupoById}
              podeEditar={podeEditarGrupos}
              podeEditarDados={podeGerenciarSupervisor}
              gruposOptions={gruposList.filter(g => g.ativo)}
              onVerDuplicatas={() => trocarPessoasView('duplicatas')}
            />
          )}
        </div>
      )}

      {/* ═══ TAB VISITAS ═══ */}
      {tabAtiva === 'visitas' && <GruposVisitas onOpenGrupo={openGrupoById} />}

      {/* ═══ TAB INSCRIÇÕES · card da temporada no topo + botões QR codes | Temporadas ═══ */}
      {tabAtiva === 'qrcode' && (
        <div>
          {/* O interruptor: qual temporada está valendo e se as inscrições estão abertas */}
          <TemporadaInscricoesCard podeEditar={podeEditarGrupos} />
          <ViewToggle
            value={configTab}
            onChange={setConfigTab}
            opcoes={[
              { key: 'qr', label: 'QR codes', Icon: QrCode },
              // Gestão completa (criar/virar temporada) só pra quem edita.
              // O botão de Endereços/geocode saiu daqui (13/07) — a ferramenta
              // técnica segue viva em /admin/grupos/geocode, sem poluir a aba.
              ...(podeEditarGrupos ? [{ key: 'temporadas', label: 'Gestão de temporadas', Icon: Calendar }] : []),
            ]}
          />
          <div className="cbrio-grupos-bleed" style={{ margin: '0 -20px' }}>
            {configTab === 'temporadas' && podeEditarGrupos ? <TemporadasGrupos /> : <InscricaoGruposQRCode />}
          </div>
        </div>
      )}

      {/* ═══ TAB RELATÓRIOS ═══ */}
      {tabAtiva === 'relatorios' && (
        <RelatorioGrupos temporada={filterTemporada} />
      )}

      {/* ═══ TAB GRUPOS · visualização Lista | Mapa (mesma informação, projeções diferentes) ═══ */}
      {tabAtiva === 'grupos' && (
        <ViewToggle
          value={gruposView}
          onChange={trocarGruposView}
          opcoes={[
            { key: 'lista', label: 'Lista', Icon: Users },
            { key: 'mapa', label: 'Mapa', Icon: MapIcon },
          ]}
        />
      )}
      {tabAtiva === 'grupos' && gruposView === 'mapa' && (
        <div style={{ height: 'calc(100vh - 270px)', minHeight: 500, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>
          ) : (
            <GruposMapView
              grupos={gruposList.filter(g => g.ativo)}
              variant="admin"
              defaultTheme="dark"
              temporadasMap={Object.fromEntries((temporadas || []).map(t => [t.id, { inscricoes_abertas: !!t.inscricoes_abertas, label: t.label }]))}
              mostrarBotaoInscricao={true}
            />
          )}
        </div>
      )}
      {tabAtiva === 'grupos' && gruposView === 'lista' && <>
      {/* Resumo de saúde */}
      {saudeAgregada && saudeAgregada.total > 0 && (
        <div style={{ background: C.card, borderRadius: 16, padding: 14, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} style={{ color: C.primary }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Saúde dos grupos</span>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: C.t2 }}><strong style={{ color: C.green }}>{saudeAgregada.saudaveis}</strong> saudaveis</span>
            <span style={{ fontSize: 12, color: C.t2 }}><strong style={{ color: C.red }}>{saudeAgregada.em_risco}</strong> em risco</span>
            <span style={{ fontSize: 12, color: C.t2 }}><strong style={{ color: C.text }}>{saudeAgregada.total}</strong> ativos</span>
          </div>
          {saudeAgregada.em_risco > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {saudeAgregada.grupos.filter(r => r.em_risco).slice(0, 5).map(r => (
                <button key={r.id} onClick={() => openGrupoById(r.id)} style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 99, border: `1px solid #ef444440`,
                  background: '#ef444412', color: C.red, cursor: 'pointer', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <AlertTriangle size={11} /> {r.nome} ({r.score_saude})
                </button>
              ))}
              {saudeAgregada.em_risco > 5 && (
                <span style={{ fontSize: 11, color: C.t3, alignSelf: 'center' }}>+{saudeAgregada.em_risco - 5}</span>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 12, position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
        <Input placeholder="Buscar por código, grupo, líder, local ou bairro..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
      </div>

      {/* Filtros */}
      <div className="cbrio-grupos-filters" style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
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
            {diasUnicos.map(i => <SelectItem key={i} value={String(i)}>{DIAS[i]}</SelectItem>)}
          </SelectContent>
        </ShadSelect>

        <ShadSelect value={filterBairro} onValueChange={setFilterBairro}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Bairro" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os bairros</SelectItem>
            {bairrosUnicos.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </ShadSelect>

        <ShadSelect value={filterStatusTemp} onValueChange={setFilterStatusTemp}>
          <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="novo">Novo</SelectItem>
            <SelectItem value="aguardando">Aguardando</SelectItem>
            <SelectItem value="a_confirmar">A confirmar</SelectItem>
            <SelectItem value="encerrado">Encerrado</SelectItem>
          </SelectContent>
        </ShadSelect>

        {temporadas.length > 0 && (
          <ShadSelect value={filterTemporada || 'all'} onValueChange={v => setFilterTemporada(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[200px] h-8 text-xs overflow-hidden [&>span]:truncate [&>span]:min-w-0"><SelectValue placeholder="Temporada" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as temporadas</SelectItem>
              {temporadas.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.label}{t.ativa ? ' (atual)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </ShadSelect>
        )}

        <button onClick={() => setFilterIncompleto(v => !v)} title="Grupos com dados de cadastro faltando" style={{
          fontSize: 11, padding: '4px 10px', borderRadius: 99, cursor: 'pointer', fontWeight: 600,
          border: filterIncompleto ? `1px solid ${C.amber}` : `1px solid ${C.amber}40`,
          background: filterIncompleto ? `${C.amber}28` : `${C.amber}12`, color: C.amber,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <AlertTriangle size={11} /> Cadastro incompleto ({incompletosCount})
        </button>

        {hasActiveFilters && (
          <button onClick={() => { setFilterTipo('all'); setFilterDia('all'); setFilterBairro('all'); setFilterStatusTemp('all'); setFilterIncompleto(false); }}
            style={{ fontSize: 11, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <X size={12} /> Limpar filtros
          </button>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: mostrarArquivados ? C.primary : C.t3, cursor: 'pointer', marginLeft: hasActiveFilters ? 0 : 'auto', fontWeight: mostrarArquivados ? 600 : 400 }}>
          <input
            type="checkbox"
            checked={mostrarArquivados}
            onChange={e => setMostrarArquivados(e.target.checked)}
            style={{ accentColor: C.primary, cursor: 'pointer' }}
          />
          Mostrar arquivados
        </label>

        <span style={{ fontSize: 11, color: C.t3, marginLeft: hasActiveFilters || mostrarArquivados ? 'auto' : 0 }}>{filtered.length} de {gruposList.length} grupos</span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>
          {search ? (
            'Nenhum grupo encontrado para a busca.'
          ) : hasActiveFilters || filterTemporada ? (
            <div>
              <div>Nenhum grupo nos filtros aplicados.</div>
              <button
                onClick={() => {
                  setFilterTipo('all'); setFilterDia('all');
                  setFilterBairro('all'); setFilterStatusTemp('all');
                  setFilterIncompleto(false); setFilterTemporada('');
                }}
                style={{ marginTop: 8, fontSize: 12, color: C.primary, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                Limpar todos os filtros
              </button>
            </div>
          ) : (
            'Nenhum grupo cadastrado'
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(g => (
            <div key={g.id} onClick={() => openGrupo(g)} style={{
              background: C.card, borderRadius: 16, padding: 18, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)',
              cursor: 'pointer', transition: 'border-color 0.15s, transform 0.1s',
              opacity: g.ativo ? 1 : 0.6,
            }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.99)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.primary}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--hairline)'}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: g.foto_url ? `url(${g.foto_url}) center/cover` : C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {!g.foto_url && <Users size={22} style={{ color: C.primary }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {g.codigo && (
                    <div style={{ fontSize: 10, color: C.t3, fontWeight: 600, fontFamily: 'monospace', marginBottom: 2 }}>{g.codigo}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{g.nome}</div>
                    {g.status_temporada && STATUS_TEMPORADA[g.status_temporada] && (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: STATUS_TEMPORADA[g.status_temporada].bg, color: STATUS_TEMPORADA[g.status_temporada].cor, fontWeight: 600, textTransform: 'uppercase' }}>
                        {STATUS_TEMPORADA[g.status_temporada].label}
                      </span>
                    )}
                    {!g.ativo && !g.status_temporada && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#ef444420', color: C.red, fontWeight: 600, textTransform: 'uppercase' }}>Arquivado</span>}
                    {(() => {
                      const n = camposFaltantes(g).length;
                      if (!n) return null;
                      return (
                        <span title="Cadastro incompleto — abra o grupo para ver o que falta" style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: `${C.amber}20`, color: C.amber, fontWeight: 600 }}>
                          {n === 1 ? 'falta 1 dado' : `faltam ${n} dados`}
                        </span>
                      );
                    })()}
                  </div>
                  {g.lider_nome && <div style={{ fontSize: 12, color: C.t2, marginBottom: 2 }}>Lider: {g.lider_nome}</div>}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                    {g.dia_semana != null && (
                      <span style={{ fontSize: 11, color: C.t3, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={11} /> {DIAS[g.dia_semana]} {g.horario?.slice(0, 5)}
                      </span>
                    )}
                    {g.bairro && (
                      <span style={{ fontSize: 11, color: C.t3, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <MapPin size={11} /> {g.bairro}
                      </span>
                    )}
                    {!g.bairro && g.local && (
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

      <GrupoFormModal open={modalOpen} onClose={() => setModalOpen(false)} data={editData} onSave={handleSave} saving={saving} gruposForSelect={gruposForSelect} allMembros={allMembros} loadMembros={loadMembros} temporadas={temporadas} bairrosUnicos={bairrosUnicos} />
      {importLideresOpen && <ImportLideresModal onClose={() => setImportLideresOpen(false)} onDone={() => { setImportLideresOpen(false); load(); }} />}
    </div>
  );
}

// ── MODAL · Importar líderes dos grupos (planilha + IA · review-before-apply) ──
const CONF_LIDER = {
  exata: { label: 'Idêntico', cls: 'bg-emerald-100 text-emerald-700' },
  alta: { label: 'Alta', cls: 'bg-emerald-100 text-emerald-700' },
  media: { label: 'Média', cls: 'bg-amber-100 text-amber-700' },
  baixa: { label: 'Baixa', cls: 'bg-slate-100 text-slate-600' },
  nenhuma: { label: 'Sem sugestão', cls: 'bg-slate-100 text-slate-500' },
};

function ImportLideresModal({ onClose, onDone }) {
  const [fase, setFase] = useState('upload'); // upload | analisando | revisao
  const [itens, setItens] = useState([]);
  const [sel, setSel] = useState({});
  const [salvando, setSalvando] = useState(false);

  async function analisar(file) {
    if (!file) return;
    setFase('analisando');
    try {
      const r = await api.importarLideresAnalisar(file);
      const its = r.itens || [];
      setItens(its);
      const pre = {};
      for (const it of its) if (it.grupo_id && it.sugestao && (it.confianca === 'exata' || it.confianca === 'alta')) pre[it.grupo_id] = true;
      setSel(pre);
      setFase('revisao');
    } catch (e) { toast.error(e.message || 'Erro ao analisar a planilha'); setFase('upload'); }
  }

  const comSugestao = itens.filter(i => i.grupo_id && i.sugestao);
  const semLider = itens.filter(i => i.grupo_id && !i.sugestao);
  const semGrupo = itens.filter(i => !i.grupo_id);
  const selecionados = comSugestao.filter(i => sel[i.grupo_id]);
  const todosMarcados = comSugestao.length > 0 && selecionados.length === comSugestao.length;

  function alternarTodos(marcar) {
    const novo = {};
    if (marcar) for (const i of comSugestao) novo[i.grupo_id] = true;
    setSel(novo);
  }

  async function aplicar() {
    if (!selecionados.length) return;
    setSalvando(true);
    try {
      const vinculos = selecionados.map(i => ({ grupo_id: i.grupo_id, membro_id: i.sugestao.membro_id }));
      const r = await api.importarLideresAplicar(vinculos);
      toast.success(`${r.aplicados} líder(es) vinculados aos grupos`);
      onDone();
    } catch (e) { toast.error(e.message || 'Erro ao aplicar'); setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar líderes dos grupos</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Envie a planilha com as colunas <strong>Grupo</strong> e <strong>Líder</strong>. A IA casa o líder de cada grupo com o cadastro de membros. Revise e marque os corretos — nada é gravado sem você aprovar.
        </p>

        {fase === 'upload' && (
          <label className="block mt-2">
            <input type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; analisar(f); e.currentTarget.value = ''; }} />
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium cursor-pointer">
              <FileUp size={16} /> Escolher planilha (.xlsx/.csv)
            </span>
          </label>
        )}

        {fase === 'analisando' && (
          <div className="py-10 text-center text-sm text-muted-foreground">analisando os nomes…</div>
        )}

        {fase === 'revisao' && (
          <>
            {comSugestao.length > 0 && (
              <label className="flex items-center gap-2 px-1 text-sm font-medium text-foreground cursor-pointer select-none">
                <input type="checkbox" className="h-4 w-4 accent-[#00B39D]" checked={todosMarcados}
                  ref={(el) => { if (el) el.indeterminate = selecionados.length > 0 && !todosMarcados; }}
                  onChange={(e) => alternarTodos(e.target.checked)} />
                {todosMarcados ? 'Limpar seleção' : 'Selecionar todos'} ({comSugestao.length})
              </label>
            )}
            <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-1.5">
              {comSugestao.map(i => (
                <label key={i.grupo_id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card cursor-pointer hover:bg-accent/40">
                  <input type="checkbox" className="h-4 w-4 accent-[#00B39D]" checked={!!sel[i.grupo_id]}
                    onChange={(e) => setSel(p => ({ ...p, [i.grupo_id]: e.target.checked }))} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">{i.grupo_nome}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      líder: {i.sugestao.nome}
                      {i.lider_atual_nome && i.lider_atual_nome !== i.sugestao.nome && <span className="text-amber-600"> · substitui {i.lider_atual_nome}</span>}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${CONF_LIDER[i.confianca]?.cls || CONF_LIDER.nenhuma.cls}`}>{CONF_LIDER[i.confianca]?.label || i.confianca}</span>
                </label>
              ))}
              {(semLider.length > 0 || semGrupo.length > 0) && (
                <div className="pt-2 space-y-1">
                  {semLider.length > 0 && <p className="text-xs font-medium text-muted-foreground px-1">Sem líder identificado ({semLider.length}) — vincule manualmente no grupo</p>}
                  {semLider.map((i, k) => (
                    <div key={'sl' + k} className="flex items-center justify-between p-2 rounded-lg border border-dashed bg-muted/30 text-sm">
                      <span className="truncate text-foreground">{i.grupo_nome} <span className="text-xs text-muted-foreground">· planilha: {i.lider_planilha}</span></span>
                    </div>
                  ))}
                  {semGrupo.length > 0 && <p className="text-xs font-medium text-muted-foreground px-1 pt-1">Grupo não encontrado no sistema ({semGrupo.length})</p>}
                  {semGrupo.map((i, k) => (
                    <div key={'sg' + k} className="flex items-center justify-between p-2 rounded-lg border border-dashed bg-muted/30 text-sm">
                      <span className="truncate text-muted-foreground">{i.grupo_planilha} · líder: {i.lider_planilha}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">{selecionados.length} de {comSugestao.length} selecionados</span>
              <Button onClick={aplicar} disabled={salvando || !selecionados.length}>
                {salvando ? 'Aplicando…' : `Aplicar selecionados (${selecionados.length})`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── MODAL DE FORMULÁRIO ──
function GrupoQRModal({ open, onClose, grupo, temporada, copied, setCopied }) {
  if (!grupo) return null;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${baseUrl}/inscricao-grupos?grupo=${grupo.id}`;
  const aberta = !!temporada?.inscricoes_abertas;

  const copyUrl = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link copiado');
    setTimeout(() => setCopied(false), 1500);
  };
  const downloadQr = () => {
    const svg = document.getElementById('qr-grupo-svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const slug = (grupo.codigo || grupo.id).toString().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    a.download = `cbrio-grupo-${slug}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('QR baixado em SVG');
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>QR / Link de inscrição — {grupo.nome}</DialogTitle>
        </DialogHeader>

        {!aberta && (
          <div style={{
            padding: 10, marginBottom: 10, background: 'rgba(245,158,11,0.15)',
            border: `1px solid #f59e0b`, borderRadius: 8, fontSize: 12, color: '#b45309',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Lock size={14} />
            <span>
              Inscrições da temporada {temporada?.label || ''} estão <strong>fechadas</strong>.
              O link continua válido, mas as pessoas vão ver "inscrições fechadas" ao tentar enviar.
            </span>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 10, padding: 16, textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#000', marginBottom: 8 }}>
            Quero entrar neste grupo
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <QRCodeSVG id="qr-grupo-svg" value={url} size={220} level="M" includeMargin={false} />
          </div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 10 }}>
            {grupo.codigo ? <div style={{ fontFamily: 'monospace' }}>{grupo.codigo}</div> : null}
            <div>{grupo.nome}</div>
          </div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4, display: 'block' }}>
          Link direto
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input readOnly value={url} style={{
            flex: 1, padding: '8px 12px', borderRadius: 8,
            border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)',
            color: C.text, fontSize: 12,
          }} />
          <Button size="sm" variant="outline" onClick={copyUrl}>
            {copied ? <><Check size={14} style={{ marginRight: 4 }} /> Copiado</> : <><Copy size={14} style={{ marginRight: 4 }} /> Copiar</>}
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" onClick={() => window.open(url, '_blank')}>
            <ExternalLink size={14} style={{ marginRight: 4 }} /> Abrir formulário
          </Button>
          <Button size="sm" variant="outline" onClick={downloadQr}>
            <Download size={14} style={{ marginRight: 4 }} /> Baixar SVG
          </Button>
        </div>

        <div style={{
          marginTop: 14, padding: 10, background: 'rgba(0,179,157,0.06)',
          border: `1px solid ${C.primary}40`, borderRadius: 8, fontSize: 11, color: C.t2,
          lineHeight: 1.5,
        }}>
          A pessoa escaneia o QR ou clica no link → cai no formulário com este grupo
          já pré-selecionado → preenche dados → o líder recebe o pedido em
          <strong> /grupos → aba Pedidos</strong>.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GrupoFormModal({ open, onClose, data, onSave, saving, gruposForSelect, allMembros, temporadas, bairrosUnicos }) {
  const [form, setForm] = useState({});
  const [liderSearch, setLiderSearch] = useState('');
  const [redesList, setRedesList] = useState([]);
  // Autocomplete de líder — busca SERVER-SIDE no universo de grupos (quem
  // lidera/participa · Marcos 14/07: a membresia inteira tem 3,5k registros
  // com stubs e homônimos). "Buscar na membresia toda" é o fallback opcional
  // pra um líder novo que ainda não passou por grupo.
  const [liderOpcoes, setLiderOpcoes] = useState(null); // null = dropdown fechado
  const [liderBuscando, setLiderBuscando] = useState(false);
  const [liderFonteAmpla, setLiderFonteAmpla] = useState(false);
  const [liderNomeSel, setLiderNomeSel] = useState('');
  const liderEscolhaRef = useRef('');

  useEffect(() => {
    if (open) {
      api.redes.list().then(setRedesList).catch(() => setRedesList([]));
      const temporadaAtiva = (temporadas || []).find(t => t.ativa)?.id || '';
      setForm(data ? { ...data } : {
        nome: '', categoria: '', area: 'sede', lider_id: '', local: '', endereco: '', complemento: '',
        dia_semana: '', horario: '', recorrencia: 'semanal', tema: '',
        faixa_etaria: '', idade_min: '', idade_max: '', capacidade: '', aceitando_inscricoes: true, rede_id: '',
        foto_url: '', observacoes: '', grupo_origem_id: '', descricao: '',
        bairro: '', status_temporada: 'novo', temporada: temporadaAtiva,
      });
      setLiderSearch(data?.lider?.nome || '');
      liderEscolhaRef.current = data?.lider?.nome || '';
      setLiderNomeSel(data?.lider?.nome || '');
      setLiderOpcoes(null); setLiderFonteAmpla(false);
    }
  }, [open, data, temporadas]);

  // Debounce da busca de líder. Não rebusca quando o texto é o nome recém-
  // escolhido (senão o dropdown reabria logo após a seleção).
  useEffect(() => {
    const q = liderSearch.trim();
    if (q.length < 2 || q === liderEscolhaRef.current) { setLiderOpcoes(null); setLiderBuscando(false); return; }
    let vivo = true;
    setLiderBuscando(true);
    const t = setTimeout(async () => {
      try {
        let ops;
        if (liderFonteAmpla) {
          const ms = await membresia.membros.list({ busca: q });
          ops = (ms || []).slice(0, 20).map(m => ({ id: m.id, nome: m.nome, telefone: m.telefone || null, contexto: 'Membresia' }));
        } else {
          ops = await api.buscarPessoas(q);
        }
        if (vivo) setLiderOpcoes(Array.isArray(ops) ? ops : []);
      } catch { if (vivo) setLiderOpcoes([]); }
      finally { if (vivo) setLiderBuscando(false); }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [liderSearch, liderFonteAmpla]);

  const escolherLider = (m) => {
    liderEscolhaRef.current = m.nome;
    setForm(f => ({ ...f, lider_id: m.id }));
    setLiderNomeSel(m.nome);
    setLiderSearch(m.nome);
    setLiderOpcoes(null);
  };

  const liderNome = liderNomeSel
    || form.lider?.nome
    || allMembros.find(m => m.id === form.lider_id)?.nome
    || null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nome?.trim()) { toast.error('Nome e obrigatório'); return; }
    const iMin = form.idade_min === '' || form.idade_min == null ? null : Number(form.idade_min);
    const iMax = form.idade_max === '' || form.idade_max == null ? null : Number(form.idade_max);
    if (iMin != null && iMax != null && iMin > iMax) { toast.error('Idade mínima maior que a máxima'); return; }
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
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{data?.id ? 'Editar Grupo' : 'Novo Grupo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto min-h-0" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Label>Nome do grupo *</Label>
            <Input value={form.nome || ''} onChange={e => set('nome', e.target.value)} placeholder="Ex: Conexao Barra" />
          </div>

          <div>
            <Label>Área (cascata da mandala)</Label>
            <ShadSelect value={form.area || 'sede'} onValueChange={v => set('area', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sede">Sede</SelectItem>
                <SelectItem value="ami">AMI</SelectItem>
                <SelectItem value="bridge">Bridge</SelectItem>
                <SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </ShadSelect>
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
              <Label>Faixa etária</Label>
              <ShadSelect value={form.faixa_etaria || '__none__'} onValueChange={v => set('faixa_etaria', v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Não definida</SelectItem>
                  {['Adolescentes', 'Jovens', 'Jovens Adultos', 'Adultos', 'Todas as idades'].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </ShadSelect>
            </div>
            <div>
              <Label>Capacidade (limite de pessoas)</Label>
              <Input type="number" min={0} value={form.capacidade ?? ''} onChange={e => set('capacidade', e.target.value)} placeholder="Sem limite" />
            </div>
          </div>

          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label>Idade mínima (opcional)</Label>
                <Input type="number" min={0} max={120} value={form.idade_min ?? ''} onChange={e => set('idade_min', e.target.value)} placeholder="Sem limite" />
              </div>
              <div>
                <Label>Idade máxima (opcional)</Label>
                <Input type="number" min={0} max={120} value={form.idade_max ?? ''} onChange={e => set('idade_max', e.target.value)} placeholder="Sem limite" />
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--cbrio-text3)', margin: '4px 0 0' }}>
              Com limite definido, o formulário público bloqueia inscrição fora da faixa (ex.: jovens até 25 anos).
            </p>
          </div>

          <div>
            <Label>Rede</Label>
            <ShadSelect value={form.rede_id || '__none__'} onValueChange={v => set('rede_id', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem rede</SelectItem>
                {redesList.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}{r.supervisor_nome ? ` — ${r.supervisor_nome}` : ''}</SelectItem>)}
              </SelectContent>
            </ShadSelect>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.aceitando_inscricoes !== false} onChange={e => set('aceitando_inscricoes', e.target.checked)} style={{ accentColor: '#00B39D', cursor: 'pointer' }} />
            Aceitar novas inscrições (desligue para tirar o grupo do formulário público)
          </label>

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
              <Label>Endereço</Label>
              <Input value={form.endereco || ''} onChange={e => set('endereco', e.target.value)} placeholder="Rua, numero" />
            </div>
          </div>

          <div>
            <Label>Complemento</Label>
            <Input value={form.complemento || ''} onChange={e => set('complemento', e.target.value)} placeholder="Apto, bloco, casa, ponto de referência..." />
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
            <Label>Líder</Label>
            <Input placeholder="Buscar líder..." value={liderSearch} onChange={e => setLiderSearch(e.target.value)} />
            {(liderBuscando || liderOpcoes !== null) && (
              <div style={{ maxHeight: 190, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, background: C.card }}>
                {liderBuscando && (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: C.t3 }}>Buscando...</div>
                )}
                {!liderBuscando && (liderOpcoes || []).map(m => (
                  <div key={m.id} onClick={() => escolherLider(m)} style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ fontSize: 13, color: C.text }}>{m.nome}</div>
                    {/* Contexto (grupo que lidera/participa) + telefone — pra
                        distinguir homônimos e duplicatas na hora de escolher */}
                    <div style={{ fontSize: 11, color: C.t3 }}>
                      {[m.contexto, m.telefone].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                ))}
                {!liderBuscando && (liderOpcoes || []).length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: C.t3 }}>
                    {liderFonteAmpla ? 'Ninguém na membresia com esse nome.' : 'Ninguém do universo de grupos com esse nome.'}
                  </div>
                )}
                {!liderBuscando && !liderFonteAmpla && (
                  <button type="button" onClick={() => setLiderFonteAmpla(true)} style={{
                    width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, color: C.primary,
                    background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600,
                  }}>
                    Não achou? Buscar na membresia toda
                  </button>
                )}
              </div>
            )}
            {form.lider_id && !liderSearch && (
              <div style={{ fontSize: 12, color: C.t3, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                Líder selecionado: <strong style={{ color: C.text }}>{liderNome || '...'}</strong>
                <button type="button" onClick={() => { set('lider_id', ''); setLiderNomeSel(''); }} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 11, padding: 0 }}>remover</button>
              </div>
            )}
          </div>

          <div>
            <Label>Tema atual</Label>
            <Input value={form.tema || ''} onChange={e => set('tema', e.target.value)} placeholder="Ex: Serie Inabalavel" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Bairro</Label>
              <Input
                list="bairros-list"
                value={form.bairro || ''}
                onChange={e => set('bairro', e.target.value)}
                placeholder="Ex: Barra, Online, Recreio..."
              />
              <datalist id="bairros-list">
                {(bairrosUnicos || []).map(b => <option key={b} value={b} />)}
              </datalist>
            </div>
            <div>
              <Label>Status da temporada</Label>
              <ShadSelect value={form.status_temporada || 'novo'} onValueChange={v => set('status_temporada', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="novo">Novo</SelectItem>
                  <SelectItem value="aguardando">Aguardando</SelectItem>
                  <SelectItem value="a_confirmar">A confirmar</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                </SelectContent>
              </ShadSelect>
            </div>
          </div>

          <div>
            <Label>Temporada</Label>
            <ShadSelect value={form.temporada || ''} onValueChange={v => set('temporada', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione a temporada" /></SelectTrigger>
              <SelectContent>
                {(temporadas || []).map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.label}{t.ativa ? ' (atual)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </ShadSelect>
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
            <Label>Descrição</Label>
            <Textarea value={form.descricao || ''} onChange={e => set('descricao', e.target.value)} rows={2} />
          </div>

          <div>
            <Label>Observações</Label>
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

// ── MODAL DE CHAMADA / REGISTRO / EDIÇÃO DE ENCONTRO ──
function ChamadaModal({ open, onClose, membros, onSubmit, encontroEdit }) {
  const [data, setData] = useState('');
  const [tema, setTema] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [presentes, setPresentes] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const editando = !!encontroEdit;

  useEffect(() => {
    if (open) {
      if (encontroEdit) {
        setData(encontroEdit.data || new Date().toISOString().split('T')[0]);
        setTema(encontroEdit.tema || '');
        setObservacoes(encontroEdit.observacoes || '');
        setPresentes(new Set(encontroEdit.membros_presentes || []));
      } else {
        setData(new Date().toISOString().split('T')[0]);
        setTema('');
        setObservacoes('');
        // Default: todos selecionados (mais comum o líder desmarcar quem faltou)
        setPresentes(new Set(membros.map(m => m.id)));
      }
      setSaving(false);
    }
  }, [open, membros, encontroEdit]);

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
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>{editando ? 'Editar encontro' : 'Registrar encontro'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto min-h-0" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--hairline)', borderRadius: 8 }}>
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
            <Label style={{ fontSize: 11 }}>Observações (opcional)</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} placeholder="Notas do encontro, orações, decisões..." />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : (editando ? `Salvar (${presentes.size} presentes)` : `Registrar (${presentes.size} presentes)`)}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── SAÚDE DO GRUPO (cards de metricas + sparkline) ──
function SaudeDoGrupo({ metricas }) {
  const C = {
    text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
    border: 'var(--cbrio-border)', card: 'var(--cbrio-card)',
    primary: '#00B39D', green: '#10b981', red: '#ef4444', amber: '#f59e0b',
  };
  const m = metricas;
  const corScore = m.score_saude >= 70 ? C.green : m.score_saude >= 50 ? C.amber : C.red;
  const TendIcon = m.tendencia === 'subindo' ? TrendingUp : m.tendencia === 'caindo' ? TrendingDown : Minus;
  const corTend = m.tendencia === 'subindo' ? C.green : m.tendencia === 'caindo' ? C.red : C.t3;
  const labelTend = m.tendencia === 'subindo' ? 'Subindo' : m.tendencia === 'caindo' ? 'Caindo' : 'Estavel';
  const maxBar = Math.max(...(m.presencas_ultimos.length ? m.presencas_ultimos : [1]), 1);

  return (
    <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${m.em_risco ? '#ef444460' : 'var(--hairline)'}`, boxShadow: 'var(--shadow)', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Activity size={16} style={{ color: corScore }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Saúde do grupo</span>
        {m.em_risco && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#ef444420', color: C.red, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={10} /> EM RISCO
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <MetricaCard label="Score" valor={m.score_saude} sufixo="/100" cor={corScore} />
        <MetricaCard label="Frequencia media" valor={m.freq_media} sufixo=" pres." cor={C.primary} />
        <MetricaCard label="Taxa de presença" valor={m.taxa_presenca} sufixo="%" cor={C.primary} />
        <MetricaCard label="Regularidade" valor={m.regularidade} sufixo="%" cor={m.regularidade >= 70 ? C.green : m.regularidade >= 50 ? C.amber : C.red} />
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TendIcon size={14} style={{ color: corTend }} />
          <span style={{ fontSize: 12, color: corTend, fontWeight: 600 }}>{labelTend}</span>
        </div>
        <span style={{ fontSize: 11, color: C.t3 }}>
          {m.realizados_90d}/{m.esperados_90d} encontros nos ultimos 90 dias
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, alignItems: 'flex-end', height: 28 }}>
          {m.presencas_ultimos.map((p, i) => (
            <div key={i} title={`${m.datas_ultimos[i]}: ${p} pres.`} style={{
              width: 8,
              height: `${Math.max(2, (p / maxBar) * 28)}px`,
              borderRadius: 2,
              background: corScore,
              opacity: 0.4 + (i / Math.max(m.presencas_ultimos.length, 1)) * 0.6,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricaCard({ label, valor, sufixo, cor }) {
  const t3 = 'var(--cbrio-text3)';
  const border = 'var(--cbrio-border)';
  return (
    <div style={{ borderRadius: 10, padding: '10px 12px', border: `1px solid ${border}` }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: cor }}>
        {valor}<span style={{ fontSize: 11, fontWeight: 500, color: t3 }}>{sufixo}</span>
      </div>
      <div style={{ fontSize: 10, color: t3, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── RELATÓRIO DE KPIs DO MÓDULO (aba Relatórios) ──
// Espelha o estilo dos relatórios de Integração: seletor de período + cards de
// KPI + gráfico de frequência por mês + lista de líderes em treinamento. Os
// números vêm da RPC agregada (fn_grupos_kpis_relatorio); a lista nominal de
// líderes em treinamento, do endpoint /kpis/lideres-treinamento.
const REL_RANGES = [
  { value: 3, label: '3 meses' },
  { value: 6, label: '6 meses' },
  { value: 12, label: '12 meses' },
  { value: 24, label: '2 anos' },
];
const REL_MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const relLabelMes = (ym) => {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${REL_MESES_PT[parseInt(m, 10) - 1]}/${y.slice(2)}`;
};

function RelatorioGrupos({ temporada }) {
  const [meses, setMeses] = useState(12);
  const [data, setData] = useState(null);
  const [treino, setTreino] = useState([]);
  const [semRelato, setSemRelato] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = { meses };
    if (temporada) params.temporada = temporada;
    const treinoParams = temporada ? { temporada } : undefined;
    Promise.all([
      api.relatorioKpis(params),
      api.lideresTreinamento(treinoParams).catch(() => []),
      api.semRelato().catch(() => null),
    ])
      .then(([d, t, sr]) => { if (alive) { setData(d); setTreino(Array.isArray(t) ? t : []); setSemRelato(sr); } })
      .catch(() => { if (alive) { setData(null); setTreino([]); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [meses, temporada]);

  const serie = (data?.frequencia?.serie || []).map(s => ({ ...s, mes: relLabelMes(s.ym) }));
  const nps = data?.satisfacao_lideres;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Seletor de período */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg }}>
          {REL_RANGES.map(r => (
            <button key={r.value} onClick={() => setMeses(r.value)} style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: meses === r.value ? C.primary : 'transparent',
              color: meses === r.value ? '#fff' : C.t3, transition: 'all 0.15s',
            }}>{r.label}</button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: C.t3 }}>
          {data?.frequencia?.total_encontros ?? 0} encontro(s) no período
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando relatório...</div>
      ) : !data ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Não foi possível carregar o relatório.</div>
      ) : (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatisticsCard title="Grupos ativos" value={data.total_grupos ?? 0} icon={Users} iconColor={C.primary} />
            <StatisticsCard title="Líderes" value={data.total_lideres ?? 0} icon={UserCog} iconColor={C.blue} subtitle="líderes de grupo" />
            <StatisticsCard title="Em treinamento" value={data.lideres_treinamento ?? 0} icon={GraduationCap} iconColor="#8b5cf6" subtitle="líderes em formação" />
            <StatisticsCard
              title="Satisfação líderes"
              value={nps ? Number(nps.valor).toLocaleString('pt-BR') : '—'}
              icon={Star}
              iconColor={C.amber}
              subtitle={nps ? `NPS · ${fmtDate(nps.data)}` : 'Sem NPS registrado'}
            />
            <StatisticsCard title="Frequência média" value={data.frequencia?.media_por_encontro ?? 0} icon={Activity} iconColor={C.primary} subtitle="presenças / encontro" />
          </div>

          {/* Frequência por mês */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Frequência por mês
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {(data.frequencia?.total_presencas ?? 0).toLocaleString('pt-BR')} presenças no período
              </span>
            </CardHeader>
            <CardContent>
              {serie.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>
                  Nenhum encontro registrado no período. A frequência aparece aqui conforme os líderes registram as chamadas dos encontros.
                </div>
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serie} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(0,179,157,0.08)' }}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        formatter={(v) => [Number(v).toLocaleString('pt-BR'), 'Presenças']}
                        labelFormatter={(l, payload) => {
                          const p = payload?.[0]?.payload;
                          return p ? `${l} · ${p.encontros} encontro(s) · média ${p.media}` : l;
                        }}
                      />
                      <Bar dataKey="presencas" name="Presenças" fill={C.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Grupos sem relatório de encontro · visão de cobrança (Pr. Nélio) */}
          {semRelato && (() => {
            const atrasados = (semRelato.grupos || []).filter(g => g.dias_sem_relato === null || g.dias_sem_relato >= 14);
            return (
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    Grupos sem relatório de encontro
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {semRelato.sem_relato_4s} há 4+ semanas · de {semRelato.total} ativos
                  </span>
                </CardHeader>
                <CardContent>
                  <p style={{ fontSize: 11, color: C.t3, margin: '0 0 10px' }}>
                    Conta qualquer relato que vira encontro registrado: chamada feita no sistema ou relato do líder pelo bot do WhatsApp (depois de aplicado na fila). O bot cobra automaticamente o líder após 4 semanas sem relato.
                  </p>
                  {atrasados.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: C.t3, fontSize: 13 }}>
                      Todos os grupos têm relato nas últimas 2 semanas. 🎉
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {atrasados.map(g => {
                        const nunca = g.dias_sem_relato === null;
                        const critico = nunca || g.dias_sem_relato >= 28;
                        const cor = critico ? C.red : C.amber;
                        return (
                          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: `${cor}0d`, border: `1px solid ${cor}30`, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 180 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{g.nome}</span>
                              <span style={{ fontSize: 11, color: C.t3, marginLeft: 8 }}>
                                {g.lider_nome ? `Líder: ${g.lider_nome}` : 'Sem líder'}
                                {g.dia_semana != null ? ` · ${DIAS[g.dia_semana]}` : ''}
                              </span>
                            </div>
                            <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 99, background: `${cor}20`, color: cor, fontWeight: 700, flexShrink: 0 }}>
                              {nunca ? 'Nenhum relato no último ano' : `${Math.floor(g.dias_sem_relato / 7)} semana(s) sem relato`}
                            </span>
                            {g.ultimo_encontro && (
                              <span style={{ fontSize: 10, color: C.t3, flexShrink: 0 }}>último: {fmtDate(g.ultimo_encontro)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Líderes em treinamento · quem está em formação, por grupo */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                Líderes em treinamento
              </CardTitle>
              <span className="text-xs text-muted-foreground">{treino.length} pessoa(s)</span>
            </CardHeader>
            <CardContent>
              {treino.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>
                  Nenhum líder em treinamento. Abra um grupo e marque um membro como "líder em treino" na lista de membros.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {treino.map(t => (
                    <div key={t.participacao_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: t.foto_url ? `url(${t.foto_url}) center/cover` : '#8b5cf620', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#8b5cf6' }}>
                        {!t.foto_url && (t.nome?.charAt(0) || '?')}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, minWidth: 0 }}>{t.nome}</span>
                      <span style={{ fontSize: 12, color: C.t2 }}>{t.grupo_nome}</span>
                      {t.desde && <span style={{ fontSize: 11, color: C.t3, width: 96, textAlign: 'right' }}>desde {fmtDate(t.desde)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.6 }}>
            <strong>Fontes:</strong> grupos ativos e líderes (responsáveis pelos grupos) vêm do cadastro de grupos; líderes em treinamento, dos membros marcados como tal em cada grupo; a frequência, das chamadas dos encontros; a satisfação dos líderes, do último NPS registrado em Dados Brutos (tipo "NPS dos líderes").
          </div>
        </>
      )}
    </div>
  );
}
