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
// ⚠️⚠️ DEIXOU DE SER SOMENTE LEITURA em 31/08/2026 (pedido do Matheus): o botão
// "Resolver todos" despacha os achados ao `developer_agent` (Railway), que
// escreve o código, abre o PR e — só na faixa `auto` — MERGEIA na main.
//
// O que continua valendo:
//  ⚠️ Mudar o STATUS do incidente é no /sistema, que é o módulo dono da fila.
//    Esta aba cria tarefa de correção; não decide se o incidente está resolvido.
//  ⚠️ A régua de até onde o agente vai sozinho é PURA e vive em
//    `backend/utils/diagnosticoAutonomia.js` — a tela só EXIBE `faixa` e
//    `motivo`. Nenhuma decisão de autonomia é recalculada aqui: duas cópias
//    divergiriam, e a divergência apareceria como "a tela disse que ia mergear
//    e o agente parou no PR".
// ============================================================================
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

// ⚠️ As três caixas que o Matheus pediu. `precisa_de_voce` é ÂMBAR, nunca
// vermelho: é pendência de decisão, não erro (mesma leitura do `sem_contato`).
const ANDAMENTO_UI = {
  resolvido: { c: C.green, bg: C.greenBg, label: 'Resolvido' },
  trabalhando: { c: C.blue, bg: C.blueBg, label: 'Sendo resolvido' },
  na_fila: { c: C.blue, bg: C.blueBg, label: 'Na fila do agente' },
  precisa_de_voce: { c: C.amber, bg: C.amberBg, label: 'Precisa da sua ação' },
  nao_iniciado: { c: C.text3, bg: 'transparent', label: 'Não despachado' },
};

