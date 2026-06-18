import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { solicitacoes as api, marketing as marketingApi } from '../api';
import { playSuccessSound } from '../lib/sounds';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { Plus, ClipboardList, Clock, CheckCircle2, XCircle, Search as SearchIcon, ArrowRight, List, Upload, FileText, X, Users, Star } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

const CATEGORIAS = [
  { value: 'compras',        label: 'Compras',             color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400', areaResp: 'logistica_compras' },
  { value: 'infraestrutura', label: 'Serviços',            color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400', areaResp: 'manutencao' },
  { value: 'pagamento',      label: 'Pagamento',           color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', areaResp: 'financeiro', sub: 'pagamento' },
  { value: 'reembolso',      label: 'Reembolso',           color: 'bg-green-500/15 text-green-700 dark:text-green-400',    areaResp: 'financeiro', sub: 'reembolso' },
  { value: 'reserva_espaco', label: 'Reserva de Espaço',   color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400', areaResp: 'reserva_espaco' },
  { value: 'ti',             label: 'TI',                  color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',       areaResp: 'ti' },
  { value: 'marketing',      label: 'Marketing',           color: 'bg-pink-500/15 text-pink-700 dark:text-pink-400',       areaResp: 'marketing' },
  { value: 'producao',       label: 'Produção de Culto',   color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400', areaResp: 'producao' },
  { value: 'ferias',         label: 'Férias',              color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',       areaResp: 'rh', sub: 'ferias' },
  { value: 'licenca',        label: 'Licença',             color: 'bg-teal-500/15 text-teal-700 dark:text-teal-400',       areaResp: 'rh', sub: 'licenca' },
];

// Dica curta por tipo · ajuda o solicitante a escolher o fluxo certo
// (intencao em linguagem simples · evita confundir Compra/Serviço/Pagamento/Reembolso).
const CATEGORIA_HINT = {
  compras:        'Comprar um produto/material. A logística cota e compra.',
  infraestrutura: 'Pedir um reparo/serviço à manutenção da igreja (goteira, ar-condicionado, elétrica, marcenaria...). Precisa contratar e pagar alguém de fora? Use Pagamento.',
  pagamento:      'Pagar um fornecedor externo (boleto, nota fiscal) ou contratar/pagar um serviço de fora (gráfica, buffet, transporte...). Já gastou do próprio bolso? Use Reembolso.',
  reembolso:      'Você já pagou do próprio bolso e quer o dinheiro de volta.',
  reserva_espaco: 'Reservar um espaço/sala na agenda da igreja.',
  producao:       'Apoio da equipe de Produção: movimentação de material ou configuração de equipamentos (áudio, vídeo, palco, transmissão).',
};

// Áreas do solicitante em 2 níveis: macro -> sub
// Área do solicitante NÃO e' mais escolhida no form (2026-06-01) · o backend
// deriva de quem preenche (usuario_areas/kpi_areas) e grava em area_cliente p/ KPI.

const URGENCIAS = [
  { value: 'baixa', label: 'Baixa', color: 'bg-muted text-muted-foreground' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { value: 'alta', label: 'Alta', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { value: 'critica', label: 'Crítica', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
];

// Cada coluna agrupa os status reais via `match` (o backbone tem 10 status mas o
// board operacional usa 5 colunas). Sem isso, itens em aguardando_aprovacao_financeira/
// em_atendimento/aguardando_entrega/avaliado não caiam em coluna nenhuma e sumiam do board.
// aguardando_aprovacao_origem fica de fora de proposito (vive na aba "Aprovar").
const KANBAN_COLUMNS = [
  { key: 'em_cotacao',     label: 'Em cotação',   icon: ClipboardList, color: 'border-t-cyan-500',    match: ['em_cotacao'] },
  { key: 'pendente',       label: 'Pendente',     icon: Clock,        color: 'border-t-amber-500',   match: ['pendente', 'aguardando_aprovacao_financeira', 'aguardando_ajuste'] },
  { key: 'em_analise',     label: 'Em Análise',   icon: SearchIcon,   color: 'border-t-blue-500',    match: ['em_analise'] },
  { key: 'em_atendimento', label: 'Em Andamento', icon: CheckCircle2, color: 'border-t-green-500',   match: ['aprovado', 'em_atendimento', 'aguardando_entrega'] },
  { key: 'concluido',      label: 'Concluído',    icon: CheckCircle2, color: 'border-t-emerald-600', match: ['concluido', 'avaliado'] },
  { key: 'rejeitado',      label: 'Rejeitado',    icon: XCircle,      color: 'border-t-red-500',     match: ['rejeitado', 'cancelado'] },
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

// Dropzone reutilizavel · comprovante de reembolso, boleto/NF de pagamento,
// proposta de serviço. Estado de drag interno (self-contained).
function DocDropzone({ file, onFile, onClear }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  return (
    <>
      <div
        className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors cursor-pointer
          ${drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}
          ${file ? 'border-green-500 bg-green-500/5' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault(); setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
      >
        {file ? (
          <div className="flex items-center justify-center gap-2">
            <FileText className="h-5 w-5 text-green-600 shrink-0" />
            <span className="text-sm text-green-700 truncate max-w-[220px]">{file.name}</span>
            <button type="button" className="ml-1 text-muted-foreground hover:text-red-500"
              onClick={e => { e.stopPropagation(); onClear(); if (inputRef.current) inputRef.current.value = ''; }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground">PDF, JPG, PNG — até 10 MB</p>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={e => { const f = e.target.files[0]; if (f) onFile(f); }} />
    </>
  );
}

// Toggle "é recorrente" + frequência · pagamento e serviço (aluguel, mensalidade)
function RecorrenteToggle({ form, setForm }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.recorrente}
          onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))}
          className="h-4 w-4 cursor-pointer"
        />
        <span className="text-sm">É recorrente (se repete todo mês/período)</span>
      </label>
      {form.recorrente && (
        <Input
          value={form.recorrencia}
          onChange={e => setForm(f => ({ ...f, recorrencia: e.target.value }))}
          placeholder="Frequência · ex: mensal (todo dia 10), trimestral..."
          className="ml-6"
        />
      )}
    </div>
  );
}

export default function Solicitacoes() {
  const { profile, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  // De qual aba/período a lista carregada pertence · evita renderizar a lista de uma
  // aba enquanto o usuário já está em outra (o "aparece tudo e some" ao trocar de aba).
  const [itemsView, setItemsView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
  const [atenderLayout, setAtenderLayout] = useState('kanban'); // 'kanban' | 'lista'

  // Quem ve a fila "Para Atender": admin/diretor OU responsável cadastrado de
  // alguma área (area_solicitacoes_responsaveis). Fonte de verdade no backend
  // via /meu-papel · colaborador comum so ve "Minhas Solicitações".
  // papel.eh_diretor_origem · habilita aba "Aprovar" (diretor de setor da Spec 001).
  const [papel, setPapel] = useState({ atende: false, admin: false, eh_diretor_origem: false, pendentes_origem: 0, eh_triagem_admin: false, pendentes_triagem: 0 });
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
      if (r) setPapel(r);
    } catch (_) {}
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.meuPapel?.();
        if (alive && r) setPapel(r);
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

  // Form state
  const FORM_INITIAL = {
    titulo: '', descricao: '', justificativa: '',
    categoria: '', urgencia: 'normal', valor_estimado: '',
    eh_urgente: false, justificativa_urgencia: '',
    data_necessaria: '',
    espaco_solicitado: '', data_uso: '', horario_inicio: '', horario_fim: '', qtde_pessoas: '',
    motivo_reembolso: '', data_compra: '',
    forma_pagamento: '', chave_pix: '', banco: '', agencia: '', conta: '', documento_file: null,
    // Compras / Pagamentos / Serviços (campos estruturados compartilhados)
    itens: '', link_referencia: '', favorecido_nome: '', favorecido_documento: '',
    recorrente: false, recorrencia: '',
    // Marketing · intake por DOR · Pedro define entregavel/publico/prazo na triagem
  };
  const [form, setForm] = useState(FORM_INITIAL);
  const [slaDefs, setSlaDefs] = useState([]);
  // Carrega SLAs pra mostrar prazo expected no form
  useEffect(() => {
    api.slaDefs?.().then(setSlaDefs).catch(() => setSlaDefs([]));
  }, []);

  // Marketing · intake por DOR (Redesenho 2026-05-30): o solicitante descreve o
  // problema/objetivo + público; o Pedro tria e define o entregavel depois.
  // (sairam daqui: cascata grupo->tipo, carga de etiquetas e estimativa no form)
  // Área do solicitante · NÃO ha mais seletor (2026-06-01). O backend deriva a
  // área de quem preenche (usuario_areas/kpi_areas) e grava em area_cliente p/ KPI.

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

  async function handleCreate() {
    try {
      setSubmitting(true);
      const payload = { ...form };
      delete payload.documento_file;

      if (payload.valor_estimado) payload.valor_estimado = parseFloat(payload.valor_estimado);
      else delete payload.valor_estimado;

      // Limpa campos opcionais vazios
      if (!payload.data_necessaria) delete payload.data_necessaria;
      if (!payload.data_uso) delete payload.data_uso;
      if (!payload.horario_inicio) delete payload.horario_inicio;
      if (!payload.horario_fim) delete payload.horario_fim;
      if (!payload.qtde_pessoas) delete payload.qtde_pessoas;
      else payload.qtde_pessoas = parseInt(payload.qtde_pessoas, 10);
      if (!payload.justificativa_urgencia) delete payload.justificativa_urgencia;
      if (!payload.espaco_solicitado) delete payload.espaco_solicitado;
      if (!payload.data_compra) delete payload.data_compra;
      if (!payload.motivo_reembolso) delete payload.motivo_reembolso;
      if (!payload.itens) delete payload.itens;
      if (!payload.link_referencia) delete payload.link_referencia;
      if (!payload.favorecido_nome) delete payload.favorecido_nome;
      if (!payload.favorecido_documento) delete payload.favorecido_documento;
      if (!payload.recorrencia) delete payload.recorrencia;
      // Marketing por dor · so título+descrição no intake (Pedro define o resto na triagem)

      // Upload do comprovante para Supabase Storage (bucket: solicitações)
      if (form.documento_file && supabase) {
        const ext = form.documento_file.name.split('.').pop().toLowerCase();
        const path = `comprovantes/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('solicitacoes')
          .upload(path, form.documento_file, { upsert: false });
        if (uploadError) throw new Error('Erro ao enviar comprovante: ' + uploadError.message);
        const { data: { publicUrl } } = supabase.storage.from('solicitacoes').getPublicUrl(path);
        payload.documento_url = publicUrl;
      }

      await api.create(payload);
      toast.success('Solicitação criada com sucesso!');
      setDialogOpen(false);
      setForm(FORM_INITIAL);
      load();
    } catch (e) {
      console.error('[SOLICITACOES] create error:', e);
      toast.error(e.message || 'Erro ao criar solicitação');
    } finally {
      setSubmitting(false);
    }
  }

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

  const showValueField = ['compras', 'reembolso', 'pagamento'].includes(form.categoria);
  const isReembolso = form.categoria === 'reembolso';
  const isReservaEspaco = form.categoria === 'reserva_espaco';
  const isCompras = form.categoria === 'compras';
  const isPagamento = form.categoria === 'pagamento';
  // Reembolso e Pagamento compartilham os campos de destino do dinheiro (PIX/banco)
  const dadosBancariosValid = (forma) => (
    !!forma &&
    (forma !== 'pix' || form.chave_pix.trim()) &&
    (forma !== 'transferencia_bancaria' || (form.banco.trim() && form.agencia.trim() && form.conta.trim()))
  );
  // Reembolso · valor EXATO da nota + data da compra + destino do dinheiro.
  // (o "motivo" saiu · a "Justificativa do pedido" geral já cobre o porquê)
  const reembolsoValid = !isReembolso || (
    !!form.valor_estimado &&
    form.data_compra &&
    dadosBancariosValid(form.forma_pagamento)
  );
  const reservaEspacoValid = !isReservaEspaco || (form.espaco_solicitado.trim() && form.data_uso);
  // Compras · descrição do que se precisa (itens) é o campo-chave
  const comprasValid = !isCompras || form.itens.trim().length >= 3;
  // Pagamento · favorecido + vencimento (data_necessaria) + forma/destino do dinheiro.
  // Boleto não exige PIX/banco (o documento carrega a linha de pagamento).
  const pagamentoValid = !isPagamento || (
    form.favorecido_nome.trim() &&
    form.data_necessaria &&
    form.forma_pagamento &&
    (form.forma_pagamento === 'boleto' || dadosBancariosValid(form.forma_pagamento))
  );
  const urgenciaValid = !form.eh_urgente || form.justificativa_urgencia.trim().length >= 5;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Solicitações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Compras, serviços, pagamentos, reembolsos, reservas, TI, marketing, infraestrutura, férias e licenças</p>
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

          {/* New request — everyone */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Nova Solicitação
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nova Solicitação</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Qual tipo de solicitação? *</Label>
                  <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {CATEGORIA_HINT[form.categoria] && (
                    <p className="text-xs text-muted-foreground">
                      {CATEGORIA_HINT[form.categoria]}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Título da solicitação *</Label>
                  <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Resuma em uma frase" />
                </div>
                <div className="space-y-2">
                  <Label>{isReservaEspaco ? 'Descrição da necessidade (qual evento / finalidade)' : 'Descrição da necessidade'}</Label>
                  <Textarea
                    value={form.descricao}
                    onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                    rows={3}
                    placeholder={isReservaEspaco ? 'Qual evento/atividade vai acontecer e o que precisa no espaço' : undefined}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Justificativa do pedido</Label>
                  <Textarea value={form.justificativa} onChange={e => setForm(f => ({ ...f, justificativa: e.target.value }))} rows={2} />
                </div>

                {/* Urgente checkbox · reduz SLA · pra compras significa "sai pra rua mesmo dia" */}
                <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.eh_urgente}
                      onChange={e => setForm(f => ({ ...f, eh_urgente: e.target.checked }))}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <span className="text-sm font-medium">Esta solicitação é urgente</span>
                  </label>
                  <p className="text-xs text-muted-foreground ml-6">
                    Reduz o prazo. Compras urgentes não passam por cotação · alguém sai pra comprar no mesmo dia.
                    Use só quando necessário · o sistema mapeia quem solicita urgência frequente.
                  </p>
                  {form.eh_urgente && (
                    <div className="ml-6 mt-2">
                      <Label className="text-xs">Justificativa da urgência *</Label>
                      <Textarea
                        value={form.justificativa_urgencia}
                        onChange={e => setForm(f => ({ ...f, justificativa_urgencia: e.target.value }))}
                        rows={2}
                        placeholder="Por que precisa ser urgente?"
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>

                {/* Reserva de Espaco · campos especificos */}
                {form.categoria === 'reserva_espaco' && (
                  <div className="space-y-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                    <p className="text-sm font-semibold text-purple-700 dark:text-purple-400">Detalhes da reserva</p>
                    <div className="space-y-2">
                      <Label className="text-xs">Espaço solicitado *</Label>
                      <Input
                        value={form.espaco_solicitado}
                        onChange={e => setForm(f => ({ ...f, espaco_solicitado: e.target.value }))}
                        placeholder="ex: Auditório principal, Sala Kids, Cozinha"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Data *</Label>
                        <Input type="date" value={form.data_uso} onChange={e => setForm(f => ({ ...f, data_uso: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Início</Label>
                        <Input type="time" value={form.horario_inicio} onChange={e => setForm(f => ({ ...f, horario_inicio: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Fim</Label>
                        <Input type="time" value={form.horario_fim} onChange={e => setForm(f => ({ ...f, horario_fim: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Qtde de pessoas (estimada)</Label>
                      <Input type="number" value={form.qtde_pessoas} onChange={e => setForm(f => ({ ...f, qtde_pessoas: e.target.value }))} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Material ou arrumação específica (opcional)</Label>
                      <Textarea
                        value={form.itens}
                        onChange={e => setForm(f => ({ ...f, itens: e.target.value }))}
                        rows={2}
                        placeholder="Ex: 50 cadeiras em U · som + microfone · projetor · mesa de apoio"
                      />
                    </div>
                  </div>
                )}

                {/* Compras · itens + referência + fornecedor sugerido */}
                {isCompras && (
                  <div className="space-y-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                    <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">Detalhes da compra</p>
                    <div className="space-y-2">
                      <Label className="text-xs">O que comprar (itens + quantidade) *</Label>
                      <Textarea
                        value={form.itens}
                        onChange={e => setForm(f => ({ ...f, itens: e.target.value }))}
                        rows={2}
                        placeholder="Ex: 2 caixas de som JBL · 10 cabos P10 · 1 mesa dobrável"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Link / referência do produto (opcional)</Label>
                      <Input
                        value={form.link_referencia}
                        onChange={e => setForm(f => ({ ...f, link_referencia: e.target.value }))}
                        placeholder="Cole o link do Mercado Livre / site, se tiver"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Fornecedor sugerido (opcional)</Label>
                      <Input
                        value={form.favorecido_nome}
                        onChange={e => setForm(f => ({ ...f, favorecido_nome: e.target.value }))}
                        placeholder="Se já sabe de onde comprar"
                      />
                    </div>
                  </div>
                )}

                {/* Pagamento · favorecido + documento + forma + recorrencia */}
                {isPagamento && (
                  <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Dados do pagamento</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Favorecido (quem recebe) *</Label>
                        <Input
                          value={form.favorecido_nome}
                          onChange={e => setForm(f => ({ ...f, favorecido_nome: e.target.value }))}
                          placeholder="Nome ou razão social"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">CNPJ/CPF (opcional)</Label>
                        <Input
                          value={form.favorecido_documento}
                          onChange={e => setForm(f => ({ ...f, favorecido_documento: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Documento — boleto / nota fiscal / contrato *</Label>
                      <DocDropzone
                        file={form.documento_file}
                        onFile={f => setForm(prev => ({ ...prev, documento_file: f }))}
                        onClear={() => setForm(prev => ({ ...prev, documento_file: null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Forma de pagamento *</Label>
                      <Select value={form.forma_pagamento} onValueChange={v => setForm(f => ({ ...f, forma_pagamento: v, chave_pix: '', banco: '', agencia: '', conta: '' }))}>
                        <SelectTrigger><SelectValue placeholder="Como pagar?" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="boleto">Boleto</SelectItem>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="transferencia_bancaria">Transferência Bancária</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.forma_pagamento === 'pix' && (
                      <div className="space-y-2">
                        <Label className="text-xs">Chave PIX *</Label>
                        <Input value={form.chave_pix} onChange={e => setForm(f => ({ ...f, chave_pix: e.target.value }))} placeholder="CPF, e-mail, telefone ou chave aleatória" />
                      </div>
                    )}
                    {form.forma_pagamento === 'transferencia_bancaria' && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Banco *</Label>
                          <Input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} placeholder="Ex: Banco do Brasil, Nubank..." />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-xs">Agência *</Label>
                            <Input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Conta *</Label>
                            <Input value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} placeholder="00000-0" />
                          </div>
                        </div>
                      </div>
                    )}
                    <RecorrenteToggle form={form} setForm={setForm} />
                  </div>
                )}

                {/* Data necessária · vira "Vencimento" obrigatório pra pagamento */}
                {form.categoria && form.categoria !== 'reserva_espaco' && (
                  <div className="space-y-2">
                    <Label>{isPagamento ? 'Vencimento *' : 'Data necessária (opcional)'}</Label>
                    <Input type="date" value={form.data_necessaria} onChange={e => setForm(f => ({ ...f, data_necessaria: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">
                      {isPagamento
                        ? 'Quando o boleto/nota vence. Priorizamos pra não pagar com atraso.'
                        : 'Se preencher, alertaremos caso o SLA padrão não bata.'}
                    </p>
                  </div>
                )}

                {/* Marketing · intake por DOR (Redesenho 2026-05-30 · só o aviso · Pedro tria) */}
                {form.categoria === 'marketing' && (
                  <div className="rounded-lg border border-pink-500/30 bg-pink-500/5 p-3">
                    <p className="text-sm font-semibold text-pink-700 dark:text-pink-400 mb-1">
                      Demanda de Marketing
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Conte a <strong>necessidade/dor</strong> no título e na descrição acima — o problema, não a peça.
                      A equipe vai avaliar e te devolver o formato e o prazo. Demandas de marketing levam de
                      3 a 8 semanas conforme a complexidade.
                    </p>
                  </div>
                )}

                {/* SLA esperado em tempo real (oculto p/ marketing · usa o aviso de 3-8 sem) */}
                {(() => {
                  const cat = CATEGORIAS.find(c => c.value === form.categoria);
                  if (!cat?.areaResp || form.categoria === 'marketing') return null;
                  const urg = !!form.eh_urgente;
                  const sub = cat.sub || 'default';
                  // Prefere a subcategoria exata · cai pra 'default' · cai pra área
                  const sla = slaDefs.find(s => s.area_responsavel === cat.areaResp && s.subcategoria === sub && s.eh_urgente === urg)
                    || slaDefs.find(s => s.area_responsavel === cat.areaResp && s.subcategoria === 'default' && s.eh_urgente === urg)
                    || slaDefs.find(s => s.area_responsavel === cat.areaResp && s.eh_urgente === urg);
                  if (!sla) return null;
                  return (
                    <div className="rounded-md bg-blue-500/5 border border-blue-500/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                      <strong>Prazo esperado:</strong> resposta em ~{Math.round(sla.sla_resposta_horas/24*10)/10} dias · conclusão em ~{Math.round(sla.sla_resolucao_horas/24*10)/10} dias
                      {form.eh_urgente && ' · modo urgente'}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-4">
                  {showValueField && (
                    <div className="space-y-2">
                      <Label>{isReembolso ? 'Valor (exato da nota) *' : 'Valor estimado (R$)'}</Label>
                      <Input type="number" step="0.01" value={form.valor_estimado} onChange={e => setForm(f => ({ ...f, valor_estimado: e.target.value }))}
                        placeholder={isReembolso ? 'Igual ao da nota fiscal' : undefined} />
                    </div>
                  )}
                </div>
                {isReembolso && (
                  <>
                    <div className="space-y-2">
                      <Label>Data da compra *</Label>
                      <Input type="date" max={new Date().toISOString().slice(0, 10)}
                        value={form.data_compra}
                        onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} />
                    </div>
                    {/* Comprovante — drag and drop */}
                    <div className="space-y-2">
                      <Label>Comprovante / Documento *</Label>
                      <DocDropzone
                        file={form.documento_file}
                        onFile={f => setForm(prev => ({ ...prev, documento_file: f }))}
                        onClear={() => setForm(prev => ({ ...prev, documento_file: null }))}
                      />
                    </div>

                    {/* Forma de pagamento */}
                    <div className="space-y-2">
                      <Label>Forma de pagamento *</Label>
                      <Select value={form.forma_pagamento} onValueChange={v => setForm(f => ({ ...f, forma_pagamento: v, chave_pix: '', banco: '', agencia: '', conta: '' }))}>
                        <SelectTrigger><SelectValue placeholder="Como quer receber?" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="transferencia_bancaria">Transferência Bancária</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {form.forma_pagamento === 'pix' && (
                      <div className="space-y-2">
                        <Label>Chave PIX *</Label>
                        <Input value={form.chave_pix} onChange={e => setForm(f => ({ ...f, chave_pix: e.target.value }))} placeholder="CPF, e-mail, telefone ou chave aleatória" />
                      </div>
                    )}

                    {form.forma_pagamento === 'transferencia_bancaria' && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Banco *</Label>
                          <Input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} placeholder="Ex: Banco do Brasil, Nubank..." />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Agência *</Label>
                            <Input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000" />
                          </div>
                          <div className="space-y-2">
                            <Label>Conta *</Label>
                            <Input value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} placeholder="00000-0" />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleCreate} disabled={!form.titulo || !form.categoria || !reembolsoValid || !reservaEspacoValid || !comprasValid || !pagamentoValid || !urgenciaValid || submitting}>
                    {submitting ? 'Criando...' : 'Criar Solicitação'}
                  </Button>
                </div>
              </div>
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
              <button type="button" onClick={() => setAtenderLayout('kanban')}
                className={`px-3 h-9 text-sm ${atenderLayout === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Kanban</button>
              <button type="button" onClick={() => setAtenderLayout('lista')}
                className={`px-3 h-9 text-sm border-l border-border ${atenderLayout === 'lista' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>Lista</button>
            </div>
          )}
        </div>
      )}

      {/* Content: Kanban so na view 'atender' · Lista de aprovação em 'aprovar' · Lista simples nas demais. */}
      {(loading || !itemsFresh) ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : view === 'aprovar' ? (
        /* ── Aba Aprovar · diretor de origem ── */
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-muted-foreground">Sem solicitações aguardando aprovação.</p>
              <p className="text-sm text-muted-foreground mt-1">Quando alguém do seu setor solicitar algo, aparecerá aqui.</p>
            </Card>
          ) : (
            filtered.map(item => (
              <AprovacaoOrigemCard
                key={item.id}
                item={item}
                onApprove={handleAprovarOrigem}
                onReject={handleRejeitarOrigem}
                onClick={() => setDetailItem(item)}
              />
            ))
          )}
        </div>
      ) : view === 'atender' ? (
        /* ── Kanban Board (managers/admins) ── */
        <>
        <TermometroRefeitas />
        {atenderLayout === 'lista' ? (
          <ListaSolicitacoes items={filtered} onOpen={setDetailItem} profileId={profile?.id}
            emptyMsg="Nenhuma solicitação na fila para os filtros atuais." />
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {columns.map(col => (
            <div
              key={col.key}
              className={`flex flex-col rounded-lg transition-colors ${dragOverCol === col.key ? 'bg-accent/50 ring-2 ring-primary/30' : ''}`}
              onDragOver={e => { if (!isResponsavel) return; e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => {
                e.preventDefault();
                setDragOverCol(null);
                if (!isResponsavel) return;
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
              <div className={`flex items-center gap-2 pb-3 mb-3 border-b-2 ${col.color.replace('border-t-', 'border-b-')}`}>
                <col.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{col.label}</span>
                <Badge variant="secondary" className="ml-auto text-xs">{col.items.length}</Badge>
              </div>
              <ScrollArea className="flex-1 max-h-[calc(100vh-280px)]">
                <div className="space-y-3 pr-1 min-h-[60px]">
                  {col.items.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Nenhuma solicitação</p>
                  )}
                  {col.items.map(item => (
                    <SolicitacaoCard
                      key={item.id}
                      item={item}
                      isAdmin={isResponsavel}
                      onStatusChange={handleStatusChange}
                      onClick={() => setDetailItem(item)}
                      draggable={isResponsavel}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
        )}
        </>
      ) : (
        /* ── Lista simples (minhas) · mesmo componente do modo Lista da fila ── */
        <ListaSolicitacoes items={filtered} onOpen={setDetailItem} profileId={profile?.id}
          emptyMsg="Nenhuma solicitação para os filtros atuais." />
      )}

      {/* Detail dialog */}
      <DetailDialog
        item={detailItem}
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
};

// "SLA estourando" = não pausado/encerrado E prazo ativo vencido ou < 24h pra
// vencer (mesma régua do getSlaBadge, que mostra badge quando < 24h ou atrasado).
function isSlaEstourando(item) {
  const fora = ['concluido', 'avaliado', 'rejeitado', 'cancelado', 'aprovado', 'aguardando_ajuste'].includes(item.status);
  if (fora) return false;
  const ativo = !item.respondido_em ? item.sla_resposta_deadline : item.sla_resolucao_deadline;
  if (!ativo) return false;
  return (new Date(ativo).getTime() - Date.now()) / 3600000 < 24;
}

// Lista plana de solicitações · reusada na aba "Minhas" e no modo Lista da fila
// "Para Atender" (a "Caixa da Área": filtre por área e veja a fila daquela área).
function ListaSolicitacoes({ items, onOpen, profileId, emptyMsg }) {
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
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Badge className={`text-xs shrink-0 ${cat.color}`}>{cat.label}</Badge>
                <p className="text-sm font-medium text-foreground truncate">{item.titulo}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                {item.area_responsavel && (
                  <Badge className="text-xs bg-muted text-muted-foreground hidden sm:inline-flex">{AREA_LABELS[item.area_responsavel] || item.area_responsavel}</Badge>
                )}
                {sla && <Badge className={`text-xs ${sla.color}`}>{sla.label}</Badge>}
                <Badge className={`text-xs ${urg.color}`}>{urg.label}</Badge>
                <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>
            </div>
            {aguardandoOrigem && (
              <p className="text-xs text-violet-700 dark:text-violet-400 mt-2">
                {emTriagem
                  ? <>⏳ Em triagem · definindo o aprovador{item.eh_urgente ? ' · urgente' : ''}</>
                  : <>⏳ Aguardando aprovação de <span className="font-medium">{diretorNome || 'diretor de origem'}</span>{item.eh_urgente ? ' · urgente' : ''}</>}
              </p>
            )}
            {foiRejeitada && item.aprovacao_origem_motivo && (
              <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                <span className="font-medium">Rejeitada:</span> {item.aprovacao_origem_motivo}
              </p>
            )}
            {item.descricao && !aguardandoOrigem && !foiRejeitada && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{item.descricao}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function getSlaBadge(item) {
  // aguardando_ajuste = SLA pausado (com o solicitante) · não mostra contagem.
  const concluido = ['concluido', 'avaliado', 'rejeitado', 'cancelado', 'aprovado', 'aguardando_ajuste'].includes(item.status);
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
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`text-xs ${cat.color}`}>{cat.label}</Badge>
          <Badge className={`text-xs ${urg.color}`}>{urg.label}</Badge>
          {item.eh_urgente && (
            <Badge className="text-xs bg-red-500/15 text-red-700 dark:text-red-400">Urgente</Badge>
          )}
          {item.aprovacao_origem_status === 'triagem' && (
            <Badge className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400">⚠ Triagem · sem setor</Badge>
          )}
          <span className="text-xs text-muted-foreground">aguardando {aguardandoHa}</span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{date}</span>
      </div>
      <p className="text-sm font-semibold text-foreground mb-1">{item.titulo}</p>
      <p className="text-xs text-muted-foreground mb-2">
        por {solicitanteNome}
        {item.area_responsavel && <> · vai pra <span className="font-medium">{item.area_responsavel}</span></>}
        {item.data_necessaria && <> · precisa até {new Date(item.data_necessaria).toLocaleDateString('pt-BR')}</>}
      </p>
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
        <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{solicitante}</span>
        <div className="flex items-center gap-1">
          {mostrarStatus && <Badge className={`text-[10px] px-1.5 py-0.5 ${st.color}`}>{st.label}</Badge>}
          {sla && <Badge className={`text-[10px] px-1.5 py-0.5 ${sla.color}`}>⏱ {sla.label}</Badge>}
          <Badge className={`text-[10px] px-1.5 py-0.5 ${urg.color}`}>{urg.label}</Badge>
        </div>
      </div>
      {aguardandoFin && (
        <div className="mt-2 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
          ⏳ Aguardando aprovação do financeiro
        </div>
      )}
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
                Cole a URL ou o numero do pedido do Mercado Livre
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
                O solicitante e voce passarao a receber atualizacoes automaticas (in-app + WhatsApp se configurado).
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

// Cotação (compras/serviço) · a logística registra valor+fornecedor ANTES do financeiro.
// Marcos (2026-06-16): "primeiro vem a cotação, depois a aprovação do financeiro" · o Yago
// decide sobre o valor real. jaCotado mostra read-only (todos veem · inclusive o Yago) ·
// em_cotacao + canCotar mostra o formulário pra logística registrar.
function CotacaoBlock({ item, canCotar, onChanged }) {
  const emCotacao = item.status === 'em_cotacao';
  const jaCotado = item.valor_cotado != null;
  const [valor, setValor] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [obs, setObs] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fmtBRL = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  async function registrar() {
    const v = Number(valor);
    if (valor === '' || Number.isNaN(v) || v < 0) { toast.error('Informe o valor cotado.'); return; }
    setSubmitting(true);
    try {
      await api.registrarCotacao(item.id, {
        valor_cotado: v,
        fornecedor: fornecedor.trim() || undefined,
        observacao: obs.trim() || undefined,
      });
      toast.success('Cotação registrada · enviada pro financeiro.');
      onChanged?.();
    } catch (e) { toast.error(e.message || 'Erro ao registrar cotação'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <p className="text-sm font-semibold text-foreground">Cotação</p>
      {jaCotado ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Valor cotado</span><p className="font-medium">{fmtBRL(item.valor_cotado)}</p></div>
          {item.cotacao_fornecedor && <div><span className="text-muted-foreground">Fornecedor</span><p className="font-medium">{item.cotacao_fornecedor}</p></div>}
          {item.cotacao_observacao && <div className="col-span-2"><span className="text-muted-foreground">Observação</span><p className="text-sm whitespace-pre-wrap">{item.cotacao_observacao}</p></div>}
        </div>
      ) : emCotacao && canCotar ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Levante o valor com o fornecedor. Ao registrar, segue pro financeiro aprovar.</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Valor cotado (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label className="text-xs">Fornecedor</Label>
              <Input value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="Nome do fornecedor" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Condições, prazo de entrega, link da cotação..." />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={registrar} disabled={submitting}>{submitting ? 'Registrando...' : 'Registrar cotação → financeiro'}</Button>
          </div>
        </div>
      ) : emCotacao ? (
        <p className="text-xs text-muted-foreground">Aguardando a logística registrar a cotação (valor + fornecedor).</p>
      ) : null}
    </div>
  );
}

function DetailDialog({ item, onClose, isAdmin, currentUserId, onStatusChange, onNpsSubmit, onItemRefresh }) {
  const [actionPending, setActionPending] = useState(null); // e.g. 'aprovado', 'rejeitado', 'concluído', 'em_analise'
  const [obsText, setObsText] = useState('');
  const [atenderEstoque, setAtenderEstoque] = useState(false); // ponte estoque (Fase 3a-2)

  if (!item) return null;
  const cat = getCatMeta(item.categoria);
  const urg = getUrgMeta(item.urgencia);

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
    <Dialog open={!!item} onOpenChange={v => { if (!v) { cancelAction(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge className={cat.color}>{cat.label}</Badge>
            {item.titulo}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Solicitante</span>
              <p className="font-medium">{item.solicitante?.name || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Urgência</span>
              <p><Badge className={urg.color}>{urg.label}</Badge></p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-medium capitalize">{item.status?.replace('_', ' ')}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Data</span>
              <p className="font-medium">{new Date(item.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            {item.valor_estimado != null && (
              <div>
                <span className="text-muted-foreground">Valor estimado</span>
                <p className="font-medium">R$ {Number(item.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            {item.responsavel?.name && (
              <div>
                <span className="text-muted-foreground">Responsável</span>
                <p className="font-medium">{item.responsavel.name}</p>
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

          {/* Detalhes da compra */}
          {item.categoria === 'compras' && (item.itens || item.link_referencia || item.favorecido_nome) && (
            <div className="space-y-2 pt-3 border-t border-border">
              <p className="text-sm font-semibold text-foreground">Detalhes da compra</p>
              {item.itens && (
                <div><span className="text-xs text-muted-foreground">Itens</span><p className="text-sm whitespace-pre-wrap">{item.itens}</p></div>
              )}
              {item.favorecido_nome && (
                <div><span className="text-xs text-muted-foreground">Fornecedor sugerido</span><p className="text-sm">{item.favorecido_nome}</p></div>
              )}
              {item.link_referencia && (
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

          {isAdmin && !actionPending && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {item.status === 'pendente' && <Button size="sm" onClick={() => setActionPending('em_analise')}>Analisar</Button>}
              {item.status === 'em_analise' && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setActionPending('aprovado')}>Aprovar</Button>
                  <Button size="sm" variant="destructive" onClick={() => setActionPending('rejeitado')}>Rejeitar</Button>
                </>
              )}
              {item.status === 'aprovado' && <Button size="sm" onClick={() => setActionPending('concluido')}>Concluir</Button>}
              {/* Ponte estoque · só faz sentido em pedidos de material (logística) ativos */}
              {['compras', 'servico', 'infraestrutura', 'outro'].includes(item.categoria)
                && !['concluido', 'cancelado', 'rejeitado', 'avaliado', 'aguardando_aprovacao_origem'].includes(item.status)
                && <Button size="sm" variant="outline" onClick={() => setAtenderEstoque(true)}>Atender pela estoque</Button>}
            </div>
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
                <Label className="text-sm">Observações (opcional)</Label>
                <Textarea
                  value={obsText}
                  onChange={e => setObsText(e.target.value)}
                  placeholder="Adicione observações sobre esta decisão..."
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
      </DialogContent>
    </Dialog>
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
const MOTIVO_LABEL = { descricao: 'Descrição', escopo: 'Escopo', data: 'Data', cancelamento: 'Cancelamento' };

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
    } catch (e) { toast.error(e.message || 'Erro ao atender pela estoque'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Atender pela estoque</DialogTitle></DialogHeader>
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
  const [submitting, setSubmitting] = useState(false);
  const [edit, setEdit] = useState({
    titulo: item.titulo || '', descricao: item.descricao || '',
    justificativa: item.justificativa || '', data_necessaria: item.data_necessaria || '',
  });

  const isSolicitante = item.solicitante_id === currentUserId;
  const emAjuste = item.status === 'aguardando_ajuste';
  const encerrada = ['concluido', 'cancelado', 'rejeitado', 'avaliado'].includes(item.status);
  const podeRelatar = (isSolicitante || isAdmin) && !encerrada && !emAjuste;

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
    setSubmitting(true);
    try {
      await api.reenviar(item.id, {
        titulo: edit.titulo.trim(), descricao: edit.descricao,
        justificativa: edit.justificativa, data_necessaria: edit.data_necessaria || null,
      });
      toast.success('Reenviada · voltou para a fila.');
      onChanged?.();
    } catch (e) { toast.error(e.message || 'Erro ao reenviar'); }
    finally { setSubmitting(false); }
  }

  const ultimoAjuste = [...linha].reverse().find(l => l.tipo === 'ajuste' && l.motivo !== 'cancelamento');

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      {item.vezes_refeita > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Esta solicitação foi ajustada {item.vezes_refeita}× durante o processo.
        </p>
      )}
      {emAjuste && isSolicitante && (
        <div className="space-y-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Ajuste solicitado · corrija e reenvie</p>
          {ultimoAjuste && (
            <p className="text-xs text-muted-foreground">
              Pedido em <span className="font-medium">{MOTIVO_LABEL[ultimoAjuste.motivo]}</span>
              {ultimoAjuste.comentario ? `: ${ultimoAjuste.comentario}` : ''}
            </p>
          )}
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
                        ? `${l.lado === 'responsavel' ? 'Devolução' : 'Ajuste pedido'} · ${MOTIVO_LABEL[l.motivo] || l.motivo}`
                        : getStatusMeta(l.status_novo).label}
                    </span>
                    <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                      {new Date(l.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {l.comentario && <p className="text-muted-foreground">{l.comentario}</p>}
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
