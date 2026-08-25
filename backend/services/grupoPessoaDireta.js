// ============================================================================
// CADASTRAR PESSOA DIRETO NO GRUPO · régua ÚNICA (Marcos · 25/08/2026)
//
// Pedido do Pr. Nélio e da Natasha, trazido pelo Marcos: *"abaixo da última
// pessoa do grupo, colocar como se fosse mais uma linha, na foto um botão de
// '+' e no nome escrito Adicionar pessoa. Se o líder clica ele pode preencher o
// formulário de inscrição dali para aquela pessoa já nascer aprovada; se for
// criado ali, ela não passa por whatsapp e confirmação nenhuma, isso é para o
// líder já cadastrar novos visitantes."* E, no fim do mesmo pedido: *"alinhe
// todas essas mudanças com o sistema web."*
//
// ⚠️⚠️ É POR ISSO QUE ISTO É UM SERVIÇO, e não código dentro da rota do app: o
// app e o ERP fazem a MESMA coisa aqui, e duas cópias divergiriam no primeiro
// ajuste — o jeito que este módulo já viu acontecer (a régua de gênero dos
// grupos existe em duas cópias declaradas, publicGrupos × entradaGrupoApp, e o
// arquivo carrega um ponteiro pedindo pra unificar).
//
// ⚠️⚠️ POR QUE NÃO PASSA PELO PEDIDO: `mem_grupo_pedidos` + `aprovarPedidoCore`
// é o caminho de quem se INSCREVE — existe pra o líder DECIDIR, e dispara
// WhatsApp pro líder ("alguém quer entrar") e pra pessoa ("você foi aprovada").
// Aqui quem decide é quem está preenchendo, com a pessoa na frente. Criar
// pedido pra aprovar em seguida mandaria duas mensagens sobre um fato que já
// aconteceu — e o pedido explícito foi "não passa por whatsapp e confirmação
// nenhuma". O vínculo é criado DIRETO, que é o que `POST /grupos/:id/membros`
// (a coordenação adicionando à mão) já fazia desde sempre.
//
// ⚠️⚠️ MAS A IDENTIDADE PASSA PELO CONTRATO DE PORTA, sem exceção: o matcher
// canônico (`acharOuCriarGuardado`) decide se é pessoa nova ou alguém que já
// está na base. Sem ele, esta tela seria uma fábrica de duplicata operada por
// ~89 líderes que não têm nenhuma visão do cadastro. É a MESMA função que o
// formulário público e o "registrar visitante" do WhatsApp usam.
// ============================================================================
const { supabase } = require('../utils/supabase');
const { acharOuCriarGuardado } = require('./membroMatch');
const { registrarConsentimentos } = require('./inscricaoContrato');
const { registrarEventoPedido } = require('./grupoPedidoEventos');
const { validarPessoaDireta } = require('../utils/pessoaDiretaCampos');

/**
 * Cria (ou liga) a pessoa e põe no grupo, já ativa.
 *
 * `autor` = { id, nome } de quem está cadastrando — vai no snapshot do
 * consentimento e no fechamento do pedido pendente. Em 86 dos 102 grupos ativos
 * o líder não tem conta no ERP, então o NOME é guardado, não só o id.
 *
 * `origem` distingue quem chamou ('grupos_app_lider' × 'grupos_erp_equipe') na
 * observação de identidade — é o que permite auditar depois de qual tela o
 * cadastro veio.
 *
 * Devolve `{ ok, http, ... }`. Regra de negócio NUNCA vira exceção: quem chama
 * decide o HTTP a partir do `http` devolvido (mesma lei do `fn_insc_inscrever`).
 */
