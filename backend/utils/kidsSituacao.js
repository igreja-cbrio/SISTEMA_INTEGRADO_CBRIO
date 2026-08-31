// Situação da criança no Kids · os três cards e o motivo da inativação.
//
// ⚠️⚠️ São TRÊS conceitos separados, e a tela de Crianças confundia dois deles
// porque os números só existiam escondidos nos rótulos dos filtros:
//   • `visitante`  → visitante × frequentadora (régua de 3 dias distintos com
//     check-in · `utils/kidsVisitante.js`)
//   • `ativo`      → cadastro ativo × desativado
//   • `motivo_inativacao` → POR QUE foi desativada
//
// Aqui mora só a apresentação disso (cards + rótulo do motivo). Quem promove
// visitante é o `kidsVisitante`; quem inativa é o `totemKids`.
//
// ⚠️ Régua PURA (sem banco, sem rede, sem relógio) pra entrar no gate de deploy.

// ⚠️⚠️ Motivo que o sistema escreve sozinho. Vale como CATÁLOGO de leitura, não
// como validação: motivo digitado à mão pela equipe passa igual. Serve pra a
// tela agrupar e pra o teste travar as frases que a inativação automática grava
// (mudar o texto lá sem mudar aqui faz o agrupamento partir em dois).
const MOTIVOS_DO_SISTEMA = [
  'Visitante não retornou (prazo de 4 semanas)',
  'Completou 13 anos · graduou para adolescente',
  'Sem check-in no Planning Center nos últimos 6 meses',
];

// Rótulo do motivo, ou `null` quando NÃO HÁ motivo registrado.
//
// ⚠️⚠️ NULL É UM ESTADO, não um motivo vazio: devolver `'Desativada'` ou string
// vazia faria a tela AFIRMAR uma razão que ninguém escreveu. A linha da criança
// tem que dizer "sem motivo registrado" (em âmbar), porque cadastro desativado
// sem justificativa é justamente o que a equipe precisa achar pra corrigir.
function rotuloMotivo(valor) {
  if (valor == null) return null;
  const t = String(valor).replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

// Agrupa os motivos das crianças inativas, do mais frequente pro menos.
//
// ⚠️ Quem está sem motivo entra num balde PRÓPRIO (`motivo: null`), nunca
// somado a outro nem descartado — descartar faria a soma dos motivos não fechar
// com o total de inativas, e ninguém entenderia a diferença.
function agruparMotivos(linhas) {
  // ⚠️ A chave do Map é o PRÓPRIO motivo, `null` incluído — `Map` aceita `null`
  // como chave. Uma sentinela de string colidiria com um motivo digitado igual
  // a ela e, pior, foi onde a 1ª versão deste arquivo escondeu um byte NUL:
  // invisível na leitura, inofensivo no teste (a sentinela nunca sai da
  // função) e lixo no fonte. Sem sentinela, a classe de bug não existe.
  const mapa = new Map();
  for (const linha of linhas || []) {
    const motivo = rotuloMotivo(linha?.motivo_inativacao);
    const atual = mapa.get(motivo);
    if (atual) atual.total += 1;
    else mapa.set(motivo, { motivo, total: 1 });
  }
  return [...mapa.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    // Empate: quem tem motivo vem antes do "sem motivo", e o resto alfabético —
    // ordem instável faria a lista dançar entre dois carregamentos iguais.
    if (a.motivo === null) return 1;
    if (b.motivo === null) return -1;
    return a.motivo.localeCompare(b.motivo, 'pt-BR');
  });
}

// Converte uma contagem crua do banco em número exibível.
//
// ⚠️⚠️ `undefined`/`null` = NÃO DEU PRA CONTAR e continua `null`. Virar 0 aqui
// faria o card dizer "0 inativas" quando a consulta falhou — e "não há nenhuma
// criança inativa" leva a uma decisão oposta de "a contagem não veio". É a
// lição que este projeto já pagou no card de cobertura e no embed `(count)`.
function numeroOuNulo(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) return null;
  return Math.trunc(valor);
}

// Monta os 3 cards da tela. Cada `total` pode ser `null` (não medido).
//
// ⚠️ Os cards são CONTAGENS DO BANCO, não da lista carregada: o endpoint traz um
// lado só (`?ativo=`), então contar em JS mostraria "0 inativas" sempre que a
// tela estivesse na aba de ativos — o número mais enganoso possível.
function montarContagens({ frequentadoras, visitantes, inativas } = {}) {
  const freq = numeroOuNulo(frequentadoras);
  const visit = numeroOuNulo(visitantes);
  const inat = numeroOuNulo(inativas);

  // ⚠️ O total de ativas é a SOMA das duas situações, e só existe se as duas
  // vieram: somar tratando ausência como 0 devolveria um total menor que o real
  // sem nenhum sinal de que faltou pedaço.
  const ativas = freq === null || visit === null ? null : freq + visit;

  return {
    frequentadoras: freq,
    visitantes: visit,
    inativas: inat,
    ativas,
    // A tela pinta em âmbar e escreve "—" no que não foi medido.
    incompleto: freq === null || visit === null || inat === null,
  };
}

module.exports = {
  MOTIVOS_DO_SISTEMA,
  rotuloMotivo,
  agruparMotivos,
  numeroOuNulo,
  montarContagens,
};
