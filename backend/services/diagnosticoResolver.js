// ============================================================================
//  "Resolver todos" da aba Diagnósticos · quem cria a tarefa e chama o executor
//
//  ⚠️⚠️ ESTE ARQUIVO NÃO CONSERTA NADA — e é de propósito. Quem escreve código,
//  roda o G1, abre PR, espera o CI e mergeia é o `developer_agent`, que vive no
//  worker do Railway (`agent-worker/src/agents/devAgent.ts`) e já existia
//  completo. Aqui só se cria a linha de trabalho e se acorda o dispatcher.
//
//  ⚠️ A régua de ATÉ ONDE cada achado vai sozinho é PURA e mora em
//  `utils/diagnosticoAutonomia.js` (no gate). Não duplicar decisão aqui.
//
//  ⚠️⚠️ O VÍNCULO achado ↔ tarefa é `agent_tarefas.id = system_incidents.id`.
//  Não é gambiarra: é a identidade que o próprio executor usa pra reconhecer
//  "correção assistida de incidente" (`isSystemIncidentCorrection`), e é ela
//  que dá o acompanhamento na tela sem coluna nova. Duas consequências:
//   1. um incidente tem UMA tarefa (findings do mesmo incidente compartilham);
//   2. `classe` é 'dev', NUNCA 'bug' — o trigger `trg_agent_tarefas_sync_incidente`
//      dispara em classe='bug' e CRIARIA UM SEGUNDO INCIDENTE para o mesmo
//      problema, porque procura por `source_ref = id da tarefa` e não acha o
//      incidente que o diagnosticador já abriu. Ficariam dois na fila do
//      /sistema, e a contagem da aba passaria a mentir.
// ============================================================================
const { supabase } = require('../utils/supabase');
const { listarDiagnosticos } = require('./agentDiagnosticos');
const {
  FAIXAS, distribuir, andamentoDoAchado, resumirAndamento,
} = require('../utils/diagnosticoAutonomia');

const LOTE = 200;          // `.in()` sempre em lotes ≤200 (lei do projeto)
const TETO_RODADA = 10;    // quantas tarefas um clique despacha
const AGENTE = 'developer_agent';

/** severidade do achado → prioridade do board (vocabulários diferentes). */
const PRIORIDADE = { critico: 'critica', aviso: 'alta', info: 'media' };

/**
 * Status de tarefa em que NÃO se cria nem se re-enfileira nada sem pedido
 * explícito. ⚠️ `bloqueada` está aqui porque significa "o CI ficou vermelho 3×
 * e o agente parou" — re-enfileirar em massa reabriria o mesmo laço, gastando
 * orçamento pra chegar no mesmo lugar.
 */
const NAO_REENFILEIRA = new Set([
  'agendada', 'em_andamento', 'em_diagnostico', 'aguardando_revisao',
  'aguardando_aprovacao', 'concluida', 'bloqueada', 'rejeitada', 'cancelada',
]);

