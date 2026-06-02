// ============================================================================
// /monitoramento-okr — "Monitoramento OKR" (planilha do Pr. Juninho)
//
// Ótica enxuta do Pr. Juninho (Pedro Litwinczuk Júnior), DISTINTA do modelo
// dos 25 OKRs / 150 KPIs do /painel: 1 NSM → 9 OKRs (em 4 blocos de Área
// Responsável) → ~25 indicadores táticos. A planilha "CBRio_cabeca_Juninho"
// é reproduzida fielmente aqui (textos, alvos, objetivos, áreas, memória de
// cálculo). Os indicadores que já têm fonte de dado real no sistema se
// alimentam sozinhos (via GET /api/painel/monitoramento-okr); o resto fica
// como acompanhamento manual, mostrando o alvo + a memória de cálculo.
//
// Read-only · não toca a lógica do sistema OKR existente (decisão do Marcos).
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { painel as painelApi } from '../api';
import { Compass, Target, ListChecks, RefreshCw, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatErro } from '../lib/formatErro';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};
const VERDE = '#10B981', AMBAR = '#F59E0B', VERMELHO = '#EF4444', INFO = '#3B82F6', CINZA = '#9CA3AF';

// ── Formata número no padrão pt-BR ──
const fmt = (v, casas = 1) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 });

// ── Avalia um valor vivo contra o alvo (define a cor do indicador) ──
function avaliar(valor, cfg) {
  if (valor == null || !cfg || cfg.alvoNum == null) return { cor: INFO, ok: null };
  if (cfg.cmp === 'gte') {
    const ok = valor >= cfg.alvoNum;
    return { cor: ok ? VERDE : valor >= cfg.alvoNum * 0.7 ? AMBAR : VERMELHO, ok };
  }
  if (cfg.cmp === 'lte') {
    const ok = valor <= cfg.alvoNum;
    return { cor: ok ? VERDE : valor <= cfg.alvoNum * 1.3 ? AMBAR : VERMELHO, ok };
  }
  if (cfg.cmp === 'range') {
    const ok = valor >= cfg.alvoNum && valor <= cfg.alvoMax;
    return { cor: ok ? VERDE : AMBAR, ok };
  }
  return { cor: INFO, ok: null };
}

