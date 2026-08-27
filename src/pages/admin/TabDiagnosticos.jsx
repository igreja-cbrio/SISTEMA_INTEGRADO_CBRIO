// ============================================================================
// Aba "Diagnósticos" do /assistente-ia — o que os agentes acharam, com o PLANO
// DE AÇÃO de cada achado.
//
// ⚠️ POR QUE ELA EXISTE (27/08/2026): os agentes de incidente diagnosticavam e
// mandavam PUSH desde 17/08, e o diagnóstico não aparecia em tela nenhuma. A
// notificação apontava pra `/assistente-ia?run=<id>`, e esta página (a) ignorava
// o `?run=` e (b) não lia `agent_runs`. O Matheus recebeu o aviso no celular e
// não tinha onde ler o plano de ação. Ver `backend/utils/agentDiagnostico.js`.
//
// ⚠️ 100% SOMENTE LEITURA. Mudar o status do incidente é no /sistema, que é o
// módulo dono da fila — um 2º caminho de escrita é a classe de bug que o
// desenho evita (mesma decisão do inventário de portas do /inscricoes).
// ============================================================================
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { agents } from '../../api';
import { Button } from '../../components/ui/button';

const C = {
  card: 'var(--cbrio-card)', bg: 'var(--cbrio-bg)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const SEV = {
  critico: { c: C.red, bg: C.redBg, label: 'Crítico' },
  aviso: { c: C.amber, bg: C.amberBg, label: 'Aviso' },
  info: { c: C.blue, bg: C.blueBg, label: 'Informativo' },
};

// ⚠️ `encerrado` é cinza, nunca verde: o incidente foi decidido (resolvido OU
// risco aceito), e pintar de verde afirmaria que foi consertado.
const ESTADO = {
  aberto: { c: C.amber, bg: C.amberBg, label: 'Em aberto' },
  encerrado: { c: C.text3, bg: 'transparent', label: 'Encerrado' },
  sem_incidente: { c: C.text3, bg: 'transparent', label: 'Sem incidente aberto' },
};

const fmt = (d) => d
  ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';

function Pill({ cor, fundo, children, titulo }) {
  return (
    <span title={titulo} style={{
      fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
      background: fundo, color: cor, border: fundo === 'transparent' ? `1px solid ${C.border}` : 'none',
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function Lista({ titulo, itens, numerada }) {
  if (!itens?.length) return null;
  const Tag = numerada ? 'ol' : 'ul';
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: C.text3 }}>
        {titulo}
      </div>
      <Tag style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13, color: C.text, lineHeight: 1.55 }}>
        {itens.map((x, i) => <li key={i} style={{ marginTop: i ? 4 : 0 }}>{x}</li>)}
      </Tag>
    </div>
  );
}

