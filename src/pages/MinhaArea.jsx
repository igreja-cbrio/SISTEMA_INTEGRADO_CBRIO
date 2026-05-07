// ============================================================================
// /minha-area — KPIs do lider, agrupados por VALOR (nao periodicidade)
//
// Substitui /meus-kpis. Mais alinhado com como o lider pensa:
// "como ta o Servir no meu ministerio?", nao "o que vence semana?".
//
// Mobile-first: cards compactos, modal de preencher otimizado pra dedo.
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { kpis as kpisApi } from '../api';
import { useKpis } from '../hooks/useKpis';
import { useMyKpiAreas } from '../hooks/useMyKpiAreas';
import KpiQuickFillModal from '../components/KpiQuickFillModal';
import KpiEditorModal from '../components/KpiEditorModal';
import OkrRevisaoModal from '../components/OkrRevisaoModal';
import KpiDetalheModal from '../components/KpiDetalheModal';
import { Activity, Pencil, Plus, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock, TrendingDown, MinusCircle, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};

const VALORES = [
  { key: 'seguir',       label: 'Seguir a Jesus',       cor: '#8B5CF6' },
  { key: 'conectar',     label: 'Conectar com Pessoas', cor: '#3B82F6' },
  { key: 'investir',     label: 'Investir Tempo c/ Deus', cor: '#F59E0B' },
  { key: 'servir',       label: 'Servir em Comunidade', cor: '#10B981' },
  { key: 'generosidade', label: 'Viver Generosamente',  cor: '#EC4899' },
];

const STATUS_VISUAL = {
  no_alvo:  { Icon: CheckCircle2, cor: '#10B981', bg: '#10B98118', label: 'No alvo' },
  atras:    { Icon: Clock,        cor: '#F59E0B', bg: '#F59E0B18', label: 'Atras' },
  critico:  { Icon: TrendingDown, cor: '#EF4444', bg: '#EF444418', label: 'Critico' },
  sem_dado: { Icon: MinusCircle,  cor: '#9CA3AF', bg: '#9CA3AF18', label: 'Sem dado' },
};

