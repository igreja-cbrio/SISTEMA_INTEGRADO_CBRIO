// ============================================================================
// SAÚDE / INCLUSÃO DA CRIANÇA · a régua ÚNICA das duas portas (11/08/2026)
//
// Apontamento do Marcos: *"a criação de uma criança no Kids gera mais campos do
// que temos na apresentação de bebê, exemplo dos campos de alergia, deficiência
// física... Eu só não quero ter crianças ou pessoas com dados faltando porque em
// um lugar pede uma coisa e no outro pede outra."*
//
// Ele estava certo, e a medição de 11/08 mostra exatamente onde. Recorte justo =
// crianças criadas **desde 28/07**, quando o formulário do Kids ganhou os campos
// (a base inteira é 4.458 crianças com 2% respondidas, mas isso é o import
// histórico do Planning Center, não porta):
//   · pela porta do KIDS ......... 34 crianças, **100%** com saúde respondida
//   · pela APRESENTAÇÃO .......... 2 crianças, **0%** ← o buraco
//
// ⚠️⚠️ E O DANO É CONCRETO, NÃO TEÓRICO: `tem_espectro` e `tem_limitacao_fisica`
// são a **régua do PAGER** no servidor (`totemKids.js` · pager obrigatório para
// <48 meses OU espectro OU limitação física), e em 03/08 a Mari tornou o pager de
// inclusão OBRIGATÓRIO — o diálogo do totem não fecha sem número. Criança com
// autismo que entra pela apresentação chega no Kids com o campo NULO e **não cai
// na regra**, a menos que o voluntário perceba e edite a ficha na hora.
//
// ⚠️ SÃO 3 PERGUNTAS, NÃO 8. `kids_criancas` tem 8 campos de saúde
// (`observacoes_medicas`, `necessidades_especiais` e os 3 pares sim/qual). As 3
// que entram aqui são as que MOVEM OPERAÇÃO no domingo: alergia (o voluntário
// precisa saber antes do lanche), espectro e limitação física (o pager). As
// outras duas são texto livre que a equipe preenche no atendimento — pedir 8
// campos numa tela de autoatendimento troca dado bom por formulário abandonado.
// ============================================================================

/** As 3 perguntas, na ordem em que a tela deve mostrá-las. */
const PERGUNTAS_SAUDE = Object.freeze([
  Object.freeze({
    campo: 'tem_alergia',
    detalhe: 'alergia_qual',
    titulo: 'Tem alergia?',
    ajuda: 'Alimento, medicamento, picada — o que a equipe precisa saber antes do lanche.',
  }),
  Object.freeze({
    campo: 'tem_espectro',
    detalhe: 'espectro_qual',
    titulo: 'É autista (TEA)?',
    ajuda: 'A gente prepara a sala e entrega o pager pra família.',
  }),
  Object.freeze({
    campo: 'tem_limitacao_fisica',
    detalhe: 'limitacao_fisica_qual',
    titulo: 'Tem alguma limitação física?',
    ajuda: 'Pra receber a criança do jeito certo — e a família também leva pager.',
  }),
]);

/**
 * Normaliza a resposta das 3 perguntas para o formato de `kids_criancas`.
 *
 * ⚠️⚠️ `null` E `false` SÃO COISAS DIFERENTES, e é disso que o buraco é feito.
 * `null` = **ninguém perguntou** (o estado de 98% da base, vindo do import);
 * `false` = a família **respondeu que não**. Gravar `false` onde não se perguntou
 * transformaria "não sei" em "não tem" — e a régua do pager passaria a excluir
 * ativamente uma criança sobre a qual ninguém sabe nada. Por isso resposta
 * ausente devolve `undefined` (a chave nem entra no insert) e não `false`.
 *
 * ⚠️ O texto do detalhe só vale quando a resposta é SIM: "alergia_qual"
 * preenchido com `tem_alergia = false` é contradição que alguém vai ler no
 * domingo e não saber de qual lado ficar.
 */
function normalizarSaude(body) {
  const out = {};
  for (const p of PERGUNTAS_SAUDE) {
    const v = body?.[p.campo];
    if (v !== true && v !== false) continue;       // não perguntado ⇒ não grava
    out[p.campo] = v;
    if (v === true) {
      const txt = String(body?.[p.detalhe] ?? '').trim();
      if (txt) out[p.detalhe] = txt.slice(0, 500);
    } else {
      out[p.detalhe] = null;                       // "não" limpa o detalhe
    }
  }
  return out;
}

/**
 * A criança precisa de pager por INCLUSÃO?
 *
 * ⚠️ Espelho da régua do servidor do totem, e existe pra a tela poder AVISAR a
 * família ("vocês vão receber um pager") no momento em que ela responde sim — não
 * pra decidir nada. Quem decide o pager é o totem, no check-in.
 * ⚠️ `null` (não perguntado) NÃO é `true`: não inventamos inclusão.
 */
function precisaPagerPorInclusao(saude) {
  return saude?.tem_espectro === true || saude?.tem_limitacao_fisica === true;
}

module.exports = { PERGUNTAS_SAUDE, normalizarSaude, precisaPagerPorInclusao };