function Card({ item, abertoInicial }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const sev = SEV[item.severidade] || SEV.info;
  const est = ESTADO[item.estado] || ESTADO.sem_incidente;

  return (
    <article style={{
      border: `1px solid ${abertoInicial ? C.primary : C.border}`,
      borderRadius: 14, background: C.card, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill cor={sev.c} fundo={sev.bg}>{sev.label}</Pill>
        <Pill cor={est.c} fundo={est.bg}>{est.label}</Pill>
        <span style={{ fontSize: 12, color: C.text2, fontWeight: 600 }}>{item.agente}</span>
        <span style={{ fontSize: 12, color: C.text3 }}>· {fmt(item.quando)}</span>
        {item.decisao_necessaria && (
          <Pill cor={C.primary} fundo={C.primaryBg} titulo="O agente pede uma decisão sua">
            precisa de decisão
          </Pill>
        )}
      </div>

      <h3 style={{ margin: '10px 0 0', fontSize: 14.5, fontWeight: 700, color: C.text, lineHeight: 1.45 }}>
        {item.incidente?.titulo || item.titulo}
      </h3>
      {item.resumo && (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.text2, lineHeight: 1.55 }}>{item.resumo}</p>
      )}

      {item.incidente?.titulo && item.titulo !== item.incidente.titulo && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: C.text, lineHeight: 1.5 }}>
          <strong style={{ color: C.text3, fontWeight: 700 }}>Causa provável · </strong>{item.titulo}
        </p>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: C.text3 }}>
        {item.classificacao && <span>tipo: <strong style={{ color: C.text2 }}>{item.classificacao}</strong></span>}
        {item.confianca && <span>confiança: <strong style={{ color: C.text2 }}>{item.confianca}</strong></span>}
        {item.risco && <span>risco: <strong style={{ color: C.text2 }}>{item.risco}</strong></span>}
        {item.modulo && <span>módulo: <strong style={{ color: C.text2 }}>{item.modulo}</strong></span>}
      </div>

      {/* ⚠️ O plano de ação é o CONTEÚDO da aba, não um detalhe escondido: ele
          aparece sempre, e a ausência dele é DECLARADA em vez de virar vazio. */}
      {item.plano_de_acao.length
        ? <Lista titulo="Plano de ação sugerido" itens={item.plano_de_acao} numerada />
        : (
          <p style={{ marginTop: 12, fontSize: 12.5, color: C.text3, lineHeight: 1.5 }}>
            O agente não registrou plano de ação para este achado.
          </p>
        )}

      {item.decisao_necessaria && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 10,
          border: `1px solid ${C.primary}55`, background: C.primaryBg,
          fontSize: 13, color: C.text, lineHeight: 1.5,
        }}>
          <strong>O agente precisa da sua resposta:</strong>
          <div style={{ marginTop: 4, color: C.text2 }}>{item.pergunta_de_decisao}</div>
        </div>
      )}

      <Button variant="ghost" size="sm" style={{ marginTop: 10, paddingLeft: 0 }} onClick={() => setAberto((v) => !v)}>
        {aberto ? 'Menos detalhes' : 'Evidências e como validar'}
      </Button>

      {aberto && (
        <div style={{ marginTop: 4, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <Lista titulo="Evidências que o agente viu" itens={item.evidencias} />
          <Lista titulo="Como validar antes de mexer" itens={item.passos_de_validacao} numerada />
          {item.incidente && (
            <div style={{ marginTop: 12, fontSize: 12, color: C.text3, lineHeight: 1.7 }}>
              {item.incidente.impacto && <div>Impacto: {item.incidente.impacto}</div>}
              {item.incidente.ambiente && <div>Ambiente: {item.incidente.ambiente}</div>}
              {item.incidente.request_id && <div>Rastreio: <code>{item.incidente.request_id}</code></div>}
              {item.incidente.release && <div>Release: <code>{String(item.incidente.release).slice(0, 12)}</code></div>}
              <div style={{ marginTop: 8 }}>
                {/* Link normal, não SPA: /sistema é a fila dona do incidente. */}
                <a href="/sistema" style={{ color: C.primary, fontWeight: 600, fontSize: 12.5 }}>
                  Abrir a fila de incidentes →
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function TabDiagnosticos() {
  // A notificação de push linka `?run=<id>` — é ela que traz a pessoa aqui.
  const [params] = useSearchParams();
  const runDestacada = params.get('run');
  const [filtro, setFiltro] = useState('abertos');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['agent-diagnosticos'],
    queryFn: () => agents.diagnosticos({ limite: 60 }),
    staleTime: 60_000,
  });

  const itens = data?.itens || [];
  const resumo = data?.resumo || {};

  const visiveis = useMemo(() => {
    const base = filtro === 'abertos' ? itens.filter((i) => i.estado === 'aberto')
      : filtro === 'criticos' ? itens.filter((i) => i.severidade === 'critico')
        : filtro === 'decisao' ? itens.filter((i) => i.decisao_necessaria && i.estado === 'aberto')
          : itens;
    // ⚠️ O item que veio da notificação NUNCA é escondido pelo filtro: a pessoa
    // clicou no push pra ler AQUELE — e sumir com ele é a tela muda de novo.
    if (!runDestacada) return base;
    const dele = itens.filter((i) => i.run_id === runDestacada);
    const resto = base.filter((i) => i.run_id !== runDestacada);
    return [...dele, ...resto];
  }, [itens, filtro, runDestacada]);

  const FILTROS = [
    ['abertos', `Em aberto${resumo.abertos ? ` (${resumo.abertos})` : ''}`],
    ['criticos', 'Críticos'],
    ['decisao', `Precisam de decisão${resumo.aguardando_decisao ? ` (${resumo.aguardando_decisao})` : ''}`],
    ['todos', `Todos${resumo.total ? ` (${resumo.total})` : ''}`],
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>O que os agentes acharam</div>
          <div style={{ fontSize: 12.5, color: C.text2, marginTop: 2, lineHeight: 1.5, maxWidth: 620 }}>
            Cada achado com a causa provável e o plano de ação. Os agentes são <strong>consultivos</strong> —
            nada aqui foi corrigido sozinho. Mudar o status do incidente é em <a href="/sistema" style={{ color: C.primary }}>Sistema</a>.
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Atualizando…' : 'Atualizar'}
        </Button>
      </div>

      {runDestacada && (
        <div style={{
          marginBottom: 14, padding: '10px 12px', borderRadius: 10,
          border: `1px solid ${C.primary}55`, background: C.primaryBg, fontSize: 13, color: C.text,
        }}>
          Mostrando primeiro o achado da notificação que você abriu.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTROS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFiltro(id)} style={{
            padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${filtro === id ? C.primary : C.border}`,
            background: filtro === id ? C.primaryBg : 'transparent',
            color: filtro === id ? C.primary : C.text2,
          }}>{label}</button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.text3, fontSize: 14 }}>Carregando…</div>
      ) : error ? (
        // ⚠️ Erro NUNCA se disfarça de "nada encontrado" — foi um silêncio que
        // criou esta aba.
        <div style={{
          padding: '14px 16px', borderRadius: 12, border: `1px solid ${C.red}55`, background: C.redBg,
          fontSize: 13.5, color: C.text, lineHeight: 1.55,
        }}>
          <strong>Não conseguimos carregar os diagnósticos.</strong>
          <div style={{ marginTop: 4, color: C.text2 }}>{error.message}</div>
          <Button variant="ghost" size="sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !visiveis.length ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.text3, fontSize: 14 }}>
          {itens.length
            ? 'Nenhum achado neste recorte — troque o filtro acima.'
            : 'Nenhum agente registrou achado ainda.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {visiveis.map((item) => (
            <Card key={item.id} item={item} abertoInicial={item.run_id === runDestacada} />
          ))}
        </div>
      )}
    </div>
  );
}
