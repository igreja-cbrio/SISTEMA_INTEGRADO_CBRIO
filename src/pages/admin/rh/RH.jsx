import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Pencil, Trash2, Palmtree, X, Save, AlertTriangle, Download, UserPlus, Briefcase, Calendar, Search, Filter, Eye, Edit, MoreVertical, LayoutDashboard, Network, Receipt, Star, Clock, CalendarDays } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { StatisticsCard } from '../../../components/ui/statistics-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { ScrollArea, ScrollBar } from '../../../components/ui/scroll-area';
import { useAuth } from '../../../contexts/AuthContext';
import { rh, permissoes } from '../../../api';
import { exportCSV, exportPDF } from '../../../lib/export';
import { supabase } from '../../../supabaseClient';
import { C, fmtDate, fmtMoney, TIPO_CONTRATO, TIPO_FERIAS, FERIAS_STATUS } from '../../../lib/theme';
import TabAdmissao from './TabAdmissao';
import TabFolha from './TabFolha';
import TabAvaliacoes from './TabAvaliacoes';
import TabExtras from './TabExtras';
import TabFeriasCalendar from './TabFeriasCalendar';

// ── Toast de feedback ───────────────────────────────────────
function Toast({ message, type = 'error', onClose }) {
  if (!message) return null;
  const colors = { error: { bg: '#ef444418', border: '#ef444450', text: '#ef4444' }, success: { bg: '#10b98118', border: '#10b98150', text: '#10b981' }, warning: { bg: '#f59e0b18', border: '#f59e0b50', text: '#f59e0b' } };
  const c = colors[type] || colors.error;
  return (
    <div className="fixed top-5 right-5 z-[9999] flex items-center gap-2.5 rounded-xl border bg-card p-3 pr-4 shadow-lg max-w-[400px]"
      style={{ borderLeft: `4px solid ${c.text}`, borderColor: c.border, animation: 'slideInRight 0.25s ease-out' }}>
      <div className="flex-1 text-[13px] font-medium" style={{ color: c.text }}>{message}</div>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Confirm inline ──────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  if (!message) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="bg-popover rounded-2xl p-7 max-w-[400px] shadow-2xl text-center" style={{ animation: 'cbrio-modal-center-in 0.2s ease-out' }}>
        <AlertTriangle className="w-9 h-9 mx-auto mb-3 text-warning" />
        <div className="text-[15px] font-semibold text-foreground mb-5">{message}</div>
        <div className="flex gap-2.5 justify-center">
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm}>Confirmar</Button>
        </div>
      </div>
    </div>
  );
}

// Legacy compat maps (local uses { c, bg, label } shape)
const STATUS_COLORS = {
  ativo: { c: C.green, bg: C.greenBg, label: 'Ativo' },
  inativo: { c: '#737373', bg: '#73737318', label: 'Inativo' },
  ferias: { c: C.blue, bg: C.blueBg, label: 'Férias' },
  licenca: { c: C.amber, bg: C.amberBg, label: 'Licença' },
};

// ── Shared inline styles (kept for backward compat, gradually migrate to Tailwind) ──
const styles = {
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--cbrio-text2)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: '1px solid var(--cbrio-border)', background: 'var(--cbrio-table-header)' },
  td: { padding: '12px 16px', fontSize: 14, color: 'var(--cbrio-text)', borderBottom: '1px solid var(--cbrio-border)', lineHeight: 1.5 },
  badge: (color, bg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, color, background: bg }),
  card: { background: 'var(--cbrio-card)', borderRadius: 12, border: '1px solid var(--cbrio-border)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', overflow: 'hidden' },
  cardHeader: { padding: 16, borderBottom: '1px solid var(--cbrio-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: 600, color: 'var(--cbrio-text)', lineHeight: 1.5 },
  formGroup: { marginBottom: 14 },
  empty: { textAlign: 'center', padding: 40, color: 'var(--cbrio-text3)', fontSize: 14, lineHeight: 1.5 },
};

// ── Componentes auxiliares ──────────────────────────────────
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-1/2 min-w-[440px] max-w-[600px] bg-popover overflow-y-auto flex flex-col shadow-2xl" style={{ animation: 'slideInRight 0.25s ease-out' }}>
        <div className="sticky top-0 z-10 bg-popover px-6 pt-5 pb-3 border-b border-border flex justify-between items-center">
          <div className="text-lg font-bold text-foreground">{title}</div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="px-6 py-4 flex-1">{children}</div>
        {footer && <div className="px-6 py-3 flex gap-2 justify-end border-t border-border">{footer}</div>}
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div style={styles.formGroup}>
      {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}
      <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props} />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div style={styles.formGroup}>
      {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}
      <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props}>{children}</select>
    </div>
  );
}

function Badge({ status, map }) {
  const s = map[status] || { label: status };
  const color = s.c || s.color || '#737373';
  const bg = s.bg || '#73737318';
  return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ color, background: bg }}>{s.label || status}</span>;
}

