// ============================================================================
// CADASTRAR PESSOA DIRETO NO GRUPO · régua ÚNICA (Marcos · 25/08/2026)
//
// Pedido do Pr. Nélio e da Natasha, trazido pelo Marcos: *"abaixo da última
// pessoa do grupo, colocar como se fosse mais uma linha, na foto um botão de
// '+' e no nome escrito Adicionar pessoa. Se o líder clica ele pode preencher o
// formulário de inscrição dali para aquela pessoa já nascer aprovada; se for
// criado ali, ela não passa por whatsapp e confirmação nenhuma."* E no fim:
// *"alinhe todas essas mudanças com o sistema web."*
//
// ⚠️⚠️ AJUSTE DELE NO MESMO DIA, e é o que define o formulário: *"queremos
// cadastro completo, os mesmos campos que solicitam a inscrição de grupos."* A
// 1ª versão pedia só nome + telefone (o mínimo do "registrar visitante" do
// WhatsApp) — agora é o CONTRATO INTEIRO, igual ao formulário público:
// nome completo sem abreviação · telefone · nascimento · sexo · CPF com DV ·
// e-mail · endereço fixo-opcional.
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
// ⚠️⚠️ E A IDENTIDADE PASSA PELO CONTRATO DE PORTA, sem exceção: o matcher
// canônico decide se é pessoa nova ou alguém que já está na base. Sem ele, esta
// tela seria uma fábrica de duplicata operada por ~89 líderes que não têm visão
// nenhuma do cadastro. É a MESMA função que o formulário público usa.
// ============================================================================
const { supabase } = require('../utils/supabase');
const {
  validarCamposPadrao, processarIdentidade, registrarConsentimentos, TEXTOS,
} = require('./inscricaoContrato');
const { registrarContatoDaPorta } = require('./membroMatch');
const { registrarEventoPedido } = require('./grupoPedidoEventos');
const { funcaoDoRoster } = require('../utils/pessoaDiretaCampos');

/**
 * Cria (ou liga) a pessoa e põe no grupo, já ativa.
 *
 * `autor` = { id, nome } de quem está cadastrando — vai no snapshot do
 * consentimento e no fechamento do pedido pendente. Em 86 dos 102 grupos ativos
 * o líder não tem conta no ERP, então o NOME é guardado, não só o id.
 *
 * `origem` distingue quem chamou ('grupos_app_lider' × 'grupos_erp_equipe') na
 * observação de identidade — é o que permite auditar de qual tela o cadastro veio.
 *
 * Devolve `{ ok, http, ... }`. Regra de negócio NUNCA vira exceção: quem chama
 * decide o HTTP a partir do `http` devolvido (mesma lei do `fn_insc_inscrever`).
 */
