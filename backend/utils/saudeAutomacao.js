// ════════════════════════════════════════════════════════════════════════════
//  A classificação de saúde de um pipeline vigiado — e o estado que faltava.
//
//  ⚠️⚠️ POR QUE ESTE MÓDULO EXISTE. Em 24/09/2026 o Matheus reparou que
//  "Vídeos do YouTube" e "Snapshot do canal" apareciam parados no painel.
//  Não estavam: os dois tinham rodado às 06:00 daquela manhã. O monitor é que
//  lia `created_at` em duas tabelas que só têm `collected_at` — a consulta dava
//  erro, o erro virava `desconhecido`, e `desconhecido` virava um traço cinza.
//
//  ⚠️⚠️ O DANO REAL NÃO É O TRAÇO: é que `checarEAlertar` PULA `desconhecido`.
//  Desde 24/06/2026 — três meses — esses dois pipelines não eram vigiados por
//  ninguém. Se tivessem quebrado de verdade, nenhum alerta sairia. Um monitor
//  que degrada em silêncio é pior que monitor nenhum, porque ocupa o lugar de
//  um que funcionaria. É o mesmo formato do incidente de 02/09 (o alerta do
//  banco fora não saiu porque o alertador dependia do próprio banco).
//
//  ⇒ A régua: "não consigo vigiar" é FALHA, não ausência. Erro de configuração
//  (tabela/coluna que não existe) vira `erro_config`, que ALERTA — e alerta
//  apontando para o cadastro do monitor, não para o pipeline, porque o problema
//  está no vigia.
//
//  ⚠️ A classificação vive aqui, pura, e não dentro do serviço que lê o banco:
//  guarda que decide algo dentro do código de I/O é guarda que nenhum mutante
//  alcança — já custou 623 escalas religadas errado.
// ════════════════════════════════════════════════════════════════════════════

const HORA = 3600000;

// Marcas do Postgres/PostgREST para "você pediu algo que não existe". Um erro
// assim NUNCA é o pipeline: é o cadastro do monitor apontando para o lugar
// errado. `42703` = undefined_column · `42P01` = undefined_table · `PGRST204`
// = coluna fora do schema cache.
const MARCAS_CONFIG = ['42703', '42p01', 'pgrst204', 'pgrst205',
  'does not exist', 'could not find', 'unknown column'];

/** O erro é de CADASTRO (aponta para o que não existe) ou de execução? */
function erroDeConfiguracao(erro) {
  if (!erro) return false;
  const texto = `${erro.code || ''} ${erro.message || ''} ${erro.details || ''}`.toLowerCase();
  return MARCAS_CONFIG.some((m) => texto.includes(m));
}

/**
 * O status de um pipeline.
 *
 * @param p       { maxHoras }
 * @param ultima  timestamp do registro mais recente, ou null
 * @param erro    erro da consulta, ou null
 * @param agora   epoch ms (injetado para o teste não depender do relógio)
 */
function classificar(p, ultima, erro = null, agora = Date.now()) {
  // ⚠️ O erro de configuração vem ANTES de tudo: sem ele, um monitor apontando
  // para tabela inexistente se disfarçaria de "pipeline sem dados".
  if (erroDeConfiguracao(erro)) {
    return { status: 'erro_config', ultima: null, horas: null,
      motivo: erro.message || String(erro) };
  }
  if (erro) return { status: 'desconhecido', ultima: null, horas: null,
    motivo: erro.message || String(erro) };
  // Tabela existe e está vazia: é ausência de dado, não falha do vigia.
  if (!ultima) return { status: 'desconhecido', ultima: null, horas: null, motivo: null };

  const t = new Date(ultima).getTime();
  if (!Number.isFinite(t)) {
    return { status: 'erro_config', ultima: null, horas: null,
      motivo: `timestamp ilegível: ${ultima}` };
  }
  const horas = Math.floor((agora - t) / HORA);
  const max = Number(p && p.maxHoras);
  if (!Number.isFinite(max) || max <= 0) {
    return { status: 'erro_config', ultima, horas, motivo: 'maxHoras inválido no catálogo' };
  }
  let status = 'ok';
  if (horas > max * 2) status = 'parado';
  else if (horas > max) status = 'atrasado';
  return { status, ultima, horas, motivo: null };
}

// ⚠️ `erro_config` ENTRA na lista que alerta. Foi a ausência dele que deixou
// dois pipelines três meses sem vigia.
const STATUS_QUE_ALERTAM = Object.freeze(['atrasado', 'parado', 'erro_config']);

function deveAlertar(status) {
  return STATUS_QUE_ALERTAM.includes(status);
}

/** O texto do alerta muda quando o problema é do VIGIA, não do pipeline. */
function textoAlerta(s) {
  if (s.status === 'erro_config') {
    return {
      titulo: `Monitor quebrado: ${s.label}`,
      mensagem: `O monitor não consegue verificar "${s.label}" — ${s.motivo || 'consulta inválida'}. `
        + `Enquanto isso durar, este pipeline NÃO está sendo vigiado: se ele parar, nenhum alerta sai. `
        + `O conserto é no cadastro do monitor (tabela/coluna), não no pipeline.`,
      severidade: 'warning',
    };
  }
  return {
    titulo: `Automação ${s.status === 'parado' ? 'parada' : 'atrasada'}: ${s.label}`,
    mensagem: `${s.label} está há ${s.horas}h sem novo registro (esperado a cada ${s.maxHoras}h). `
      + `Verifique se a sincronização/cron está rodando.`,
    severidade: s.status === 'parado' ? 'warning' : 'info',
  };
}

module.exports = { HORA, erroDeConfiguracao, classificar, deveAlertar, textoAlerta, STATUS_QUE_ALERTAM };
