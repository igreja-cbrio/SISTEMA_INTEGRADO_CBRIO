// ============================================================================
// /gestao — Painel administrativo do PMO (Marcos + Matheus + Eduardo)
//
// 3 abas:
//   - Pulso        → quem esta atrasado, KPIs cronicamente vermelhos
//   - Configurar   → atalhos para Estrutura OKR, Areas KPI, Diretoria Geral
//   - Saude        → meta-monitoramento (KPIs sem meta/dono/registro)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { gestao as gestaoApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Activity, Settings, AlertCircle, TrendingDown, Bell, Users, Target, Shield, ArrowRight, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import KpiDetalheModal from '../components/KpiDetalheModal';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};

const TABS = [
  { key: 'pulso',     label: 'Pulso',      Icon: Activity },
  { key: 'configurar', label: 'Configurar', Icon: Settings },
  { key: 'saude',     label: 'Saude',      Icon: Shield },
];

export default function Gestao() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);
  const [aba, setAba] = useState('pulso');

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>
        Acesso restrito. /gestao e exclusivo para admin/diretor (PMO).
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Settings size={22} style={{ color: C.primary }} />
          Gestao do Sistema OKR
        </h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          PMO · cobre lideres atrasados, configura estrutura, monitora a saude do sistema
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

      {aba === 'pulso' && <AbaPulso />}
      {aba === 'configurar' && <AbaConfigurar />}
      {aba === 'saude' && <AbaSaude />}
    </div>
  );
}

