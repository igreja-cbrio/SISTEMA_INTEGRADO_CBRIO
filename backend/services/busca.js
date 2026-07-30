// Normalização canônica de BUSCA (servidor) — insensível a acento, caixa e
// espaço extra.
//
// ⚠️ ESPELHO EXATO do client `src/lib/busca.js` (mesma régua, mesmos casos).
// Mudou a regra aqui? Mudar lá também — se os dois lados divergirem, a busca
// do formulário público e a do backend passam a discordar sobre o que casa.
//
// Por que a filtragem é em JS e não no PostgREST: `ilike` é acento-SENSÍVEL
// (`%antonio%` não casa "Antônio"), e a alternativa (`unaccent` no banco) exigiria
// função/índice por coluna. Os volumes aqui são de dezenas/centenas de linhas.
//
// ⚠️ SÓ para comparação de texto exibido. NUNCA usar em slug, enum, chave ou
// coluna — identificador não passa por normalização de busca.

function normalizarBusca(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Compara NORMALIZADO contra NORMALIZADO (termo E alvo) — normalizar só um lado
// não resolve: "Antônio" digitado seguiria sem achar "ANTONIO" cadastrado.
function contemNormalizado(alvo, termo) {
  const t = normalizarBusca(termo);
  if (!t) return true; // termo vazio não filtra
  return normalizarBusca(alvo).includes(t);
}

// Alguma entrada da lista casa (nomes + apelidos dos líderes, p.ex.).
function algumContemNormalizado(lista, termo) {
  const t = normalizarBusca(termo);
  if (!t) return true;
  return (lista || []).some((v) => normalizarBusca(v).includes(t));
}

module.exports = { normalizarBusca, contemNormalizado, algumContemNormalizado };
