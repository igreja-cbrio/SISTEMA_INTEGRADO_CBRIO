// ============================================================================
// /meus-kpis — Tela do lider de area
//
// Mostra apenas os KPIs cuja `area` esta em profile.kpi_areas.
// Admin/diretor ve todos.
// Cards agrupados por periodicidade, com botao Preencher (abre
// KpiQuickFillModal), botao Editar (abre KpiEditorModal), chips dos
// 5 valores que cada KPI alimenta, e indicador "ja preenchido nesse
// periodo".
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useKpis } from '../hooks/useKpis';
import { useMyKpiAreas } from '../hooks/useMyKpiAreas';
import { kpis as kpisApi } from '../api';
import KpiQuickFillModal from '../components/KpiQuickFillModal';
import KpiEditorModal from '../components/KpiEditorModal';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Pencil, Plus, Activity, Clock, CheckCircle2, AlertCircle, Heart } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
  green: '#10b981', greenBg: '#10b98120',
  amber: '#f59e0b', amberBg: '#f59e0b20',
  red: '#ef4444', redBg: '#ef444420',
};

const PERIODICIDADE_LABEL = {
  semanal: 'Esta semana',
  mensal: 'Este mês',
  trimestral: 'Este trimestre',
  semestral: 'Este semestre',
  anual: 'Este ano',
};

const PERIODICIDADE_ORDER = ['semanal', 'mensal', 'trimestral', 'semestral', 'anual'];

const VALORES_LABEL = {
  seguir: { label: 'Seguir', cor: '#8b5cf6' },
  conectar: { label: 'Conectar', cor: '#3b82f6' },
  investir: { label: 'Investir', cor: '#f59e0b' },
  servir: { label: 'Servir', cor: '#10b981' },
  generosidade: { label: 'Generosidade', cor: '#ec4899' },
};

// Calcula chave de periodo no cliente (espelha periodoAtual do backend)
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

// Mapa lower-area -> areas ativas do user
function isMyArea(kpi, kpiAreas, isAdmin) {
  if (isAdmin) return true;
  const a = String(kpi.area_db || kpi.area || '').toLowerCase();
  return kpiAreas.includes(a);
}

