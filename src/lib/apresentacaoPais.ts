// Nomes dos pais na apresentação de crianças — espelho de
// `backend/utils/apresentacaoHorario.js` (paisIguais / nomesDosPaisUnicos).
//
// ⚠️ O caso Isabella (08/09/2026): a mãe preencheu o próprio nome nos DOIS campos
// (pai e mãe) e saiu "Aline Lazaro / Aline Lazaro" na lista do Kids e
// "Aline Lazaro e Aline Lazaro" no certificado. O backend recusa a inscrição
// nova; aqui é a guarda de LEITURA pras linhas antigas e a validação do form.
// Mudou a régua num lado, muda no outro — o teste compara os dois.

export function nomeChave(nome: unknown): string {
  return String(nome ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pai e mãe são a mesma pessoa? (vazio nunca é "igual") */
export function paisIguais(nomePai: unknown, nomeMae: unknown): boolean {
  const a = nomeChave(nomePai);
  const b = nomeChave(nomeMae);
  return Boolean(a) && a === b;
}

/** Responsáveis sem repetição, na ordem pai → mãe. */
export function nomesDosPaisUnicos(nomePai: unknown, nomeMae: unknown): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const n of [nomePai, nomeMae]) {
    const s = String(n ?? '').trim().replace(/\s+/g, ' ');
    if (!s) continue;
    const k = nomeChave(s);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(s);
  }
  return out;
}
