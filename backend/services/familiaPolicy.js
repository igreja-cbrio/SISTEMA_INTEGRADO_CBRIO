// Política canônica da fila "Vincular famílias".
// O par só chega aqui depois de compartilhar telefone ou endereço+CEP.

const { nomesPodemSerMesmaPessoa, tokensNome } = require('./duplicidadePolicy');

function digits(v) { return String(v || '').replace(/\D/g, ''); }

function sobrenomesEmComum(a, b) {
  const ta = tokensNome(a?.nome).slice(1);
  const tb = new Set(tokensNome(b?.nome).slice(1));
  return [...new Set(ta.filter((t) => t.length >= 3 && tb.has(t)))];
}

function avaliarRelacaoFamiliar(a = {}, b = {}, { mesmoTelefone = false, mesmoEndereco = false } = {}) {
  const cpfA = digits(a.cpf);
  const cpfB = digits(b.cpf);
  const cpfIgual = cpfA.length === 11 && cpfA === cpfB;
  if (cpfIgual || nomesPodemSerMesmaPessoa(a.nome, b.nome)) {
    return { destino: 'duplicidade', sobrenomes: [] };
  }

  const sobrenomes = sobrenomesEmComum(a, b);
  if (mesmoEndereco || (mesmoTelefone && sobrenomes.length > 0)) {
    return { destino: 'familia', sobrenomes };
  }
  return { destino: 'ignorar', sobrenomes };
}

module.exports = { avaliarRelacaoFamiliar, sobrenomesEmComum };
