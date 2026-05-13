// ============================================================================
// /dados-brutos — Lider preenche numeros absolutos (frequencia, conversoes,
// batismos, doacoes, etc). KPIs com tipo_calculo automatico leem daqui.
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dadosBrutos as dadosApi } from '../api';
import { useMyKpiAreas } from '../hooks/useMyKpiAreas';
import { Database, Plus, Pencil, Trash2, X, Save, Calendar, Filter, CheckCircle2, ShieldCheck, Users, HandCoins, Sparkles, HeartHandshake, ClipboardList, Smile, Zap } from 'lucide-react';
import { toast } from 'sonner';
import EmptyState from '../components/EmptyState';
import CalendarioCultos from '../components/CalendarioCultos';
import { formatErro } from '../lib/formatErro';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};

const AREAS_OFICIAIS = [
  { id: 'kids',   nome: 'Kids' },
  { id: 'bridge', nome: 'Bridge' },
  { id: 'ami',    nome: 'AMI' },
  { id: 'sede',   nome: 'Sede' },
  { id: 'online', nome: 'Online' },
  // CBA removido · so coleta batismos/aceitacoes (dados_brutos com area=igreja)
];

// Quick log · 4-6 tipos mais comuns por area. Click pre-preenche tipo+area.
// Frequencia/decisoes de culto sao preenchidas pelo calendario acima · aqui
// ficam so os tipos avulsos (fora de culto regular).
const QUICK_LOG_POR_AREA = {
  kids:   ['conversoes', 'batismos', 'voluntarios_checkin'],
  bridge: ['conversoes', 'batismos', 'voluntarios_checkin'],
  ami:    ['conversoes', 'batismos', 'voluntarios_checkin', 'nps_next'],
  sede:   ['conversoes', 'batismos', 'doacoes_valor', 'doadores_count', 'voluntarios_ativos'],
  online: ['conversoes', 'batismos'],
  cba:    ['conversoes', 'batismos', 'lideres_treinados', 'lideres_acompanhados'],
};

// Default para admin/diretor sem area especifica
const QUICK_LOG_DEFAULT = ['conversoes', 'batismos', 'doacoes_valor', 'voluntarios_ativos', 'nps_geral'];

// Icone + cor por familia de tipo · usado nos cards do quick log
const TIPO_VISUAL = {
  frequencia_culto:        { Icon: Users,         cor: '#3B82F6', label: 'Frequência do culto' },
  frequencia_next:         { Icon: Users,         cor: '#3B82F6', label: 'Frequência Next' },
  frequencia_grupos:       { Icon: Users,         cor: '#3B82F6', label: 'Frequência grupos' },
  conversoes:              { Icon: Sparkles,      cor: '#8B5CF6', label: 'Decisões / Conversões' },
  batismos:                { Icon: Sparkles,      cor: '#8B5CF6', label: 'Batismos' },
  voluntarios_ativos:      { Icon: HeartHandshake,cor: '#10B981', label: 'Voluntários ativos' },
  voluntarios_inativos_3m: { Icon: HeartHandshake,cor: '#10B981', label: 'Voluntários inativos' },
  voluntarios_recuperados: { Icon: HeartHandshake,cor: '#10B981', label: 'Voluntários recuperados' },
  voluntarios_checkin:     { Icon: HeartHandshake,cor: '#10B981', label: 'Check-in voluntários' },
  voluntarios_treinamento: { Icon: HeartHandshake,cor: '#10B981', label: 'Voluntários em treinamento' },
  doacoes_valor:           { Icon: HandCoins,     cor: '#F59E0B', label: 'Doações (R$)' },
  doadores_count:          { Icon: HandCoins,     cor: '#F59E0B', label: 'Doadores' },
  doadores_recorrentes:    { Icon: HandCoins,     cor: '#F59E0B', label: 'Doadores recorrentes' },
  lideres_grupos:          { Icon: Users,         cor: '#EC4899', label: 'Líderes de grupo' },
  lideres_treinados:       { Icon: Users,         cor: '#EC4899', label: 'Líderes treinados' },
  lideres_acompanhados:    { Icon: Users,         cor: '#EC4899', label: 'Líderes acompanhados' },
  grupos_ativos:           { Icon: Users,         cor: '#EC4899', label: 'Grupos ativos' },
  devocionais:             { Icon: Sparkles,      cor: '#8B5CF6', label: 'Devocionais' },
  nps_geral:               { Icon: Smile,         cor: '#06B6D4', label: 'NPS geral' },
  nps_next:                { Icon: Smile,         cor: '#06B6D4', label: 'NPS Next' },
  nps_lideres:             { Icon: Smile,         cor: '#06B6D4', label: 'NPS líderes' },
  nps_voluntarios:         { Icon: Smile,         cor: '#06B6D4', label: 'NPS voluntários' },
};

