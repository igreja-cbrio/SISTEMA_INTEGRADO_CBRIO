// ============================================================================
// /monitoramento-okr — "Monitoramento OKR" (planilha do Pr. Juninho)
//
// Ótica enxuta do Pr. Juninho (Pedro Litwinczuk Júnior), DISTINTA do modelo
// dos 25 OKRs / 150 KPIs do /painel: 1 NSM → 9 OKRs (em 4 blocos de Área
// Responsável) → ~25 indicadores táticos. A planilha "CBRio_cabeca_Juninho"
// é reproduzida fielmente aqui (textos, alvos, objetivos, áreas, memória de
// cálculo). Cada indicador mostra o número direto (verde no alvo / vermelho
// fora) e expande pra visão mensal quando há fonte de dado; os que ainda não
// têm fonte mostram, ao expandir, o que falta pra puxar automático.
//
// Read-only · não toca a lógica do sistema OKR existente (decisão do Marcos).
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { painel as painelApi } from '../api';
import { Compass, Target, ListChecks, RefreshCw, Info, ChevronDown, FileDown, Presentation } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ChartGradients, gradFill } from '@/components/charts/ChartGradients';
import { toast } from 'sonner';
import { formatErro } from '../lib/formatErro';
import { exportarMonitoramentoPdf, exportarMonitoramentoSlides } from '../lib/exportMonitoramentoOkr';
// Estrutura da planilha (NSM/BLOCOS) + avaliação vivem num módulo compartilhado
// com a reunião de OKR da Governança (/governanca/okr) — as duas telas leem a
// MESMA fonte e nunca derivam.
import { NSM, BLOCOS, avaliar, valorTopoOkr, fmt, mesLabel, VERDE, VERMELHO, CINZA } from '../lib/monitoramentoOkrEstrutura';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};
const INFO = '#3B82F6';

const CAMADAS = [
  { Icon: Compass, titulo: 'NSM · Métrica Estrela do Norte', cadencia: 'Avaliado mensalmente', nota: 'Direção espiritual e estratégica', cor: C.primary },
  { Icon: Target, titulo: 'OKR · Indicadores-chave', cadencia: 'Avaliado mensalmente', nota: 'Eficiência do funil da missão · Líderes Ministeriais', cor: INFO },
  { Icon: ListChecks, titulo: 'Metas · Indicadores táticos', cadencia: 'Apurado semanalmente', nota: 'Entregas semanais e operacionais', cor: '#8B5CF6' },
];

