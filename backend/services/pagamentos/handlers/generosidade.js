// Handler de domínio da GENEROSIDADE (`origem_tipo = 'generosidade'`).
//
// Traduz "o dinheiro da doação entrou" para o que isso significa na igreja:
//
//   pago      → 1 linha em `mem_contribuicoes` (razão NOMINAL: quem doou)
//   parcial   → nada além de avisar gente (doação não tem vaga a liberar)
//   estornado → NÃO desfaz nada sozinho: avisa o financeiro
//
// ⚠️ LEI Nº 6 DO NÚCLEO, aplicada aqui: `mem_contribuicoes` **NÃO é caixa**. Ela
// responde "QUEM doou, quanto e quando" (alimenta doadores únicos, recorrência,
// comprovante anual). O VALOR arrecadado do dashboard financeiro sai do
// **balanço**, e o caixa recebe 1 receita por REPASSE do PSP. Somar as duas
// camadas é exatamente como nasce dupla contagem — foi assim que apareceu a de
// ~R$ 1,5 mi. Não "melhorar" isso criando `fin_transacoes` por doação.
//
// ⚠️ E NÃO CRIA CADASTRO DE PESSOA, em nenhuma hipótese. A decisão de 2026-07-30
// ("essas pessoas não podem virar membro, vai confundir a base inteira") saiu
// exatamente de um caminho de dinheiro que criava `mem_membros` — 3.441 deles num
// dia, um sendo `RECEBIMENTOS CRECHE E PRE-ESCOLA ... LTDA`. Aqui o match é
// READ-ONLY (feito na porta, em publicGenerosidade.js): achou o membro, a doação
// entra nominal; não achou, o dinheiro segue registrado em `pag_*` e no balanço,
// e a linha nominal simplesmente não existe. Doação anônima é legítima.

const { supabase } = require('../../../utils/supabase');
const { notificar } = require('../../notificar');

const origem_tipo = 'generosidade';

// Espelha o CHECK de `mem_contribuicoes.tipo`. Categoria desconhecida vira
// 'oferta' em vez de derrubar o insert: o dinheiro entrou, e classificar errado
// é recuperável — perder o registro nominal não é.
const TIPOS_CONTRIBUICAO = new Set(['dizimo', 'oferta', 'campanha']);

/**
 * Data da doação no fuso DA IGREJA.
 *
 * ⚠️ `mem_contribuicoes.data` é DATE e `pago_em` é timestamptz UTC: às 21h do Rio
 * o dia UTC já virou, então `toISOString().slice(0,10)` jogaria a doação do culto
 * da noite pro dia seguinte — e é por dia que a série de generosidade é lida.
 * Mesma lição do dia da curva do censo e do check-in do Kids.
 */
function dataBrt(iso) {
  const d = iso ? new Date(iso) : new Date();
  // 'en-CA' devolve YYYY-MM-DD; o timeZone é o que importa aqui.
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

const reais = (centavos) => Number((Math.round(Number(centavos) || 0) / 100).toFixed(2));

const brl = (centavos) => reais(centavos).toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL',
});

/** Rótulo humano da categoria, pro aviso interno. */
function rotulo(meta) {
  const t = String(meta?.categoria || '').toLowerCase();
  if (t === 'dizimo') return 'Dízimo';
  if (t === 'campanha') return meta?.campanha ? `Campanha · ${meta.campanha}` : 'Campanha';
  return 'Oferta';
}

/**
 * Grava a doação no razão nominal.
 *
 * Idempotente pela UNIQUE parcial de `referencia_externa` (`pag:<cobranca_id>`):
 * reentrega do webhook e o cron de reconciliação chegam na mesma conclusão e a
 * segunda tentativa é um 23505 engolido — não uma segunda doação.
 */
async function registrarNominal(cobranca) {
  const meta = cobranca.metadata || {};
  const tipo = TIPOS_CONTRIBUICAO.has(String(meta.categoria)) ? String(meta.categoria) : 'oferta';

  const { error } = await supabase.from('mem_contribuicoes').insert({
    membro_id: cobranca.membro_id,
    tipo,
    // ⚠️ O valor nominal é o que ENTROU (`valor_pago_centavos`), não o que foi
    // cobrado: se algum dia um provedor liquidar diferente do combinado, o razão
    // tem que refletir o dinheiro, não a intenção.
    valor: reais(cobranca.valor_pago_centavos || cobranca.valor_centavos),
    data: dataBrt(cobranca.pago_em),
    campanha: tipo === 'campanha' ? (meta.campanha || null) : null,
    // A forma vem de `pag_cobrancas.metodo` (o que o PSP CONFIRMOU), nunca de um
    // palpite — foi o palpite `|| 'pix'` do espelho de inscrições que fez a tela
    // dizer "Pix" pra todo mundo, inclusive boleto.
    forma_pagamento: cobranca.metodo || null,
    origem: 'online',
    referencia_externa: `pag:${cobranca.id}`,
    area: meta.area || null,
  });

  // 23505 = já gravada (reentrega). É o caminho normal, não um erro.
  if (error && error.code !== '23505') throw error;
  return !error;
}

