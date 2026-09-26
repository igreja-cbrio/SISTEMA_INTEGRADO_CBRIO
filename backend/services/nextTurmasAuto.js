// ============================================================================
// NEXT · abre as turmas do mês sozinho (2026-08-26)
//
// Pedido do Matheus: "preciso que todo mês as turmas sejam abertas
// automaticamente, sem ter que abrir manualmente no módulo".
//
// Uma turma por DOMINGO, com UM encontro, no culto de 09:30. Quem decide QUAIS
// turmas devem existir é `backend/utils/nextTurmas.js` (régua pura, no gate);
// aqui só se lê e escreve o banco.
// ============================================================================

const { supabase } = require('../utils/supabase');
const { turmasPlanejadas, mesesAGarantir } = require('../utils/nextTurmas');

/**
 * Garante as turmas de um mês. Idempotente pela UNIQUE `uq_next_turmas_auto_domingo`.
 *
 * ⚠️ A idempotência é a CONSTRAINT, não um SELECT antes do INSERT: duas execuções
 * concorrentes (cron + clique manual) veriam ambas "não existe" e criariam duas
 * turmas para o mesmo domingo. É a lei de 04/08 — a guarda tem de ser a mesma
 * chave do índice.
 */
async function campusDaRotina(cliente, campusId) {
  const { data, error } = await cliente.from('app_campus_config').select('estado,campus_legado_id,ja_ativado').eq('id', true).maybeSingle();
  if (error || !data || typeof data.ja_ativado !== 'boolean' || !['preparacao', 'ensaio', 'ativo'].includes(data.estado)
    || (data.ja_ativado && data.estado === 'preparacao')) throw new Error('Configuração de campus indisponível.');
  const id = campusId || (data.estado === 'preparacao' ? data.campus_legado_id : null);
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id || '')
    || (data.estado === 'preparacao' && id !== data.campus_legado_id)) throw new Error('Campus explícito obrigatório para a rotina Next.');
  return id;
}

async function garantirTurmasDoMes(mes, agora = new Date(), opcoes = {}) {
  const cliente = opcoes.supabase || supabase;
  const campusId = await campusDaRotina(cliente, opcoes.campusId);
  const criadas = [], jaExistiam = [], erros = [];
  for (const t of turmasPlanejadas(mes, agora)) {
    const { data: turma, error } = await cliente.rpc('fn_campus_next_criar_turma', {
      p_igreja_id: campusId, p_nome: t.nome, p_responsavel_id: null, p_observacoes: null,
      p_encontros: t.encontros, p_auto_domingo: t.data, p_puxar_fila: false,
    });
    if (error || !turma) {
      erros.push({ domingo: t.data, etapa: 'transacao', motivo: error?.message || 'Resposta inválida da criação de turma.' });
    } else if (turma.ja_existia) jaExistiam.push(t.data);
    else criadas.push({ id: turma.id, nome: turma.nome, data: t.data });
  }
  return { mes, criadas, ja_existiam: jaExistiam, erros };
}

/**
 * O que a rotina diária chama: mês corrente + o seguinte.
 *
 * ⚠️ NÃO puxa a lista de espera. O `POST /turmas` do módulo puxa a fila quando a
 * turma nova é a ÚNICA aberta — e com 4 ou 5 turmas abertas ao mesmo tempo essa
 * condição nunca é verdadeira, então a fila continuaria parada. Aqui a pessoa
 * escolhe o domingo no próprio formulário, que é o que substitui a fila.
 */
async function garantirTurmasAutomaticas(agora = new Date(), opcoes = {}) {
  const out = { meses: [], criadas: 0, ja_existiam: 0, erros: [] };
  for (const mes of mesesAGarantir(agora)) {
    const r = await garantirTurmasDoMes(mes, agora, opcoes);
    out.meses.push({ mes, criadas: r.criadas.length, ja_existiam: r.ja_existiam.length });
    out.criadas += r.criadas.length;
    out.ja_existiam += r.ja_existiam.length;
    out.erros.push(...r.erros);
  }
  return out;
}

module.exports = { garantirTurmasDoMes, garantirTurmasAutomaticas };
