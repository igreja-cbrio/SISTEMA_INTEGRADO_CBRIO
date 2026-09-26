// ════════════════════════════════════════════════════════════════════════════
//  "Cadê o link do meu grupo?" → AVISAR A LIDERANÇA — régua PURA (26/09/2026)
//
//  Pedido do Matheus (item 4): *"a resposta dizendo que a líder vai mandar [o
//  link] é ótimo, mas preciso que o líder seja avisado que tal pessoa está
//  solicitando o link do grupo (podemos criar um template na Meta se precisar)"*.
//
//  Em `utils/` (sem Supabase, sem rede, sem relógio próprio) porque é aqui que
//  se decide (a) DE QUAL grupo a pessoa está falando, (b) QUANDO já avisamos
//  hoje e (c) o que a resposta pode AFIRMAR — e as três coisas precisam estar
//  no gate. Quem lê o banco e envia é `services/pedidoLinkGrupo.js`.
//
//  ⚠️⚠️ O QUE ESTE GANCHO NUNCA FAZ: mandar o link da sala. `mem_grupo_link` é
//  CREDENCIAL DE ENTRADA (migration 20260925180000), e a identidade da conversa
//  de WhatsApp é FRACA — `wa_conversas.membro_id` nasce por sufixo de 8 dígitos
//  numa base com 744 telefones compartilhados por família. Quem entrega o link é
//  a liderança, que sabe quem é a pessoa. Decisão do conselho (26/09).
// ════════════════════════════════════════════════════════════════════════════

const { assuntoDaMensagem } = require('./assuntoGrupoConversa');
const { diaBrt } = require('./whatsappModulo');
const { paraParametro, telefoneLegivel } = require('./suporteApp');
const { primeiroNomeDe, montarRespostaLink } = require('./respostaGrupoAgenda');

/** Id do interruptor (catálogo `comunicacaoAutomaticas`) — a tríade do teste. */
const DISPARO_ID = 'grupos_link_pedido';
/** Contexto gravado na fila `whatsapp_envios` (rótulo em `utils/whatsappOrigem`). */
const CONTEXTO = 'grupos.link_pedido_lider';
/**
 * Nome do template na Meta — FIXO no código, env só como override (mesma
 * decisão do `novo_convertido_boas_vindas`: "env vazia" não é bloqueio).
 * UTILITY · pt_BR · 4 variáveis no corpo · sem botões.
 */
const TEMPLATE_PADRAO = 'grupos_link_pedido_lider';

/** O único valor de canal que conta como "o aviso saiu". */
const CANAL_SAIU = 'enviado';

/** A mensagem está pedindo o link da sala? (a régua de 31/08, não uma 2ª). */
function pedeLink(texto) {
  return assuntoDaMensagem(texto) === 'link';
}

/**
 * De qual grupo é o link que a pessoa está pedindo.
 *
 * @param vinculos resultado de `services/sugestaoGrupoAgenda.grupoDaConversa`
 *   (`{ grupo, motivo }` — o vínculo ATIVO, já com o desempate pelo disparo).
 * @param pedidos  grupos (objetos de `mem_grupos`, ATIVOS) dos pedidos
 *   `pendente`/`aprovado` da pessoa em `mem_grupo_pedidos`.
 *
 * ⚠️⚠️ O GAP que o conselho apontou: quem acabou de se inscrever tem PEDIDO,
 * não vínculo — e é justamente essa pessoa que pergunta "cadê o link?". Sem
 * olhar os pedidos o gancho calaria no caso mais comum.
 *
 * ⚠️ Vínculo vence pedido: o vínculo é o fato; o pedido é intenção.
 * ⚠️ Ambiguidade devolve `null`, nunca "o primeiro": avisar a liderança do
 * grupo errado faz uma líder mandar link de sala a quem não é do grupo dela.
 * ⚠️ `erro` na leitura do vínculo NÃO cai para os pedidos — não dá pra afirmar
 * que a pessoa não tem vínculo quando a consulta falhou.
 */
function escolherGrupoParaLink({ vinculos, pedidos } = {}) {
  const v = vinculos || {};
  if (v.grupo) return { grupo: v.grupo, origem: 'vinculo' };
  if (v.motivo === 'ambiguo') return { grupo: null, motivo: 'ambiguo' };
  if (v.motivo === 'erro') return { grupo: null, motivo: 'erro' };

  const porId = new Map();
  for (const g of Array.isArray(pedidos) ? pedidos : []) {
    if (!g || !g.id || g.ativo === false || g.deleted_at) continue;
    porId.set(g.id, g);
  }
  if (porId.size === 1) return { grupo: [...porId.values()][0], origem: 'pedido' };
  if (porId.size > 1) return { grupo: null, motivo: 'ambiguo' };
  return { grupo: null, motivo: v.motivo === 'sem_cadastro' ? 'sem_cadastro' : 'sem_grupo' };
}

