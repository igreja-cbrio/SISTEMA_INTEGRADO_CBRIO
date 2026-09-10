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
const { avisoPedidoNovo, avisoSaida } = require('../utils/avisoGrupoApp');
// varredura 2026-09: G02 rede de segurança do pedido órfão — o sino do ERP (tabela `notificacoes`) é o ÚNICO destino que sobra quando o grupo não tem líder nem supervisor.
const { notificar } = require('./notificar');

/**
 * varredura 2026-09: G02 — pedido em grupo SEM LÍDER E SEM SUPERVISOR não tinha
 * para onde ir e sumia em silêncio: sem dono não há aviso no app, não há linha em
 * `notificacoes` e o WhatsApp com o link de aprovação nem chega a ser montado.
 * Medido: 4 pessoas esperando até 28 dias no JIU-JITSU e ZERO avisos a ninguém.
 *
 * ⚠️ NÃO é o caso comum de `sem_dono_com_app` (74 dos 89 líderes não têm o app e
 * seguem recebendo o WhatsApp — escalar esses seria voltar ao fan-out de 10.914
 * notificações que a coordenação desligou). Aqui é o caso em que NÃO EXISTE dono.
 *
 * ⚠️ `chaveDedup` por GRUPO, não por pedido: 10 pedidos órfãos no mesmo grupo são
 * o mesmo problema (falta um líder), então o 2º ao 10º são PULADOS.
 * ⚠️⚠️ MAS ISSO NÃO É "UMA LINHA SÓ". A dedup de `notificar()` é por USUÁRIO +
 * chave + não-lida (notificar.js · `processarUm`): `grupos` não tem lista em
 * `notificacao_regras`, então o fallback é admin/diretor ativo e não-robô (~16
 * pessoas) e o PRIMEIRO pedido órfão escreve UMA LINHA PARA CADA UM. O que a
 * chave evita é a REPETIÇÃO — e só enquanto a pessoa não lê a dela: lida a linha,
 * o próximo pedido órfão daquele grupo escreve de novo pra ela.
 * ⚠️ Medido: hoje isso alcança UM grupo (JIU-JITSU 98a2571b é o único dos 109 que
 * aceitam inscrição sem líder), então o alcance real é ~16 linhas, uma vez.
 *
 * ⚠️ Sem PII: quem abre o sino resolve o grupo, não a pessoa.
 * ⚠️ NUNCA LANÇA — o pedido já está gravado.
 */
async function escalarPedidoOrfao({ grupoId, grupoNome }) {
  try {
    const enviados = await notificar({
      modulo: 'grupos',
      tipo: 'grupo_sem_lider',
      titulo: `Grupo sem líder recebendo inscrição: ${grupoNome || 'grupo'}`,
      mensagem: 'Chegou pedido novo e este grupo não tem líder nem supervisor — ninguém foi avisado e não há link de aprovação. Defina o líder ou pause as inscrições na tela de Grupos.',
      link: '/grupos',
      severidade: 'aviso',
      chaveDedup: `grupo_sem_lider_${grupoId}`,
    });
    return enviados > 0;
  } catch (e) {
    console.warn(`[gruposAvisoApp] escalada do grupo ${grupoId} falhou:`, e.message);
    return false;
  }
}

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

    // varredura 2026-09: G02 a consulta ao grupo deixou de ser condicional — além do nome
    // (que quem chama quase sempre já traz) é preciso saber SE existe dono, e é o mesmo
    // round-trip que já acontecia quando o nome faltava.
    const { data: g } = await supabase
      .from('mem_grupos').select('nome, lider_id, supervisor_id').eq('id', grupoId).maybeSingle();
    const nome = grupoNome || g?.nome || null;

    const aviso = avisoPedidoNovo({ pedidoId, grupoId, grupoNome: nome, pessoaNome });
    if (!aviso) return { ok: false, motivo: 'sem_referencia' };

    // varredura 2026-09: G02 grupo sem líder E sem supervisor — não existe dono a avisar em
    // canal nenhum (nem app, nem sino, nem WhatsApp), então o pedido sobe pra coordenação.
    if (!g || (!g.lider_id && !g.supervisor_id)) {
      const escalado = await escalarPedidoOrfao({ grupoId, grupoNome: nome });
      return { ok: true, motivo: 'grupo_sem_dono', alvos: 0, escalado };
    }

    // ⚠️ NÃO escalar pro supervisor quando o líder existe e só não tem o app: isso é o caso
    // NORMAL (74 dos 89 líderes) e o supervisor NÃO está sem aviso — o mesmo caller dispara
    // em seguida o sino/WhatsApp por `donosDoGrupo`, que JÁ inclui `supervisor_id`
    // (gruposDestinatarios.js:60). Escalar aqui não tiraria ninguém do escuro, só entregaria
    // ao supervisor um push a cada pedido novo, em dobro com o que ele já recebe.
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


/**
 * Avisa no app do LÍDER que alguém saiu do grupo.
 * ⚠️ NUNCA LANÇA — a saída já está registrada; aviso que falha não pode desfazê-la.
 */
async function avisarSaidaNoApp({ grupoId, grupoNome, pessoaNome, dia }) {
  try {
    if (!grupoId) return { ok: false, motivo: 'sem_referencia' };
    let nome = grupoNome;
    if (!nome) {
      const { data: g } = await supabase
        .from('mem_grupos').select('nome').eq('id', grupoId).maybeSingle();
      nome = g?.nome || null;
    }
    const aviso = avisoSaida({ grupoId, grupoNome: nome, pessoaNome, dia });
    if (!aviso) return { ok: false, motivo: 'sem_referencia' };
    const alvos = await donosDoGrupoApp(grupoId);
    if (!alvos.length) return { ok: true, motivo: 'sem_dono_com_app', alvos: 0 };
    const r = await notificarApp(alvos, aviso);
    return { ok: true, alvos: alvos.length, enviados: r?.enviados ?? 0 };
  } catch (e) {
    console.warn(`[gruposAvisoApp] saida grupo ${grupoId}:`, e.message);
    return { ok: false, motivo: 'erro' };
  }
}

module.exports = { avisarPedidoNovoNoApp, avisarSaidaNoApp };
