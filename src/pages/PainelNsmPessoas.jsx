// ============================================================================
// /painel/nsm/pessoas — Camada 4 do drilldown (Sistema OKR/NSM 2026)
//
// Lista de pessoas que tomaram decisao recentemente, com filtro engajou ou nao.
// Vira ferramenta de acao pastoral: clicar na NSM, ver quem faltou engajar.
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { painel as painelApi } from '../api';
import { ArrowLeft, Phone, Mail, Calendar, AlertTriangle, CheckCircle2, Clock, Users, HelpCircle, EyeOff } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D',
};

const VALOR_CORES = {
  seguir:       '#8B5CF6',
  conectar:     '#3B82F6',
  investir:     '#F59E0B',
  servir:       '#10B981',
  generosidade: '#EC4899',
};

const SEGMENTO_LABEL = {
  central: 'CBRio Total',
  cbrio:   'CBRio Sede',
  online:  'CBRio Online',
  // CBA removido · so coleta batismos/aceitacoes via dados_brutos
};

export default function PainelNsmPessoas() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const segmento = params.get('segmento') || 'central';
  // view: 'engajados' | 'nao_engajados' | 'sem_dados'
  const viewParam = params.get('view');
  const view = viewParam || (params.get('engajados') === 'true' ? 'engajados' : 'nao_engajados');
  const dias = Number(params.get('dias')) || 90;

  const [data, setData] = useState(null);
  const [semDados, setSemDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    if (view === 'sem_dados') {
      painelApi.nsmSemDados({ dias })
        .then(setSemDados)
        .catch(e => setErro(e?.message || 'Erro ao carregar'))
        .finally(() => setLoading(false));
    } else {
      const engajados = view === 'engajados';
      painelApi.nsmPessoas({ segmento, engajados: String(engajados), dias })
        .then(setData)
        .catch(e => setErro(e?.message || 'Erro ao carregar'))
        .finally(() => setLoading(false));
    }
  }, [segmento, view, dias]);

  const setFilter = (key, val) => {
    const next = new URLSearchParams(params);
    next.set(key, val);
    setParams(next, { replace: true });
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <button onClick={() => navigate('/painel')} style={btnVoltar}>
        <ArrowLeft size={14} /> Voltar ao painel
      </button>

      <div style={{ marginTop: 16, marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={22} style={{ color: C.primary }} />
          Pessoas convertidas — {SEGMENTO_LABEL[segmento] || segmento}
        </h1>
        <p style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
          Drilldown da NSM · últimas {dias} dias · {
            view === 'engajados'  ? 'que engajaram em ≥1 valor em 60d'
          : view === 'sem_dados'  ? 'decisões em culto sem nome/contato registrado (impossível acompanhar)'
          : 'que NÃO engajaram em 60d (ação pastoral)'
          }
        </p>
      </div>

      {/* Tabs · view */}
      <div style={{
        display: 'inline-flex', gap: 4, marginBottom: 14,
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4,
      }}>
        {[
          { v: 'nao_engajados', l: 'Não engajados', Icon: AlertTriangle, cor: '#EF4444' },
          { v: 'engajados',     l: 'Engajados',     Icon: CheckCircle2, cor: '#10B981' },
          { v: 'sem_dados',     l: 'Sem dados',     Icon: EyeOff,        cor: '#F59E0B' },
        ].map(opt => {
          const Ic = opt.Icon;
          const ativo = view === opt.v;
          return (
            <button
              key={opt.v}
              onClick={() => setFilter('view', opt.v)}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: ativo ? `${opt.cor}1a` : 'transparent',
                color: ativo ? opt.cor : C.t2,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Ic size={13} /> {opt.l}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16,
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
      }}>
        {view !== 'sem_dados' && (
          <Filtro label="Segmento" valor={segmento} options={['central', 'cbrio', 'online']}
            onChange={v => setFilter('segmento', v)}
            formato={(v) => SEGMENTO_LABEL[v] || v}
          />
        )}
        <Filtro label="Janela" valor={String(dias)} options={['30', '60', '90', '180']}
          onChange={v => setFilter('dias', v)}
          formato={(v) => `${v} dias`}
        />
      </div>

      {/* Stats · pessoas (não-engajados ou engajados) */}
      {view !== 'sem_dados' && data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Stat label="Convertidos no periodo" value={data.total_convertidos} cor={C.t2} />
          <Stat label="Engajados em 60d" value={data.total_engajados} cor="#10B981" />
          <Stat label="Ainda nao engajados" value={data.total_nao_engajados} cor="#EF4444" />
          <Stat
            label="% engajamento"
            value={data.total_convertidos > 0
              ? Math.round((data.total_engajados / data.total_convertidos) * 100) + '%'
              : '—'}
            cor={C.primary}
          />
        </div>
      )}

      {/* Stats · sem_dados */}
      {view === 'sem_dados' && semDados?.resumo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Stat label="Cultos com decisões" value={semDados.resumo.total_cultos} cor={C.t2} />
          <Stat label="Total decisões agregado" value={semDados.resumo.total_decisoes} cor="#3B82F6" />
          <Stat label="Pessoas registradas" value={semDados.resumo.total_registradas} cor="#10B981" />
          <Stat label="SEM DADOS (gap)" value={semDados.resumo.total_sem_dados} cor="#EF4444" />
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>
      ) : erro ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>{erro}</div>
      ) : view === 'sem_dados' ? (
        !semDados?.items?.length ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13, background: C.card, borderRadius: 10, border: `1px dashed ${C.border}` }}>
            Nenhum culto com decisões em aberto · 100% das decisões têm pessoa registrada 🎉
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {semDados.items.map(c => <CultoSemDadosCard key={c.culto_id} culto={c} navigate={navigate} />)}
          </div>
        )
      ) : !data?.pessoas?.length ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13, background: C.card, borderRadius: 10, border: `1px dashed ${C.border}` }}>
          {view === 'engajados'
            ? 'Ninguém engajou ainda neste segmento.'
            : 'Todo mundo do segmento engajou — ou não há decisões recentes.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.pessoas.map(p => (
            <PessoaCard key={p.id} pessoa={p} engajados={view === 'engajados'} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cor }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.t3, marginTop: 4, letterSpacing: 0.3 }}>{label}</div>
    </div>
  );
}

