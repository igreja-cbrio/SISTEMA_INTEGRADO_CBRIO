/**
 * De QUEM é o CPF do responsável (16/09/2026).
 *
 * O formulário de apresentação pede o nome do pai E o da mãe, mas UM CPF só.
 * Até aqui ninguém dizia de qual dos dois era aquele CPF, e o código assumia a
 * mãe (`nome_mae || nome_pai`) na hora de procurar a pessoa no cadastro.
 *
 * ⚠️⚠️ MEDIDO EM 16/09: das 9 inscrições em que dá pra saber o dono, **3 eram do
 * PAI** (Robson Ribeiro, 2 filhos, e uma de teste). O vínculo não saiu errado
 * porque o matcher prioriza CPF sobre nome — mas o par que chegava nele era
 * FALSO: o CPF de um com o nome do outro. No dia em que o CPF não estiver no
 * cadastro, é o nome que decide, e ele decidiria pela pessoa errada.
 *
 * Aqui mora a régua pura: quem é o dono, que nome mandar junto do CPF, e como
 * os CPFs se distribuem entre pai e mãe.
 */

const DONOS = ['pai', 'mae'];

/**
 * De quem é o CPF principal.
 *
 * ⚠️ Com um responsável só, NÃO se pergunta: já se sabe. Perguntar o óbvio é
 * campo a mais numa porta que a família preenche no celular.
 *
 * @param {object} p
 * @param {string|null} p.informado  o que a pessoa escolheu ('pai' | 'mae')
 * @param {boolean} p.temPai
 * @param {boolean} p.temMae
 * @returns {'pai'|'mae'} — com os dois nomes e nada informado, cai em 'mae',
 *   que é o comportamento histórico (linhas antigas seguem legíveis do mesmo
 *   jeito).
 */
function donoDoCpf({ informado, temPai, temMae }) {
  if (temPai && !temMae) return 'pai';
  if (temMae && !temPai) return 'mae';
  const i = String(informado || '').toLowerCase();
  return DONOS.includes(i) ? i : 'mae';
}

/**
 * O nome que vai junto do CPF pro funil de identidade.
 * ⚠️ É o nome do DONO do CPF — o par tem de ser da mesma pessoa.
 */
function nomeDoDonoDoCpf(dono, nomePai, nomeMae) {
  return dono === 'pai' ? (nomePai || nomeMae || null) : (nomeMae || nomePai || null);
}

/**
 * Distribui o CPF principal e o opcional do outro responsável.
 *
 * ⚠️ O segundo CPF é do OUTRO — nunca do mesmo. CPF repetido nos dois campos é
 * erro de digitação, e gravar o mesmo número como sendo de duas pessoas cria
 * uma identidade falsa; nesse caso o segundo é descartado.
 *
 * @returns {{ cpf_pai: string|null, cpf_mae: string|null }}
 */
function distribuirCpfs({ dono, cpf, cpfOutro }) {
  const principal = cpf || null;
  let outro = cpfOutro || null;
  if (outro && principal && outro === principal) outro = null;
  return dono === 'pai'
    ? { cpf_pai: principal, cpf_mae: outro }
    : { cpf_mae: principal, cpf_pai: outro };
}

module.exports = { DONOS, donoDoCpf, nomeDoDonoDoCpf, distribuirCpfs };