const FAIXA_UI = {
  auto: 'O agente corrige, abre o PR e mergeia quando o CI ficar verde.',
  pr: 'O agente corrige e abre o PR — o merge é seu.',
  humano: 'O agente não mexe neste sozinho.',
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

function Card({ item, abertoInicial, onResolverUm, ocupado }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const sev = SEV[item.severidade] || SEV.info;
  const est = ESTADO[item.estado] || ESTADO.sem_incidente;
  const and = ANDAMENTO_UI[item.andamento] || null;
  const faixa = item.autonomia?.faixa;
  // Só oferece o botão individual quando há o que despachar: botão que não faz
  // nada é pior que botão ausente.
  const podeDespachar = !!onResolverUm && !item.tarefa && faixa && faixa !== 'humano';
  const podeTentarDeNovo = !!onResolverUm && item.tarefa?.status === 'falhou';

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
          <Pill cor={C.primary} fundo={C.primaryBg} titulo="O agente deixou uma pergunta — ela não trava o conserto, mas está registrada">
            deixou uma pergunta
          </Pill>
        )}
        {and && (
          <Pill cor={and.c} fundo={and.bg} titulo={item.andamento_motivo}>{and.label}</Pill>
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

      {/* ── correção pelo agente ──────────────────────────────────────── */}
      {(item.andamento || podeDespachar) && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 10,
          border: `1px solid ${and && and.bg !== 'transparent' ? and.c + '55' : C.border}`,
          background: and && and.bg !== 'transparent' ? and.bg : 'transparent',
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, flex: 1, minWidth: 240 }}>
            {/* ⚠️ O motivo vem do SERVIDOR e é exibido literal: é ele que
                responde "por que este não foi resolvido sozinho?". */}
            {item.andamento_motivo}
            {podeDespachar && (
              <div style={{ color: C.text3, marginTop: 3 }}>{FAIXA_UI[faixa]}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {item.tarefa?.pull_request_url && (
              <a href={item.tarefa.pull_request_url} target="_blank" rel="noreferrer"
                 style={{ fontSize: 12.5, fontWeight: 700, color: C.primary }}>
                Ver o PR →
              </a>
            )}
            {podeDespachar && (
              <Button size="sm" variant="ghost" disabled={ocupado}
                      onClick={() => onResolverUm(item, false)}>
                {faixa === 'auto' ? 'Resolver e mergear' : 'Resolver (só PR)'}
              </Button>
            )}
            {podeTentarDeNovo && (
              <Button size="sm" variant="ghost" disabled={ocupado}
                      onClick={() => onResolverUm(item, true)}>
                Tentar de novo
              </Button>
            )}
          </div>
        </div>
      )}

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


function Faixa({ cor, fundo, children }) {
  return (
    <div style={{
      marginBottom: 14, padding: '10px 12px', borderRadius: 10,
      border: `1px solid ${cor}55`, background: fundo, fontSize: 13, color: C.text, lineHeight: 1.55,
    }}>{children}</div>
  );
}

/**
 * Confirmação do "Resolver todos".
 *
 * ⚠️⚠️ As duas contagens ficam SEPARADAS e nomeadas: "vai mergear na main
 * sozinho" e "vai abrir PR pra você" são autorizações diferentes. Somá-las num
 * "6 achados" esconderia exatamente o que está sendo autorizado — e o que se
 * autoriza aqui é deploy em produção.
 */
function ConfirmarResolucao({ previa, onConfirmar, onCancelar, ocupado, erro }) {
  const plano = previa?.plano || {};
  const auto = (previa?.itens || []).filter((i) => i.autonomia?.faixa === 'auto' && !i.tarefa);
  const pr = (previa?.itens || []).filter((i) => i.autonomia?.faixa === 'pr' && !i.tarefa);
  const humano = (previa?.itens || []).filter((i) => i.autonomia?.faixa === 'humano');
  const nada = !plano.merge_automatico && !plano.so_pr;

  const Linha = ({ item }) => (
    <li style={{ marginTop: 4 }}>
      {item.incidente?.titulo || item.titulo}
      {item.autonomia?.motivo && (
        <span style={{ color: C.text3 }}> — {item.autonomia.motivo}</span>
      )}
    </li>
  );

  return (
    <div style={{
      marginBottom: 14, padding: '14px 16px', borderRadius: 14,
      border: `1px solid ${C.primary}66`, background: C.card,
    }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>
        {nada ? 'Não há nada para despachar agora' : 'Confira antes de despachar'}
      </div>

      {!nada && (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {plano.merge_automatico > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.green}55`, background: C.greenBg }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {plano.merge_automatico} vão ser corrigidos, mergeados na main e publicados
              </div>
              <div style={{ fontSize: 12.5, color: C.text2, marginTop: 3, lineHeight: 1.5 }}>
                O merge só acontece com o CI verde (tipos, build, testes e os scripts do gate).
                Migrations são proibidas neste caminho, e o agente não escreve em pagamentos,
                autenticação nem no módulo Sistema.
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12.5, color: C.text }}>
                {auto.map((i) => <Linha key={i.id} item={i} />)}
              </ul>
            </div>
          )}
          {plano.so_pr > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {plano.so_pr} vão ser corrigidos e PARAM no PR — o merge é seu
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12.5, color: C.text }}>
                {pr.map((i) => <Linha key={i.id} item={i} />)}
              </ul>
            </div>
          )}
        </div>
      )}

      {humano.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: C.text2, lineHeight: 1.55 }}>
          <strong style={{ color: C.text }}>{humano.length} ficam com você</strong> (o agente não mexe
          nesses sozinho). Eles seguem na aba marcados como “precisa da sua ação”, com o motivo.
        </div>
      )}

      {/* ⚠️ Truncamento DECLARADO — nunca silencioso. */}
      {plano.adiados > 0 && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: C.amber }}>
          {plano.adiados} ficam para a próxima rodada (teto de {plano.teto_rodada} por clique).
        </div>
      )}

      {erro && (
        <div style={{ marginTop: 10, fontSize: 13, color: C.red }}><strong>Falhou:</strong> {erro}</div>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        {!nada && (
          <Button size="sm" onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? 'Despachando…' : `Resolver ${plano.merge_automatico + plano.so_pr}`}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCancelar} disabled={ocupado}>
          {nada ? 'Fechar' : 'Cancelar'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Recibo do despacho.
 *
 * ⚠️⚠️ Diz o que foi criado, o que foi PULADO e por quê, e — o que mais
 * importa — se o executor foi de fato acordado. Despacho que gravou tarefa e
 * não achou executor NÃO pode aparecer como sucesso: foi assim que o disparo do
 * censo mostrou caixa verde com zero envio (05/08).
 */
function Recibo({ recibo, onFechar }) {
  const criadas = recibo?.criadas || [];
  const refila = recibo?.reenfileiradas || [];
  const pulados = recibo?.pulados || [];
  const ex = recibo?.executor || {};
  const comecou = ex.chamado && ex.executando !== false;

  return (
    <div style={{
      marginBottom: 14, padding: '14px 16px', borderRadius: 14,
      border: `1px solid ${comecou ? C.green : C.amber}55`,
      background: comecou ? C.greenBg : C.amberBg,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
        {criadas.length + refila.length > 0
          ? `${criadas.length + refila.length} correção(ões) despachada(s)`
          : 'Nada foi despachado'}
      </div>

      {criadas.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
          {criadas.map((c) => (
            <li key={c.id}>
              {c.titulo}
              <span style={{ color: C.text3 }}>
                {' '}— {c.merge_automatico ? 'corrige e mergeia' : 'corrige e para no PR'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!comecou && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
          <strong>O executor não confirmou início.</strong> {ex.motivo || 'sem detalhe'}
        </div>
      )}
      {comecou && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: C.text2 }}>
          O executor foi acordado. Ele pega até 3 tarefas por rodada — o resto entra nos tiques
          seguintes (de 10 em 10 minutos). Esta aba se atualiza sozinha enquanto houver trabalho.
        </div>
      )}

      {pulados.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: C.text2 }}>
            {pulados.length} não entraram — ver o motivo
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12.5, color: C.text2, lineHeight: 1.6 }}>
            {pulados.map((p, i) => <li key={i}>{p.titulo} — {p.motivo}</li>)}
          </ul>
        </details>
      )}

      <Button size="sm" variant="ghost" style={{ marginTop: 10, paddingLeft: 0 }} onClick={onFechar}>
        Fechar
      </Button>
    </div>
  );
}

export default function TabDiagnosticos() {
  // A notificação de push linka `?run=<id>` — é ela que traz a pessoa aqui.
  const [params] = useSearchParams();
  const runDestacada = params.get('run');
  const [filtro, setFiltro] = useState('abertos');
  const [confirmar, setConfirmar] = useState(null);   // prévia carregada
  const [recibo, setRecibo] = useState(null);         // resultado do despacho
  const qc = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['agent-diagnosticos'],
    queryFn: () => agents.diagnosticos({ limite: 60 }),
    // ⚠️ Enquanto há trabalho em curso a aba se atualiza sozinha: o executor
    // leva minutos (implementa, espera o CI, mergeia) e obrigar a pessoa a
    // apertar "Atualizar" faria o andamento parecer travado.
    refetchInterval: (q) => {
      const r = q?.state?.data?.andamento;
      return r && r.em_andamento > 0 ? 20_000 : false;
    },
    staleTime: 60_000,
  });

  const previa = useMutation({
    mutationFn: () => agents.diagnosticosPrevia({ limite: 60 }),
    onSuccess: (p) => setConfirmar(p),
  });

  const despachar = useMutation({
    mutationFn: (body) => agents.diagnosticosResolver(body),
    onSuccess: (r) => {
      setConfirmar(null);
      setRecibo(r);
      qc.invalidateQueries({ queryKey: ['agent-diagnosticos'] });
    },
  });

  const itens = data?.itens || [];
  const resumo = data?.resumo || {};

  const visiveis = useMemo(() => {
    const base = filtro === 'abertos' ? itens.filter((i) => i.estado === 'aberto')
      : filtro === 'criticos' ? itens.filter((i) => i.severidade === 'critico')
        : filtro === 'andamento' ? itens.filter((i) => i.andamento === 'na_fila' || i.andamento === 'trabalhando')
          : filtro === 'resolvidos' ? itens.filter((i) => i.andamento === 'resolvido')
            : filtro === 'precisam' ? itens.filter((i) => i.andamento === 'precisa_de_voce')
              : itens;
    // ⚠️ O item que veio da notificação NUNCA é escondido pelo filtro: a pessoa
    // clicou no push pra ler AQUELE — e sumir com ele é a tela muda de novo.
    if (!runDestacada) return base;
    const dele = itens.filter((i) => i.run_id === runDestacada);
    const resto = base.filter((i) => i.run_id !== runDestacada);
    return [...dele, ...resto];
  }, [itens, filtro, runDestacada]);

  // ⚠️ "Precisam de decisão" SAIU: medido em 31/08, `decision_required` veio
  // **true em 19 de 19** diagnósticos — o chip marcava 100% dos achados e não
  // separava nada. No lugar entraram as três caixas de TRABALHO, que é o que o
  // Matheus pediu pra acompanhar.
  const and = data?.andamento || {};
  const FILTROS = [
    ['abertos', `Em aberto${resumo.abertos ? ` (${resumo.abertos})` : ''}`],
    ['andamento', `Sendo resolvidos${and.em_andamento ? ` (${and.em_andamento})` : ''}`],
    ['resolvidos', `Resolvidos${and.resolvidos ? ` (${and.resolvidos})` : ''}`],
    ['precisam', `Precisam da sua ação${and.precisam_de_voce ? ` (${and.precisam_de_voce})` : ''}`],
    ['criticos', 'Críticos'],
    ['todos', `Todos${resumo.total ? ` (${resumo.total})` : ''}`],
  ];
  // ⚠️ A janela é DECLARADA no chip "Todos": a aba lê as 60 execuções mais
  // recentes, e achado de execução mais antiga não aparece. "Resolver todos"
  // age no que a aba mostra — silêncio aqui faria "todos" prometer mais.
  const tituloDoChip = (id) => (id === 'todos'
    ? 'Os achados das 60 execuções de agente mais recentes. Achado de execução mais antiga não aparece nesta aba.'
    : undefined);

  const resolverUm = (item, tentarDeNovo) => despachar.mutate(
    tentarDeNovo ? { ids: [item.id], reenfileirar: [item.id] } : { ids: [item.id] },
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>O que os agentes acharam</div>
          <div style={{ fontSize: 12.5, color: C.text2, marginTop: 2, lineHeight: 1.5, maxWidth: 660 }}>
            Cada achado com a causa provável e o plano de ação. <strong>Resolver todos</strong> manda o
            agente desenvolvedor corrigir e abrir o PR; quando o incidente é reproduzível ele também
            mergeia na main. O que ele não faz sozinho fica marcado como{' '}
            <strong>precisa da sua ação</strong>, com o motivo. Mudar o status do incidente é em{' '}
            <a href="/sistema" style={{ color: C.primary }}>Sistema</a>.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Atualizando…' : 'Atualizar'}
          </Button>
          <Button size="sm" onClick={() => previa.mutate()} disabled={previa.isPending || despachar.isPending}>
            {previa.isPending ? 'Conferindo…' : 'Resolver todos'}
          </Button>
        </div>
      </div>

      {previa.isError && (
        <Faixa cor={C.red} fundo={C.redBg}>
          <strong>Não conseguimos montar a prévia.</strong> {previa.error?.message}
        </Faixa>
      )}

      {data?.andamento_indisponivel && (
        /* ⚠️ "não deu pra saber o andamento" nunca se disfarça de "não há
           correção em curso": as duas coisas levam a decisões opostas. */
        <Faixa cor={C.amber} fundo={C.amberBg}>
          <strong>Achados carregados, andamento não.</strong> {data.aviso} Os selos de
          resolvido/em andamento podem estar faltando nesta leitura.
        </Faixa>
      )}

      {confirmar && (
        <ConfirmarResolucao
          previa={confirmar}
          ocupado={despachar.isPending}
          erro={despachar.error?.message}
          onCancelar={() => setConfirmar(null)}
          onConfirmar={() => despachar.mutate({})}
        />
      )}

      {recibo && <Recibo recibo={recibo} onFechar={() => setRecibo(null)} />}

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
          <button key={id} type="button" title={tituloDoChip(id)} onClick={() => setFiltro(id)} style={{
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
            <Card key={item.id} item={item} abertoInicial={item.run_id === runDestacada}
                  onResolverUm={resolverUm} ocupado={despachar.isPending} />
          ))}
        </div>
      )}
    </div>
  );
}
