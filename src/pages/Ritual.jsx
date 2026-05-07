// ============================================================================
// /ritual — Ritual Mensal de Revisao OKR
//
// "Regra de ouro": todo desvio gera causa, decisao, responsavel, proximo passo.
//
// Modos:
//   - Lista: tela permanente com KPIs em alerta nao revisados
//   - Guiado: wizard sequencial (1 KPI por vez, automatico) — Marcos
//             abre dia 5 do mes, faz tudo de uma vez
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { ritual as ritualApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { ClipboardCheck, ChevronRight, ChevronLeft, AlertCircle, CheckCircle2, Clock, TrendingDown, Play, X, Activity } from 'lucide-react';
import { toast } from 'sonner';
import OkrRevisaoModal from '../components/OkrRevisaoModal';
import KpiDetalheModal from '../components/KpiDetalheModal';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};

const STATUS_VISUAL = {
  critico: { Icon: TrendingDown, cor: '#EF4444', bg: '#FEE2E2', label: 'Critico' },
  atras:   { Icon: Clock,        cor: '#F59E0B', bg: '#FEF3C7', label: 'Atras' },
};

function periodoMensalAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodoLabel(p) {
  const [ano, mes] = (p || '').split('-');
  const meses = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[Number(mes) - 1] || mes} ${ano}`;
}

export default function Ritual() {
  const { profile } = useAuth();
  const periodo = periodoMensalAtual();

  const [resumo, setResumo] = useState(null);
  const [pendentes, setPendentes] = useState([]);
  const [revisados, setRevisados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState('pendentes');
  const [revisarKpi, setRevisarKpi] = useState(null);
  const [modoGuiado, setModoGuiado] = useState(false);
  const [indiceGuiado, setIndiceGuiado] = useState(0);
  const [detalheKpiId, setDetalheKpiId] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p, rv] = await Promise.all([
        ritualApi.resumo(periodo),
        ritualApi.pendentes(periodo),
        ritualApi.revisados(periodo),
      ]);
      setResumo(r);
      setPendentes(p);
      setRevisados(rv);
    } catch (e) {
      toast.error(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  const iniciarGuiado = () => {
    if (pendentes.length === 0) return;
    setModoGuiado(true);
    setIndiceGuiado(0);
    setRevisarKpi(pendentes[0]);
  };

  const proximoGuiado = () => {
    const novoIdx = indiceGuiado + 1;
    if (novoIdx >= pendentes.length) {
      // Termina o guiado
      setModoGuiado(false);
      setRevisarKpi(null);
      carregar();
      toast.success('Ritual concluido!');
      return;
    }
    setIndiceGuiado(novoIdx);
    setRevisarKpi(pendentes[novoIdx]);
  };

  const sairGuiado = () => {
    setModoGuiado(false);
    setRevisarKpi(null);
    carregar();
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClipboardCheck size={22} style={{ color: C.primary }} />
          Ritual Mensal · {periodoLabel(periodo)}
        </h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          Regra de ouro: todo desvio gera causa, decisao, responsavel e proximo passo.
        </p>
      </header>

      {/* Resumo */}
      {resumo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Stat label="Em alerta" value={resumo.total_em_alerta} cor={C.text} />
          <Stat label="Revisados" value={resumo.total_revisados} cor="#10B981" />
          <Stat label="Pendentes" value={resumo.total_pendentes} cor="#EF4444" />
          <Stat label="Concluido" value={`${resumo.percentual_concluido}%`} cor={C.primary} />
          <Stat label="Dias ate fim do mes" value={resumo.dias_restantes_mes} cor={C.t2} />
        </div>
      )}

      {/* Barra de progresso */}
      {resumo && resumo.total_em_alerta > 0 && (
        <div style={{ marginBottom: 16, height: 8, background: 'var(--cbrio-input-bg)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${resumo.percentual_concluido}%`, height: '100%', background: resumo.percentual_concluido >= 100 ? '#10B981' : C.primary, transition: 'width 0.3s' }} />
        </div>
      )}

      {/* Botao iniciar guiado */}
      {!modoGuiado && pendentes.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>
            Voce pode revisar 1 por 1 ou iniciar o modo guiado (passa por todos em sequencia, ~25min).
          </p>
          <button
            onClick={iniciarGuiado}
            style={{
              padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Play size={14} /> Iniciar revisao guiada ({pendentes.length})
          </button>
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `2px solid ${C.border}` }}>
        <Tab ativo={aba === 'pendentes'} onClick={() => setAba('pendentes')}>
          <AlertCircle size={13} /> Pendentes ({pendentes.length})
        </Tab>
        <Tab ativo={aba === 'revisados'} onClick={() => setAba('revisados')}>
          <CheckCircle2 size={13} /> Revisados ({revisados.length})
        </Tab>
      </div>

      {/* Conteudo */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>
      ) : aba === 'pendentes' ? (
        <ListaPendentes pendentes={pendentes} onRevisar={setRevisarKpi} onDetalhe={setDetalheKpiId} />
      ) : (
        <ListaRevisados revisados={revisados} />
      )}

      <KpiDetalheModal
        open={!!detalheKpiId}
        kpiId={detalheKpiId}
        onClose={() => setDetalheKpiId(null)}
        onUpdated={carregar}
      />

      {/* Modal de revisao + barra do modo guiado */}
      {revisarKpi && (
        <>
          {modoGuiado && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1200,
              background: C.primary, color: '#fff',
              padding: '8px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <strong style={{ fontSize: 12 }}>MODO GUIADO</strong>
                <span style={{ fontSize: 11 }}>{indiceGuiado + 1} de {pendentes.length}</span>
              </div>
              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 99, overflow: 'hidden', minWidth: 100 }}>
                <div style={{ width: `${((indiceGuiado + 1) / pendentes.length) * 100}%`, height: '100%', background: '#fff', transition: 'width 0.3s' }} />
              </div>
              <button onClick={sairGuiado} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                Sair do guiado
              </button>
            </div>
          )}
          <OkrRevisaoModal
            open={!!revisarKpi}
            kpi={revisarKpi}
            onClose={() => {
              if (modoGuiado) sairGuiado();
              else { setRevisarKpi(null); carregar(); }
            }}
            onSaved={() => {
              if (modoGuiado) {
                proximoGuiado();
              } else {
                setRevisarKpi(null);
                carregar();
              }
            }}
            defaultPeriodKey={periodo}
          />
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------------------

