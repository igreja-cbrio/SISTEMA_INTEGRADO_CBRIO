// ============================================================================
// Aba "Pessoas" do /grupos · CENSO de quem está nos grupos
//
// Marcos (2026-06-22): a aba deixou de ser "quem-é-quem na hierarquia" (com a
// linha Lidera/Supervisiona + botão Promover — gestão de papel já vive no
// detalhe do grupo, na Supervisão e no Organograma) e virou um CENSO pra
// filtrar e achar gente: Função · Status de frequência · Última frequência ·
// Grupo. Filtros: busca + grupo + status (+ os cards-contador por função).
//
// Status de frequência = derivado da última presença em encontros de grupo
// (fn_grupos_ultima_frequencia): 🟢 Frequenta ≤30d · 🟡 Atenção 31-60d ·
// 🔴 Ausente >60d (já frequentou e sumiu) · ⚪ Sem presença (nunca teve chamada
// lançada · neutro). A função vem da `funcao` real (o trigger fn_grupo_auto_membro
// mantém visitante→membro no 4º check-in) — sem rebaixar por contagem de presenças.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { grupos as api } from '../../api';
import { Input } from '../../components/ui/input';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Search, Users, GraduationCap, Star, Crown, Eye } from 'lucide-react';
import Paginacao, { usePaginacaoLocal } from '../../components/Paginacao';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
  green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', violet: '#8b5cf6',
};

// Função efetiva → rótulo/cor/ícone (ordem = hierarquia, do topo pra base)
const PAPEIS = {
  coordenador: { label: 'Coordenador', plural: 'Coordenadores', cor: '#8b5cf6', Icon: Crown },
  supervisor: { label: 'Supervisor', plural: 'Supervisores', cor: '#3b82f6', Icon: Eye },
  lider: { label: 'Líder', plural: 'Líderes', cor: '#00B39D', Icon: Star },
  co_lider: { label: 'Co-líder', plural: 'Co-líderes', cor: '#0ea5e9', Icon: Star },
  lider_treinamento: { label: 'Em treinamento', plural: 'Em treinamento', cor: '#f59e0b', Icon: GraduationCap },
  frequentador: { label: 'Membro', plural: 'Membros', cor: '#10b981', Icon: Users },
  visitante: { label: 'Visitante', plural: 'Visitantes', cor: '#94a3b8', Icon: Users },
};

// Status de frequência (derivado da última presença em grupo · bola colorida)
const STATUS = {
  frequenta: { label: 'Frequenta', cor: '#10b981' },        // 🟢 ≤30d
  atencao: { label: 'Atenção', cor: '#f59e0b' },            // 🟡 31-60d
  ausente: { label: 'Ausente', cor: '#ef4444' },            // 🔴 >60d (já frequentou e sumiu)
  sem_presenca: { label: 'Sem presença', cor: '#94a3b8' },  // ⚪ nunca teve presença lançada (neutro)
};

const fmtData = (d) => { if (!d) return null; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };

function statusDe(p) {
  if (!p.ultima_frequencia) return 'sem_presenca'; // nunca teve presença lançada (neutro, não vermelho)
  let dias;
  try { dias = Math.floor((Date.now() - new Date(p.ultima_frequencia + 'T12:00:00').getTime()) / 86400000); }
  catch { return 'sem_presenca'; }
  if (dias <= 30) return 'frequenta';
  if (dias <= 60) return 'atencao';
  return 'ausente';
}

// Item somente-leitura da ficha cadastral (modal da pessoa)
function FichaItem({ rotulo, valor }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 700 }}>{rotulo}</div>
      <div style={{ color: valor ? C.t2 : C.t3 }}>{valor || '—'}</div>
    </div>
  );
}

// Campo editável da ficha (input pequeno com rótulo)
function FichaCampo({ rotulo, valor, onChange, type = 'text', inputMode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 700, marginBottom: 4 }}>{rotulo}</div>
      <input
        type={type}
        inputMode={inputMode}
        value={valor}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 12.5 }}
      />
    </div>
  );
}

