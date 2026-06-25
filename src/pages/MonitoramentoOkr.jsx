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

import { useState, useEffect, useCallback } from 'react';
import { painel as painelApi } from '../api';
import { Compass, Target, ListChecks, RefreshCw, Info, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ChartGradients, gradFill } from '@/components/charts/ChartGradients';
import { toast } from 'sonner';
import { formatErro } from '../lib/formatErro';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};
const VERDE = '#10B981', VERMELHO = '#EF4444', INFO = '#3B82F6', CINZA = '#9CA3AF';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ── Formata número no padrão pt-BR ──
const fmt = (v, casas = 1) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 });

// ── 'YYYY-MM' → 'mai' ──
const mesLabel = (ym) => {
  const m = parseInt(String(ym).slice(5, 7), 10);
  return MESES[m - 1] || ym;
};

// ── Avalia o valor vivo contra o alvo · verde no alvo, vermelho fora.
//    Sem alvo numérico comparável → neutro (sem julgar). ──
function avaliar(valor, cfg) {
  if (valor == null || !cfg || cfg.alvoNum == null) return { cor: C.primary, ok: null };
  let ok;
  if (cfg.cmp === 'gte') ok = valor >= cfg.alvoNum;
  else if (cfg.cmp === 'lte') ok = valor <= cfg.alvoNum;
  else if (cfg.cmp === 'range') ok = valor >= cfg.alvoNum && valor <= cfg.alvoMax;
  else return { cor: C.primary, ok: null };
  return { cor: ok ? VERDE : VERMELHO, ok };
}

// ============================================================================
// ESTRUTURA FIEL DA PLANILHA "CBRio_cabeca_Juninho" (aba "KPIs 2026")
//   live      → chave da métrica viva em metricas[live] (backend)
//   alvoNum   → alvo numérico p/ colorir · cmp: gte | lte | range (+alvoMax)
//   precisa   → o que falta pra puxar automático (mostra ao expandir)
// ============================================================================
const NSM = {
  texto: 'Novos convertidos engajados em pelo menos um dos valores da CBRio em até 60 dias da decisão',
  alvo: '≥ 50%',
  objetivo: 'Apurar se a missão está sendo realizada de maneira eficaz, não só alcançando, mas engajando em uma jornada de crescimento espiritual',
};

