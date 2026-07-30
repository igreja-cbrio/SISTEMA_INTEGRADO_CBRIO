// Normalização canônica de BUSCA (cliente) — insensível a acento, caixa e
// espaço extra. Toda busca de grupo/líder no frontend usa ESTAS funções.
//
// Motivo (caso real · 2026-07-30): o líder está cadastrado como
// "ANTONIO MARCO PEREIRA" (sem acento) e quem digitava "Antônio" (a grafia
// correta) não achava o grupo — a inscrição da pessoa morria aí.
//
// ⚠️ ESPELHO de backend/services/busca.js. A regra vive nos dois lados porque a
// filtragem acontece nos dois (o backend filtra `/buscar` e `/lideres/buscar`;
// o cliente filtra ao vivo sobre os grupos já carregados). Mudou aqui? Mudar lá.
//
// ⚠️ SÓ para comparação de texto exibido. NUNCA usar em slug, enum, chave de
// objeto ou coluna — identificador não passa por normalização de busca.

export function normalizarBusca(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Compara NORMALIZADO contra NORMALIZADO (termo E alvo). Normalizar só um lado
// não resolve nada: "Antônio" digitado continuaria não achando "ANTONIO"
// cadastrado (e vice-versa).
export function contemNormalizado(alvo, termo) {
  const t = normalizarBusca(termo);
  if (!t) return true; // termo vazio não filtra
  return normalizarBusca(alvo).includes(t);
}

// Alguma entrada da lista casa (nomes + apelidos dos líderes, p.ex.).
export function algumContemNormalizado(lista, termo) {
  const t = normalizarBusca(termo);
  if (!t) return true;
  return (lista || []).some((v) => normalizarBusca(v).includes(t));
}
