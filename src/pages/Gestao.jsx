// ============================================================================
// /gestao — Painel administrativo do PMO (Marcos + Matheus + Eduardo)
//
// 4 abas (consolidacao Maio/2026):
//   - Diagnóstico  → fusao Pulso + Saúde (líderes pendentes + KPIs criticos +
//                    saúde por área + KPIs sem meta/dono/registro)
//   - Estrutura OKR → hierarquia Direcionador → Objetivo → KR → KPI
//   - Operacional   → SLA / NPS / urgência das solicitações
//   - Configurar    → Cruzamentos, Regras de Notificação, Metas Institucionais
//
// Redirecionamentos das abas antigas:
//   ?aba=pulso    → diagnóstico
//   ?aba=saude    → diagnóstico
//   ?aba=metas    → configurar
//   ?aba=painel_adm → operacional
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { gestao as gestaoApi, kpis as kpisApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Activity, Settings, AlertCircle, TrendingDown, Bell, Target, Shield, ArrowRight, ChevronRight, Flag, Edit3, Save as SaveIcon, Filter, Building2, Zap } from 'lucide-react';
import { estrategia as estrategiaApi } from '../api';
import { toast } from 'sonner';
import KpiDetalheModal from '../components/KpiDetalheModal';
import EstruturaOkr from './admin/EstruturaOkr';
import EmptyState from '../components/EmptyState';
import { CheckCircle2 } from 'lucide-react';
import { formatErro } from '../lib/formatErro';
import { btnPrimary, btnSm } from '../lib/uiTokens';
import { SkeletonBlock } from '../components/Skeleton';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};

const TABS = [
  { key: 'diagnostico', label: 'Diagnóstico', Icon: Activity },
  { key: 'estrutura',   label: 'Estrutura OKR', Icon: Target },
  { key: 'operacional', label: 'Operacional',  Icon: Building2 },
  { key: 'configurar',  label: 'Configurar',    Icon: Settings },
];

// Redirecionamentos das abas antigas
const TABS_ANTIGAS = {
  pulso: 'diagnostico',
  saude: 'diagnostico',
  metas: 'configurar',
  painel_adm: 'operacional',
};