// ============================================================================
// ABA 1 · PULSO
// ============================================================================
function AbaPulso() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detalheKpiId, setDetalheKpiId] = useState(null);

  const carregar = useCallback(() => {
    setLoading(true);
    gestaoApi.pulso()
      .then(setData)
      .catch(e => toast.error(e?.message || 'Erro'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const cobrar = async (lider) => {
    if (!window.confirm(`Enviar lembrete pra ${lider.nome}?`)) return;
    try {
      await gestaoApi.cobrar(lider.id);
      toast.success(`Lembrete enviado para ${lider.nome}`);
    } catch (e) {
      toast.error(e?.message || 'Erro ao notificar (lider sem profile vinculado?)');
    }
  };

  if (loading) return <Loading />;
  if (!data) return null;

  return (
    <>
      <Stats stats={[
        { label: 'KPIs ativos', value: data.total_kpis_ativos, cor: C.text },
        { label: 'KPIs criticos', value: data.cronicamente_vermelhos.length, cor: '#EF4444' },
        { label: 'Areas em alerta', value: data.areas.filter(a => a.percentual_em_dia < 50).length, cor: '#F59E0B' },
        { label: 'Lideres com pendencia', value: data.lideres.filter(l => l.criticos > 0 || l.atrasados > 0).length, cor: '#EF4444' },
      ]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        {/* Lideres ranqueados por urgencia */}
        <Card title="Lideres com pendencias" subtitle="Ordenado por gravidade (criticos > atrasados > sem dado)">
          {data.lideres.length === 0 ? (
            <Vazio>Nenhum lider com pendencia.</Vazio>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.lideres.slice(0, 12).map(l => (
                <div key={l.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', background: 'var(--cbrio-input-bg)', borderRadius: 6,
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: C.primaryBg, color: C.primaryDark,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>
                    {(l.nome || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{l.nome}</div>
                    <div style={{ fontSize: 9, color: C.t3 }}>
                      {l.cargo || ''}{l.area ? ` · ${l.area}` : ''} · {l.total_kpis} KPIs · {l.percentual_em_dia}% em dia
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {l.criticos > 0 && <Badge cor="#EF4444" label={`${l.criticos}c`} title={`${l.criticos} criticos`} />}
                    {l.atrasados > 0 && <Badge cor="#F59E0B" label={`${l.atrasados}a`} title={`${l.atrasados} atrasados`} />}
                    {l.sem_dado > 0 && <Badge cor="#9CA3AF" label={`${l.sem_dado}?`} title={`${l.sem_dado} sem dado`} />}
                  </div>
                  <button onClick={() => cobrar(l)} style={btnSm} title="Enviar lembrete">
                    <Bell size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* KPIs cronicamente vermelhos */}
        <Card title="KPIs cronicamente criticos" subtitle="Indicadores em vermelho que precisam de atencao da diretoria">
          {data.cronicamente_vermelhos.length === 0 ? (
            <Vazio>Nenhum KPI cronicamente vermelho. </Vazio>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.cronicamente_vermelhos.slice(0, 10).map(k => (
                <div key={k.kpi_id} onClick={() => setDetalheKpiId(k.kpi_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--cbrio-input-bg)', borderRadius: 6, cursor: 'pointer' }}>
                  <TrendingDown size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{k.indicador}</div>
                    <div style={{ fontSize: 9, color: C.t3, textTransform: 'capitalize' }}>
                      {k.area} · {k.percentual_meta != null ? `${k.percentual_meta}% da meta` : 'sem dado'}
                    </div>
                  </div>
                  {k.is_okr && <Badge cor="#B45309" label="OKR" bg="#FEF3C7" />}
                  <ChevronRight size={14} style={{ color: C.t3 }} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Areas (saude por area) */}
        <Card title="Saude por area" subtitle="Percentual de KPIs em dia em cada area" full>
          {data.areas.length === 0 ? <Vazio>Nenhuma area cadastrada.</Vazio> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {data.areas.map(a => {
                const cor = a.percentual_em_dia >= 70 ? '#10B981' : a.percentual_em_dia >= 40 ? '#F59E0B' : '#EF4444';
                return (
                  <div key={a.area} style={{ padding: 10, background: 'var(--cbrio-input-bg)', borderRadius: 6, borderLeft: `3px solid ${cor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <strong style={{ fontSize: 12, textTransform: 'capitalize' }}>{a.area}</strong>
                      <span style={{ fontSize: 18, fontWeight: 800, color: cor }}>{a.percentual_em_dia}%</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
                      <strong style={{ color: '#10B981' }}>{a.em_dia}</strong> dia · <strong style={{ color: '#F59E0B' }}>{a.atrasados}</strong> atras · <strong style={{ color: '#EF4444' }}>{a.criticos}</strong> crit · <strong style={{ color: '#9CA3AF' }}>{a.sem_dado}</strong> ?
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <KpiDetalheModal
        open={!!detalheKpiId}
        kpiId={detalheKpiId}
        onClose={() => setDetalheKpiId(null)}
        onUpdated={carregar}
      />
    </>
  );
}

// ============================================================================
// ABA 2 · CONFIGURAR
// ============================================================================
function AbaConfigurar() {
  const navigate = useNavigate();
  const items = [
    {
      titulo: 'Estrutura OKR',
      desc: 'Direcionadores, objetivos gerais (25), KRs gerais',
      Icon: Target,
      path: '/admin/estrutura-okr',
      cor: C.primary,
    },
    {
      titulo: 'Areas de KPI',
      desc: 'Atribuir quais areas cada lider edita',
      Icon: Users,
      path: '/admin/kpi-areas',
      cor: '#3B82F6',
    },
    {
      titulo: 'Regras de Notificacao',
      desc: 'Quem recebe alertas de cada modulo',
      Icon: Bell,
      path: '/admin/notificacao-regras',
      cor: '#F59E0B',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
      {items.map(item => {
        const Icon = item.Icon;
        return (
          <button
            key={item.titulo}
            onClick={() => navigate(item.path)}
            style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 18, cursor: 'pointer',
              textAlign: 'left',
              display: 'flex', alignItems: 'flex-start', gap: 14,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = item.cor}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: item.cor + '20', color: item.cor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>{item.titulo}</h3>
              <p style={{ fontSize: 11, color: C.t3, marginTop: 4, lineHeight: 1.4 }}>{item.desc}</p>
            </div>
            <ArrowRight size={16} style={{ color: C.t3, flexShrink: 0, alignSelf: 'center' }} />
          </button>
        );
      })}

      <div style={{
        background: 'var(--cbrio-input-bg)', border: `1px dashed ${C.border}`,
        borderRadius: 12, padding: 18, gridColumn: '1/-1',
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t2, margin: 0 }}>Diretoria geral (5 nominais)</h3>
        <p style={{ fontSize: 11, color: C.t3, marginTop: 6, lineHeight: 1.5 }}>
          Para marcar pessoas como diretoria geral (recebem alertas criticos + participam do ritual mensal),
          rode no Supabase Studio:
        </p>
        <pre style={{ marginTop: 10, padding: 12, background: C.card, borderRadius: 6, fontSize: 11, color: C.t2, overflowX: 'auto', border: `1px solid ${C.border}` }}>
{`UPDATE profiles
   SET is_diretoria_geral = true,
       funcao_diretoria = 'Pastor Senior'
 WHERE email = 'pedrao@cbrio.com.br';`}
        </pre>
      </div>
    </div>
  );
}

// ============================================================================
// ABA 3 · SAUDE DO SISTEMA
// ============================================================================
function AbaSaude() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detalheKpiId, setDetalheKpiId] = useState(null);

  useEffect(() => {
    setLoading(true);
    gestaoApi.saude()
      .then(setData)
      .catch(e => toast.error(e?.message || 'Erro'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (!data) return null;

  return (
    <>
      <Stats stats={[
        { label: 'KPIs ativos', value: data.total_kpis_ativos, cor: C.text },
        { label: 'Sem meta', value: data.sem_meta.total, cor: '#EF4444' },
        { label: 'Sem dono', value: data.sem_dono.total, cor: '#F59E0B' },
        { label: 'Sem registro 60d', value: data.sem_registro_60d.total, cor: '#EF4444' },
      ]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
        <ListaSaude titulo="Sem meta definida"
          subtitulo="KPIs que precisam de uma meta antes de poder cobrar"
          items={data.sem_meta.items} cor="#EF4444" onAbrirKpi={setDetalheKpiId} />
        <ListaSaude titulo="Sem dono atribuido"
          subtitulo="KPIs sem lider responsavel — ninguem e cobrado"
          items={data.sem_dono.items} cor="#F59E0B" onAbrirKpi={setDetalheKpiId} />
        <ListaSaude titulo="Sem objetivo geral vinculado"
          subtitulo="Nao alimentam cascata automatica" items={data.sem_objetivo.items} cor="#3B82F6" onAbrirKpi={setDetalheKpiId} />
        <ListaSaude titulo="Sem valores da Jornada"
          subtitulo="Nao aparecem na matriz nem nas mandalas" items={data.sem_valores.items} cor="#8B5CF6" onAbrirKpi={setDetalheKpiId} />
        <ListaSaude titulo="Sem registro nos ultimos 60 dias"
          subtitulo="KPIs vivos mas que ninguem preenche" items={data.sem_registro_60d.items} cor="#EF4444" onAbrirKpi={setDetalheKpiId} />
        <Card title="Cobertura da matriz Valor × Area" subtitle="Quais valores cada area ja tem KPI">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.matriz_cobertura.map(c => (
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
        {data.objetivos_sem_kpis.total > 0 && (
          <ListaSaude titulo="Objetivos sem KPIs"
            subtitulo="Objetivos cadastrados que ninguem mede"
            items={data.objetivos_sem_kpis.items} cor="#9CA3AF"
            cols={['nome']} idField="id" />
        )}
      </div>

      <KpiDetalheModal
        open={!!detalheKpiId}
        kpiId={detalheKpiId}
        onClose={() => setDetalheKpiId(null)}
      />
    </>
  );
}

// ============================================================================
// Componentes auxiliares
// ============================================================================
function Card({ title, subtitle, children, full }) {
  return (
    <section style={{
      background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
      {stats.map((s, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: s.cor, lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: 9, color: C.t3, marginTop: 4, letterSpacing: 0.3, textTransform: 'uppercase' }}>{s.label}</div>
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
              <span style={{ flex: 1, color: C.text }}>{item[cols[0]] || item.nome}</span>
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

function Vazio({ children }) {
  return <div style={{ padding: 12, textAlign: 'center', color: C.t3, fontSize: 11, fontStyle: 'italic' }}>{children}</div>;
}

function Loading() {
  return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>;
}

const btnSm = {
  background: 'transparent', border: `1px solid ${C.border}`,
  padding: 6, borderRadius: 4, cursor: 'pointer', color: C.t3,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
