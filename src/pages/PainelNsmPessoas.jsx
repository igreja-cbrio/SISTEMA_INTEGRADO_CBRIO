// ============================================================================
// /painel/nsm/pessoas — Camada 4 do drilldown (Sistema OKR/NSM 2026)
//
// Lista de pessoas que tomaram decisao recentemente, com filtro engajou ou nao.
// Vira ferramenta de acao pastoral: clicar na NSM, ver quem faltou engajar.
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { painel as painelApi } from '../api';
import { ArrowLeft, Phone, Mail, Calendar, AlertTriangle, CheckCircle2, Clock, Users } from 'lucide-react';

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
  cba:     'CBA (Rede)',
};

export default function PainelNsmPessoas() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const segmento = params.get('segmento') || 'central';
  const engajados = params.get('engajados') === 'true';
  const dias = Number(params.get('dias')) || 90;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    painelApi.nsmPessoas({ segmento, engajados: String(engajados), dias })
      .then(setData)
      .catch(e => setErro(e?.message || 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [segmento, engajados, dias]);

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
          Drilldown da NSM · ultimas {dias} dias · {engajados ? 'que engajaram em ≥1 valor em 60d' : 'que NAO engajaram em 60d (acao pastoral)'}
        </p>
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16,
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
      }}>
        <Filtro label="Segmento" valor={segmento} options={['central', 'cbrio', 'online', 'cba']}
          onChange={v => setFilter('segmento', v)}
          formato={(v) => SEGMENTO_LABEL[v] || v}
        />
        <Filtro label="Filtro" valor={String(engajados)} options={['false', 'true']}
          onChange={v => setFilter('engajados', v)}
          formato={(v) => v === 'true' ? 'Engajados' : 'Nao engajados (foco)'}
        />
        <Filtro label="Janela" valor={String(dias)} options={['30', '60', '90', '180']}
          onChange={v => setFilter('dias', v)}
          formato={(v) => `${v} dias`}
        />
      </div>

      {/* Stats */}
      {data && (
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

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>
      ) : erro ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>{erro}</div>
      ) : !data?.pessoas?.length ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13, background: C.card, borderRadius: 10, border: `1px dashed ${C.border}` }}>
          {engajados
            ? 'Ninguem engajou ainda neste segmento.'
            : 'Todo mundo do segmento engajou — ou nao ha decisoes recentes.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.pessoas.map(p => (
            <PessoaCard key={p.id} pessoa={p} engajados={engajados} />
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