function ListaPendentes({ pendentes, onRevisar, onDetalhe }) {
  if (pendentes.length === 0) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', background: '#F0FDF4',
        borderRadius: 12, border: '1px dashed #BBF7D0',
      }}>
        <CheckCircle2 size={32} style={{ color: '#10B981', marginBottom: 12 }} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#065F46', margin: 0 }}>
          Tudo revisado este mes
        </h3>
        <p style={{ fontSize: 12, color: '#065F46', marginTop: 6 }}>
          Nenhum KPI em alerta sem revisao. Pode descansar.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pendentes.map((p, i) => <KpiPendenteCard key={p.id} kpi={p} ordem={i + 1} onRevisar={() => onRevisar(p)} onDetalhe={() => onDetalhe(p.id)} />)}
    </div>
  );
}

function KpiPendenteCard({ kpi, ordem, onRevisar, onDetalhe }) {
  const traj = kpi.trajetoria;
  const sv = STATUS_VISUAL[traj?.status_trajetoria] || STATUS_VISUAL.atras;
  const Icon = sv.Icon;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${sv.cor}`,
      borderRadius: 8, padding: 12,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{
        background: sv.bg, color: sv.cor,
        width: 32, height: 32, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, color: C.t3, fontWeight: 700 }}>#{ordem}</span>
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: sv.bg, color: sv.cor, fontWeight: 700 }}>{sv.label}</span>
          {kpi.is_okr && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>OKR</span>}
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'var(--cbrio-input-bg)', color: C.t2, fontWeight: 600, textTransform: 'capitalize' }}>{kpi.area}</span>
          <span style={{ fontSize: 9, color: C.t3 }}>{kpi.id}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 4 }}>{kpi.indicador}</div>
        <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
          {traj?.ultimo_valor != null ? (
            <>
              Ultimo: <strong>{traj.ultimo_valor}{kpi.unidade ? ' ' + kpi.unidade : ''}</strong>
              {traj.checkpoint_meta != null && <> · meta {traj.checkpoint_meta}{kpi.unidade ? ' ' + kpi.unidade : ''}</>}
              {traj.percentual_meta != null && <> · <strong style={{ color: sv.cor }}>{traj.percentual_meta}% da meta</strong></>}
            </>
          ) : (
            <>Sem registro · {kpi.periodicidade}</>
          )}
          {kpi.lider && <> · lider <strong style={{ color: C.t2 }}>{kpi.lider.nome}</strong></>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={onDetalhe}
          style={{ background: 'transparent', border: `1px solid ${C.border}`, padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: C.t2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Activity size={11} /> Ver detalhe
        </button>
        <button onClick={onRevisar}
          style={{ background: C.primary, border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#fff' }}>
          Revisar agora
        </button>
      </div>
    </div>
  );
}

function ListaRevisados({ revisados }) {
  if (revisados.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>
        Nenhuma revisao registrada neste mes ainda.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {revisados.map(r => (
        <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: '3px solid #10B981', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <strong style={{ fontSize: 13, color: C.text }}>{r.kpi?.indicador || r.kpi_id}</strong>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#D1FAE5', color: '#065F46', fontWeight: 700, textTransform: 'uppercase' }}>{r.status_revisao}</span>
            {r.kpi?.area && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'var(--cbrio-input-bg)', color: C.t2, fontWeight: 600, textTransform: 'capitalize' }}>{r.kpi.area}</span>}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.t3 }}>{r.data_revisao}</span>
          </div>
          <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
            <div><strong>Causa:</strong> {r.causa_desvio}</div>
            <div><strong>Decisao:</strong> {r.decisao}</div>
            {r.proximo_passo && <div><strong>Proximo passo:</strong> {r.proximo_passo}{r.prazo_proximo_passo ? ` (ate ${r.prazo_proximo_passo})` : ''}</div>}
            {r.responsavel?.nome && <div><strong>Resp.:</strong> {r.responsavel.nome}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, cor }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: C.t3, marginTop: 4, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

function Tab({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
      fontSize: 12, fontWeight: ativo ? 700 : 500,
      color: ativo ? C.primary : C.t3,
      borderBottom: ativo ? `2px solid ${C.primary}` : '2px solid transparent',
      marginBottom: -2, display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {children}
    </button>
  );
}