const BLOCOS = [
  {
    area: 'Ministerial',
    papel: 'Move a NSM',
    okrs: [
      {
        nome: 'Novos Convertidos presentes no Acompanhamento "1º Encontro"',
        alvo: '≥70% dos convertidos',
        objetivo: 'Analisar a eficácia do funil de engajamento do novo convertido',
        envolvida: 'Cuidados',
        taticos: [
          // Valores estáticos (Pr. Juninho) · módulo-fim, não saem pro sistema.
          { ind: 'Prazo médio para primeiro contato', alvo: '3 dias entre a conversão e o contato do pastor', fixo: { valor: 24, unidade: 'h' }, alvoNum: 72, cmp: 'lte' },
          { ind: '% de novos convertidos com primeiro contato feito', alvo: '70%', fixo: { valor: 100, unidade: '%' }, alvoNum: 70, cmp: 'gte' },
          { ind: '% Pessoas com 1° contato que fizeram o Next', alvo: '50%', fixo: { valor: 17, unidade: '%', detalhe: 'Média anual até agora.' }, alvoNum: 50, cmp: 'gte' },
        ],
      },
      {
        nome: 'Engajamento nos Valores',
        alvo: '≥75% de toda igreja (2 ou + valores)',
        objetivo: 'Avaliar engajamento dos membros no crescimento espiritual e no suporte ao crescimento da Igreja',
        envolvida: 'Grupos, Voluntariado e Generosidade',
        taticos: [
          // Valores estáticos (Pr. Juninho) · contagem real de cada área ÷ base definida pelo Juninho (módulo-fim, não sai dado daqui).
          { ind: '% frequência em Grupos', alvo: '60%', fixo: { valor: 50.9, unidade: '%', detalhe: '729 em grupos ativos · base 1.431.' }, alvoNum: 60, cmp: 'gte', casas: 1 },
          { ind: '% Voluntários ativos', alvo: '60%', fixo: { valor: 29.8, unidade: '%', detalhe: '893 voluntários cadastrados · base 3.000 membros.' }, alvoNum: 60, cmp: 'gte', casas: 1 },
          { ind: '% dizimistas regulares', alvo: '60%', fixo: { valor: 28.5, unidade: '%', detalhe: '856 dizimistas · base 3.000 membros.' }, alvoNum: 60, cmp: 'gte', casas: 1 },
        ],
      },
      {
        nome: 'Batismos Realizados',
        alvo: '≥30% dos convertidos em 90 dias',
        objetivo: 'Avaliar consolidação da decisão tomada',
        envolvida: 'Integração',
        live: 'okr_batismos', alvoNum: 30, cmp: 'gte',
        taticos: [
          // Trimestral (90d) · % de convertidos que foram batizados (coorte cruzada). Vermelho < 30%, verde ≥ 30%.
          { ind: '% de convertidos batizados (90 dias)', alvo: '≥30% dos convertidos', live: 'bat_cohort', alvoNum: 30, cmp: 'gte', casas: 1 },
          { ind: 'Tempo médio de decisão até o batismo', alvo: '90 dias', memoria: 'Nº de batizandos x convertidos nos últimos 90 dias — mensal', live: 'tempo_batismo', alvoNum: 90, cmp: 'lte' },
        ],
      },
    ],
  },
  {
    area: 'Criativo',
    papel: 'Amplifica a NSM',
    okrs: [
      {
        nome: 'Alcance Culto Online',
        alvo: '+20% YoY',
        objetivo: 'Ampliar o alcance da mensagem da igreja por meio do culto online, alcançando novas pessoas e fortalecendo a conexão com a comunidade digital.',
        envolvida: 'Online / Produção / Marketing',
        taticos: [
          // Valores estáticos (Pr. Juninho) · módulo-fim, não saem pro sistema.
          { ind: 'Nº DS online', alvo: '+20% YoY', live: 'ds_online' },
          { ind: '% de decisões com follow up', alvo: '≥50% com follow up realizado', fixo: { valor: 17.5, unidade: '%', detalhe: '≈317 de 1.821 decisões online com follow-up · média anual.' }, alvoNum: 50, cmp: 'gte', casas: 1 },
          { ind: 'NPS de culto online', alvo: 'Nota ≥ 9', memoria: 'Pesquisa com os frequentadores Online, resultado em planilha — trimestral', precisa: 'as notas da pesquisa de NPS online — posso ligar no módulo NPS ou você lança em /dados-brutos (tipo nps_culto)' },
        ],
      },
      {
        nome: 'Experiência Presencial',
        alvo: '+20% YoY',
        objetivo: 'Proporcionar uma experiência presencial fluida, acolhedora e tecnicamente excelente, favorecendo o engajamento e a permanência das pessoas no culto.',
        envolvida: 'Produção / Adoração / Marketing / Online',
        taticos: [
          { ind: 'NPS de culto presencial', alvo: 'Nota ≥ 9', memoria: 'NPS mensal via QR Code ao final do culto, dados em planilha', precisa: 'as notas do NPS via QR no fim do culto (mesma fonte nps_culto por área)' },
          { ind: '% de assentos ocupados', alvo: '30% a 80% (base 1050)', memoria: 'Ação em conjunto com a Integração', live: 'assentos', alvoNum: 30, alvoMax: 80, cmp: 'range' },
          // Fonte viva = aba Produção de Culto (culto_producao.duracao_minutos vs
          // meta de 60 min). Os cultos passados (jan–jun/2026) entraram com o tempo
          // TOTAL medido pela Produção; daqui pra frente a contagem é por momento.
          { ind: 'Índice de atrasos (pontualidade final)', alvo: 'Até 5 minutos', memoria: 'Tempo de encerramento do culto vs. roteiro de 60 min · fonte: Produção de Culto', live: 'atraso_culto', alvoNum: 5, cmp: 'lte', casas: 1 },
        ],
      },
      {
        nome: 'Engajamento de Conteúdo',
        alvo: '+25% YoY',
        objetivo: 'Estimular a interação e o relacionamento da igreja com os conteúdos institucionais, fortalecendo a comunicação e o senso de pertencimento',
        envolvida: 'Marketing / Online',
        taticos: [
          { ind: 'Retenção média em vídeos', alvo: '≥40%', live: 'eng_retencao', alvoNum: 40, cmp: 'gte' },
          { ind: 'Taxa de compartilhamento', alvo: '≥5%', live: 'eng_compartilhamento', alvoNum: 5, cmp: 'gte' },
          // Taxa de engajamento real do YouTube (curtidas + comentários ÷ views). Alvo provisório · ajustar.
          { ind: 'Taxa de engajamento no YouTube', alvo: '≥4%', live: 'eng_interacao', alvoNum: 4, cmp: 'gte', casas: 1 },
        ],
      },
    ],
  },
  {
    area: 'Operações',
    papel: 'Sustenta a NSM',
    okrs: [
      {
        nome: 'Eficiência financeira',
        alvo: '80% de assertividade planejado x realizado',
        objetivo: 'Consolidar o processo de planejamento financeiro, visando ter uma maior previsibilidade de gastos',
        envolvida: 'Gestão estratégica / Financeiro',
        taticos: [
          { ind: '% de despesas dentro do orçamento', alvo: '80%', memoria: 'Acompanhamento do planejado vs executado no LouvaDeus e no Power BI', precisa: 'o planejado vs realizado (exportação do LouvaDeus / Power BI ou integração)' },
          { ind: '% fundo reserva', alvo: '100% dos 10%', memoria: 'Acompanhamento por meio de relatórios financeiros', precisa: 'o saldo do fundo de reserva vs a meta de 10% (relatório financeiro mensal)' },
          { ind: '% cumprimento de prazos de pagamento internos e externos', alvo: '90%', memoria: 'Consolidação e aprimoramento do sistema de Contas a Pagar', precisa: 'as datas de vencimento vs pagamento (módulo Contas a Pagar do Financeiro)' },
        ],
      },
      {
        nome: 'Cultura e Saúde do Staff',
        alvo: '≥ 4,3 no Q12',
        objetivo: 'Melhorar o clima organizacional do staff CBRio com ações baseadas na cultura',
        envolvida: 'RH',
        taticos: [
          { ind: 'Nota Q12', alvo: '≥ 4,3 no Q12', memoria: 'Avaliação pela plataforma do Gallup', live: 'q12', alvoNum: 4.3, cmp: 'gte', casas: 2 },
          { ind: 'Engajamento nos treinamentos propostos', alvo: '80%', memoria: 'Criação de planilha de presença', precisa: 'a presença nos treinamentos (o RH já tem rh_treinamentos — confirmo se está sendo preenchido e puxo)' },
          { ind: 'Rotatividade do Staff', alvo: '< 10%', memoria: 'Acompanhamento por meio da planilha de pessoal', live: 'rotatividade', alvoNum: 10, cmp: 'lte' },
        ],
      },
      {
        nome: 'Prontidão de Expansão e estrutura',
        alvo: '80% de cumprimento de cronograma',
        objetivo: 'Assegurar uma maior criticidade em relação às boas práticas de áreas correlatas ao processo de expansão.',
        envolvida: 'Gestão estratégica / Infraestrutura',
        taticos: [
          { ind: '% cronogramas cumpridos no prazo', alvo: '80%', memoria: 'Medição com base no calendário institucional da CBRio', precisa: 'os marcos do cronograma de expansão com data prevista vs realizada (módulo Expansão)' },
          { ind: '% orçamentos respeitados', alvo: '80%', memoria: 'Relatórios com memórias de cálculo atreladas à compra', precisa: 'o orçado vs gasto por obra/projeto de expansão' },
        ],
      },
    ],
  },
];