function periodKey(periodicidade, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  switch (periodicidade) {
    case 'semanal': {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    case 'mensal': return `${y}-${m}`;
    case 'trimestral': return `${y}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    case 'semestral': return `${y}-S${date.getUTCMonth() < 6 ? 1 : 2}`;
    case 'anual': return `${y}`;
    default: return `${y}-${m}`;
  }
}

export default function MinhaArea() {
  const { profile } = useAuth();
  const { kpis, isLoading, refetch } = useKpis();
  const { kpiAreas, isAdmin, canEditAny } = useMyKpiAreas();

  const [registros, setRegistros] = useState([]);
  const [trajetorias, setTrajetorias] = useState([]);
  const [fillKpi, setFillKpi] = useState(null);
  const [editKpi, setEditKpi] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [revisarKpi, setRevisarKpi] = useState(null);
  const [detalheKpiId, setDetalheKpiId] = useState(null);
  const [valorExpandido, setValorExpandido] = useState(null);

  // Todos veem todos os KPIs ativos (read). Edicao restrita por kpiAreas no card.
  const meusKpis = useMemo(() => kpis.filter(k => k.ativo), [kpis]);

  // Areas que o usuario pode editar
  const podeEditar = useCallback((kpi) => {
    if (isAdmin) return true;
    return kpiAreas.includes(String(kpi.area_db || '').toLowerCase());
  }, [kpiAreas, isAdmin]);

  // Carregar registros e trajetorias dos meus KPIs
  const loadDados = useCallback(async () => {
    if (!meusKpis.length) { setRegistros([]); setTrajetorias([]); return; }
    try {
      const areasUnicas = Array.from(new Set(meusKpis.map(k => k.area_db).filter(Boolean)));
      const arrs = await Promise.all(areasUnicas.map(a => kpisApi.v2.registros.list({ area: a })));
      setRegistros(arrs.flat());
    } catch (e) {
      console.error('[minha-area] registros', e);
    }
  }, [meusKpis]);
  useEffect(() => { loadDados(); }, [loadDados]);

  const ultimoRegPorIndicador = useMemo(() => {
    const m = {};
    registros.forEach(r => {
      const cur = m[r.indicador_id];
      if (!cur || (r.data_preenchimento || '') > (cur.data_preenchimento || '')) {
        m[r.indicador_id] = r;
      }
    });
    return m;
  }, [registros]);

  function statusKpi(kpi) {
    const reg = ultimoRegPorIndicador[kpi.id];
    const periodoEsperado = periodKey(kpi.periodicidade);
    if (!reg) return 'sem_dado';
    // Se KPI tem trajetoria, calcular vs checkpoint. Por ora usa simples:
    if (reg.periodo_referencia === periodoEsperado) return 'no_alvo';
    return 'atras';
  }

  // Agrupar por valor
  const porValor = useMemo(() => {
    const m = {};
    VALORES.forEach(v => { m[v.key] = []; });
    meusKpis.forEach(k => {
      (k.valores || []).forEach(v => {
        if (m[v]) m[v].push(k);
      });
    });
    return m;
  }, [meusKpis]);

  // Stats gerais
  const stats = useMemo(() => {
    let no_alvo = 0, atras = 0, sem_dado = 0;
    meusKpis.forEach(k => {
      const s = statusKpi(k);
      if (s === 'no_alvo') no_alvo++;
      else if (s === 'atras' || s === 'critico') atras++;
      else sem_dado++;
    });
    return { total: meusKpis.length, no_alvo, atras, sem_dado };
  }, [meusKpis, ultimoRegPorIndicador]);

  const handleSaved = () => {
    setFillKpi(null);
    refetch();
    setTimeout(loadDados, 200);
    toast.success('Valor registrado');
  };

  if (isLoading) {
    return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando...</div>;
  }

  // Todos veem todos os KPIs — quem nao lidera area ve em modo leitura
  // (sem botao Preencher/Editar nos cards)
  const apenasLeitura = !isAdmin && kpiAreas.length === 0;
  if (false) {
    return (
      <div style={{ padding: '40px 20px', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <Activity size={32} style={{ color: C.t3, marginBottom: 12 }} />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Voce ainda nao lidera nenhuma area</h1>
        <p style={{ fontSize: 13, color: C.t3 }}>
          Peca para um administrador atribuir suas areas em <strong>/admin/kpi-areas</strong>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={22} style={{ color: C.primary }} />
            Minha Area
          </h1>
          <p style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
            {isAdmin ? (
              <>Voce ve <strong>todos os KPIs</strong> e edita qualquer um (admin/diretor)</>
            ) : kpiAreas.length === 0 ? (
              <>Voce esta em modo leitura — sem area atribuida pra editar</>
            ) : (
              <>
                Voce ve todos os KPIs · edita apenas: {kpiAreas.map(a => (
                  <span key={a} style={{ marginRight: 6, padding: '2px 10px', borderRadius: 99, background: C.primaryBg, color: C.primaryDark, fontWeight: 600, fontSize: 11, textTransform: 'capitalize' }}>{a}</span>
                ))}
              </>
            )}
          </p>
        </div>
        {canEditAny && (
          <button onClick={() => setCreateOpen(true)} style={btnPrimary}>
            <Plus size={14} /> Novo KPI
          </button>
        )}
      </header>

      {/* Stats topo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
        <Stat label="Total" value={stats.total} cor={C.text} />
        <Stat label="Em dia" value={stats.no_alvo} cor="#10B981" />
        <Stat label="Atras / Critico" value={stats.atras} cor="#EF4444" />
        <Stat label="Sem dado" value={stats.sem_dado} cor="#9CA3AF" />
      </div>

      {/* Acordeao por valor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {VALORES.map(v => {
          const kpisDoValor = porValor[v.key] || [];
          if (kpisDoValor.length === 0) return null;

          const pendentes = kpisDoValor.filter(k => statusKpi(k) !== 'no_alvo').length;
          const expanded = valorExpandido === v.key;

          return (
            <section key={v.key} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${v.cor}`,
              borderRadius: 8, overflow: 'hidden',
            }}>
              <button
                onClick={() => setValorExpandido(expanded ? null : v.key)}
                style={{
                  width: '100%', padding: 14,
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                {expanded ? <ChevronDown size={16} style={{ color: C.t3 }} /> : <ChevronRight size={16} style={{ color: C.t3 }} />}
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: v.cor }} />
                <strong style={{ fontSize: 14, color: C.text }}>{v.label}</strong>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--cbrio-input-bg)', color: C.t2, fontWeight: 600, marginLeft: 'auto' }}>
                  {kpisDoValor.length} KPI{kpisDoValor.length === 1 ? '' : 's'}
                </span>
                {pendentes > 0 && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#FEE2E2', color: '#B91C1C', fontWeight: 700 }}>
                    {pendentes} pendente{pendentes === 1 ? '' : 's'}
                  </span>
                )}
              </button>

              {expanded && (
                <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12 }}>
                    {kpisDoValor.map(kpi => (
                      <KpiCard
                        key={kpi.id}
                        kpi={kpi}
                        status={statusKpi(kpi)}
                        ultimo={ultimoRegPorIndicador[kpi.id]}
                        canEdit={podeEditar(kpi)}
                        onPreencher={() => setFillKpi(kpi)}
                        onEditar={() => setEditKpi(kpi)}
                        onRevisar={() => setRevisarKpi(kpi)}
                        onDetalhe={() => setDetalheKpiId(kpi.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Modais */}
      <KpiQuickFillModal
        open={!!fillKpi}
        kpi={fillKpi}
        periodKey={fillKpi ? periodKey(fillKpi.periodicidade) : ''}
        onClose={() => setFillKpi(null)}
        onSaved={handleSaved}
      />
      {editKpi && (
        <KpiEditorModal
          open={!!editKpi}
          kpi={editKpi}
          onClose={() => setEditKpi(null)}
          onSaved={() => { setEditKpi(null); refetch(); toast.success('KPI atualizado'); }}
        />
      )}
      {createOpen && (
        <KpiEditorModal
          open={createOpen}
          kpi={null}
          defaultArea={kpiAreas[0] || ''}
          allowedAreas={isAdmin ? null : kpiAreas}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); refetch(); toast.success('KPI criado'); }}
        />
      )}
      {revisarKpi && (
        <OkrRevisaoModal
          open={!!revisarKpi}
          kpi={revisarKpi}
          onClose={() => setRevisarKpi(null)}
          onSaved={() => { setRevisarKpi(null); toast.success('Revisao registrada'); }}
        />
      )}

      <KpiDetalheModal
        open={!!detalheKpiId}
        kpiId={detalheKpiId}
        onClose={() => setDetalheKpiId(null)}
        onUpdated={() => { refetch(); loadDados(); }}
      />
    </div>
  );
}