async function cadastrarPessoaNoGrupo({ grupo, dados, autor = {}, origem = 'grupos_app_lider', ip = null, userAgent = null }) {
  const v = validarPessoaDireta(dados);
  if (!v.ok) return { ok: false, http: 400, error: v.erro, campo: v.campo };

  const achado = await acharOuCriarGuardado({
    cpf: v.cpf, email: v.email, telefone: v.telefone, nome: v.nome,
    dataNascimento: v.dataNascimento, genero: v.genero,
    // ⚠️ `status` é da PESSOA na igreja (visitante até a igreja decidir outra
    // coisa) e NÃO tem relação com a `funcao` dela no grupo. Confundir os dois
    // é o que fazia o roster e a membresia discordarem.
    status: 'visitante',
    origem, origemId: grupo.id,
  });
  const membroId = achado?.membro_id;
  if (!membroId) {
    return { ok: false, http: 502, error: 'Não foi possível registrar a pessoa. Tente de novo.' };
  }

  // Já está no grupo? Idempotente — dois toques não criam dois vínculos.
  const { data: jaAtivo } = await supabase.from('mem_grupo_membros')
    .select('id').eq('grupo_id', grupo.id).eq('membro_id', membroId)
    .is('saiu_em', null).is('deleted_at', null).limit(1).maybeSingle();
  if (jaAtivo) {
    return { ok: true, http: 200, ja_no_grupo: true, membro_id: membroId, nome: v.nome };
  }

  const { data: vinculo, error: eV } = await supabase.from('mem_grupo_membros').insert({
    grupo_id: grupo.id,
    membro_id: membroId,
    funcao: v.funcao,
    entrou_em: new Date().toISOString().slice(0, 10),
  }).select('id').single();
  if (eV) throw eV;

  // ⚠️ Pedido PENDENTE da mesma pessoa neste grupo é FECHADO: ela acabou de
  // entrar, e deixá-lo na Caixa de entrada faria a coordenação decidir sobre um
  // fato já resolvido. Best-effort e condicionado ao status atual — falhar aqui
  // não pode desfazer o vínculo que já existe.
  let pedidoFechado = null;
  try {
    const { data: ped } = await supabase.from('mem_grupo_pedidos')
      .select('id').eq('grupo_id', grupo.id).eq('membro_id', membroId)
      .eq('status', 'pendente').is('deleted_at', null).limit(1).maybeSingle();
    if (ped?.id) {
      const { data: upd } = await supabase.from('mem_grupo_pedidos')
        .update({ status: 'aprovado', decidido_por_nome: `${autor.nome || 'Equipe'} (cadastro direto)` })
        .eq('id', ped.id).eq('status', 'pendente').select('id');
      if (upd && upd.length) {
        pedidoFechado = ped.id;
        await registrarEventoPedido(ped.id, 'aprovado_triagem',
          { origem, vinculo_id: vinculo?.id || null }, autor.nome || null).catch(() => {});
      }
    }
  } catch (e) { console.warn('[grupoPessoaDireta] fechar pedido pendente:', e.message); }

  // ── Consentimento: DECLARAÇÃO DE TERCEIRO, gravada como tal ───────────────
  // ⚠️⚠️ LGPD: quem marca a caixa no formulário público é a PRÓPRIA pessoa; aqui
  // é o líder declarando por ela. Gravar como consentimento do titular seria
  // fabricar prova legal (mesma decisão do link do voluntário, 14/08) — então o
  // texto guardado diz explicitamente que foi declarado por terceiro. E
  // **nenhum opt-in de WhatsApp é ligado**: ninguém consente marketing no lugar
  // de outra pessoa.
  // Best-effort DEPOIS do vínculo: a pessoa já está no grupo, e falha aqui não
  // desfaz nada.
  registrarConsentimentos({
    porta: 'grupos',
    refId: vinculo?.id || null,
    membroId,
    ip,
    userAgent,
    itens: [{
      tipo: 'termos_lgpd',
      aceito: true,
      texto: 'DECLARADO POR TERCEIRO (não é aceite do titular): a pessoa foi cadastrada '
        + `presencialmente por ${autor.nome || 'um líder/equipe'} no grupo "${grupo.nome}" `
        + 'e está ciente de que os dados dela ficam no cadastro da igreja.',
    }],
  }).catch(e => console.warn('[grupoPessoaDireta] consentimento:', e.message));

  return {
    ok: true,
    http: 201,
    membro_id: membroId,
    vinculo_id: vinculo?.id || null,
    nome: v.nome,
    funcao: v.funcao,
    // ⚠️ DECLARADO pra a tela poder dizer "essa pessoa já existia e foi ligada"
    // em vez de deixar quem preencheu achando que criou alguém novo — é isso que
    // faz confiar no matcher em vez de tentar de novo com outro nome, que é o
    // comportamento que fabrica duplicata.
    pessoa_nova: achado?.created === true,
    ligada_por: achado?.matched_by || null,
    pedido_fechado: pedidoFechado,
    sem_cpf: !v.cpf,
  };
}

module.exports = { cadastrarPessoaNoGrupo };
