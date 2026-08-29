// ============================================================================
// utils/inscricaoDaPessoa · quais inscrições são DESTA pessoa, no app
//
// Relato do Matheus (28/08/2026): ele abriu o app, estava inscrito no evento, e
// a tela oferecia *se inscrever*. Causa: `/app/eventos` e `/app/eventos/minhas`
// achavam inscrição SÓ por `membro_id`, e inscrição que entrou por uma porta que
// não conseguiu ligar o cadastro nasce com `membro_id` NULL (a porta de eventos
// só CRIA/liga quando tem CPF — regra de 23/08). Sem vínculo, a inscrição não
// existe para o app: nem na lista, nem o QR do comprovante.
//
// ⚠️ A 2ª chave é o CPF, e SÓ ele. Telefone e e-mail são compartilhados em
// família (é a razão de `mem_contatos` existir) — casar por eles entregaria a
// UMA pessoa o comprovante de outra, que é credencial de ENTRADA no evento.
// CPF é a chave FORTE do matcher canônico; aqui ele não autentica ninguém (a
// pessoa já entrou no app), só reencontra o registro dela.
// ============================================================================
const { soDigitos, cpfValido } = require('./cpf');

/**
 * As chaves com que dá pra reencontrar as inscrições desta pessoa.
 * `cpf` é null quando o cadastro não tem CPF ou o CPF guardado é inválido —
 * e aí vale só o vínculo, que é o comportamento de sempre.
 */
function chavesDaPessoa(membro) {
  const membroId = membro && membro.id ? String(membro.id) : null;
  const d = soDigitos(membro && membro.cpf);
  return { membroId, cpf: cpfValido(d) ? d : null };
}

/**
 * Esta inscrição pode ser reivindicada pelo CPF desta pessoa?
 *
 * ⚠️ SÓ quando a inscrição está órfã (`membro_id` nulo) ou já é dela. Inscrição
 * ligada a OUTRO cadastro fica de fora mesmo com o CPF batendo: ali existem dois
 * cadastros para o mesmo CPF, que é caso da fila de duplicidade das Entradas —
 * decisão humana. Se o app resolvesse sozinho e o CPF tivesse sido digitado
 * errado na inscrição, a pessoa veria o comprovante de um estranho.
 */
function inscricaoEhDaPessoa(inscricao, chaves) {
  if (!inscricao || !chaves) return false;
  const dono = inscricao.membro_id ? String(inscricao.membro_id) : null;
  if (chaves.membroId && dono === chaves.membroId) return true;
  if (dono) return false;
  if (!chaves.cpf) return false;
  return soDigitos(inscricao.cpf) === chaves.cpf;
}

/**
 * Junta o que veio pelo vínculo com o que veio pelo CPF, sem repetir.
 * A ordem da 1ª lista é preservada (ela é a consultada com `order by`).
 */
function mesclarInscricoes(porVinculo = [], porCpf = [], chaves = null) {
  const out = [];
  const vistos = new Set();
  for (const i of porVinculo || []) {
    if (!i || !i.id || vistos.has(i.id)) continue;
    vistos.add(i.id); out.push(i);
  }
  for (const i of porCpf || []) {
    if (!i || !i.id || vistos.has(i.id)) continue;
    if (chaves && !inscricaoEhDaPessoa(i, chaves)) continue;
    vistos.add(i.id); out.push(i);
  }
  return out;
}

module.exports = { chavesDaPessoa, inscricaoEhDaPessoa, mesclarInscricoes };
