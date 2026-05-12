// ============================================================================
// /admin/estrutura-okr — gestao da estrutura OKR completa
//
// Administra:
//   - Direcionadores (UNIDADE, etc)
//   - Objetivos Gerais (25 da planilha)
//   - KRs Gerais (vinculados a objetivos)
//
// KRs especificos de cada KPI ficam editaveis no KpiEditorModal
// (Fase 2.5B-2). KPIs em si ficam editaveis na pagina de Meus KPIs.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { estrategia as estrategiaApi } from '../../api';
import { SkeletonBlock } from '../../components/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Target, ListChecks, Activity, X, Save, Filter } from 'lucide-react';
import { toast } from 'sonner';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};

const VALOR_LABELS = {
  seguir: 'Seguir', conectar: 'Conectar',
  investir: 'Investir', servir: 'Servir', generosidade: 'Generosidade',
};
const VALOR_CORES = {
  seguir: '#8B5CF6', conectar: '#3B82F6', investir: '#F59E0B',
  servir: '#10B981', generosidade: '#EC4899',
};

const VALORES_JORNADA = [
  { key: 'seguir',       label: 'Seguir Jesus',   cor: '#8B5CF6' },
  { key: 'conectar',     label: 'Conectar',       cor: '#3B82F6' },
  { key: 'investir',     label: 'Investir Tempo', cor: '#F59E0B' },
  { key: 'servir',       label: 'Servir',         cor: '#10B981' },
  { key: 'generosidade', label: 'Generosidade',   cor: '#EC4899' },
];

const AREAS_CULTO = [
  { key: 'kids',   label: 'CBKids' },
  { key: 'ami',    label: 'AMI' },
  { key: 'bridge', label: 'Bridge' },
  { key: 'sede',   label: 'Sede' },
  { key: 'online', label: 'Online' },
  { key: 'cba',    label: 'CBA' },
];

// Grupos adm · mesma estrutura da matriz (Hospitalidade agrega 3, Logistica agrega 2)
const AREAS_ADM_GRUPOS = [
  { key: 'hospitalidade', label: 'Hospitalidade', subareas: ['reserva_espaco', 'cozinha', 'manutencao'] },
  { key: 'logistica',     label: 'Logística',     subareas: ['logistica_estoque', 'logistica_compras'] },
  { key: 'ti',            label: 'TI',            subareas: ['ti'] },
  { key: 'rh',            label: 'RH',            subareas: ['rh'] },
  { key: 'financeiro',    label: 'Financeiro',    subareas: ['financeiro'] },
  { key: 'criativo',      label: 'Criativo',      subareas: ['criativo'] },
];

