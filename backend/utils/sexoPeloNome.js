// ============================================================================
// SEXO PELO PRIMEIRO NOME · só o que é ÓBVIO (2026-09-16)
//
// Pedido do Marcos: *"pelo nome das pessoas, as que forem óbvias, já resolva o
// sexo, se for joão é homem, se for maria é mulher"* — e *"me diga se tiver
// algum caso mais dificil que eu valido com a ariel"*. Logo, esta régua tem
// duas saídas de propósito: um palpite SEGURO, ou `null` (vai pra Ariel).
// Ela nunca chuta.
//
// ⚠️⚠️ NÃO existe regra de terminação aqui, e é decisão, não esquecimento.
// "termina em A ⇒ mulher" erra em Cauã, Luca, Nicola, Sasha, Jônatha, Juca,
// Gedalva — e erra CALADO, gravando identidade errada na ficha de uma pessoa
// real. Cobrir mais 30 nomes não paga o preço de um errado.
//
// De onde vêm as listas:
//   1. APRENDIDAS da própria base da CBRio em 16/09/2026 — 1.856 membros com
//      gênero preenchido, 706 primeiros nomes distintos. Entrou quem tinha
//      >= 2 casos e 100% de concordância, ou >= 4 casos e >= 90%. É evidência
//      da nossa população, não lista genérica de internet.
//   2. CURADAS à mão: nomes brasileiros correntes que a base ainda não tinha
//      exemplo suficiente.
//
// ⚠️ O aprendizado também achou ERRO no que já estava gravado: 1 "isabela"
// marcada como masculino e 1 "caio" como feminino. Não corrigimos aqui (é dado
// de gente, tem dono) — mas é por isso que a régua exige CONCORDÂNCIA, e não
// maioria simples: com maioria simples esses dois erros teriam virado lei.
// ============================================================================