export default function Gestao() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  // Normaliza aba antiga pra nova
  const abaRaw = searchParams.get('aba') || 'diagnostico';
  const aba = TABS_ANTIGAS[abaRaw] || abaRaw;
  // Se URL tinha aba antiga, atualiza pra nova (transparente)
  useEffect(() => {
    if (TABS_ANTIGAS[abaRaw]) {
      const next = new URLSearchParams(searchParams);
      next.set('aba', TABS_ANTIGAS[abaRaw]);
      setSearchParams(next, { replace: true });
    }
  }, [abaRaw, searchParams, setSearchParams]);

  const setAba = (a) => {
    const next = new URLSearchParams(searchParams);
    next.set('aba', a);
    setSearchParams(next, { replace: true });
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>
        Acesso restrito. /gestao é exclusivo para admin/diretor (PMO).
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Settings size={22} style={{ color: C.primary }} />
          Gestão do Sistema OKR
        </h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          PMO · cobre líderes atrasados, configura estrutura, monitora a saúde do sistema
        </p>
      </header>

      <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${C.border}`, marginBottom: 18 }}>
        {TABS.map(t => {
          const ativo = aba === t.key;
          const Icon = t.Icon;
          return (
            <button
              key={t.key}
              onClick={() => setAba(t.key)}
              style={{
                padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: ativo ? 700 : 500,
                color: ativo ? C.primary : C.t3,
                borderBottom: ativo ? `2px solid ${C.primary}` : '2px solid transparent',
                marginBottom: -2, display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {aba === 'diagnostico' && <AbaDiagnostico />}
      {aba === 'estrutura' && <EstruturaOkr embedded />}
      {aba === 'operacional' && <AbaPainelAdm />}
      {aba === 'configurar' && <AbaConfigurar />}
    </div>
  );
}

// ============================================================================
// ABA · DIAGNÓSTICO (fusao Pulso + Saúde)
// Carrega ambos endpoints em paralelo e renderiza em secoes.
// ============================================================================
function AbaDiagnostico() {
  const [pulso, setPulso] = useState(null);
  const [saude, setSaude] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detalheKpiId, setDetalheKpiId] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        gestaoApi.pulso().catch(() => null),
        gestaoApi.saude().catch(() => null),
      ]);
      setPulso(p);
      setSaude(s);
    } catch (e) {
      toast.error(formatErro(e, 'diagnostico'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const cobrar = async (lider) => {
    if (!window.confirm(`Enviar lembrete pra ${lider.nome}?`)) return;
    try {
      await gestaoApi.cobrar(lider.id);
      toast.success(`Lembrete enviado para ${lider.nome}`);
    } catch (e) {
      toast.error(formatErro(e) + ' (líder tem profile vinculado?)');
    }
  };

  if (loading) return <Loading />;
  if (!pulso && !saude) return null;

  return (
    <>
      {/* Stats globais · fusao Pulso + Saúde */}
      <Stats stats={[
        { label: 'KPIs ativos', value: pulso?.total_kpis_ativos ?? saude?.total_kpis_ativos ?? 0, cor: C.text },
        { label: 'KPIs críticos', value: pulso?.cronicamente_vermelhos?.length || 0, cor: '#EF4444' },
        { label: 'Líderes com pendência', value: (pulso?.lideres || []).filter(l => l.criticos > 0 || l.atrasados > 0).length, cor: '#EF4444' },
        { label: 'Sem registro 60d', value: saude?.sem_registro_60d?.total || 0, cor: '#F59E0B' },
        { label: 'Sem meta', value: saude?.sem_meta?.total || 0, cor: '#9CA3AF' },
        { label: 'Sem dono', value: saude?.sem_dono?.total || 0, cor: '#9CA3AF' },
      ]} />

      {/* SECAO 1 · STATUS OPERACIONAL (do Pulso) */}
      <h3 style={hSec}>Status operacional</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card title="Líderes com pendências" subtitle="Ordenado por gravidade (criticos > atrasados > sem dado)">
          {!pulso?.lideres?.length ? (
            <Vazio>Nenhum líder com pendência.</Vazio>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pulso.lideres.slice(0, 12).map(l => (
                <div key={l.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', background: 'var(--cbrio-input-bg)', borderRadius: 8, minHeight: 52,
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: C.primaryBg, color: C.primaryDark,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>{(l.nome || '?').charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{l.nome}</div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 2, lineHeight: 1.4 }}>
                      {l.cargo || ''}{l.area ? ` · ${l.area}` : ''} · {l.total_kpis} KPIs · {l.percentual_em_dia}% em dia
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {l.criticos > 0 && <Badge cor="#EF4444" label={`${l.criticos}c`} title={`${l.criticos} críticos`} />}
                    {l.atrasados > 0 && <Badge cor="#F59E0B" label={`${l.atrasados}a`} title={`${l.atrasados} atrasados`} />}
                    {l.sem_dado > 0 && <Badge cor="#9CA3AF" label={`${l.sem_dado}?`} title={`${l.sem_dado} sem dado`} />}
                  </div>
                  <button onClick={() => cobrar(l)} style={btnSm} title="Enviar lembrete">
                    <Bell size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="KPIs cronicamente críticos" subtitle="Indicadores em vermelho que precisam de atenção da diretoria">
          {!pulso?.cronicamente_vermelhos?.length ? (
            <Vazio>Nenhum KPI cronicamente vermelho.</Vazio>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pulso.cronicamente_vermelhos.slice(0, 10).map(k => (
                <div key={k.kpi_id} onClick={() => setDetalheKpiId(k.kpi_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', background: 'var(--cbrio-input-bg)', borderRadius: 8,
                    cursor: 'pointer', minHeight: 52, transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--cbrio-card)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--cbrio-input-bg)'}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: '#FEE2E2', color: '#EF4444',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}><TrendingDown size={16} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.indicador}</div>
                    <div style={{ fontSize: 10, color: C.t3, textTransform: 'capitalize', marginTop: 2 }}>
                      {k.area} · {k.percentual_meta != null ? `${k.percentual_meta}% da meta` : 'sem dado'}
                    </div>
                  </div>
                  {k.is_okr && <Badge cor="#B45309" label="OKR" bg="#FEF3C7" />}
                  <ChevronRight size={14} style={{ color: C.t3, flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Saúde por área" subtitle="Percentual de KPIs em dia em cada área" full>
          {!pulso?.areas?.length ? <Vazio>Nenhuma área cadastrada.</Vazio> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {pulso.areas.map(a => {
                const cor = a.percentual_em_dia >= 70 ? '#10B981' : a.percentual_em_dia >= 40 ? '#F59E0B' : '#EF4444';
                return (
                  <div key={a.area} style={{
                    padding: 14, background: 'var(--cbrio-input-bg)', borderRadius: 8,
                    borderLeft: `3px solid ${cor}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                      <strong style={{ fontSize: 13, textTransform: 'capitalize', color: C.text }}>{a.area}</strong>
                      <span style={{ fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1 }}>{a.percentual_em_dia}%</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.t3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span><strong style={{ color: '#10B981' }}>{a.em_dia}</strong> dia</span>
                      <span><strong style={{ color: '#F59E0B' }}>{a.atrasados}</strong> atras</span>
                      <span><strong style={{ color: '#EF4444' }}>{a.criticos}</strong> crit</span>
                      <span><strong style={{ color: '#9CA3AF' }}>{a.sem_dado}</strong> ?</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* SECAO 2 · QUALIDADE DE CADASTRO (do Saúde) */}
      <h3 style={hSec}>Qualidade do cadastro</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
        {saude && (<>
          <ListaSaude titulo="Sem meta definida"
            subtitulo="KPIs que precisam de uma meta antes de poder cobrar"
            items={saude.sem_meta.items} cor="#EF4444" onAbrirKpi={setDetalheKpiId} />
          <ListaSaude titulo="Sem dono atribuído"
            subtitulo="KPIs sem líder responsável — ninguém é cobrado"
            items={saude.sem_dono.items} cor="#F59E0B" onAbrirKpi={setDetalheKpiId} />
          <ListaSaude titulo="Sem objetivo geral vinculado"
            subtitulo="Não alimentam cascata automática" items={saude.sem_objetivo.items} cor="#3B82F6" onAbrirKpi={setDetalheKpiId} />
          <ListaSaude titulo="Sem valores da Jornada"
            subtitulo="Não aparecem na matriz nem nas mandalas" items={saude.sem_valores.items} cor="#8B5CF6" onAbrirKpi={setDetalheKpiId} />
          <ListaSaude titulo="Sem registro nos últimos 60 dias"
            subtitulo="KPIs vivos mas que ninguém preenche" items={saude.sem_registro_60d.items} cor="#EF4444" onAbrirKpi={setDetalheKpiId} />
          <Card title="Cobertura da matriz Valor × Área" subtitle="Quais valores cada área já tem KPI">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {saude.matriz_cobertura.map(c => (
                <div key={c.area} style={{ padding: 10, background: 'var(--cbrio-input-bg)', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <strong style={{ fontSize: 12, textTransform: 'capitalize' }}>{c.nome}</strong>
                    <span style={{ fontSize: 10, color: c.completo ? '#10B981' : '#F59E0B', fontWeight: 700 }}>
                      {c.valores_cobertos.length}/5 valores
                    </span>
                  </div>
                  {c.valores_faltantes.length > 0 && (
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
                      Faltam: <strong>{c.valores_faltantes.join(', ')}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
          {saude.objetivos_sem_kpis.total > 0 && (
            <ListaSaude titulo="Objetivos sem KPIs"
              subtitulo="Objetivos cadastrados que ninguém mede"
              items={saude.objetivos_sem_kpis.items} cor="#9CA3AF"
              cols={['nome']} idField="id" />
          )}
        </>)}
      </div>

      <KpiDetalheModal
        open={!!detalheKpiId}
        kpiId={detalheKpiId}
        onClose={() => setDetalheKpiId(null)}
        onUpdated={carregar}
        openInEdit
      />
    </>
  );
}

const hSec = {
  fontSize: 14, fontWeight: 700, color: 'var(--cbrio-text)',
  margin: '8px 0 12px', textTransform: 'uppercase', letterSpacing: 0.5,
};

const TIPO_INFO = {
  quantitativo: {
    label: 'Quantitativo',
    desc: 'KPIs de crescimento (frequência, conversões, batismos, doações...)',
    cor: '#3B82F6',
    bg: '#3B82F618',
  },
  qualitativo: {
    label: 'Qualitativo',
    desc: 'KPIs de processo (NPS, % atendidos, satisfação, qualidade...)',
    cor: '#8B5CF6',
    bg: '#8B5CF618',
  },
};

function AbaMetasInstitucionais() {
  const [metas, setMetas] = useState([]);
  const [okrsPorTipo, setOkrsPorTipo] = useState({ qualitativo: [], quantitativo: [], sem_tipo: [] });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const ano = new Date().getFullYear();

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [m, os] = await Promise.all([
        estrategiaApi.metasInstitucionais.list(),
        estrategiaApi.okrsPorTipo(),
      ]);
      setMetas(m || []);
      setOkrsPorTipo(os || { qualitativo: [], quantitativo: [], sem_tipo: [] });
    } catch (e) {
      toast.error(formatErro(e, 'metas institucionais'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarMeta = async (tipo) => {
    try {
      await estrategiaApi.metasInstitucionais.upsert({
        tipo_kpi: tipo,
        ano,
        meta_descricao: form.meta_descricao,
        meta_valor: form.meta_valor === '' ? null : Number(form.meta_valor),
        unidade: form.unidade || null,
        observacoes: form.observacoes || null,
      });
      toast.success('Meta atualizada');
      setEditingId(null);
      setForm({});
      carregar();
    } catch (e) { toast.error(formatErro(e)); }
  };

  const trocarTipoOkr = async (okr, novoTipo) => {
    try {
      await estrategiaApi.setOkrTipo(okr.id, novoTipo);
      toast.success(`${okr.nome.slice(0, 30)} → ${novoTipo}`);
      carregar();
    } catch (e) { toast.error(formatErro(e)); }
  };

  const recalcularMetas = async () => {
    if (!window.confirm('Vai sobrescrever a meta de TODOS os OKRs ativos com a meta institucional. Quantitativos vão materializar alvo absoluto a partir do baseline do ano anterior. Continuar?')) return;
    try {
      const r = await estrategiaApi.metasInstitucionais.aplicar();
      toast.success(`Recalculado · ${r.resultado.okrs_atualizados} OKRs (${r.resultado.okrs_com_alvo_materializado} com alvo absoluto)`);
      carregar();
    } catch (e) { toast.error(formatErro(e)); }
  };

  if (loading) return <Loading />;

  const metaPorTipo = {
    quantitativo: metas.find(m => m.tipo_kpi === 'quantitativo' && m.ano === ano),
    qualitativo:  metas.find(m => m.tipo_kpi === 'qualitativo'  && m.ano === ano),
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 12, color: C.t3, margin: 0, maxWidth: 700 }}>
          Meta global da igreja para {ano} · 1 meta por tipo. Ao salvar uma meta, ela é <strong>aplicada
          automaticamente</strong> em todos os KPIs do tipo (sobrescreve meta individual). Quantitativos
          materializam alvo absoluto via baseline do ano anterior.
        </p>
        <button onClick={recalcularMetas} style={btnPrimary} title="Recalcular alvos absolutos com dados atuais">
          <Activity size={11} /> Recalcular metas
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        {['quantitativo', 'qualitativo'].map(tipo => {
          const info = TIPO_INFO[tipo];
          const meta = metaPorTipo[tipo];
          const okrs = okrsPorTipo[tipo] || [];
          const editando = editingId === tipo;

          return (
            <Card
              key={tipo}
              title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: info.cor, display: 'inline-block' }} />
                {info.label}
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: info.bg, color: info.cor, fontWeight: 700 }}>
                  {okrs.length} OKRs
                </span>
              </span>}
              subtitle={info.desc}
            >
              {/* Bloco da meta institucional */}
              <div style={{ background: 'var(--cbrio-input-bg)', padding: 14, borderRadius: 8, marginBottom: 14, borderLeft: `3px solid ${info.cor}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Meta {ano}
                  </span>
                  {!editando && (
                    <button
                      onClick={() => {
                        setEditingId(tipo);
                        setForm({
                          meta_descricao: meta?.meta_descricao || '',
                          meta_valor: meta?.meta_valor ?? '',
                          unidade: meta?.unidade || '',
                          observacoes: meta?.observacoes || '',
                        });
                      }}
                      style={btnSm}
                    >
                      <Edit3 size={11} /> Editar
                    </button>
                  )}
                </div>

                {editando ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      placeholder="Descrição da meta"
                      value={form.meta_descricao}
                      onChange={e => setForm(f => ({ ...f, meta_descricao: e.target.value }))}
                      style={inpStyle}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number"
                        placeholder="Valor"
                        value={form.meta_valor}
                        onChange={e => setForm(f => ({ ...f, meta_valor: e.target.value }))}
                        style={{ ...inpStyle, width: 100 }}
                      />
                      <input
                        placeholder="Unidade (%, R$, etc)"
                        value={form.unidade}
                        onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                        style={{ ...inpStyle, width: 140 }}
                      />
                    </div>
                    <input
                      placeholder="Observações (opcional)"
                      value={form.observacoes}
                      onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                      style={inpStyle}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => salvarMeta(tipo)} style={btnPrimary}>
                        <SaveIcon size={11} /> Salvar
                      </button>
                      <button onClick={() => { setEditingId(null); setForm({}); }} style={btnSm}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : meta ? (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                      {meta.meta_valor != null ? `${meta.meta_valor}${meta.unidade ? ' ' + meta.unidade : ''}` : '—'}
                    </div>
                    <div style={{ fontSize: 12, color: C.t2 }}>{meta.meta_descricao}</div>
                    {meta.observacoes && (
                      <div style={{ fontSize: 11, color: C.t3, marginTop: 6, fontStyle: 'italic' }}>
                        {meta.observacoes}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: C.t3, fontStyle: 'italic' }}>
                    Nenhuma meta definida para {ano}. Click em Editar para criar.
                  </div>
                )}
              </div>

              {/* Lista de KPIs do tipo */}
              <div>
                <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  OKRs deste tipo ({okrs.length})
                </div>
                {okrs.length === 0 ? (
                  <div style={{ fontSize: 11, color: C.t3, padding: 8 }}>Nenhum.</div>
                ) : (
                  <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {okrs.map(o => (
                      <div key={o.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px', background: C.card, borderRadius: 6, fontSize: 11,
                        borderLeft: `2px solid ${info.cor}`,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.text, fontWeight: 600, lineHeight: 1.3 }} title={o.nome}>
                            {o.nome}
                          </div>
                          {o.meta_valor_absoluto != null ? (
                            <div style={{ fontSize: 10, color: info.cor, fontWeight: 700, marginTop: 2 }}>
                              alvo {ano}: {Number(o.meta_valor_absoluto).toLocaleString('pt-BR')}
                              {tipo === 'qualitativo' ? '%' : ''}
                            </div>
                          ) : o.dado_tipo_principal ? (
                            <div style={{ fontSize: 9, color: C.t3, marginTop: 2, fontStyle: 'italic' }}>
                              sem baseline · adicione dados de {ano - 1} pra materializar
                            </div>
                          ) : (
                            <div style={{ fontSize: 9, color: '#F59E0B', marginTop: 2 }}>
                              sem fonte natural · meta = {meta?.meta_valor}{meta?.unidade}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => trocarTipoOkr(o, tipo === 'quantitativo' ? 'qualitativo' : 'quantitativo')}
                          title={`Mover para ${tipo === 'quantitativo' ? 'qualitativo' : 'quantitativo'}`}
                          style={btnSm}
                        >
                          ⇄
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        {okrsPorTipo.sem_tipo?.length > 0 && (
          <Card title={<>⚠️ OKRs sem tipo classificado ({okrsPorTipo.sem_tipo.length})</>} subtitle="Use os botões ⇄ acima para classificar" full>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {okrsPorTipo.sem_tipo.map(o => (
                <span key={o.id} style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 99,
                  background: 'var(--cbrio-input-bg)', color: C.t2,
                }}>
                  {o.nome}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* Seção · Metas específicas (override da institucional)             */}
      {/* OKRs Gerais (kpi_objetivos_gerais) e KPIs Táticos                  */}
      {/* ────────────────────────────────────────────────────────────────── */}
      <MetasEspecificas okrsPorTipo={okrsPorTipo} onSaved={carregar} />
    </>
  );
}

// ============================================================================
// Subcomponente · MetasEspecificas (override individual)
// ============================================================================
function MetasEspecificas({ okrsPorTipo, onSaved }) {
  const [tab, setTab] = useState('okrs'); // 'okrs' | 'kpis'
  const [busca, setBusca] = useState('');
  const [kpis, setKpis] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [edicao, setEdicao] = useState({});
  const [loading, setLoading] = useState(false);

  const carregarKpis = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kpisApi.v2.taticos();
      setKpis(Array.isArray(data) ? data.filter(k => k.ativo) : []);
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'kpis') carregarKpis(); }, [tab, carregarKpis]);

  const todosOkrs = useMemo(() => {
    return [
      ...(okrsPorTipo.quantitativo || []).map(o => ({ ...o, tipo: 'quantitativo' })),
      ...(okrsPorTipo.qualitativo  || []).map(o => ({ ...o, tipo: 'qualitativo' })),
      ...(okrsPorTipo.operacional  || []).map(o => ({ ...o, tipo: 'operacional' })),
      ...(okrsPorTipo.sem_tipo     || []).map(o => ({ ...o, tipo: 'sem_tipo' })),
    ];
  }, [okrsPorTipo]);

  const okrsFiltrados = useMemo(() => {
    if (!busca) return todosOkrs;
    const q = busca.toLowerCase();
    return todosOkrs.filter(o => (o.nome || '').toLowerCase().includes(q) || (o.indicador_geral || '').toLowerCase().includes(q));
  }, [todosOkrs, busca]);

  const kpisFiltrados = useMemo(() => {
    if (!busca) return kpis;
    const q = busca.toLowerCase();
    return kpis.filter(k => (k.indicador || '').toLowerCase().includes(q) || (k.id || '').toLowerCase().includes(q) || (k.area || '').toLowerCase().includes(q));
  }, [kpis, busca]);

  const iniciarEdicao = (item) => {
    setEditandoId(item.id);
    setEdicao({
      meta_valor: item.meta_valor ?? '',
      meta_descricao: item.meta_descricao || '',
    });
  };

  const salvar = async (item, tipoItem) => {
    try {
      const payload = {
        meta_valor: edicao.meta_valor === '' ? null : Number(edicao.meta_valor),
        meta_descricao: edicao.meta_descricao || null,
      };
      if (tipoItem === 'okr') {
        await estrategiaApi.objetivos.update(item.id, payload);
      } else {
        await kpisApi.v2.taticoUpdate(item.id, payload);
      }
      toast.success('Meta atualizada');
      setEditandoId(null);
      setEdicao({});
      if (tipoItem === 'okr') onSaved(); else carregarKpis();
    } catch (e) { toast.error(formatErro(e)); }
  };

  const limparOverride = async (item, tipoItem) => {
    if (!window.confirm('Limpar meta específica? O item passa a herdar a meta institucional do tipo.')) return;
    try {
      const payload = { meta_valor: null, meta_descricao: null };
      if (tipoItem === 'okr') {
        await estrategiaApi.objetivos.update(item.id, payload);
      } else {
        await kpisApi.v2.taticoUpdate(item.id, payload);
      }
      toast.success('Meta específica removida · herda institucional');
      if (tipoItem === 'okr') onSaved(); else carregarKpis();
    } catch (e) { toast.error(formatErro(e)); }
  };

  const lista = tab === 'okrs' ? okrsFiltrados : kpisFiltrados;
  const tipoItem = tab === 'okrs' ? 'okr' : 'kpi';

  return (
    <Card
      title={<>🎯 Metas específicas <span style={{ fontSize: 10, fontWeight: 400, color: C.t3 }}>· override da meta institucional</span></>}
      subtitle="Defina meta individual quando um OKR ou KPI precisa de meta diferente da institucional"
      full
    >
      {/* Toggle tipo + busca */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 6, padding: 2, background: 'var(--cbrio-input-bg)' }}>
          {[
            { v: 'okrs', l: `OKRs Gerais (${todosOkrs.length})` },
            { v: 'kpis', l: `KPIs Táticos (${kpis.length || '...'})` },
          ].map(opt => (
            <button
              key={opt.v}
              onClick={() => { setTab(opt.v); setEditandoId(null); }}
              style={{
                padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: tab === opt.v ? '#00B39D' : 'transparent',
                color: tab === opt.v ? '#fff' : C.t2,
                border: 'none', cursor: 'pointer',
              }}
            >{opt.l}</button>
          ))}
        </div>
        <input
          type="text" placeholder="Buscar por nome, ID, área..."
          value={busca} onChange={e => setBusca(e.target.value)}
          style={{ ...inpStyle, flex: 1, minWidth: 200, maxWidth: 400 }}
        />
        <span style={{ fontSize: 10, color: C.t3 }}>{lista.length} resultado{lista.length === 1 ? '' : 's'}</span>
      </div>

      {/* Lista */}
      {loading ? (
        <p style={{ fontSize: 12, color: C.t3, padding: 20, textAlign: 'center' }}>Carregando…</p>
      ) : lista.length === 0 ? (
        <p style={{ fontSize: 12, color: C.t3, padding: 20, textAlign: 'center' }}>
          {busca ? 'Nenhum item bate com a busca.' : 'Sem itens.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 600, overflowY: 'auto' }}>
          {lista.map(item => {
            const editando = editandoId === item.id;
            const temOverride = item.meta_valor != null;
            const nome = tab === 'okrs' ? item.nome : item.indicador;
            const subInfo = tab === 'okrs'
              ? (item.indicador_geral || item.tipo)
              : `${item.id} · ${item.area} · ${item.periodicidade}`;

            return (
              <div key={item.id} style={{
                padding: 10, borderRadius: 6, border: `1px solid ${C.border}`,
                borderLeft: temOverride ? '3px solid #00B39D' : `3px solid ${C.border}`,
                background: editando ? 'var(--cbrio-input-bg)' : C.card,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 250 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{nome}</div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{subInfo}</div>
                  </div>

                  {!editando && (
                    <>
                      <div style={{ textAlign: 'right', minWidth: 130 }}>
                        {temOverride ? (
                          <>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#00B39D', lineHeight: 1.1 }}>
                              {item.meta_valor}{item.unidade ? ` ${item.unidade}` : ''}
                            </div>
                            <div style={{ fontSize: 9, color: '#00B39D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>específica</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.t3, lineHeight: 1.1 }}>—</div>
                            <div style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>herda institucional</div>
                          </>
                        )}
                      </div>
                      <button onClick={() => iniciarEdicao(item)} style={btnSm}>Editar</button>
                      {temOverride && (
                        <button onClick={() => limparOverride(item, tipoItem)} style={{ ...btnSm, color: '#EF4444', borderColor: '#EF444460' }}>
                          Limpar
                        </button>
                      )}
                    </>
                  )}

                  {editando && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: 280 }}>
                      <input
                        type="number" step="0.01" placeholder="Meta valor"
                        value={edicao.meta_valor}
                        onChange={e => setEdicao(f => ({ ...f, meta_valor: e.target.value }))}
                        style={{ ...inpStyle, width: 100 }}
                        autoFocus
                      />
                      <input
                        type="text" placeholder="Descrição (ex: +30% vs 2025)"
                        value={edicao.meta_descricao}
                        onChange={e => setEdicao(f => ({ ...f, meta_descricao: e.target.value }))}
                        style={{ ...inpStyle, flex: 1, minWidth: 160 }}
                      />
                      <button onClick={() => salvar(item, tipoItem)} style={btnPrimary}>Salvar</button>
                      <button onClick={() => { setEditandoId(null); setEdicao({}); }} style={btnSm}>Cancelar</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const inpStyle = {
  padding: '6px 10px', borderRadius: 6, fontSize: 12,
  border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-input-bg)',
  color: 'var(--cbrio-text)', fontFamily: 'inherit',
};

// ============================================================================
// Componentes auxiliares
// ============================================================================
function Card({ title, subtitle, children, full }) {
  return (
    <section style={{
      background: C.card, borderRadius: 16, border: '1px solid var(--hairline)',
      boxShadow: 'var(--shadow)',
      padding: 18, gridColumn: full ? '1/-1' : 'auto',
    }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t2, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Stats({ stats }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
      {stats.map((s, i) => (
        <div key={i} style={{
          position: 'relative', overflow: 'hidden',
          background: 'var(--panel)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)',
          border: '1px solid var(--hairline)', borderRadius: 16,
          padding: '18px 20px',
          display: 'flex', flexDirection: 'column', gap: 6,
          boxShadow: 'var(--shadow), var(--hi)',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${s.cor}22, transparent 58%)`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.cor, opacity: 0.9 }} />
          <div style={{ position: 'relative', zIndex: 1, fontSize: 28, fontWeight: 800, color: s.cor, lineHeight: 1, letterSpacing: -0.5 }}>{s.value}</div>
          <div style={{ position: 'relative', zIndex: 1, fontSize: 10, color: C.t3, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function ListaSaude({ titulo, subtitulo, items, cor, cols = ['indicador', 'area'], idField = 'id', onAbrirKpi }) {
  return (
    <Card title={titulo} subtitle={subtitulo}>
      {items.length === 0 ? (
        <Vazio>Tudo certo aqui.</Vazio>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
          {items.map(item => (
            <div key={item[idField]}
              onClick={() => cols.includes('indicador') && onAbrirKpi?.(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                background: 'var(--cbrio-input-bg)', borderRadius: 4, fontSize: 11,
                cursor: cols.includes('indicador') ? 'pointer' : 'default',
                borderLeft: `2px solid ${cor}`,
              }}>
              {item.id && cols.includes('indicador') && (
                <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: C.card, color: C.t3, fontWeight: 600, minWidth: 60, textAlign: 'center' }}>{item.id}</span>
              )}
              <span style={{ flex: 1, color: C.text }}>
                {/* Pra KPI: prefere a descrição (nome especifico) sobre o indicador (formula genérica). */}
                {cols[0] === 'indicador' ? (item.descricao || item.indicador || item.nome) : (item[cols[0]] || item.nome)}
              </span>
              {cols.includes('area') && item.area && (
                <span style={{ fontSize: 9, color: C.t3, textTransform: 'capitalize' }}>{item.area}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Badge({ cor, label, title, bg }) {
  return (
    <span title={title} style={{
      fontSize: 9, padding: '2px 6px', borderRadius: 4,
      background: bg || cor + '20', color: cor, fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

// "Vazio" no /gestao quase sempre e noticia boa (sem pendência, sem critico,
// tudo certo). Usa EmptyState compacto com tom positivo + icone de check.
function Vazio({ children, tom = 'positivo' }) {
  return (
    <EmptyState
      tom={tom}
      icone={CheckCircle2}
      titulo={typeof children === 'string' ? children : null}
      compacto
    />
  );
}

function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <SkeletonBlock height={64} /><SkeletonBlock height={64} /><SkeletonBlock height={64} /><SkeletonBlock height={64} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 14, marginTop: 4 }}>
        <SkeletonBlock height={280} />
        <SkeletonBlock height={280} />
      </div>
    </div>
  );
}