// ============================================================================
// ESTRUTURA FIEL DA PLANILHA "CBRio_cabeca_Juninho" (aba "KPIs 2026")
//   live      → chave da métrica viva em metricas[live] (backend)
//   alvoNum   → alvo numérico p/ colorir o valor vivo · cmp: gte|lte|range
// ============================================================================
const NSM = {
  unidade: 'UNIDADE',
  direcionador: 'Diretores',
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
        nome: 'Novos Convertidos presentes no Café',
        alvo: '≥70% dos convertidos',
        objetivo: 'Analisar a eficácia do funil de engajamento do novo convertido',
        envolvida: 'Cuidados',
        taticos: [
          { ind: 'Prazo médio para primeiro contato', alvo: '3 dias entre a conversão e o contato do pastor', memoria: 'Planilha de acompanhamento comparando o número de convertidos com o número de atendidos — semanal' },
          { ind: '% convertidos presentes no Café com pastores', alvo: '70%', memoria: 'Planilha comparando o número de convertidos com o número de atendidos — semanal' },
          { ind: '% de pessoas do Café que concluíram o Next', alvo: '50%', memoria: 'Planilha comparando convertidos com participantes no Next — mensal' },
        ],
      },
      {
        nome: 'Engajamento nos Valores',
        alvo: '≥75% de toda igreja (2 ou + valores)',
        objetivo: 'Avaliar engajamento dos membros no crescimento espiritual e no suporte ao crescimento da Igreja',
        envolvida: 'Grupos, Voluntariado e Generosidade',
        taticos: [
          { ind: '% frequência em Grupos', alvo: '60%', memoria: 'Nº de pessoas inscritas em grupos x total de pessoas na igreja — semestral' },
          { ind: '% Voluntários ativos', alvo: '60%', memoria: 'Nº de voluntários x total de pessoas na igreja — semestral' },
          { ind: '% dizimistas regulares', alvo: '60%', memoria: 'Nº de dizimistas / ofertantes x total de pessoas na igreja — semanal' },
        ],
      },
      {
        nome: 'Batismos Realizados',
        alvo: '≥30% dos convertidos em 90 dias',
        objetivo: 'Avaliar consolidação da decisão tomada',
        envolvida: 'Integração',
        live: 'okr_batismos', alvoNum: 30, cmp: 'gte',
        taticos: [
          { ind: 'Nº batismos mensais', alvo: '30% da média dos convertidos dos últimos 90 dias', memoria: 'Nº de batizandos x convertidos nos últimos 90 dias — mensal', live: 'batismos_mes' },
          { ind: 'Tempo médio de decisão até o batismo', alvo: '90 dias', memoria: 'Nº de batizandos x convertidos nos últimos 90 dias — mensal', live: 'tempo_batismo', alvoNum: 90, cmp: 'lte' },
        ],
      },
    ],
  },
  {
    area: 'Ministerial — Geracionais',
    papel: 'Move a NSM',
    nota: 'Faz-se muito importante fazermos um censo para sabermos o universo de membros em idade para participar do Kids, Bridge e AMI.',
    okrs: [],
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
          { ind: 'Nº DS online', alvo: '+20% YoY', memoria: 'Planilha mensal com número de decisões e comparativo ao ano anterior', live: 'ds_online' },
          { ind: '% de decisões com follow up', alvo: '≥50% com follow up realizado', memoria: 'Planilha de acompanhamento das decisões com contato e status, e se a jornada se transformou em presencial' },
          { ind: 'NPS de culto online', alvo: 'Nota ≥ 9', memoria: 'Pesquisa com os frequentadores Online, resultado em planilha — periodicidade trimestral' },
        ],
      },
      {
        nome: 'Experiência Presencial',
        alvo: '+20% YoY',
        objetivo: 'Proporcionar uma experiência presencial fluida, acolhedora e tecnicamente excelente, favorecendo o engajamento e a permanência das pessoas no culto.',
        envolvida: 'Produção / Adoração / Marketing / Online',
        taticos: [
          { ind: 'NPS de culto presencial', alvo: 'Nota ≥ 9', memoria: 'NPS mensal via QR Code ao final do culto, dados em planilha' },
          { ind: '% de assentos ocupados', alvo: '30% a 80% (base 1050)', memoria: 'Ação em conjunto com a Integração', live: 'assentos', alvoNum: 30, alvoMax: 80, cmp: 'range' },
          { ind: 'Índice de atrasos (pontualidade final)', alvo: 'Até 5 minutos', memoria: 'Acompanhamento da pontualidade de encerramento do culto' },
        ],
      },
      {
        nome: 'Engajamento de Conteúdo',
        alvo: '+25% YoY',
        objetivo: 'Estimular a interação e o relacionamento da igreja com os conteúdos institucionais, fortalecendo a comunicação e o senso de pertencimento',
        envolvida: 'Marketing / Online',
        taticos: [
          { ind: 'Retenção média em vídeos', alvo: '≥40%', memoria: 'Planilha com dados analíticos das plataformas — mensal, média MoM' },
          { ind: 'Taxa de compartilhamento', alvo: '≥5%', memoria: 'Planilha com dados analíticos das plataformas — mensal, média MoM' },
          { ind: 'Cliques em séries de mensagens no YouTube', alvo: '≥15%', memoria: 'Planilha com dados analíticos das plataformas — mensal, média MoM' },
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
          { ind: '% de despesas dentro do orçamento', alvo: '80%', memoria: 'Acompanhamento do planejado vs executado no LouvaDeus e no Power BI' },
          { ind: '% fundo reserva', alvo: '100% dos 10%', memoria: 'Acompanhamento por meio de relatórios financeiros' },
          { ind: '% cumprimento de prazos de pagamento internos e externos', alvo: '90%', memoria: 'Consolidação e aprimoramento do sistema de Contas a Pagar' },
        ],
      },
      {
        nome: 'Cultura e Saúde do Staff',
        alvo: '≥ 4,3 no Q12',
        objetivo: 'Melhorar o clima organizacional do staff CBRio com ações baseadas na cultura',
        envolvida: 'RH',
        taticos: [
          { ind: 'Nota Q12', alvo: '100% da nova nota desejada alcançada', memoria: 'Avaliação pela plataforma do Gallup' },
          { ind: 'Engajamento nos treinamentos propostos', alvo: '80%', memoria: 'Criação de planilha de presença' },
          { ind: 'Rotatividade do Staff', alvo: '< 10%', memoria: 'Acompanhamento por meio da planilha de pessoal', live: 'rotatividade', alvoNum: 10, cmp: 'lte' },
        ],
      },
      {
        nome: 'Prontidão de Expansão e estrutura',
        alvo: '80% de cumprimento de cronograma',
        objetivo: 'Assegurar uma maior criticidade em relação às boas práticas de áreas correlatas ao processo de expansão.',
        envolvida: 'Gestão estratégica / Infraestrutura',
        taticos: [
          { ind: '% cronogramas cumpridos no prazo', alvo: '80%', memoria: 'Medição com base no calendário institucional da CBRio' },
          { ind: '% orçamentos respeitados', alvo: '80%', memoria: 'Relatórios com memórias de cálculo atreladas à compra' },
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
          <p style={{ fontSize: 13, color: C.t3, marginTop: 6, maxWidth: 760, lineHeight: 1.5 }}>
            Planejamento estratégico — KPIs 2026. Uma Estrela do Norte, 9 OKRs e os indicadores
            táticos da igreja. Os indicadores com fonte no sistema se atualizam sozinhos; os demais
            são acompanhados pelas planilhas das áreas (memória de cálculo em cada linha).
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
            <div key={c.titulo} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${c.cor}`, borderRadius: 10, padding: '12px 14px' }}>
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
          <strong style={{ color: C.primary }}>{totalAuto}</strong> indicador(es) alimentado(s) automaticamente pelo sistema ·
          os demais via planilhas das áreas
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
  const cor = pct == null ? CINZA : pct >= meta ? VERDE : pct >= meta * 0.7 ? AMBAR : VERMELHO;
  return (
    <section style={{
      background: `linear-gradient(135deg, ${C.primary}14, ${C.card})`,
      border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 22,
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
          <Info size={15} style={{ color: AMBAR, flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{bloco.nota}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
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
    <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
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
      <div style={{ padding: '6px 0' }}>
        {okr.taticos.map((t) => <TaticoRow key={t.ind} tatico={t} metricas={metricas} />)}
      </div>
    </section>
  );
}

// ── Linha de indicador tático ──
function TaticoRow({ tatico, metricas }) {
  const m = tatico.live ? metricas[tatico.live] : null;
  const aval = m ? avaliar(m.valor, tatico) : null;

  return (
    <div style={{ padding: '9px 16px', borderTop: `1px solid ${C.border}40`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>{tatico.ind}</div>
        <div style={{ fontSize: 10.5, color: C.t3, marginTop: 3, lineHeight: 1.45 }}>
          <span style={{ color: C.t2, fontWeight: 600 }}>Alvo: {tatico.alvo}</span>
          {tatico.memoria ? <span> · {tatico.memoria}</span> : null}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 76 }}>
        {m ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, color: aval.cor, lineHeight: 1 }}>
              {fmt(m.valor)}{m.unidade}
            </div>
            <div style={{ fontSize: 9, color: C.t3, marginTop: 2 }} title={m.detalhe}>{m.detalhe ? truncar(m.detalhe, 30) : 'automático'}</div>
          </>
        ) : (
          <span style={{ fontSize: 9.5, color: CINZA, background: 'var(--cbrio-input-bg)', border: `1px solid ${C.border}`, padding: '3px 8px', borderRadius: 99, fontWeight: 600, whiteSpace: 'nowrap' }}>
            manual
          </span>
        )}
      </div>
    </div>
  );
}

const truncar = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);