export default function EstruturaOkr({ embedded = false }) {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);

  const [direcionadores, setDirecionadores] = useState([]);
  const [objetivos, setObjetivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedObj, setExpandedObj] = useState(null);
  const [editObj, setEditObj] = useState(null);
  const [editKr, setEditKr] = useState(null);

  // Filtros · sets vazios = todos
  const [filtroValores, setFiltroValores] = useState(new Set());
  const [filtroAreasCulto, setFiltroAreasCulto] = useState(new Set());
  const [filtroAreasAdm, setFiltroAreasAdm] = useState(new Set());

  const toggleFiltro = (setter, key) => setter(prev => {
    const novo = new Set(prev);
    if (novo.has(key)) novo.delete(key); else novo.add(key);
    return novo;
  });

  const limparFiltros = () => {
    setFiltroValores(new Set());
    setFiltroAreasCulto(new Set());
    setFiltroAreasAdm(new Set());
  };

  const algumFiltro = filtroValores.size + filtroAreasCulto.size + filtroAreasAdm.size > 0;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [dirs, objs] = await Promise.all([
        estrategiaApi.direcionadores.list(),
        estrategiaApi.objetivos.list({ ativos: 'true' }),
      ]);
      setDirecionadores(dirs);
      setObjetivos(objs);
    } catch (e) {
      toast.error(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Agrupa OKRs · ministeriais por valor da Jornada, operacionais separados
  const grupos = useMemo(() => {
    const operacionais = [];
    const porValor = { seguir: [], conectar: [], investir: [], servir: [], generosidade: [], sem_valor: [] };

    objetivos.forEach(o => {
      const isOp = o.tipo_okr === 'operacional';

      // Filtro por valor (so aplica em ministeriais)
      if (filtroValores.size > 0) {
        if (isOp) return;
        const valoresObj = o.valores || [];
        if (!valoresObj.some(v => filtroValores.has(v))) return;
      }

      // Filtro por area adm (so aplica em operacionais · o OKR adm agora e 1 so com 9 KPIs)
      // Filtro nao oculta o OKR · sera usado no drilldown pra filtrar KPIs especificos
      // (Implementacao simples: quando algum filtro adm ativo e o OKR e operacional, mostra)
      if (filtroAreasAdm.size > 0 && !isOp) {
        // Filtro de adm aplicado · ministeriais nao bate
        return;
      }

      if (isOp) operacionais.push(o);
      else {
        const v = (o.valores || [])[0] || 'sem_valor';
        if (porValor[v]) porValor[v].push(o);
        else porValor.sem_valor.push(o);
      }
    });

    Object.keys(porValor).forEach(k => porValor[k].sort((a, b) => (a.ordem || 99) - (b.ordem || 99)));
    operacionais.sort((a, b) => (a.ordem || 99) - (b.ordem || 99));
    return { porValor, operacionais };
  }, [objetivos, filtroValores, filtroAreasAdm]);

  const totalFiltrado = useMemo(() => grupos.operacionais.length +
    Object.values(grupos.porValor).reduce((s, arr) => s + arr.length, 0), [grupos]);

  const removerObjetivo = async (obj) => {
    if (!window.confirm(`Inativar objetivo "${obj.nome}"? KPIs vinculados ficam orfaos.`)) return;
    try {
      await estrategiaApi.objetivos.remove(obj.id);
      toast.success('Objetivo inativado');
      carregar();
    } catch (e) { toast.error(e?.message); }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>
        Apenas admin/diretor pode gerenciar a estrutura OKR.
      </div>
    );
  }

  return (
    <div style={{ padding: embedded ? 0 : '24px 32px', maxWidth: embedded ? '100%' : 1200, margin: embedded ? 0 : '0 auto' }}>
      {!embedded && (
      <header style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Target size={22} style={{ color: C.primary }} />
            Estrutura OKR
          </h1>
          <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
            Direcionadores → Objetivos Gerais → KPIs · {objetivos.length} objetivos · {direcionadores.length} direcionadores
          </p>
        </div>
        <button onClick={() => setEditObj({})} style={btnPrimary}>
          <Plus size={14} /> Novo objetivo
        </button>
      </header>
      )}

      {/* Botão Novo objetivo (modo embedded) */}
      {embedded && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>
            {objetivos.length} objetivos · {direcionadores.length} direcionadores
          </p>
          <button onClick={() => setEditObj({})} style={btnPrimary}>
            <Plus size={14} /> Novo objetivo
          </button>
        </div>
      )}

      {/* Direcionadores (compactos) */}
      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <h3 style={hh3}>Direcionadores ({direcionadores.length})</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {direcionadores.map(d => (
            <div key={d.id} style={{
              padding: '6px 14px', borderRadius: 99,
              background: C.primary, color: '#fff',
              fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
            }}>
              {d.nome}
            </div>
          ))}
        </div>
      </section>

      {/* Objetivos Gerais */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <h3 style={hh3}>Objetivos Gerais ({totalFiltrado}{algumFiltro ? ` de ${objetivos.length}` : ''})</h3>
          {algumFiltro && (
            <button onClick={limparFiltros} style={{
              padding: '4px 10px', fontSize: 10, fontWeight: 600,
              background: 'transparent', color: C.t2, border: `1px solid ${C.border}`,
              borderRadius: 4, cursor: 'pointer',
            }}>Limpar filtros</button>
          )}
        </div>
        <p style={{ fontSize: 11, color: C.t3, marginBottom: 12 }}>
          Ministeriais agrupados por valor da Jornada · Operacionais separados.
        </p>

        {/* FILTROS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, padding: 12, background: C.inputBg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.t3 }}>
            <Filter size={12} /> Filtros
          </div>
          <FiltroChips label="Valor da Jornada" items={VALORES_JORNADA} selecionados={filtroValores}
                       onToggle={(k) => toggleFiltro(setFiltroValores, k)} />
          <FiltroChips label="Área de Culto (filtra drilldown)" items={AREAS_CULTO} selecionados={filtroAreasCulto}
                       onToggle={(k) => toggleFiltro(setFiltroAreasCulto, k)} corPrimaria={C.primary} corBg={C.primaryBg} />
          <FiltroChips label="Área Administrativa" items={AREAS_ADM_GRUPOS} selecionados={filtroAreasAdm}
                       onToggle={(k) => toggleFiltro(setFiltroAreasAdm, k)} corPrimaria="#06B6D4" corBg="#06B6D420" />
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonBlock height={48} /><SkeletonBlock height={48} /><SkeletonBlock height={48} />
          </div>
        ) : objetivos.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum objetivo cadastrado.</div>
        ) : totalFiltrado === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum objetivo bate com os filtros selecionados.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* MINISTERIAIS por valor */}
            {VALORES_JORNADA.map(v => {
              const lista = grupos.porValor[v.key] || [];
              if (lista.length === 0) return null;
              return (
                <div key={v.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: `2px solid ${v.cor}` }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: v.cor }} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: v.cor, textTransform: 'uppercase', letterSpacing: 0.5 }}>{v.label}</span>
                    <span style={{ fontSize: 10, color: C.t3 }}>· {lista.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {lista.map(o => (
                      <ObjetivoLinha key={o.id} objetivo={o}
                        expanded={expandedObj === o.id}
                        onToggle={() => setExpandedObj(expandedObj === o.id ? null : o.id)}
                        onEdit={() => setEditObj(o)} onRemove={() => removerObjetivo(o)}
                        onAddKr={() => setEditKr({ objetivo_geral_id: o.id, _objetivoLabel: o.nome })}
                        onEditKr={(kr) => setEditKr(kr)} onAfterChange={carregar}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* OPERACIONAIS */}
            {grupos.operacionais.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #06B6D4' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#06B6D4' }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0891B2', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Operacionais · Administração
                  </span>
                  <span style={{ fontSize: 10, color: C.t3 }}>· {grupos.operacionais.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {grupos.operacionais.map(o => (
                    <ObjetivoLinha key={o.id} objetivo={o}
                      expanded={expandedObj === o.id}
                      onToggle={() => setExpandedObj(expandedObj === o.id ? null : o.id)}
                      onEdit={() => setEditObj(o)} onRemove={() => removerObjetivo(o)}
                      onAddKr={() => setEditKr({ objetivo_geral_id: o.id, _objetivoLabel: o.nome })}
                      onEditKr={(kr) => setEditKr(kr)} onAfterChange={carregar}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Modais */}
      {editObj !== null && (
        <ModalObjetivo
          objetivo={editObj}
          direcionadores={direcionadores}
          onClose={() => setEditObj(null)}
          onSaved={() => { setEditObj(null); carregar(); }}
        />
      )}
      {editKr !== null && (
        <ModalKr
          kr={editKr}
          onClose={() => setEditKr(null)}
          onSaved={() => { setEditKr(null); carregar(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// ObjetivoLinha — linha expandivel com KRs e KPIs
// ============================================================================
function FiltroChips({ label, items, selecionados, onToggle, corPrimaria, corBg }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map(it => {
          const sel = selecionados.has(it.key);
          const corBorda = sel ? (it.cor || corPrimaria || C.primary) : C.border;
          const corFundo = sel ? (it.cor ? it.cor + '20' : corBg || C.primaryBg) : 'transparent';
          const corTexto = sel ? (it.cor || corPrimaria || C.primaryDark) : C.t2;
          return (
            <button key={it.key} onClick={() => onToggle(it.key)} style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 99, cursor: 'pointer',
              border: `1px solid ${corBorda}`, background: corFundo, color: corTexto,
            }}>{it.label}</button>
          );
        })}
      </div>
    </div>
  );
}

function ObjetivoLinha({ objetivo, expanded, onToggle, onEdit, onRemove, onAddKr, onEditKr, onAfterChange }) {
  const [detalhes, setDetalhes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [especificosOpen, setEspecificosOpen] = useState(false);

  useEffect(() => {
    if (expanded && !detalhes) {
      setLoading(true);
      estrategiaApi.objetivos.get(objetivo.id)
        .then(setDetalhes)
        .finally(() => setLoading(false));
    }
  }, [expanded, detalhes, objetivo.id]);

  const removerKr = async (kr) => {
    if (!window.confirm(`Remover KR "${kr.titulo}"?`)) return;
    try {
      await estrategiaApi.krs.remove(kr.id);
      toast.success('KR removido');
      setDetalhes(null);
      onAfterChange?.();
    } catch (e) { toast.error(e?.message); }
  };

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 8, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
        <button
          onClick={onToggle}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.t3 }}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, color: C.text }}>{objetivo.nome}</strong>
            {(objetivo.valores || []).map(v => (
              <span key={v} style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 99,
                background: VALOR_CORES[v] + '20', color: VALOR_CORES[v], fontWeight: 700,
              }}>
                {VALOR_LABELS[v] || v}
              </span>
            ))}
          </div>
          {objetivo.indicador_geral && (
            <p style={{ fontSize: 11, color: C.t3, margin: '2px 0 0', lineHeight: 1.4 }}>
              {objetivo.indicador_geral}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 10, color: C.t3 }}>
          <span><strong>{objetivo.total_kpis || 0}</strong> KPIs</span>
          <span><strong>{objetivo.total_krs || 0}</strong> KRs</span>
        </div>
        <button onClick={onEdit} style={btnIcon} title="Editar"><Pencil size={13} /></button>
        <button onClick={onRemove} style={{ ...btnIcon, color: '#ef4444' }} title="Inativar"><Trash2 size={13} /></button>
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)' }}>
          {loading ? (
            <div style={{ padding: 16, fontSize: 12, color: C.t3, textAlign: 'center' }}>Carregando...</div>
          ) : !detalhes ? null : (
            <ResumoGerais
              detalhes={detalhes}
              onAddKr={onAddKr}
              onEditKr={onEditKr}
              removerKr={removerKr}
              onAbrirEspecificos={() => setEspecificosOpen(true)}
            />
          )}
        </div>
      )}

      {especificosOpen && detalhes && (
        <ModalEspecificos
          detalhes={detalhes}
          onClose={() => setEspecificosOpen(false)}
          onEditKr={onEditKr}
          removerKr={removerKr}
        />
      )}
    </div>
  );
}

// ============================================================================
// ResumoGerais — vista compacta default (KPI geral + KRs gerais)
// Mostra apenas o nivel "geral" do objetivo · botao abre modal com cascata.
// ============================================================================
function ResumoGerais({ detalhes, onAddKr, onEditKr, removerKr, onAbrirEspecificos }) {
  const krsGerais = (detalhes.krs || []).filter(k => !k.kr_pai_id);
  const totalEspecificos = (detalhes.krs || []).filter(k => k.kr_pai_id).length;
  const isOperacional = detalhes.tipo_okr === 'operacional';
  const kpis = detalhes.kpis || [];

  return (
    <div>
      {/* KPI Geral · indicador_geral do objetivo */}
      {detalhes.indicador_geral && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--cbrio-card)', borderLeft: `3px solid ${C.primary}`, borderRadius: 4 }}>
          <div style={{ fontSize: 9, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
            KPI Geral
          </div>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{detalhes.indicador_geral}</div>
        </div>
      )}

      {/* KRs Gerais */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h4 style={hh4}><ListChecks size={11} /> KRs Gerais ({krsGerais.length})</h4>
        <button onClick={onAddKr} style={btnGhostSm}><Plus size={12} /> Novo KR</button>
      </div>

      {krsGerais.length === 0 ? (
        <div style={{ fontSize: 11, color: C.t3, padding: 8 }}>
          Nenhum KR ainda. Sugestao: 3 KRs por objetivo (volume, comparacao historica, threshold).
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {krsGerais.map(kr => (
            <div key={kr.id} style={krStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{kr.titulo}</div>
                <div style={{ fontSize: 10, color: C.t3 }}>
                  meta: {kr.meta_valor != null
                    ? `${kr.meta_valor}${kr.unidade ? ' ' + kr.unidade : ''}`
                    : (kr.meta_texto || '—')}
                  {kr.agregacao_cascata && ` · cascata: ${kr.agregacao_cascata}`}
                </div>
              </div>
              <button onClick={() => onEditKr(kr)} style={btnIcon}><Pencil size={11} /></button>
              <button onClick={() => removerKr(kr)} style={{ ...btnIcon, color: '#ef4444' }}><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Botao para abrir cascata 4 colunas (KR Geral · KPI Geral · KR Esp · KPI Esp) */}
      {(totalEspecificos > 0 || isOperacional) && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onAbrirEspecificos} style={{
            padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            background: C.primary, color: '#fff', border: `1px solid ${C.primary}`,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          }}>
            <Activity size={12} />
            {isOperacional
              ? `Ver desdobramento por área administrativa${totalEspecificos > 0 ? ` (${totalEspecificos} específicos)` : kpis.length > 0 ? ` (${kpis.length} KPIs)` : ''}`
              : `Ver desdobramento por área (${totalEspecificos} específicos)`}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ModalEspecificos — modal com a cascata 4 colunas (uso eventual)
// ============================================================================
function ModalEspecificos({ detalhes, onClose, onEditKr, removerKr }) {
  // Fechar com ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: C.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: C.modalBg, borderRadius: 12,
        maxWidth: 1280, width: '100%', maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <header style={{
          padding: '16px 24px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Desdobramento por área
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '2px 0 0' }}>
              {detalhes.nome}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </header>

        <div style={{ padding: 20 }}>
          <TabelaCascataOkr
            detalhes={detalhes}
            onEditKr={onEditKr}
            removerKr={removerKr}
            semHeader
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TabelaCascataOkr — vista de cascata em 4 colunas
// KR Geral · KPI Geral · KR Especifico (por area) · KPI Especifico
// KR Geral e KPI Geral usam rowSpan agrupando as N areas de cada KR.
// Suporta ministerial (6 areas culto) e operacional adm (9 areas adm).
// ============================================================================
const CFG_CULTURA = {
  AREAS: ['kids', 'ami', 'bridge', 'sede', 'online', 'cba'],
  COR: {
    kids:   '#F59E0B', ami: '#3B82F6', bridge: '#8B5CF6',
    sede:   '#10B981', online: '#EC4899', cba: '#6B7280',
  },
  LABEL: null, // usa a area string maiuscula
  // Ministerial: KPI.area = KR.area (mesmo string)
  getKpiArea: (k) => String(k.area || '').toLowerCase(),
};

const CFG_ADM = {
  AREAS: [
    'reserva_espaco', 'cozinha', 'manutencao',
    'logistica_estoque', 'logistica_compras',
    'ti', 'rh', 'financeiro', 'criativo',
  ],
  COR: {
    reserva_espaco:    '#8B5CF6', // hospitalidade
    cozinha:           '#A78BFA',
    manutencao:        '#7C3AED',
    logistica_estoque: '#3B82F6', // logistica
    logistica_compras: '#60A5FA',
    ti:                '#10B981',
    rh:                '#EF4444',
    financeiro:        '#84CC16',
    criativo:          '#EC4899',
  },
  LABEL: {
    reserva_espaco:    'Reserva',
    cozinha:           'Cozinha',
    manutencao:        'Manutenção',
    logistica_estoque: 'Log. Estoque',
    logistica_compras: 'Log. Compras',
    ti:                'TI',
    rh:                'RH',
    financeiro:        'Financeiro',
    criativo:          'Criativo',
  },
  // Adm: KPI.area='sede' mas formula_config.area_responsavel='reserva_espaco' etc
  getKpiArea: (k) => String(k.formula_config?.area_responsavel || '').toLowerCase(),
};

function TabelaCascataOkr({ detalhes, onAddKr, onEditKr, removerKr, semHeader = false }) {
  const cfg = detalhes.tipo_okr === 'operacional' ? CFG_ADM : CFG_CULTURA;

  const krsGerais = (detalhes.krs || []).filter(k => !k.kr_pai_id);
  const krsPorPai = {};
  (detalhes.krs || []).forEach(k => {
    if (k.kr_pai_id) {
      if (!krsPorPai[k.kr_pai_id]) krsPorPai[k.kr_pai_id] = [];
      krsPorPai[k.kr_pai_id].push(k);
    }
  });
  const kpiPorArea = {};
  (detalhes.kpis || []).forEach(k => {
    const a = cfg.getKpiArea(k);
    if (!kpiPorArea[a]) kpiPorArea[a] = [];
    kpiPorArea[a].push(k);
  });
  const areaLabel = (a) => cfg.LABEL?.[a] || String(a || '').toUpperCase();

  return (
    <div>
      {!semHeader && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={hh4}>
          <ListChecks size={11} /> Cascata · {krsGerais.length} KRs gerais &times; {cfg.AREAS.length} {detalhes.tipo_okr === 'operacional' ? 'areas adm' : 'areas'}
          {detalhes.indicador_geral && (
            <span style={{ marginLeft: 8, fontWeight: 400, color: C.t3 }}>
              · KPI principal: <em>{detalhes.indicador_geral}</em>
            </span>
          )}
        </h4>
        {onAddKr && <button onClick={onAddKr} style={btnGhostSm}><Plus size={12} /> Novo KR</button>}
      </div>
      )}

      {krsGerais.length === 0 ? (
        <div style={{ fontSize: 11, color: C.t3, padding: 12, textAlign: 'center', background: 'var(--cbrio-card)', borderRadius: 6 }}>
          Nenhum KR ainda. Sugestao: 3 KRs por objetivo (volume, comparacao historica, threshold).
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--cbrio-card)', borderRadius: 8, border: `1px solid ${C.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 820, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '24%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--cbrio-input-bg)' }}>
                <th style={thGeral}>KR Geral</th>
                <th style={thGeral}>KPI Geral</th>
                <th style={th}>KR Específico (por área)</th>
                <th style={th}>KPI Específico</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {krsGerais.map(kr => {
                const filhos = (krsPorPai[kr.id] || []).slice().sort(
                  (a, b) => cfg.AREAS.indexOf(a.area) - cfg.AREAS.indexOf(b.area)
                );
                const linhas = filhos.length > 0 ? filhos : [null];

                return linhas.map((filho, idx) => {
                  const isFirst = idx === 0;
                  const cor = filho ? (cfg.COR[filho.area] || C.t3) : C.t3;
                  const kpisDaArea = filho ? (kpiPorArea[filho.area] || []) : [];

                  return (
                    <tr key={(filho?.id) || `${kr.id}-empty`}
                        style={{ borderTop: isFirst ? `2px solid ${C.border}` : `1px solid ${C.border}` }}>
                      {/* KR Geral · rowSpan · centralizado horizontal+vertical, com destaque visual */}
                      {isFirst && (
                        <td rowSpan={linhas.length} style={{
                          padding: '16px 14px',
                          verticalAlign: 'middle', textAlign: 'center',
                          background: C.primaryBg,
                          borderRight: `2px solid ${C.primary}40`,
                          color: C.text, lineHeight: 1.4,
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6, lineHeight: 1.35 }}>
                            {kr.titulo}
                          </div>
                          <div style={{
                            fontSize: 11, color: C.primaryDark, fontWeight: 600,
                            padding: '2px 8px', background: C.card, borderRadius: 99,
                            display: 'inline-block', border: `1px solid ${C.primary}40`,
                          }}>
                            meta: {kr.meta_valor != null
                              ? `${kr.meta_valor}${kr.unidade ? ' ' + kr.unidade : ''}`
                              : (kr.meta_texto || '—')}
                          </div>
                          {kr.agregacao_cascata && (
                            <div style={{ fontSize: 9, color: C.t3, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              cascata · <strong>{kr.agregacao_cascata}</strong>
                            </div>
                          )}
                          <div style={{ marginTop: 8, display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button onClick={() => onEditKr(kr)} style={btnIcon} title="Editar"><Pencil size={11} /></button>
                            <button onClick={() => removerKr(kr)} style={{ ...btnIcon, color: '#ef4444' }} title="Remover"><Trash2 size={11} /></button>
                          </div>
                        </td>
                      )}

                      {/* KPI Geral · rowSpan · centralizado horizontal+vertical */}
                      {isFirst && (
                        <td rowSpan={linhas.length} style={{
                          padding: '16px 14px',
                          verticalAlign: 'middle', textAlign: 'center',
                          borderRight: `2px solid ${C.border}`,
                          lineHeight: 1.5,
                        }}>
                          {detalhes.indicador_geral ? (
                            <div style={{ fontSize: 12, color: C.text, fontWeight: 500, fontStyle: 'italic' }}>
                              {detalhes.indicador_geral}
                            </div>
                          ) : (
                            <span style={{ color: C.t3, fontStyle: 'italic', fontSize: 11 }}>—</span>
                          )}
                        </td>
                      )}

                      {/* KR Especifico · 1 por linha (por area) */}
                      <td style={{ ...td, borderLeft: `3px solid ${cor}` }}>
                        {filho ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 9, padding: '2px 8px', borderRadius: 99,
                              background: cor + '20', color: cor, fontWeight: 700,
                              textTransform: 'uppercase', minWidth: 50, textAlign: 'center',
                              letterSpacing: 0.5,
                            }}>
                              {areaLabel(filho.area)}
                            </span>
                            <span style={{ fontSize: 11, color: C.t2 }}>
                              meta: <strong style={{ color: C.text }}>{filho.meta_valor != null
                                ? `${filho.meta_valor}${filho.unidade ? ' ' + filho.unidade : ''}`
                                : (filho.meta_texto || '—')}</strong>
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: C.t3, fontStyle: 'italic', fontSize: 11 }}>
                            Sem filhos · KR geral não desdobrado por área
                          </span>
                        )}
                      </td>

                      {/* KPI Especifico · ID + descricao do KPI tatico daquela area */}
                      <td style={td}>
                        {kpisDaArea.length === 0 ? (
                          <span style={{ color: C.t3, fontStyle: 'italic', fontSize: 11 }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {kpisDaArea.map(k => (
                              <div key={k.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                <span style={{
                                  fontSize: 9, padding: '2px 6px', borderRadius: 4,
                                  background: C.primaryBg, color: C.primaryDark, fontWeight: 700,
                                  minWidth: 52, textAlign: 'center', flexShrink: 0,
                                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                                }}>
                                  {k.id}
                                </span>
                                <span style={{ fontSize: 11, color: C.t2, lineHeight: 1.4 }} title={k.indicador}>
                                  {(k.descricao || k.indicador).slice(0, 60)}
                                  {(k.descricao || k.indicador || '').length > 60 ? '…' : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Acoes filho */}
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {filho && (
                          <button onClick={() => onEditKr(filho)} style={btnIcon} title="Editar meta desta área"><Pencil size={11} /></button>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 10, color: C.t3, marginTop: 8, fontStyle: 'italic' }}>
        KR geral consolida via cascata (sum/avg/etc) os filhos por area · meta de cada area editavel individualmente.
      </p>
    </div>
  );
}

// ============================================================================
// ModalObjetivo — criar/editar objetivo geral
// ============================================================================
function ModalObjetivo({ objetivo, direcionadores, onClose, onSaved }) {
  const isNovo = !objetivo.id;
  const [form, setForm] = useState({
    nome: objetivo.nome || '',
    descricao: objetivo.descricao || '',
    indicador_geral: objetivo.indicador_geral || '',
    valores: objetivo.valores || [],
    direcionador_id: objetivo.direcionador_id || direcionadores[0]?.id || null,
    ordem: objetivo.ordem || 99,
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleValor = (v) => set('valores',
    form.valores.includes(v) ? form.valores.filter(x => x !== v) : [...form.valores, v]
  );

  const submit = async () => {
    if (!form.nome.trim()) return toast.error('Nome obrigatorio');
    setSaving(true);
    try {
      if (isNovo) {
        await estrategiaApi.objetivos.create(form);
        toast.success('Objetivo criado');
      } else {
        await estrategiaApi.objetivos.update(objetivo.id, form);
        toast.success('Objetivo atualizado');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isNovo ? 'Novo Objetivo Geral' : 'Editar Objetivo Geral'} onSubmit={submit} saving={saving}>
      <Field label="Nome *">
        <input value={form.nome} onChange={e => set('nome', e.target.value)} style={inp} placeholder='Ex: "Aumentar batismos"' />
      </Field>
      <Field label="Descricao">
        <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
      </Field>
      <Field label="Indicador Geral (como medir no agregado)">
        <input value={form.indicador_geral} onChange={e => set('indicador_geral', e.target.value)} style={inp}
          placeholder='Ex: "% crescimento de batismos em relacao ao ultimo evento"' />
      </Field>
      <Field label="Valores da Jornada (alimentados por este objetivo)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(VALOR_LABELS).map(([k, lbl]) => {
            const ativo = form.valores.includes(k);
            return (
              <button
                key={k}
                onClick={() => toggleValor(k)}
                style={{
                  padding: '5px 12px', borderRadius: 99,
                  fontSize: 11, fontWeight: 600,
                  border: ativo ? `2px solid ${VALOR_CORES[k]}` : `1px solid ${C.border}`,
                  background: ativo ? VALOR_CORES[k] + '20' : 'transparent',
                  color: ativo ? VALOR_CORES[k] : C.t3,
                  cursor: 'pointer',
                }}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Direcionador">
        <select value={form.direcionador_id || ''} onChange={e => set('direcionador_id', e.target.value || null)} style={inp}>
          <option value="">— Sem direcionador —</option>
          {direcionadores.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
      </Field>
      <Field label="Ordem">
        <input type="number" value={form.ordem} onChange={e => set('ordem', Number(e.target.value) || 99)} style={inp} />
      </Field>
    </Modal>
  );
}

// ============================================================================
// ModalKr — criar/editar KR (geral ou especifico)
// ============================================================================
function ModalKr({ kr, onClose, onSaved }) {
  const isNovo = !kr.id;
  const [form, setForm] = useState({
    titulo: kr.titulo || '',
    descricao: kr.descricao || '',
    formula_calculo: kr.formula_calculo || '',
    meta_valor: kr.meta_valor ?? '',
    meta_texto: kr.meta_texto || '',
    unidade: kr.unidade || '',
    ordem: kr.ordem || 99,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.titulo.trim()) return toast.error('Titulo obrigatorio');
    setSaving(true);
    try {
      const payload = {
        ...form,
        meta_valor: form.meta_valor === '' ? null : Number(form.meta_valor),
      };
      if (isNovo) {
        // Vincular ao parent (objetivo OU KPI)
        if (kr.objetivo_geral_id) payload.objetivo_geral_id = kr.objetivo_geral_id;
        if (kr.kpi_id) payload.kpi_id = kr.kpi_id;
        await estrategiaApi.krs.create(payload);
        toast.success('KR criado');
      } else {
        await estrategiaApi.krs.update(kr.id, payload);
        toast.success('KR atualizado');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const tipoLabel = kr.objetivo_geral_id || kr._objetivoLabel
    ? `KR Geral · objetivo "${kr._objetivoLabel || ''}"`
    : 'KR Especifico (do KPI)';

  return (
    <Modal onClose={onClose} title={isNovo ? 'Novo KR' : 'Editar KR'} onSubmit={submit} saving={saving}>
      <div style={{
        fontSize: 11, color: C.primaryDark, fontWeight: 600,
        padding: '6px 10px', background: C.primaryBg, borderRadius: 6, marginBottom: 12,
      }}>
        {tipoLabel}
      </div>
      <Field label="Titulo *">
        <input value={form.titulo} onChange={e => set('titulo', e.target.value)} style={inp}
          placeholder='Ex: "Frequencia media mensal >= 2500"' />
      </Field>
      <Field label="Descricao">
        <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
      </Field>
      <Field label="Formula de calculo">
        <input value={form.formula_calculo} onChange={e => set('formula_calculo', e.target.value)} style={inp}
          placeholder='Ex: "media(frequencia_diaria) no mes"' />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Meta (valor)">
          <input type="number" value={form.meta_valor} onChange={e => set('meta_valor', e.target.value)} style={inp} placeholder="Numero" />
        </Field>
        <Field label="Unidade">
          <input value={form.unidade} onChange={e => set('unidade', e.target.value)} style={inp} placeholder="ex: %, pessoas, R$" />
        </Field>
      </div>
      <Field label="Meta (texto descritivo, alternativa)">
        <input value={form.meta_texto} onChange={e => set('meta_texto', e.target.value)} style={inp}
          placeholder="ex: '60% dos lideres treinados em 12 meses'" />
      </Field>
      <Field label="Ordem">
        <input type="number" value={form.ordem} onChange={e => set('ordem', Number(e.target.value) || 99)} style={inp} />
      </Field>
    </Modal>
  );
}

// ============================================================================
// Componentes auxiliares
// ============================================================================
function Modal({ title, children, onClose, onSubmit, saving }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: C.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}
    onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.modalBg, borderRadius: 12, maxWidth: 600, width: '100%',
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
      }}>
        <header style={{ padding: 18, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}>
            <X size={18} />
          </button>
        </header>
        <div style={{ padding: 18 }}>{children}</div>
        <footer style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancelar</button>
          <button onClick={onSubmit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>
            <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  );
}

const cardStyle = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18,
};
const hh3 = {
  fontSize: 13, fontWeight: 700, color: C.t2, margin: 0, marginBottom: 8,
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const hh4 = {
  fontSize: 11, fontWeight: 700, color: C.t2, margin: 0,
  display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};
const inp = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: `1px solid ${C.border}`, background: C.inputBg, color: C.text,
  fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
};
const krStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 10px', background: C.card, borderRadius: 6,
  border: `1px solid ${C.border}`,
};
const btnPrimary = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const btnGhost = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer',
};
const btnGhostSm = {
  padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
  background: 'transparent', color: C.primaryDark, border: `1px solid ${C.primary}40`, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
const btnIcon = {
  background: 'transparent', border: 'none', padding: 6, borderRadius: 4,
  cursor: 'pointer', color: 'var(--cbrio-text3)',
};

const th = {
  textAlign: 'left', padding: '10px 12px', fontSize: 10,
  color: 'var(--cbrio-text3)', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '2px solid var(--cbrio-border)',
};

// Cabeçalhos das colunas "Geral" — centralizados com leve destaque visual.
const thGeral = {
  ...th,
  textAlign: 'center',
  background: 'rgba(0, 179, 157, 0.08)',
  color: '#00897B',
};

const td = {
  padding: '10px 12px', fontSize: 11, color: 'var(--cbrio-text)',
  verticalAlign: 'top', lineHeight: 1.45,
};
