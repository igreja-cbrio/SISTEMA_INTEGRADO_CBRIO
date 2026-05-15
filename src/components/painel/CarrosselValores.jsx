// ============================================================================
// CarrosselValores · 5 slides (1 por valor) com filtro de dado + culto + periodo
//
// Marcos: "um carrossel de dados com filtro por valor. Um grafico de linhas
//          por exemplo de Seguir a Jesus com filtro de conversoes, batismo e
//          frequencia por todos os cultos · seleciona dado, culto, periodo"
//
// Cada slide tem:
//   · Filtros (dado, culto opcional, periodo)
//   · Grafico de linha (Recharts)
//   · Totais agregados
//
// Navegacao igual CarrosselMandalas: setas + dots + swipe + teclado.
// ============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, BarChart3 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { painel as painelApi } from '../../api';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D',
};

const VALORES_ORDEM = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];

const PERIODOS = [
  { v: '3m',  l: '3 meses',  m: 3 },
  { v: '6m',  l: '6 meses',  m: 6 },
  { v: '12m', l: '12 meses', m: 12 },
  { v: '24m', l: '2 anos',   m: 24 },
  { v: '60m', l: '5 anos',   m: 60 },
];

const MESES_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function calcularRange(periodoKey) {
  const meses = PERIODOS.find(p => p.v === periodoKey)?.m || 12;
  const fim = new Date();
  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - (meses - 1));
  inicio.setDate(1);
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10), meses };
}

function labelPeriodo(p) {
  // "2026-05" → "mai/26" / "2026-05-12" (semana) → "12/mai"
  if (/^\d{4}-\d{2}$/.test(p)) {
    const [y, m] = p.split('-');
    return `${MESES_PT[parseInt(m, 10) - 1]}/${y.slice(2)}`;
  }
  const [, m, d] = p.split('-');
  return `${d}/${MESES_PT[parseInt(m, 10) - 1]}`;
}