export default function MeusKpis() {
  const { kpis, isLoading, refetch } = useKpis();
  const { kpiAreas, isAdmin, canEditAny } = useMyKpiAreas();
  const [registros, setRegistros] = useState([]); // todos os registros recentes do user
  const [loadingRegs, setLoadingRegs] = useState(false);
  const [fillKpi, setFillKpi] = useState(null);
  const [editKpi, setEditKpi] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  // KPIs filtrados pelas minhas areas
  const meusKpis = useMemo(() => {
    return kpis.filter(k => k.ativo && isMyArea(k, kpiAreas, isAdmin));
  }, [kpis, kpiAreas, isAdmin]);

  // Agrupa por periodicidade
  const porPeriodicidade = useMemo(() => {
    const m = {};
    meusKpis.forEach(k => {
      const p = k.periodicidade || 'mensal';
      if (!m[p]) m[p] = [];
      m[p].push(k);
    });
    return m;
  }, [meusKpis]);

  // Carrega registros do periodo atual de cada KPI pra mostrar status
  // "ja preenchido"
  useEffect(() => {
    if (!meusKpis.length) { setRegistros([]); return; }
    setLoadingRegs(true);
    (async () => {
      try {
        // Busca todos os registros (limit 200) recentes por area dos KPIs
        // que vou exibir. Backend filtra por area se passado.
        const areasUnicas = Array.from(new Set(meusKpis.map(k => k.area_db).filter(Boolean)));
        const all = [];
        for (const area of areasUnicas) {
          const rs = await kpisApi.v2.registros.list({ area });
          all.push(...(rs || []));
        }
        setRegistros(all);
      } catch (e) {
        console.error('[meus-kpis] registros', e);
      } finally {
        setLoadingRegs(false);
      }
    })();
  }, [meusKpis]);

  // index registros por (indicador_id, periodo)
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
    if (!reg) return { tipo: 'pendente', label: 'Pendente', cor: C.red, corBg: C.redBg, Icon: AlertCircle };
    if (reg.periodo_referencia === periodoEsperado) {
      return { tipo: 'ok', label: 'Em dia', cor: C.green, corBg: C.greenBg, Icon: CheckCircle2 };
    }
    return { tipo: 'atrasado', label: 'Atrasado', cor: C.amber, corBg: C.amberBg, Icon: Clock };
  }

  const handleSaved = () => {
    setFillKpi(null);
    refetch();
    // Refaz fetch dos registros
    setRegistros([]);
    setTimeout(() => {
      const areasUnicas = Array.from(new Set(meusKpis.map(k => k.area_db).filter(Boolean)));
      Promise.all(areasUnicas.map(area => kpisApi.v2.registros.list({ area })))
        .then(arrs => setRegistros(arrs.flat()))
        .catch(() => {});
    }, 200);
    toast.success('Valor registrado');
  };

  if (isLoading) {
    return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando KPIs...</div>;
  }

  if (!isAdmin && kpiAreas.length === 0) {
    return (
      <div style={{ padding: '40px 32px', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <Heart size={32} style={{ color: C.t3, marginBottom: 12 }} />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Voce ainda nao lidera nenhuma area</h1>
        <p style={{ fontSize: 13, color: C.t3 }}>
          Peca para um administrador atribuir suas areas em <strong>/admin/kpi-areas</strong>.
          Depois, voce ve aqui apenas os KPIs que precisa preencher.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={22} style={{ color: C.primary }} /> Meus KPIs
          </h1>
          <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
            {isAdmin ? (
              <>Voce esta vendo <strong>todos os KPIs</strong> (admin/diretor).</>
            ) : (
              <>Suas areas: {kpiAreas.map(a => (
                <span key={a} style={{ marginRight: 6, padding: '2px 10px', borderRadius: 99, background: C.primaryBg, color: C.primary, fontWeight: 600, fontSize: 11 }}>{a}</span>
              ))}</>
            )}
          </p>
        </div>
        {canEditAny && (
          <Button onClick={() => setCreateOpen(true)} variant="outline">
            <Plus size={14} style={{ marginRight: 4 }} /> Novo KPI da minha area
          </Button>
        )}
      </div>

      {meusKpis.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.t3, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          Nenhum KPI ativo nas suas areas ainda. {canEditAny && 'Clique em "Novo KPI da minha area" para criar o primeiro.'}
        </div>
      ) : (
        PERIODICIDADE_ORDER.filter(p => porPeriodicidade[p]?.length).map(p => (
          <SecaoPeriodicidade
            key={p}
            periodicidade={p}
            kpis={porPeriodicidade[p]}
            statusKpi={statusKpi}
            ultimoRegPorIndicador={ultimoRegPorIndicador}
            onPreencher={setFillKpi}
            onEditar={setEditKpi}
            canEditArea={(kpi) => isAdmin || kpiAreas.includes(String(kpi.area_db || '').toLowerCase())}
          />
        ))
      )}

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
    </div>
  );
}

function SecaoPeriodicidade({ periodicidade, kpis, statusKpi, ultimoRegPorIndicador, onPreencher, onEditar, canEditArea }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
        {PERIODICIDADE_LABEL[periodicidade] || periodicidade} <span style={{ fontSize: 11, color: C.t3, fontWeight: 400 }}>({kpis.length})</span>
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {kpis.map(kpi => {
          const status = statusKpi(kpi);
          const reg = ultimoRegPorIndicador[kpi.id];
          const StatusIcon = status.Icon;
          const podeEditar = canEditArea(kpi);
          return (
            <div key={kpi.id} style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: C.t3, fontWeight: 600 }}>{kpi.id} · {kpi.area}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 2 }}>{kpi.indicador}</div>
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
                  background: status.corBg, color: status.cor,
                }}>
                  <StatusIcon size={11} /> {status.label}
                </span>
              </div>

              {kpi.descricao && (
                <div style={{ fontSize: 11, color: C.t3, marginBottom: 8, lineHeight: 1.4 }}>{kpi.descricao}</div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: C.t2, marginBottom: 8, flexWrap: 'wrap' }}>
                {kpi.meta_descricao && (
                  <span><strong style={{ color: C.text }}>Meta:</strong> {kpi.meta_descricao}{kpi.unidade ? ` ${kpi.unidade}` : ''}</span>
                )}
                {reg && (
                  <span>
                    <strong style={{ color: C.text }}>Último:</strong> {reg.valor_realizado ?? reg.valor_texto ?? '—'}
                    <span style={{ color: C.t3, marginLeft: 4 }}>({reg.periodo_referencia})</span>
                  </span>
                )}
              </div>

              {kpi.valores?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  {kpi.valores.map(v => {
                    const meta = VALORES_LABEL[v];
                    if (!meta) return null;
                    return (
                      <span key={v} title={`Alimenta: ${meta.label}`} style={{
                        fontSize: 10, padding: '1px 8px', borderRadius: 99,
                        background: meta.cor + '20', color: meta.cor, fontWeight: 600,
                      }}>{meta.label}</span>
                    );
                  })}
                  {kpi.is_okr && (
                    <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 99, background: '#f97316' + '20', color: '#f97316', fontWeight: 700 }}>OKR</span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                <Button size="sm" onClick={() => onPreencher(kpi)} disabled={!podeEditar} style={{ flex: 1 }}>
                  Preencher
                </Button>
                {podeEditar && (
                  <Button size="sm" variant="outline" onClick={() => onEditar(kpi)} title="Editar definição/meta">
                    <Pencil size={13} />
                  </Button>
                )}
              </div>
              {kpi.is_auto && (
                <div style={{ fontSize: 10, color: C.t3, marginTop: 6, textAlign: 'center', fontStyle: 'italic' }}>
                  Coletado automaticamente · você pode complementar manualmente
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
