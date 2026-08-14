// Política canônica da fila "Vincular famílias".
// O par só chega aqui depois de compartilhar telefone ou endereço+CEP.

const { nomesPodemSerMesmaPessoa, tokensNome } = require('./duplicidadePolicy');

function digits(v) { return String(v || '').replace(/\D/g, ''); }

function sobrenomesEmComum(a, b) {
  const ta = tokensNome(a?.nome).slice(1);
  const tb = new Set(tokensNome(b?.nome).slice(1));
  return [...new Set(ta.filter((t) => t.length >= 3 && tb.has(t)))];
}

// ⚠️ alertaMesmaPessoa · e-mail E nascimento idênticos com CPF diferente é o
// padrão do caso Angela × "José Benício" (14/08): o cadastro tinha o NOME DO
// FILHO com o telefone, e-mail e nascimento da MÃE — não era família, era a
// mesma pessoa. O par caía aqui porque `nomesPodemSerMesmaPessoa` recusa
// "Angela" × "José" e o CPF diferia.
//
// ⚠️⚠️ Mas isto SINALIZA, não decide — e é decisão consciente. **Gêmeos têm
// exatamente a mesma assinatura de sinais** (mesmo e-mail da casa, mesmo
// telefone, mesmo nascimento, CPFs diferentes). Mandar pra 'duplicidade' faria
// a `duplicidadePolicy` vetar por "Nomes incompatíveis" e o par sumiria das DUAS
// filas — trocaríamos um par confuso por um par invisível. Então o alerta vai
// junto com a sugestão de família e quem decide é gente.
function alertaMesmaPessoa(a = {}, b = {}) {
  const emA = String(a.email || '').trim().toLowerCase();
  const emB = String(b.email || '').trim().toLowerCase();
  const emailIgual = emA.length > 3 && emA === emB;
  const nascIgual = !!a.data_nascimento && a.data_nascimento === b.data_nascimento;
  if (!emailIgual || !nascIgual) return null;
  return 'E-mail e nascimento IDÊNTICOS: confira se não é a mesma pessoa (ou gêmeos)';
}

function avaliarRelacaoFamiliar(a = {}, b = {}, { mesmoTelefone = false, mesmoEndereco = false } = {}) {
  const cpfA = digits(a.cpf);
  const cpfB = digits(b.cpf);
  const cpfIgual = cpfA.length === 11 && cpfA === cpfB;
  if (cpfIgual || nomesPodemSerMesmaPessoa(a.nome, b.nome)) {
    return { destino: 'duplicidade', sobrenomes: [], alerta: null };
  }

  const sobrenomes = sobrenomesEmComum(a, b);
  if (mesmoEndereco || (mesmoTelefone && sobrenomes.length > 0)) {
    return { destino: 'familia', sobrenomes, alerta: alertaMesmaPessoa(a, b) };
  }
  return { destino: 'ignorar', sobrenomes, alerta: null };
}

module.exports = { avaliarRelacaoFamiliar, sobrenomesEmComum, alertaMesmaPessoa };
