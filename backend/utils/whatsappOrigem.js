// ════════════════════════════════════════════════════════════════════════════
//  "De qual disparo essa pessoa veio?" — régua PURA
//
//  Pedido do Matheus (12/08/2026), na aba Conversas: *"eu preciso saber nessa
//  tela de mensagem de qual tipo de disparo ela veio, se foi disparo de grupos,
//  de next, batismo e etc."* Com o bot de triagem desligado, quem responde é
//  gente — e responder sem saber o que a igreja mandou antes é responder no
//  escuro. Medido em 12/08: **88 das 110 conversas (80%)** têm um disparo que as
//  explica.
//
//  Vive em utils/ (sem Supabase, sem rede, sem relógio) porque é aqui que se
//  decide o que a tela AFIRMA sobre a origem da conversa, e isso tem que ser
//  testável no gate de deploy. Quem lê o banco é services/whatsappOrigemConversa.
// ════════════════════════════════════════════════════════════════════════════
const { moduloDoContexto } = require('./whatsappModulo');

// ⚠️ O rótulo é o que a pessoa da equipe LÊ. Sai daqui, não do `contexto` cru:
// "grupos.pedido_novo_lider" na tela não diz a quem a mensagem foi nem o que
// ela pedia. Chave mais específica primeiro (o `for` para no 1º match).
// ⚠️ Contextos conferidos no banco em 12/08 (últimos 45 dias): os 8 primeiros
// abaixo cobrem 100% do volume real; o resto está aqui porque o serviço que os
// dispara existe e pode voltar a rodar a qualquer momento.
const ROTULOS = [
  ['grupos.pedido_novo_lider', 'Grupos · aviso ao líder de um novo pedido'],
  ['grupos.inscricao_confirmada', 'Grupos · confirmação de inscrição'],
  ['grupos.pedido_aprovado', 'Grupos · pedido aprovado pelo líder'],
  ['grupos.confira_lista', 'Grupos · confira a lista do seu grupo'],
  ['grupos.frequencia_mes', 'Grupos · chamada do mês'],
  ['grupos.renovacao_temporada', 'Grupos · renovação de temporada'],
  ['grupos.sugestao', 'Grupos · sugestão de outro grupo'],
  ['membresia.censo_atualizacao', 'Censo · atualização cadastral'],
  ['censo', 'Censo · atualização cadastral'],
  ['inscricoes.confirmacao', 'Inscrições · confirmação de inscrição em evento'],
  ['app.inscricao_confirmada', 'Inscrição pelo app · confirmação'],
  ['app.pedido_atualizado', 'Solicitações · sua solicitação mudou de status'],
  ['app.aniversario', 'Aniversário · parabéns (voluntariado)'],
  ['app.batismo_lembrete', 'Batismo · lembrete da cerimônia'],
  ['app.escala_voluntario', 'Voluntariado · você foi escalado'],
  ['app.kids_vinculo', 'Kids · resultado do pedido de vínculo'],
  ['app.kids_precheckin', 'Kids · pré-check-in'],
  ['app.doacao_recebida', 'Generosidade · doação recebida'],
  ['app.familia_convite_aceito', 'Família · convite aceito'],
  ['next', 'NEXT · convite'],
  ['voluntariado', 'Voluntariado'],
  ['batismo', 'Batismo'],
];

/**
 * `contexto` → o que dizer na tela.
 *
 * ⚠️ Contexto desconhecido NÃO é escondido nem inventado: devolve o próprio
 * contexto como rótulo, marcado com `conhecido:false`. Esconder faria a tela
 * dizer "sem disparo" para quem RECEBEU um — o erro mais caro aqui, porque é
 * exatamente essa pessoa que respondeu sem contexto na tela. E quem cria
 * disparo novo tem uma linha pra acrescentar.
 */
function rotuloDoDisparo(contexto) {
  const c = String(contexto || '').trim().toLowerCase();
  const { modulo, link } = moduloDoContexto(c);
  if (!c) return { rotulo: 'Disparo sem contexto', modulo, link, conhecido: false };
  for (const [chave, rotulo] of ROTULOS) {
    if (c === chave || c.startsWith(`${chave}.`)) return { rotulo, modulo, link, conhecido: true };
  }
  return { rotulo: c, modulo, link, conhecido: false };
}

/**
 * Os 8 últimos dígitos — SÓ o filtro barato do banco (coluna gerada `tel8`).
 *
 * ⚠️⚠️ ELE NÃO DECIDE NADA. Oito dígitos colidem: `21 98668-7406` e
 * `21 88668-7406` são pessoas diferentes e têm o mesmo tail. Quem decide se é a
 * mesma pessoa é **`mesmoNumeroBR`** (`services/waInbox.js`), que já existia,
 * é pura e tem teste no gate (`waInboxMesmoNumero.test.ts`) — ela nasceu do
 * mesmo problema, o nono dígito criando DUAS conversas pra mesma pessoa.
 * ⚠️ Escrevi uma segunda régua aqui e apaguei: duas verdades sobre "é a mesma
 * pessoa?" divergiriam, e o inbox e a origem do disparo passariam a discordar
 * sobre quem é quem.
 * ⚠️ Número curto demais devolve `null` em vez de um pedaço — casar por 4
 * dígitos ligaria conversas de gente diferente.
 */
function chaveTelefone(telefone) {
  const d = String(telefone || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
}

module.exports = { rotuloDoDisparo, chaveTelefone, ROTULOS };
