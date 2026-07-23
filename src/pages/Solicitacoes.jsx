import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { solicitacoes as api, marketing as marketingApi } from '../api';
import NovaSolicitacaoForm, { CATEGORIAS, DocDropzone } from '../components/solicitacoes/NovaSolicitacaoForm';
import useConfirmarSaida from '../hooks/useConfirmarSaida';
import { playSuccessSound } from '../lib/sounds';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { Plus, ClipboardList, Clock, CheckCircle2, XCircle, Search as SearchIcon, ArrowRight, List, Upload, FileText, X, Users, Star, Trash2, Image as ImageIcon, Check, ChevronDown, Mail, Pencil, Lock } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

// CATEGORIAS/CATEGORIA_HINT + o form de criação vivem em
// src/components/solicitacoes/NovaSolicitacaoForm.jsx (form oficial reusável ·
// também usado pela Produção de Culto no "Fazer solicitação" da ocorrência).

const URGENCIAS = [
  { value: 'baixa', label: 'Baixa', color: 'bg-muted text-muted-foreground' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { value: 'alta', label: 'Alta', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { value: 'critica', label: 'Crítica', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
];

// Cada coluna agrupa os status reais via `match` (o backbone tem 10 status mas o
// board operacional usa 5 colunas). Sem isso, itens em aguardando_aprovacao_financeira/
// em_atendimento/aguardando_entrega/avaliado não caiam em coluna nenhuma e sumiam do board.
// `aguardando_aprovacao_origem` tem coluna PRÓPRIA (read-only · só visibilidade): a
// pessoa da área vê que a solicitação está vindo, mas não pode movê-la (quem aprova é
// o diretor de origem / co-aprovador na aba "Aprovar"). Antes sumia do quadro.
// ⚠️ color usa classes border-b-* LITERAIS (o header da coluna usa borda inferior);
// montar a classe via .replace() quebraria o JIT do Tailwind (classe não gerada).
// `hint` (opcional) vira tooltip no header da coluna (explica jargão pro usuário).
const KANBAN_COLUMNS = [
  { key: 'aguardando_aprovacao', label: 'Aguardando aprovação', icon: Clock, color: 'border-b-violet-500', match: ['aguardando_aprovacao_origem', 'aguardando_merito'], readOnly: true },
  { key: 'em_cotacao',     label: 'Em cotação',   icon: ClipboardList, color: 'border-b-cyan-500',    match: ['em_cotacao'] },
  { key: 'pendente',       label: 'Pendente',     icon: Clock,        color: 'border-b-amber-500',   match: ['pendente', 'aguardando_aprovacao_financeira', 'aguardando_ajuste'] },
  { key: 'em_analise',     label: 'Em Análise',   icon: SearchIcon,   color: 'border-b-blue-500',    match: ['em_analise'] },
  { key: 'em_atendimento', label: 'Em Andamento', icon: CheckCircle2, color: 'border-b-green-500',   match: ['aprovado', 'em_atendimento', 'aguardando_entrega'] },
  { key: 'sobrestada',     label: 'Em espera',    icon: Clock,        color: 'border-b-slate-400',   match: ['sobrestada'], readOnly: true, hint: 'Aguardando verba ou equipe — volta a andar quando for retomada.' },
  { key: 'concluido',      label: 'Concluído',    icon: CheckCircle2, color: 'border-b-emerald-600', match: ['concluido', 'avaliado'] },
  { key: 'rejeitado',      label: 'Rejeitado',    icon: XCircle,      color: 'border-b-red-500',     match: ['rejeitado', 'cancelado'] },
];

// Kanban do SOLICITANTE (aba Minhas · 2026-07-02) · colunas MACRO próprias, TODAS
// read-only: o solicitante acompanha o pedido, não move (quem move é a área na aba
// Atender). Não confundir com KANBAN_COLUMNS (board operacional da aba Atender).
// ⚠️ color usa classes border-b-* LITERAIS (o header da coluna usa borda inferior);
// montar a classe via .replace() quebraria o JIT do Tailwind (classe não gerada).
const KANBAN_COLUNAS_SOLICITANTE = [
  { key: 'em_aprovacao',       label: 'Em aprovação',         icon: Clock,         color: 'border-b-violet-500',  match: ['aguardando_aprovacao_origem', 'aguardando_merito'], readOnly: true },
  { key: 'cotacao_financeiro', label: 'Cotação e financeiro', icon: ClipboardList, color: 'border-b-cyan-500',    match: ['em_cotacao', 'aguardando_aprovacao_financeira'], readOnly: true },
  { key: 'na_fila',            label: 'Na fila',              icon: List,          color: 'border-b-amber-500',   match: ['pendente', 'em_analise', 'aguardando_ajuste'], readOnly: true },
  { key: 'em_espera',          label: 'Em espera',            icon: Clock,         color: 'border-b-slate-400',   match: ['sobrestada'], readOnly: true, hint: 'Aguardando verba ou equipe — você será avisado quando o pedido voltar a andar.' },
  { key: 'em_andamento',       label: 'Em andamento',         icon: ArrowRight,    color: 'border-b-green-500',   match: ['aprovado', 'em_atendimento', 'aguardando_entrega'], readOnly: true },
  { key: 'concluidas',         label: 'Concluídas',           icon: CheckCircle2,  color: 'border-b-emerald-600', match: ['concluido', 'avaliado'], readOnly: true },
  { key: 'nao_aprovadas',      label: 'Não aprovadas',        icon: XCircle,       color: 'border-b-red-500',     match: ['rejeitado', 'cancelado'], readOnly: true },
];

const STATUS_LABELS = {
  aguardando_aprovacao_origem: { label: 'Aguardando aprovação', color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  em_cotacao: { label: 'Em cotação', color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
  pendente: { label: 'Pendente', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  aguardando_aprovacao_financeira: { label: 'Aprov. financeira', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  em_analise: { label: 'Em Análise', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  aprovado: { label: 'Aprovado', color: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  em_atendimento: { label: 'Em atendimento', color: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  aguardando_entrega: { label: 'Aguardando entrega', color: 'bg-teal-500/15 text-teal-700 dark:text-teal-400' },
  rejeitado: { label: 'Rejeitado', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  concluido: { label: 'Concluído', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  avaliado: { label: 'Avaliado', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  aguardando_ajuste: { label: 'Aguardando ajuste', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  aguardando_merito: { label: 'Julgamento de mérito', color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  sobrestada: { label: 'Em espera (sobrestada)', color: 'bg-slate-500/15 text-slate-700 dark:text-slate-400' },
  cancelado: { label: 'Cancelado', color: 'bg-muted text-muted-foreground' },
};

function getCatMeta(cat) {
  return CATEGORIAS.find(c => c.value === cat) || CATEGORIAS[CATEGORIAS.length - 1];
}
function getUrgMeta(urg) {
  return URGENCIAS.find(u => u.value === urg) || URGENCIAS[1];
}
function getStatusMeta(status) {
  return STATUS_LABELS[status] || { label: status, color: 'bg-muted text-muted-foreground' };
}
// Normaliza pra comparar texto sem se importar com acento/caixa (ex.: "Produção" ~ "Produção de Culto").
function normalizarTxt(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
// A badge de área é redundante quando o nome da área é igual (ou está contido) no nome da
// categoria — ex.: categoria "Compras" · área "Compras", ou "Produção de Culto" · "Produção".
// Nesses casos as duas badges mostravam a mesma palavra lado a lado.
function areaBadgeRedundante(catLabel, areaLabel) {
  const a = normalizarTxt(catLabel), b = normalizarTxt(areaLabel);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}


export default function Solicitacoes() {
  const { profile, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  // De qual aba/período a lista carregada pertence · evita renderizar a lista de uma
  // aba enquanto o usuário já está em outra (o "aparece tudo e some" ao trocar de aba).
  const [itemsView, setItemsView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('todas');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  // Fase 2 · filtros de escala + período + layout da fila
  const [filterArea, setFilterArea] = useState('todas');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  const [slaOnly, setSlaOnly] = useState(false);
  const [periodo, setPeriodo] = useState('365'); // dias · 'tudo' remove o bound
  const [atenderLayout, setAtenderLayout] = useState('foco'); // 'foco' | 'kanban' | 'lista' | 'solicitante'
  const [aprovarLayout, setAprovarLayout] = useState('foco'); // aba Aprovar · 'foco' | 'kanban' | 'historico'
  const [minhasLayout, setMinhasLayout] = useState('lista'); // aba Minhas · 'lista' | 'kanban' (read-only)

  // Quem ve a fila "Para Atender": admin/diretor OU responsável cadastrado de
  // alguma área (area_solicitacoes_responsaveis). Fonte de verdade no backend
  // via /meu-papel · colaborador comum so ve "Minhas Solicitações".
  // papel.eh_diretor_origem · habilita aba "Aprovar" (diretor de setor da Spec 001).
  // Seed do último papel conhecido (localStorage) → a aba "Aprovar" renderiza NA
  // HORA ao reabrir, sem piscar esperando o /meu-papel (bug 2026-07-20).
  const PAPEL_PADRAO = { atende: false, admin: false, eh_diretor_origem: false, pendentes_origem: 0, eh_triagem_admin: false, pendentes_triagem: 0 };
  const [papel, setPapel] = useState(() => {
    try { const c = localStorage.getItem('cbrio_solic_papel'); return c ? { ...PAPEL_PADRAO, ...JSON.parse(c) } : PAPEL_PADRAO; }
    catch { return PAPEL_PADRAO; }
  });
  const [papelCarregado, setPapelCarregado] = useState(false);
  const atendeAreas = papel.atende;
  const ehDiretorOrigem = papel.eh_diretor_origem;
  const pendentesOrigem = papel.pendentes_origem || 0;
  // Triagem · super-admins veem solicitações sem setor resolvido (Fase 0).
  const ehTriagemAdmin = papel.eh_triagem_admin;
  const pendentesTriagem = papel.pendentes_triagem || 0;
  // A aba "Aprovar" agrega a fila do diretor de origem + a triagem dos super-admins.
  const ehAprovador = ehDiretorOrigem || ehTriagemAdmin;
  const pendentesAprovar = pendentesOrigem + pendentesTriagem;
  const isResponsavel = isAdmin || atendeAreas;

  // View atual · 'minhas' (lista das próprias) | 'atender' (kanban da equipe) | 'aprovar' (diretor de origem).
  const [view, setView] = useState('minhas');
  const [viewTouched, setViewTouched] = useState(false);

  async function refreshPapel() {
    try {
      const r = await api.meuPapel?.();
      if (r) { setPapel(r); try { localStorage.setItem('cbrio_solic_papel', JSON.stringify(r)); } catch (_) {} }
    } catch (_) {}
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.meuPapel?.();
        if (alive && r) { setPapel(r); try { localStorage.setItem('cbrio_solic_papel', JSON.stringify(r)); } catch (_) {} }
      } catch (_) {}
      finally { if (alive) setPapelCarregado(true); }
    })();
    return () => { alive = false; };
  }, []);

  // Posicionamento inicial · UMA vez, depois que o papel carregou de verdade.
  // Responsavel/admin começa na visão operacional ('atender'); diretor de origem
  // ou triagem com fila pendente começa em 'aprovar'.
  // ⚠️ Roda só uma vez (posicionouRef): antes, `pendentesAprovar` estava nas deps
  // e este efeito re-disparava a cada aprovação · ao zerar a fila ele CHUTAVA o
  // usuário de "Aprovar" pra "Atender" no meio do trabalho (a aba "sumia e voltava"
  // sozinha). Depois do posicionamento inicial, só o clique do usuário troca de aba.
  const posicionouRef = useRef(false);
  useEffect(() => {
    if (viewTouched || posicionouRef.current || !papelCarregado) return;
    posicionouRef.current = true;
    if (ehAprovador && pendentesAprovar > 0) {
      setView('aprovar');
    } else if (isAdmin || atendeAreas) {
      setView('atender');
    }
  }, [papelCarregado, isAdmin, atendeAreas, ehAprovador, pendentesAprovar, viewTouched]);

  // Form de criação · extraído pra NovaSolicitacaoForm (reusável). A página só
  // controla o Dialog + a guarda de saída: fechar com rascunho digitado pede
  // confirmação (useConfirmarSaida · pedido do piloto 2026-06-10).
  const [formDirty, setFormDirty] = useState(false);
  const { tentarFechar } = useConfirmarSaida(formDirty, () => setDialogOpen(false));

  // Guard contra respostas obsoletas: cada load() pega um número de sequência e
  // só o MAIS RECENTE aplica seu resultado. O realtime dispara load()s concorrentes
  // a cada mudança na tabela; sem isso, um fetch que partiu ANTES de uma aprovação
  // commitar podia resolver depois e "ressuscitar" o card recém-aprovado.
  const loadSeq = useRef(0);
  // Cache de itens por aba (viewKey) · navegação instantânea: a aba já carregada abre na
  // hora e revalida por baixo (ver useEffect [view, periodo] e o pré-load no mount).
  const cacheRef = useRef({});
  // Remove um item da lista E do cache da aba atual (optimista do aprovar/rejeitar) ·
  // mantém o cache consistente pra a navegação não "ressuscitar" o item removido.
  function dropItem(id) {
    const keep = (arr) => (arr || []).filter(i => i.id !== id);
    setItems(keep);
    const key = `${view}:${periodo}`;
    if (cacheRef.current[key]) cacheRef.current[key] = keep(cacheRef.current[key]);
  }
  async function load() {
    const seq = ++loadSeq.current;
    const key = `${view}:${periodo}`; // identidade (aba/período) desta carga
    try {
      // view='minhas' sempre filtra pelo solicitante atual · view='atender'
      // delega o filtro pro backend (responsável ve da área dele, admin ve tudo).
      // view='aprovar' · diretor de origem ve so o que precisa decidir.
      let params = {};
      if (view === 'minhas') params = { mine: 'true' };
      else if (view === 'aprovar') params = { aba: 'aprovar' };
      // Período padrão bound (Fase 2) · não se aplica à fila de aprovação.
      if (view !== 'aprovar') params.periodo = periodo;
      const data = await api.list(params);
      if (seq !== loadSeq.current) return; // chegou tarde · uma carga mais nova venceu
      setItems(data);
      setItemsView(key); // libera o render: a lista agora é desta aba
      cacheRef.current[key] = data; // alimenta o cache (navegação instantânea entre abas)
    } catch (e) {
      if (seq === loadSeq.current) toast.error(e.message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  async function handleAprovarOrigem(id) {
    // Optimista · tira o card da fila na hora pra não "piscar" enquanto o backend
    // processa e o realtime recarrega. Em erro, o load() reconcilia com o servidor
    // (traz o card de volta se a aprovação não foi aplicada).
    dropItem(id);
    try {
      await api.aprovarOrigem(id);
      toast.success('Solicitação aprovada.');
      await refreshPapel();
      load();
    } catch (e) {
      toast.error(e.message || 'Erro ao aprovar.');
      load();
    }
  }

  async function handleRejeitarOrigem(id, motivo) {
    dropItem(id);
    try {
      await api.rejeitarOrigem(id, motivo);
      toast.success('Solicitação rejeitada.');
      await refreshPapel();
      load();
    } catch (e) {
      toast.error(e.message || 'Erro ao rejeitar.');
      load();
    }
  }

  // Julgamento de mérito (Pastor Presidente) · mesma mecânica otimista do portão de origem.
  async function handleAprovarMerito(id) {
    dropItem(id);
    try {
      await api.aprovarMerito(id);
      toast.success('Mérito aprovado.');
      await refreshPapel();
      load();
    } catch (e) {
      toast.error(e.message || 'Erro ao aprovar o mérito.');
      load();
    }
  }

  async function handleReprovarMerito(id, motivo) {
    dropItem(id);
    try {
      await api.reprovarMerito(id, motivo);
      toast.success('Mérito reprovado.');
      await refreshPapel();
      load();
    } catch (e) {
      toast.error(e.message || 'Erro ao reprovar o mérito.');
      load();
    }
  }

  // Ref pra sempre chamar a versão MAIS RECENTE do load() (com o view atual)
  // dentro do callback do Realtime · sem isso o canal capturava o load via
  // closure de mount e usava `view='atender'` velho mesmo quando o usuário
  // já estava em 'minhas', sobrescrevendo a lista 3s depois de trocar de aba.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  useEffect(() => {
    // Aba já visitada? mostra o cache na hora (sem spinner) e revalida por baixo.
    // Senão, o itemsFresh (abaixo) segura com "carregando" até o load() voltar.
    const k = `${view}:${periodo}`;
    const cached = cacheRef.current[k];
    if (cached) { setItems(cached); setItemsView(k); }
    load();
  }, [view, periodo]);

  // A lista (items) pode ainda ser da aba ANTERIOR enquanto o load() da aba nova não
  // volta. itemsFresh só é true quando a lista carregada é da aba/período atuais ·
  // enquanto não for, o render mostra "carregando" no lugar da lista errada. Isso mata o
  // "aparece tudo e some" ao trocar de aba (a lista de outra aba sendo filtrada na tela).
  // O realtime recarrega a MESMA aba, então itemsFresh continua true (atualiza sem spinner).
  const viewKey = `${view}:${periodo}`;
  const itemsFresh = itemsView === viewKey;

  // Pré-carrega as abas que o usuário vê, ao ABRIR a página · assim trocar de aba fica
  // instantâneo (o cache já está quente). Só popula o cache; a view atual o load() cobre.
  async function prefetchAba(v) {
    const key = `${v}:${periodo}`;
    if (cacheRef.current[key]) return;
    let params = {};
    if (v === 'minhas') params = { mine: 'true' };
    else if (v === 'aprovar') params = { aba: 'aprovar' };
    if (v !== 'aprovar') params.periodo = periodo;
    try { cacheRef.current[key] = await api.list(params); } catch { /* silencioso · a aba carrega normal ao ser aberta */ }
  }
  useEffect(() => {
    if (!papelCarregado) return;
    const abas = [];
    if (isAdmin || atendeAreas) abas.push('atender');
    if (ehAprovador) abas.push('aprovar');
    abas.push('minhas');
    abas.forEach(v => { if (v !== view) prefetchAba(v); });
  }, [papelCarregado, periodo, isAdmin, atendeAreas, ehAprovador, view]);

  // Realtime · qualquer INSERT/UPDATE/DELETE em `solicitações` recarrega
  // o kanban/lista. Debounce 400ms agrega rajadas (ex: trigger de SLA
  // atualiza a mesma row várias vezes em sequencia).
  useEffect(() => {
    if (!supabase || !profile?.id) return;
    let timeout = null;
    function schedReload() {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => { loadRef.current?.(); }, 400);
    }
    // Garante que o socket de realtime está autenticado com o JWT atual · sem
    // isso o canal pode conectar como anon e a RLS (policies só de authenticated)
    // descarta TODOS os eventos → o quadro não atualiza sozinho.
    supabase.auth.getSession().then(({ data }) => {
      const tk = data?.session?.access_token;
      if (tk) { try { supabase.realtime.setAuth(tk); } catch { /* best-effort */ } }
    }).catch(() => {});
    const channel = supabase
      .channel(`solicitacoes:${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes' },
        schedReload
      )
      .subscribe();
    return () => {
      if (timeout) clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [profile?.id, isResponsavel]);

  // Rede de garantia do "tempo real" · além do canal Realtime (que pode perder
  // eventos por RLS/reconexão do socket), um poll leve mantém o quadro fresco SEM
  // recarregar a página. Pausa quando a aba está oculta; ao voltar ao foco,
  // recarrega na hora. 12s é suave pra um ERP interno e imperceptível na UI
  // (load() tem guarda de sequência · não pisca nem atropela ação em curso).
  useEffect(() => {
    function tick() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadRef.current?.();
    }
    function onVisible() {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') loadRef.current?.();
    }
    const interval = setInterval(tick, 12000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Opções dos filtros derivadas do conjunto carregado (sempre relevantes).
  const areasOpts = useMemo(
    () => [...new Set(items.map(i => i.area_responsavel).filter(Boolean))].sort(),
    [items]);
  const statusOpts = useMemo(
    () => [...new Set(items.map(i => i.status).filter(Boolean))].sort(),
    [items]);

  const filtered = useMemo(() => {
    let r = items;
    if (filterCat !== 'todas')    r = r.filter(i => i.categoria === filterCat);
    if (filterArea !== 'todas')   r = r.filter(i => i.area_responsavel === filterArea);
    if (filterStatus !== 'todos') r = r.filter(i => i.status === filterStatus);
    if (slaOnly)                  r = r.filter(isSlaEstourando);
    const t = busca.trim().toLowerCase();
    if (t) r = r.filter(i =>
      (i.titulo || '').toLowerCase().includes(t) ||
      (i.descricao || '').toLowerCase().includes(t));
    return r;
  }, [items, filterCat, filterArea, filterStatus, slaOnly, busca]);

  const columns = useMemo(() => {
    return KANBAN_COLUMNS.map(col => ({
      ...col,
      items: filtered.filter(i => (col.match || [col.key]).includes(i.status)),
    }));
  }, [filtered]);

  // Kanban do solicitante (aba Minhas) · colunas macro read-only.
  const colunasSolicitante = useMemo(() => {
    return KANBAN_COLUNAS_SOLICITANTE.map(col => ({
      ...col,
      items: filtered.filter(i => col.match.includes(i.status)),
    }));
  }, [filtered]);

  async function handleStatusChange(id, newStatus, observacoes) {
    // Atualização otimista · o card move pra coluna na hora (sem esperar o
    // round-trip). Guarda o status antigo pra reverter se o servidor falhar.
    const statusAntigo = items.find(i => i.id === id)?.status;
    if (statusAntigo === newStatus && !observacoes) return; // no-op · nada mudou
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
    try {
      const payload = { status: newStatus };
      if (observacoes) payload.observacoes = observacoes;
      await api.update(id, payload);
      if (newStatus === 'concluido') {
        playSuccessSound();
        toast.success('Solicitação concluída!');
      } else {
        toast.success('Status atualizado');
      }
      load(); // reconcilia em segundo plano · não bloqueia o movimento do card
    } catch (e) {
      // reverte a posição do card
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: statusAntigo } : i));
      toast.error(e.message);
    }
  }

  async function handleNpsSubmit(id, nota, comentario) {
    try {
      const updated = await api.update(id, { nps_nota: nota, nps_comentario: comentario });
      toast.success('Obrigado pela avaliação!');
      // Mescla com o item atual pra preservar campos enriquecidos (solicitante/responsavel)
      setDetailItem(curr => (curr ? { ...curr, ...updated } : updated));
      load();
    } catch (e) {
      toast.error(e.message || 'Erro ao enviar avaliação');
      throw e;
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Solicitações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Peça compras, serviços, contratações, pagamentos, reembolsos, reservas, TI, marketing, hospitalidade, férias e licenças — e acompanhe tudo por aqui</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Config de responsáveis · so admin/diretor */}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = '/admin/solicitacoes-responsaveis'}
              className="gap-1.5"
              title="Configurar responsáveis por área"
            >
              <Users className="h-4 w-4" /> Responsáveis
            </Button>
          )}

          {/* New request — everyone · form extraído pra NovaSolicitacaoForm
              (reusado pela Produção) · fechar com rascunho pede confirmação */}
          <Dialog open={dialogOpen} onOpenChange={(v) => { if (v) setDialogOpen(true); else tentarFechar(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Nova Solicitação
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Nova Solicitação</DialogTitle>
              </DialogHeader>
              <NovaSolicitacaoForm
                onDirtyChange={setFormDirty}
                onCancel={tentarFechar}
                onCreated={() => { setDialogOpen(false); load(); }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs · Aprovar (diretor de origem + triagem super-admin) · Para Atender · Minhas. */}
      {(isResponsavel || ehAprovador) && (
        <div className="flex items-center gap-1 border-b border-border">
          {ehAprovador && (
            <button
              type="button"
              onClick={() => { setViewTouched(true); setView('aprovar'); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                view === 'aprovar'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Aprovar
              {pendentesAprovar > 0 && (
                <Badge className="text-[10px] bg-violet-500/15 text-violet-700 dark:text-violet-400 px-1.5">
                  {pendentesAprovar}
                </Badge>
              )}
            </button>
          )}
          {isResponsavel && (
            <button
              type="button"
              onClick={() => { setViewTouched(true); setView('atender'); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                view === 'atender'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Para Atender
            </button>
          )}
          <button
            type="button"
            onClick={() => { setViewTouched(true); setView('minhas'); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              view === 'minhas'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Minhas Solicitações
          </button>
        </div>
      )}

      {/* Fase 2 · barra de filtros (atender + minhas · não na aprovação) */}
      {view !== 'aprovar' && !loading && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar título ou descrição" className="pl-8 h-9" />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas categorias</SelectItem>
              {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {view === 'atender' && areasOpts.length > 1 && (
            <Select value={filterArea} onValueChange={setFilterArea}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="Área" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas áreas</SelectItem>
                {areasOpts.map(a => <SelectItem key={a} value={a}>{AREA_LABELS[a] || a}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {statusOpts.length > 1 && (
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                {statusOpts.map(s => <SelectItem key={s} value={s}>{getStatusMeta(s).label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="180">Últimos 6 meses</SelectItem>
              <SelectItem value="365">Último ano</SelectItem>
              <SelectItem value="730">Últimos 2 anos</SelectItem>
              <SelectItem value="tudo">Tudo</SelectItem>
            </SelectContent>
          </Select>
          {view === 'atender' && (
            <Button variant={slaOnly ? 'default' : 'outline'} size="sm"
              onClick={() => setSlaOnly(s => !s)} className="h-9 gap-1.5">
              <Clock className="h-4 w-4" /> SLA estourando
            </Button>
          )}
          {view === 'atender' && (
            <div className="ml-auto inline-flex rounded-md border border-border overflow-hidden">
              <button type="button" onClick={() => setAtenderLayout('foco')}
                className={`px-3 h-9 text-sm ${atenderLayout === 'foco' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Foco</button>
              <button type="button" onClick={() => setAtenderLayout('kanban')}
                className={`px-3 h-9 text-sm border-l border-border ${atenderLayout === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Kanban</button>
              <button type="button" onClick={() => setAtenderLayout('lista')}
                className={`px-3 h-9 text-sm border-l border-border ${atenderLayout === 'lista' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Lista</button>
              <button type="button" onClick={() => setAtenderLayout('solicitante')}
                className={`px-3 h-9 text-sm border-l border-border ${atenderLayout === 'solicitante' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Por solicitante</button>
            </div>
          )}
          {view === 'minhas' && (
            <div className="ml-auto inline-flex rounded-md border border-border overflow-hidden">
              <button type="button" onClick={() => setMinhasLayout('lista')}
                className={`px-3 h-9 text-sm ${minhasLayout === 'lista' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Lista</button>
              <button type="button" onClick={() => setMinhasLayout('kanban')}
                className={`px-3 h-9 text-sm border-l border-border ${minhasLayout === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Kanban</button>
            </div>
          )}
        </div>
      )}

      {/* Barra da aba Aprovar · resumo + alternador (Foco | Kanban | Histórico) */}
      {view === 'aprovar' && !loading && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {aprovarLayout === 'historico'
              ? 'Histórico das suas decisões (origem · gestão · mérito).'
              : `${filtered.length} ${filtered.length === 1 ? 'solicitação aguardando' : 'solicitações aguardando'} sua aprovação.`}
          </p>
          <div className="ml-auto inline-flex rounded-md border border-border overflow-hidden">
            <button type="button" onClick={() => setAprovarLayout('foco')}
              className={`px-3 h-9 text-sm ${aprovarLayout === 'foco' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Foco</button>
            <button type="button" onClick={() => setAprovarLayout('kanban')}
              className={`px-3 h-9 text-sm border-l border-border ${aprovarLayout === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Kanban</button>
            <button type="button" onClick={() => setAprovarLayout('historico')}
              className={`px-3 h-9 text-sm border-l border-border ${aprovarLayout === 'historico' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Histórico</button>
          </div>
        </div>
      )}

      {/* Content: Kanban so na view 'atender' · Lista de aprovação em 'aprovar' · Lista simples nas demais. */}
      {(loading || !itemsFresh) ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : view === 'aprovar' && aprovarLayout === 'historico' ? (
        /* ── Aba Aprovar · Histórico das minhas decisões ── */
        <HistoricoAprovacoes isAdmin={isAdmin} />
      ) : view === 'aprovar' ? (
        /* ── Aba Aprovar · diretor de origem/Gestão/mérito ── */
        (() => {
          // O backend indica o papel pendente do ator ('origem'|'gestao'|'merito').
          // Mérito ganha card próprio; origem/gestão usam o mesmo card.
          const renderCard = (item) => (
            item.aprovacao_papel_pendente === 'merito' ? (
              <AprovacaoMeritoCard key={item.id} item={item} onApprove={handleAprovarMerito} onReject={handleReprovarMerito} onClick={() => setDetailItem(item)} />
            ) : (
              <AprovacaoOrigemCard key={item.id} item={item} onApprove={handleAprovarOrigem} onReject={handleRejeitarOrigem} onClick={() => setDetailItem(item)} />
            )
          );
          if (filtered.length === 0) {
            return (
              <Card className="p-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-muted-foreground">Sem solicitações aguardando aprovação.</p>
                <p className="text-sm text-muted-foreground mt-1">Quando houver uma solicitação pendente de aprovação, aparecerá aqui.</p>
              </Card>
            );
          }
          if (aprovarLayout !== 'kanban') {
            // FOCO (padrão) · cards de resumo no topo + agrupado por urgência.
            const ehUrg = (i) => i.eh_urgente || i.urgencia === 'urgente';
            const urgentes = filtered.filter(ehUrg);
            const demais = filtered.filter(i => !ehUrg(i));
            const valor = filtered.reduce((s, i) => s + (Number(i.valor_estimado) || 0), 0);
            const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" style={{ color: '#00B39D' }} /> Aguardando</div>
                    <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: '#00B39D' }}>{filtered.length}</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5 text-red-500" /> Urgentes</div>
                    <p className="text-2xl font-bold mt-1 tabular-nums text-red-600">{urgentes.length}</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5 text-indigo-500" /> Valor em análise</div>
                    <p className="text-2xl font-bold mt-1 tabular-nums text-indigo-600">{money(valor)}</p>
                  </div>
                </div>
                {urgentes.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-2">Urgentes · {urgentes.length}</p>
                    <div className="space-y-3">{urgentes.map(renderCard)}</div>
                  </div>
                )}
                {demais.length > 0 && (
                  <div>
                    {urgentes.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Demais · {demais.length}</p>}
                    <div className="space-y-3">{demais.map(renderCard)}</div>
                  </div>
                )}
              </div>
            );
          }
          // Kanban por categoria · só colunas com itens, na ordem de CATEGORIAS.
          const porCat = new Map();
          for (const it of filtered) {
            const k = it.categoria || 'outro';
            if (!porCat.has(k)) porCat.set(k, []);
            porCat.get(k).push(it);
          }
          const colunas = CATEGORIAS.filter(c => porCat.has(c.value));
          const extras = [...porCat.keys()].filter(k => !CATEGORIAS.some(c => c.value === k)).map(k => ({ value: k, label: k }));
          const todas = [...colunas, ...extras];
          return (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {todas.map(col => (
                <div key={col.value} className="shrink-0 w-[340px] flex flex-col">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="font-semibold text-sm">{col.label}</span>
                    <span className="text-xs text-muted-foreground rounded-full bg-muted px-2 py-0.5">{porCat.get(col.value).length}</span>
                  </div>
                  <div className="space-y-3">{porCat.get(col.value).map(renderCard)}</div>
                </div>
              ))}
            </div>
          );
        })()
      ) : view === 'atender' ? (
        /* ── Kanban Board (managers/admins) ── */
        <>
        <TermometroRefeitas />
        {atenderLayout === 'foco' ? (
          <AtenderFoco items={filtered} onOpen={setDetailItem} selectedId={detailItem?.id} />
        ) : atenderLayout === 'lista' ? (
          <ListaSolicitacoes items={filtered} onOpen={setDetailItem} profileId={profile?.id}
            emptyMsg="Nenhuma solicitação na fila para os filtros atuais." />
        ) : atenderLayout === 'solicitante' ? (
          <PainelPorSolicitante items={filtered} onOpen={setDetailItem} />
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-8 gap-4">
          {columns.map(col => (
            <div
              key={col.key}
              className={`flex flex-col rounded-lg transition-colors ${dragOverCol === col.key ? 'bg-accent/50 ring-2 ring-primary/30' : ''}`}
              onDragOver={e => { if (!isResponsavel || col.readOnly) return; e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => {
                e.preventDefault();
                setDragOverCol(null);
                if (!isResponsavel || col.readOnly) return;
                const itemId = e.dataTransfer.getData('text/plain');
                if (!itemId) return;
                // Ignora drop na MESMA coluna · não dispara update nem toast
                // (evita lançamento redundante que mexeria em SLA/indicadores).
                const item = items.find(i => i.id === itemId);
                const colAtual = KANBAN_COLUMNS.find(c => (c.match || [c.key]).includes(item?.status))?.key;
                if (!item || colAtual === col.key) return;
                handleStatusChange(itemId, col.key);
              }}
            >
              <div className={`flex items-center gap-2 pb-3 mb-3 border-b-2 ${col.color}`} title={col.hint}>
                <col.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{col.label}</span>
                <Badge variant="secondary" className="ml-auto text-xs">{col.items.length}</Badge>
              </div>
              <ScrollArea className="flex-1 max-h-[calc(100vh-280px)]">
                <div className="space-y-3 pr-1 min-h-[60px]">
                  {col.items.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 italic text-center py-8">Nada por aqui</p>
                  )}
                  {col.items.map(item => (
                    <SolicitacaoCard
                      key={item.id}
                      item={item}
                      isAdmin={isResponsavel}
                      onStatusChange={handleStatusChange}
                      onClick={() => setDetailItem(item)}
                      draggable={isResponsavel && !col.readOnly}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
        )}
        </>
      ) : minhasLayout === 'kanban' ? (
        /* ── Kanban do solicitante (read-only) · colunas macro · sem drag ── */
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
          {colunasSolicitante.map(col => (
            <div key={col.key} className="flex flex-col rounded-lg">
              <div className={`flex items-center gap-2 pb-3 mb-3 border-b-2 ${col.color}`} title={col.hint}>
                <col.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{col.label}</span>
                <Badge variant="secondary" className="ml-auto text-xs">{col.items.length}</Badge>
              </div>
              <ScrollArea className="flex-1 max-h-[calc(100vh-280px)]">
                <div className="space-y-3 pr-1 min-h-[60px]">
                  {col.items.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 italic text-center py-8">Nada por aqui</p>
                  )}
                  {col.items.map(item => (
                    <SolicitacaoCard
                      key={item.id}
                      item={item}
                      isAdmin={false}
                      onStatusChange={() => {}}
                      onClick={() => setDetailItem(item)}
                      draggable={false}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      ) : (
        /* ── Aba Minhas · lista agrupada com rastreio (2026-07-02) ── */
        <MinhasLista
          items={filtered}
          onOpen={setDetailItem}
          profileId={profile?.id}
          temFiltros={busca.trim() !== '' || filterCat !== 'todas' || filterStatus !== 'todos' || filterArea !== 'todas' || slaOnly}
        />
      )}

      {/* Detail dialog · vira painel lateral (Sheet) no layout Foco da aba Atender */}
      <DetailDialog
        item={detailItem}
        asSheet={(view === 'atender' && atenderLayout === 'foco') || (view === 'aprovar' && aprovarLayout === 'foco')}
        onClose={() => setDetailItem(null)}
        isAdmin={isResponsavel}
        currentUserId={profile?.id}
        onStatusChange={handleStatusChange}
        onNpsSubmit={handleNpsSubmit}
        onItemRefresh={async () => {
          // recarrega a lista (respeitando view + período) e atualiza o detailItem
          const params = {};
          if (view === 'minhas') params.mine = 'true';
          else if (view === 'aprovar') params.aba = 'aprovar';
          if (view !== 'aprovar') params.periodo = periodo;
          const data = await api.list(params);
          setItems(data);
          setDetailItem(curr => (curr ? data.find(d => d.id === curr.id) || curr : curr));
        }}
      />
    </div>
  );
}

// Fase 2 · rótulos de área (area_responsavel) pro filtro e pra lista da fila.
const AREA_LABELS = {
  reserva_espaco: 'Reserva de espaço', cozinha: 'Cozinha', limpeza: 'Limpeza',
  manutencao: 'Manutenção', logistica_estoque: 'Estoque', logistica_compras: 'Compras',
  ti: 'TI', rh: 'RH', financeiro: 'Financeiro', marketing: 'Marketing', producao: 'Produção',
  hospitalidade: 'Hospitalidade',
};

// ═══════════════════════════════════════════════════════════════════════
// Rastreio "tipo encomenda" (2026-07-02) · o solicitante vê em qual etapa o
// pedido está, com quem está agora e há quanto tempo. Etapas macro derivadas
// do fluxo real do backbone (portão de origem → cotação → financeiro →
// atendimento → entrega → conclusão). Funções puras, só leitura: nenhum
// status/endpoint de decisão é alterado por aqui.
// ═══════════════════════════════════════════════════════════════════════
const ETAPA_DO_STATUS = {
  aguardando_aprovacao_origem: 'aprovacao',
  aguardando_merito: 'aprovacao',
  em_cotacao: 'cotacao',
  aguardando_aprovacao_financeira: 'financeiro',
  pendente: 'atendimento',
  em_analise: 'atendimento',
  aprovado: 'atendimento',
  em_atendimento: 'atendimento',
  aguardando_entrega: 'entrega',
  concluido: 'concluida',
  avaliado: 'concluida',
};

function etapasDoItem(item) {
  const encerradaOk = ['concluido', 'avaliado'].includes(item.status);
  // Aprovação de origem só aparece se o pedido passou/passará por ela
  // (dispensada ou nula = fluxo sem o portão · linhas antigas).
  const passaAprovacao = !!item.aprovacao_origem_status && item.aprovacao_origem_status !== 'dispensada';
  const temCotacao = ['compras', 'servico'].includes(item.categoria);
  const temFinanceiro = !!item.precisa_aprovacao_financeira;
  const temEntrega = item.categoria === 'compras';

  const etapas = [{ key: 'enviada', label: 'Enviada', data: item.created_at }];
  if (passaAprovacao) etapas.push({ key: 'aprovacao', label: 'Aprovação', data: item.aprovacao_origem_em });
  if (temCotacao) etapas.push({ key: 'cotacao', label: 'Cotação', data: item.cotacao_em });
  if (temFinanceiro) etapas.push({ key: 'financeiro', label: 'Financeiro', data: item.aprovado_financeiro_em });
  etapas.push({ key: 'atendimento', label: 'Atendimento', data: item.respondido_em });
  if (temEntrega) etapas.push({ key: 'entrega', label: 'Entrega', data: null });
  etapas.push({ key: 'concluida', label: 'Concluída', data: item.concluido_em });

  // Etapa ativa: mapeada do status atual. Terminais (aguardando_ajuste/rejeitado/
  // cancelado) não têm etapa própria → fica na etapa em que estava (1º portão sem
  // timestamp cumprido; se todos cumpridos, estava no atendimento). Etapa anterior
  // à ativa conta como completa mesmo sem timestamp (ex.: compra urgente pula a
  // cotação · o status já avançou).
  let atualIdx = etapas.findIndex(e => e.key === ETAPA_DO_STATUS[item.status]);
  if (atualIdx < 0) {
    const gates = { aprovacao: item.aprovacao_origem_em, cotacao: item.cotacao_em, financeiro: item.aprovado_financeiro_em };
    atualIdx = etapas.findIndex(e => e.key in gates && !gates[e.key]);
    if (atualIdx < 0) atualIdx = etapas.findIndex(e => e.key === 'atendimento');
  }

  const terminal = item.status === 'rejeitado'
    ? { tipo: 'rejeitada', motivo: item.aprovacao_origem_status === 'rejeitada' ? (item.aprovacao_origem_motivo || null) : null }
    : item.status === 'cancelado'
      ? { tipo: 'cancelada' }
      : item.status === 'aguardando_ajuste'
        ? { tipo: 'ajuste' }
        // Sobrestada não substitui o stepper: congela na etapa em que estava
        // (igual ao ajuste) e a faixa "Em espera" explica o motivo/revisão.
        : item.status === 'sobrestada'
          ? { tipo: 'sobrestada', motivo: item.sobrestada_motivo || null, revisao: item.sobrestada_revisao || null }
          : null;

  return {
    etapas: etapas.map((e, i) => ({
      ...e,
      done: encerradaOk || i < atualIdx,
      atual: !encerradaOk && i === atualIdx,
    })),
    terminal,
  };
}

// Formata data (ISO ou date-only) como dd/mm · faixa da sobrestada (revisão).
function fmtDiaMes(d) {
  if (!d) return null;
  const dt = new Date(String(d).length === 10 ? `${d}T00:00:00` : d);
  return Number.isNaN(dt.getTime()) ? null : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Há quanto tempo o pedido está parado na etapa atual · updated_at reflete o
// último movimento (fallback created_at).
function tempoNaEtapa(item) {
  const ref = item.updated_at || item.created_at;
  if (!ref) return '';
  const dias = Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 86400000));
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

// "Está com quem" · papel + tempo. Não expõe nome além do que a UI atual já
// expõe (aprovadores de origem, que a faixa violeta já mostra hoje).
function comQuemEsta(item) {
  const tempo = tempoNaEtapa(item);
  const suf = tempo ? ` · ${tempo}` : '';
  switch (item.status) {
    case 'aguardando_aprovacao_origem': {
      if (item.aprovacao_origem_status === 'triagem') return `Em triagem · definindo o aprovador${suf}`;
      // Quem está pendente AGORA (origem → 2º carimbo). O backend já resolve
      // isso em aprovacao_pendente_de; se a origem já foi aprovada, mostra o 2º
      // aprovador (Gestão ou, no caso de TI, Diego/Matheus) — não o diretor que
      // já carimbou.
      const pendentes = Array.isArray(item.aprovacao_pendente_de)
        ? item.aprovacao_pendente_de.filter(Boolean) : [];
      const aprovadores = pendentes.length ? pendentes : (Array.isArray(item.aprovacao_origem_aprovadores)
        ? item.aprovacao_origem_aprovadores.filter(Boolean) : []);
      const quem = aprovadores.length
        ? aprovadores.join(' ou ')
        : (item.aprovacao_origem_diretor?.name || 'diretor de origem');
      return `Aguardando aprovação de ${quem}${suf}`;
    }
    case 'aguardando_merito':
      return `Com o Pastor Presidente (julgamento de mérito)${suf}`;
    case 'em_cotacao':
      return `Com a equipe de compras (em cotação)${suf}`;
    case 'aguardando_aprovacao_financeira':
      return `Com o financeiro${suf}`;
    case 'pendente':
    case 'em_analise':
    case 'aprovado':
    case 'em_atendimento': {
      const area = item.area_responsavel
        ? (AREA_LABELS[item.area_responsavel] || item.area_responsavel)
        : 'área responsável';
      return `Com a equipe de ${area}${suf}`;
    }
    case 'aguardando_entrega':
      return 'Compra a caminho';
    case 'aguardando_ajuste':
      return 'Com você · precisa de ajuste';
    default:
      return null;
  }
}

// Stepper de rastreio da solicitação · compacto (card da aba Minhas) ou completo
// (topo do DetailDialog · bolinhas maiores com rótulo e data nas concluídas).
// Padrão visual inspirado na timeline do MLTrackingBlock.
function TrackerSolicitacao({ item, compacto = false }) {
  const { etapas, terminal } = etapasDoItem(item);
  const substituiStepper = terminal && !['ajuste', 'sobrestada'].includes(terminal.tipo);
  // Em ajuste/sobrestada a faixa já diz onde o pedido está · não repete na linha de quem.
  const quem = ['ajuste', 'sobrestada'].includes(terminal?.tipo) ? null : comQuemEsta(item);
  const etapaAtualLabel = etapas.find(e => e.atual)?.label || 'Concluída';
  const fmtData = (iso) => iso
    ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null;

  const faixaTerminal = substituiStepper && (
    <div className={`rounded-md border px-3 ${compacto ? 'py-1.5 text-[11px]' : 'py-2 text-xs'} ${
      terminal.tipo === 'rejeitada'
        ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400'
        : 'bg-muted border-border text-muted-foreground'
    }`}>
      {terminal.tipo === 'rejeitada'
        ? <><span className="font-semibold">Não aprovada</span>{terminal.motivo ? ` · ${terminal.motivo}` : ''}</>
        : <span className="font-semibold">Cancelada</span>}
    </div>
  );

  const faixaAjuste = terminal?.tipo === 'ajuste' ? (
    <div className={`rounded-md border border-amber-500/30 bg-amber-500/10 px-3 text-amber-700 dark:text-amber-400 ${compacto ? 'py-1.5 text-[11px]' : 'py-2 text-xs'}`}>
      <span className="font-semibold">Devolvida pra você</span> · precisa de ajuste
    </div>
  ) : null;

  const revisaoFmt = terminal?.tipo === 'sobrestada' ? fmtDiaMes(terminal.revisao) : null;
  const EXPLICA_ESPERA = 'Aguardando verba ou equipe — você será avisado quando o pedido voltar a andar.';
  const faixaSobrestada = terminal?.tipo === 'sobrestada' ? (
    <div title={EXPLICA_ESPERA} className={`rounded-md border border-amber-500/30 bg-amber-500/10 px-3 text-amber-700 dark:text-amber-400 ${compacto ? 'py-1.5 text-[11px]' : 'py-2 text-xs'}`}>
      <span className="font-semibold">Em espera</span>
      {terminal.motivo ? ` · ${terminal.motivo}` : ''}
      {revisaoFmt ? ` · revisão em ${revisaoFmt}` : ''}
      {!compacto && (
        <span className="block mt-0.5 font-normal opacity-80">{EXPLICA_ESPERA}</span>
      )}
    </div>
  ) : null;

  if (compacto) {
    if (substituiStepper) {
      return <div className="mt-3 pt-3 border-t border-border">{faixaTerminal}</div>;
    }
    return (
      <div className="mt-3 pt-3 border-t border-border space-y-2">
        {faixaAjuste}
        {faixaSobrestada}
        <div className="flex items-center gap-2">
          <div className="flex items-center flex-1 min-w-0">
            {etapas.map((et, i) => (
              <Fragment key={et.key}>
                {i > 0 && (
                  <div className={`h-px flex-1 min-w-[8px] ${etapas[i - 1].done ? 'bg-primary' : 'bg-border'}`} />
                )}
                <div
                  title={et.label}
                  className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                    et.done ? 'bg-primary'
                      : et.atual ? 'bg-primary/25 ring-2 ring-primary animate-pulse motion-reduce:animate-none'
                        : 'bg-muted border border-border'
                  }`}
                />
              </Fragment>
            ))}
          </div>
          <span className="text-[10px] font-medium text-foreground shrink-0">{etapaAtualLabel}</span>
        </div>
        {/* "Está com quem" · a informação nº 1 pro solicitante — destaque sutil */}
        {quem && <p className="text-xs font-medium text-foreground/80">{quem}</p>}
      </div>
    );
  }

  // Versão completa (topo do DetailDialog)
  return (
    <div className="space-y-3 pb-3 border-b border-border">
      {substituiStepper ? faixaTerminal : (
        <>
          {faixaAjuste}
          {faixaSobrestada}
          <div className="flex items-start pt-1">
            {etapas.map((et, i) => (
              <div key={et.key} className="relative flex-1 flex flex-col items-center min-w-0">
                {i > 0 && (
                  <div
                    className={`absolute top-[13px] h-0.5 w-full ${etapas[i - 1].done ? 'bg-primary' : 'bg-border'}`}
                    style={{ left: '-50%' }}
                  />
                )}
                <div className={`relative z-[1] h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                  et.done ? 'bg-primary text-primary-foreground'
                    : et.atual ? 'bg-primary/15 text-primary ring-2 ring-primary animate-pulse motion-reduce:animate-none'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {et.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={`text-[10px] mt-1 text-center leading-tight ${et.done || et.atual ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {et.label}
                </span>
                {et.done && fmtData(et.data) && (
                  <span className="text-[9px] text-muted-foreground">{fmtData(et.data)}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {!substituiStepper && quem && <p className="text-xs font-medium text-foreground/80">{quem}</p>}
    </div>
  );
}

// "SLA estourando" = não pausado/encerrado E prazo ativo vencido ou < 24h pra
// vencer (mesma régua do getSlaBadge, que mostra badge quando < 24h ou atrasado).
function isSlaEstourando(item) {
  const fora = ['concluido', 'avaliado', 'rejeitado', 'cancelado', 'aprovado', 'aguardando_ajuste', 'sobrestada', 'aguardando_merito'].includes(item.status);
  if (fora) return false;
  const ativo = !item.respondido_em ? item.sla_resposta_deadline : item.sla_resolucao_deadline;
  if (!ativo) return false;
  return (new Date(ativo).getTime() - Date.now()) / 3600000 < 24;
}

// Lista plana de solicitações · reusada na aba "Minhas" e no modo Lista da fila
// "Para Atender" (a "Caixa da Área": filtre por área e veja a fila daquela área).
// comTracker (aba Minhas): adiciona o stepper compacto + "está com quem" em cada
// card — e o tracker passa a cobrir as linhas antigas de aprovação/rejeição.
// ── Layout "Foco" da aba Para Atender (2026-07-08) ──────────────────────
// Cards no topo + lista priorizada (Urgentes → Demais); clicar abre o detalhe
// no painel lateral direito (DetailDialog asSheet). Estilo adaptado do design
// do Matheus (Claude Design) pras cores/tipografia do sistema.
function AtenderFoco({ items, onOpen, selectedId }) {
  const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const ehUrgente = (i) => i.eh_urgente || i.urgencia === 'urgente';
  const urgentes = items.filter(ehUrgente);
  const demais = items.filter(i => !ehUrgente(i));
  const atrasadas = items.filter(isSlaEstourando);
  const valorAnalise = items.reduce((s, i) => s + (Number(i.valor_estimado) || 0), 0);

  const cards = [
    { label: 'Na fila', valor: items.length, cor: '#00B39D', icon: ClipboardList },
    { label: 'Urgentes', valor: urgentes.length, cor: '#ef4444', icon: Clock },
    { label: 'SLA estourando', valor: atrasadas.length, cor: '#f59e0b', icon: Clock },
    { label: 'Valor em análise', valor: money(valorAnalise), cor: '#6366f1', icon: FileText },
  ];

  const Row = (item) => {
    const cat = getCatMeta(item.categoria);
    const sla = getSlaBadge(item);
    const ini = (item.solicitante?.name || item.titulo || '?').trim().charAt(0).toUpperCase();
    const sub = comQuemEsta(item) || (item.solicitante?.name ? `por ${item.solicitante.name}` : '');
    return (
      <button
        key={item.id}
        onClick={() => onOpen(item)}
        className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg border transition-colors hover:bg-muted/40 ${
          selectedId === item.id ? 'border-primary ring-1 ring-primary/30 bg-primary/5' : 'border-border bg-card'
        }`}
      >
        <span className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold text-white" style={{ backgroundColor: '#00B39D' }}>
          {ini}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{item.titulo}</span>
            <Badge className={`text-[10px] ${cat.color}`}>{cat.label}</Badge>
            {ehUrgente(item) && <Badge className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400">Urgente</Badge>}
          </div>
          {sub && <p className="text-xs text-muted-foreground truncate mt-0.5">{sub}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {Number(item.valor_estimado) > 0 && (
            <span className="text-xs font-medium tabular-nums hidden sm:inline">{money(item.valor_estimado)}</span>
          )}
          {sla && <Badge className={`text-[10px] ${sla.color}`}>{sla.label}</Badge>}
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <c.icon className="h-3.5 w-3.5" style={{ color: c.cor }} /> {c.label}
            </div>
            <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: c.cor }}>{c.valor}</p>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Nenhuma solicitação na fila para os filtros atuais.</Card>
      ) : (
        <div className="space-y-5">
          {urgentes.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-2">
                Urgentes <span className="text-muted-foreground">· {urgentes.length}</span>
              </p>
              <div className="space-y-2">{urgentes.map(Row)}</div>
            </div>
          )}
          {demais.length > 0 && (
            <div>
              {urgentes.length > 0 && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Demais <span>· {demais.length}</span>
                </p>
              )}
              <div className="space-y-2">{demais.map(Row)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ListaSolicitacoes({ items, onOpen, profileId, emptyMsg, comTracker = false }) {
  if (!items || items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <List className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">{emptyMsg || 'Nenhuma solicitação.'}</p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {items.map(item => {
        const cat = getCatMeta(item.categoria);
        const urg = getUrgMeta(item.urgencia);
        const st = getStatusMeta(item.status);
        const sla = getSlaBadge(item);
        const date = new Date(item.created_at).toLocaleDateString('pt-BR');
        const precisaAvaliar = item.status === 'concluido' && item.solicitante_id === profileId && item.nps_nota == null;
        const aguardandoOrigem = item.status === 'aguardando_aprovacao_origem' && ['pendente', 'triagem'].includes(item.aprovacao_origem_status);
        const emTriagem = item.aprovacao_origem_status === 'triagem';
        const diretorNome = item.aprovacao_origem_diretor?.name;
        const aprovadoresLista = Array.isArray(item.aprovacao_origem_aprovadores) ? item.aprovacao_origem_aprovadores.filter(Boolean) : [];
        const aprovadoresLabel = aprovadoresLista.length ? aprovadoresLista.join(' ou ') : (diretorNome || 'diretor de origem');
        const foiRejeitada = item.status === 'rejeitado' && item.aprovacao_origem_status === 'rejeitada';
        return (
          <Card
            key={item.id}
            className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${
              precisaAvaliar ? 'border-l-4 border-l-amber-500 bg-amber-500/5' :
              aguardandoOrigem ? 'border-l-4 border-l-violet-500 bg-violet-500/5' : ''
            }`}
            onClick={() => onOpen(item)}
          >
            {/* Hierarquia: título primeiro (maior) · badges agrupadas numa linha só,
                com flex-wrap (não estoura no mobile). No modo com tracker o status
                textual sai da linha de badges — o stepper + "está com quem" já contam
                a história (menos ruído). Urgência "Normal" não vira badge (é o padrão). */}
            <div className="flex items-start justify-between gap-3">
              <p className="text-[15px] font-semibold leading-snug text-foreground min-w-0 flex-1 line-clamp-2">{item.titulo}</p>
              <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{date}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge className={`text-xs ${cat.color}`}>{cat.label}</Badge>
              {item.eh_planejado === true && (
                <Badge className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">Planejado</Badge>
              )}
              {precisaAvaliar && (
                <Badge className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1">
                  <Star className="h-3 w-3" /> Avalie
                </Badge>
              )}
              {item.ml_last_status && ML_STATUS_META[item.ml_last_status] && (
                <Badge className={`text-xs ${ML_STATUS_META[item.ml_last_status].color}`}>
                  {ML_STATUS_META[item.ml_last_status].emoji} {ML_STATUS_META[item.ml_last_status].label}
                </Badge>
              )}
              {item.area_responsavel && !areaBadgeRedundante(cat.label, AREA_LABELS[item.area_responsavel] || item.area_responsavel) && (
                <Badge className="text-xs bg-muted text-muted-foreground hidden sm:inline-flex">{AREA_LABELS[item.area_responsavel] || item.area_responsavel}</Badge>
              )}
              {sla && <Badge className={`text-xs ${sla.color}`}>{sla.label}</Badge>}
              {item.urgencia && item.urgencia !== 'normal' && <Badge className={`text-xs ${urg.color}`}>{urg.label}</Badge>}
              {!comTracker && <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>}
            </div>
            {!comTracker && aguardandoOrigem && (
              <p className="flex items-center gap-1.5 text-xs text-violet-700 dark:text-violet-400 mt-2">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {emTriagem
                  ? <span>Em triagem · definindo o aprovador{item.eh_urgente ? ' · urgente' : ''}</span>
                  : <span>Aguardando aprovação de <span className="font-medium">{aprovadoresLabel}</span>{item.eh_urgente ? ' · urgente' : ''}</span>}
              </p>
            )}
            {!comTracker && foiRejeitada && item.aprovacao_origem_motivo && (
              <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                <span className="font-medium">Rejeitada:</span> {item.aprovacao_origem_motivo}
              </p>
            )}
            {item.descricao && (comTracker || (!aguardandoOrigem && !foiRejeitada)) && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{item.descricao}</p>
            )}
            {comTracker && <TrackerSolicitacao item={item} compacto />}
          </Card>
        );
      })}
    </div>
  );
}

// Aba "Minhas Solicitações" · modo Lista agrupado em 3 blocos (2026-07-02):
// "Precisa de você" (ajuste pendente + concluídas sem avaliação NPS · destaque no
// topo) · "Em andamento" (resto não-terminal) · "Encerradas" (colapsável · começa
// recolhida se houver mais de 5). Cada card ganha o rastreio compacto (comTracker).
const STATUS_ENCERRADOS_MINHAS = ['concluido', 'avaliado', 'rejeitado', 'cancelado'];
function MinhasLista({ items, onOpen, profileId, temFiltros = false }) {
  // null = usuário ainda não mexeu · abre por padrão só quando são poucas (<= 5).
  const [encerradasToggle, setEncerradasToggle] = useState(null);
  const precisaDeVoce = (items || []).filter(i =>
    i.status === 'aguardando_ajuste' ||
    (i.status === 'concluido' && i.solicitante_id === profileId && i.nps_nota == null));
  const idsPrecisa = new Set(precisaDeVoce.map(i => i.id));
  const emAndamento = (items || []).filter(i => !idsPrecisa.has(i.id) && !STATUS_ENCERRADOS_MINHAS.includes(i.status));
  const encerradas = (items || []).filter(i => !idsPrecisa.has(i.id) && STATUS_ENCERRADOS_MINHAS.includes(i.status));
  const encerradasAbertas = encerradasToggle ?? encerradas.length <= 5;

  if (!items || items.length === 0) {
    return (
      <Card className="p-10 text-center">
        <ClipboardList className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
        {temFiltros ? (
          <>
            <p className="text-sm font-medium text-foreground">Nenhuma solicitação encontrada</p>
            <p className="text-sm text-muted-foreground mt-1">Tente ajustar a busca, os filtros ou o período acima.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">Você ainda não fez nenhuma solicitação</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em Nova Solicitação, no topo da página, para começar.</p>
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {precisaDeVoce.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Precisa de você</span>
            <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5">{precisaDeVoce.length}</Badge>
          </div>
          <ListaSolicitacoes items={precisaDeVoce} onOpen={onOpen} profileId={profileId} comTracker />
        </section>
      )}
      {emAndamento.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Em andamento</span>
            <Badge variant="secondary" className="text-[10px] px-1.5">{emAndamento.length}</Badge>
          </div>
          <ListaSolicitacoes items={emAndamento} onOpen={onOpen} profileId={profileId} comTracker />
        </section>
      )}
      {encerradas.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setEncerradasToggle(!encerradasAbertas)}
            className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${encerradasAbertas ? '' : '-rotate-90'}`} />
            Encerradas
            <Badge variant="secondary" className="text-[10px] px-1.5">{encerradas.length}</Badge>
            <span className="normal-case font-normal text-[11px]">{encerradasAbertas ? 'ocultar' : 'mostrar'}</span>
          </button>
          {encerradasAbertas && (
            <ListaSolicitacoes items={encerradas} onOpen={onOpen} profileId={profileId} comTracker />
          )}
        </section>
      )}
    </div>
  );
}

function getSlaBadge(item) {
  // aguardando_ajuste = SLA pausado (com o solicitante) · não mostra contagem.
  // sobrestada (em espera) e aguardando_merito (com o Pastor Presidente) idem.
  const concluido = ['concluido', 'avaliado', 'rejeitado', 'cancelado', 'aprovado', 'aguardando_ajuste', 'sobrestada', 'aguardando_merito'].includes(item.status);
  if (concluido) return null;
  const ativo = !item.respondido_em ? item.sla_resposta_deadline : item.sla_resolucao_deadline;
  if (!ativo) return null;
  const horas = (new Date(ativo).getTime() - Date.now()) / 3600000;
  if (horas < 0) {
    return { label: `${Math.abs(Math.round(horas))}h atrasado`, color: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30' };
  }
  if (horas < 4) {
    return { label: `${Math.round(horas)}h`, color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' };
  }
  if (horas < 24) {
    return { label: `${Math.round(horas)}h`, color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' };
  }
  return null;
}

// Estado de um carimbo da dupla aprovação (diretoria da área / diretoria de Gestão).
function CarimboLinha({ rotulo, status, nomes }) {
  const lista = Array.isArray(nomes) ? nomes.filter(Boolean) : [];
  const quem = lista.length ? ` (${lista.join(' ou ')})` : '';
  const aprovada = status === 'aprovada';
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {aprovada
        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        : <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
      <span className="text-muted-foreground min-w-0 truncate">{rotulo}{quem}:</span>
      <span className={`font-medium shrink-0 ${aprovada ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
        {aprovada ? 'aprovada' : 'pendente'}
      </span>
    </div>
  );
}

// Histórico das decisões de quem aprova (aba Aprovar → Histórico). Mostra o que
// o ator já aprovou/rejeitou (origem/2º carimbo/mérito). Admin pode ver de todos.
function HistoricoAprovacoes({ isAdmin }) {
  const [rows, setRows] = useState(null);
  const [erro, setErro] = useState(null);
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    let vivo = true;
    setRows(null); setErro(null);
    api.minhasAprovacoes({ dias: 180, ...(isAdmin && todos ? { todos: 1 } : {}) })
      .then(d => { if (vivo) setRows(Array.isArray(d) ? d : []); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar o histórico.'); });
    return () => { vivo = false; };
  }, [isAdmin, todos]);

  const etapaLabel = { origem: 'Origem (área)', gestao: '2º carimbo', merito: 'Mérito' };
  const catLabel = (c) => (CATEGORIAS.find(x => x.value === c)?.label) || c || '—';
  const fmt = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  if (erro) return <Card className="p-8 text-center text-muted-foreground">{erro}</Card>;
  if (rows === null) return <div className="flex items-center justify-center min-h-[30vh]"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" /></div>;

  return (
    <div className="space-y-3">
      {isAdmin && (
        <label className="flex items-center justify-end gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)} className="accent-primary" />
          Ver decisões de todos os aprovadores
        </label>
      )}
      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma decisão registrada nos últimos 180 dias.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {rows.map(r => (
            <div key={r.evento_id} className="flex items-start gap-3 p-3">
              <div className="mt-0.5 shrink-0">
                {r.decisao === 'rejeitada'
                  ? <XCircle className="h-5 w-5 text-red-500" />
                  : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{r.titulo || 'Solicitação'}</span>
                  <Badge className="text-[10px] bg-muted text-muted-foreground">{catLabel(r.categoria)}</Badge>
                  <Badge className={`text-[10px] ${r.decisao === 'rejeitada' ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                    {r.decisao === 'rejeitada' ? 'Rejeitada' : 'Aprovada'} · {etapaLabel[r.etapa] || r.etapa}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.solicitante ? `Pedido de ${r.solicitante}` : ''}
                  {isAdmin && todos && r.ator ? ` · por ${r.ator}` : ''}
                  {r.status_atual ? ` · agora: ${STATUS_LABELS[r.status_atual]?.label || r.status_atual}` : ''}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums shrink-0">{fmt(r.em)}</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function AprovacaoOrigemCard({ item, onApprove, onReject, onClick }) {
  const [confirmReject, setConfirmReject] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const cat = getCatMeta(item.categoria);
  const urg = getUrgMeta(item.urgencia);
  const solicitanteNome = item.solicitante?.name || item.solicitante_nome || 'Solicitante';
  const date = new Date(item.created_at).toLocaleDateString('pt-BR');
  const horas = Math.round((Date.now() - new Date(item.created_at).getTime()) / 3600000);
  const aguardandoHa = horas < 24 ? `${horas}h` : `${Math.floor(horas / 24)}d ${horas % 24}h`;

  async function confirmarRejeicao() {
    if (motivo.trim().length < 5) {
      toast.error('Motivo precisa ter pelo menos 5 caracteres');
      return;
    }
    setSubmitting(true);
    try {
      await onReject(item.id, motivo.trim());
      setConfirmReject(false);
      setMotivo('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card
      className="p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-violet-500"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={`text-xs ${cat.color}`}>{cat.label}</Badge>
          {item.urgencia && item.urgencia !== 'normal' && (
            <Badge className={`text-xs ${urg.color}`}>{urg.label}</Badge>
          )}
          {item.eh_urgente && (
            <Badge className="text-xs bg-red-500/15 text-red-700 dark:text-red-400">Urgente</Badge>
          )}
          {item.aprovacao_origem_status === 'triagem' && (
            <Badge className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400">Triagem · sem setor</Badge>
          )}
          <span className="text-xs text-muted-foreground">aguardando {aguardandoHa}</span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{date}</span>
      </div>
      <p className="text-[15px] font-semibold leading-snug text-foreground mb-1">{item.titulo}</p>
      <p className="text-xs text-muted-foreground mb-2">
        por {solicitanteNome}
        {item.area_responsavel && <> · vai pra <span className="font-medium">{AREA_LABELS[item.area_responsavel] || item.area_responsavel}</span></>}
        {item.data_necessaria && <> · precisa até {new Date(item.data_necessaria).toLocaleDateString('pt-BR')}</>}
      </p>
      {item.valor_estimado != null && (
        <p className="mb-2">
          <span className="text-base font-bold text-foreground">
            R$ {Number(item.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-muted-foreground ml-1.5">valor estimado</span>
        </p>
      )}
      {item.descricao && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{item.descricao}</p>
      )}
      {item.justificativa && (
        <p className="text-xs text-muted-foreground mb-2"><span className="font-medium">Justificativa:</span> {item.justificativa}</p>
      )}
      {item.eh_urgente && item.justificativa_urgencia && (
        <p className="text-xs text-red-700 dark:text-red-400 mb-2"><span className="font-medium">Urgência:</span> {item.justificativa_urgencia}</p>
      )}

      {/* Etiquetas Marketing (Spec 010) · so quando categoria=marketing */}
      {item.categoria === 'marketing' && (item.marketing_tipo || item.marketing_destino) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {item.marketing_tipo && (
            <Badge
              className="text-[10px] px-1.5 py-0.5"
              style={item.marketing_tipo.cor ? { backgroundColor: `${item.marketing_tipo.cor}25`, color: item.marketing_tipo.cor } : undefined}
            >
              {item.marketing_tipo.nome}
            </Badge>
          )}
          {item.marketing_destino && (
            <Badge
              className="text-[10px] px-1.5 py-0.5"
              style={item.marketing_destino.cor ? { backgroundColor: `${item.marketing_destino.cor}25`, color: item.marketing_destino.cor } : undefined}
            >
              {item.marketing_destino.nome}
            </Badge>
          )}
          {item.marketing_tipo?.habilidade_padrao && (
            <span className="text-[10px] text-muted-foreground self-center">
              · sugere {item.marketing_tipo.habilidade_padrao}
            </span>
          )}
        </div>
      )}

      {/* Dupla aprovação (pedido não-planejado) · estado dos dois carimbos.
          Os botões seguem os mesmos · o backend deduz qual papel o ator carimba. */}
      {item.aprovacao_gestao_status != null && (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/30 px-3 py-2.5 mb-2">
          <CarimboLinha
            rotulo="Diretoria da área"
            status={item.aprovacao_origem_status}
            nomes={item.aprovacao_origem_aprovadores}
          />
          <CarimboLinha
            rotulo="Diretoria de Gestão"
            status={item.aprovacao_gestao_status}
            nomes={item.aprovacao_gestao_aprovadores}
          />
        </div>
      )}

      {!confirmReject ? (
        <div className="flex gap-2 mt-3 pt-3 border-t border-border" onClick={e => e.stopPropagation()}>
          <Button
            size="sm"
            onClick={() => onApprove(item.id)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmReject(true)}
            className="flex-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <XCircle className="h-4 w-4 mr-1" /> Rejeitar
          </Button>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-border space-y-2" onClick={e => e.stopPropagation()}>
          <Label className="text-xs">Motivo da rejeição *</Label>
          <Textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={2}
            placeholder="Solicitação rejeitada não reabre · solicitante terá que criar nova."
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setConfirmReject(false); setMotivo(''); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={confirmarRejeicao}
              disabled={motivo.trim().length < 5 || submitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {submitting ? 'Rejeitando...' : 'Confirmar rejeição'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// Card de JULGAMENTO DE MÉRITO · o que o Pastor Presidente vê na aba Aprovar:
// pedido não-planejado com custo, já aprovado pelas duas diretorias, aguardando
// o juízo de mérito (vale gastar?). Valor estimado em destaque + justificativa.
function AprovacaoMeritoCard({ item, onApprove, onReject, onClick }) {
  const [confirmReprova, setConfirmReprova] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const cat = getCatMeta(item.categoria);
  const solicitanteNome = item.solicitante?.name || item.solicitante_nome || 'Solicitante';
  const date = new Date(item.created_at).toLocaleDateString('pt-BR');

  async function confirmarReprovacao() {
    if (motivo.trim().length < 5) {
      toast.error('Motivo precisa ter pelo menos 5 caracteres');
      return;
    }
    setSubmitting(true);
    try {
      await onReject(item.id, motivo.trim());
      setConfirmReprova(false);
      setMotivo('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card
      className="p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-violet-500"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="text-xs bg-violet-500/15 text-violet-700 dark:text-violet-400">Julgamento de mérito</Badge>
          <Badge className={`text-xs ${cat.color}`}>{cat.label}</Badge>
          {item.eh_urgente && (
            <Badge className="text-xs bg-red-500/15 text-red-700 dark:text-red-400">Urgente</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{date}</span>
      </div>
      <p className="text-[15px] font-semibold leading-snug text-foreground mb-1">{item.titulo}</p>
      <p className="text-xs text-muted-foreground mb-2">
        por {solicitanteNome}
        {item.area_responsavel && <> · vai pra <span className="font-medium">{AREA_LABELS[item.area_responsavel] || item.area_responsavel}</span></>}
        {item.data_necessaria && <> · precisa até {new Date(item.data_necessaria).toLocaleDateString('pt-BR')}</>}
      </p>
      {item.valor_estimado != null && (
        <p className="mb-2">
          <span className="text-lg font-bold text-foreground">
            R$ {Number(item.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-muted-foreground ml-1.5">valor estimado</span>
        </p>
      )}
      {item.descricao && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{item.descricao}</p>
      )}
      {item.justificativa && (
        <p className="text-xs text-muted-foreground mb-2"><span className="font-medium">Justificativa:</span> {item.justificativa}</p>
      )}

      {!confirmReprova ? (
        <div className="flex gap-2 mt-3 pt-3 border-t border-border" onClick={e => e.stopPropagation()}>
          <Button
            size="sm"
            onClick={() => onApprove(item.id)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar mérito
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmReprova(true)}
            className="flex-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <XCircle className="h-4 w-4 mr-1" /> Reprovar
          </Button>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-border space-y-2" onClick={e => e.stopPropagation()}>
          <Label className="text-xs">Motivo da reprovação *</Label>
          <Textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={2}
            placeholder="Solicitação reprovada não reabre · o solicitante terá que criar nova."
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setConfirmReprova(false); setMotivo(''); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={confirmarReprovacao}
              disabled={motivo.trim().length < 5 || submitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {submitting ? 'Reprovando...' : 'Confirmar reprovação'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Painel "Por solicitante" (aba Atender · 2026-07-07) ──────────────────────
// Agrupa as demandas por SOLICITANTE (uma pessoa pode pedir várias vezes) num
// card por pessoa, mantendo o destaque dos urgentes. Toggle Kanban/Lista/Por
// solicitante no cabeçalho. Estilo do sistema (glass, primária #00B39D) —
// inspirado no rascunho "Painel por Responsável".

function tempoAtras(iso) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
function ehUrgente(item) {
  return item.eh_urgente === true || item.urgencia === 'critica' || item.urgencia === 'alta';
}
// Encerrada = status terminal · não conta mais como aberta/ativa (some da visão
// por solicitante e não aparece nos urgentes). 'aprovado' segue ativo (falta concluir).
const STATUS_ENCERRADOS = ['concluido', 'cancelado', 'rejeitado', 'avaliado'];
function ehEncerrada(item) {
  return STATUS_ENCERRADOS.includes(item.status);
}
function dotUrg(item) {
  if (item.urgencia === 'critica' || item.eh_urgente) return 'bg-rose-500';
  if (item.urgencia === 'alta') return 'bg-amber-500';
  if (item.urgencia === 'baixa') return 'bg-slate-400';
  return 'bg-blue-500';
}
function iniciais(nome) {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return (((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()) || '?';
}

function StatMini({ label, valor, tom }) {
  const cor = tom === 'rose' ? 'text-rose-600 dark:text-rose-400'
    : tom === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground';
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
      <p className={`text-2xl font-extrabold ${cor}`}>{valor}</p>
    </Card>
  );
}

function SolicitanteCard({ grupo, maxCarga, onOpen }) {
  const [aberto, setAberto] = useState(false);
  const carga = Math.round((grupo.demandas.length / maxCarga) * 100);
  const barCor = carga >= 85 ? 'bg-rose-500' : carga >= 60 ? 'bg-amber-500' : 'bg-primary';
  const mostra = aberto ? grupo.demandas : grupo.demandas.slice(0, 3);
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-11 w-11 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold shrink-0">
          {iniciais(grupo.nome)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{grupo.nome}</p>
          {grupo.email && <p className="text-[12px] text-muted-foreground truncate">{grupo.email}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between text-[12px] text-muted-foreground mb-1.5">
        <span>Solicitações</span>
        <span className="font-semibold text-foreground">{grupo.demandas.length}</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-4">
        <div className={`h-full rounded-full transition-all ${barCor}`} style={{ width: `${carga}%` }} />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {grupo.urgentes > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />{grupo.urgentes} urgente{grupo.urgentes !== 1 ? 's' : ''}
          </span>
        )}
        {grupo.normais > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">{grupo.normais} normal{grupo.normais !== 1 ? 'is' : ''}</span>}
        {grupo.baixas > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{grupo.baixas} baixa{grupo.baixas !== 1 ? 's' : ''}</span>}
      </div>

      <div className="space-y-1">
        {mostra.map(it => {
          const st = getStatusMeta(it.status);
          return (
            <button key={it.id} onClick={() => onOpen(it)}
              className="w-full text-left flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/60 transition-colors">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotUrg(it)}`} />
              <p className="text-[13px] truncate flex-1">{it.titulo}</p>
              <Badge className={`text-[9px] px-1.5 py-0 ${st.color}`}>{st.label}</Badge>
              <span className="text-[11px] text-muted-foreground shrink-0 w-8 text-right">{tempoAtras(it.created_at)}</span>
            </button>
          );
        })}
      </div>
      {grupo.demandas.length > 3 && (
        <button onClick={() => setAberto(a => !a)} className="w-full mt-2 text-[12px] font-semibold text-primary hover:opacity-80 py-1.5">
          {aberto ? 'Ver menos' : `Ver todas (${grupo.demandas.length}) →`}
        </button>
      )}
    </Card>
  );
}

function PainelPorSolicitante({ items, onOpen }) {
  // Só solicitações ABERTAS (não encerradas) · com o tempo o histórico acumula
  // e polui a visão por solicitante (pedido do Matheus 2026-07-22).
  const ativos = useMemo(() => (items || []).filter(i => !ehEncerrada(i)), [items]);
  const grupos = useMemo(() => {
    const map = new Map();
    for (const it of ativos) {
      const key = it.solicitante_id || it.solicitante?.id || `nome:${(it.solicitante_nome || it.solicitante?.name || 'desconhecido').toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, { key, nome: it.solicitante?.name || it.solicitante_nome || 'Desconhecido', email: it.solicitante?.email || '', demandas: [] });
      }
      map.get(key).demandas.push(it);
    }
    const arr = [...map.values()];
    arr.forEach(g => {
      g.urgentes = g.demandas.filter(ehUrgente).length;
      g.normais = g.demandas.filter(d => !ehUrgente(d) && d.urgencia !== 'baixa').length;
      g.baixas = g.demandas.filter(d => d.urgencia === 'baixa').length;
      g.demandas.sort((a, b) => (Number(ehUrgente(b)) - Number(ehUrgente(a))) || (new Date(b.created_at) - new Date(a.created_at)));
    });
    arr.sort((a, b) => (b.urgentes - a.urgentes) || (b.demandas.length - a.demandas.length) || a.nome.localeCompare(b.nome));
    return arr;
  }, [ativos]);

  const maxCarga = Math.max(1, ...grupos.map(g => g.demandas.length));
  const urgentesGlobais = useMemo(
    () => ativos.filter(ehUrgente).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [ativos]
  );
  const totalSla = ativos.filter(i => { const s = getSlaBadge(i); return !!s && s.color.includes('rose'); }).length;

  if (ativos.length === 0) {
    return <Card className="p-8 text-center text-muted-foreground">Nenhuma solicitação aberta para os filtros atuais. 🎉</Card>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatMini label="Solicitações ativas" valor={ativos.length} />
        <StatMini label="Solicitantes" valor={grupos.length} />
        <StatMini label="Urgentes" valor={urgentesGlobais.length} tom="rose" />
        <StatMini label="SLA atrasado" valor={totalSla} tom="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {grupos.map(g => <SolicitanteCard key={g.key} grupo={g} maxCarga={maxCarga} onOpen={onOpen} />)}
        </div>

        <div>
          <Card className="p-5 xl:sticky xl:top-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" /> Urgentes agora
              </h3>
              <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400">{urgentesGlobais.length}</Badge>
            </div>
            {urgentesGlobais.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma urgente. 🎉</p>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {urgentesGlobais.map(it => (
                  <button key={it.id} onClick={() => onOpen(it)}
                    className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-colors">
                    <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${dotUrg(it)}`} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-snug line-clamp-2">{it.titulo}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {it.solicitante?.name || it.solicitante_nome || 'Desconhecido'} · há {tempoAtras(it.created_at)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function SolicitacaoCard({ item, isAdmin, onStatusChange, onClick, draggable }) {
  const cat = getCatMeta(item.categoria);
  const urg = getUrgMeta(item.urgencia);
  const solicitante = item.solicitante?.name || 'Desconhecido';
  const date = new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const sla = getSlaBadge(item);
  const st = getStatusMeta(item.status);
  const aguardandoFin = item.status === 'aguardando_aprovacao_financeira';
  // Status real visível quando a coluna agrupa vários (ex: "Em Andamento" tem
  // aprovado/em_atendimento/aguardando_entrega). Os headliners obvios não repetem.
  const mostrarStatus = !['pendente', 'em_analise', 'concluido', 'rejeitado', 'aguardando_aprovacao_financeira'].includes(item.status);

  return (
    <Card
      className={`p-3 cursor-pointer hover:shadow-md transition-shadow border-l-4 ${draggable ? 'active:opacity-60 active:scale-[0.97]' : ''}`}
      style={{ borderLeftColor: item.urgencia === 'critica' ? 'var(--destructive)' : item.urgencia === 'alta' ? '#f59e0b' : 'transparent' }}
      onClick={onClick}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge className={`text-[10px] px-1.5 py-0.5 ${cat.color}`}>{cat.label}</Badge>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{date}</span>
      </div>
      <p className="text-sm font-medium text-foreground line-clamp-2 mb-1.5">{item.titulo}</p>
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <span className="text-[11px] text-muted-foreground truncate max-w-[160px] inline-flex items-center gap-1">
          {solicitante}
          {item.compartilhar_area === false && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground" title="Privada · só você e quem atende">
              <Lock className="h-2.5 w-2.5" /> privada
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {mostrarStatus && <Badge className={`text-[10px] px-1.5 py-0.5 ${st.color}`}>{st.label}</Badge>}
          {sla && (
            <Badge className={`text-[10px] px-1.5 py-0.5 gap-0.5 ${sla.color}`}>
              <Clock className="h-2.5 w-2.5" /> {sla.label}
            </Badge>
          )}
          {item.urgencia && item.urgencia !== 'normal' && (
            <Badge className={`text-[10px] px-1.5 py-0.5 ${urg.color}`}>{urg.label}</Badge>
          )}
        </div>
      </div>
      {aguardandoFin && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
          <Clock className="h-3 w-3 shrink-0" /> Aguardando aprovação do financeiro
        </div>
      )}
      {item.status === 'aguardando_aprovacao_origem' && (() => {
        const pend = (Array.isArray(item.aprovacao_pendente_de) && item.aprovacao_pendente_de.length
          ? item.aprovacao_pendente_de
          : (Array.isArray(item.aprovacao_origem_aprovadores) ? item.aprovacao_origem_aprovadores : [])).filter(Boolean);
        return (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-violet-700 dark:text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded px-2 py-1">
            <Clock className="h-3 w-3 shrink-0" />
            <span>Aguardando aprovação{pend.length ? ` de ${pend.join(' ou ')}` : ''}</span>
          </div>
        );
      })()}
      {isAdmin && item.status === 'pendente' && (
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-border">
          <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={e => { e.stopPropagation(); onStatusChange(item.id, 'em_analise'); }}>
            Analisar <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}
      {isAdmin && item.status === 'em_analise' && (
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-border">
          <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1 text-green-600" onClick={e => { e.stopPropagation(); onStatusChange(item.id, 'aprovado'); }}>Aprovar</Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1 text-red-600" onClick={e => { e.stopPropagation(); onStatusChange(item.id, 'rejeitado'); }}>Rejeitar</Button>
        </div>
      )}
      {isAdmin && item.status === 'aprovado' && (
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-border">
          <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={e => { e.stopPropagation(); onStatusChange(item.id, 'concluido'); }}>
            Concluir <CheckCircle2 className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}
    </Card>
  );
}

// Status do tracking ML · ordem visual da timeline
const ML_STATUS_FLOW = [
  { key: 'pending',         label: 'Pedido recebido',  emoji: '📋' },
  { key: 'handling',        label: 'Preparando envio', emoji: '📦' },
  { key: 'ready_to_ship',   label: 'Pronto p/ envio',  emoji: '📮' },
  { key: 'shipped',         label: 'Saiu para entrega',emoji: '🚚' },
  { key: 'delivered',       label: 'Entregue',         emoji: '✅' },
];
const ML_STATUS_META = {
  pending:          { label: 'Pedido recebido',     emoji: '📋', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  handling:         { label: 'Preparando envio',    emoji: '📦', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  ready_to_ship:    { label: 'Pronto p/ envio',     emoji: '📮', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  shipped:          { label: 'Saiu p/ entrega',     emoji: '🚚', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  in_transit:       { label: 'A caminho',           emoji: '🚚', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  out_for_delivery: { label: 'Saiu para entrega',   emoji: '🛵', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  delivered:        { label: 'Entregue',            emoji: '✅', color: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  not_delivered:    { label: 'Tentativa frustrada', emoji: '⚠️', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  cancelled:        { label: 'Cancelado',           emoji: '❌', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
};

function statusIndex(status) {
  const i = ML_STATUS_FLOW.findIndex(s => s.key === status);
  if (i >= 0) return i;
  // status que não estão no flow (in_transit, out_for_delivery) caem entre shipped e delivered
  if (status === 'in_transit' || status === 'out_for_delivery') return 3.5;
  return -1;
}

function MLTrackingBlock({ item, canEdit, onChanged }) {
  const [mlInput, setMlInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [eventos, setEventos] = useState([]);
  const [showInput, setShowInput] = useState(false);

  const hasLink = !!item.ml_order_id;
  const status = item.ml_last_status;
  const meta = ML_STATUS_META[status] || null;
  const idx = statusIndex(status);

  useEffect(() => {
    if (!hasLink) { setEventos([]); return; }
    api.mlTimeline(item.id)
      .then(r => setEventos(r.eventos || []))
      .catch(() => setEventos([]));
  }, [item.id, hasLink, item.ml_last_status_changed_at]);

  async function vincular() {
    if (!mlInput.trim()) return;
    setLinking(true);
    try {
      await api.vincularML(item.id, mlInput.trim());
      toast.success('Pedido vinculado! Você e o solicitante recebem as atualizações automaticamente.');
      setShowInput(false);
      setMlInput('');
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao vincular pedido');
    } finally {
      setLinking(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await api.atualizarML(item.id);
      toast.success('Status atualizado do Mercado Livre');
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao atualizar');
    } finally {
      setRefreshing(false);
    }
  }

  async function unlink() {
    if (!confirm('Tem certeza que quer desvincular o pedido do Mercado Livre? O tracking será removido.')) return;
    setUnlinking(true);
    try {
      await api.desvincularML(item.id);
      toast.success('Pedido desvinculado');
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao desvincular');
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span>🛒</span> Pedido no Mercado Livre
        </p>
        {hasLink && canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Atualizando...' : 'Atualizar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={unlink} disabled={unlinking}
              className="text-red-500 hover:text-red-700">
              Desvincular
            </Button>
          </div>
        )}
      </div>

      {!hasLink && (
        <div>
          {!showInput ? (
            canEdit ? (
              <Button size="sm" variant="outline" onClick={() => setShowInput(true)}>
                Vincular pedido do ML
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Aguardando o comprador vincular o pedido.
              </p>
            )
          ) : (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Cole a URL ou o número do pedido do Mercado Livre
              </Label>
              <div className="flex gap-2">
                <Input
                  value={mlInput}
                  onChange={e => setMlInput(e.target.value)}
                  placeholder="ex: 2000012345678 ou link completo"
                  className="text-sm"
                  autoFocus
                />
                <Button size="sm" onClick={vincular} disabled={linking || !mlInput.trim()}>
                  {linking ? 'Vinculando...' : 'Vincular'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowInput(false); setMlInput(''); }}>
                  Cancelar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O solicitante e você passarão a receber atualizações automáticas (in-app + WhatsApp se configurado).
              </p>
            </div>
          )}
        </div>
      )}

      {hasLink && (
        <div className="space-y-3">
          {/* Cabecalho do pedido */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {item.ml_item_title && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Item</span>
                <p className="font-medium line-clamp-2">{item.ml_item_title}</p>
              </div>
            )}
            {item.ml_total_amount != null && (
              <div>
                <span className="text-muted-foreground text-xs">Valor</span>
                <p className="font-medium">R$ {Number(item.ml_total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            {item.ml_tracking_number && (
              <div>
                <span className="text-muted-foreground text-xs">Rastreio</span>
                <p className="font-medium font-mono text-xs">{item.ml_tracking_number}</p>
              </div>
            )}
            {meta && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Status atual</span>
                <p><Badge className={meta.color}>{meta.emoji} {meta.label}</Badge></p>
              </div>
            )}
          </div>

          {/* Timeline visual · etapas */}
          <div className="flex items-center justify-between gap-1 pt-2">
            {ML_STATUS_FLOW.map((step, i) => {
              const reached = idx >= i;
              const current = idx >= i && idx < i + 1;
              return (
                <div key={step.key} className="flex-1 flex flex-col items-center text-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors
                      ${reached ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                      ${current ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
                  >
                    {reached ? step.emoji : i + 1}
                  </div>
                  <span className={`text-[10px] mt-1 leading-tight ${reached ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                  {i < ML_STATUS_FLOW.length - 1 && (
                    <div className={`h-0.5 w-full mt-[-22px] ${idx > i ? 'bg-primary' : 'bg-border'}`}
                      style={{ position: 'relative', top: -16, zIndex: -1 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Histórico de eventos */}
          {eventos.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Histórico</p>
              <ul className="space-y-1.5">
                {eventos.slice().reverse().map(ev => {
                  const m = ML_STATUS_META[ev.status] || { label: ev.status, emoji: '•' };
                  return (
                    <li key={ev.id} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5">{m.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{m.label}</span>
                          <span className="text-muted-foreground text-[10px]">
                            {new Date(ev.ocorrido_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {ev.descricao && ev.descricao !== m.label && (
                          <p className="text-muted-foreground line-clamp-1">{ev.descricao}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Link pro pedido no ML */}
          <a
            href={`https://www.mercadolivre.com.br/pedidos/${item.ml_order_id}/detalhe`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Ver pedido completo no Mercado Livre →
          </a>
        </div>
      )}
    </div>
  );
}

// Cotação (compras/serviço) · o Amaury (logística) registra VÁRIAS cotações de
// fornecedores e, com um botão dedicado reenviável, dispara um e-mail rico ao
// financeiro (Yago) com todas as cotações + a sugerida + total, pra aprovar o
// pagamento. Marcos (2026-06-16): "primeiro vem a cotação, depois a aprovação
// do financeiro". Compatível com a cotação inline antiga (valor_cotado) quando
// ainda não há linhas na tabela nova.
function CotacaoBlock({ item, canCotar, onChanged }) {
  // Amaury pode gerenciar/reenviar cotações enquanto o financeiro (Yago) ainda
  // não aprovou e a solicitação não é terminal — não só durante em_cotacao.
  const podeEditar = canCotar
    && !item.aprovado_financeiro_em
    && !['concluido', 'cancelado', 'rejeitado', 'avaliado'].includes(item.status);
  const fmtBRL = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [cotacoes, setCotacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ fornecedor: '', valor: '', prazo: '', link: '', observacao: '' });

  async function recarregar() {
    try {
      const rows = await api.listarCotacoes(item.id);
      setCotacoes(Array.isArray(rows) ? rows : []);
    } catch (e) { /* silencioso · mostra inline antiga se houver */ }
    finally { setCarregando(false); }
  }
  useEffect(() => { recarregar(); /* eslint-disable-next-line */ }, [item.id]);

  function resetForm() { setForm({ fornecedor: '', valor: '', prazo: '', link: '', observacao: '' }); setEditId(null); }

  async function salvar() {
    const nome = form.fornecedor.trim();
    const v = Number(form.valor);
    if (!nome) { toast.error('Informe o fornecedor.'); return; }
    if (form.valor === '' || Number.isNaN(v) || v < 0) { toast.error('Informe o valor da cotação.'); return; }
    setSalvando(true);
    try {
      const payload = {
        fornecedor: nome, valor: v,
        prazo: form.prazo.trim() || undefined,
        link: form.link.trim() || undefined,
        observacao: form.observacao.trim() || undefined,
      };
      if (editId) { await api.editarCotacao(editId, payload); toast.success('Cotação atualizada.'); }
      else { await api.adicionarCotacao(item.id, payload); toast.success('Cotação adicionada.'); }
      resetForm();
      await recarregar();
    } catch (e) { toast.error(e.message || 'Erro ao salvar cotação'); }
    finally { setSalvando(false); }
  }

  function iniciarEdicao(c) {
    setEditId(c.id);
    setForm({ fornecedor: c.fornecedor || '', valor: c.valor ?? '', prazo: c.prazo || '', link: c.link || '', observacao: c.observacao || '' });
  }

  async function remover(c) {
    if (!window.confirm(`Remover a cotação de ${c.fornecedor}?`)) return;
    try { await api.removerCotacao(c.id); toast.success('Cotação removida.'); if (editId === c.id) resetForm(); await recarregar(); }
    catch (e) { toast.error(e.message || 'Erro ao remover'); }
  }

  async function marcarSugerida(c) {
    try { await api.sugerirCotacao(item.id, c.id); await recarregar(); }
    catch (e) { toast.error(e.message || 'Erro ao marcar sugerida'); }
  }

  async function enviarFinanceiro() {
    // Fluxo "um botão": sem cotação formal na lista, manda o valor digitado
    // direto (o servidor cria a cotação na hora · fornecedor opcional).
    let payload;
    if (!cotacoes.length) {
      const v = Number(form.valor);
      if (form.valor === '' || Number.isNaN(v) || v < 0) { toast.error('Informe o valor pra enviar ao financeiro.'); return; }
      payload = {
        valor: v,
        fornecedor: form.fornecedor.trim() || undefined,
        observacao: form.observacao.trim() || undefined,
        prazo: form.prazo.trim() || undefined,
        link: form.link.trim() || undefined,
      };
    }
    setEnviando(true);
    try {
      const r = await api.enviarCotacoesFinanceiro(item.id, payload);
      if (r?.email_ok) toast.success('Enviado ao financeiro (e-mail avisado).');
      else toast.warning(r?.motivo ? `Enviado ao financeiro no sistema, mas o e-mail não saiu — ${r.motivo}` : 'Enviado ao financeiro no sistema, mas o e-mail não saiu — verifique.');
      if (payload) resetForm();
      onChanged?.();
      await recarregar();
    } catch (e) { toast.error(e.message || 'Erro ao enviar ao financeiro'); }
    finally { setEnviando(false); }
  }

  // Compat · sem linhas novas mas com cotação inline antiga → mostra read-only.
  const inlineLegado = !cotacoes.length && item.valor_cotado != null;
  const jaEnviado = !!item.cotacoes_email_em;

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <p className="text-sm font-semibold text-foreground">Cotações</p>

      {carregando ? (
        <p className="text-xs text-muted-foreground">Carregando cotações...</p>
      ) : inlineLegado ? (
        <div className="grid grid-cols-2 gap-4 text-sm rounded-md border border-border p-3">
          <div><span className="text-muted-foreground">Valor cotado</span><p className="font-medium">{fmtBRL(item.valor_cotado)}</p></div>
          {item.cotacao_fornecedor && <div><span className="text-muted-foreground">Fornecedor</span><p className="font-medium">{item.cotacao_fornecedor}</p></div>}
          {item.cotacao_observacao && <div className="col-span-2"><span className="text-muted-foreground">Observação</span><p className="text-sm whitespace-pre-wrap">{item.cotacao_observacao}</p></div>}
        </div>
      ) : cotacoes.length ? (
        <div className="space-y-2">
          {cotacoes.map(c => (
            <div key={c.id} className={`rounded-md border p-2.5 text-sm ${c.sugerida ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      title={c.sugerida ? 'Sugerida' : 'Marcar como sugerida'}
                      disabled={!podeEditar}
                      onClick={() => podeEditar && marcarSugerida(c)}
                      className={`inline-flex ${podeEditar ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <Star className={`h-4 w-4 ${c.sugerida ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
                    </button>
                    <span className="font-medium truncate">{c.fornecedor}</span>
                    <span className="font-semibold">· {fmtBRL(c.valor)}</span>
                    {c.prazo && <span className="text-xs text-muted-foreground">· {c.prazo}</span>}
                  </div>
                  {c.link && (
                    <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline break-all">{c.link}</a>
                  )}
                  {c.observacao && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">{c.observacao}</p>}
                </div>
                {podeEditar && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => iniciarEdicao(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remover(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhuma cotação registrada ainda.</p>
      )}

      {podeEditar && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <p className="text-xs font-medium text-foreground">{editId ? 'Editar cotação' : 'Adicionar cotação'}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Fornecedor *</Label>
              <Input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Nome do fornecedor" />
            </div>
            <div>
              <Label className="text-xs">Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
            </div>
            <div>
              <Label className="text-xs">Prazo</Label>
              <Input value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} placeholder="ex.: 5 dias úteis" />
            </div>
            <div>
              <Label className="text-xs">Link</Label>
              <Input value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea rows={2} value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Condições, forma de pagamento, garantia..." />
          </div>
          <div className="flex justify-end gap-2">
            {editId && <Button size="sm" variant="outline" onClick={resetForm} disabled={salvando}>Cancelar</Button>}
            <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : editId ? 'Salvar' : 'Adicionar'}</Button>
          </div>
        </div>
      )}

      {podeEditar && (() => {
        const vNum = Number(form.valor);
        const valorInlineValido = !cotacoes.length && form.valor !== '' && !Number.isNaN(vNum) && vNum >= 0;
        const podeEnviar = cotacoes.length > 0 || valorInlineValido;
        return (
          <div className="space-y-1.5">
            <Button
              onClick={enviarFinanceiro}
              disabled={enviando || !podeEnviar}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Mail className="h-4 w-4 mr-2" />
              {enviando ? 'Enviando...' : jaEnviado ? 'Reenviar ao financeiro' : 'Enviar ao financeiro'}
            </Button>
            {jaEnviado && (
              <p className="text-[11px] text-muted-foreground text-center">
                Enviado em {new Date(item.cotacoes_email_em).toLocaleString('pt-BR')}
              </p>
            )}
            {!podeEnviar && <p className="text-[11px] text-muted-foreground text-center">Informe o valor acima e clique em enviar ao financeiro.</p>}
          </div>
        );
      })()}
    </div>
  );
}

// Sobrestar / Retomar (gestão) · põe o pedido "em espera" com motivo obrigatório
// e data de revisão opcional; retomar devolve pro status em que estava (o backend
// guarda sobrestada_status_anterior). Só pra admin/responsável no DetailDialog.
function SobrestarBlock({ item, onChanged }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [revisao, setRevisao] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const sobrestada = item.status === 'sobrestada';
  const podeSobrestar = ['pendente', 'em_analise', 'em_atendimento'].includes(item.status);

  async function sobrestar() {
    if (motivo.trim().length < 5) {
      toast.error('Informe o motivo da espera (mínimo 5 caracteres).');
      return;
    }
    setSubmitting(true);
    try {
      await api.sobrestar(item.id, { motivo: motivo.trim(), revisao: revisao || undefined });
      toast.success('Solicitação sobrestada (em espera).');
      setAberto(false); setMotivo(''); setRevisao('');
      onChanged?.();
    } catch (e) { toast.error(e.message || 'Erro ao sobrestar'); }
    finally { setSubmitting(false); }
  }

  async function retomar() {
    setSubmitting(true);
    try {
      await api.retomar(item.id);
      toast.success('Solicitação retomada · voltou pra fila.');
      onChanged?.();
    } catch (e) { toast.error(e.message || 'Erro ao retomar'); }
    finally { setSubmitting(false); }
  }

  if (sobrestada) {
    const revisaoFmt = fmtDiaMes(item.sobrestada_revisao);
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
        <div className="text-xs text-amber-700 dark:text-amber-400 min-w-0">
          <span className="font-semibold">Em espera (sobrestada)</span>
          {item.sobrestada_motivo && <> · {item.sobrestada_motivo}</>}
          {revisaoFmt && <> · revisão em {revisaoFmt}</>}
        </div>
        <Button size="sm" variant="outline" onClick={retomar} disabled={submitting} className="shrink-0">
          {submitting ? 'Retomando...' : 'Retomar'}
        </Button>
      </div>
    );
  }

  if (!podeSobrestar) return null;

  if (!aberto) {
    return (
      <div>
        <Button size="sm" variant="outline" onClick={() => setAberto(true)}
          className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30">
          <Clock className="h-4 w-4 mr-1" /> Sobrestar (em espera)
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
      <p className="text-sm font-medium text-foreground">Sobrestar (em espera)</p>
      <p className="text-xs text-muted-foreground">
        O pedido sai da fila até ser retomado. O motivo fica visível pro solicitante.
      </p>
      <div className="space-y-2">
        <Label className="text-xs">Motivo *</Label>
        <Textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder="Por que este pedido vai esperar?" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Data de revisão (opcional)</Label>
        <Input type="date" value={revisao} onChange={e => setRevisao(e.target.value)} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => { setAberto(false); setMotivo(''); setRevisao(''); }}>
          Cancelar
        </Button>
        <Button size="sm" onClick={sobrestar} disabled={motivo.trim().length < 5 || submitting}
          className="bg-amber-600 hover:bg-amber-700 text-white">
          {submitting ? 'Sobrestando...' : 'Confirmar espera'}
        </Button>
      </div>
    </div>
  );
}

function DetailDialog({ item, onClose, isAdmin, currentUserId, onStatusChange, onNpsSubmit, onItemRefresh, asSheet = false }) {
  const [actionPending, setActionPending] = useState(null); // e.g. 'aprovado', 'rejeitado', 'concluído', 'em_analise'
  const [obsText, setObsText] = useState('');
  const [atenderEstoque, setAtenderEstoque] = useState(false); // ponte estoque (Fase 3a-2)

  if (!item) return null;
  // Mesmo corpo, dois invólucros: Dialog (modal) ou Sheet (painel lateral direito).
  const Root = asSheet ? Sheet : Dialog;
  const Content = asSheet ? SheetContent : DialogContent;
  const HeaderW = asSheet ? SheetHeader : DialogHeader;
  const TitleW = asSheet ? SheetTitle : DialogTitle;
  const contentProps = asSheet
    ? { side: 'right', className: 'w-full sm:max-w-xl flex flex-col p-4 sm:p-6' }
    : { className: 'sm:max-w-lg max-h-[90vh] flex flex-col' };
  const cat = getCatMeta(item.categoria);
  const urg = getUrgMeta(item.urgencia);
  const st = getStatusMeta(item.status);

  const ACTION_LABELS = {
    em_analise: 'Analisar',
    aprovado: 'Aprovar',
    rejeitado: 'Rejeitar',
    concluido: 'Concluir',
  };

  function confirmAction() {
    if (!actionPending) return;
    onStatusChange(item.id, actionPending, obsText.trim() || undefined);
    setActionPending(null);
    setObsText('');
    onClose();
  }

  function cancelAction() {
    setActionPending(null);
    setObsText('');
  }

  return (
    <Root open={!!item} onOpenChange={v => { if (!v) { cancelAction(); onClose(); } }}>
      <Content {...contentProps}>
        <HeaderW>
          <TitleW className="flex items-center gap-2">
            <Badge className={cat.color}>{cat.label}</Badge>
            {item.titulo}
          </TitleW>
        </HeaderW>
        <div className="space-y-4 mt-2 flex-1 overflow-y-auto min-h-0">
          {/* Devolvida pra ajuste · atalho pro solicitante editar e reenviar */}
          {item.status === 'aguardando_ajuste' && item.solicitante_id === currentUserId && (
            <div className="flex flex-wrap items-center gap-2 justify-between p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
              <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                <Pencil className="h-4 w-4 shrink-0" />
                <span className="font-medium">Esta solicitação foi devolvida pra você ajustar.</span>
              </div>
              <Button size="sm" onClick={() => {
                document.getElementById('editar-devolvida')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}>
                Editar e reenviar
              </Button>
            </div>
          )}

          {/* Ainda no portão de aprovação · atalho pro solicitante corrigir/anexar */}
          {item.status === 'aguardando_aprovacao_origem' && item.solicitante_id === currentUserId && (
            <div className="flex flex-wrap items-center gap-2 justify-between p-3 rounded-lg border border-violet-500/40 bg-violet-500/10">
              <div className="flex items-center gap-2 text-sm text-violet-800 dark:text-violet-300">
                <Pencil className="h-4 w-4 shrink-0" />
                <span className="font-medium">Ainda não foi aprovada · esqueceu algo? Dá pra editar e anexar documento.</span>
              </div>
              <Button size="sm" onClick={() => {
                document.getElementById('editar-antes-aprovacao')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}>
                Editar solicitação
              </Button>
            </div>
          )}

          {/* Rastreio do pedido · etapas macro + com quem está (versão completa) */}
          <TrackerSolicitacao item={item} />

          {/* ── Detalhes ── */}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Detalhes</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <span className="block text-xs text-muted-foreground mb-0.5">Solicitante</span>
              <p className="font-medium">{item.solicitante?.name || '—'}</p>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground mb-0.5">Urgência</span>
              <p><Badge className={urg.color}>{urg.label}</Badge></p>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground mb-0.5">Situação</span>
              <p><Badge className={st.color}>{st.label}</Badge></p>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground mb-0.5">Criada em</span>
              <p className="font-medium">{new Date(item.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground mb-0.5">Visibilidade</span>
              <p className="font-medium">{item.compartilhar_area ? 'Compartilhada com a área' : 'Só você e quem atende'}</p>
            </div>
            {item.valor_estimado != null && (
              <div>
                <span className="block text-xs text-muted-foreground mb-0.5">Valor estimado</span>
                <p className="font-medium">R$ {Number(item.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            {item.responsavel?.name && (
              <div>
                <span className="block text-xs text-muted-foreground mb-0.5">Responsável</span>
                <p className="font-medium">{item.responsavel.name}</p>
              </div>
            )}
            {item.eh_planejado === true && (
              <div>
                <span className="block text-xs text-muted-foreground mb-0.5">Planejamento</span>
                <p className="mt-0.5"><Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">Planejado</Badge></p>
              </div>
            )}
          </div>
          {item.descricao && (
            <div>
              <span className="text-sm text-muted-foreground">Descrição</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{item.descricao}</p>
            </div>
          )}
          {item.justificativa && (
            <div>
              <span className="text-sm text-muted-foreground">Justificativa</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{item.justificativa}</p>
            </div>
          )}
          {item.observacoes && (
            <div>
              <span className="text-sm text-muted-foreground">Observações</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{item.observacoes}</p>
            </div>
          )}

          {/* Tracking de pedido Mercado Livre (apenas compras) */}
          {item.categoria === 'compras' && (
            <MLTrackingBlock
              item={item}
              canEdit={isAdmin
                || item.solicitante_id === currentUserId
                || item.responsavel_id === currentUserId}
              onChanged={() => onItemRefresh?.()}
            />
          )}

          {/* Dados de reembolso */}
          {item.categoria === 'reembolso' && (item.forma_pagamento || item.documento_url) && (
            <div className="space-y-3 pt-3 border-t border-border">
              <p className="text-sm font-semibold text-foreground">Dados de reembolso</p>
              {item.forma_pagamento && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Forma de pagamento</span>
                    <p className="font-medium">{item.forma_pagamento === 'pix' ? 'PIX' : 'Transferência Bancária'}</p>
                  </div>
                  {item.forma_pagamento === 'pix' && item.chave_pix && (
                    <div>
                      <span className="text-muted-foreground">Chave PIX</span>
                      <p className="font-medium font-mono">{item.chave_pix}</p>
                    </div>
                  )}
                  {item.forma_pagamento === 'transferencia_bancaria' && (
                    <>
                      {item.banco && <div><span className="text-muted-foreground">Banco</span><p className="font-medium">{item.banco}</p></div>}
                      {item.agencia && <div><span className="text-muted-foreground">Agência</span><p className="font-medium">{item.agencia}</p></div>}
                      {item.conta && <div><span className="text-muted-foreground">Conta</span><p className="font-medium">{item.conta}</p></div>}
                    </>
                  )}
                </div>
              )}
              {item.documento_url && (
                <a href={item.documento_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                  <FileText className="h-4 w-4" /> Ver comprovante
                </a>
              )}
            </div>
          )}

          {/* Documento anexado (genérico) · reembolso/pagamento já mostram nos
              próprios blocos; as demais categorias podem ganhar anexo na edição
              pré-aprovação e ele aparece aqui */}
          {item.documento_url && !['reembolso', 'pagamento'].includes(item.categoria) && (
            <div className="pt-3 border-t border-border">
              <a href={item.documento_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <FileText className="h-4 w-4" /> Ver documento anexado
              </a>
            </div>
          )}

          {/* Fotos anexadas no intake (Serviços/Serviço externo) · quem
              atende/cota avalia pela imagem · clicar abre em tamanho real */}
          {Array.isArray(item.imagens_url) && item.imagens_url.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-border">
              <p className="text-sm font-semibold text-foreground">Fotos anexadas</p>
              <div className="flex flex-wrap gap-2">
                {item.imagens_url.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" title="Abrir foto em tamanho real">
                    <img src={url} alt={`Foto ${i + 1}`} className="h-24 w-24 rounded-md object-cover border border-border hover:opacity-80 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Detalhes da compra · itens estruturados (com foto) ou texto legado */}
          {item.categoria === 'compras' && ((item.solicitacao_itens?.length) || item.itens || item.link_referencia || item.favorecido_nome) && (
            <div className="space-y-2 pt-3 border-t border-border">
              <p className="text-sm font-semibold text-foreground">Detalhes da compra</p>
              {item.solicitacao_itens?.length ? (
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">{item.solicitacao_itens.length} {item.solicitacao_itens.length === 1 ? 'item' : 'itens'}</span>
                  {[...item.solicitacao_itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map(it => (
                    <div key={it.id} className="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 p-2">
                      {it.imagem_url ? (
                        <a href={it.imagem_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <img src={it.imagem_url} alt="" className="h-12 w-12 rounded object-cover border border-border" />
                        </a>
                      ) : (
                        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          <span className="text-muted-foreground">{Number(it.quantidade) || 1}x</span> {it.descricao}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {it.valor_estimado != null && (
                            <span>R$ {Number(it.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          )}
                          {it.link_referencia && it.link_referencia.startsWith('http') && (
                            <a href={it.link_referencia} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Ver referência →</a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                item.itens && (
                  <div><span className="text-xs text-muted-foreground">Itens</span><p className="text-sm whitespace-pre-wrap">{item.itens}</p></div>
                )
              )}
              {item.favorecido_nome && (
                <div><span className="text-xs text-muted-foreground">Fornecedor sugerido</span><p className="text-sm">{item.favorecido_nome}</p></div>
              )}
              {!item.solicitacao_itens?.length && item.link_referencia && (
                item.link_referencia.startsWith('http')
                  ? <a href={item.link_referencia} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Ver referência →</a>
                  : <div><span className="text-xs text-muted-foreground">Referência</span><p className="text-sm">{item.link_referencia}</p></div>
              )}
            </div>
          )}

          {/* Detalhes da reserva · espaco/data/horario + material (itens) */}
          {item.categoria === 'reserva_espaco' && (item.espaco_solicitado || item.data_uso || item.itens) && (
            <div className="space-y-2 pt-3 border-t border-border">
              <p className="text-sm font-semibold text-foreground">Detalhes da reserva</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {item.espaco_solicitado && (<div><span className="text-muted-foreground">Espaço</span><p className="font-medium">{item.espaco_solicitado}</p></div>)}
                {item.data_uso && (<div><span className="text-muted-foreground">Data</span><p className="font-medium">{new Date(item.data_uso + 'T00:00:00').toLocaleDateString('pt-BR')}{item.horario_inicio ? ` · ${item.horario_inicio}${item.horario_fim ? `–${item.horario_fim}` : ''}` : ''}</p></div>)}
                {item.qtde_pessoas != null && (<div><span className="text-muted-foreground">Pessoas</span><p className="font-medium">{item.qtde_pessoas}</p></div>)}
              </div>
              {item.itens && (
                <div><span className="text-xs text-muted-foreground">Material / arrumação</span><p className="text-sm whitespace-pre-wrap">{item.itens}</p></div>
              )}
            </div>
          )}

          {/* Dados do pagamento */}
          {item.categoria === 'pagamento' && (item.favorecido_nome || item.forma_pagamento || item.documento_url) && (
            <div className="space-y-2 pt-3 border-t border-border">
              <p className="text-sm font-semibold text-foreground">Dados do pagamento</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {item.favorecido_nome && (<div><span className="text-muted-foreground">Favorecido</span><p className="font-medium">{item.favorecido_nome}</p></div>)}
                {item.favorecido_documento && (<div><span className="text-muted-foreground">CNPJ/CPF</span><p className="font-medium font-mono">{item.favorecido_documento}</p></div>)}
                {item.forma_pagamento && (<div><span className="text-muted-foreground">Forma</span><p className="font-medium">{item.forma_pagamento === 'boleto' ? 'Boleto' : item.forma_pagamento === 'pix' ? 'PIX' : 'Transferência'}</p></div>)}
                {item.data_necessaria && (<div><span className="text-muted-foreground">Vencimento</span><p className="font-medium">{new Date(item.data_necessaria).toLocaleDateString('pt-BR')}</p></div>)}
                {item.forma_pagamento === 'pix' && item.chave_pix && (<div><span className="text-muted-foreground">Chave PIX</span><p className="font-medium font-mono">{item.chave_pix}</p></div>)}
                {item.forma_pagamento === 'transferencia_bancaria' && (<>
                  {item.banco && <div><span className="text-muted-foreground">Banco</span><p className="font-medium">{item.banco}</p></div>}
                  {item.agencia && <div><span className="text-muted-foreground">Agência</span><p className="font-medium">{item.agencia}</p></div>}
                  {item.conta && <div><span className="text-muted-foreground">Conta</span><p className="font-medium">{item.conta}</p></div>}
                </>)}
              </div>
              {item.recorrente && (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">⟳ Recorrente{item.recorrencia ? ` · ${item.recorrencia}` : ''}</Badge>
              )}
              {item.documento_url && (
                <a href={item.documento_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                  <FileText className="h-4 w-4" /> Ver documento (boleto / NF)
                </a>
              )}
            </div>
          )}

          {/* Cotação (compras/serviço) · logística registra valor+fornecedor antes do financeiro */}
          {['compras', 'servico'].includes(item.categoria) && (item.status === 'em_cotacao' || item.valor_cotado != null) && (
            <CotacaoBlock item={item} canCotar={isAdmin} onChanged={() => onItemRefresh?.()} />
          )}

          {/* ── Ações da área · header + primária (Aprovar/Concluir) antes das
              secundárias e Rejeitar (destrutiva) por último. As CONDIÇÕES são
              idênticas às de antes — só agrupamento/ordem visual mudou. ── */}
          {isAdmin && !actionPending && (() => {
            // Aprovação/Rejeição definitiva da área · sempre disponível enquanto a
            // solicitação está com ela e ativa (não quando está com o solicitante em
            // ajuste, nem antes dos portões de aprovação/mérito, nem sobrestada —
            // em espera precisa retomar antes). Aprovar mantém o passo seguinte de
            // Concluir; Rejeitar é terminal (sem Concluir).
            const podeAprovar = !['concluido', 'cancelado', 'rejeitado', 'avaliado', 'aprovado', 'aguardando_ajuste', 'aguardando_aprovacao_origem', 'aguardando_merito', 'sobrestada'].includes(item.status);
            const podeRejeitar = !['concluido', 'cancelado', 'rejeitado', 'avaliado', 'aguardando_ajuste', 'aguardando_aprovacao_origem', 'aguardando_merito', 'sobrestada'].includes(item.status);
            // Ponte estoque · só faz sentido em pedidos de material (logística) ativos
            const podeEstoque = ['compras', 'servico', 'infraestrutura', 'outro'].includes(item.categoria)
              && !['concluido', 'cancelado', 'rejeitado', 'avaliado', 'aguardando_aprovacao_origem', 'aguardando_merito', 'sobrestada'].includes(item.status);
            const temAcoes = podeAprovar || podeRejeitar || item.status === 'pendente' || item.status === 'aprovado' || podeEstoque;
            if (!temAcoes) return null;
            return (
              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ações</p>
                <div className="flex flex-wrap gap-2">
                  {podeAprovar && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setActionPending('aprovado')}>Aprovar</Button>
                  )}
                  {item.status === 'aprovado' && <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setActionPending('concluido')}>Concluir</Button>}
                  {item.status === 'pendente' && <Button size="sm" variant="outline" onClick={() => setActionPending('em_analise')}>Analisar</Button>}
                  {podeEstoque && <Button size="sm" variant="outline" onClick={() => setAtenderEstoque(true)}>Atender pelo estoque</Button>}
                  {podeRejeitar && (
                    <Button size="sm" variant="destructive" onClick={() => setActionPending('rejeitado')}>Rejeitar</Button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Sobrestar (em espera) / Retomar · ação de gestão (admin/responsável) */}
          {isAdmin && !actionPending && (
            <SobrestarBlock item={item} onChanged={() => onItemRefresh?.()} />
          )}
          {atenderEstoque && (
            <AtenderEstoqueModal
              solicitacao={item}
              onClose={() => setAtenderEstoque(false)}
              onDone={() => { setAtenderEstoque(false); onItemRefresh?.(); onClose(); }}
            />
          )}

          {/* Fase 1 · Relatar Problema / Reenviar + linha do tempo (visível pros dois lados) */}
          {!actionPending && (
            <SolicitacaoHistorico
              item={item}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onChanged={() => onItemRefresh?.()}
            />
          )}

          {/* Marketing · acompanhamento pelo solicitante (redesenho = campanha · legado = card) */}
          {item.categoria === 'marketing' && item.solicitante_id === currentUserId && (
            item.marketing_campanha
              ? <MarketingCampanhaBlock campanha={item.marketing_campanha} onChanged={() => onItemRefresh?.()} />
              : item.marketing_card
                ? <MarketingCardBlock card={item.marketing_card} onChanged={() => onItemRefresh?.()} />
                : null
          )}

          {/* NPS pos-conclusao · so pro solicitante após status concluído */}
          {item.status === 'concluido'
            && currentUserId
            && item.solicitante_id === currentUserId
            && onNpsSubmit && (
              <NpsBlock item={item} onSubmit={onNpsSubmit} />
          )}

          {actionPending && (
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-sm font-medium text-foreground">
                Confirmar ação: <span className="text-primary">{ACTION_LABELS[actionPending]}</span>
              </p>
              <div className="space-y-2">
                <Label className="text-sm">Comentário (opcional · fica no histórico)</Label>
                <Textarea
                  value={obsText}
                  onChange={e => setObsText(e.target.value)}
                  placeholder="Comentário sobre esta decisão (aparece na linha do tempo)..."
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={cancelAction}>Cancelar</Button>
                <Button size="sm" onClick={confirmAction}>{ACTION_LABELS[actionPending]}</Button>
              </div>
            </div>
          )}
        </div>
      </Content>
    </Root>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MarketingCampanhaBlock · acompanhamento da campanha pelo solicitante (redesenho 2026-05-31)
// 1 dor = 1 campanha com N entregaveis · mostra status + prazo + progresso + entregaveis.
// ═══════════════════════════════════════════════════════════════════════
const EST_ENTREGAVEL_LABEL = {
  triagem: 'Em triagem', backlog: 'Na fila', fila: 'Na fila', pesquisa: 'Pesquisa',
  producao: 'Em produção', em_producao: 'Em produção', revisao: 'Em revisão',
  aguardando_solicitante: 'Em revisão', concluido: 'Concluído',
};
function MarketingCampanhaBlock({ campanha, onChanged }) {
  const ents = campanha.entregaveis || [];
  const feitos = ents.filter(e => e.estado === 'concluido').length;
  const pct = ents.length ? Math.round((feitos / ents.length) * 100) : 0;
  const tudoPronto = ents.length > 0 && feitos === ents.length;
  const jaRevisou = ents.some(e => e.tem_revisao);
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : null;
  const emTriagem = campanha.status === 'triagem';
  const concluida = campanha.status === 'concluida';
  // Aprovação é da DEMANDA COMPLETA: só aparece quando TODOS os entregáveis estão prontos.
  const podeAprovar = tudoPronto && campanha.status === 'ativa';

  const [revisaoOpen, setRevisaoOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function aprovar() {
    setSubmitting(true);
    try {
      await marketingApi.campanhas.aprovar(campanha.id);
      toast.success('Demanda aprovada · obrigado! Agora avalie pelo NPS.');
      onChanged?.();
    } catch (e) { toast.error(e.message || 'Erro ao aprovar'); }
    finally { setSubmitting(false); }
  }
  async function revisar() {
    if (motivo.trim().length < 5) { toast.error('Conte o que precisa ajustar (mín. 5 caracteres)'); return; }
    setSubmitting(true);
    try {
      await marketingApi.campanhas.revisar(campanha.id, motivo.trim());
      toast.success('Pedido de revisão enviado · a equipe vai ajustar.');
      setRevisaoOpen(false); setMotivo('');
      onChanged?.();
    } catch (e) { toast.error(e.message || 'Erro ao pedir revisão'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FileText className="h-4 w-4 text-pink-500" /> Sua demanda Marketing
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge className={
          concluida ? 'bg-emerald-500/15 text-emerald-700' :
          emTriagem ? 'bg-pink-500/15 text-pink-700' :
          tudoPronto ? 'bg-emerald-500/15 text-emerald-700' : 'bg-blue-500/15 text-blue-700'
        }>
          {concluida ? 'Concluída · aprovada' :
           emTriagem ? 'Em triagem · a equipe vai avaliar e planejar' :
           tudoPronto ? 'Tudo pronto · aguardando sua aprovação' : 'Em produção'}
        </Badge>
        {fmt(campanha.prazo_entrega) && (
          <span className="text-muted-foreground">Entrega prevista: {fmt(campanha.prazo_entrega)}</span>
        )}
      </div>

      {ents.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div className={`h-full ${pct === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0">{feitos}/{ents.length} prontos</span>
          </div>
          {ents.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
              <span className="truncate flex-1 flex items-center gap-1.5">
                {e.estado === 'concluido' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                {e.titulo}
              </span>
              <span className="text-muted-foreground shrink-0">{EST_ENTREGAVEL_LABEL[e.estado] || e.estado}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">A equipe ainda vai definir os entregáveis desta demanda.</p>
      )}

      {/* Aprovação da DEMANDA COMPLETA · só quando tudo pronto */}
      {podeAprovar && !revisaoOpen && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={aprovar} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar entrega
          </Button>
          {!jaRevisou && (
            <Button size="sm" variant="outline" onClick={() => setRevisaoOpen(true)} className="flex-1 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30">
              ⟳ Pedir revisão (1x)
            </Button>
          )}
        </div>
      )}
      {revisaoOpen && (
        <div className="space-y-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded">
          <Label className="text-xs">O que precisa ajustar? *</Label>
          <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} placeholder="Atenção · só 1 revisão. A equipe vai refazer o que você apontar." />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => { setRevisaoOpen(false); setMotivo(''); }}>Cancelar</Button>
            <Button size="sm" onClick={revisar} disabled={submitting}>Enviar revisão</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MarketingCardBlock · solicitante revisa preview, aprova entrega ou pede revisão (Spec 012 · LEGADO)
// ═══════════════════════════════════════════════════════════════════════
function MarketingCardBlock({ card, onChanged }) {
  const [entregaveis, setEntregaveis] = useState([]);
  const [posicao, setPosicao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revisaoOpen, setRevisaoOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!card?.id) return;
    setLoading(true);
    Promise.all([
      marketingApi.entregaveis.list(card.id).catch(() => []),
      marketingApi.fila.posicao(card.id).catch(() => null),
    ]).then(([ent, pos]) => {
      setEntregaveis(ent || []);
      setPosicao(pos);
    }).finally(() => setLoading(false));
  }, [card?.id]);

  async function aprovar() {
    setSubmitting(true);
    try {
      await marketingApi.aprovarEntrega(card.id);
      toast.success('Entrega aprovada · agora avalie pelo NPS');
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao aprovar entrega');
    } finally {
      setSubmitting(false);
    }
  }

  async function sugerirRevisao() {
    if (motivo.trim().length < 5) { toast.error('Motivo precisa ter pelo menos 5 caracteres'); return; }
    setSubmitting(true);
    try {
      await marketingApi.sugerirRevisao(card.id, motivo.trim());
      toast.success('Revisão enviada · card volta pro fim da fila');
      setRevisaoOpen(false);
      setMotivo('');
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao sugerir revisão');
    } finally {
      setSubmitting(false);
    }
  }

  if (!card) return null;

  const podeRevisar = card.estado === 'aguardando_solicitante' && !card.tem_revisao;
  const podeAprovar = card.estado === 'aguardando_solicitante';

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FileText className="h-4 w-4 text-pink-500" />
        Sua demanda Marketing
      </p>

      {/* Status do card */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Status:</span>
        <Badge className={
          card.estado === 'concluido' ? 'bg-emerald-500/15 text-emerald-700' :
          card.estado === 'aguardando_solicitante' ? 'bg-violet-500/15 text-violet-700' :
          card.estado === 'em_producao' ? 'bg-blue-500/15 text-blue-700' :
          'bg-amber-500/15 text-amber-700'
        }>
          {card.estado === 'fila' ? 'Na fila' :
           card.estado === 'em_producao' ? 'Em produção' :
           card.estado === 'aguardando_solicitante' ? 'Aguardando sua revisão' :
           'Concluído'}
        </Badge>
        {card.tem_revisao && (
          <Badge className="bg-amber-500/15 text-amber-700">⟳ Já teve revisão (1x)</Badge>
        )}
        {card.prazo_confirmado && (
          <span className="text-muted-foreground">
            Prazo: {new Date(card.prazo_confirmado).toLocaleDateString('pt-BR')}
          </span>
        )}
        {posicao && posicao.posicao != null && (
          <Badge className="bg-primary/10 text-primary">
            Fila #{posicao.posicao} de {posicao.total}
          </Badge>
        )}
      </div>

      {/* Entregáveis · preview/download */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando arquivos...</p>
      ) : entregaveis.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">Arquivos ({entregaveis.length})</p>
          {entregaveis.map(e => (
            <a
              key={e.id}
              href={marketingApi.entregaveis.download(e.id)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1.5 hover:bg-muted/50 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate flex-1">{e.nome_arquivo}</span>
              {e.tamanho_bytes && <span className="text-muted-foreground text-[10px]">{Math.round(e.tamanho_bytes/1024)}KB</span>}
            </a>
          ))}
        </div>
      ) : card.estado === 'aguardando_solicitante' ? (
        <p className="text-xs text-muted-foreground italic">Equipe finalizou · preview ainda não anexado.</p>
      ) : null}

      {/* Botoes de ação · so quando aguardando solicitante */}
      {podeAprovar && !revisaoOpen && (
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={aprovar}
            disabled={submitting}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar entrega
          </Button>
          {podeRevisar && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRevisaoOpen(true)}
              className="flex-1 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              ⟳ Sugerir revisão (1x)
            </Button>
          )}
        </div>
      )}

      {revisaoOpen && (
        <div className="space-y-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded">
          <Label className="text-xs">Motivo da revisão *</Label>
          <Textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={2}
            placeholder="Atenção · só 1 revisão. Card volta pro fim da fila."
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setRevisaoOpen(false); setMotivo(''); }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={sugerirRevisao} disabled={motivo.trim().length < 5 || submitting}>
              {submitting ? 'Enviando...' : 'Confirmar revisão'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NpsBlock({ item, onSubmit }) {
  const [nota, setNota] = useState(item.nps_nota ?? null);
  const [comentario, setComentario] = useState(item.nps_comentario || '');
  const [submitting, setSubmitting] = useState(false);
  const jaAvaliou = item.nps_nota != null;

  if (jaAvaliou) {
    return (
      <div className="space-y-2 pt-3 border-t border-border">
        <p className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Star className="h-4 w-4 text-primary fill-primary" />
          Sua avaliação
        </p>
        <p className="text-2xl font-bold text-primary">{item.nps_nota}/10</p>
        {item.nps_comentario && (
          <p className="text-sm text-muted-foreground italic">"{item.nps_comentario}"</p>
        )}
      </div>
    );
  }

  async function handleSubmit() {
    if (nota == null) {
      toast.error('Selecione uma nota de 0 a 10');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(item.id, nota, comentario.trim() || null);
    } catch {
      // erro já foi exibido pelo handler do pai
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <div>
        <p className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Star className="h-4 w-4 text-primary" />
          Como você avalia o atendimento?
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          0 = muito ruim · 10 = excelente
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setNota(n)}
            className={`w-9 h-9 rounded-md border text-sm font-medium transition ${
              nota === n
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border hover:border-primary'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <Textarea
        value={comentario}
        onChange={e => setComentario(e.target.value)}
        placeholder="Deixe um comentário (opcional)..."
        rows={2}
      />
      <Button size="sm" onClick={handleSubmit} disabled={submitting} className="w-full">
        {submitting ? 'Enviando...' : 'Enviar avaliação'}
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Fase 1 · Linha do tempo + "Relatar Problema" (alteração/devolução) + Reenviar
// Solicitante: pede alteração/cancelamento na própria · Responsável/admin:
// devolve por falta de clareza (não pune o SLA da área). Em ajuste, o solicitante
// edita e reenvia. A linha do tempo (eventos + ajustes) aparece pros dois lados.
// ═══════════════════════════════════════════════════════════════════════
const MOTIVOS_PROBLEMA = [
  { value: 'descricao', label: 'Descrição' },
  { value: 'escopo', label: 'Escopo' },
  { value: 'data', label: 'Data' },
  { value: 'cancelamento', label: 'Cancelamento' },
];
const MOTIVO_LABEL = { descricao: 'Descrição', escopo: 'Escopo', data: 'Data', cancelamento: 'Cancelamento', resposta: 'Resposta', edicao: 'Edição' };

// Termômetro "pedimos bem?" · % das solicitações que precisaram de ajuste (90d).
// Diagnóstico NÃO punitivo (decisão do Marcos) · só na aba "Para Atender" (gestão/responsável).
function TermometroRefeitas() {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    api.diagnosticoRefeitas(90).then(r => { if (alive) setD(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!d || !d.total_periodo) return null;
  const pct = d.pct_refeitas;
  const cor = pct >= 25 ? 'text-red-600 dark:text-red-400'
    : pct >= 12 ? 'text-amber-600 dark:text-amber-400'
    : 'text-emerald-600 dark:text-emerald-400';
  return (
    <Card className="p-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-1">
      <span className="text-xs font-medium text-muted-foreground">Pedimos bem? · últimos 90 dias</span>
      <span className="flex items-baseline gap-1.5">
        <span className={`text-lg font-bold ${cor}`}>{pct}%</span>
        <span className="text-xs text-muted-foreground">precisaram de ajuste ({d.refeitas} de {d.total_periodo})</span>
      </span>
      {d.devolucoes > 0 && (
        <span className="text-xs text-muted-foreground">{d.devolucoes} devolvida(s) pela área</span>
      )}
      <span className="text-[10px] text-muted-foreground/70 ml-auto">termômetro · não punitivo</span>
    </Card>
  );
}

// Ponte estoque (Fase 3a-2) · o responsável atende a solicitação dando baixa no
// estoque (itens que já temos) → conclui a solicitação. Comprar segue o fluxo de compras.
function AtenderEstoqueModal({ solicitacao, onClose, onDone }) {
  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState('');
  const [qtd, setQtd] = useState('');
  const [fila, setFila] = useState([]);
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api.estoqueProdutos().then(d => { if (alive) setProdutos(Array.isArray(d) ? d : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const prodMap = useMemo(() => Object.fromEntries(produtos.map(p => [p.id, p])), [produtos]);
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (t ? produtos.filter(p => p.nome.toLowerCase().includes(t)) : produtos).slice(0, 100);
  }, [produtos, busca]);

  function adicionar() {
    const p = prodMap[sel]; const q = Number(qtd);
    if (!p) { toast.error('Escolha um produto.'); return; }
    if (!q || q <= 0) { toast.error('Quantidade inválida.'); return; }
    setFila(f => [...f, { produto_id: p.id, nome: p.nome, quantidade: q, saldo: p.saldo }]);
    setSel(''); setQtd('');
  }
  async function confirmar() {
    if (!fila.length) { toast.error('Adicione ao menos um item.'); return; }
    setSaving(true);
    try {
      await api.atenderEstoque(solicitacao.id, fila.map(f => ({ produto_id: f.produto_id, quantidade: f.quantidade })), obs.trim() || null);
      toast.success('Baixa registrada · solicitação concluída.');
      onDone();
    } catch (e) { toast.error(e.message || 'Erro ao atender pelo estoque'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Atender pelo estoque</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Dá baixa no estoque dos itens que já temos e conclui <span className="font-medium">{solicitacao.titulo}</span>.</p>
          <Input placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} />
          <div className="flex gap-2 items-center">
            <select className="flex h-9 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-sm" value={sel} onChange={e => setSel(e.target.value)}>
              <option value="">Selecione o produto...</option>
              {filtrados.map(p => <option key={p.id} value={p.id}>{p.nome} (saldo {p.saldo})</option>)}
            </select>
            <Input type="number" min="0" step="any" className="w-20" placeholder="Qtd" value={qtd} onChange={e => setQtd(e.target.value)} />
            <Button type="button" size="sm" variant="outline" onClick={adicionar}>+</Button>
          </div>
          {fila.length > 0 && (
            <div className="space-y-1 rounded-md border border-border p-2">
              {fila.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{f.nome} · <span className="font-medium">{f.quantidade}</span>{f.quantidade > f.saldo ? <span className="text-amber-600"> (saldo {f.saldo}!)</span> : ''}</span>
                  <button type="button" className="text-red-600 text-xs" onClick={() => setFila(x => x.filter((_, j) => j !== i))}>remover</button>
                </div>
              ))}
            </div>
          )}
          <Input placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={confirmar} disabled={saving || !fila.length}>{saving ? 'Baixando...' : 'Dar baixa e concluir'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SolicitacaoHistorico({ item, isAdmin, currentUserId, onChanged }) {
  const [linha, setLinha] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('descricao');
  const [comentario, setComentario] = useState('');
  const [resposta, setResposta] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Edição direta ANTES da aprovação de origem (corrigir dados / anexar o que faltou)
  const [editarAberto, setEditarAberto] = useState(false);
  const [docFile, setDocFile] = useState(null);
  const [edit, setEdit] = useState({
    titulo: item.titulo || '', descricao: item.descricao || '',
    justificativa: item.justificativa || '', data_necessaria: item.data_necessaria || '',
    valor_estimado: item.valor_estimado != null ? String(item.valor_estimado) : '',
  });
  // Itens do pedido (compras/serviço) · editáveis na devolução.
  const ehCompras = ['compras', 'servico'].includes(item.categoria);
  const [itens, setItens] = useState(() =>
    (Array.isArray(item.solicitacao_itens) ? [...item.solicitacao_itens] : [])
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map(it => ({
        descricao: it.descricao || '',
        quantidade: String(it.quantidade ?? 1),
        valor_estimado: it.valor_estimado != null ? String(it.valor_estimado) : '',
        valor_tipo: 'total', // o gravado já é o total da linha
        link_referencia: it.link_referencia || '',
      })));
  const setItemLinha = (i, patch) => setItens(arr => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const addItemLinha = () => setItens(arr => [...arr, { descricao: '', quantidade: '1', valor_estimado: '', valor_tipo: 'total', link_referencia: '' }]);
  const delItemLinha = (i) => setItens(arr => arr.filter((_, j) => j !== i));
  const totalItens = itens.reduce((acc, it) => {
    const v = Number(it.valor_estimado); const q = Number(it.quantidade) || 1;
    if (!isFinite(v) || !it.valor_estimado) return acc;
    return acc + (it.valor_tipo === 'unitario' ? v * q : v);
  }, 0);

  const isSolicitante = item.solicitante_id === currentUserId;
  const emAjuste = item.status === 'aguardando_ajuste';
  const encerrada = ['concluido', 'cancelado', 'rejeitado', 'avaliado'].includes(item.status);
  // Ainda aguardando o diretor de origem · o ciclo de ajuste/devolução só vale depois.
  const aguardaOrigem = item.status === 'aguardando_aprovacao_origem' || ['pendente', 'triagem'].includes(item.aprovacao_origem_status);
  const podeRelatar = (isSolicitante || isAdmin) && !encerrada && !emAjuste && !aguardaOrigem;
  // Ainda no portão de origem · o solicitante pode EDITAR direto (corrigir dados,
  // anexar o documento que faltou) enquanto ninguém aprovou (2026-07-14).
  const emAprovacao = item.status === 'aguardando_aprovacao_origem';
  const podeEditarAntes = (isSolicitante || isAdmin) && emAprovacao;

  useEffect(() => {
    let alive = true;
    api.timeline(item.id).then(d => { if (alive) setLinha(Array.isArray(d) ? d : []); }).catch(() => {});
    return () => { alive = false; };
  }, [item.id, item.status, item.vezes_refeita]);

  async function enviarProblema() {
    if (motivo !== 'cancelamento' && comentario.trim().length < 3) {
      toast.error('Conte rapidamente o que precisa ajustar.');
      return;
    }
    setSubmitting(true);
    try {
      await api.relatarProblema(item.id, motivo, comentario.trim() || null);
      toast.success(motivo === 'cancelamento' ? 'Solicitação cancelada.' : 'Enviado · foi para ajuste.');
      setAberto(false); setComentario('');
      onChanged?.();
    } catch (e) { toast.error(e.message || 'Erro ao relatar problema'); }
    finally { setSubmitting(false); }
  }

  async function reenviar() {
    if (!edit.titulo.trim()) { toast.error('O título não pode ficar vazio.'); return; }
    if (resposta.trim().length < 3) { toast.error('Descreva sua resposta ao ajuste pedido.'); return; }
    setSubmitting(true);
    try {
      await api.reenviar(item.id, {
        titulo: edit.titulo.trim(), descricao: edit.descricao,
        justificativa: edit.justificativa, data_necessaria: edit.data_necessaria || null,
        resposta: resposta.trim(),
        ...(ehCompras ? {
          itens_lista: itens
            .filter(it => String(it.descricao || '').trim())
            .map(it => ({
              descricao: it.descricao, quantidade: Number(it.quantidade) || 1,
              valor_estimado: it.valor_estimado, valor_tipo: it.valor_tipo,
              link_referencia: it.link_referencia || null,
            })),
        } : {}),
      });
      toast.success('Reenviada · voltou para a fila.');
      setResposta('');
      onChanged?.();
    } catch (e) { toast.error(e.message || 'Erro ao reenviar'); }
    finally { setSubmitting(false); }
  }

  // Edição antes da aprovação · sobe o anexo (se houver) e salva os campos.
  async function salvarEdicao() {
    if (!edit.titulo.trim()) { toast.error('O título não pode ficar vazio.'); return; }
    setSubmitting(true);
    try {
      let documento_url;
      if (docFile) {
        const ext = (docFile.name.split('.').pop() || 'pdf').toLowerCase();
        const path = `comprovantes/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('solicitacoes')
          .upload(path, docFile, { upsert: false });
        if (upErr) throw new Error('Erro ao enviar o documento: ' + upErr.message);
        documento_url = supabase.storage.from('solicitacoes').getPublicUrl(path).data.publicUrl;
      }
      await api.editar(item.id, {
        titulo: edit.titulo.trim(), descricao: edit.descricao,
        justificativa: edit.justificativa, data_necessaria: edit.data_necessaria || null,
        ...(!ehCompras && edit.valor_estimado !== '' ? { valor_estimado: edit.valor_estimado } : {}),
        ...(documento_url ? { documento_url } : {}),
        ...(ehCompras ? {
          itens_lista: itens
            .filter(it => String(it.descricao || '').trim())
            .map(it => ({
              descricao: it.descricao, quantidade: Number(it.quantidade) || 1,
              valor_estimado: it.valor_estimado, valor_tipo: it.valor_tipo,
              link_referencia: it.link_referencia || null,
            })),
        } : {}),
      });
      toast.success('Solicitação atualizada · o aprovador foi avisado.');
      setDocFile(null); setEditarAberto(false);
      api.timeline(item.id).then(d => setLinha(Array.isArray(d) ? d : [])).catch(() => {});
      onChanged?.();
    } catch (e) { toast.error(e.message || 'Erro ao salvar edição'); }
    finally { setSubmitting(false); }
  }

  // Último problema relatado (devolução da área ou alteração pedida) · ignora a
  // tréplica do solicitante ('resposta'), a edição pré-aprovação e os cancelamentos.
  const ultimoAjuste = [...linha].reverse().find(l => l.tipo === 'ajuste' && !['cancelamento', 'resposta', 'edicao'].includes(l.motivo));

  // Campos comuns aos dois modos de edição do solicitante (devolvida pra ajuste
  // × antes da aprovação) · mesmo estado `edit`/`itens` nos dois blocos.
  const camposBasicos = (
    <>
      <div className="space-y-2">
        <Label className="text-xs">Título</Label>
        <Input value={edit.titulo} onChange={e => setEdit(s => ({ ...s, titulo: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Descrição</Label>
        <Textarea rows={2} value={edit.descricao} onChange={e => setEdit(s => ({ ...s, descricao: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Justificativa</Label>
        <Textarea rows={2} value={edit.justificativa} onChange={e => setEdit(s => ({ ...s, justificativa: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Data necessária</Label>
        <Input type="date" value={edit.data_necessaria ? String(edit.data_necessaria).slice(0, 10) : ''}
          onChange={e => setEdit(s => ({ ...s, data_necessaria: e.target.value }))} />
      </div>
    </>
  );
  const itensEditor = ehCompras && (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Itens do pedido</Label>
        {totalItens > 0 && (
          <span className="text-[11px] text-muted-foreground">
            Total: {totalItens.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {itens.map((it, i) => (
          <div key={i} className="rounded-md border border-border bg-background p-2 space-y-1.5">
            <div className="flex gap-1.5">
              <Input className="flex-1" placeholder="Descrição do item" value={it.descricao}
                onChange={e => setItemLinha(i, { descricao: e.target.value })} />
              <button type="button" className="text-red-600 text-xs px-1 shrink-0" onClick={() => delItemLinha(i)} title="Remover item">✕</button>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <Input type="number" min="1" step="1" className="w-16" placeholder="Qtd" value={it.quantidade}
                onChange={e => setItemLinha(i, { quantidade: e.target.value })} />
              <Input type="number" min="0" step="any" className="w-28" placeholder="Valor (R$)" value={it.valor_estimado}
                onChange={e => setItemLinha(i, { valor_estimado: e.target.value })} />
              <select className="h-9 rounded-md border border-input bg-background px-2 text-xs" value={it.valor_tipo}
                onChange={e => setItemLinha(i, { valor_tipo: e.target.value })}>
                <option value="total">R$ total</option>
                <option value="unitario">R$ por unid.</option>
              </select>
            </div>
            <Input className="text-xs" placeholder="Link de referência (opcional)" value={it.link_referencia}
              onChange={e => setItemLinha(i, { link_referencia: e.target.value })} />
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={addItemLinha} className="w-full">+ Adicionar item</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      {item.vezes_refeita > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Esta solicitação foi ajustada {item.vezes_refeita}× durante o processo.
        </p>
      )}
      {/* Ainda aguardando o diretor aprovar · o solicitante edita direto
          (corrigir dados / anexar o documento que faltou · 2026-07-14) */}
      {podeEditarAntes && (
        editarAberto ? (
          <div id="editar-antes-aprovacao" className="space-y-3 p-3 rounded-lg border border-violet-500/30 bg-violet-500/5">
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">Editar solicitação · ainda aguardando aprovação</p>
            <p className="text-xs text-muted-foreground">
              Corrija os dados ou anexe o documento que faltou enquanto o diretor não aprova.
              A edição fica registrada na linha do tempo e o aprovador é avisado.
            </p>
            {camposBasicos}
            {!ehCompras && (
              <div className="space-y-2">
                <Label className="text-xs">{item.categoria === 'reembolso' ? 'Valor (exato da nota)' : 'Valor estimado (R$)'}</Label>
                <Input type="number" min="0" step="0.01" value={edit.valor_estimado}
                  onChange={e => setEdit(s => ({ ...s, valor_estimado: e.target.value }))} />
              </div>
            )}
            {itensEditor}
            <div className="space-y-2">
              <Label className="text-xs">Documento / comprovante {item.documento_url ? '· substituir o atual' : '· anexar'}</Label>
              {item.documento_url && !docFile && (
                <a href={item.documento_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-primary hover:underline">
                  <FileText className="h-3.5 w-3.5" /> Ver documento atual
                </a>
              )}
              <DocDropzone file={docFile} onFile={setDocFile} onClear={() => setDocFile(null)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => { setEditarAberto(false); setDocFile(null); }}>Cancelar</Button>
              <Button size="sm" onClick={salvarEdicao} disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </div>
        ) : (
          <div id="editar-antes-aprovacao" className="flex flex-wrap items-center gap-2 justify-between p-3 rounded-lg border border-violet-500/40 bg-violet-500/10">
            <div className="flex items-center gap-2 text-sm text-violet-800 dark:text-violet-300">
              <Pencil className="h-4 w-4 shrink-0" />
              <span className="font-medium">Aguardando aprovação · você ainda pode editar este pedido.</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditarAberto(true)}>Editar solicitação</Button>
          </div>
        )
      )}

      {emAjuste && isSolicitante && (
        <div id="editar-devolvida" className="space-y-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Ajuste solicitado · corrija e reenvie</p>
          {ultimoAjuste && (
            <p className="text-xs text-muted-foreground">
              Pedido em <span className="font-medium">{MOTIVO_LABEL[ultimoAjuste.motivo]}</span>
              {ultimoAjuste.comentario ? `: ${ultimoAjuste.comentario}` : ''}
            </p>
          )}
          {camposBasicos}

          {itensEditor}

          <div className="space-y-2">
            <Label className="text-xs">Sua resposta <span className="text-red-500">*</span></Label>
            <Textarea rows={2} value={resposta} onChange={e => setResposta(e.target.value)}
              placeholder="Responda ao que a área pediu (fica registrado na linha do tempo)" />
          </div>
          <Button size="sm" onClick={reenviar} disabled={submitting} className="w-full">
            {submitting ? 'Reenviando...' : 'Reenviar solicitação'}
          </Button>
        </div>
      )}

      {podeRelatar && (
        aberto ? (
          <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
            <p className="text-sm font-medium text-foreground">Relatar problema</p>
            <p className="text-xs text-muted-foreground">
              {isSolicitante ? 'Precisa alterar ou cancelar este pedido?' : 'Devolver para o solicitante ajustar (não conta contra o SLA da área).'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_PROBLEMA.map(m => (
                <button key={m.value} type="button" onClick={() => setMotivo(m.value)}
                  className={`px-2.5 py-1 rounded-md border text-xs transition ${motivo === m.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <Textarea rows={2} value={comentario} onChange={e => setComentario(e.target.value)}
              placeholder={motivo === 'cancelamento' ? 'Motivo do cancelamento (opcional)' : 'O que precisa mudar?'} />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => { setAberto(false); setComentario(''); }}>Fechar</Button>
              <Button size="sm" onClick={enviarProblema} disabled={submitting}
                className={motivo === 'cancelamento' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}>
                {submitting ? 'Enviando...' : (motivo === 'cancelamento' ? 'Cancelar solicitação' : 'Enviar')}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAberto(true)}>Relatar problema</Button>
        )
      )}

      {linha.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Linha do tempo
          </p>
          <ul className="space-y-2">
            {linha.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5">{l.tipo === 'ajuste' ? (l.motivo === 'cancelamento' ? '✖' : '✏️') : '•'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {l.tipo === 'ajuste'
                        ? (l.motivo === 'resposta'
                            ? 'Resposta do solicitante'
                            : l.motivo === 'edicao'
                              ? 'Editada pelo solicitante (antes da aprovação)'
                              : `${l.lado === 'responsavel' ? 'Devolução' : 'Ajuste pedido'} · ${MOTIVO_LABEL[l.motivo] || l.motivo}`)
                        : getStatusMeta(l.status_novo).label}
                    </span>
                    <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                      {new Date(l.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {(l.comentario || l.observacao) && <p className="text-muted-foreground">{l.comentario || l.observacao}</p>}
                  {l.ator && <p className="text-muted-foreground text-[10px]">por {l.ator}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