async function aoPagar(cobranca) {
  const meta = cobranca.metadata || {};
  const valor = brl(cobranca.valor_pago_centavos || cobranca.valor_centavos);
  const quem = cobranca.pagador_nome || 'Doador não identificado';

  // Sem membro casado, o razão NOMINAL não recebe linha — e isso é correto, não
  // uma falha: `mem_contribuicoes.membro_id` é NOT NULL e inventar cadastro pra
  // caber é justamente o que está proibido. O dinheiro segue registrado em
  // `pag_cobrancas`/`pag_pagamentos` e chega ao caixa pelo repasse.
  if (!cobranca.membro_id) {
    await notificar({
      modulo: 'financeiro',
      tipo: 'doacao_sem_cadastro',
      titulo: `Doação recebida sem cadastro vinculado · ${valor}`,
      mensagem: `${quem} doou ${valor} (${rotulo(meta)}) pelo site/app, mas não foi possível vincular a um cadastro `
        + `(sem CPF informado, ou CPF ainda não cadastrado). O dinheiro está registrado; só o razão nominal ficou sem a linha. `
        + `Se quiserem contar essa pessoa nos indicadores de doadores, cadastrem o CPF dela na Membresia.`,
      link: '/financeiro-v2',
      chaveDedup: `doacao_sem_cadastro_${cobranca.id}`,
    }).catch((e) => console.error('[pagamentos/generosidade] notificar:', e.message));
    return;
  }

  const gravouAgora = await registrarNominal(cobranca);
  // Reentrega: a linha já existia. Sem este gate, cada reentrega do PSP mandaria
  // outro aviso — a lição do `.select('id')` amarrando efeito à transição real.
  if (!gravouAgora) return;

  await notificar({
    modulo: 'financeiro',
    tipo: 'doacao_recebida',
    titulo: `Doação recebida · ${valor}`,
    mensagem: `${quem} doou ${valor} (${rotulo(meta)}) pelo site/app`
      + `${cobranca.metodo ? ` via ${cobranca.metodo}` : ''}. Já lançada no razão nominal de contribuições.`,
    link: '/financeiro-v2',
    chaveDedup: `doacao_${cobranca.id}`,
  }).catch((e) => console.error('[pagamentos/generosidade] notificar:', e.message));
}

/**
 * Pagou menos do que a cobrança pedia.
 *
 * NÃO grava nominal: metade de uma doação num razão que alimenta indicadores de
 * doador é pior que nenhuma linha — precisa de gente olhando (pode ser Pix de
 * valor editado na mão).
 */
async function aoPagarParcial(cobranca) {
  await notificar({
    modulo: 'financeiro',
    tipo: 'doacao_parcial',
    titulo: `Doação com valor parcial · ${brl(cobranca.valor_pago_centavos)}`,
    mensagem: `${cobranca.pagador_nome || 'Um doador'} enviou ${brl(cobranca.valor_pago_centavos)} `
      + `de ${brl(cobranca.valor_centavos)}. NÃO foi lançada no razão nominal — confiram antes de registrar.`,
    link: '/financeiro-v2',
    chaveDedup: `doacao_parcial_${cobranca.id}`,
  }).catch((e) => console.error('[pagamentos/generosidade] notificar:', e.message));
}

/**
 * Estorno / chargeback.
 *
 * ⚠️ NÃO apaga a linha de `mem_contribuicoes` automaticamente. Contribuição é
 * dado contábil e fiscal (entra no comprovante anual que a pessoa usa no IR);
 * apagar por webhook, sem gente vendo, faria o comprovante mudar depois de
 * emitido. O handler avisa e o financeiro decide.
 */
async function aoEstornar(cobranca) {
  await notificar({
    modulo: 'financeiro',
    tipo: 'doacao_estornada',
    titulo: `Doação estornada/contestada · ${brl(cobranca.valor_centavos)}`,
    mensagem: `A doação de ${cobranca.pagador_nome || '(sem nome)'} (${brl(cobranca.valor_centavos)}) foi estornada ou `
      + `contestada. A contribuição NÃO foi removida automaticamente do razão nominal `
      + `(referência \`pag:${cobranca.id}\`) — decidam se ela sai.`,
    severidade: 'alerta',
    link: '/financeiro-v2',
    chaveDedup: `doacao_estorno_${cobranca.id}`,
  }).catch((e) => console.error('[pagamentos/generosidade] notificar:', e.message));
}

module.exports = {
  origem_tipo,
  aoPagar,
  aoPagarParcial,
  aoEstornar,
  // Exportados pro teste (régua pura, sem banco).
  dataBrt,
  TIPOS_CONTRIBUICAO,
};
