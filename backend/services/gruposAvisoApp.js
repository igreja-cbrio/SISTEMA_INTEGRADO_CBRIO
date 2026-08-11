// ============================================================================
// AVISO DE GRUPO NO APP DO MEMBRO · o serviço (11/08/2026)
//
// Autorizado pelo Marcos (item 3 dos 16 apontamentos): *"pode ligar claude"*.
//
// ⚠️ EXISTE PORQUE SÃO CINCO ORIGENS. Um pedido de grupo nasce no formulário
// público, no app, na tela interna do /grupos, no totem e no censo — e cinco
// cópias da mesma lógica é exatamente a doença que este módulo já teve (a régua
// de entrada em grupo duplicada entre `publicGrupos` e o app). Régua PURA em
// `utils/avisoGrupoApp.js`; aqui só se lê o banco e se dispara.
//
// ⚠️⚠️ ISTO NÃO SUBSTITUI NADA. O `notificar()` da coordenação continua igual
// (tabela `notificacoes`, tipo `pedido_grupo`) e o WhatsApp ao líder continua
// igual. Este é um TERCEIRO destino: o sino do app do líder, que estava vazio —
// 459 pedidos desde 01/07 e ZERO avisos de grupo em `app_notificacoes`.
// ============================================================================
const { supabase } = require('../utils/supabase');
const { donosDoGrupoApp } = require('./gruposDestinatarios');
const { notificarApp } = require('./appPush');
const { avisoPedidoNovo } = require('../utils/avisoGrupoApp');

/**
 * Avisa no app do MEMBRO que existe pedido novo no grupo dele.
 *
 * ⚠️ NUNCA LANÇA. É best-effort por desenho: o pedido já está gravado e a pessoa
 * já tem vaga na fila; derrubar a resposta porque um aviso falhou trocaria um
 * problema de comunicação por um de inscrição. Devolve o que aconteceu pra quem
 * chama poder logar a diferença.
 *
 * ⚠️ `sem_dono` é o caso COMUM, não erro: dos 89 líderes de grupos ativos, 15 têm
 * conta no app. Os outros 74 continuam sendo alcançados pelo WhatsApp.
 *
 * @param {{grupoId, pedidoId, grupoNome?, pessoaNome?}} args
 * @returns {Promise<{ok:boolean, motivo?:string, alvos?:number, enviados?:number}>}
 */
async function avisarPedidoNovoNoApp({ grupoId, pedidoId, grupoNome, pessoaNome }) {
  try {
    if (!grupoId || !pedidoId) return { ok: false, motivo: 'sem_referencia' };

    // Nome do grupo: usa o que veio (quem chama quase sempre já tem) e só busca
    // quando falta — uma consulta a menos por pedido no domingo.
    let nome = grupoNome;
    if (!nome) {
      const { data: g } = await supabase
        .from('mem_grupos').select('nome').eq('id', grupoId).maybeSingle();
      nome = g?.nome || null;
    }

    const aviso = avisoPedidoNovo({ pedidoId, grupoId, grupoNome: nome, pessoaNome });
    if (!aviso) return { ok: false, motivo: 'sem_referencia' };

    const alvos = await donosDoGrupoApp(grupoId);
    if (!alvos.length) return { ok: true, motivo: 'sem_dono_com_app', alvos: 0 };

    const r = await notificarApp(alvos, aviso);
    return { ok: true, alvos: alvos.length, enviados: r?.enviados ?? 0, persistidos: r?.persistidos ?? 0 };
  } catch (e) {
    // ⚠️ Log com o grupo pra dar pra achar depois; sem PII no texto.
    console.warn(`[gruposAvisoApp] pedido ${pedidoId} grupo ${grupoId}:`, e.message);
    return { ok: false, motivo: 'erro' };
  }
}

module.exports = { avisarPedidoNovoNoApp };