// Grupos da pessoa pra exibir/filtrar: participações; se não tiver, cai pros
// grupos que lidera/supervisiona (pra líder/supervisor não ficar sem grupo).
function gruposDe(p) {
  if (p.grupos?.length) return p.grupos.map(g => ({ id: g.grupo_id, nome: g.grupo_nome || 'Grupo' }));
  const fallback = [...(p.lidera || []), ...(p.supervisiona || [])];
  return fallback.map(g => ({ id: g.id, nome: g.nome || 'Grupo' }));
}

// Detalhe de CADA grupo da pessoa (participações + grupos que lidera/supervisiona),
// com a função, presenças e entrada — pro modal "ver grupos da pessoa".
function gruposDetalhados(p) {
  const map = new Map();
  (p.grupos || []).forEach(g => map.set(g.grupo_id, {
    id: g.grupo_id, nome: g.grupo_nome || 'Grupo', funcao: g.funcao || 'frequentador',
    presencas: g.presencas || 0, entrou_em: g.entrou_em || null, supervisiona: false,
  }));
  (p.lidera || []).forEach(g => {
    const e = map.get(g.id);
    if (e) e.funcao = 'lider';
    else map.set(g.id, { id: g.id, nome: g.nome || 'Grupo', funcao: 'lider', presencas: 0, entrou_em: null, supervisiona: false });
  });
  (p.supervisiona || []).forEach(g => {
    const e = map.get(g.id);
    if (e) e.supervisiona = true;
    else map.set(g.id, { id: g.id, nome: g.nome || 'Grupo', funcao: 'supervisor', presencas: 0, entrou_em: null, supervisiona: true });
  });
  return [...map.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
}

// ============================================================================
// Aba Pessoas
// ============================================================================
export default function GruposPessoas({ onOpenGrupo, gruposOptions = [], onVerDuplicatas, podeEditarDados = false }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  // Etiqueta "possível duplicata" (Marcos · 14/07): ids que caíram em algum
  // cluster da análise de duplicatas. Falha silenciosa (nível <3 recebe 403).
  const [dupIds, setDupIds] = useState(() => new Set());
  useEffect(() => {
    api.duplicatas.list()
      .then(r => {
        const s = new Set();
        (r?.clusters || []).forEach(c => c.pessoas.forEach(p => s.add(p.id)));
        setDupIds(s);
      })
      .catch(() => {});
  }, []);
  const [selected, setSelected] = useState(null); // pessoa aberta no modal de grupos
  const [filtro, setFiltro] = useState('todos');     // função: todos | <papel> | lideres
  const [filtroGrupo, setFiltroGrupo] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  // Import do consolidado de participantes (pessoas × grupos)
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importReconciliar, setImportReconciliar] = useState(false);

  async function importAnalisar() {
    if (!importFile) return;
    setImportBusy(true); setImportResult(null);
    try {
      const r = await api.importarParticipantes(importFile, { dryRun: true, reconciliar: importReconciliar });
      setImportPreview(r);
    } catch (e) {
      toast.error(e?.message || 'Erro ao analisar a planilha');
    } finally { setImportBusy(false); }
  }
  async function importAplicar() {
    if (!importFile) return;
    const extra = importReconciliar ? ` Vai DESATIVAR ${importPreview?.desativar_vinculos ?? '?'} vínculos e ${importPreview?.desativar_grupos ?? '?'} grupos fora do consolidado.` : '';
    if (!window.confirm(`Confirma aplicar? Vai criar ${importPreview?.criar ?? '?'} pessoas, atualizar ${importPreview?.atualizar ?? '?'}, criar ${importPreview?.grupos_criar ?? '?'} grupos e ${importPreview?.vinculos_criar ?? '?'} vínculos.${extra}`)) return;
    setImportBusy(true);
    try {
      const r = await api.importarParticipantes(importFile, { dryRun: false, reconciliar: importReconciliar });
      setImportResult(r);
      toast.success(`Importado · ${r.criar} criadas, ${r.vinculos_criar} vínculos${importReconciliar ? `, ${r.desativar_vinculos} desativados` : ''}`);
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Erro ao importar');
    } finally { setImportBusy(false); }
  }

  const carregar = useCallback(async () => {
    try {
      const r = await api.pessoasPapeis();
      setDados(r);
    } catch {
      toast.error('Erro ao carregar pessoas');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Ficha cadastral da pessoa do modal (Marcos · 15/07: editar/limpar
  // dados direto na área de Pessoas). Campo salvo em branco APAGA o dado.
  const [ficha, setFicha] = useState(null);        // dados carregados (ou null)
  const [fichaEditando, setFichaEditando] = useState(false);
  const [fichaForm, setFichaForm] = useState({});
  const [fichaSalvando, setFichaSalvando] = useState(false);
  useEffect(() => {
    setFicha(null); setFichaEditando(false);
    if (!selected?.membro_id) return;
    let vivo = true;
    api.pessoaFicha(selected.membro_id)
      .then(f => { if (vivo) setFicha(f); })
      .catch(() => {}); // sem nível/fora do universo → seção não aparece
    return () => { vivo = false; };
  }, [selected?.membro_id]);

  const abrirEdicaoFicha = () => {
    setFichaForm({
      nome: ficha?.nome || '',
      telefone: ficha?.telefone || '',
      email: ficha?.email || '',
      cpf: ficha?.cpf || '',
      data_nascimento: ficha?.data_nascimento || '',
      observacoes: ficha?.observacoes || '',
    });
    setFichaEditando(true);
  };

  const salvarFicha = async () => {
    setFichaSalvando(true);
    try {
      const r = await api.pessoaFichaSalvar(selected.membro_id, fichaForm);
      setFicha(r);
      setFichaEditando(false);
      toast.success('Ficha atualizada');
      if (r.nome !== selected.nome) { setSelected(s => ({ ...s, nome: r.nome })); carregar(); }
    } catch (e) { toast.error(e.message || 'Erro ao salvar a ficha'); }
    finally { setFichaSalvando(false); }
  };

  const pessoas = dados?.pessoas || [];

  const contagens = useMemo(() => {
    const c = {};
    Object.keys(PAPEIS).forEach(k => { c[k] = 0; });
    for (const p of pessoas) c[p.papel] = (c[p.papel] || 0) + 1;
    c.lideres_total = (c.lider || 0) + (c.co_lider || 0);
    return c;
  }, [pessoas]);

  const filtradas = useMemo(() => {
    let lista = pessoas;
    if (busca) {
      const s = busca.toLowerCase();
      lista = lista.filter(p =>
        p.nome?.toLowerCase().includes(s) ||
        gruposDe(p).some(g => g.nome?.toLowerCase().includes(s)));
    }
    if (filtro === 'lideres') lista = lista.filter(p => p.papel === 'lider' || p.papel === 'co_lider');
    else if (filtro !== 'todos') lista = lista.filter(p => p.papel === filtro);
    if (filtroGrupo !== 'todos') lista = lista.filter(p => gruposDe(p).some(g => g.id === filtroGrupo));
    if (filtroStatus !== 'todos') lista = lista.filter(p => statusDe(p) === filtroStatus);
    return lista;
  }, [pessoas, busca, filtro, filtroGrupo, filtroStatus]);

  const { pageItems: filtradasPag, paginacaoProps: gruposPessoasPagProps } = usePaginacaoLocal(filtradas, 25);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando pessoas...</div>;

  // Cards-contador por função = também filtram
  const CARDS = [
    { key: 'todos', label: 'Todos', value: pessoas.length, cor: C.text },
    { key: 'coordenador', label: 'Coordenadores', value: contagens.coordenador || 0, cor: PAPEIS.coordenador.cor },
    { key: 'supervisor', label: 'Supervisores', value: contagens.supervisor || 0, cor: PAPEIS.supervisor.cor },
    { key: 'lideres', label: 'Líderes', value: contagens.lideres_total || 0, cor: PAPEIS.lider.cor },
    { key: 'lider_treinamento', label: 'Líderes em treinamento', value: contagens.lider_treinamento || 0, cor: PAPEIS.lider_treinamento.cor },
    { key: 'frequentador', label: 'Membros', value: contagens.frequentador || 0, cor: PAPEIS.frequentador.cor },
    { key: 'visitante', label: 'Visitantes', value: contagens.visitante || 0, cor: PAPEIS.visitante.cor },
  ];

  const opcoesGrupo = [...gruposOptions].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  const temFiltro = filtro !== 'todos' || filtroGrupo !== 'todos' || filtroStatus !== 'todos' || !!busca;

  return (
    <div>
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Pessoas dos grupos</h3>
          <p style={{ fontSize: 12, color: C.t3, margin: '4px 0 0', maxWidth: 620 }}>
            Censo de quem está nos grupos — função, status de frequência, última presença e grupo.
            O status vem das chamadas registradas (quem ainda não tem presença lançada fica "Sem presença", em cinza).
          </p>
        </div>
        <button onClick={() => { setImportOpen(true); setImportPreview(null); setImportResult(null); setImportFile(null); }}
          style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Importar participantes
        </button>
      </div>

      {/* Modal · importar consolidado de participantes (dry-run → aplicar) */}
      {importOpen && (
        <div onClick={() => !importBusy && setImportOpen(false)} style={{ position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 14, padding: 20, width: 560, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Importar participantes (XLSX)</h3>
              <button onClick={() => !importBusy && setImportOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: C.t3, cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: 12, color: C.t3, marginTop: 0 }}>
              Cria quem não existe, ignora quem já existe e completa CPF/telefone faltantes. Não duplica pessoas nem vínculos.
              <strong> Rode "Analisar" primeiro</strong> pra ver a prévia antes de aplicar.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={e => { setImportFile(e.target.files?.[0] || null); setImportPreview(null); setImportResult(null); }} style={{ fontSize: 13, marginBottom: 10, display: 'block' }} />

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: C.text, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={importReconciliar} onChange={e => { setImportReconciliar(e.target.checked); setImportPreview(null); setImportResult(null); }} style={{ marginTop: 2 }} />
              <span><strong>Reconciliar (substituir pela temporada)</strong> — desativa os vínculos e grupos que <u>não estão</u> no consolidado, pra a contagem/mandala bater exatamente o arquivo. Reversível. Deixe a prévia mostrar quantos antes de aplicar.</span>
            </label>

            {(importPreview || importResult) && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, fontSize: 13, color: C.text, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{importResult ? '✅ Resultado' : 'Prévia (nada gravado ainda)'}</div>
                {(() => { const r = importResult || importPreview; return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <span>Pessoas na planilha: <strong>{r.pessoas_planilha}</strong></span>
                    <span>Criar pessoas: <strong>{r.criar}</strong></span>
                    <span>Atualizar (CPF/tel): <strong>{r.atualizar}</strong></span>
                    <span>Ignorar (já existem): <strong>{r.ignorar}</strong></span>
                    <span>Ambíguos (revisar): <strong style={{ color: r.ambiguos ? C.amber : C.text }}>{r.ambiguos}</strong></span>
                    <span>Grupos: <strong>{r.grupos_existentes}</strong> existem / <strong>{r.grupos_criar}</strong> criar</span>
                    <span>Vínculos criar: <strong>{r.vinculos_criar}</strong></span>
                    <span>Vínculos já existem: <strong>{r.vinculos_existentes}</strong></span>
                    {r.desativar_vinculos != null && <span style={{ color: C.red }}>Desativar vínculos: <strong>{r.desativar_vinculos}</strong></span>}
                    {r.desativar_grupos != null && <span style={{ color: C.red }}>Desativar grupos: <strong>{r.desativar_grupos}</strong></span>}
                  </div>
                ); })()}
                {!importResult && importPreview?.ambiguos > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: C.t3 }}>
                    Ambíguos (mesmo nome de +1 pessoa no sistema · não serão criados/fundidos): {(importPreview.exemplos?.ambiguos || []).slice(0, 8).join(' · ')}…
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={importAnalisar} disabled={!importFile || importBusy} style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: importFile && !importBusy ? 'pointer' : 'not-allowed', opacity: !importFile || importBusy ? 0.6 : 1 }}>
                {importBusy && !importResult ? 'Analisando…' : 'Analisar (prévia)'}
              </button>
              <button onClick={importAplicar} disabled={!importPreview || importBusy || importResult} style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: importPreview && !importBusy && !importResult ? 'pointer' : 'not-allowed', opacity: !importPreview || importBusy || importResult ? 0.6 : 1 }}>
                {importBusy && importPreview ? 'Aplicando…' : 'Aplicar import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso de duplicatas — leva pra visualização de resolução */}
      {dupIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '9px 14px', marginBottom: 12, borderRadius: 10,
          background: `${C.amber}14`, border: `1px solid ${C.amber}55`, fontSize: 12.5, color: C.text,
        }}>
          <span>
            <strong>{dupIds.size}</strong> pessoa{dupIds.size === 1 ? '' : 's'} com possível cadastro duplicado
            — as linhas marcadas abaixo precisam de revisão.
          </span>
          {onVerDuplicatas && (
            <button onClick={onVerDuplicatas} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: 0 }}>
              Resolver duplicatas →
            </button>
          )}
        </div>
      )}

      {/* Cards-filtro por função */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10, marginBottom: 12 }}>
        {CARDS.map(k => {
          const ativo = filtro === k.key;
          return (
            <button key={k.key} onClick={() => setFiltro(k.key)} style={{
              background: ativo ? `${k.cor}12` : C.card, borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer',
              border: ativo ? `2px solid ${k.cor}` : `1px solid ${C.border}`, transition: 'border-color 0.12s',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.cor }}>{k.value}</div>
              <div style={{ fontSize: 11, color: ativo ? k.cor : C.t3, fontWeight: ativo ? 600 : 400 }}>{k.label}</div>
            </button>
          );
        })}
      </div>

      {/* Controles: busca + grupo + status */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
          <Input placeholder="Buscar por nome ou grupo..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
        <ShadSelect value={filtroGrupo} onValueChange={setFiltroGrupo}>
          <SelectTrigger style={{ width: 200 }}><SelectValue placeholder="Grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os grupos</SelectItem>
            {opcoesGrupo.map(g => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
          </SelectContent>
        </ShadSelect>
        <ShadSelect value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger style={{ width: 170 }}><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
          </SelectContent>
        </ShadSelect>
      </div>

      {/* Lista */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.t3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{filtradas.length} pessoa{filtradas.length !== 1 ? 's' : ''}</span>
          {temFiltro && (
            <button onClick={() => { setFiltro('todos'); setFiltroGrupo('todos'); setFiltroStatus('todos'); setBusca(''); }}
              style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Limpar filtros
            </button>
          )}
        </div>
        {filtradas.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Ninguém nesse filtro.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                  {['Pessoa', 'Função', 'Status', 'Grupo', 'Última frequência', 'Presenças'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 5 ? 'right' : 'left', padding: '8px 16px', fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradasPag.map(p => {
                  const pap = PAPEIS[p.papel] || PAPEIS.frequentador;
                  const st = STATUS[statusDe(p)];
                  const gs = gruposDe(p);
                  return (
                    <tr key={p.membro_id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '10px 16px' }}>
                        <button
                          type="button"
                          onClick={() => setSelected(p)}
                          title="Ver grupos da pessoa"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.foto_url ? `url(${p.foto_url}) center/cover` : `${pap.cor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: pap.cor }}>
                            {!p.foto_url && (p.nome?.charAt(0) || '?')}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>{p.nome}</span>
                          {dupIds.has(p.membro_id) && (
                            <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 99, background: `${C.amber}20`, color: C.amber, fontWeight: 700, whiteSpace: 'nowrap' }}>
                              Possível duplicata
                            </span>
                          )}
                        </button>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 9px', borderRadius: 99, background: `${pap.cor}18`, color: pap.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <pap.Icon size={10} /> {pap.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '2px 9px', borderRadius: 99, background: `${st.cor}18`, color: st.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.cor }} /> {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.t2 }}>
                        {gs.length > 0 ? gs.map((g, i) => (
                          <span key={g.id || i}>
                            {i > 0 && ', '}
                            <button onClick={() => onOpenGrupo?.(g.id)} style={{ background: 'none', border: 'none', padding: 0, color: C.t2, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{g.nome}</button>
                          </span>
                        )) : <span style={{ color: C.t3 }}>Sem grupo</span>}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: p.ultima_frequencia ? C.t2 : C.t3, whiteSpace: 'nowrap' }}>
                        {p.ultima_frequencia ? fmtData(p.ultima_frequencia) : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.t2, textAlign: 'right' }}>
                        {p.presencas_total || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Paginacao {...gruposPessoasPagProps} itemLabel="pessoas" />
      </div>

      {/* Modal · grupos da pessoa */}
      {selected && (() => {
        const pap = PAPEIS[selected.papel] || PAPEIS.frequentador;
        const gs = gruposDetalhados(selected);
        return (
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 14, width: 520, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', border: `1px solid ${C.border}` }}>
              {/* Cabeçalho */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 20, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: selected.foto_url ? `url(${selected.foto_url}) center/cover` : `${pap.cor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, fontWeight: 700, color: pap.cor }}>
                  {!selected.foto_url && (selected.nome?.charAt(0) || '?')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{selected.nome}</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: pap.cor, fontWeight: 700 }}>
                    <pap.Icon size={11} /> {pap.label}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 22, lineHeight: 1, color: C.t3, cursor: 'pointer' }}>×</button>
              </div>

              {/* Ficha cadastral · ver + editar (limpar um campo apaga o dado) */}
              {ficha && (
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Dados da pessoa</span>
                    {podeEditarDados && !fichaEditando && (
                      <button onClick={abrirEdicaoFicha} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}>
                        Editar dados
                      </button>
                    )}
                  </div>

                  {!fichaEditando ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 16px', fontSize: 12.5 }}>
                      <FichaItem rotulo="Telefone" valor={ficha.telefone} />
                      <FichaItem rotulo="E-mail" valor={ficha.email} />
                      <FichaItem rotulo="CPF" valor={ficha.cpf} />
                      <FichaItem rotulo="Nascimento" valor={ficha.data_nascimento ? fmtData(ficha.data_nascimento) : null} />
                      {ficha.observacoes && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 700 }}>Observações</div>
                          <div style={{ color: C.t2, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{ficha.observacoes}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 11.5, color: C.amber, margin: '0 0 10px', lineHeight: 1.5 }}>
                        Deixar um campo em branco <strong>apaga o dado</strong> da ficha ao salvar. Toda alteração fica registrada na auditoria.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                        <FichaCampo rotulo="Nome completo" valor={fichaForm.nome} onChange={v => setFichaForm(f => ({ ...f, nome: v }))} />
                        <FichaCampo rotulo="Telefone" valor={fichaForm.telefone} onChange={v => setFichaForm(f => ({ ...f, telefone: v }))} inputMode="tel" />
                        <FichaCampo rotulo="E-mail" valor={fichaForm.email} onChange={v => setFichaForm(f => ({ ...f, email: v }))} type="email" />
                        <FichaCampo rotulo="CPF" valor={fichaForm.cpf} onChange={v => setFichaForm(f => ({ ...f, cpf: v }))} inputMode="numeric" />
                        <FichaCampo rotulo="Nascimento" valor={fichaForm.data_nascimento} onChange={v => setFichaForm(f => ({ ...f, data_nascimento: v }))} type="date" />
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 700, marginBottom: 4 }}>Observações</div>
                        <textarea
                          value={fichaForm.observacoes}
                          onChange={e => setFichaForm(f => ({ ...f, observacoes: e.target.value }))}
                          rows={3}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                        <button onClick={() => setFichaEditando(false)} disabled={fichaSalvando}
                          style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: C.t2, cursor: 'pointer' }}>
                          Cancelar
                        </button>
                        <button onClick={salvarFicha} disabled={fichaSalvando}
                          style={{ background: C.primary, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: fichaSalvando ? 'wait' : 'pointer' }}>
                          {fichaSalvando ? 'Salvando...' : 'Salvar ficha'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Lista de grupos */}
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 11, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
                  {gs.length} grupo{gs.length !== 1 ? 's' : ''}
                </div>
                {gs.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Não participa de nenhum grupo.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {gs.map(g => {
                      const fp = PAPEIS[g.funcao] || { label: g.funcao || 'Membro', cor: C.t2, Icon: Users };
                      return (
                        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <button
                              onClick={() => { setSelected(null); onOpenGrupo?.(g.id); }}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'left' }}
                            >
                              {g.nome}
                            </button>
                            <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                              {g.entrou_em ? `desde ${fmtData(g.entrou_em)}` : 'participante'}
                              {g.presencas ? ` · ${g.presencas} presença${g.presencas !== 1 ? 's' : ''}` : ''}
                              {g.supervisiona ? ' · supervisiona' : ''}
                            </div>
                          </div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 9px', borderRadius: 99, background: `${fp.cor}18`, color: fp.cor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            <fp.Icon size={10} /> {fp.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