function KpiCard({ kpi, status, ultimo, canEdit, onPreencher, onEditar, onRevisar, onDetalhe }) {
  const sv = STATUS_VISUAL[status] || STATUS_VISUAL.sem_dado;
  const Icon = sv.Icon;
  const podeRevisar = status === 'critico' || status === 'atras';

  return (
    <div style={{
      background: 'var(--cbrio-input-bg)', border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${sv.cor}`,
      borderRadius: 6, padding: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <Icon size={14} style={{ color: sv.cor, flexShrink: 0 }} />
        <strong style={{ fontSize: 12, color: C.text, flex: 1, minWidth: 200 }}>{kpi.indicador}</strong>
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'var(--cbrio-card)', color: C.t2, fontWeight: 600, textTransform: 'capitalize' }}>{kpi.area}</span>
        {kpi.is_okr && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>OKR</span>}
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: sv.bg, color: sv.cor, fontWeight: 700 }}>{sv.label}</span>
      </div>

      <div style={{ fontSize: 10, color: C.t3, marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {kpi.meta_descricao && <span><strong>Meta:</strong> {kpi.meta_descricao}{kpi.unidade ? ' ' + kpi.unidade : ''}</span>}
        {ultimo && <span><strong>Ultimo:</strong> {ultimo.valor_realizado ?? '—'} ({ultimo.periodo_referencia})</span>}
        <span style={{ textTransform: 'capitalize' }}>{kpi.periodicidade}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={onPreencher} disabled={!canEdit} style={{ ...btnPrimarySm, opacity: canEdit ? 1 : 0.5, cursor: canEdit ? 'pointer' : 'not-allowed' }}>
          Preencher
        </button>
        {canEdit && (
          <button onClick={onEditar} style={btnGhostSm}>
            <Pencil size={11} /> Editar
          </button>
        )}
        <button onClick={onDetalhe} style={btnGhostSm}>
          <Activity size={11} /> Detalhe
        </button>
        {podeRevisar && (
          <button onClick={onRevisar} style={{ ...btnGhostSm, color: sv.cor, borderColor: sv.cor + '60' }}>
            <ClipboardCheck size={11} /> Revisar
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, cor }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: C.t3, marginTop: 4, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

const btnPrimary = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const btnPrimarySm = {
  padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
  background: C.primary, color: '#fff', border: 'none',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
const btnGhostSm = {
  padding: '5px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
  background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
