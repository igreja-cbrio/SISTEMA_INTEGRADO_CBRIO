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

// ⚠️⚠️ 15/09/2026 · o bloqueio virou AVISO (pedido do Marcos). O caminho antigo
// mandava "deixe um dos campos em branco" e PARAVA — medido em 15/09: das 22
// inscrições vivas, **as 22 têm os dois campos preenchidos** e 4 (18%) com o
// mesmo nome nos dois, ou seja ninguém deixa campo em branco: o bloqueio era
// atrito, não conserto. Agora a pessoa confirma e a inscrição entra.
//
// ⚠️⚠️ O TEXTO DIZ A VERDADE: desde 08/09 o certificado (e a lista do Kids)
// DEDUPLICAM via `nomesDosPaisUnicos`, então o nome sai UMA vez — não duas.
// Prometer "vai aparecer duas vezes" seria avisar de um efeito que não existe
// mais, e a pessoa corrigiria por um motivo falso.
/**
 * Precisa pedir a confirmação antes de enviar? Espelho de
 * backend/utils/apresentacaoHorario.exigeConfirmacaoPaisIguais — divergir faz
 * a tela aceitar o que a porta recusa (formulário insubmissível) ou o
 * contrário. O teste roda a MESMA tabela de casos nos dois lados.
 */
export function exigeConfirmacaoPaisIguais(
  nomePai: unknown, nomeMae: unknown, confirmado: unknown,
): boolean {
  return paisIguais(nomePai, nomeMae) && confirmado !== true;
}

export const AVISO_PAIS_IGUAIS =
  'Você escreveu o mesmo nome no campo do pai e no da mãe. Se é a mesma pessoa, tudo bem — '
  + 'mas o certificado vai sair com esse nome UMA vez só, e não com dois responsáveis. Confere?';