async function lerEmLotes(ids, consulta) {
  const out = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await consulta(ids.slice(i, i + LOTE));
    // ⚠️ PROPAGA: tarefa que não veio faria o achado aparecer como "não
    // iniciado" e o botão criaria uma SEGUNDA tarefa pro mesmo incidente.
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/** Tarefas de diagnóstico dos incidentes citados, indexadas por id. */
async function tarefasPorIncidente(incidenteIds) {
  const ids = [...new Set((incidenteIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const linhas = await lerEmLotes(ids, (chunk) => supabase
    .from('agent_tarefas')
    .select('id, status, pull_request_url, branch, merge_automatico, origem, gate, created_at, updated_at')
    .in('id', chunk)
    .is('deleted_at', null));
  return new Map(linhas.map((t) => [t.id, t]));
}

/**
 * Anexa `autonomia`, `tarefa` e `andamento` aos achados.
 *
 * ⚠️ Uma consulta pro lote inteiro: a aba é aberta a partir de um push e 19
 * achados não podem virar 19 idas ao banco.
 */
async function anexarAndamento(itens) {
  const d = distribuir(itens);
  const mapa = await tarefasPorIncidente(d.itens.map((i) => i.incidente?.id));
  const comAndamento = d.itens.map((item) => {
    const tarefa = item.incidente?.id ? (mapa.get(item.incidente.id) || null) : null;
    const { andamento, motivo } = andamentoDoAchado(item, tarefa);
    return {
      ...item,
      tarefa: tarefa ? {
        id: tarefa.id,
        status: tarefa.status,
        pull_request_url: tarefa.pull_request_url || null,
        branch: tarefa.branch || null,
        merge_automatico: tarefa.merge_automatico === true,
        atualizada_em: tarefa.updated_at || null,
      } : null,
      andamento,
      andamento_motivo: motivo,
    };
  });
  return {
    itens: comAndamento,
    faixas: d.resumo,
    andamento: resumirAndamento(comAndamento),
  };
}

/**
 * O texto que o executor recebe como DIAGNÓSTICO APROVADO.
 *
 * ⚠️⚠️ Não é enfeite: `devAgent` só entra no caminho de correção assistida
 * quando `tarefa.diagnostico` está PREENCHIDO (senão trata como tarefa comum, e
 * sem o diagnóstico o agente reinvestigaria do zero o que já foi investigado).
 * É por isso que o botão pode dispensar a fase de diagnóstico: ela já aconteceu
 * — é o conteúdo desta aba.
 */
function montarDiagnostico(item) {
  const bloco = (titulo, linhas) => (linhas?.length
    ? [`${titulo}:`, ...linhas.map((l, i) => `  ${i + 1}. ${l}`)].join('\n')
    : null);
  return [
    item.resumo || item.titulo,
    bloco('Evidências que o agente viu', item.evidencias),
    bloco('Plano de ação proposto', item.plano_de_acao),
    bloco('Como validar', item.passos_de_validacao),
    item.decisao_necessaria && item.pergunta_de_decisao
      // ⚠️ A pergunta VAI no diagnóstico mesmo quando não trava a faixa: ela é
      // contexto que o agente precisa pra NÃO tomar a decisão sozinho.
      ? `Pergunta aberta (NÃO decida sozinho — se a correção depender dela, pare e relate): ${item.pergunta_de_decisao}`
      : null,
    item.incidente?.request_id ? `Rastreio do incidente: ${item.incidente.request_id}` : null,
    item.incidente?.release ? `Release: ${item.incidente.release}` : null,
    `Confiança declarada pelo diagnosticador: ${item.confianca || 'não declarada'}.`,
  ].filter(Boolean).join('\n\n');
}

function montarDescricao(item, faixa) {
  return [
    `Correção assistida a partir de um achado da aba Diagnósticos (${item.agente}).`,
    item.incidente?.impacto ? `Impacto relatado: ${item.incidente.impacto}` : null,
    faixa === FAIXAS.AUTO
      ? 'Autonomia: ao CI ficar verde, o agente mergeia o próprio PR.'
      : 'Autonomia: PARE no PR. O merge é de uma pessoa.',
  ].filter(Boolean).join('\n');
}

/** Prévia: o que o botão vai fazer, sem escrever nada. */
async function previa({ limite } = {}) {
  const base = await listarDiagnosticos({ limite: limite || 60 });
  const anexado = await anexarAndamento(base.itens);
  const itens = anexado.itens;

  const candidatos = itens.filter((i) => i.autonomia.faixa !== FAIXAS.HUMANO && !i.tarefa);
  const despachar = candidatos.slice(0, TETO_RODADA);

  return {
    ...base,
    ...anexado,
    plano: {
      // ⚠️ Contagens SEPARADAS: "vai mergear sozinho" e "vai abrir PR pra você"
      // são autorizações diferentes, e somá-las num "6 achados" esconderia
      // justamente o que a pessoa está autorizando.
      merge_automatico: despachar.filter((i) => i.autonomia.faixa === FAIXAS.AUTO).length,
      so_pr: despachar.filter((i) => i.autonomia.faixa === FAIXAS.PR).length,
      ja_em_andamento: anexado.andamento.em_andamento,
      precisam_de_voce: anexado.andamento.precisam_de_voce,
      // ⚠️ Truncamento DECLARADO, nunca silencioso.
      adiados: Math.max(0, candidatos.length - despachar.length),
      teto_rodada: TETO_RODADA,
    },
    // ⚠️ A JANELA é declarada: a aba lê as 60 execuções mais recentes, e achado
    // de execução mais antiga NÃO aparece (medido em 31/08: 19 achados na
    // janela contra 62 na história — os 43 de fora são de auditorias antigas,
    // todas sem incidente, que a régua manda pro humano de qualquer forma).
    // "Resolver todos" quer dizer "todos os que esta aba mostra".
    janela: {
      runs_lidas: 60,
      itens: itens.length,
      desde: itens.length ? itens[itens.length - 1].quando : null,
    },
  };
}

/**
 * Cria as tarefas e acorda o executor.
 *
 * @param opts.autorId  quem clicou (vai em created_by/reportado_por)
 * @param opts.ids      ids de achado (`run:indice`) a despachar · vazio = todos
 * @param opts.reenfileirar  ids de achado cuja tarefa deve voltar pra fila
 */
async function resolver({ autorId, ids, reenfileirar } = {}) {
  const alvo = new Set(Array.isArray(ids) ? ids : []);
  const refila = new Set(Array.isArray(reenfileirar) ? reenfileirar : []);

  const base = await listarDiagnosticos({ limite: 60 });
  const { itens } = await anexarAndamento(base.itens);

  const criadas = [];
  const reenfileiradas = [];
  const pulados = [];

  const elegiveis = itens.filter((i) => (alvo.size ? alvo.has(i.id) : true));

  for (const item of elegiveis) {
    const faixa = item.autonomia.faixa;
    const inc = item.incidente?.id;

    if (faixa === FAIXAS.HUMANO) {
      pulados.push({ id: item.id, titulo: item.titulo, motivo: item.autonomia.motivo });
      continue;
    }
    if (criadas.length + reenfileiradas.length >= TETO_RODADA) {
      pulados.push({ id: item.id, titulo: item.titulo, motivo: `teto de ${TETO_RODADA} por rodada — clique de novo depois` });
      continue;
    }

    const mergeAutomatico = faixa === FAIXAS.AUTO;

    // ── já existe tarefa pro incidente ──────────────────────────────────────
    if (item.tarefa) {
      const st = String(item.tarefa.status || '').toLowerCase();
      const pedido = refila.has(item.id);
      if (!pedido || NAO_REENFILEIRA.has(st)) {
        pulados.push({
          id: item.id,
          titulo: item.titulo,
          motivo: pedido
            ? `a tarefa está em "${st}" — reenfileirar daqui reabriria o mesmo caminho; decida na aba Equipe`
            : `já tem tarefa no board (${st})`,
          tarefa_status: st,
        });
        continue;
      }
      // Só `falhou` chega aqui: re-tentativa EXPLÍCITA de um achado só.
      const { error } = await supabase.from('agent_tarefas')
        .update({ status: 'agendada', merge_automatico: mergeAutomatico, updated_at: new Date().toISOString() })
        .eq('id', inc).eq('status', st).is('deleted_at', null);
      if (error) {
        pulados.push({ id: item.id, titulo: item.titulo, motivo: `falha ao reenfileirar: ${error.message}` });
        continue;
      }
      reenfileiradas.push({ id: item.id, incidente_id: inc, titulo: item.titulo });
      continue;
    }

    // ── cria ────────────────────────────────────────────────────────────────
    const titulo = String(item.incidente?.titulo || item.titulo || 'Correção de incidente').slice(0, 180);
    const linha = {
      id: inc,                                   // ⚠️ a identidade com o incidente
      titulo,
      descricao: montarDescricao(item, faixa),
      classe: 'dev',                             // ⚠️ NUNCA 'bug' (duplicaria o incidente)
      agente_key: AGENTE,
      status: 'agendada',
      prioridade: PRIORIDADE[item.severidade] || 'media',
      origem: 'diagnostico',
      diagnostico: montarDiagnostico(item),
      diagnostico_em: item.quando || new Date().toISOString(),
      merge_automatico: mergeAutomatico,
      created_by: autorId || null,
      reportado_por: autorId || null,
    };

    const { error } = await supabase.from('agent_tarefas').insert(linha);
    if (error) {
      // 23505 = alguém criou no meio (duplo clique) — não é erro pra tela.
      pulados.push({
        id: item.id,
        titulo: item.titulo,
        motivo: error.code === '23505' ? 'a tarefa acabou de ser criada por outra rodada' : `falha ao criar a tarefa: ${error.message}`,
      });
      continue;
    }
    criadas.push({ id: item.id, incidente_id: inc, titulo, merge_automatico: mergeAutomatico, faixa });
  }

  const executor = (criadas.length || reenfileiradas.length)
    ? await acordarExecutor()
    : { chamado: false, motivo: 'nada a despachar' };

  return { criadas, reenfileiradas, pulados, executor };
}

/**
 * Acorda o dispatcher do worker pra não esperar o tique de 10 min.
 *
 * ⚠️⚠️ BEST-EFFORT E DECLARADO: se o worker não responder, as tarefas já estão
 * GRAVADAS e o cron do próprio worker as pega no próximo tique. Derrubar a
 * resposta aqui faria a tela dizer "não deu" sobre trabalho que foi enfileirado
 * — a lei de 04/08 ("timeout de cliente não é prova de que nada aconteceu").
 *
 * ⚠️ E o contrário também não pode: worker sem env configurada NÃO pode
 * aparecer como sucesso. Por isso `chamado: false` + motivo em português sobem
 * pra tela (a lição do disparo do censo, 05/08 — caixa verde com nada enviado).
 */
async function acordarExecutor() {
  const url = process.env.AGENT_WORKER_URL;
  const segredo = process.env.AGENT_WORKER_HMAC_SECRET;
  if (!url || !segredo) {
    return { chamado: false, motivo: 'AGENT_WORKER_URL/AGENT_WORKER_HMAC_SECRET não configuradas na Vercel — as tarefas ficaram na fila e o cron do worker as pega no próximo tique (10 min)' };
  }
  try {
    const { sign } = require('../utils/workerHmac');
    const body = JSON.stringify({ config: { trigger: 'manual', origem: 'diagnosticos' } });
    const resp = await fetch(`${url.replace(/\/$/, '')}/run/dev_dispatcher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Signature': sign(body) },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return { chamado: false, motivo: `o worker respondeu ${resp.status} — as tarefas ficaram na fila. ${txt.slice(0, 160)}` };
    }
    const data = await resp.json().catch(() => ({}));
    // ⚠️ O dispatcher devolve `cancelled` quando DEV_AGENT_ENABLED != 1 ou falta
    // GITHUB_TOKEN no Railway. Isso NÃO é sucesso, e a tela tem de dizer —
    // senão a pessoa espera por um conserto que nunca vai começar.
    const status = data?.status || data?.result?.status;
    if (status === 'cancelled') {
      return {
        chamado: true,
        executando: false,
        motivo: `o executor está DESLIGADO no worker (${data?.summary || data?.result?.summary || 'DEV_AGENT_ENABLED != 1 ou GITHUB_TOKEN ausente'}). As tarefas estão na fila e começam quando ele for ligado.`,
      };
    }
    return { chamado: true, executando: true, worker: data };
  } catch (e) {
    return { chamado: false, motivo: `worker indisponível (${e.message}) — as tarefas ficaram na fila e o cron as pega no próximo tique` };
  }
}

module.exports = {
  TETO_RODADA,
  NAO_REENFILEIRA,
  anexarAndamento,
  montarDiagnostico,
  previa,
  resolver,
  acordarExecutor,
};
