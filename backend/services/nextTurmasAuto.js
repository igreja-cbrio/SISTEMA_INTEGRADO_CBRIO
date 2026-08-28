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
async function garantirTurmasDoMes(mes, agora = new Date()) {
  const plano = turmasPlanejadas(mes, agora); // domingo vencido não entra
  const criadas = [];
  const jaExistiam = [];
  const erros = [];

  for (const t of plano) {
    // 1. a turma. Conflito de auto_domingo = já existe (ou já existiu e foi
    //    apagada) → pula sem tratar como erro.
    const { data: turma, error } = await supabase
      .from('next_turmas')
      .insert({ nome: t.nome, status: 'aberta', auto_domingo: t.data })
      .select('id, nome, auto_domingo')
      .single();

    if (error) {
      if (error.code === '23505') { jaExistiam.push(t.data); continue; }
      erros.push({ domingo: t.data, etapa: 'turma', motivo: error.message });
      continue;
    }

    // 2. o encontro único.
    //
    // ⚠️ Se o encontro falhar, a turma fica SEM data e aparece no formulário sem
    // domingo nenhum — pior que não existir. Desfaz a turma (hard delete: ela
    // acabou de nascer, não tem matrícula nem presença) e reporta, para a
    // próxima rodada tentar de novo.
    const { error: encErr } = await supabase
      .from('next_encontros')
      .insert({ turma_id: turma.id, numero: t.encontros[0].numero, data: t.encontros[0].data });

    if (encErr) {
      await supabase.from('next_turmas').delete().eq('id', turma.id);
      erros.push({ domingo: t.data, etapa: 'encontro', motivo: encErr.message });
      continue;
    }

    criadas.push({ id: turma.id, nome: turma.nome, data: t.data });
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
async function garantirTurmasAutomaticas(agora = new Date()) {
  const out = { meses: [], criadas: 0, ja_existiam: 0, erros: [] };
  for (const mes of mesesAGarantir(agora)) {
    const r = await garantirTurmasDoMes(mes, agora);
    out.meses.push({ mes, criadas: r.criadas.length, ja_existiam: r.ja_existiam.length });
    out.criadas += r.criadas.length;
    out.ja_existiam += r.ja_existiam.length;
    out.erros.push(...r.erros);
  }
  return out;
}

module.exports = { garantirTurmasDoMes, garantirTurmasAutomaticas };
