// Política canônica do pré-filtro de possíveis duplicidades.
//
// Telefone/e-mail são contatos compartilháveis, não identidade. Só entram
// junto de nome compatível e sem contradição forte. Esta segunda barreira no
// backend protege o produto mesmo durante a janela entre deploy e migration.

function digits(v) { return String(v || '').replace(/\D/g, ''); }
function cpfValido(v) {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calcular = (tamanho, peso) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(d[i]) * (peso - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calcular(9, 10) === Number(d[9]) && calcular(10, 11) === Number(d[10]);
}
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

const PARTICULAS_NOME = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
function tokensNome(v) {
  return norm(v).split(' ').filter((t) => t && !PARTICULAS_NOME.has(t));
}

// Nomes de uma mesma pessoa frequentemente chegam com quantidades diferentes
// de sobrenomes. Dice global pune "Ana Carolina Vieira" quando comparado ao
// nome civil completo, então reconhecemos também a versão curta contida na
// longa. Primeiro nome igual + pelo menos 75% dos tokens do nome menor evita
// confundir parentes que apenas compartilham um sobrenome.
function nomesPodemSerMesmaPessoa(a, b) {
  if (similaridadeNome(a, b) >= 0.90) return true;
  const ta = tokensNome(a);
  const tb = tokensNome(b);
  if (ta.length < 2 || tb.length < 2 || ta[0] !== tb[0]) return false;
  const menor = ta.length <= tb.length ? ta : tb;
  const maior = new Set(ta.length <= tb.length ? tb : ta);
  const comuns = menor.filter((t) => maior.has(t)).length;
  return comuns >= 2 && comuns / menor.length >= 0.75;
}

// ⚠️ Stub de LOGIN não é "duas pessoas com o mesmo e-mail".
//
// O gatilho de auth.users cria um cadastro só com o e-mail da conta e o nome que
// o provedor OAuth mandou — e o provedor costuma mandar o nome ABREVIADO
// ("Victória Lannes" para "Maria Victória Lannes Campos"). Aí
// `nomesPodemSerMesmaPessoa` recusa, porque exige o mesmo PRIMEIRO nome, e o par
// fica INVISÍVEL na fila: foi o caso real de 02/08, em que a pessoa preencheu o
// formulário público corretamente às 11:49 e ficou duplicada.
//
// Aqui o e-mail não é o endereço compartilhado da família — é a credencial que
// AUTENTICOU. Mesmo assim exigimos que os tokens do nome menor estejam TODOS
// contidos no maior (100%, não 75%): sem isso, cônjuges que usam o mesmo e-mail
// e compartilham sobrenome entrariam na fila. Com 100%, o provedor teria que ter
// mandado o nome do outro cônjuge pra o par casar.
function ehStubDeLogin(m) {
  return !!m && m.origem_cadastro === 'auth' && !digits(m.cpf) && !digits(m.telefone);
}

function nomeMenorTodoContidoNoMaior(a, b) {
  const ta = tokensNome(a); const tb = tokensNome(b);
  if (ta.length < 2 || tb.length < 2) return false;
  const menor = ta.length <= tb.length ? ta : tb;
  const maior = new Set(ta.length <= tb.length ? tb : ta);
  return menor.every((t) => maior.has(t));
}

function avaliarPossivelDuplicidade(a = {}, b = {}) {
  const cpfA = digits(a.cpf); const cpfB = digits(b.cpf);
  const telA = digits(a.telefone); const telB = digits(b.telefone);
  const emailA = String(a.email || '').trim().toLowerCase();
  const emailB = String(b.email || '').trim().toLowerCase();
  const cpfIgual = cpfValido(cpfA) && cpfA === cpfB;
  const cpfConflitante = cpfValido(cpfA) && cpfValido(cpfB) && cpfA !== cpfB;
  const nascimentoConflitante = !!a.data_nascimento && !!b.data_nascimento && a.data_nascimento !== b.data_nascimento;
  const generoConflitante = !!a.genero && !!b.genero && a.genero !== b.genero;
  const nomeCompativel = nomesPodemSerMesmaPessoa(a.nome, b.nome);

  if (cpfIgual) return { incluir: true, prioridade: 'alta', evidencias: ['CPF igual'], contradicoes: [] };
  if (cpfConflitante || nascimentoConflitante || generoConflitante) {
    return { incluir: false, prioridade: null, evidencias: [], contradicoes: [
      cpfConflitante ? 'CPFs diferentes' : null,
      nascimentoConflitante ? 'Nascimentos diferentes' : null,
      generoConflitante ? 'Gêneros diferentes' : null,
    ].filter(Boolean) };
  }
  if (!nomeCompativel) {
    // Exatamente UM lado é stub de login + mesmo e-mail + nome menor todo
    // contido no maior → mesma pessoa, com o nome curto vindo do provedor.
    // Roda DEPOIS dos vetos de conflito (CPF/nascimento/gênero divergentes já
    // barraram acima), então nunca contradiz identidade conferida.
    const umLadoEhStub = ehStubDeLogin(a) !== ehStubDeLogin(b);
    if (emailA.length > 3 && emailA === emailB && umLadoEhStub
        && nomeMenorTodoContidoNoMaior(a.nome, b.nome)) {
      return {
        incluir: true,
        prioridade: 'alta',
        evidencias: ['Cadastro criado pelo login com o mesmo e-mail (provedor mandou o nome abreviado)'],
        contradicoes: [],
      };
    }
    return { incluir: false, prioridade: null, evidencias: [], contradicoes: ['Nomes incompatíveis'] };
  }

  const evidencias = [];
  if (a.data_nascimento && a.data_nascimento === b.data_nascimento) evidencias.push('Nome e nascimento compatíveis');
  if (telA.length >= 10 && telA === telB) evidencias.push('Telefone e nome compatíveis');
  if (emailA.length > 3 && emailA === emailB) evidencias.push('E-mail e nome compatíveis');
  if (evidencias.length === 0) evidencias.push('Nomes muito parecidos');
  return { incluir: true, prioridade: evidencias[0].includes('nascimento') ? 'alta' : 'media', evidencias, contradicoes: [] };
}

module.exports = {
  avaliarPossivelDuplicidade, similaridadeNome, nomesPodemSerMesmaPessoa, tokensNome,
  ehStubDeLogin, nomeMenorTodoContidoNoMaior,
};