/**
 * O DIA (BRT) que compõe a chave de dedup `(conversa, grupo, dia_brt)`.
 *
 * ⚠️ BRT, nunca `toISOString().slice(0,10)`: das 21h do Rio em diante o dia UTC
 * já virou, e quem perguntasse às 20h e de novo às 22h (culto de domingo à
 * noite) avisaria a líder DUAS vezes no mesmo dia. Reusa `diaBrt`, a régua da
 * casa, em vez de uma 3ª conta de fuso.
 */
function chaveDoDia(agora = new Date()) {
  const d = agora instanceof Date ? agora : new Date(agora);
  if (Number.isNaN(d.getTime())) return diaBrt(new Date());
  return diaBrt(d);
}

/**
 * Algum canal de aviso à liderança SAIU de fato?
 *
 * ⚠️⚠️ É ISTO que autoriza a resposta a dizer "já avisamos a liderança".
 * `na_fila` NÃO conta (kill-switch ligado: a mensagem espera e pode nunca sair),
 * `sem_destinatario` NÃO conta, `template_nao_aprovado` NÃO conta.
 */
function algumCanalSaiu(canais) {
  if (!canais || typeof canais !== 'object') return false;
  return Object.values(canais).some((v) => v === CANAL_SAIU);
}

/**
 * Os 4 parâmetros do template `grupos_link_pedido_lider`:
 *   {{1}} 1º nome do líder · {{2}} nome de quem pediu · {{3}} grupo ·
 *   {{4}} telefone de quem pediu
 *
 * ⚠️⚠️ Nome e telefone vêm DA CONVERSA (`wa_conversas`), nunca do cadastro: a
 * identidade da conversa é fraca, e o número que ESCREVEU é o único fato
 * garantido — é pra ele que a líder precisa mandar o link.
 * ⚠️ A Meta recusa parâmetro VAZIO e parâmetro com quebra de linha (132000):
 * trim, `paraParametro` e fallback em todos.
 */
function paramsTemplateLider({ liderNome, pessoaNome, grupoNome, pessoaTelefone } = {}) {
  return [
    paraParametro(primeiroNomeDe(liderNome), 60) || 'Líder',
    paraParametro(pessoaNome, 80) || 'Uma pessoa do grupo',
    paraParametro(grupoNome, 120) || 'seu grupo',
    telefoneLegivel(pessoaTelefone) || 'sem telefone',
  ];
}

/**
 * Título e texto do aviso interno (sino do ERP / app do staff / app do membro).
 *
 * ⚠️ O telefone VAI no texto: o aviso é dirigido SÓ a quem responde pelo grupo
 * (`donosDoGrupo`/`donosDoGrupoApp`), e sem o número o aviso não é acionável —
 * a líder não teria para onde mandar o link.
 */
function textoAvisoLider({ pessoaNome, pessoaTelefone, grupoNome } = {}) {
  const quem = paraParametro(pessoaNome, 80) || 'Uma pessoa';
  const tel = telefoneLegivel(pessoaTelefone);
  const grupo = paraParametro(grupoNome, 120) || 'seu grupo';
  return {
    titulo: `Pedido do link · ${grupo}`,
    mensagem: `${quem}${tel ? `, ${tel},` : ''} pediu pelo WhatsApp da CBRio o link do encontro do grupo "${grupo}". `
      + 'Se puder, mande o link direto para esse número.',
  };
}

/**
 * O texto que a PESSOA recebe.
 *
 * ⚠️⚠️ `liderAvisada` sai de `algumCanalSaiu(canais)` AQUI DENTRO — o chamador
 * não escolhe. É a guarda do mutante "já avisamos sem ter avisado".
 */
function respostaDoPedidoLink({ conversaNome, grupo, liderNome, liderTelefone, canais, repetido = false } = {}) {
  return montarRespostaLink({
    nome: conversaNome || '',
    grupoNome: grupo?.nome || '',
    online: true,
    local: '',
    liderNome: liderNome || '',
    liderTelefone: liderTelefone || '',
    // ⚠️ Sem data: resposta automática NÃO é lugar de arriscar data calculada
    // (a lição do grupo quinzenal da Jessica, 26/08).
    proximaISO: null,
    horario: '',
    liderAvisada: algumCanalSaiu(canais),
    pedidoRepetido: repetido === true,
  });
}

module.exports = {
  DISPARO_ID, CONTEXTO, TEMPLATE_PADRAO, CANAL_SAIU,
  pedeLink, escolherGrupoParaLink, chaveDoDia, algumCanalSaiu,
  paramsTemplateLider, textoAvisoLider, respostaDoPedidoLink,
};
