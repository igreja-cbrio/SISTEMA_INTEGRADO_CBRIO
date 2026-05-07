// ============================================================================
// CarrosselMandalas — 6 mandalas em carrossel horizontal
//
// Slide 0: visao geral (5 valores agregados)
// Slides 1-5: foco em cada valor (6 areas dentro daquele valor)
//
// Navegacao:
//   - Setas laterais (desktop)
//   - Bolinhas embaixo (clique direto)
//   - Swipe (mobile/touch)
//   - Setas do teclado (esquerda/direita)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { painel as painelApi } from '../../api';
import { toast } from 'sonner';
import MandalaSlide from './MandalaSlide';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

const VALORES_ORDEM = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];

export default function CarrosselMandalas() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [indice, setIndice] = useState(0);
  const containerRef = useRef(null);
  const touchStartRef = useRef(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await painelApi.mandalas();
      setData(r);
    } catch (e) {
      setErro(e?.message || 'Erro ao carregar mandalas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Navegacao por teclado
  useEffect(() => {
    const onKey = (e) => {
      if (!containerRef.current) return;
      if (e.key === 'ArrowLeft')  setIndice(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndice(i => Math.min(5, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Slides: [geral, seguir, conectar, investir, servir, generosidade]
  const slides = data ? [
    { tipo: 'geral', titulo: 'Visao Geral', sub: '5 valores da CBRio · agregado da igreja' },
    ...VALORES_ORDEM.map(v => ({
      tipo: 'por_valor',
      key: v,
      titulo: data.por_valor[v]?.label || v,
      sub: '6 areas · % de KPIs em dia neste valor',
      cor: data.por_valor[v]?.cor,
    })),
  ] : [];

  const slideAtual = slides[indice];

  // Touch / swipe
  const onTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStartRef.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0) setIndice(i => Math.min(slides.length - 1, i + 1));
      else        setIndice(i => Math.max(0, i - 1));
    }
    touchStartRef.current = null;
  };

  return (
    <section
      ref={containerRef}
      style={{
        background: C.card,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        padding: '20px 24px',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', gap: 16, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{
            fontSize: 16, fontWeight: 700, color: C.text, margin: 0,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {loading ? 'Carregando mandalas...' : (slideAtual?.titulo || 'Mandalas')}
            {slideAtual?.cor && (
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: slideAtual.cor, display: 'inline-block',
              }} />
            )}
          </h2>
          <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
            {slideAtual?.sub || ''}
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          title="Recarregar"
          style={{
            padding: '6px 10px', borderRadius: 6, fontSize: 11,
            background: 'transparent', color: C.t3, border: `1px solid ${C.border}`,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Conteudo */}
      <div style={{ position: 'relative', minHeight: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {erro ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
            {erro}
            <div style={{ marginTop: 12 }}>
              <button onClick={carregar} style={{
                fontSize: 11, padding: '6px 12px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, cursor: 'pointer',
              }}>
                Tentar novamente
              </button>
            </div>
          </div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>
            Carregando mandalas...
          </div>
        ) : data && slideAtual ? (
          <>
            {/* Seta esquerda */}
            <button
              onClick={() => setIndice(i => Math.max(0, i - 1))}
              disabled={indice === 0}
              aria-label="Mandala anterior"
              style={{
                position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                width: 32, height: 32, borderRadius: '50%',
                background: C.card, border: `1px solid ${C.border}`,
                color: indice === 0 ? C.t3 : C.t2,
                cursor: indice === 0 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                opacity: indice === 0 ? 0.4 : 1,
                zIndex: 2,
              }}
            >
              <ChevronLeft size={18} />
            </button>

            {/* Mandala */}
            <div style={{ width: '100%', maxWidth: 480, padding: '0 40px' }}>
              {slideAtual.tipo === 'geral'
                ? <MandalaSlide modo="geral" data={data.geral} />
                : <MandalaSlide modo="por_valor" data={data.por_valor[slideAtual.key]} />
              }
            </div>

            {/* Seta direita */}
            <button
              onClick={() => setIndice(i => Math.min(slides.length - 1, i + 1))}
              disabled={indice === slides.length - 1}
              aria-label="Proxima mandala"
              style={{
                position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                width: 32, height: 32, borderRadius: '50%',
                background: C.card, border: `1px solid ${C.border}`,
                color: indice === slides.length - 1 ? C.t3 : C.t2,
                cursor: indice === slides.length - 1 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                opacity: indice === slides.length - 1 ? 0.4 : 1,
                zIndex: 2,
              }}
            >
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
      </div>

      {/* Indicadores (bolinhas) */}
      {!loading && !erro && slides.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
          marginTop: 16, flexWrap: 'wrap',
        }}>
          {slides.map((s, i) => {
            const ativo = i === indice;
            const cor = s.cor || C.primary;
            return (
              <button
                key={i}
                onClick={() => setIndice(i)}
                aria-label={`Ir para ${s.titulo}`}
                title={s.titulo}
                style={{
                  width: ativo ? 24 : 8, height: 8, borderRadius: 99,
                  background: ativo ? cor : C.border,
                  border: 'none',
                  cursor: 'pointer', padding: 0,
                  transition: 'width 0.25s, background 0.25s',
                }}
              />
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
}
