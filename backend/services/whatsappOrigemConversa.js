// ════════════════════════════════════════════════════════════════════════════
//  Os disparos que antecederam a conversa (leitura do banco)
//
//  A régua de RÓTULO vive em utils/whatsappOrigem.js (pura, no gate) e a de
//  identidade do telefone é a `mesmoNumeroBR` do próprio inbox. Aqui é só o
//  acesso a dado.
//
//  ⚠️ 100% SOMENTE LEITURA. Não envia, não marca, não altera conversa.
// ════════════════════════════════════════════════════════════════════════════
const { supabase } = require('../utils/supabase');
const { rotuloDoDisparo, chaveTelefone } = require('../utils/whatsappOrigem');
// ⚠️ A conferência de identidade do telefone é a régua QUE JÁ EXISTE — pura,
// testada no gate e nascida do mesmo problema (o nono dígito criando duas
// conversas pra mesma pessoa). Escrever outra aqui daria duas verdades sobre "é
// a mesma pessoa?", e o inbox e esta tela passariam a discordar.
const { mesmoNumeroBR } = require('./waInbox');

// Janela de busca. Disparo de 3 meses atrás não explica a mensagem de hoje, e
// puxar o histórico inteiro do telefone encheria o painel de ruído antigo.
const DIAS_JANELA = 60;
const MAX_DISPAROS = 5;

/**
 * Últimos disparos enviados a este telefone, do mais recente pro mais antigo.
 * Devolve `[]` quando não há — e `null` NUNCA: a tela distingue "não recebeu
 * disparo" (lista vazia) de "não conseguimos ler" (o chamador trata o erro).
 */
async function disparosDoTelefone(telefone, { limite = MAX_DISPAROS } = {}) {
  const chave = chaveTelefone(telefone);
  if (!chave) return [];

  const desde = new Date(Date.now() - DIAS_JANELA * 86400 * 1000).toISOString();

  // ⚠️⚠️ O filtro é a coluna GERADA `tel8` (migration 20260812120000), nunca
  // `like '%<8 dígitos>'` sobre `telefone`: 31% das 1.558 linhas estão gravadas
  // COM MÁSCARA ("(21) 98668-7406"), e o `like` as perderia em SILÊNCIO — a tela
  // diria "não veio de disparo nenhum" justamente para quem recebeu.
  // ⚠️ A conferência em JS fica de pé mesmo assim (`chaveTelefone` dos dois
  // lados): formato inesperado é DESCARTADO em vez de casar errado.
  const colunas = 'id, telefone, contexto, template, status, enviado_em, criado_em, ref_id';
  let { data, error } = await supabase
    .from('whatsapp_envios')
    .select(colunas)
    .eq('tel8', chave)
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(limite * 4);

  // Deploy em 2 etapas: sem a coluna o PostgREST recusa a query INTEIRA (42703).
  // Cai numa varredura da janela e filtra em JS — mais caro, mas a tela não
  // deixa de responder (lição do `parcelas_max`).
  if (error && /tel8/.test(error.message || '')) {
    const alt = await supabase
      .from('whatsapp_envios')
      .select(colunas)
      .gte('criado_em', desde)
      .order('criado_em', { ascending: false })
      .limit(1000);
    if (alt.error) throw new Error(alt.error.message);
    data = alt.data;
    error = null;
  }
  if (error) throw new Error(error.message);

  const saida = [];
  for (const e of data || []) {
    // ⚠️ `mesmoNumeroBR` e NÃO só o tail: 8 dígitos colidem entre celulares que
    // diferem no 9º (`21 98668-7406` × `21 88668-7406`) e entre DDDs. O filtro do
    // banco é barato; quem decide o que a tela AFIRMA é esta conferência.
    if (!mesmoNumeroBR(e.telefone, telefone)) continue;
    const { rotulo, modulo, link, conhecido } = rotuloDoDisparo(e.contexto);
    saida.push({
      id: e.id,
      contexto: e.contexto || null,
      rotulo,
      modulo,
      link,
      conhecido,
      template: e.template || null,
      status: e.status || null,
      // ⚠️ `enviado_em` pode ser nulo (pendente/erro): a tela precisa poder
      // dizer "estava na fila e não saiu", que é informação para quem atende.
      em: e.enviado_em || e.criado_em || null,
      entregue: e.status === 'enviado',
      ref_id: e.ref_id || null,
    });
    if (saida.length >= limite) break;
  }
  return saida;
}

module.exports = { disparosDoTelefone, DIAS_JANELA };