// ============================================================================
export default function MonitoramentoOkr() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(null); // 'pdf' | 'slides' | null
  const rootRef = useRef(null);
  const blocoRefs = useRef([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await painelApi.monitoramentoOkr();
      setData(r);
    } catch (e) {
      toast.error(formatErro(e, 'Monitoramento OKR'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const metricas = data?.metricas || {};
  const totalAuto = Object.keys(metricas).length + (data?.nsm ? 1 : 0);

  const handlePdf = useCallback(async () => {
    if (!rootRef.current) return;
    setExportando('pdf');
    try {
      await exportarMonitoramentoPdf(rootRef.current);
      toast.success('PDF gerado');
    } catch (e) {
      toast.error(formatErro(e, 'Exportar PDF'));
    } finally {
      setExportando(null);
    }
  }, []);

  const handleSlides = useCallback(async () => {
    setExportando('slides');
    try {
      const blocos = blocoRefs.current.filter(Boolean);
      await exportarMonitoramentoSlides(blocos, ['Ministerial', 'Criativo', 'Gestão']);
      toast.success('Slides gerados');
    } catch (e) {
      toast.error(formatErro(e, 'Exportar slides'));
    } finally {
      setExportando(null);
    }
  }, []);

  return (
    <div ref={rootRef} style={{ padding: '24px 32px', maxWidth: 1240, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Compass size={22} style={{ color: C.primary }} />
            Monitoramento OKR
          </h1>
          <p style={{ fontSize: 13, color: C.t3, marginTop: 6, maxWidth: 780, lineHeight: 1.5 }}>
            Planejamento estratégico — KPIs 2026. Uma Estrela do Norte, 9 OKRs e os indicadores
            táticos da igreja. Cada indicador mostra o número (verde no alvo, vermelho fora) e
            <strong> abre</strong> pra ver a evolução por mês. Os que ainda não têm número se ligam
            assim que a fonte de dado existir.
          </p>
        </div>
        <div data-export-ignore="1" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handlePdf}
            disabled={loading || !!exportando}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: C.primary, border: `1px solid ${C.primary}`, borderRadius: 8,
              color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (loading || exportando) ? 0.6 : 1,
            }}
          >
            <FileDown size={13} style={{ animation: exportando === 'pdf' ? 'spin 1s linear infinite' : 'none' }} />
            {exportando === 'pdf' ? 'Gerando…' : 'Exportar PDF'}
          </button>
          <button
            onClick={handleSlides}
            disabled={loading || !!exportando}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: C.card, border: `1px solid ${C.primary}`, borderRadius: 8,
              color: C.primaryDark, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (loading || exportando) ? 0.6 : 1,
            }}
          >
            <Presentation size={13} style={{ animation: exportando === 'slides' ? 'spin 1s linear infinite' : 'none' }} />
            {exportando === 'slides' ? 'Gerando…' : 'Exportar slides'}
          </button>
          <button
            onClick={carregar}
            disabled={loading || !!exportando}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.t2, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (loading || exportando) ? 0.5 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Atualizar
          </button>
        </div>
      </header>

      {/* Legenda das 3 camadas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 20 }}>
        {CAMADAS.map((c) => {
          const Icon = c.Icon;
          return (
            <div key={c.titulo} style={{ background: C.card, border: '1px solid var(--hairline)', borderLeft: `4px solid ${c.cor}`, borderRadius: 16, padding: '12px 14px', boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon size={15} style={{ color: c.cor }} />
                <strong style={{ fontSize: 12.5, color: C.text }}>{c.titulo}</strong>
              </div>
              <div style={{ fontSize: 11, color: C.t2, marginTop: 5 }}>{c.cadencia}</div>
              <div style={{ fontSize: 10.5, color: C.t3, marginTop: 2 }}>{c.nota}</div>
            </div>
          );
        })}
      </div>

      {/* NSM hero */}
      <NsmHero nsm={data?.nsm} loading={loading} />

      {/* Blocos por Área Responsável */}
      {BLOCOS.map((bloco, i) => (
        <BlocoArea
          key={bloco.area}
          bloco={bloco}
          metricas={metricas}
          registrar={(el) => { blocoRefs.current[i] = el; }}
        />
      ))}

      <footer style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.t3, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>
          <strong style={{ color: C.primary }}>{totalAuto}</strong> indicador(es) já com número automático ·
          abra os demais pra ver o que falta pra puxar
        </span>
        {data?.geradoEm && <span>Atualizado em {new Date(data.geradoEm).toLocaleString('pt-BR')}</span>}
      </footer>

      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── NSM hero ──
function NsmHero({ nsm, loading }) {
  const pct = nsm?.percentual;
  const meta = nsm?.meta ?? 50;
  const cor = pct == null ? CINZA : pct >= meta ? VERDE : VERMELHO;
  return (
    <section style={{
      background: `linear-gradient(135deg, ${C.primary}14, ${C.card})`,
      border: '1px solid var(--hairline)', borderRadius: 16, padding: 20, marginBottom: 22, boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: C.primaryDark, background: C.primaryBg, padding: '3px 8px', borderRadius: 99 }}>
          Métrica Estrela do Norte
        </span>
        <span style={{ fontSize: 10.5, color: C.t3 }}>Unidade · Diretores · avaliação mensal</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.4 }}>{NSM.texto}</div>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 8, lineHeight: 1.5 }}>{NSM.objetivo}</div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 150 }}>
          <div style={{ fontSize: 44, fontWeight: 800, color: cor, lineHeight: 1 }}>
            {loading ? '…' : pct == null ? '—' : `${fmt(pct)}%`}
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
            alvo <strong style={{ color: C.t2 }}>{NSM.alvo}</strong>
          </div>
          {nsm && (
            <div style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>
              {nsm.engajados} de {nsm.totalConvertidos} convertidos engajados em ≤60d
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Bloco de Área Responsável ──
function BlocoArea({ bloco, metricas, registrar }) {
  return (
    <div ref={registrar} style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: 0 }}>{bloco.area}</h2>
        <span style={{ fontSize: 10.5, color: C.primaryDark, background: C.primaryBg, padding: '2px 9px', borderRadius: 99, fontWeight: 700 }}>
          {bloco.papel}
        </span>
        <span style={{ fontSize: 10.5, color: C.t3 }}>Área responsável</span>
      </div>

      {bloco.nota && (
        <div style={{ display: 'flex', gap: 10, background: '#F59E0B12', border: `1px solid #F59E0B40`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <Info size={15} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{bloco.nota}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
        {bloco.okrs.map((okr) => <OkrCard key={okr.nome} okr={okr} metricas={metricas} />)}
      </div>
    </div>
  );
}

// ── Card de OKR + seus táticos ──
function OkrCard({ okr, metricas }) {
  const topo = valorTopoOkr(okr, metricas);

  return (
    <section style={{ background: C.card, border: '1px solid var(--hairline)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      {/* Cabeçalho do OKR */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.3 }}>{okr.nome}</h3>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
              Alvo: <strong style={{ color: C.t2 }}>{okr.alvo}</strong>
            </div>
          </div>
          {topo && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: topo.cor, lineHeight: 1 }}>
                {fmt(topo.valor, topo.casas)}{topo.unidade}
              </div>
              <div style={{ fontSize: 9, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 }}>{topo.label}</div>
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.t2, marginTop: 8, lineHeight: 1.45 }}>{okr.objetivo}</div>
        {okr.envolvida && (
          <div style={{ fontSize: 10.5, color: C.t3, marginTop: 8 }}>
            Área envolvida: <span style={{ color: C.t2, fontWeight: 600 }}>{okr.envolvida}</span>
          </div>
        )}
      </div>

      {/* Táticos */}
      <div>
        {okr.taticos.map((t) => <TaticoRow key={t.ind} tatico={t} metricas={metricas} />)}
      </div>
    </section>
  );
}

// ── Linha de indicador tático · clicável, expande pra visão mensal ──
function TaticoRow({ tatico, metricas }) {
  const [aberto, setAberto] = useState(false);
  // `live` = valor real vindo do backend (só nos táticos autorizados).
  // `fixo` = valor estático definido aqui no frontend (números do Pr. Juninho ·
  // este módulo é uma vitrine-fim, NÃO sai dado daqui pro resto do sistema).
  const m = tatico.live ? metricas[tatico.live] : (tatico.fixo || null);
  const aval = m ? avaliar(m.valor, tatico) : null;
  const corNum = !m ? CINZA : (aval.ok == null ? C.primary : aval.cor);
  const temSerie = m && Array.isArray(m.serie) && m.serie.length > 0;

  return (
    <div style={{ borderTop: `1px solid ${C.border}66` }}>
      <button
        onClick={() => setAberto((o) => !o)}
        style={{
          width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
          background: aberto ? 'var(--cbrio-input-bg)' : 'transparent',
          padding: '9px 16px', display: 'flex', gap: 10, alignItems: 'center',
        }}
      >
        <ChevronDown size={14} style={{ color: C.t3, flexShrink: 0, transform: aberto ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>{tatico.ind}</div>
          <div style={{ fontSize: 10.5, color: C.t3, marginTop: 2 }}>
            Alvo: <span style={{ color: C.t2, fontWeight: 600 }}>{tatico.alvo}</span>
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 60 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: corNum, lineHeight: 1 }}>
            {m ? `${fmt(m.valor, tatico.casas)}${m.unidade}` : '—'}
          </div>
        </div>
      </button>

      {aberto && (
        <div style={{ padding: '2px 16px 14px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {temSerie && (
            <div>
              <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>Por mês</div>
              <MiniBars serie={m.serie} unidade={m.unidade} alvoNum={tatico.alvoNum} cor={corNum} />
            </div>
          )}
          {m && m.detalhe && (
            <div style={{ fontSize: 11, color: C.t2 }}>{m.detalhe}</div>
          )}
          {/* Número da planilha × número do sistema. Aparece só quando o item
              tem `comparaLive` — a planilha e o sistema usam bases diferentes
              (3.000 × membros ativos) e a diretoria precisa ver os dois antes de
              decidir qual régua vale. O número exibido no topo continua sendo o
              da planilha; aqui não se troca nada, só se mostra. */}
          {tatico.comparaLive && metricas?.[tatico.comparaLive] && (
            <div style={{ display: 'flex', gap: 8, background: C.bgAlt || 'transparent', border: `1px dashed ${C.border}`, borderRadius: 8, padding: '9px 11px' }}>
              <Info size={14} style={{ color: C.t3, flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
                <strong style={{ color: C.text }}>O sistema calcula hoje: </strong>
                {fmt(metricas[tatico.comparaLive].valor, tatico.casas ?? 1)}{metricas[tatico.comparaLive].unidade || ''}
                {metricas[tatico.comparaLive].detalhe ? ` · ${metricas[tatico.comparaLive].detalhe}` : ''}
                {' — o número acima é o da planilha, com base própria.'}
              </span>
            </div>
          )}
          {!m && tatico.precisa && (
            <div style={{ display: 'flex', gap: 8, background: C.primaryBg, border: `1px solid ${C.primary}40`, borderRadius: 8, padding: '9px 11px' }}>
              <Info size={14} style={{ color: C.primaryDark, flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
                <strong style={{ color: C.primaryDark }}>Para puxar automático, preciso de:</strong> {tatico.precisa}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mini gráfico de barras mensal (recharts) ──
function MiniBars({ serie, unidade, alvoNum, cor }) {
  const dados = serie.map((s) => ({ mes: mesLabel(s.mes), valor: s.valor }));
  return (
    <div style={{ height: 150 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 10, right: 8, bottom: 0, left: -18 }}>
          <ChartGradients colors={[cor]} />
          <XAxis dataKey="mes" tick={{ fontSize: 10, fill: C.t3 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: C.t3 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--cbrio-input-bg)' }}
            contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: C.t2 }}
            formatter={(v) => [`${fmt(v)}${unidade || ''}`, 'valor']}
          />
          {alvoNum != null && <ReferenceLine y={alvoNum} stroke={C.t3} strokeDasharray="4 3" />}
          <Bar dataKey="valor" fill={gradFill(cor)} radius={[3, 3, 0, 0]} maxBarSize={46} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
