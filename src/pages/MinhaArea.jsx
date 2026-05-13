// ============================================================================
// /minha-area — Hub do lider · VISUALIZADOR de KPIs da area do user
//
// Refator 2026-05-13 (Marcos): "/meus-kpis deveria ser apenas visualizador de
// relatorios da sua propria area · cada modulo tem sua aba de preenchimento".
//
// Antes: 2 abas (KPIs · Dados de entrada via DadosBrutos)
// Agora: 1 aba so · KPIs por valor com card 'OrigemDado' linkando pro modulo
//        correto onde se preenche o dado · zero entrada de dado nesta tela.
//
// Acesso a /dados-brutos so via admin agora (ver MODULO_POR_DADO_TIPO).
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { kpis as kpisApi } from '../api';
import { useKpis } from '../hooks/useKpis';
import { useMyKpiAreas } from '../hooks/useMyKpiAreas';
// KpiQuickFillModal removido · /minha-area e so visualizador
import KpiEditorModal from '../components/KpiEditorModal';
import OkrRevisaoModal from '../components/OkrRevisaoModal';
import KpiDetalheModal from '../components/KpiDetalheModal';
// DadosBrutos removido daqui · cada modulo tem sua propria entrada
import { Activity, Pencil, Plus, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock, TrendingDown, MinusCircle, ClipboardCheck, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { SkeletonBlock } from '../components/Skeleton';
import { formatErro } from '../lib/formatErro';

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

// Áreas operacionais — sustentam a NSM, não movem (PDF Planejamento 2026).
// KPIs com valores=[] caem aqui em vez de na seção dos 5 valores.
const AREAS_OPERACIONAIS = [
  { key: 'financeiro',     label: 'Financeiro',     cor: '#10B981' },
  { key: 'rh',             label: 'RH',             cor: '#F59E0B' },
  { key: 'infraestrutura', label: 'Infraestrutura', cor: '#6B7280' },
];
const AREAS_OPER_KEYS = AREAS_OPERACIONAIS.map(a => a.key);

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

// ============================================================================
// Mapeamento dado_tipo → modulo onde preencher
// (mesmo de MeusKpis · centralizado aqui pois /meus-kpis redireciona pra ca)
// ============================================================================
const MODULO_POR_DADO_TIPO = {
  // Auto-coletados (so visualiza)
  frequencia_culto: { titulo: 'Cultos',          path: '/cultos' },
  conversoes:       { titulo: 'Visitantes',      path: '/visitantes' },
  batismos:         { titulo: 'Batismo',         path: '/batismo' },
  // Voluntariado
  voluntarios_ativos:      { titulo: 'Voluntariado', path: '/voluntariado' },
  voluntarios_inativos_3m: { titulo: 'Voluntariado', path: '/voluntariado' },
  voluntarios_recuperados: { titulo: 'Voluntariado', path: '/voluntariado' },
  voluntarios_checkin:     { titulo: 'Voluntariado', path: '/voluntariado' },
  voluntarios_treinamento: { titulo: 'Voluntariado', path: '/voluntariado' },
  voluntarios_alocados:    { titulo: 'Voluntariado', path: '/voluntariado' },
  voluntarios_inativos:    { titulo: 'Voluntariado', path: '/voluntariado' },
  // Generosidade
  doacoes_valor:        { titulo: 'Generosidade', path: '/generosidade' },
  doadores_count:       { titulo: 'Generosidade', path: '/generosidade' },
  doadores_recorrentes: { titulo: 'Generosidade', path: '/generosidade' },
  doacoes_qualidade:    { titulo: 'Generosidade', path: '/generosidade' },
  // NEXT
  frequencia_next: { titulo: 'NEXT', path: '/next' },
  // Cuidados (Devocional, Jornada180, Capelania, Aconselhamento, Convertidos)
  inscricoes_jornada180:   { titulo: 'Cuidados', path: '/cuidados?tab=agregado' },
  devocionais:             { titulo: 'Cuidados', path: '/cuidados?tab=agregado' },
  solicitacoes_capelania:  { titulo: 'Cuidados', path: '/cuidados?tab=agregado' },
  solicitacoes_aconselh:   { titulo: 'Cuidados', path: '/cuidados?tab=agregado' },
  novos_convertidos_atend: { titulo: 'Cuidados', path: '/cuidados?tab=agregado' },
  // Grupos
  frequencia_grupos: { titulo: 'Grupos',     path: '/grupos' },
  grupos_ativos:     { titulo: 'Grupos',     path: '/grupos' },
  lideres_grupos:    { titulo: 'Grupos · Supervisao', path: '/grupos/supervisao' },
  lideres_treinados: { titulo: 'Grupos · Supervisao', path: '/grupos/supervisao' },
  lideres_acompanhados: { titulo: 'Grupos · Supervisao', path: '/grupos/supervisao' },
  // NPS
  nps_geral:       { titulo: 'NPS', path: '/nps' },
  nps_next:        { titulo: 'NPS', path: '/nps' },
  nps_lideres:     { titulo: 'NPS', path: '/nps' },
  nps_voluntarios: { titulo: 'NPS', path: '/nps' },
  nps_culto:       { titulo: 'NPS', path: '/nps' },
  satisfacao_lideres:     { titulo: 'NPS', path: '/nps' },
  satisfacao_voluntarios: { titulo: 'NPS', path: '/nps' },
  // Solicitacoes (membros pedem capelania/aconselh/servir)
  solicitacoes_capelania_recebidas:      { titulo: 'Cuidados', path: '/cuidados?tab=agregado' },
  solicitacoes_aconselhamento_recebidas: { titulo: 'Cuidados', path: '/cuidados?tab=agregado' },
  solicitacoes_servir_recebidas: { titulo: 'Voluntariado', path: '/voluntariado' },
  solicitacoes_servir_alocadas:  { titulo: 'Voluntariado', path: '/voluntariado' },
};

export default function MinhaArea() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Aba dados removida · /minha-area e so visualizador agora

  const { profile } = useAuth();
  const { kpis, isLoading, refetch } = useKpis();
  const { kpiAreas, isAdmin, canEditAny, ministerioId, ministerioPapel } = useMyKpiAreas();

  const [registros, setRegistros] = useState([]);
  const [trajetorias, setTrajetorias] = useState([]);
  // fillKpi removido · cada modulo tem entrada propria
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

  // Agrupar KPIs operacionais (admin) por área — não amarrados a nenhum valor.
  // Sustentam a NSM, não movem (Financeiro, RH, Infraestrutura).
  const porAreaOper = useMemo(() => {
    const m = {};
    AREAS_OPERACIONAIS.forEach(a => { m[a.key] = []; });
    meusKpis.forEach(k => {
      const a = String(k.area_db || '').toLowerCase();
      if (m[a]) m[a].push(k);
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

  // handleSaved removido · entrada agora e nos modulos

  if (isLoading) {
    return (
      <div style={{ padding: '24px 20px', maxWidth: 960, margin: '0 auto' }}>
        <SkeletonBlock height={56} style={{ marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 18 }}>
          <SkeletonBlock height={64} /><SkeletonBlock height={64} /><SkeletonBlock height={64} /><SkeletonBlock height={64} /><SkeletonBlock height={64} />
        </div>
        <SkeletonBlock height={140} style={{ marginBottom: 10 }} />
        <SkeletonBlock height={140} />
      </div>
    );
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
          Peca para um administrador atribuir suas areas no modulo de Permissoes.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={22} style={{ color: C.primary }} />
          Minha Area
        </h1>
        <p style={{ fontSize: 12, color: C.t3, marginTop: 6, lineHeight: 1.5 }}>
          {isAdmin && <span>Admin/diretor — voce edita tudo. </span>}
          {kpiAreas.length > 0 && (
            <span>
              Lider de area: {kpiAreas.map(a => (
                <span key={a} style={{ marginRight: 4, padding: '2px 10px', borderRadius: 99, background: C.primaryBg, color: C.primaryDark, fontWeight: 600, fontSize: 11, textTransform: 'capitalize' }}>{a}</span>
              ))}
              <span style={{ marginRight: 6 }}>· cobrado pelo resultado.</span>
            </span>
          )}
          {ministerioId && (
            <span>
              {ministerioPapel === 'lider' ? 'Lider' : 'Assistente'} do ministerio
              <span style={{ marginLeft: 6, marginRight: 6, padding: '2px 10px', borderRadius: 99, background: '#3B82F620', color: '#3B82F6', fontWeight: 600, fontSize: 11, textTransform: 'capitalize' }}>{ministerioId}</span>
              · responsavel pela coleta dos dados.
            </span>
          )}
          {!isAdmin && !kpiAreas.length && !ministerioId && (
            <span>Modo leitura — voce ve todos os KPIs e dados, mas nao edita.</span>
          )}
        </p>
      </header>

      {/* Aviso curto · o que e essa pagina */}
      <div style={{
        background: 'var(--cbrio-input-bg)', borderLeft: '3px solid var(--cbrio-text3)',
        padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 12, color: 'var(--cbrio-text2)',
      }}>
        Aqui voce <strong>visualiza</strong> o resultado dos KPIs da sua area.
        Para preencher dados, va no <strong>modulo correspondente</strong>
        (indicado em cada card abaixo).
      </div>

      <>
          {canEditAny && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button onClick={() => setCreateOpen(true)} style={btnPrimary}>
                <Plus size={14} /> Novo KPI
              </button>
            </div>
          )}

          {/* Stats */}
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

          {/* Acordeao por área operacional (Financeiro, RH, Infraestrutura)
              — sustenta a NSM, não move. KPIs sem amarração com os 5 valores. */}
          {(() => {
            const totalOper = AREAS_OPERACIONAIS.reduce((s, a) => s + (porAreaOper[a.key]?.length || 0), 0);
            if (totalOper === 0) return null;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 4px', marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Operações
                  </span>
                  <span style={{ fontSize: 11, color: C.t3 }}>· sustenta a NSM (não move)</span>
                </div>
                {AREAS_OPERACIONAIS.map(a => {
                  const kpisDaArea = porAreaOper[a.key] || [];
                  if (kpisDaArea.length === 0) return null;
                  const pendentes = kpisDaArea.filter(k => statusKpi(k) !== 'no_alvo').length;
                  const expandKey = `oper:${a.key}`;
                  const expanded = valorExpandido === expandKey;
                  return (
                    <section key={a.key} style={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderLeft: `3px solid ${a.cor}`,
                      borderRadius: 8, overflow: 'hidden',
                    }}>
                      <button
                        onClick={() => setValorExpandido(expanded ? null : expandKey)}
                        style={{
                          width: '100%', padding: 14,
                          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        {expanded ? <ChevronDown size={16} style={{ color: C.t3 }} /> : <ChevronRight size={16} style={{ color: C.t3 }} />}
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: a.cor }} />
                        <strong style={{ fontSize: 14, color: C.text }}>{a.label}</strong>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--cbrio-input-bg)', color: C.t2, fontWeight: 600, marginLeft: 'auto' }}>
                          {kpisDaArea.length} KPI{kpisDaArea.length === 1 ? '' : 's'}
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
                            {kpisDaArea.map(kpi => (
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
            );
          })()}
        </>

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

function KpiCard({ kpi, status, ultimo, canEdit, onEditar, onRevisar, onDetalhe }) {
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

      {/* Origem do dado · indica onde preencher (modulo) */}
      <OrigemDado kpi={kpi} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <button onClick={onDetalhe} style={btnGhostSm}>
          <Activity size={11} /> Detalhe
        </button>
        {canEdit && (
          <button onClick={onEditar} style={btnGhostSm}>
            <Pencil size={11} /> Editar meta
          </button>
        )}
        {podeRevisar && (
          <button onClick={onRevisar} style={{ ...btnGhostSm, color: sv.cor, borderColor: sv.cor + '60' }}>
            <ClipboardCheck size={11} /> Revisar
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// OrigemDado · chip linkando pro modulo onde se preenche
// ============================================================================
function OrigemDado({ kpi }) {
  const dadoTipo = kpi.formula_config?.dado_tipo;
  const fonteAuto = kpi.fonte_auto;
  const dadoTipoManual = !!kpi.dado_tipo_manual;
  const moduloInfo = dadoTipo && MODULO_POR_DADO_TIPO[dadoTipo];

  // Automatico: fonte_auto definida OU dado_tipo nao-manual (modulo cuida)
  const isAutomatico = (!!fonteAuto && !dadoTipo) || (!!dadoTipo && !dadoTipoManual);

  if (isAutomatico) {
    return (
      <div style={{
        background: '#10B98118', borderLeft: '3px solid #10B981',
        padding: '6px 10px', borderRadius: 4, marginTop: 8,
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Automático
        </span>
        <span style={{ color: 'var(--cbrio-text3)', flex: 1 }}>
          {moduloInfo ? `Sobe via ${moduloInfo.titulo}` : 'Coletado automaticamente'}
        </span>
        {moduloInfo && (
          <a href={moduloInfo.path} style={{ color: '#047857', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Ver módulo <ExternalLink size={10} />
          </a>
        )}
      </div>
    );
  }

  // Manual: aponta pro modulo correto (ou /dados-brutos como fallback)
  const destino = moduloInfo || { titulo: 'Dados Brutos (admin)', path: '/dados-brutos' };
  return (
    <div style={{
      background: '#F59E0B18', borderLeft: '3px solid #F59E0B',
      padding: '6px 10px', borderRadius: 4, marginTop: 8,
      display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Manual
      </span>
      <span style={{ color: 'var(--cbrio-text3)', flex: 1 }}>
        Preencha em {destino.titulo}
      </span>
      <a href={destino.path} style={{ color: '#B45309', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        Abrir <ExternalLink size={10} />
      </a>
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