// Só o PRIMEIRO token decide. É o que resolve "José Maria" (homem) × "Maria
// José" (mulher) sem precisar de nenhuma regra especial.
function primeiroNome(nome) {
  return String(nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // tira acento
    .replace(/[^a-z\s]/g, ' ')        // tira ponto, hífen, número
    .split(/\s+/)
    .filter(Boolean)[0] || '';
}

// ⚠️⚠️ Unissex de verdade no Brasil: NUNCA decidir sozinho, mesmo que a base
// local esteja 100% de um lado — 8 Ariel homens não fazem a 9ª Ariel ser
// homem. (A própria coordenadora do voluntariado é a Ariel.)
const AMBIGUOS = new Set([
  'ariel', 'darci', 'darcy', 'dominique', 'iraci', 'jaci', 'jacy', 'juraci',
  'lucimar', 'nicola', 'sacha', 'sasha', 'valdeci', 'vanderci', 'neci', 'remi',
  'marion', 'cris', 'dani', 'rafa', 'altair', 'anesio', 'deni', 'eli', 'elian',
  'ivani', 'nair', 'jordan', 'robin', 'ryan', 'alcides',
]);

const MASCULINOS = new Set([
  // ── aprendidos na base da CBRio ──
  'adriano', 'alessandro', 'alex', 'alexander', 'alexandre', 'almir', 'anderson',
  'andre', 'antonio', 'arthur', 'aurelio', 'bernardo', 'bruno', 'carlos',
  'charles', 'claudio', 'clayton', 'cristiano', 'daniel', 'davi', 'diego',
  'diogo', 'douglas', 'edson', 'eduardo', 'elias', 'eliezer', 'enzo', 'erick',
  'fabiano', 'fabio', 'felipe', 'fernando', 'flavio', 'gabriel', 'gilberto',
  'guilherme', 'gustavo', 'igor', 'jean', 'joao', 'jonatas', 'jorge', 'jose',
  'juliano', 'julio', 'leandro', 'leonardo', 'lucas', 'luis', 'luiz', 'marcelo',
  'marcio', 'marco', 'marcos', 'marcus', 'matheus', 'miguel', 'milton', 'nelson',
  'patrick', 'paulo', 'pedro', 'rafael', 'raphael', 'renan', 'renato', 'ricardo',
  'roberto', 'robson', 'rodrigo', 'rogerio', 'samuel', 'sebastiao', 'sergio',
  'silvio', 'thiago', 'tiago', 'victor', 'vinicius', 'vitor', 'wagner', 'waldyr',
  'william', 'yago', 'yuri',
  // ── curados ──
  'abel', 'abraao', 'adao', 'ademar', 'ademir', 'adilson', 'adriel', 'afonso',
  'ailton', 'alan', 'alberto', 'aldo', 'aloisio', 'alvaro', 'amauri', 'americo',
  'anisio', 'aparecido', 'armando', 'arnaldo', 'aroldo', 'artur', 'augusto',
  'benedito', 'benicio', 'benjamim', 'benjamin', 'bento', 'breno', 'caetano',
  'caio', 'calebe', 'cassio', 'celso', 'cesar', 'cicero', 'claudemir', 'cleber',
  'cleiton', 'clodoaldo', 'conrado', 'cristovao', 'dalton', 'damiao', 'danilo',
  'dante', 'dario', 'davison', 'demetrio', 'denilson', 'dennis', 'dimas',
  'divino', 'domingos', 'donizete', 'dorival', 'edgar', 'edgard', 'edilson',
  'edimar', 'edinaldo', 'edivaldo', 'edmar', 'edmilson', 'edmundo', 'ednaldo',
  'edvaldo', 'elder', 'eliseu', 'elton', 'elvis', 'emanuel', 'emerson', 'emilio',
  'enio', 'erasmo', 'erico', 'ernesto', 'esdras', 'estevao', 'euclides',
  'eugenio', 'eurico', 'evandro', 'evaldo', 'everaldo', 'everton', 'ezequiel',
  'fabricio', 'fagner', 'fausto', 'felix', 'fellipe', 'filipe', 'firmino',
  'francisco', 'frederico', 'gael', 'gaspar', 'genesio', 'geraldo', 'gerson',
  'getulio', 'gilmar', 'gilson', 'gilvan', 'giovane', 'giovani', 'gleison',
  'gregorio', 'hamilton', 'heber', 'helio', 'helder', 'henrique', 'herbert',
  'hermes', 'hilario', 'horacio', 'hugo', 'humberto', 'iago', 'ilson', 'inacio',
  'isaac', 'isaias', 'ismael', 'israel', 'italo', 'ivan', 'jacob', 'jailson',
  'jair', 'jairo', 'jamil', 'jarbas', 'jeferson', 'jefferson', 'jeronimo',
  'joaquim', 'joel', 'joelson', 'jonas', 'jonatan', 'jonathan', 'josias',
  'josue', 'juarez', 'julian', 'junior', 'juvenal', 'kaio', 'kelvin', 'kevin',
  'laercio', 'lauro', 'lazaro', 'leonel', 'levi', 'lindomar', 'lino', 'lourival',
  'lucca', 'luciano', 'luan', 'magno', 'manoel', 'manuel', 'marcel', 'marciano',
  'mariano', 'mario', 'marlon', 'martinho', 'mateus', 'mauricio', 'maurilio',
  'mauro', 'maximiliano', 'messias', 'micael', 'michel', 'moacir', 'moises',
  'murilo', 'natan', 'natanael', 'nathan', 'newton', 'nicolas', 'nilson',
  'nilton', 'noel', 'norberto', 'olavo', 'olimpio', 'orlando', 'oscar', 'osmar',
  'osvaldo', 'oswaldo', 'otavio', 'pablo', 'pascoal', 'peterson', 'pierre',
  'plinio', 'ramon', 'raul', 'reginaldo', 'regis', 'reinaldo', 'rivaldo',
  'rodolfo', 'rolando', 'romario', 'romeu', 'romulo', 'ronaldo', 'ronan',
  'rubem', 'ruben', 'rubens', 'salomao', 'salvador', 'sandro', 'santiago',
  'saulo', 'savio', 'sidnei', 'sidney', 'silas', 'simao', 'tadeu', 'thales',
  'thomas', 'tobias', 'tulio', 'ulisses', 'valdemar', 'valdir', 'valentim',
  'valter', 'vanderlei', 'vanderson', 'vicente', 'vilmar', 'virgilio',
  'vladimir', 'waldemar', 'waldir', 'wallace', 'walter', 'wanderley',
  'wanderson', 'washington', 'wellington', 'wendel', 'wesley', 'weslley',
  'wilson', 'wilton', 'zacarias',
  // ── 2ª rodada: nomes que apareceram na varredura dos voluntários ──
  'anselmo', 'ayres', 'caique', 'christiano', 'david', 'karlos', 'phillip',
  'ronald', 'stuart',
]);

const FEMININOS = new Set([
  // ── aprendidos na base da CBRio ──
  'adriana', 'alda', 'alessandra', 'alexandra', 'alice', 'aline', 'amanda',
  'ana', 'andrea', 'andreia', 'angela', 'angelica', 'anna', 'barbara',
  'beatriz', 'bianca', 'brenda', 'bruna', 'camila', 'camilla', 'carla',
  'carolina', 'caroline', 'carolline', 'catia', 'celia', 'christiane',
  'claudia', 'cristiana', 'cristiane', 'cristina', 'daniela', 'daniele',
  'daniella', 'danielle', 'dayse', 'debora', 'deborah', 'deise', 'denise',
  'eduarda', 'elaine', 'elen', 'eliana', 'eliane', 'elisangela', 'elizabeth',
  'ester', 'esther', 'evelyn', 'fabiana', 'fernanda', 'flavia', 'gabriela',
  'gabriele', 'gabriella', 'gabrielle', 'giovanna', 'gisele', 'giselle',
  'giulia', 'glaucia', 'ingrid', 'iolanda', 'isabel', 'isadora', 'jacqueline',
  'jakeline', 'janaina', 'jaqueline', 'jennifer', 'jessica', 'josiane',
  'josilene', 'julia', 'juliana', 'juliane', 'karen', 'karine', 'katia',
  'keila', 'kelly', 'lais', 'lara', 'larissa', 'leandra', 'leila', 'leticia',
  'lilian', 'liliane', 'livia', 'lorena', 'luana', 'lucia', 'luciana',
  'luciene', 'luisa', 'marcela', 'marcele', 'marcella', 'marcelle', 'marcia',
  'margarida', 'maria', 'mariana', 'marina', 'marisa', 'marise', 'mayara',
  'michele', 'michelle', 'milena', 'mirella', 'miriam', 'monica', 'monique',
  'nadia', 'natalia', 'nathalia', 'nicole', 'nivea', 'paloma', 'patricia',
  'paula', 'priscila', 'priscilla', 'rafaela', 'rafaella', 'raquel', 'rebeca',
  'renata', 'rita', 'roberta', 'rosana', 'rosangela', 'sabrina', 'sandra',
  'sarah', 'silvana', 'silvia', 'simone', 'sofia', 'solange', 'sonia', 'sophia',
  'suelen', 'suellen', 'suzana', 'taina', 'talita', 'tamara', 'tatiana',
  'tatiane', 'teresa', 'thaiane', 'thaina', 'thais', 'thalita', 'thayna',
  'thays', 'valeria', 'vanessa', 'vania', 'vera', 'viviane',
  // ── curados ──
  'abigail', 'adelia', 'adriane', 'agatha', 'aida', 'alana', 'albertina',
  'alcione', 'alessa', 'alexia', 'alicia', 'alina', 'allana', 'alzira',
  'amalia', 'amelia', 'anabela', 'analice', 'anastacia', 'andressa', 'anelise',
  'angelina', 'angelita', 'anita', 'antonia', 'aparecida', 'ariane', 'arlete',
  'arlinda', 'aurea', 'aurora', 'ayla', 'benedita', 'berenice', 'bernadete',
  'betania', 'brunna', 'cacilda', 'candida', 'carmem', 'carmen', 'cassia',
  'cassiana', 'catarina', 'cecilia', 'celeste', 'celina', 'cintia', 'cinthia',
  'clara', 'clarice', 'clarissa', 'claudete', 'claudiane', 'cleide', 'clelia',
  'cleonice', 'conceicao', 'consuelo', 'cremilda', 'dalva', 'damaris',
  'dandara', 'darlene', 'dayana', 'dayane', 'delma', 'dilma', 'divina',
  'dolores', 'domingas', 'dora', 'edilene', 'edina', 'edineia', 'edith', 'edna',
  'elba', 'elena', 'eliete', 'elis', 'elisa', 'elisabete', 'elisete', 'elizete',
  'eloa', 'eloisa', 'elza', 'emanuela', 'emanuelle', 'emilia', 'emily',
  'erica', 'erika', 'ermelinda', 'esmeralda', 'estela', 'estella', 'eugenia',
  'eulalia', 'eunice', 'evelin', 'fatima', 'filomena', 'flora', 'franciele',
  'francisca', 'gabrielly', 'geisa', 'genoveva', 'georgia', 'geralda', 'gerusa',
  'gilda', 'gildete', 'giovana', 'gislaine', 'gloria', 'graziela', 'guiomar',
  'helena', 'heloisa', 'henriqueta', 'hilda', 'hortencia', 'ines', 'inez',
  'iracema', 'irene', 'iris', 'irma', 'isabela', 'isabella', 'isabelle',
  'isaura', 'ivana', 'ivanete', 'ivone', 'izabel', 'izabela', 'jandira',
  'janete', 'janice', 'jasmine', 'jeane', 'jeanne', 'jenifer', 'joana',
  'joanna', 'jocelia', 'joelma', 'joice', 'jordana', 'josefa', 'josefina',
  'jucelia', 'jucimara', 'judite', 'julie', 'jussara', 'karina', 'karla',
  'katherine', 'keli', 'kellen', 'kesia', 'laura', 'laurinda', 'leda', 'leia',
  'lena', 'lenice', 'leonor', 'lidia', 'lidiane', 'ligia', 'lindalva',
  'lorraine', 'lourdes', 'lucelia', 'lucineia', 'ludmila', 'luiza', 'luzia',
  'madalena', 'magali', 'magda', 'maiara', 'maisa', 'manuela', 'mara',
  'margareth', 'margarete', 'mariah', 'marilda', 'marilene', 'marilia',
  'marilu', 'marilza', 'marinalva', 'marli', 'marlene', 'marta', 'martha',
  'matilde', 'maura', 'mayra', 'meire', 'melissa', 'michelly', 'mirian',
  'mirtes', 'moema', 'nadir', 'nancy', 'nara', 'natasha', 'neide', 'nelma',
  'nilce', 'nilda', 'nilza', 'nina', 'noemi', 'norma', 'nubia', 'odete',
  'ofelia', 'olga', 'olivia', 'otilia', 'palmira', 'pamela', 'paulina',
  'penha', 'perla', 'pietra', 'poliana', 'polyana', 'quiteria', 'raimunda',
  'ramona', 'regiane', 'regina', 'roseane', 'roseli', 'rosemary', 'rosemeire',
  'rosilene', 'rosimeire', 'rosa', 'rosalia', 'rosane', 'rute', 'ruth',
  'salete', 'samanta', 'samantha', 'sara', 'selma', 'severina', 'sheila',
  'shirley', 'silmara', 'sirlei', 'soraia', 'soraya', 'stefani', 'stella',
  'sueli', 'suely', 'sunamita', 'susana', 'suzane', 'sylvia', 'tabata',
  'tabita', 'tais', 'tania', 'telma', 'teodora', 'teresinha', 'thamires',
  'thamiris', 'tereza', 'valdirene', 'valquiria', 'vanda', 'vanuza',
  'veronica', 'vilma', 'vitoria', 'viviana', 'wanda', 'wilma', 'yara',
  'yasmin', 'zelia', 'zenaide', 'zilda', 'zuleide',
  // ── 2ª rodada: nomes que apareceram na varredura dos voluntários ──
  'carina', 'elisana', 'haline', 'mariane', 'tatyanne', 'valentina',
]);

/**
 * `'masculino' | 'feminino' | null` — null significa "não é óbvio, pergunta".
 * Vocabulário LONGO, o mesmo de `mem_membros.genero` (D8: nunca "outro").
 */
function sexoPeloNome(nome) {
  const p = primeiroNome(nome);
  if (!p) return null;
  if (AMBIGUOS.has(p)) return null;
  if (MASCULINOS.has(p)) return 'masculino';
  if (FEMININOS.has(p)) return 'feminino';
  // Não está em nenhuma lista ⇒ não é óbvio. Apelido ("Zé", "Tom", "Duh"),
  // nome raro, nome estrangeiro — todos caem aqui e viram pergunta pra Ariel.
  // ⚠️ Uma versão anterior travava nomes com <= 3 letras ANTES das listas, e
  // reprovava "Ana" e "Eva", que são nomes inteiros. Sem heurística de
  // terminação a trava é redundante: quem não está no dicionário já é null.
  return null;
}

module.exports = { sexoPeloNome, primeiroNome, AMBIGUOS, MASCULINOS, FEMININOS };
