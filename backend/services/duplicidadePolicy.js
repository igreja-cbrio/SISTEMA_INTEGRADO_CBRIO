// Política canônica do pré-filtro de possíveis duplicidades.
//
// Telefone/e-mail são contatos compartilháveis, não identidade. Só entram
// junto de nome compatível e sem contradição forte. Esta segunda barreira no
// backend protege o produto mesmo durante a janela entre deploy e migration.

function digits(v) { return String(v || '').replace(/\D/g, ''); }
function norm(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function bigrams(v) {
  const out = new Map();
  for (let i = 0; i < v.length - 1; i += 1) out.set(v.slice(i, i + 2), (out.get(v.slice(i, i + 2)) || 0) + 1);
  return out;
}
function similaridadeNome(a, b) {
  const x = norm(a); const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigrams(x); const by = bigrams(y);
  let inter = 0; let tx = 0; let ty = 0;
  for (const n of bx.values()) tx += n;
  for (const [g, n] of by) { ty += n; if (bx.has(g)) inter += Math.min(n, bx.get(g)); }
  return tx + ty ? (2 * inter) / (tx + ty) : 0;
}

function avaliarPossivelDuplicidade(a = {}, b = {}) {
  const cpfA = digits(a.cpf); const cpfB = digits(b.cpf);
  const telA = digits(a.telefone); const telB = digits(b.telefone);
  const emailA = String(a.email || '').trim().toLowerCase();
  const emailB = String(b.email || '').trim().toLowerCase();
  const cpfIgual = cpfA.length === 11 && cpfA === cpfB;
  const cpfConflitante = cpfA.length === 11 && cpfB.length === 11 && cpfA !== cpfB;
  const nascimentoConflitante = !!a.data_nascimento && !!b.data_nascimento && a.data_nascimento !== b.data_nascimento;
  const generoConflitante = !!a.genero && !!b.genero && a.genero !== b.genero;
  const nomeCompativel = similaridadeNome(a.nome, b.nome) >= 0.90;

  if (cpfIgual) return { incluir: true, prioridade: 'alta', evidencias: ['CPF igual'], contradicoes: [] };
  if (cpfConflitante || nascimentoConflitante || generoConflitante) {
    return { incluir: false, prioridade: null, evidencias: [], contradicoes: [
      cpfConflitante ? 'CPFs diferentes' : null,
      nascimentoConflitante ? 'Nascimentos diferentes' : null,
      generoConflitante ? 'Gêneros diferentes' : null,
    ].filter(Boolean) };
  }
  if (!nomeCompativel) return { incluir: false, prioridade: null, evidencias: [], contradicoes: ['Nomes incompatíveis'] };

  const evidencias = [];
  if (a.data_nascimento && a.data_nascimento === b.data_nascimento) evidencias.push('Nome e nascimento compatíveis');
  if (telA.length >= 10 && telA === telB) evidencias.push('Telefone e nome compatíveis');
  if (emailA.length > 3 && emailA === emailB) evidencias.push('E-mail e nome compatíveis');
  if (evidencias.length === 0) evidencias.push('Nomes muito parecidos');
  return { incluir: true, prioridade: evidencias[0].includes('nascimento') ? 'alta' : 'media', evidencias, contradicoes: [] };
}

module.exports = { avaliarPossivelDuplicidade, similaridadeNome };