function visualParaTipo(tipo) {
  const v = TIPO_VISUAL[tipo.id];
  if (v) return v;
  return { Icon: ClipboardList, cor: '#6B7280', label: tipo.nome };
}

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DadosBrutos({ embedded = false }) {
  const { profile } = useAuth();
  const { kpiAreas, isAdmin, ministerioId, ministerioPapel, canEditDado, canValidate } = useMyKpiAreas();
  const [tipos, setTipos] = useState([]);
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroDesde, setFiltroDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d.toISOString().slice(0, 10);
  });
  const [editando, setEditando] = useState(null); // null | {} (novo) | {dado existente}

  // Todos veem todas as areas (read). So edita as proprias (validado no submit).
  const areasDisponiveis = AREAS_OFICIAIS;

  // Areas que o usuario pode registrar dado AS suas (lider de area)
  const areasEditaveis = useMemo(() => {
    if (isAdmin) return AREAS_OFICIAIS;
    return AREAS_OFICIAIS.filter(a => kpiAreas.includes(a.id));
  }, [isAdmin, kpiAreas]);

  // Lider/assistente de ministerio pode registrar dados em todas areas
  const podeRegistrar = isAdmin || areasEditaveis.length > 0 || !!ministerioId;

  // Carregar tipos
  useEffect(() => {
    dadosApi.tipos.list()
      .then(setTipos)
      .catch(() => setTipos([]));
  }, []);

  // Carregar dados (com filtros)
  const loadDados = useCallback(async () => {
    setLoading(true);
    try {
      const params = { desde: filtroDesde };
      if (filtroArea) params.area = filtroArea;
      if (filtroTipo) params.tipo_id = filtroTipo;
      const data = await dadosApi.list(params);
      setDados(data);
    } catch (e) {
      toast.error(formatErro(e, 'dados brutos'));
    } finally {
      setLoading(false);
    }
  }, [filtroArea, filtroTipo, filtroDesde]);

  // Default · ao montar, se lider tem 1+ areas pre-seleciona a primeira (evita
  // tela vazia para nao-admin). Admin/ministerial veem tudo.
  useEffect(() => {
    if (!filtroArea && !isAdmin && !ministerioId && kpiAreas.length > 0) {
      setFiltroArea(kpiAreas[0]);
    }
  }, [filtroArea, isAdmin, ministerioId, kpiAreas]);

  // Carrega sempre · admin/ministerial sem filtro = todas; lider so a sua area
  useEffect(() => {
    loadDados();
  }, [loadDados]);

  const remover = async (d) => {
    if (!window.confirm(`Remover registro de ${d.tipo_nome} (${d.area} · ${d.data})?`)) return;
    try {
      await dadosApi.remove(d.id);
      toast.success('Removido');
      loadDados();
    } catch (e) { toast.error(e?.message); }
  };

  const validar = async (d) => {
    try {
      if (d.validado_em) {
        await dadosApi.desvalidar(d.id);
        toast.success('Validacao removida');
      } else {
        await dadosApi.validar(d.id);
        toast.success('Validado');
      }
      loadDados();
    } catch (e) { toast.error(e?.message); }
  };

  // Mapa de tipo_id → ministerio_id (pra checar canEditDado)
  const ministerioByTipo = useMemo(() => {
    const m = {};
    tipos.forEach(t => { m[t.id] = t.ministerio_id; });
    return m;
  }, [tipos]);

  // Quick log · tipos sugeridos baseado em quem voce e
  // - Lider de area(s): uniao dos quick log das suas areas (max 6)
  // - Lider de ministerio: tipos do ministerio dele (max 6)
  // - Admin/diretor sem area: lista default
  const quickLog = useMemo(() => {
    if (!tipos.length) return [];
    const tipoById = Object.fromEntries(tipos.map(t => [t.id, t]));
    let ids = [];
    if (!isAdmin && ministerioId && !areasEditaveis.length) {
      ids = tipos.filter(t => t.ministerio_id === ministerioId).slice(0, 6).map(t => t.id);
    } else if (kpiAreas.length > 0) {
      const set = new Set();
      kpiAreas.forEach(a => { (QUICK_LOG_POR_AREA[a] || []).forEach(id => set.add(id)); });
      ids = Array.from(set).slice(0, 6);
    } else {
      ids = QUICK_LOG_DEFAULT;
    }
    return ids.map(id => tipoById[id]).filter(Boolean);
  }, [tipos, isAdmin, ministerioId, kpiAreas, areasEditaveis]);

  // Abre modal com tipo (e area se unica) pre-preenchidos
  const quickLogClick = (tipoId) => {
    const tipo = tipos.find(t => t.id === tipoId);
    if (!tipo) return;
    const areaPre = areasEditaveis.length === 1 ? areasEditaveis[0].id
                   : (filtroArea || '');
    setEditando({ tipo_id: tipoId, area: areaPre });
  };

  return (
    <div style={{ padding: embedded ? 0 : '24px 32px', maxWidth: embedded ? '100%' : 1200, margin: embedded ? 0 : '0 auto' }}>
      {!embedded && (
      <header style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={22} style={{ color: C.primary }} />
            Dados Brutos
          </h1>
          <p style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
            Numeros absolutos da igreja (frequencia, conversoes, batismos, doacoes...).
            {isAdmin && ' Voce edita qualquer dado (admin).'}
            {!isAdmin && areasEditaveis.length > 0 && (
              <> Voce e <strong>lider de area</strong> ({areasEditaveis.map(a => a.nome).join(', ')}) — edita/valida dados da sua area.</>
            )}
            {!isAdmin && ministerioId && (
              <> Voce e <strong>{ministerioPapel} de {ministerioId}</strong> — preenche dados do seu ministerio em todas as areas.</>
            )}
            {!isAdmin && !areasEditaveis.length && !ministerioId && ' Modo leitura.'}
          </p>
        </div>
      </header>
      )}

      {/* Cultos do mes · forma principal de preencher frequencia/decisoes/online.
          Click no culto abre modal com campos nativos da tabela `cultos`. */}
      {podeRegistrar && <CalendarioCultos />}

      {/* Quick log · cards grandes com os tipos mais comuns da sua area.
          Click pre-preenche tipo (e area se voce so lidera uma). */}
      {podeRegistrar && quickLog.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              <Zap size={11} style={{ color: C.primary }} /> Lançamento rápido
            </div>
            <button
              onClick={() => setEditando({})}
              style={{
                padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <Plus size={12} /> Outros tipos
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {quickLog.map(tipo => {
              const v = visualParaTipo(tipo);
              return (
                <button
                  key={tipo.id}
                  onClick={() => quickLogClick(tipo.id)}
                  title={tipo.descricao || tipo.nome}
                  style={{
                    textAlign: 'left', padding: 14, borderRadius: 10, cursor: 'pointer',
                    background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${v.cor}`,
                    display: 'flex', flexDirection: 'column', gap: 8, minHeight: 92,
                    transition: 'transform 0.05s, border-color 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = v.cor; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.borderLeftColor = v.cor; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: `${v.cor}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <v.Icon size={16} style={{ color: v.cor }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <strong style={{ fontSize: 13, color: C.text, lineHeight: 1.2 }}>
                      Lançar {v.label.toLowerCase()}
                    </strong>
                    {tipo.unidade && (
                      <span style={{ fontSize: 10, color: C.t3 }}>{tipo.unidade}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Fallback geral quando nao tem area mapeada para quick log */}
      {podeRegistrar && quickLog.length === 0 && (
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setEditando({})}
            style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Registrar dado
          </button>
        </div>
      )}

      {/* Filtros */}
      <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.t3, marginBottom: 8 }}>
          <Filter size={11} /> Filtros
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <Field label="Area">
            <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={inp}>
              <option value="">Todas</option>
              {areasDisponiveis.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Field>
          <Field label="Tipo de dado">
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={inp}>
              <option value="">Todos</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Field>
          <Field label="Desde">
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} style={inp} />
          </Field>
        </div>
      </section>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>
      ) : dados.length === 0 ? (
        <EmptyState
          tom="neutro"
          icone={Database}
          titulo="Nenhum dado registrado neste filtro"
          mensagem={
            filtroArea || filtroTipo
              ? 'Tente ajustar os filtros acima ou expandir o periodo.'
              : 'Comece registrando o primeiro dado bruto · frequencia de culto, conversoes, doacoes etc.'
          }
          cta={podeRegistrar ? { label: '+ Registrar dado', onClick: () => setEditando({}) } : null}
        />
      ) : (
        <>
          {/* Tabela: desktop (>= 768px) */}
          <div className="dados-table-desktop" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.inputBg }}>
                  <th style={th}>Data</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Area</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                  <th style={th}>Origem</th>
                  <th style={th}>Observação</th>
                  <th style={{ ...th, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {dados.map(d => (
                  <tr key={d.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>{d.data}</td>
                    <td style={td}>
                      <strong>{d.tipo_nome}</strong>
                      {d.unidade && <span style={{ color: C.t3, fontSize: 10 }}> · {d.unidade}</span>}
                    </td>
                    <td style={{ ...td, textTransform: 'capitalize' }}>{d.area}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {Number(d.valor).toLocaleString('pt-BR')}
                    </td>
                    <td style={td}>
                      <span style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 99,
                        background: d.origem === 'auto' ? '#3B82F620' : C.inputBg,
                        color: d.origem === 'auto' ? '#3B82F6' : C.t3,
                        fontWeight: 600, textTransform: 'uppercase',
                      }}>{d.origem}</span>
                    </td>
                    <td style={{ ...td, color: C.t3, fontSize: 11 }}>{d.observacao || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {d.validado_em && (
                        <span title={`Validado em ${new Date(d.validado_em).toLocaleDateString('pt-BR')}`}
                          style={{ marginRight: 6, color: '#10B981', display: 'inline-flex', verticalAlign: 'middle' }}>
                          <ShieldCheck size={13} />
                        </span>
                      )}
                      {canValidate(d.area) && d.origem !== 'auto' && (
                        <button onClick={() => validar(d)}
                          title={d.validado_em ? 'Desfazer validacao' : 'Validar (OK final do ciclo)'}
                          style={{ ...btnIcon, color: d.validado_em ? '#10B981' : '#9CA3AF' }}>
                          <CheckCircle2 size={12} />
                        </button>
                      )}
                      {d.origem !== 'auto' && canEditDado(d.area, ministerioByTipo[d.tipo_id]) && (
                        <>
                          <button onClick={() => setEditando(d)} style={btnIcon}><Pencil size={12} /></button>
                          <button onClick={() => remover(d)} style={{ ...btnIcon, color: '#EF4444' }}><Trash2 size={12} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards: mobile (< 768px) */}
          <div className="dados-cards-mobile" style={{ display: 'none', flexDirection: 'column', gap: 8 }}>
            {dados.map(d => (
              <div key={d.id} style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{d.tipo_nome}</div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
                      <span style={{ textTransform: 'capitalize' }}>{d.area}</span> · {d.data}
                      {d.origem === 'auto' && (
                        <span style={{
                          marginLeft: 6, fontSize: 8, padding: '1px 5px', borderRadius: 99,
                          background: '#3B82F620', color: '#3B82F6', fontWeight: 600, textTransform: 'uppercase',
                        }}>auto</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                    {Number(d.valor).toLocaleString('pt-BR')}
                    {d.unidade && <span style={{ fontSize: 10, color: C.t3, marginLeft: 4 }}>{d.unidade}</span>}
                  </div>
                </div>
                {d.observacao && (
                  <div style={{ fontSize: 11, color: C.t3, fontStyle: 'italic', marginBottom: 6 }}>{d.observacao}</div>
                )}
                {d.origem !== 'auto' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {canValidate(d.area) && (
                      <button onClick={() => validar(d)}
                        style={{ flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: d.validado_em ? '#D1FAE5' : 'transparent',
                          color: d.validado_em ? '#065F46' : C.t2,
                          border: `1px solid ${d.validado_em ? '#10B98140' : C.border}`,
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} /> {d.validado_em ? 'Validado' : 'Validar'}
                      </button>
                    )}
                    {canEditDado(d.area, ministerioByTipo[d.tipo_id]) && (
                      <>
                        <button onClick={() => setEditando(d)}
                          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <Pencil size={12} /> Editar
                        </button>
                        <button onClick={() => remover(d)}
                          style={{ padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'transparent', color: '#EF4444', border: `1px solid #EF444440`, cursor: 'pointer' }}>
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <style>{`
            @media (max-width: 767px) {
              .dados-table-desktop { display: none; }
              .dados-cards-mobile { display: flex !important; }
            }
          `}</style>
        </>
      )}

      {editando !== null && (
        <ModalRegistrar
          dado={editando}
          tipos={tipos}
          ministerioId={ministerioId}
          isAdmin={isAdmin}
          areasOficiais={AREAS_OFICIAIS}
          areasEditaveis={areasEditaveis}
          areaDefault={filtroArea || (areasEditaveis[0]?.id || '') || AREAS_OFICIAIS[0]?.id}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); loadDados(); }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// ModalRegistrar — criar/editar registro
// ----------------------------------------------------------------------------
function ModalRegistrar({ dado, tipos, ministerioId, isAdmin, areasOficiais, areasEditaveis, areaDefault, onClose, onSaved }) {
  // Lider de ministerio pode preencher em qualquer area; lider de area so na sua
  const areasDisponiveis = (isAdmin || ministerioId) ? areasOficiais : areasEditaveis;
  // 1. Filtra tipos automaticos (entrada_manual=false vem de modulos externos)
  const tiposManuais = tipos.filter(t => t.entrada_manual !== false);
  // 2. Tipos disponiveis conforme permissao
  const tiposDisponiveis = (isAdmin || areasEditaveis?.length > 0 || !ministerioId)
    ? tiposManuais
    : tiposManuais.filter(t => t.ministerio_id === ministerioId);
  const isNovo = !dado.id;
  const [form, setForm] = useState({
    tipo_id: dado.tipo_id || '',
    area: dado.area || areaDefault || '',
    data: dado.data || hoje(),
    valor: dado.valor != null ? String(dado.valor) : '',
    observacao: dado.observacao || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const tipoSelecionado = tipos.find(t => t.id === form.tipo_id);

  const submit = async () => {
    if (!form.tipo_id) return toast.error('Tipo obrigatorio');
    if (!form.area)    return toast.error('Area obrigatoria');
    if (!form.data)    return toast.error('Data obrigatoria');
    if (form.valor === '' || isNaN(Number(form.valor))) return toast.error('Valor invalido');

    setSaving(true);
    try {
      const payload = {
        ...form,
        valor: Number(form.valor),
        observacao: form.observacao.trim() || null,
      };
      if (isNovo) {
        await dadosApi.create(payload);
        toast.success('Dado registrado');
      } else {
        await dadosApi.update(dado.id, { valor: payload.valor, observacao: payload.observacao });
        toast.success('Dado atualizado');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()}
        style={{ background: C.modalBg, borderRadius: 12, maxWidth: 520, width: '100%', maxHeight: '92vh', overflow: 'auto' }}
      >
        <header style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
            {isNovo ? 'Registrar dado' : 'Editar dado'}
          </h2>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}>
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: 16 }}>
          <Field label="Tipo de dado *">
            <select value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)} style={inp} disabled={!isNovo}>
              <option value="">— Escolher —</option>
              {tiposDisponiveis.map(t => (
                <option key={t.id} value={t.id}>{t.nome}{t.unidade ? ` (${t.unidade})` : ''}</option>
              ))}
            </select>
          </Field>
          {tipoSelecionado && (
            <p style={{ fontSize: 10, color: C.t3, marginTop: -8, marginBottom: 12, fontStyle: 'italic' }}>
              {tipoSelecionado.descricao} · granularidade: {tipoSelecionado.granularidade}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Area *">
              <select value={form.area} onChange={e => set('area', e.target.value)} style={inp} disabled={!isNovo}>
                <option value="">— Escolher —</option>
                {areasDisponiveis.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </Field>
            <Field label="Data *">
              <input type="date" value={form.data} onChange={e => set('data', e.target.value)} style={inp} disabled={!isNovo} />
            </Field>
          </div>

          <Field label={`Valor *${tipoSelecionado?.unidade ? ' · ' + tipoSelecionado.unidade : ''}`}>
            <input type="number" step="any" value={form.valor} onChange={e => set('valor', e.target.value)} style={inp} placeholder="Ex: 850" autoFocus />
          </Field>

          <Field label="Observação">
            <textarea value={form.observacao} onChange={e => set('observacao', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Notas opcionais (ex: 'culto extra de natal')" />
          </Field>

          {!isNovo && (
            <p style={{ fontSize: 10, color: C.t3, fontStyle: 'italic' }}>
              Tipo, area e data sao a chave do registro — nao podem ser editados. Pra mudar, remova e crie novo.
            </p>
          )}
        </div>

        <footer style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  );
}

const inp = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: `1px solid ${C.border}`, background: C.inputBg, color: C.text,
  fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit',
};
const th = { textAlign: 'left', padding: 10, fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 };
const td = { padding: 10 };
const btnPrimary = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
  background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const btnGhost = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer',
};
const btnIcon = {
  background: 'transparent', border: 'none', padding: 6, borderRadius: 4,
  cursor: 'pointer', color: C.t3,
};
