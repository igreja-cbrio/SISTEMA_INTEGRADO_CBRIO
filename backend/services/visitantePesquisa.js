// ════════════════════════════════════════════════════════════════════════════
//  VISITANTES · pesquisa de satisfação pelo WhatsApp, DEPOIS do culto
//
//  Quem registrou a visita pelo QR e marcou o opt-in recebe, quando o culto já
//  acabou, um template com o link da pesquisa (1 a 5 + comentário). A pessoa
//  responde na página `/visitante/avaliar/<token>`; a nota volta pra
//  `vis_visitas.pesquisa_nota` e aparece na tela de Visitantes.
//
//  COMO SAI (o padrão da casa · nenhum cron novo):
//   · `enviarPesquisasDevidas()` roda de CARONA no cron horário da fila
//     (`/api/public/grupos/cron/whatsapp-fila`, bloco protegido), ANTES do
//     `processarFila()` — então o que ela enfileira sai na mesma rodada.
//   · QUANDO é decidido pela régua pura `pesquisaDevida` (utils/visitanteRegras):
//     início do culto + 2h30 (ou registro + 2h sem culto), validade 72h.
//   · "já avisei" = `pesquisa_enviada_em`, carimbado com UPDATE CONDICIONAL
//     (`.is('pesquisa_enviada_em', null)`) ANTES de enfileirar — é o que
//     serializa duas rodadas concorrentes (lição do totem_estacao_tokens).
//
//  INTERRUPTOR: id `visitante_pesquisa` em whatsapp_config.disparos_off (nasce
//  DESLIGADO pela migration 20260909120000). O gate `test:disparo-interruptor`
//  exige que remetente × catálogo × PATCH concordem neste id.
//
//  TEMPLATE: `visitante_pesquisa_satisfacao` (env WHATSAPP_TEMPLATE_VISITANTE_PESQUISA
//  só como override) · {{1}} primeiro nome · {{2}} link da pesquisa NO CORPO
//  (link como variável de body, nunca botão de URL — é o que mantém UTILITY).
//  ⚠️ O template precisa ser criado/aprovado na Meta — é tarefa de GENTE.
// ════════════════════════════════════════════════════════════════════════════
const { supabase } = require('../utils/supabase');
const { pesquisaDevida, primeiroNome } = require('../utils/visitanteRegras');
const { montarLinkPesquisa } = require('../utils/visitanteToken');

const DISPARO_ID = 'visitante_pesquisa';
const CONTEXTO = 'cuidados.visitante_pesquisa';
const TEMPLATE = process.env.WHATSAPP_TEMPLATE_VISITANTE_PESQUISA || 'visitante_pesquisa_satisfacao';
const TETO_POR_RODADA = 100;

/** Hora do culto (BRT) pelo id · best-effort, `null` sem culto. */
async function horasDosCultos(ids) {
  const out = new Map();
  const lista = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < lista.length; i += 200) {
    const { data, error } = await supabase.from('cultos').select('id, data, hora').in('id', lista.slice(i, i + 200));
    if (error) throw error;
    for (const c of data || []) out.set(c.id, c);
  }
  return out;
}

/**
 * Varre as visitas com opt-in e sem pesquisa, decide pela régua e enfileira.
 * Devolve o resumo da rodada (o cron loga). Nunca lança: o cron da fila não
 * pode cair por causa de um satélite.
 */
async function enviarPesquisasDevidas({ agora = new Date() } = {}) {
  const resumo = { enviadas: 0, aguardando: 0, expiradas: 0, sem_link: 0, desligado: false, erro: null };
  try {
    const { disparoDesligado } = require('./comunicacaoDisparosOff');
    if (await disparoDesligado(DISPARO_ID)) { resumo.desligado = true; return resumo; }

    // Só a janela que pode virar envio: 72h pra trás. O índice parcial
    // idx_vis_visitas_pesquisa_pendente cobre exatamente este predicado.
    const desde = new Date(agora.getTime() - 72 * 3600 * 1000).toISOString();
    const { data: visitas, error } = await supabase
      .from('vis_visitas')
      .select('id, nome, telefone, culto_id, culto_data, created_at, whatsapp_optin, pesquisa_enviada_em')
      .eq('whatsapp_optin', true)
      .is('pesquisa_enviada_em', null)
      .is('deleted_at', null)
      .gte('created_at', desde)
      .order('created_at', { ascending: true })
      .limit(TETO_POR_RODADA);
    if (error) throw error;
    if (!visitas?.length) return resumo;

    const cultos = await horasDosCultos(visitas.map((v) => v.culto_id));
    const { enfileirarLote } = require('./whatsappFila');
    const itens = [];

    for (const v of visitas) {
      const culto = v.culto_id ? cultos.get(v.culto_id) : null;
      const destino = pesquisaDevida({
        registradoEm: v.created_at,
        cultoData: culto?.data || v.culto_data || null,
        cultoHora: culto?.hora || null,
        whatsappOptin: v.whatsapp_optin,
        pesquisaEnviadaEm: v.pesquisa_enviada_em,
        agora,
      });
      if (destino === 'aguardar') { resumo.aguardando += 1; continue; }
      if (destino === 'expirada') {
        // Carimba pra sair da varredura (senão reaparece toda hora até cair da
        // janela) — e a tela mostra "não enviada · fora do prazo".
        await supabase.from('vis_visitas')
          .update({ pesquisa_enviada_em: agora.toISOString(), pesquisa_status: 'expirada' })
          .eq('id', v.id).is('pesquisa_enviada_em', null)
          .then(() => {}, () => {});
        resumo.expiradas += 1;
        continue;
      }
      if (destino !== 'enviar') continue;

      const link = montarLinkPesquisa(v.id);
      if (!link) { resumo.sem_link += 1; continue; } // fail-closed sem segredo · fica pra próxima rodada

      // Carimbo ANTES de enfileirar, condicionado: duas rodadas concorrentes
      // disputam a mesma linha e só uma passa.
      const { data: marcada } = await supabase.from('vis_visitas')
        .update({ pesquisa_enviada_em: agora.toISOString(), pesquisa_status: 'enviada' })
        .eq('id', v.id).is('pesquisa_enviada_em', null)
        .select('id');
      if (!marcada?.length) continue;

      itens.push({
        // digits-only (DDD+número), como o totem grava: quem põe o 55 é o remetente (waSender.normalizarTelefone).
        telefone: v.telefone,
        template: TEMPLATE,
        params: [primeiroNome(v.nome), link],
        contexto: CONTEXTO,
        refId: v.id,
      });
    }

    if (itens.length) {
      const lote = await enfileirarLote(itens);
      resumo.enviadas = lote.queued || 0;
      if (lote.motivo) resumo.erro = lote.motivo;
    }
    return resumo;
  } catch (e) {
    console.error('[visitantePesquisa]', e.message);
    resumo.erro = e.message;
    return resumo;
  }
}

/** Público do item do catálogo (Comunicação → Envios → Automáticos): quem espera pesquisa agora. */
async function publicoPesquisaVisitante() {
  const desde = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const { count } = await supabase.from('vis_visitas')
    .select('id', { count: 'exact', head: true })
    .eq('whatsapp_optin', true).is('pesquisa_enviada_em', null).is('deleted_at', null)
    .gte('created_at', desde);
  return {
    total: count || 0,
    pessoas: [],
    universo: { rotulo: 'visitantes com opt-in aguardando a pesquisa (72h)', qtd: count || 0 },
  };
}

module.exports = { DISPARO_ID, CONTEXTO, TEMPLATE, enviarPesquisasDevidas, publicoPesquisaVisitante };