const CAMADAS = [
  { Icon: Compass, titulo: 'NSM · Métrica Estrela do Norte', cadencia: 'Avaliado mensalmente', nota: 'Direção espiritual e estratégica', cor: C.primary },
  { Icon: Target, titulo: 'OKR · Indicadores-chave', cadencia: 'Avaliado mensalmente', nota: 'Eficiência do funil da missão · Líderes Ministeriais', cor: INFO },
  { Icon: ListChecks, titulo: 'Metas · Indicadores táticos', cadencia: 'Apurado semanalmente', nota: 'Entregas semanais e operacionais', cor: '#8B5CF6' },
];

// ============================================================================
export default function MonitoramentoOkr() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1240, margin: '0 auto' }}>
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
        <button
          onClick={carregar}
          disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.t2, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Atualizar
        </button>
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
      {BLOCOS.map((bloco) => (
        <BlocoArea key={bloco.area} bloco={bloco} metricas={metricas} />
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
function BlocoArea({ bloco, metricas }) {
  return (
    <div style={{ marginBottom: 24 }}>
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
  const m = okr.live ? metricas[okr.live] : null;
  const aval = m ? avaliar(m.valor, okr) : null;

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
          {m && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: aval.cor, lineHeight: 1 }}>
                {fmt(m.valor)}{m.unidade}
              </div>
              <div style={{ fontSize: 9, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 }}>automático</div>
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