function Filtro({ label, valor, options, onChange, formato }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.t3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {options.map(o => {
          const ativo = String(o) === String(valor);
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                border: ativo ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                background: ativo ? C.primary + '18' : 'transparent',
                color: ativo ? C.primary : C.t2,
                cursor: 'pointer',
              }}
            >
              {formato ? formato(o) : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PessoaCard({ pessoa, engajados }) {
  const dentro = pessoa.dentro_janela_60d;
  const corBorda = engajados
    ? '#10B981'
    : dentro
      ? (pessoa.dias_restantes_janela <= 14 ? '#F59E0B' : '#3B82F6')
      : '#EF4444';

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${corBorda}`,
      borderRadius: 10, padding: 12,
      display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: corBorda + '20', color: corBorda,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 14, flexShrink: 0,
      }}>
        {(pessoa.nome || '?').charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, color: C.text }}>{pessoa.nome || 'Sem nome'}</strong>
          {pessoa.tipo_decisao && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'var(--cbrio-input-bg)', color: C.t2, fontWeight: 600 }}>
              decisao {pessoa.tipo_decisao}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Calendar size={11} /> Decisao {pessoa.data_decisao} · {pessoa.dias_decorridos}d atras
          </span>
          {pessoa.telefone && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Phone size={11} /> {pessoa.telefone}
            </span>
          )}
          {pessoa.email && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Mail size={11} /> {pessoa.email}
            </span>
          )}
        </div>
      </div>
      <div style={{ minWidth: 160, textAlign: 'right' }}>
        {engajados ? (
          <>
            <div style={{ fontSize: 11, color: '#10B981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={13} /> Engajou em {pessoa.valores_engajados.length} valor{pessoa.valores_engajados.length === 1 ? '' : 'es'}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {pessoa.valores_engajados.map(v => (
                <span key={v} style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 99,
                  background: VALOR_CORES[v] + '20', color: VALOR_CORES[v], fontWeight: 700,
                }}>
                  {v}
                </span>
              ))}
            </div>
          </>
        ) : dentro ? (
          <>
            <div style={{ fontSize: 11, color: corBorda, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={13} /> {pessoa.dias_restantes_janela}d restantes
            </div>
            <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
              janela 60d · {pessoa.dias_restantes_janela <= 14 ? 'urgente' : 'em prazo'}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={13} /> Janela vencida
            </div>
            <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
              ha {pessoa.dias_decorridos - 60}d · acao pastoral urgente
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const btnVoltar = {
  background: 'transparent', border: `1px solid ${C.border}`,
  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  color: C.t2, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

// ============================================================================
// CultoSemDadosCard · linha mostrando culto com gap entre decisoes e pessoas
// ============================================================================
function CultoSemDadosCard({ culto, navigate }) {
  const corBorda = culto.gap_status === 'nenhuma_registrada' ? '#EF4444'
                 : culto.gap_status === 'parcial'             ? '#F59E0B'
                 :                                              '#10B981';
  const labelGap = culto.gap_status === 'nenhuma_registrada' ? 'Nenhuma registrada'
                 : culto.gap_status === 'parcial'             ? `${culto.sem_dados} sem dados`
                 :                                              'Completo';

  const dataFmt = culto.data_culto
    ? new Date(culto.data_culto + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—';

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${corBorda}`, borderRadius: 8,
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 90 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{dataFmt}</div>
        <div style={{ fontSize: 9, color: C.t3 }}>{culto.service_type_name || culto.culto_nome}</div>
      </div>
      <div style={{ flex: 1, minWidth: 180, fontSize: 11, color: C.t2 }}>
        <strong>{culto.total_decisoes}</strong> decisões registradas, <strong>{culto.total_registradas}</strong> pessoas cadastradas
        {culto.com_membro_vinculado > 0 && (
          <span style={{ color: C.t3 }}> · {culto.com_membro_vinculado} já com membro vinculado</span>
        )}
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
        background: `${corBorda}1a`, color: corBorda,
      }}>
        {labelGap}
      </span>
      <button
        onClick={() => navigate(`/ministerial/integracao?tab=frequencia&culto=${culto.culto_id}`)}
        style={{ ...btnVoltar, padding: '4px 10px', fontSize: 10 }}
      >
        Abrir culto
      </button>
    </div>
  );
}