// ── TABS ────────────────────────────────────────────────────
const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'colaboradores', label: 'Colaboradores', icon: Users },
  { key: 'admissao', label: 'Admissão', icon: UserPlus },
  { key: 'organograma', label: 'Organograma', icon: Network },
  { key: 'folha', label: 'Folha', icon: Receipt },
  { key: 'avaliacoes', label: 'Avaliações', icon: Star },
  { key: 'treinamentos', label: 'Treinamentos', icon: Briefcase },
  { key: 'ferias', label: 'Férias/Licenças', icon: CalendarDays },
  { key: 'extras', label: 'Extras', icon: Clock },
];

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function RH() {
  const { isDiretor } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [dash, setDash] = useState(null);
  const [funcs, setFuncs] = useState([]);
  const [treinos, setTreinos] = useState([]);
  const [setores, setSetores] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filtros colaboradores
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [busca, setBusca] = useState('');

  // Modais
  const [modalFunc, setModalFunc] = useState(null); // null = fechado, {} = novo, {...} = editar
  const [modalTreino, setModalTreino] = useState(null);
  const [modalFerias, setModalFerias] = useState(null);
  const [modalDetail, setModalDetail] = useState(null);
  const [modalDoc, setModalDoc] = useState(null);

  // Toast & confirmação
  const [toast, setToast] = useState(null); // { message, type }
  const [confirmAction, setConfirmAction] = useState(null); // { message, onConfirm }
  const showToast = (message, type = 'error') => { setToast({ message, type }); setTimeout(() => setToast(null), 4000); };
  const showSuccess = (msg) => showToast(msg, 'success');
  const askConfirm = (message, onConfirm) => setConfirmAction({ message, onConfirm });

  // ── Loaders ──
  const loadDash = useCallback(async () => {
    try { setDash(await rh.dashboard()); } catch (e) { console.error(e); }
  }, []);

  const loadFuncs = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      if (filtroArea) params.area = filtroArea;
      if (busca) params.busca = busca;
      setFuncs(await rh.funcionarios.list(params));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [filtroStatus, filtroArea, busca]);

  const loadTreinos = useCallback(async () => {
    try { setTreinos(await rh.treinamentos.list()); } catch (e) { console.error(e); }
  }, []);

  const loadSetores = useCallback(async () => {
    try {
      const [{ data: setoresData }, { data: areasData }] = await Promise.all([
        supabase.from('setores').select('*').order('nome'),
        supabase.from('areas').select('*').order('nome'),
      ]);
      setSetores(setoresData || []);
      setAreas(areasData || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadDash(); loadFuncs(); loadTreinos(); loadSetores(); }, []);
  useEffect(() => { loadFuncs(); }, [filtroStatus, filtroArea, busca]);

  // ── Handlers ──
  async function saveFuncionario(data) {
    try {
      if (data.id) await rh.funcionarios.update(data.id, data);
      else await rh.funcionarios.create(data);
      setModalFunc(null);
      loadFuncs(); loadDash();
      showSuccess(data.id ? 'Colaborador atualizado!' : 'Colaborador criado!');
    } catch (e) { showToast(e.message); }
  }

  function deleteFuncionario(id) {
    askConfirm('Remover este colaborador?', async () => {
      try { await rh.funcionarios.remove(id); loadFuncs(); loadDash(); setModalDetail(null); showSuccess('Colaborador removido'); }
      catch (e) { showToast(e.message); }
    });
  }

  async function openDetail(id) {
    try { setModalDetail(await rh.funcionarios.get(id)); } catch (e) { showToast(e.message); }
  }

  async function saveTreinamento(data) {
    try {
      if (data.id) await rh.treinamentos.update(data.id, data);
      else await rh.treinamentos.create(data);
      setModalTreino(null); loadTreinos();
      showSuccess('Treinamento salvo!');
    } catch (e) { showToast(e.message); }
  }

  function deleteTreinamento(id) {
    askConfirm('Remover treinamento?', async () => {
      try { await rh.treinamentos.remove(id); loadTreinos(); } catch (e) { showToast(e.message); }
    });
  }

  async function saveFerias(data) {
    try {
      await rh.ferias.create(data.funcionario_id, data);
      setModalFerias(null); loadDash();
      showSuccess('Solicitação registrada!');
    } catch (e) { showToast(e.message); }
  }

  async function aprovarFerias(id, status) {
    try { await rh.ferias.update(id, { status }); loadDash(); } catch (e) { showToast(e.message); }
  }

  async function saveDocumento(funcId, data) {
    try {
      await rh.documentos.create(funcId, data);
      setModalDoc(null);
      openDetail(funcId);
      showSuccess('Documento salvo!');
    } catch (e) { showToast(e.message); }
  }

  function deleteDocumento(docId, funcId) {
    askConfirm('Remover documento?', async () => {
      try { await rh.documentos.remove(docId); openDetail(funcId); } catch (e) { showToast(e.message); }
    });
  }

  // ── Render ──
  return (
    <div className="w-full" style={{ maxWidth: 1600, margin: '0 auto', padding: '0 24px' }}>
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10">
            <Users className="size-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground" style={{ lineHeight: 1.3 }}>
              Recursos Humanos
            </h1>
            <p className="text-xs text-muted-foreground" style={{ marginTop: 2 }}>Colaboradores · Treinamentos · Férias</p>
          </div>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setModalFunc({})}>
          <UserPlus className="w-4 h-4" />
          Novo Colaborador
        </Button>
      </div>

      {error && <div className="text-destructive text-sm mb-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">{error}</div>}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <ScrollArea className="w-full">
          <TabsList className="inline-flex h-auto w-auto bg-transparent p-0 gap-1 border-b border-border rounded-none">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="relative rounded-none border-b-2 border-transparent px-4 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-b-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent"
                >
                  <Icon className="size-3.5 mr-1.5 hidden sm:inline-block" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>

        <TabsContent value="dashboard">
          <DashboardTab dash={dash} onNavigate={setTab} setFiltroStatus={setFiltroStatus} />
        </TabsContent>
        <TabsContent value="colaboradores">
          <FuncionariosTab
            funcs={funcs} loading={loading} busca={busca} setBusca={setBusca}
            filtroStatus={filtroStatus} setFiltroStatus={setFiltroStatus}
            filtroArea={filtroArea} setFiltroArea={setFiltroArea}
            onNew={() => setModalFunc({})} onEdit={(f) => setModalFunc(f)} onDetail={openDetail} onDelete={deleteFuncionario} onImport={() => { loadFuncs(); loadDash(); }}
            showToast={showToast}
          />
        </TabsContent>
        <TabsContent value="admissao"><TabAdmissao /></TabsContent>
        <TabsContent value="organograma"><OrgChartTab funcs={funcs} onDetail={openDetail} /></TabsContent>
        <TabsContent value="folha"><TabFolha /></TabsContent>
        <TabsContent value="avaliacoes"><TabAvaliacoes funcionarios={funcs} /></TabsContent>
        <TabsContent value="treinamentos">
          <TreinamentosTab treinos={treinos} funcs={funcs}
            onNew={() => setModalTreino({})} onEdit={(t) => setModalTreino(t)} onDelete={deleteTreinamento}
            onInscrever={async (treinoId, funcId) => { await rh.treinamentos.inscrever(treinoId, { funcionario_id: funcId }); loadTreinos(); }}
            showToast={showToast}
          />
        </TabsContent>
        <TabsContent value="ferias">
          <TabFeriasCalendar funcs={funcs} onAprovar={aprovarFerias} />
        </TabsContent>
        <TabsContent value="extras">
          <div style={{ minHeight: 200, padding: '4px 0' }}>
            <TabExtras funcionarios={funcs} onRefresh={() => { loadDash(); loadFuncs(); }} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Modais */}
      <FuncionarioFormModal open={!!modalFunc} data={modalFunc} onClose={() => setModalFunc(null)} onSave={saveFuncionario} funcionarios={funcs} setores={setores} areas={areas} />
      <TreinamentoFormModal open={!!modalTreino} data={modalTreino} onClose={() => setModalTreino(null)} onSave={saveTreinamento} />
      
      <FuncionarioDetailPanel
        open={!!modalDetail} data={modalDetail} onClose={() => setModalDetail(null)}
        onEdit={(f) => { setModalDetail(null); setModalFunc(f); }}
        onDelete={deleteFuncionario}
        onNewDoc={(funcId) => setModalDoc({ funcionario_id: funcId })}
        onDeleteDoc={deleteDocumento}
        onSaveInline={async (updated) => {
          await rh.funcionarios.update(modalDetail.id, updated);
          showSuccess('Colaborador atualizado!');
          const refreshed = await rh.funcionarios.get(modalDetail.id);
          setModalDetail(refreshed);
          loadFuncs(); loadDash();
        }}
      />
      <DocumentoFormModal open={!!modalDoc} data={modalDoc} onClose={() => setModalDoc(null)} onSave={saveDocumento} />

      {/* Toast & Confirm */}
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      <ConfirmDialog
        message={confirmAction?.message}
        onConfirm={() => { confirmAction?.onConfirm(); setConfirmAction(null); }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: DASHBOARD
// ═══════════════════════════════════════════════════════════
function DashboardTab({ dash, onNavigate, setFiltroStatus }) {
  if (!dash) return (
    <div className="space-y-4 py-6">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[88px] rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-[200px] rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );

  const goTo = (tabKey, status) => { if (setFiltroStatus) setFiltroStatus(status || ''); if (onNavigate) onNavigate(tabKey); };

  const fmtM = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : '—';

  // Primary KPIs — 4 big cards
  const primaryStats = [
    { title: 'Total Colaboradores', value: dash.total, icon: Users, iconColor: '#3b82f6', onClick: () => goTo('colaboradores') },
    { title: 'Ativos', value: dash.ativos, icon: Users, iconColor: '#10b981', onClick: () => goTo('colaboradores', 'ativo') },
    { title: 'Em Férias / Licença', value: (dash.ferias || 0) + (dash.licenca || 0), icon: CalendarDays, iconColor: '#f59e0b', onClick: () => goTo('ferias'), subtitle: `${dash.ferias || 0} férias · ${dash.licenca || 0} licença` },
    { title: 'Custo Mensal', value: fmtM(dash.custoMensal), icon: Briefcase, iconColor: '#ef4444' },
  ];

  // Secondary KPIs
  const secondaryStats = [
    { title: 'Admissões (12m)', value: dash.admissoesAno ?? 0, icon: UserPlus, iconColor: '#10b981' },
    { title: 'Desligamentos (12m)', value: dash.desligamentosAno ?? 0, icon: Users, iconColor: '#ef4444' },
    { title: 'Inativos', value: dash.inativos, icon: Users, iconColor: '#6b7280', onClick: () => goTo('colaboradores', 'inativo') },
    { title: 'Turnover', value: `${dash.turnover || 0}%`, icon: Briefcase, iconColor: dash.turnover > 15 ? '#ef4444' : '#10b981' },
    { title: 'Admissões Pend.', value: dash.admissoesPendentes ?? 0, icon: UserPlus, iconColor: '#f59e0b' },
    { title: 'Folha Salarial', value: fmtM(dash.totalSalarios), icon: Receipt, iconColor: '#00B39D' },
  ];

  return (
    <div className="space-y-8 pt-4 pb-8">
      {/* Primary KPI Cards — 4 columns, generous size */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Resumo Geral</h3>
        <div className="cbrio-stagger grid gap-5 grid-cols-2 lg:grid-cols-4">
          {primaryStats.map((stat) => (
            <StatisticsCard
              key={stat.title}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              iconColor={stat.iconColor}
              onClick={stat.onClick}
              subtitle={stat.subtitle}
            />
          ))}
        </div>
      </section>

      {/* Secondary metrics — 3 columns on large, never smaller than comfortable */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Métricas Detalhadas</h3>
        <div className="cbrio-stagger grid gap-5 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {secondaryStats.map((stat) => (
            <StatisticsCard
              key={stat.title}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              iconColor={stat.iconColor}
              onClick={stat.onClick}
            />
          ))}
        </div>
      </section>

      {/* Main content — 3 column layout using full width */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Distribuição e Alertas</h3>
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Por tipo de contrato */}
          <Card className="py-0 gap-0 overflow-hidden border-border/50 shadow-sm">
            <CardHeader className="px-5 pt-5 pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">Por Tipo de Contrato</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Distribuição por vínculo</p>
            </CardHeader>
            <CardContent className="px-5 pb-6">
              {Object.entries(dash.porContrato || {}).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum dado</p>
              )}
              {Object.entries(dash.porContrato || {}).map(([tipo, qtd]) => {
                const total = Object.values(dash.porContrato || {}).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((qtd / total) * 100) : 0;
                return (
                  <div key={tipo} className="py-3 border-b border-border/30 last:border-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-foreground font-medium">{TIPO_CONTRATO[tipo] || tipo}</span>
                      <span className="text-sm font-bold text-foreground tabular-nums">{qtd}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Por área — taller */}
          <Card className="py-0 gap-0 overflow-hidden border-border/50 shadow-sm lg:row-span-2">
            <CardHeader className="px-5 pt-5 pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">Por Área</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{Object.keys(dash.porArea || {}).length} áreas com colaboradores</p>
            </CardHeader>
            <CardContent className="px-5 pb-6 max-h-[480px] overflow-y-auto">
              {Object.entries(dash.porArea || {}).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum dado</p>
              )}
              {Object.entries(dash.porArea || {}).sort((a, b) => b[1] - a[1]).map(([area, qtd]) => {
                const total = Object.values(dash.porArea || {}).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((qtd / total) * 100) : 0;
                return (
                  <div key={area} className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground truncate block">{area}</span>
                    </div>
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                      <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-bold text-foreground tabular-nums w-8 text-right shrink-0">{qtd}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Férias próximas */}
          <Card className="py-0 gap-0 overflow-hidden border-border/50 shadow-sm">
            <CardHeader className="px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center size-7 rounded-lg bg-amber-500/10">
                  <CalendarDays className="size-3.5 text-amber-500" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">Férias Próximas</CardTitle>
                  <p className="text-xs text-muted-foreground">Próximos 30 dias</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-6">
              {(dash.feriasProximas || []).length === 0 && (
                <div className="text-center py-8">
                  <CalendarDays className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma férias agendada</p>
                </div>
              )}
              {(dash.feriasProximas || []).map(f => (
                <div key={f.id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {(f.rh_funcionarios?.nome || '?')[0].toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground font-medium">{f.rh_funcionarios?.nome || '—'}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">{fmtDate(f.data_inicio)} → {fmtDate(f.data_fim)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Documentos vencendo */}
          <Card className="py-0 gap-0 overflow-hidden border-border/50 shadow-sm">
            <CardHeader className="px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center size-7 rounded-lg bg-destructive/10">
                  <AlertTriangle className="size-3.5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">Documentos Vencendo</CardTitle>
                  <p className="text-xs text-muted-foreground">Próximos 60 dias</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-6">
              {(dash.docsVencendo || []).length === 0 && (
                <div className="text-center py-8">
                  <AlertTriangle className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum documento vencendo</p>
                </div>
              )}
              {(dash.docsVencendo || []).map(d => (
                <div key={d.id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-foreground block truncate">{d.rh_funcionarios?.nome}</span>
                    <span className="text-xs text-muted-foreground">{d.nome}</span>
                  </div>
                  <span className="text-xs font-semibold text-destructive tabular-nums shrink-0 ml-3">{fmtDate(d.data_expiracao)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: FUNCIONÁRIOS
// ═══════════════════════════════════════════════════════════
function FuncionariosTab({ funcs, loading, busca, setBusca, filtroStatus, setFiltroStatus, filtroArea, setFiltroArea, onNew, onDetail, onDelete, onImport, showToast }) {
  const areas = [...new Set(funcs.map(f => f.area).filter(Boolean))];
  const csvRef = useRef(null);
  const [localError, setLocalError] = useState('');
  const setError = (msg) => { setLocalError(msg); if (showToast) showToast(msg, msg.includes('concluída') ? 'success' : 'warning'); };

  async function handleCSVImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()));
    if (lines.length < 2) { setError('CSV vazio ou inválido'); return; }
    const header = lines[0].map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const map = (name) => header.indexOf(name);
    const iNome = map('nome'); const iCargo = map('cargo'); const iArea = map('area');
    const iEmail = map('email'); const iTel = map('telefone'); const iCpf = map('cpf');
    const iTipo = map('tipo_contrato'); const iAdm = map('data_admissao'); const iSal = map('salario');
    if (iNome < 0) { setError('CSV precisa ter coluna "Nome"'); return; }
    let ok = 0, errs = 0;
    for (let i = 1; i < lines.length; i++) {
      const r = lines[i];
      if (!r[iNome]) continue;
      try {
        await rh.funcionarios.create({
          nome: r[iNome], cargo: r[iCargo] || 'A definir', area: r[iArea] || '',
          email: iEmail >= 0 ? r[iEmail] : '', telefone: iTel >= 0 ? r[iTel] : '',
          cpf: iCpf >= 0 ? r[iCpf] : '', tipo_contrato: iTipo >= 0 ? r[iTipo] || 'clt' : 'clt',
          data_admissao: iAdm >= 0 && r[iAdm] ? r[iAdm] : new Date().toISOString().slice(0, 10),
          salario: iSal >= 0 ? r[iSal] || null : null, status: 'ativo',
        });
        ok++;
      } catch { errs++; }
    }
    setError(`Importação concluída: ${ok} importados, ${errs} erros`);
    if (csvRef.current) csvRef.current.value = '';
    onImport?.();
  }

  return (
    <Card className="py-0 gap-0" style={{ background: 'var(--cbrio-card)', borderColor: 'var(--cbrio-border)' }}>
      <CardHeader className="px-5 pt-5 pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle style={{ color: 'var(--cbrio-text)' }}>Diretório de Colaboradores</CardTitle>
            <CardDescription style={{ color: 'var(--cbrio-text3)' }}>{funcs.length} colaboradores encontrados</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[250px]"
                placeholder="Buscar por nome..."
                value={busca} onChange={e => setBusca(e.target.value)}
              />
            </div>
            <select
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
            >
              <option value="">Todas as áreas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-2 justify-end">
          <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} />
          <Button variant="outline" size="sm" onClick={() => csvRef.current?.click()}>Importar CSV</Button>
          <Button variant="outline" size="sm" onClick={() => {
            const headers = ['Nome', 'Cargo', 'Área', 'Contrato', 'Admissão', 'Status', 'Email'];
            const rows = funcs.map(f => [f.nome, f.cargo, f.area || '', f.tipo_contrato, f.data_admissao || '', f.status, f.email || '']);
            exportPDF('Colaboradores', headers, rows, { subtitle: `${funcs.length} colaboradores` });
          }}>
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="overflow-x-auto rounded-md" style={{ border: `1px solid var(--cbrio-border)` }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Nome</th>
                <th style={styles.th}>Cargo</th>
                <th style={styles.th}>Área</th>
                <th style={styles.th}>Contrato</th>
                <th style={styles.th}>Admissão</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></td></tr>}
              {!loading && funcs.length === 0 && <tr><td colSpan={7}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><Users className="h-5 w-5 text-muted-foreground" /></div><span className="text-sm font-medium text-foreground">Nenhum colaborador encontrado</span><span className="text-xs text-muted-foreground">Tente ajustar os filtros</span></div></td></tr>}
              {funcs.map(f => (
                <tr key={f.id} className="cbrio-row hover:bg-muted/50 transition-colors"
                  onClick={() => onDetail(f.id)}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>
                    <div className="flex items-center gap-3">
                      {f.foto_url ? (
                        <img src={f.foto_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                          {(f.nome || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">{f.nome}</p>
                        {f.email && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{f.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}><span className="text-sm">{f.cargo}</span></td>
                  <td style={styles.td}><span className="text-sm text-muted-foreground">{f.area || '—'}</span></td>
                  <td style={styles.td}><span className="text-sm">{TIPO_CONTRATO[f.tipo_contrato] || f.tipo_contrato}</span></td>
                  <td style={styles.td}><span className="text-sm text-muted-foreground">{fmtDate(f.data_admissao)}</span></td>
                  <td style={styles.td}><Badge status={f.status} map={STATUS_COLORS} /></td>
                  <td style={styles.td}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={e => { e.stopPropagation(); onDelete(f.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: TREINAMENTOS
// ═══════════════════════════════════════════════════════════
// ── Helpers de materiais ──
const TIPO_MATERIAL = {
  material: 'Material', questionario: 'Questionário', video: 'Vídeo',
  apresentacao: 'Apresentação', documento: 'Documento',
};
const MATERIAL_STATUS = {
  pendente: { c: C.amber, bg: C.amberBg, label: 'Pendente' },
  visualizado: { c: C.blue, bg: C.blueBg, label: 'Visualizado' },
  concluido: { c: C.green, bg: C.greenBg, label: 'Concluído' },
};
const FILE_ICONS = { 'application/pdf': '📄', 'application/vnd.ms-powerpoint': '📊', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊' };
const getFileIcon = (mime) => FILE_ICONS[mime] || '📎';

function TreinamentosTab({ treinos, funcs, onNew, onEdit, onDelete, onInscrever, onReload, showToast }) {
  const [inscrevendo, setInscrevendo] = useState(null);
  const [funcSel, setFuncSel] = useState('');
  // Materiais
  const [materiaisPorTreino, setMateriaisPorTreino] = useState({});
  const [expandido, setExpandido] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(null);
  const [matForm, setMatForm] = useState({ titulo: '', tipo: 'material', descricao: '', obrigatorio: false });
  const [matFile, setMatFile] = useState(null);
  const [showEnviar, setShowEnviar] = useState(null); // material_id
  const [enviarSel, setEnviarSel] = useState([]);
  const fileRef = useRef(null);

  async function loadMateriais(treinamentoId) {
    try {
      const data = await rh.materiais.list({ treinamento_id: treinamentoId });
      setMateriaisPorTreino(prev => ({ ...prev, [treinamentoId]: data }));
    } catch (e) { console.error(e); }
  }

  async function toggleExpand(treinoId) {
    if (expandido === treinoId) { setExpandido(null); return; }
    setExpandido(treinoId);
    await loadMateriais(treinoId);
  }

  async function handleUploadMaterial(treinoId) {
    if (!matForm.titulo) { showToast?.('Título é obrigatório'); return; }
    setUploading(true);
    try {
      let arquivo_url = null, arquivo_nome = null, arquivo_tipo = null;
      if (matFile) {
        const ext = matFile.name.split('.').pop();
        const filePath = `treinamentos/${treinoId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from('rh-materiais').upload(filePath, matFile, { upsert: true });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('rh-materiais').getPublicUrl(filePath);
        arquivo_url = publicUrl;
        arquivo_nome = matFile.name;
        arquivo_tipo = matFile.type;
      }
      await rh.materiais.create({
        treinamento_id: treinoId, titulo: matForm.titulo, descricao: matForm.descricao,
        tipo: matForm.tipo, obrigatorio: matForm.obrigatorio,
        arquivo_url, arquivo_nome, arquivo_tipo,
      });
      setShowAddMaterial(null);
      setMatForm({ titulo: '', tipo: 'material', descricao: '', obrigatorio: false });
      setMatFile(null);
      await loadMateriais(treinoId);
    } catch (err) {
      console.error(err);
      showToast?.('Erro ao adicionar material: ' + err.message);
    } finally { setUploading(false); }
  }

  async function handleEnviar(materialId, treinoId) {
    if (!enviarSel.length) return;
    try {
      await rh.materiais.enviar(materialId, { funcionario_ids: enviarSel });
      setShowEnviar(null);
      setEnviarSel([]);
      await loadMateriais(treinoId);
    } catch (e) { showToast?.(e.message); }
  }

  async function handleStatusUpdate(mfId, status, treinoId) {
    try {
      await rh.materiais.atualizarStatus(mfId, { status });
      await loadMateriais(treinoId);
    } catch (e) { showToast?.(e.message); }
  }

  async function handleDeleteMaterial(matId, treinoId) {
    try { await rh.materiais.remove(matId); await loadMateriais(treinoId); }
    catch (e) { showToast?.(e.message); }
  }

  function handleFileDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) setMatFile(file);
  }

  const toggleFuncSel = (id) => {
    setEnviarSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  function gerarCertificado(treino, func) {
    if (!func) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Certificado — ${func.nome}</title>
    <style>
      body { font-family: 'Georgia', serif; max-width: 800px; margin: 60px auto; text-align: center; color: #1a1a1a; }
      .border { border: 3px double #00B39D; padding: 60px 50px; border-radius: 12px; }
      h1 { font-size: 32px; color: #00B39D; margin-bottom: 8px; letter-spacing: 4px; }
      h2 { font-size: 20px; font-weight: 400; color: #666; margin-bottom: 40px; }
      .nome { font-size: 28px; font-weight: 700; color: #1a1a1a; border-bottom: 2px solid #00B39D; display: inline-block; padding-bottom: 8px; margin: 20px 0; }
      .desc { font-size: 16px; color: #444; line-height: 1.8; margin: 24px 0; }
      .treino { font-size: 18px; font-weight: 700; color: #00B39D; }
      .footer { display: flex; justify-content: space-around; margin-top: 60px; }
      .sig { text-align: center; width: 200px; }
      .sig-line { border-top: 1px solid #333; padding-top: 8px; font-size: 13px; }
      @media print { body { margin: 20px; } }
    </style></head><body>
    <div class="border">
      <h1>CERTIFICADO</h1>
      <h2>Igreja Comunidade Batista do Rio de Janeiro — CBRio</h2>
      <p style="font-size:14px;color:#888;">Certificamos que</p>
      <div class="nome">${func.nome}</div>
      <p class="desc">concluiu com êxito o treinamento</p>
      <div class="treino">${treino.titulo}</div>
      ${treino.descricao ? `<p style="font-size:14px;color:#666;margin-top:8px;">${treino.descricao}</p>` : ''}
      <p style="font-size:14px;color:#888;margin-top:16px;">
        Período: ${treino.data_inicio ? new Date(treino.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
        ${treino.data_fim ? ' a ' + new Date(treino.data_fim + 'T12:00:00').toLocaleDateString('pt-BR') : ''}
        ${treino.instrutor ? '<br/>Instrutor(a): ' + treino.instrutor : ''}
      </p>
      <p style="font-size:14px;color:#888;margin-top:24px;">Rio de Janeiro, ${new Date().toLocaleDateString('pt-BR')}</p>
      <div class="footer">
        <div class="sig"><div class="sig-line">Coordenação de RH</div></div>
        <div class="sig"><div class="sig-line">${treino.instrutor || 'Instrutor(a)'}</div></div>
      </div>
    </div>
    </body></html>`);
    w.document.close();
    w.print();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button onClick={onNew}>+ Novo Treinamento</Button>
      </div>

      {treinos.length === 0 && <div style={styles.empty}>Nenhum treinamento cadastrado</div>}

      <div style={{ display: 'grid', gap: 16 }}>
        {treinos.map(t => {
          const materiais = materiaisPorTreino[t.id] || [];
          const isExpanded = expandido === t.id;

          return (
            <div key={t.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <div style={styles.cardTitle}>{t.titulo}</div>
                  <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                    {fmtDate(t.data_inicio)}{t.data_fim ? ` → ${fmtDate(t.data_fim)}` : ''}
                    {t.instrutor && ` • ${t.instrutor}`}
                    {t.obrigatorio && <span style={{ ...styles.badge(C.red, C.redBg), marginLeft: 8 }}>Obrigatório</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="outline" size="sm" onClick={() => onEdit(t)}><Pencil style={{ width: 14, height: 14 }} /></Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(t.id)}><Trash2 style={{ width: 14, height: 14 }} /></Button>
                </div>
              </div>
              {t.descricao && <div style={{ padding: '8px 20px', fontSize: 13, color: C.text2 }}>{t.descricao}</div>}

              {/* Inscritos */}
              <div style={{ padding: '8px 20px 12px' }}>
                {/* Barra de progresso */}
                {(() => {
                  const inscritos = t.rh_treinamentos_funcionarios || [];
                  const total = inscritos.length;
                  const concluidos = inscritos.filter(tf => tf.status === 'concluido').length;
                  const pct = total > 0 ? Math.round(concluidos / total * 100) : 0;
                  return total > 0 ? (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.text2, marginBottom: 4 }}>
                        <span>Progresso: {concluidos}/{total} concluídos</span>
                        <span style={{ fontWeight: 700, color: pct === 100 ? C.green : C.primary }}>{pct}%</span>
                      </div>
                      <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.green : C.primary, borderRadius: 3, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  ) : null;
                })()}
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 6, textTransform: 'uppercase' }}>
                  Inscritos ({(t.rh_treinamentos_funcionarios || []).length})
                </div>
                {(t.rh_treinamentos_funcionarios || []).map(tf => (
                  <div key={tf.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {tf.rh_funcionarios?.foto_url ? (
                        <img src={tf.rh_funcionarios.foto_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                          {(tf.rh_funcionarios?.nome || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <span style={{ fontSize: 13 }}>{tf.rh_funcionarios?.nome || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Badge status={tf.status} map={{
                        inscrito: { c: C.blue, bg: C.blueBg, label: 'Inscrito' },
                        concluido: { c: C.green, bg: C.greenBg, label: 'Concluído' },
                        cancelado: { c: C.red, bg: C.redBg, label: 'Cancelado' },
                      }} />
                      {tf.status === 'concluido' && (
                        <Button variant="ghost" size="xs" className="text-[10px]" onClick={() => gerarCertificado(t, tf.rh_funcionarios)}>
                          Certificado
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {inscrevendo === t.id ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ flex: 1 }} value={funcSel} onChange={e => setFuncSel(e.target.value)}>
                      <option value="">Selecionar colaborador</option>
                      {funcs.filter(f => f.status === 'ativo').map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                    <Button size="sm"
                      onClick={async () => { if (funcSel) { await onInscrever(t.id, funcSel); setInscrevendo(null); setFuncSel(''); } }}>
                      OK
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setInscrevendo(null)}>✕</Button>
                  </div>
                ) : (
                  <Button variant="ghost" className="mt-1.5 text-xs" onClick={() => setInscrevendo(t.id)}>+ Inscrever colaborador</Button>
                )}
              </div>

              {/* Materiais — expandível */}
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                <Button
                  variant="ghost"
                  onClick={() => toggleExpand(t.id)}
                  className="w-full justify-between rounded-none h-auto py-3 px-5"
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📁 Materiais{materiais.length > 0 ? ` (${materiais.length})` : ''}
                  </span>
                  <span style={{ fontSize: 14, color: C.text3, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', display: 'inline-block' }}>▼</span>
                </Button>

                {isExpanded && (
                  <div style={{ padding: '0 20px 16px' }}>
                    {materiais.length === 0 && <div style={{ fontSize: 13, color: C.text3, padding: '8px 0' }}>Nenhum material adicionado</div>}

                    {materiais.map(mat => {
                      const destinatarios = mat.rh_materiais_funcionarios || [];
                      const pendentes = destinatarios.filter(d => d.status === 'pendente');
                      const visualizados = destinatarios.filter(d => d.status === 'visualizado');
                      const concluidos = destinatarios.filter(d => d.status === 'concluido');

                      return (
                        <div key={mat.id} style={{ background: 'var(--cbrio-input-bg)', borderRadius: 10, padding: 16, marginBottom: 12, border: `1px solid ${C.border}` }}>
                          {/* Header do material */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 16 }}>{mat.arquivo_tipo ? getFileIcon(mat.arquivo_tipo) : '📁'}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{mat.titulo}</span>
                                <span style={styles.badge(C.blue, C.blueBg)}>{TIPO_MATERIAL[mat.tipo] || mat.tipo}</span>
                                {mat.obrigatorio && <span style={styles.badge(C.red, C.redBg)}>Obrigatório</span>}
                              </div>
                              {mat.descricao && <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>{mat.descricao}</div>}
                              {mat.arquivo_nome && (
                                <a href={mat.arquivo_url} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize: 12, color: C.primary, textDecoration: 'none', marginTop: 4, display: 'inline-block' }}>
                                  {mat.arquivo_nome} ↗
                                </a>
                              )}
                            </div>
                            <Button variant="ghost" size="sm" style={{ color: C.red }} onClick={() => handleDeleteMaterial(mat.id, t.id)}>
                              <Trash2 style={{ width: 13, height: 13 }} />
                            </Button>
                          </div>

                          {/* Resumo de status */}
                          {destinatarios.length > 0 && (
                            <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: C.amber }}>⏳ {pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: C.blue }}>👁 {visualizados.length} visualizado{visualizados.length !== 1 ? 's' : ''}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>✓ {concluidos.length} concluído{concluidos.length !== 1 ? 's' : ''}</span>
                            </div>
                          )}

                          {/* Lista de destinatários */}
                          {destinatarios.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              {destinatarios.map(d => (
                                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {d.funcionario?.foto_url ? (
                                      <img src={d.funcionario.foto_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                                    ) : (
                                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                                        {(d.funcionario?.nome || '?')[0].toUpperCase()}
                                      </div>
                                    )}
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{d.funcionario?.nome}</div>
                                      <div style={{ fontSize: 11, color: C.text3 }}>{d.funcionario?.cargo}</div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Badge status={d.status} map={MATERIAL_STATUS} />
                                    {d.status === 'pendente' && (
                                      <Button variant="ghost" size="sm" className="text-[10px]"
                                        onClick={() => handleStatusUpdate(d.id, 'concluido', t.id)}>Marcar concluído</Button>
                                    )}
                                    {d.status === 'visualizado' && (
                                      <Button variant="ghost" size="sm" className="text-[10px]"
                                        onClick={() => handleStatusUpdate(d.id, 'concluido', t.id)}>Marcar concluído</Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Enviar para colaboradores */}
                          {showEnviar === mat.id ? (
                            <div style={{ background: C.card, borderRadius: 8, padding: 12, border: `1px solid ${C.border}`, marginTop: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 8, textTransform: 'uppercase' }}>Enviar para colaboradores</div>
                              <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 8 }}>
                                {funcs.filter(f => f.status === 'ativo').map(f => {
                                  const jaEnviado = destinatarios.some(d => d.funcionario?.id === f.id);
                                  return (
                                    <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: jaEnviado ? 'default' : 'pointer', opacity: jaEnviado ? 0.5 : 1 }}>
                                      <input type="checkbox" disabled={jaEnviado} checked={jaEnviado || enviarSel.includes(f.id)} onChange={() => toggleFuncSel(f.id)} />
                                      {f.foto_url ? (
                                        <img src={f.foto_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                                      ) : (
                                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                                          {(f.nome || '?')[0].toUpperCase()}
                                        </div>
                                      )}
                                      <span style={{ fontSize: 13 }}>{f.nome} <span style={{ color: C.text3, fontSize: 11 }}>— {f.cargo}</span></span>
                                    </label>
                                  );
                                })}
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <Button size="sm"
                                  onClick={() => handleEnviar(mat.id, t.id)} disabled={!enviarSel.length}>
                                  Enviar ({enviarSel.length})
                                </Button>
                                <Button variant="ghost" size="sm"
                                  onClick={() => { setShowEnviar(null); setEnviarSel([]); }}>Cancelar</Button>
                                <Button variant="ghost" size="sm" style={{ marginLeft: 'auto' }}
                                  onClick={() => {
                                    const todos = funcs.filter(f => f.status === 'ativo' && !destinatarios.some(d => d.funcionario?.id === f.id)).map(f => f.id);
                                    setEnviarSel(todos);
                                  }}>Selecionar todos</Button>
                              </div>
                            </div>
                          ) : (
                            <Button variant="ghost" className="text-xs mt-1"
                              onClick={() => { setShowEnviar(mat.id); setEnviarSel([]); }}>
                              + Enviar para colaboradores
                            </Button>
                          )}
                        </div>
                      );
                    })}

                    {/* Adicionar Material */}
                    {showAddMaterial === t.id ? (
                      <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px dashed ${C.primary}` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Novo Material</div>
                        <div style={styles.formRow}>
                          <Input label="Título *" value={matForm.titulo} onChange={e => setMatForm(f => ({ ...f, titulo: e.target.value }))} />
                          <div style={styles.formGroup}>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Tipo</label>
                            <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={matForm.tipo} onChange={e => setMatForm(f => ({ ...f, tipo: e.target.value }))}>
                              {Object.entries(TIPO_MATERIAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={styles.formGroup}>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Descrição</label>
                          <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 50, resize: 'vertical' }} value={matForm.descricao} onChange={e => setMatForm(f => ({ ...f, descricao: e.target.value }))} />
                        </div>
                        <div style={styles.formGroup}>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-2">
                            <input type="checkbox" checked={matForm.obrigatorio} onChange={e => setMatForm(f => ({ ...f, obrigatorio: e.target.checked }))} />
                            Obrigatório
                          </label>
                        </div>

                        {/* Upload de arquivo — drag & drop */}
                        <div style={styles.formGroup}>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Arquivo (PDF, PPT, etc.)</label>
                          <div
                            onDragOver={e => e.preventDefault()}
                            onDrop={handleFileDrop}
                            onClick={() => fileRef.current?.click()}
                            style={{
                              border: `2px dashed ${C.border}`, borderRadius: 10, padding: 16, textAlign: 'center',
                              cursor: 'pointer', transition: 'border-color 0.2s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = C.primary}
                            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                          >
                            <input ref={fileRef} type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.mp4" style={{ display: 'none' }}
                              onChange={e => { setMatFile(e.target.files?.[0] || null); }} />
                            {matFile ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                                <span style={{ fontSize: 22 }}>{getFileIcon(matFile.type)}</span>
                                <div style={{ textAlign: 'left' }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{matFile.name}</div>
                                  <div style={{ fontSize: 11, color: C.text3 }}>{(matFile.size / 1024 / 1024).toFixed(1)} MB</div>
                                </div>
                                <Button variant="ghost" type="button" onClick={e => { e.stopPropagation(); setMatFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                                  style={{ color: C.red }} className="text-sm">✕</Button>
                              </div>
                            ) : (
                              <>
                                <div style={{ fontSize: 24, marginBottom: 4 }}>📁</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Arraste um arquivo aqui</div>
                                <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>ou clique para selecionar — PDF, PPT, DOC, XLS, imagens</div>
                              </>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <Button onClick={() => handleUploadMaterial(t.id)} disabled={uploading}>
                            {uploading ? 'Enviando...' : 'Adicionar Material'}
                          </Button>
                          <Button variant="ghost" onClick={() => { setShowAddMaterial(null); setMatFile(null); setMatForm({ titulo: '', tipo: 'material', descricao: '', obrigatorio: false }); }}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="outline" className="text-xs mt-1"
                        onClick={() => setShowAddMaterial(t.id)}>
                        + Adicionar Material
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: FÉRIAS/LICENÇAS
// ═══════════════════════════════════════════════════════════
function FeriasTab({ funcs, onNew, onAprovar }) {
  const [ferias, setFerias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroDe, setFiltroDe] = useState('');
  const [filtroAte, setFiltroAte] = useState('');
  const [filtroFunc, setFiltroFunc] = useState('');

  const areas = [...new Set((funcs || []).map(f => f.area).filter(Boolean))];

  const loadFerias = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      if (filtroArea) params.area = filtroArea;
      if (filtroDe) params.data_de = filtroDe;
      if (filtroAte) params.data_ate = filtroAte;
      if (filtroFunc) params.funcionario_id = filtroFunc;
      setFerias(await rh.ferias.list(Object.keys(params).length ? params : undefined) || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filtroStatus, filtroArea, filtroDe, filtroAte, filtroFunc]);

  useEffect(() => { loadFerias(); }, [loadFerias]);

  async function handleAprovar(id, status) {
    await onAprovar(id, status);
    loadFerias();
  }

  return (
    <>
      <div style={styles.filterRow}>
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="aprovado">Aprovado</option>
          <option value="rejeitado">Rejeitado</option>
        </select>
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroArea} onChange={e => setFiltroArea(e.target.value)}>
          <option value="">Todas as áreas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroFunc} onChange={e => setFiltroFunc(e.target.value)}>
          <option value="">Todos os colaboradores</option>
          {(funcs || []).filter(f => f.status === 'ativo').map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ maxWidth: 140 }} type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} placeholder="De" title="Data início de" />
        <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ maxWidth: 140 }} type="date" value={filtroAte} onChange={e => setFiltroAte(e.target.value)} placeholder="Até" title="Data início até" />
        {(filtroStatus || filtroArea || filtroDe || filtroAte || filtroFunc) && (
          <Button variant="ghost" size="sm" onClick={() => { setFiltroStatus(''); setFiltroArea(''); setFiltroDe(''); setFiltroAte(''); setFiltroFunc(''); }}>✕ Limpar</Button>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <Button onClick={onNew}>+ Nova Solicitação</Button>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitle}>Férias e Licenças ({ferias.length})</div>
          <Button variant="ghost" size="sm" onClick={loadFerias}>🔄</Button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Colaborador</th>
                <th style={styles.th}>Tipo</th>
                <th style={styles.th}>Início</th>
                <th style={styles.th}>Fim</th>
                <th style={styles.th}>Dias</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Obs.</th>
                <th style={styles.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></td></tr>}
              {!loading && ferias.length === 0 && <tr><td colSpan={8}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhuma solicitação</span><span className="text-xs text-muted-foreground">Tente ajustar os filtros</span></div></td></tr>}
              {ferias.map(f => {
                const dias = f.data_inicio && f.data_fim ? Math.ceil((new Date(f.data_fim) - new Date(f.data_inicio)) / 86400000) : '—';
                return (
                  <tr key={f.id}>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {f.rh_funcionarios?.foto_url ? (
                          <img src={f.rh_funcionarios.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#00B39D18', color: '#00B39D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                            {(f.rh_funcionarios?.nome || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>{f.rh_funcionarios?.nome}</div>
                          <div style={{ fontSize: 12, color: C.text3 }}>{f.rh_funcionarios?.cargo}</div>
                        </div>
                      </div>
                    </td>
                    <td style={styles.td}>{TIPO_FERIAS[f.tipo] || f.tipo}</td>
                    <td style={styles.td}>{fmtDate(f.data_inicio)}</td>
                    <td style={styles.td}>{fmtDate(f.data_fim)}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{dias}</td>
                    <td style={styles.td}><Badge status={f.status} map={FERIAS_STATUS} /></td>
                    <td style={{ ...styles.td, fontSize: 12, color: C.text3, maxWidth: 150 }}>{f.observacoes || '—'}</td>
                    <td style={styles.td}>
                      {f.status === 'pendente' && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button size="sm" onClick={() => handleAprovar(f.id, 'aprovado')}>✓</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleAprovar(f.id, 'rejeitado')}>✕</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: ORGANOGRAMA (visual flowchart)
// ═══════════════════════════════════════════════════════════
function OrgChartTab({ funcs, onDetail }) {
  const ativos = funcs.filter(f => f.status === 'ativo');
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(z => Math.max(0.3, Math.min(2, z + delta)));
  }

  function handleMouseDown(e) {
    if (e.target.closest('[data-orgcard]')) return; // don't drag when clicking cards
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }

  function handleMouseMove(e) {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  }

  function handleMouseUp() { setDragging(false); }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  function getChildren(gestorId) {
    return ativos.filter(f => (f.gestor_id || null) === gestorId).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  // Card do colaborador
  function OrgCard({ func, highlight }) {
    return (
      <div
        data-orgcard
        onClick={() => onDetail(func.id)}
        style={{
          background: 'var(--cbrio-card)', border: `2px solid ${highlight ? C.primary : C.border}`,
          borderRadius: 12, padding: '14px 20px', textAlign: 'center', cursor: 'pointer',
          minWidth: 140, maxWidth: 200, transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)'; e.currentTarget.style.borderColor = C.primary; }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; e.currentTarget.style.borderColor = highlight ? C.primary : C.border; }}
      >
        {func.foto_url ? (
          <img src={func.foto_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 8px', display: 'block', border: `2px solid ${C.primary}` }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, margin: '0 auto 8px' }}>
            {func.nome[0].toUpperCase()}
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{func.cargo || func.area || '—'}</div>
        <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{func.nome}</div>
      </div>
    );
  }

  // Nó recursivo da árvore visual
  function OrgTreeNode({ func }) {
    const children = getChildren(func.id);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <OrgCard func={func} highlight={children.length > 0} />
        {children.length > 0 && (
          <>
            {/* Linha vertical descendo do pai */}
            <div style={{ width: 2, height: 24, background: C.primary, opacity: 0.4 }} />
            {/* Container dos filhos */}
            <div style={{ position: 'relative', display: 'flex', gap: 16, justifyContent: 'center' }}>
              {/* Linha horizontal conectando filhos */}
              {children.length > 1 && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: `calc(100% - 140px)`, height: 2, background: C.primary, opacity: 0.4,
                }} />
              )}
              {children.map(child => (
                <div key={child.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* Linha vertical subindo para conectar */}
                  <div style={{ width: 2, height: 24, background: C.primary, opacity: 0.4 }} />
                  <OrgTreeNode func={child} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const roots = getChildren(null);
  const comGestor = ativos.filter(f => f.gestor_id).length;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.text2 }}>
          {ativos.length} colaboradores · {comGestor} com gestor definido
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="outline" size="icon-xs" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}>−</Button>
          <span style={{ fontSize: 12, color: C.text3, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="icon-xs" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>+</Button>
          <Button variant="ghost" size="xs" onClick={() => { setZoom(0.85); setPan({ x: 0, y: 0 }); }}>Reset</Button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 8 }}>Scroll para zoom · Arraste para mover · Clique no card para detalhes</div>
      {roots.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏢</div>
          Defina o campo "Gestor Direto" em cada colaborador para montar o organograma.
        </div>
      ) : (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            overflow: 'hidden', borderRadius: 12, border: `1px solid ${C.border}`,
            background: 'var(--cbrio-input-bg)', cursor: dragging ? 'grabbing' : 'grab',
            height: 'calc(100vh - 280px)', minHeight: 400, position: 'relative',
          }}
        >
          <div style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'top center',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            minWidth: 'max-content', padding: '40px 60px 80px',
            transition: dragging ? 'none' : 'transform 0.1s ease-out',
          }}>
            {roots.map(r => <OrgTreeNode key={r.id} func={r} />)}
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// MODAIS
// ═══════════════════════════════════════════════════════════

function FuncionarioFormModal({ open, data, onClose, onSave, funcionarios = [], setores = [], areas = [] }) {
  const [f, setF] = useState({});
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef(null);
  useEffect(() => { if (data) setF({ ...data }); }, [data]);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function uploadFoto(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setUploadError('Selecione um arquivo de imagem (JPG, PNG, etc.)'); return; }
    if (file.size > 5 * 1024 * 1024) { setUploadError('A imagem deve ter no máximo 5MB'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `colaboradores/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('rh-fotos').upload(filePath, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('rh-fotos').getPublicUrl(filePath);
      upd('foto_url', publicUrl);
    } catch (err) {
      console.error('Erro upload:', err);
      setUploadError('Erro ao enviar foto. Tente novamente.');
    } finally { setUploading(false); }
  }

  function handleDrop(e) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFoto(file);
  }

  return (
    <Modal open={open} onClose={onClose}
      title={f?.id ? 'Editar Colaborador' : 'Novo Colaborador'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button className="text-sm px-8 py-2.5" onClick={() => onSave(f)} disabled={uploading}>
          {uploading ? 'Enviando foto...' : f?.id ? '💾 Salvar Alterações' : '✅ Admitir Colaborador'}
        </Button>
      </>}>
      <Input label="Nome *" value={f.nome || ''} onChange={e => upd('nome', e.target.value)} />
      <div style={styles.formRow}>
        <Input label="CPF" value={f.cpf || ''} onChange={e => upd('cpf', e.target.value)} />
        <Input label="Email" type="email" value={f.email || ''} onChange={e => upd('email', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Input label="Telefone" value={f.telefone || ''} onChange={e => upd('telefone', e.target.value)} />
        <Select label="Setor" value={f.setor_id || ''} onChange={e => {
          const id = e.target.value ? parseInt(e.target.value) : null;
          setF(p => ({ ...p, setor_id: id, area: '' }));
        }}>
          <option value="">Selecione o setor</option>
          {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </Select>
      </div>
      <div style={styles.formRow}>
        <Select label="Área" value={f.area || ''} onChange={e => upd('area', e.target.value)}>
          <option value="">Selecione a área</option>
          {(f.setor_id ? areas.filter(a => a.setor_id === f.setor_id) : areas).map(a => (
            <option key={a.id} value={a.nome}>{a.nome}</option>
          ))}
        </Select>
      </div>
      <div style={styles.formRow}>
        <Input label="Cargo *" value={f.cargo || ''} onChange={e => upd('cargo', e.target.value)} />
        <Select label="Tipo de Contrato" value={f.tipo_contrato || 'clt'} onChange={e => upd('tipo_contrato', e.target.value)}>
          {Object.entries(TIPO_CONTRATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <div style={styles.formRow}>
        <Input label="Data Admissão *" type="date" value={f.data_admissao || ''} onChange={e => upd('data_admissao', e.target.value)} />
        <Input label="Salário (R$)" type="number" value={f.salario || ''} onChange={e => upd('salario', e.target.value)} />
      </div>
      <Select label="Gestor Direto" value={f.gestor_id || ''} onChange={e => upd('gestor_id', e.target.value || null)}>
        <option value="">Nenhum (nível máximo)</option>
        {funcionarios.filter(fn => fn.id !== f.id && fn.status === 'ativo').map(fn => <option key={fn.id} value={fn.id}>{fn.nome} — {fn.cargo}</option>)}
      </Select>
      {f.id && (
        <div style={styles.formRow}>
          <Select label="Status" value={f.status || 'ativo'} onChange={e => upd('status', e.target.value)}>
            {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Input label="Data Demissão" type="date" value={f.data_demissao || ''} onChange={e => upd('data_demissao', e.target.value)} />
        </div>
      )}
      {/* Foto — upload + drag & drop */}
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Foto do Colaborador</label>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? C.primary : '#444'}`,
            borderRadius: 12, padding: 20, textAlign: 'center',
            cursor: uploading ? 'wait' : 'pointer',
            background: dragging ? `${C.primary}10` : 'transparent',
            transition: 'all 0.2s',
          }}
        >
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { uploadFoto(e.target.files?.[0]); e.target.value = ''; }} />
          {f.foto_url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
              <img src={f.foto_url} alt="Foto" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${C.primary}` }}
                onError={e => { e.target.style.display = 'none'; }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>Foto enviada</div>
                <div style={{ color: C.text2, fontSize: 12, marginTop: 4 }}>Clique ou arraste para trocar</div>
                <button type="button" onClick={e => { e.stopPropagation(); upd('foto_url', ''); }}
                  style={{ marginTop: 6, background: 'transparent', border: `1px solid #ef4444`, color: '#ef4444', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Remover
                </button>
              </div>
            </div>
          ) : (
            <div>
              {uploading ? (
                <div style={{ color: C.primary, fontSize: 14, fontWeight: 600 }}>Enviando...</div>
              ) : (
                <>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                  <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>Arraste uma foto aqui</div>
                  <div style={{ color: C.text2, fontSize: 12, marginTop: 4 }}>ou clique para selecionar — JPG, PNG — máx. 5MB</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Observações</label>
        <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 60, resize: 'vertical' }} value={f.observacoes || ''} onChange={e => upd('observacoes', e.target.value)} />
      </div>
    </Modal>
  );
}

function TreinamentoFormModal({ open, data, onClose, onSave }) {
  const [f, setF] = useState({});
  useEffect(() => { if (data) setF({ ...data }); }, [data]);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <Modal open={open} onClose={onClose}
      title={f?.id ? 'Editar Treinamento' : 'Novo Treinamento'}
      footer={<Button onClick={() => onSave(f)}>Salvar</Button>}>
      <Input label="Título *" value={f.titulo || ''} onChange={e => upd('titulo', e.target.value)} />
      <div style={styles.formRow}>
        <Input label="Data Início *" type="date" value={f.data_inicio || ''} onChange={e => upd('data_inicio', e.target.value)} />
        <Input label="Data Fim" type="date" value={f.data_fim || ''} onChange={e => upd('data_fim', e.target.value)} />
      </div>
      <Input label="Instrutor" value={f.instrutor || ''} onChange={e => upd('instrutor', e.target.value)} />
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-2">
          <input type="checkbox" checked={f.obrigatorio || false} onChange={e => upd('obrigatorio', e.target.checked)} />
          Obrigatório
        </label>
      </div>
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Descrição</label>
        <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 60, resize: 'vertical' }} value={f.descricao || ''} onChange={e => upd('descricao', e.target.value)} />
      </div>
    </Modal>
  );
}

function FeriasFormModal({ open, funcs, onClose, onSave }) {
  const [f, setF] = useState({ tipo: 'ferias' });
  useEffect(() => { if (open) setF({ tipo: 'ferias' }); }, [open]);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title="Nova Solicitação de Férias/Licença"
      footer={<Button onClick={() => onSave(f)}>Solicitar</Button>}>
      <Select label="Colaborador *" value={f.funcionario_id || ''} onChange={e => upd('funcionario_id', e.target.value)}>
        <option value="">Selecionar</option>
        {(funcs || []).filter(fn => fn.status === 'ativo').map(fn => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}
      </Select>
      <Select label="Tipo *" value={f.tipo} onChange={e => upd('tipo', e.target.value)}>
        {Object.entries(TIPO_FERIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      <div style={styles.formRow}>
        <Input label="Data Início *" type="date" value={f.data_inicio || ''} onChange={e => upd('data_inicio', e.target.value)} />
        <Input label="Data Fim *" type="date" value={f.data_fim || ''} onChange={e => upd('data_fim', e.target.value)} />
      </div>
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Observações</label>
        <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 60, resize: 'vertical' }} value={f.observacoes || ''} onChange={e => upd('observacoes', e.target.value)} />
      </div>
    </Modal>
  );
}

// ── Benefícios e Documentos sections ──
const BENEFICIOS_FIELDS = [
  { key: 'complemento_salario', label: 'Complemento Salário' },
  { key: 'alimentacao', label: 'Alimentação' },
  { key: 'transporte', label: 'Transporte' },
  { key: 'saude', label: 'Saúde' },
  { key: 'seguro_vida', label: 'Seguro de Vida' },
  { key: 'educacao', label: 'Educação' },
  { key: 'saldo_livre', label: 'Saldo Livre' },
  { key: 'plano_saude', label: 'Plano de Saúde' },
  { key: 'gratificacao', label: 'Gratificação' },
  { key: 'adicional_nivel', label: 'Adicional de Nível' },
  { key: 'participacao_comite', label: 'Comitê Estratégico' },
  { key: 'veiculo', label: 'Veículo' },
  { key: 'adicional_pastores', label: 'Adicional Pastores' },
  { key: 'adicional_lideranca', label: 'Adicional Liderança' },
  { key: 'adicional_pulpito', label: 'Adicional Púlpito' },
];

const DESCONTOS_FIELDS = [
  { key: 'fgts', label: 'FGTS' },
  { key: 'ir', label: 'IR' },
  { key: 'inss', label: 'INSS' },
];

const TOTAIS_FIELDS = [
  { key: 'remuneracao_bruta', label: 'Remuneração Bruta' },
  { key: 'remuneracao_liquida', label: 'Remuneração Líquida' },
  { key: 'custo_total_mensal', label: 'Custo Total Mensal' },
];

const BONUS_FIELDS = [
  { key: 'bonus_anual_50', label: 'Bônus Anual 50%' },
  { key: 'bonus_anual_integral', label: 'Bônus Anual Integral' },
  { key: 'ferias_integral', label: 'Férias Integral' },
];

function BeneficiosSection({ data, onSave }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const activeBenefits = BENEFICIOS_FIELDS.filter(b => Number(data[b.key]) > 0);
  const isPJ = data.tipo_contrato === 'pj';
  const remLiquida = isPJ ? data.salario : data.remuneracao_liquida;

  function startEdit() {
    const f = {};
    [...BENEFICIOS_FIELDS, ...DESCONTOS_FIELDS, ...TOTAIS_FIELDS, ...BONUS_FIELDS].forEach(b => {
      f[b.key] = data[b.key] || '';
    });
    f.salario = data.salario || '';
    setForm(f);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    const updates = {};
    Object.entries(form).forEach(([k, v]) => { updates[k] = v === '' ? 0 : Number(v); });
    try { await onSave(updates); setEditing(false); } catch { }
    setSaving(false);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase' }}>💰 Benefícios e Remuneração ({activeBenefits.length}) {isPJ && <span style={{ color: C.amber, fontSize: 10 }}>• PJ</span>}</span>
        <span style={{ fontSize: 12, color: C.text3, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : '' }}>▼</span>
      </button>
      {expanded && (
        <div style={{ background: 'var(--cbrio-input-bg)', borderRadius: 10, padding: 16 }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            {!editing ? (
              <Button variant="outline" size="xs" className="gap-1.5" onClick={startEdit}>
                <Pencil className="h-3 w-3" />Editar Benefícios
              </Button>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant="ghost" size="xs" onClick={() => setEditing(false)}>Cancelar</Button>
                <Button size="xs" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            )}
          </div>

          {isPJ && (
            <div style={{ padding: '8px 12px', background: '#f59e0b18', borderRadius: 8, marginBottom: 12, fontSize: 12, color: C.amber, border: '1px solid #f59e0b30' }}>
              Vínculo PJ — sem descontos de FGTS, IR e INSS. Remuneração líquida = salário base.
            </div>
          )}

          {/* Modo de edição */}
          {editing ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 6, textTransform: 'uppercase' }}>Salário Base</div>
              <input type="number" step="0.01" value={form.salario} onChange={e => setForm(f => ({ ...f, salario: e.target.value }))}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ marginBottom: 12, maxWidth: 220 }} placeholder="R$" />

              <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 6, textTransform: 'uppercase' }}>Benefícios</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 12 }}>
                {BENEFICIOS_FIELDS.map(b => (
                  <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 11, color: C.text2, width: 120, flexShrink: 0 }}>{b.label}</label>
                    <input type="number" step="0.01" value={form[b.key]} onChange={e => setForm(f => ({ ...f, [b.key]: e.target.value }))}
                      className="flex h-7 w-full rounded-lg border border-input bg-background px-2 py-1 text-xs shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="0" />
                  </div>
                ))}
              </div>

              {!isPJ && (<>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 6, textTransform: 'uppercase' }}>Descontos (CLT)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 12px', marginBottom: 12 }}>
                  {DESCONTOS_FIELDS.map(b => (
                    <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: 11, color: C.text2, width: 40, flexShrink: 0 }}>{b.label}</label>
                      <input type="number" step="0.01" value={form[b.key]} onChange={e => setForm(f => ({ ...f, [b.key]: e.target.value }))}
                        className="flex h-7 w-full rounded-lg border border-input bg-background px-2 py-1 text-xs shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="0" />
                    </div>
                  ))}
                </div>
              </>)}

              <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 6, textTransform: 'uppercase' }}>Totais</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 12 }}>
                {TOTAIS_FIELDS.map(b => (
                  <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 11, color: C.text2, width: 120, flexShrink: 0 }}>{b.label}</label>
                    <input type="number" step="0.01" value={form[b.key]} onChange={e => setForm(f => ({ ...f, [b.key]: e.target.value }))}
                      className="flex h-7 w-full rounded-lg border border-input bg-background px-2 py-1 text-xs shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="0" />
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 6, textTransform: 'uppercase' }}>Provisões Anuais</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                {BONUS_FIELDS.map(b => (
                  <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 11, color: C.text2, width: 120, flexShrink: 0 }}>{b.label}</label>
                    <input type="number" step="0.01" value={form[b.key]} onChange={e => setForm(f => ({ ...f, [b.key]: e.target.value }))}
                      className="flex h-7 w-full rounded-lg border border-input bg-background px-2 py-1 text-xs shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="0" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Resumo financeiro */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
                {[
                  { label: 'Salário Base', value: data.salario, color: C.primary },
                  ...(!isPJ ? [{ label: 'Rem. Bruta', value: data.remuneracao_bruta, color: C.blue }] : []),
                  { label: 'Rem. Líquida', value: remLiquida, color: C.green },
                  { label: 'Custo Total', value: isPJ ? data.salario : data.custo_total_mensal, color: C.amber },
                ].map(item => (
                  <div key={item.label} style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, borderLeft: `3px solid ${item.color}` }}>
                    <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmtMoney(item.value)}</div>
                  </div>
                ))}
              </div>

              {activeBenefits.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                  {activeBenefits.map(b => (
                    <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 12, color: C.text2 }}>{b.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fmtMoney(data[b.key])}</span>
                    </div>
                  ))}
                </div>
              )}

              {!isPJ && (Number(data.fgts) > 0 || Number(data.ir) > 0 || Number(data.inss) > 0) && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4 }}>Descontos</div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {Number(data.fgts) > 0 && <span style={{ fontSize: 12, color: C.red }}>FGTS: {fmtMoney(data.fgts)}</span>}
                    {Number(data.ir) > 0 && <span style={{ fontSize: 12, color: C.red }}>IR: {fmtMoney(data.ir)}</span>}
                    {Number(data.inss) > 0 && <span style={{ fontSize: 12, color: C.red }}>INSS: {fmtMoney(data.inss)}</span>}
                  </div>
                </div>
              )}

              {(Number(data.bonus_anual_50) > 0 || Number(data.bonus_anual_integral) > 0 || Number(data.ferias_integral) > 0) && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4 }}>Provisões Anuais</div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {Number(data.bonus_anual_50) > 0 && <span style={{ fontSize: 12, color: C.text }}>Bônus 50%: {fmtMoney(data.bonus_anual_50)}</span>}
                    {Number(data.bonus_anual_integral) > 0 && <span style={{ fontSize: 12, color: C.text }}>Bônus Integral: {fmtMoney(data.bonus_anual_integral)}</span>}
                    {Number(data.ferias_integral) > 0 && <span style={{ fontSize: 12, color: C.text }}>Férias: {fmtMoney(data.ferias_integral)}</span>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const DOCS_OBRIGATORIOS = {
  clt: [
    { tipo: 'contrato', label: 'Contrato de Trabalho' },
    { tipo: 'rg', label: 'RG' },
    { tipo: 'cpf', label: 'CPF' },
    { tipo: 'ctps', label: 'CTPS' },
    { tipo: 'comprovante_residencia', label: 'Comprovante de Residência' },
  ],
  pj: [
    { tipo: 'contrato', label: 'Contrato de Prestação de Serviços' },
    { tipo: 'cnpj', label: 'Cartão CNPJ' },
    { tipo: 'cpf', label: 'CPF do Representante' },
    { tipo: 'rg', label: 'RG do Representante' },
  ],
  voluntario: [
    { tipo: 'contrato', label: 'Termo de Voluntariado' },
    { tipo: 'rg', label: 'RG' },
  ],
  estagiario: [
    { tipo: 'contrato', label: 'Contrato de Estágio' },
    { tipo: 'rg', label: 'RG' },
    { tipo: 'cpf', label: 'CPF' },
    { tipo: 'comprovante_matricula', label: 'Comprovante de Matrícula' },
  ],
};

function DocumentosSection({ data, onNewDoc, onDeleteDoc }) {
  const [uploading, setUploading] = useState(false);
  const [docError, setDocError] = useState('');
  const fileRef = useRef(null);

  // Verificar docs obrigatórios faltando
  const obrigatorios = DOCS_OBRIGATORIOS[data.tipo_contrato] || [];
  const docsExistentes = (data.documentos || []).map(d => d.tipo?.toLowerCase());
  const docsFaltando = obrigatorios.filter(req => !docsExistentes.some(t => t === req.tipo || t?.includes(req.tipo)));
  const today = new Date().toISOString().slice(0, 10);
  const docsVencidos = (data.documentos || []).filter(d => d.data_expiracao && d.data_expiracao < today);

  async function handleUploadDoc(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setDocError('Arquivo deve ter no máximo 10MB'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `documentos/${data.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('rh-fotos').upload(filePath, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('rh-fotos').getPublicUrl(filePath);
      // Create document record
      const tipo = ext.toLowerCase() === 'pdf' ? 'contrato' : ext.toLowerCase();
      await rh.documentos.create(data.id, { nome: file.name, tipo, storage_path: publicUrl });
      setDocError(''); // success
      // Reload - parent should handle
    } catch (e) {
      console.error(e);
      setDocError('Erro ao enviar documento: ' + e.message);
    } finally { setUploading(false); }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase' }}>📄 Documentos ({(data.documentos || []).length})</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx" style={{ display: 'none' }}
            onChange={e => { handleUploadDoc(e.target.files?.[0]); e.target.value = ''; }} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? '⏳ Enviando...' : '📎 Upload'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onNewDoc(data.id)}>+ Manual</Button>
        </div>
      </div>
      {/* Alertas de documentos */}
      {docsFaltando.length > 0 && (
        <div style={{ padding: '10px 14px', background: '#f59e0b12', border: '1px solid #f59e0b30', borderRadius: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 4 }}>Documentos obrigatórios faltando ({docsFaltando.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {docsFaltando.map(d => (
              <span key={d.tipo} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f59e0b20', color: C.amber, fontWeight: 500 }}>{d.label}</span>
            ))}
          </div>
        </div>
      )}
      {docsVencidos.length > 0 && (
        <div style={{ padding: '10px 14px', background: '#ef444412', border: '1px solid #ef444430', borderRadius: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 4 }}>Documentos VENCIDOS ({docsVencidos.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {docsVencidos.map(d => (
              <span key={d.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#ef444420', color: C.red, fontWeight: 500 }}>{d.nome} (exp: {fmtDate(d.data_expiracao)})</span>
            ))}
          </div>
        </div>
      )}

      {(data.documentos || []).map(d => (
        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>{d.storage_path ? '📄' : '📋'}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{d.nome}</div>
              <div style={{ fontSize: 11, color: C.text3 }}>{d.tipo}{d.data_expiracao ? ` • exp: ${fmtDate(d.data_expiracao)}` : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {d.storage_path && <a href={d.storage_path} target="_blank" rel="noopener noreferrer" style={{ color: C.primary, textDecoration: 'none' }} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3">⬇ Baixar</a>}
            <Button variant="ghost" size="sm" onClick={() => onDeleteDoc(d.id, data.id)}>🗑</Button>
          </div>
        </div>
      ))}
      {(data.documentos || []).length === 0 && <div style={{ fontSize: 13, color: C.text3, padding: '8px 0' }}>Nenhum documento — use o botão Upload para enviar</div>}
    </div>
  );
}

function NotasColaborador({ funcId, initialValue }) {
  const [notas, setNotas] = useState(initialValue);
  const [saved, setSaved] = useState(true);
  const timerRef = useRef(null);

  function handleChange(e) {
    setNotas(e.target.value);
    setSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveNotas(e.target.value), 1500);
  }

  async function saveNotas(value) {
    try {
      await rh.funcionarios.update(funcId, { observacoes: value });
      setSaved(true);
    } catch (e) { console.error(e); }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase' }}>📝 Anotações</span>
        <span style={{ fontSize: 11, color: saved ? C.green : C.amber }}>{saved ? '✓ Salvo' : '⏳ Salvando...'}</span>
      </div>
      <textarea
        className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ minHeight: 80, resize: 'vertical' }}
        value={notas}
        onChange={handleChange}
        placeholder="Escreva anotações sobre este colaborador..."
      />
    </div>
  );
}

const NIVEL_LABELS = { 1: 'Sem acesso', 2: 'Pessoal', 3: 'Área', 4: 'Setor', 5: 'Admin' };
const NIVEL_COLORS = { 1: C.red, 2: C.amber, 3: C.blue, 4: C.green, 5: '#8b5cf6' };

function FuncionarioDetailPanel({ open, data, onClose, onEdit, onDelete, onNewDoc, onDeleteDoc, onSaveInline }) {
  const [showPerms, setShowPerms] = useState(false);
  const [permData, setPermData] = useState(null);
  const [estrutura, setEstrutura] = useState(null);
  const [saving, setSaving] = useState(false);
  const [permError, setPermError] = useState('');
  const [permSuccess, setPermSuccess] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [savingInline, setSavingInline] = useState(false);

  // Estado local das permissões (editável, salva só no botão)
  const [localCargo, setLocalCargo] = useState(null);
  const [localAreas, setLocalAreas] = useState([]);
  const [localModulos, setLocalModulos] = useState({}); // { moduloId: { leitura, escrita } }
  const [permDirty, setPermDirty] = useState(false);

  useEffect(() => { if (data && open) { setShowPerms(false); setPermData(null); setPermDirty(false); setPermError(''); setPermSuccess(''); } }, [data, open]);

  function initLocalPerms(perms, estru) {
    setLocalCargo(perms.usuario?.cargo_id ?? 2);
    setLocalAreas((perms.areas || []).map(a => a.area_id));
    const mods = {};
    (estru.modulos || []).forEach(mod => {
      const override = (perms.overrides || []).find(o => o.modulo_id === mod.id);
      const cargoDefault = perms.usuario?.cargos || {};
      mods[mod.id] = {
        leitura: override?.nivel_leitura ?? cargoDefault.nivel_padrao_leitura ?? 1,
        escrita: override?.nivel_escrita ?? cargoDefault.nivel_padrao_escrita ?? 1,
      };
    });
    setLocalModulos(mods);
    setPermDirty(false);
  }

  async function loadPermissions() {
    let estru = estrutura;
    if (!estru) {
      try { estru = await permissoes.estrutura(); setEstrutura(estru); } catch (e) { console.error(e); return; }
    }
    try {
      let permUser = null;
      if (data.email) permUser = await permissoes.usuarioPorEmail(data.email);
      if (!permUser) {
        const result = await permissoes.criarUsuario({ nome: data.nome, email: data.email || null, cargo_id: 2 });
        permUser = { id: result.id };
      }
      const perms = await permissoes.usuario(permUser.id);
      setPermData(perms);
      initLocalPerms(perms, estru);
    } catch (e) { console.error(e); }
    setShowPerms(true);
  }

  function handleCargoChange(cargoId) {
    setLocalCargo(cargoId);
    setPermDirty(true);
  }

  function handleAreaToggle(areaId) {
    setLocalAreas(prev => prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId]);
    setPermDirty(true);
  }

  function handleModuloChange(moduloId, tipo, nivel) {
    setLocalModulos(prev => ({
      ...prev,
      [moduloId]: { ...prev[moduloId], [tipo]: nivel },
    }));
    setPermDirty(true);
  }

  async function savePermissions() {
    if (!permData?.usuario) return;
    setSaving(true);
    setPermError('');
    setPermSuccess('');
    try {
      // 1. Salvar cargo
      if (localCargo !== permData.usuario.cargo_id) {
        await permissoes.setCargo(permData.usuario.id, localCargo);
      }
      // 2. Salvar áreas
      const currentAreaIds = (permData.areas || []).map(a => a.area_id).sort().join(',');
      const newAreaIds = [...localAreas].sort().join(',');
      if (currentAreaIds !== newAreaIds) {
        await permissoes.setAreas(permData.usuario.id, localAreas);
      }
      // 3. Salvar overrides de módulos
      for (const [modId, levels] of Object.entries(localModulos)) {
        const existing = (permData.overrides || []).find(o => o.modulo_id === parseInt(modId));
        const cargoDefault = permData.usuario.cargos || {};
        const prevLeitura = existing?.nivel_leitura ?? cargoDefault.nivel_padrao_leitura ?? 1;
        const prevEscrita = existing?.nivel_escrita ?? cargoDefault.nivel_padrao_escrita ?? 1;
        if (levels.leitura !== prevLeitura || levels.escrita !== prevEscrita) {
          await permissoes.setModulo(permData.usuario.id, {
            modulo_id: parseInt(modId),
            nivel_leitura: levels.leitura,
            nivel_escrita: levels.escrita,
          });
        }
      }
      // Recarregar dados
      const perms = await permissoes.usuario(permData.usuario.id);
      setPermData(perms);
      initLocalPerms(perms, estrutura);
      setPermSuccess('Permissões salvas com sucesso!');
      setTimeout(() => setPermSuccess(''), 3000);
    } catch (e) { setPermError(e.message); }
    setSaving(false);
  }

  if (!data || !open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }}>
      {/* Overlay */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      {/* Panel */}
      <div style={{ width: '55%', minWidth: 500, maxWidth: 800, background: 'var(--cbrio-modal-bg)', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)', animation: 'slideInRight 0.25s ease-out' }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--cbrio-modal-bg)', padding: '20px 28px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>👤 {editMode ? 'Editando' : data.nome}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editMode ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>Cancelar</Button>
                <Button size="sm" className="gap-1.5" disabled={savingInline} onClick={async () => {
                  setSavingInline(true);
                  try {
                    await onSaveInline(editForm);
                    setEditMode(false);
                  } catch {}
                  setSavingInline(false);
                }}>
                  <Save className="h-3.5 w-3.5" />{savingInline ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                setEditForm({ nome: data.nome, cargo: data.cargo, area: data.area || '', email: data.email || '', telefone: data.telefone || '', cpf: data.cpf || '', tipo_contrato: data.tipo_contrato, status: data.status, data_admissao: data.data_admissao || '', salario: data.salario || '', gestor_id: data.gestor_id || '' });
                setEditMode(true);
              }}><Pencil className="h-3.5 w-3.5" />Editar</Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <div style={{ padding: '24px 28px' }}>
      {/* Avatar + Info principal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        {data.foto_url ? (
          <img src={data.foto_url} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${C.primary}`, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: C.primaryBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, flexShrink: 0 }}>
            {(data.nome || '?')[0].toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{data.nome}</div>
          <div style={{ fontSize: 14, color: C.text2 }}>{data.cargo}{data.area ? ` · ${data.area}` : ''}</div>
          <Badge status={data.status} map={STATUS_COLORS} />
        </div>
      </div>
      {editMode ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 20, background: 'var(--cbrio-input-bg)', borderRadius: 10, padding: 16 }}>
          {[
            { key: 'nome', label: 'Nome *', full: true },
            { key: 'cargo', label: 'Cargo *' },
            { key: 'area', label: 'Área' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'telefone', label: 'Telefone' },
            { key: 'cpf', label: 'CPF' },
            { key: 'data_admissao', label: 'Admissão', type: 'date' },
            { key: 'salario', label: 'Salário (R$)', type: 'number' },
          ].map(f => (
            <div key={f.key} style={f.full ? { gridColumn: '1 / -1' } : undefined}>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{f.label}</label>
              <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type={f.type || 'text'} value={editForm[f.key] || ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Contrato</label>
            <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={editForm.tipo_contrato || 'clt'} onChange={e => setEditForm(p => ({ ...p, tipo_contrato: e.target.value }))}>
              {Object.entries(TIPO_CONTRATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Status</label>
            <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={editForm.status || 'ativo'} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
              {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 20 }}>
          <div><span style={{ fontSize: 11, color: C.text2 }}>Cargo:</span><div style={{ fontSize: 14, fontWeight: 600 }}>{data.cargo}</div></div>
          <div><span style={{ fontSize: 11, color: C.text2 }}>Área:</span><div style={{ fontSize: 14 }}>{data.area || '—'}</div></div>
          <div><span style={{ fontSize: 11, color: C.text2 }}>CPF:</span><div style={{ fontSize: 14 }}>{data.cpf || '—'}</div></div>
          <div><span style={{ fontSize: 11, color: C.text2 }}>Email:</span><div style={{ fontSize: 14 }}>{data.email || '—'}</div></div>
          <div><span style={{ fontSize: 11, color: C.text2 }}>Telefone:</span><div style={{ fontSize: 14 }}>{data.telefone || '—'}</div></div>
          <div><span style={{ fontSize: 11, color: C.text2 }}>Contrato:</span><div style={{ fontSize: 14 }}>{TIPO_CONTRATO[data.tipo_contrato]}</div></div>
          <div><span style={{ fontSize: 11, color: C.text2 }}>Admissão:</span><div style={{ fontSize: 14 }}>{fmtDate(data.data_admissao)}</div></div>
          <div><span style={{ fontSize: 11, color: C.text2 }}>Salário:</span><div style={{ fontSize: 14 }}>{fmtMoney(data.salario)}</div></div>
          <div><span style={{ fontSize: 11, color: C.text2 }}>Status:</span><div><Badge status={data.status} map={STATUS_COLORS} /></div></div>
        </div>
      )}

      {/* Anotações editáveis */}
      <NotasColaborador funcId={data.id} initialValue={data.observacoes || ''} />

      {/* Benefícios e Remuneração */}
      <BeneficiosSection data={data} onSave={async (updated) => {
        try { await rh.funcionarios.update(data.id, updated); onClose(); } catch (e) { console.error(e); }
      }} />

      {/* Documentos com upload */}
      <DocumentosSection data={data} onNewDoc={onNewDoc} onDeleteDoc={onDeleteDoc} onRefresh={() => onClose()} />

      {/* Treinamentos */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase' }}>📚 Treinamentos ({(data.treinamentos || []).length})</span>
        {(data.treinamentos || []).map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13 }}>{t.rh_treinamentos?.titulo || '—'}</span>
            <Badge status={t.status} map={{
              inscrito: { c: C.blue, bg: C.blueBg, label: 'Inscrito' },
              concluido: { c: C.green, bg: C.greenBg, label: 'Concluído' },
              cancelado: { c: C.red, bg: C.redBg, label: 'Cancelado' },
            }} />
          </div>
        ))}
      </div>

      {/* Férias */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Palmtree style={{ width: 14, height: 14, color: '#00B39D' }} /> Férias/Licenças ({(data.ferias_licencas || []).length})</span>
        {(data.ferias_licencas || []).map(f => (
          <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13 }}>{TIPO_FERIAS[f.tipo]} • {fmtDate(f.data_inicio)} → {fmtDate(f.data_fim)}</span>
            <Badge status={f.status} map={FERIAS_STATUS} />
          </div>
        ))}
      </div>

      {/* Permissões */}
      <div style={{ marginBottom: 16, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase' }}>🔐 Permissões do Sistema</span>
          {!showPerms && <Button variant="outline" size="sm" onClick={loadPermissions}>Configurar</Button>}
        </div>

        {permError && <div style={{ color: '#ef4444', background: '#ef444418', border: '1px solid #ef444450', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>{permError}</div>}
        {permSuccess && <div style={{ color: '#10b981', background: '#10b98118', border: '1px solid #10b98150', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>{permSuccess}</div>}

        {showPerms && permData && estrutura && (
          <div style={{ background: 'var(--cbrio-input-bg)', borderRadius: 10, padding: 16 }}>
            {/* Cargo / Nível base */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.text2, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Nível de acesso base</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(estrutura.cargos || []).map(c => (
                  <button key={c.id} onClick={() => handleCargoChange(c.id)} disabled={saving}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `2px solid ${localCargo === c.id ? NIVEL_COLORS[c.nivel_padrao_leitura] : C.border}`,
                      background: localCargo === c.id ? `${NIVEL_COLORS[c.nivel_padrao_leitura]}18` : 'transparent',
                      color: localCargo === c.id ? NIVEL_COLORS[c.nivel_padrao_leitura] : C.text2,
                    }}>
                    {c.nome}
                  </button>
                ))}
              </div>
            </div>

            {/* Áreas vinculadas */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.text2, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Áreas vinculadas</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {(estrutura.areas || []).map(a => {
                  const isLinked = localAreas.includes(a.id);
                  return (
                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text, cursor: 'pointer', padding: '3px 0' }}>
                      <input type="checkbox" checked={isLinked} onChange={() => handleAreaToggle(a.id)} disabled={saving} />
                      {a.nome} <span style={{ fontSize: 10, color: C.text3 }}>({a.setores?.nome})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Permissões por módulo */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.text2, textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Permissões por módulo</label>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: C.text2, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>Módulo</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', color: C.text2, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>Leitura</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', color: C.text2, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>Escrita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(estrutura.modulos || []).map(mod => {
                      const levels = localModulos[mod.id] || { leitura: 1, escrita: 1 };
                      const cargoDefault = permData.usuario?.cargos || {};
                      const origOverride = (permData.overrides || []).find(o => o.modulo_id === mod.id);
                      const origLeitura = origOverride?.nivel_leitura ?? cargoDefault.nivel_padrao_leitura ?? 1;
                      const origEscrita = origOverride?.nivel_escrita ?? cargoDefault.nivel_padrao_escrita ?? 1;
                      const isChanged = levels.leitura !== origLeitura || levels.escrita !== origEscrita;
                      return (
                        <tr key={mod.id} style={isChanged ? { background: '#f59e0b08' } : undefined}>
                          <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontWeight: 500, color: C.text }}>
                            {mod.nome}
                            {isChanged && <span style={{ fontSize: 9, color: C.amber, marginLeft: 4 }}>alterado</span>}
                          </td>
                          <td style={{ padding: '4px 8px', borderBottom: `1px solid ${C.border}`, textAlign: 'center' }}>
                            <select value={levels.leitura} onChange={e => handleModuloChange(mod.id, 'leitura', parseInt(e.target.value))}
                              disabled={saving}
                              style={{ padding: '3px 6px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, background: 'var(--cbrio-card)', color: NIVEL_COLORS[levels.leitura], fontWeight: 600, cursor: 'pointer' }}>
                              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} — {NIVEL_LABELS[n]}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '4px 8px', borderBottom: `1px solid ${C.border}`, textAlign: 'center' }}>
                            <select value={levels.escrita} onChange={e => handleModuloChange(mod.id, 'escrita', parseInt(e.target.value))}
                              disabled={saving}
                              style={{ padding: '3px 6px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, background: 'var(--cbrio-card)', color: NIVEL_COLORS[levels.escrita], fontWeight: 600, cursor: 'pointer' }}>
                              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} — {NIVEL_LABELS[n]}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: C.text3, marginTop: 8 }}>
                Níveis: 1=Sem acesso | 2=Pessoal | 3=Área | 4=Setor | 5=Admin
              </div>
            </div>

            {/* Botão Salvar Permissões */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <Button variant="ghost" size="sm" onClick={() => { initLocalPerms(permData, estrutura); setPermError(''); }}>Desfazer</Button>
              <Button size="sm" className="gap-1.5" disabled={saving || !permDirty} onClick={savePermissions}>
                <Save className="h-3.5 w-3.5" />{saving ? 'Salvando...' : 'Salvar Permissões'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: `1px solid ${C.border}`, marginTop: 16 }}>
        <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => onDelete(data.id)}><Trash2 className="h-3.5 w-3.5" />Remover Colaborador</Button>
      </div>
        </div>{/* end padding div */}
      </div>{/* end panel */}
    </div>
  );
}

function DocumentoFormModal({ open, data, onClose, onSave }) {
  const [f, setF] = useState({ tipo: 'contrato' });
  useEffect(() => { if (open) setF({ tipo: 'contrato' }); }, [open]);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title="📄 Novo Documento"
      footer={<Button onClick={() => onSave(data?.funcionario_id, f)}>Salvar</Button>}>
      <Input label="Nome do Documento *" value={f.nome || ''} onChange={e => upd('nome', e.target.value)} />
      <Select label="Tipo" value={f.tipo} onChange={e => upd('tipo', e.target.value)}>
        <option value="contrato">Contrato</option>
        <option value="ctps">CTPS</option>
        <option value="rg">RG</option>
        <option value="cpf">CPF</option>
        <option value="certificado">Certificado</option>
        <option value="outro">Outro</option>
      </Select>
      <Input label="Data de Expiração" type="date" value={f.data_expiracao || ''} onChange={e => upd('data_expiracao', e.target.value)} />
    </Modal>
  );
}