function fmtValor(v, dado) {
  if (dado === 'doacoes_valor') {
    return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return Number(v).toLocaleString('pt-BR');
}

export default function CarrosselValores() {
  const [catalogo, setCatalogo] = useState(null);
  const [carregandoCat, setCarregandoCat] = useState(true);
  const [erroCat, setErroCat] = useState(null);
  const [indice, setIndice] = useState(0);
  // Filtros separados por valor (mantem ao voltar pro slide)
  const [filtros, setFiltros] = useState({});
  const containerRef = useRef(null);
  const touchStartRef = useRef(null);

  const carregarCat = useCallback(async () => {
    setCarregandoCat(true);
    setErroCat(null);
    try {
      const r = await painelApi.serieTemporalDados();
      setCatalogo(r);
      // Filtros default: 1o dado de cada valor, periodo 12m, sem culto
      const ini = {};
      (r.valores || []).forEach(v => {
        ini[v.key] = {
          dado: v.dados[0]?.id || null,
          culto: '',
          periodo: '12m',
        };
      });
      setFiltros(ini);
    } catch (e) {
      setErroCat(e?.message || 'Erro ao carregar catálogo');
    } finally {
      setCarregandoCat(false);
    }
  }, []);

  useEffect(() => { carregarCat(); }, [carregarCat]);

  useEffect(() => {
    const onKey = (e) => {
      if (!containerRef.current) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.key === 'ArrowLeft')  setIndice(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndice(i => Math.min(VALORES_ORDEM.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onTouchStart = (e) => { touchStartRef.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartRef.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0) setIndice(i => Math.min(VALORES_ORDEM.length - 1, i + 1));
      else        setIndice(i => Math.max(0, i - 1));
    }
    touchStartRef.current = null;
  };

  const valorAtual = VALORES_ORDEM[indice];
  const meta = catalogo?.valores.find(v => v.key === valorAtual);
  const filtro = filtros[valorAtual] || { dado: null, culto: '', periodo: '12m' };

  const setFiltroAtual = (patch) => {
    setFiltros(s => ({ ...s, [valorAtual]: { ...s[valorAtual], ...patch } }));
  };

  return (
    <section
      ref={containerRef}
      style={{
        background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '20px 24px',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} style={{ color: meta?.cor || C.primary }} />
            {carregandoCat ? 'Carregando...' : (meta?.label || 'Tendências por valor')}
            {meta?.cor && <span style={{ width: 10, height: 10, borderRadius: '50%', background: meta.cor, display: 'inline-block' }} />}
          </h2>
          <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
            Filtre dado, culto e período · use as setas pra alternar entre os 5 valores
          </p>
        </div>
        <button
          onClick={carregarCat}
          disabled={carregandoCat}
          title="Recarregar"
          style={{
            padding: '6px 10px', borderRadius: 6, fontSize: 11,
            background: 'transparent', color: C.t3, border: `1px solid ${C.border}`,
            cursor: carregandoCat ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <RefreshCw size={11} style={{ animation: carregandoCat ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {erroCat ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
          {erroCat}
          <div style={{ marginTop: 12 }}>
            <button onClick={carregarCat} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, cursor: 'pointer' }}>
              Tentar novamente
            </button>
          </div>
        </div>
      ) : carregandoCat || !catalogo || !meta ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>
          Carregando dados...
        </div>
      ) : (
        <div style={{ position: 'relative', minHeight: 380 }}>
          {/* Seta esquerda */}
          <button
            onClick={() => setIndice(i => Math.max(0, i - 1))}
            disabled={indice === 0}
            aria-label="Valor anterior"
            style={{
              position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)',
              width: 32, height: 32, borderRadius: '50%',
              background: C.card, border: `1px solid ${C.border}`,
              color: indice === 0 ? C.t3 : C.t2,
              cursor: indice === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              opacity: indice === 0 ? 0.4 : 1, zIndex: 2,
            }}
          >
            <ChevronLeft size={18} />
          </button>

          {/* Slide */}
          <div style={{ padding: '0 40px' }}>
            <SlideValor
              meta={meta}
              cultos={catalogo.cultos || []}
              filtro={filtro}
              onChange={setFiltroAtual}
            />
          </div>

          {/* Seta direita */}
          <button
            onClick={() => setIndice(i => Math.min(VALORES_ORDEM.length - 1, i + 1))}
            disabled={indice === VALORES_ORDEM.length - 1}
            aria-label="Próximo valor"
            style={{
              position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)',
              width: 32, height: 32, borderRadius: '50%',
              background: C.card, border: `1px solid ${C.border}`,
              color: indice === VALORES_ORDEM.length - 1 ? C.t3 : C.t2,
              cursor: indice === VALORES_ORDEM.length - 1 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              opacity: indice === VALORES_ORDEM.length - 1 ? 0.4 : 1, zIndex: 2,
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Dots */}
      {!carregandoCat && !erroCat && catalogo && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
          {VALORES_ORDEM.map((v, i) => {
            const m = catalogo.valores.find(x => x.key === v);
            const ativo = i === indice;
            const cor = m?.cor || C.primary;
            return (
              <button
                key={v}
                onClick={() => setIndice(i)}
                aria-label={`Ir para ${m?.label || v}`}
                style={{
                  width: ativo ? 22 : 8, height: 8, borderRadius: 99,
                  background: ativo ? cor : C.border, border: 'none',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// SlideValor · um slide com filtros + grafico de linha
// ----------------------------------------------------------------------------
function SlideValor({ meta, cultos, filtro, onChange }) {
  const [serie, setSerie] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  const dadoDef = useMemo(
    () => (meta?.dados || []).find(d => d.id === filtro.dado),
    [meta, filtro.dado]
  );

  const carregar = useCallback(async () => {
    if (!meta || !filtro.dado) return;
    setLoading(true);
    setErro(null);
    try {
      const { inicio, fim } = calcularRange(filtro.periodo);
      const r = await painelApi.serieTemporal({
        valor: meta.key,
        dado: filtro.dado,
        culto: dadoDef?.filtra_culto ? (filtro.culto || null) : null,
        inicio, fim,
      });
      setSerie(r);
    } catch (e) {
      setErro(e?.message || 'Erro ao carregar série');
    } finally {
      setLoading(false);
    }
  }, [meta, filtro.dado, filtro.culto, filtro.periodo, dadoDef]);

  useEffect(() => { carregar(); }, [carregar]);

  const dados = (serie?.serie || []).map(p => ({
    ...p,
    label: labelPeriodo(p.periodo),
  }));

  const total = serie?.total || 0;
  const media = dados.length > 0 ? Math.round(total / dados.length) : 0;
  const ultimo = dados[dados.length - 1]?.valor || 0;
  const anterior = dados[dados.length - 2]?.valor || 0;
  const delta = anterior > 0 ? Math.round(((ultimo - anterior) / anterior) * 100) : null;

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {/* Dado */}
        <div style={{ display: 'inline-flex', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', padding: 2 }}>
          {(meta.dados || []).map(d => {
            const ativo = filtro.dado === d.id;
            return (
              <button
                key={d.id}
                onClick={() => onChange({ dado: d.id })}
                style={{
                  padding: '5px 10px', fontSize: 11, fontWeight: ativo ? 700 : 500,
                  borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: ativo ? meta.cor : 'transparent',
                  color: ativo ? '#fff' : C.t2,
                  transition: 'all 0.15s',
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {/* Culto (so se o dado filtra culto) */}
        {dadoDef?.filtra_culto && cultos.length > 0 && (
          <select
            value={filtro.culto}
            onChange={e => onChange({ culto: e.target.value })}
            style={{
              padding: '5px 8px', fontSize: 11, borderRadius: 6,
              border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)',
              color: C.text, cursor: 'pointer',
            }}
          >
            <option value="">Todos os cultos</option>
            {cultos.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {/* Periodo */}
        <div style={{ display: 'inline-flex', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', padding: 2, marginLeft: 'auto' }}>
          {PERIODOS.map(p => {
            const ativo = filtro.periodo === p.v;
            return (
              <button
                key={p.v}
                onClick={() => onChange({ periodo: p.v })}
                style={{
                  padding: '5px 10px', fontSize: 11, fontWeight: ativo ? 700 : 500,
                  borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: ativo ? C.primary : 'transparent',
                  color: ativo ? '#fff' : C.t2,
                  transition: 'all 0.15s',
                }}
              >
                {p.l}
              </button>
            );
          })}
        </div>
      </div>

      {/* Totais */}
      {!loading && !erro && serie && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <Stat label="Total no período" valor={fmtValor(total, filtro.dado)} cor={meta.cor} />
          <Stat label="Média por período" valor={fmtValor(media, filtro.dado)} />
          <Stat label="Último período" valor={fmtValor(ultimo, filtro.dado)} delta={delta} />
        </div>
      )}

      {/* Grafico */}
      <div style={{ width: '100%', height: 260, position: 'relative' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3, fontSize: 12 }}>
            Carregando série...
          </div>
        ) : erro ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 12 }}>
            {erro}
          </div>
        ) : dados.length === 0 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3, fontSize: 12 }}>
            Sem dados no período.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados} margin={{ top: 6, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--cbrio-text3)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--cbrio-text3)' }} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: meta.cor, strokeOpacity: 0.2 }}
                contentStyle={{ borderRadius: 8, fontSize: 12, border: `1px solid ${C.border}`, background: C.card }}
                formatter={(v) => [fmtValor(v, filtro.dado), dadoDef?.label || 'Valor']}
                labelStyle={{ color: 'var(--cbrio-text2)', fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey="valor"
                stroke={meta.cor}
                strokeWidth={2.5}
                dot={{ r: 3, fill: meta.cor }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Stat({ label, valor, cor, delta }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: cor || C.text }}>{valor}</span>
        {delta !== null && delta !== undefined && (
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : C.t3,
          }}>
            {delta > 0 ? '+' : ''}{delta}%
          </span>
        )}
      </div>
    </div>
  );
}