async function cadastrarPessoaNoGrupo({ grupo, dados = {}, autor = {}, origem = 'grupos_app_lider', ip = null, userAgent = null }) {
  // ── 1. Os campos, pelo validador CANÔNICO ────────────────────────────────
  // ⚠️ Os mesmos `exigir*` do formulário público de grupos (todos true): é
  // literalmente o que o Marcos pediu. `endereco` é fixo-opcional (28/07).
  const { erros, valores } = validarCamposPadrao(dados, {
    exigirCpf: true, exigirEmail: true, exigirNascimento: true, exigirSexo: true,
  });
  if (Object.keys(erros).length) {
    const campo = Object.keys(erros)[0];
    return { ok: false, http: 400, error: erros[campo], campo, erros };
  }

  const funcao = funcaoDoRoster(dados);
  // ⚠️ Opt-in é EXPLÍCITO e default false (Contrato de Inscrição · D4). Nunca
  // derivado de "a pessoa deu o telefone".
  const optin = dados.whatsapp_optin === true;

  // ── 2. Identidade pelo matcher canônico ─────────────────────────────────
  // ⚠️ `politica: 'criar'`: a pessoa está na frente do líder e VAI entrar no
  // grupo agora — é o mesmo caso do batismo/next ("o evento VAI acontecer"),
  // não o de uma triagem humana posterior. E com CPF obrigatório, criar é
  // seguro: CPF é a chave FORTE do matcher (régua de 23/08).
  const ident = await processarIdentidade({
    nomeCompleto: valores.nomeCompleto,
    cpf: valores.cpf,
    email: valores.email,
    telefone: valores.telefone,
    dataNascimento: valores.dataNascimento,
    genero: valores.sexo,
    politica: 'criar',
    // `status` é da PESSOA na igreja (visitante até a igreja decidir outra
    // coisa) e NÃO tem relação com a `funcao` dela no grupo. Confundir os dois
    // é o que fazia o roster e a membresia discordarem.
    status: 'visitante',
    origem,
    origemId: grupo.id,
  });
  const membroId = ident?.membroId;
  if (!membroId) {
    return { ok: false, http: 502, error: 'Não foi possível registrar a pessoa. Tente de novo.' };
  }

  // ── 3. Enriquecer o cadastro que já existia · SÓ ONDE VAZIO ─────────────
  // ⚠️ Mesma política do censo e do `processarPessoaPedido`: o que a pessoa
  // acabou de declarar preenche o que falta, e NUNCA sobrescreve o que existe
  // (pode ter sido corrigido pela equipe depois). Best-effort: falhar aqui não
  // pode impedir a pessoa de entrar no grupo.
  try {
    const { data: mem } = await supabase.from('mem_membros')
      .select('genero, data_nascimento, email, telefone, endereco')
      .eq('id', membroId).maybeSingle();
    if (mem) {
      const upd = {};
      if (valores.sexo && !mem.genero) upd.genero = valores.sexo;
      if (valores.dataNascimento && !mem.data_nascimento) upd.data_nascimento = valores.dataNascimento;
      if (valores.email && !mem.email) upd.email = valores.email;
      const telAtual = String(mem.telefone || '').replace(/\D/g, '');
      if (valores.telefone && !telAtual) upd.telefone = valores.telefone;
      if (valores.endereco && !mem.endereco) upd.endereco = valores.endereco;
      if (Object.keys(upd).length) await supabase.from('mem_membros').update(upd).eq('id', membroId);

      // ⚠️ Contato DIVERGENTE do principal não é conflito e NÃO sobrescreve:
      // acumula em `mem_contatos` (Contrato de porta, item 3). Família
      // compartilha telefone e e-mail — é o caso NORMAL, não a exceção.
      const emailDiverge = valores.email && mem.email
        && String(mem.email).trim().toLowerCase() !== valores.email;
      const telDiverge = valores.telefone && telAtual && telAtual !== valores.telefone;
      if (emailDiverge || telDiverge) {
        registrarContatoDaPorta(membroId, {
          telefone: telDiverge ? valores.telefone : null,
          email: emailDiverge ? valores.email : null,
        }, origem);
      }
    }
  } catch (e) { console.warn('[grupoPessoaDireta] enriquecer cadastro:', e.message); }

  // ⚠️ Opt-in SÓ LIGA, NUNCA DESLIGA (política de 05/08): não marcar a caixa é
  // ausência de consentimento NESTA porta, não revogação do que a pessoa
  // autorizou em outra. E preserva o `whatsapp_optin_em` de quem já havia
  // consentido — a data é a PROVA, e sobrescrevê-la apaga desde quando vale.
  if (optin) {
    try {
      await supabase.from('mem_membros')
        .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
        .eq('id', membroId).is('deleted_at', null)
        .or('whatsapp_optin.is.null,whatsapp_optin.eq.false');
    } catch (e) { console.warn('[grupoPessoaDireta] optin:', e.message); }
  }

  // ── 4. Já está no grupo? Idempotente ────────────────────────────────────
  const { data: jaAtivo } = await supabase.from('mem_grupo_membros')
    .select('id').eq('grupo_id', grupo.id).eq('membro_id', membroId)
    .is('saiu_em', null).is('deleted_at', null).limit(1).maybeSingle();
  if (jaAtivo) {
    return { ok: true, http: 200, ja_no_grupo: true, membro_id: membroId, nome: valores.nomeCompleto };
  }

  const { data: vinculo, error: eV } = await supabase.from('mem_grupo_membros').insert({
    grupo_id: grupo.id,
    membro_id: membroId,
    funcao,
    entrou_em: new Date().toISOString().slice(0, 10),
  }).select('id').single();
  if (eV) throw eV;

  // ── 5. Pedido PENDENTE da mesma pessoa neste grupo é FECHADO ────────────
  // Ela acabou de entrar; deixá-lo na Caixa de entrada faria a coordenação
  // decidir sobre um fato já resolvido. Best-effort e condicionado ao status
  // atual — falhar aqui não pode desfazer o vínculo que já existe.
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

  // ── 6. Consentimento: DECLARAÇÃO DE TERCEIRO, gravada como tal ──────────
  // ⚠️⚠️ LGPD: no formulário público quem marca a caixa é a PRÓPRIA pessoa;
  // aqui quem preenche é o líder, por ela. Gravar como aceite do titular seria
  // fabricar prova legal — então o texto guardado É o canônico (a pessoa tem
  // direito a saber exatamente o que foi autorizado) com um PREFIXO dizendo
  // quem declarou. É a mesma decisão do link do voluntário (14/08), onde o
  // snapshot diz "DECLARADO PELO VOLUNTARIO".
  // Best-effort DEPOIS do vínculo: a pessoa já está no grupo, e falha aqui não
  // desfaz nada.
  const prefixo = `DECLARADO PRESENCIALMENTE POR ${autor.nome || 'um líder/equipe'} `
    + `no cadastro do grupo "${grupo.nome}" pelo ${origem === 'grupos_erp_equipe' ? 'sistema' : 'app'} `
    + '(não é aceite digitado pelo próprio titular). Texto apresentado: ';
  registrarConsentimentos({
    porta: 'grupos',
    refId: vinculo?.id || null,
    membroId,
    ip,
    userAgent,
    itens: [
      { tipo: 'termos_lgpd', aceito: true, texto: prefixo + TEXTOS.termos_lgpd },
      // ⚠️ O item de WhatsApp é registrado SEMPRE, com `aceito` refletindo a
      // caixa: gravar só quando é `true` perderia a prova de que a pergunta foi
      // feita e a pessoa disse não.
      { tipo: 'whatsapp', aceito: optin, texto: prefixo + (TEXTOS.whatsapp || 'Autorizo receber mensagens no WhatsApp.') },
    ],
  }).catch(e => console.warn('[grupoPessoaDireta] consentimento:', e.message));

  return {
    ok: true,
    http: 201,
    membro_id: membroId,
    vinculo_id: vinculo?.id || null,
    nome: valores.nomeCompleto,
    funcao,
    // ⚠️ DECLARADO pra a tela poder dizer "essa pessoa já existia e foi ligada"
    // em vez de deixar quem preencheu achando que criou alguém novo — é isso que
    // faz confiar no matcher em vez de tentar de novo com outro nome, que é o
    // comportamento que fabrica duplicata.
    pessoa_nova: ident?.created === true,
    ligada_por: ident?.matchedBy || null,
    pedido_fechado: pedidoFechado,
  };
}

module.exports = { cadastrarPessoaNoGrupo };
