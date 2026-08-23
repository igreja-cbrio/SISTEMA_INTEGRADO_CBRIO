// Bairro no formulário · a régua de casamento, pura.
//
// ⚠️⚠️ ESPELHO de `fn_dem_bairro_canonico` no banco. A tela decide o que
// MOSTRAR; o servidor decide o que GRAVA. Se as duas divergirem, a pessoa
// escolhe "Barra da Tijuca" e o cadastro guarda outra coisa — que é exatamente
// o defeito que esta leva conserta.
//
// ⚠️ A normalização é a mesma de `normalizarBairro` (backend) e de
// `nullif(f_unaccent(lower(trim(x))),'')` (SQL): NFD, tira acento, minúsculo,
// trim. Três espelhos da mesma expressão — mudou um, muda os três.

export type BairroCatalogo = {
  norm: string;
  nome: string;
  pessoas: number;
  /** Grafias curtas que apontam para este bairro ("barra" → Barra da Tijuca). */
  apelidos: string[];
};

/** Espelho de `f_unaccent(lower(trim(bairro)))`. */
export function normalizarBairro(valor: string | null | undefined): string {
  const t = String(valor ?? '').trim().toLowerCase();
  if (!t) return '';
  // \u0300-\u036f = marcas de acento que o NFD separa da letra. Por escape:
  // combining mark literal no fonte some em qualquer editor.
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export type EstadoBairro =
  /** vazio — nada a dizer ainda */
  | { tipo: 'vazio' }
  /** exatamente um bairro do catálogo */
  | { tipo: 'conhecido'; bairro: BairroCatalogo }
  /** a pessoa escreveu um apelido; o canônico é outro */
  | { tipo: 'apelido'; bairro: BairroCatalogo; digitado: string }
  /** não está no catálogo — vale, mas é declarado */
  | { tipo: 'novo'; digitado: string };

/**
 * O que o texto digitado significa contra o catálogo.
 *
 * ⚠️ 'novo' NUNCA é erro. A porta pública não pode recusar quem mora num bairro
 * que a base ainda não viu — travar o cadastro por causa de um catálogo
 * incompleto é o pior desfecho possível aqui. O campo avisa e deixa seguir.
 */
export function avaliarBairro(texto: string, catalogo: BairroCatalogo[]): EstadoBairro {
  const digitado = String(texto ?? '').trim();
  const norm = normalizarBairro(digitado);
  if (!norm) return { tipo: 'vazio' };

  const exato = catalogo.find((b) => b.norm === norm);
  if (exato) return { tipo: 'conhecido', bairro: exato };

  const porApelido = catalogo.find((b) => b.apelidos?.includes(norm));
  if (porApelido) return { tipo: 'apelido', bairro: porApelido, digitado };

  return { tipo: 'novo', digitado };
}

/**
 * Sugestões para o que a pessoa está digitando.
 *
 * ⚠️ Casa também pelos APELIDOS: quem digita "barra" tem que ver "Barra da
 * Tijuca". Sem isso a pessoa não acha, digita o apelido e recria a variação de
 * grafia que o catálogo existe para eliminar.
 *
 * ⚠️ Começo-do-nome vem antes de meio-do-nome: digitando "vila", "Vila
 * Valqueire" é mais provável que "Nova Vila". Empate desempata por PESSOAS —
 * no totem os bairros da região precisam estar no topo.
 */
export function sugerirBairros(
  texto: string,
  catalogo: BairroCatalogo[],
  limite = 8,
): BairroCatalogo[] {
  const q = normalizarBairro(texto);
  if (!q) return [...catalogo].sort((a, b) => b.pessoas - a.pessoas).slice(0, limite);

  const pontuar = (b: BairroCatalogo): number => {
    if (b.norm === q) return 0;
    if (b.norm.startsWith(q)) return 1;
    if (b.apelidos?.some((a) => a === q || a.startsWith(q))) return 2;
    if (b.norm.includes(q)) return 3;
    if (b.apelidos?.some((a) => a.includes(q))) return 4;
    return Infinity;
  };

  return catalogo
    .map((b) => ({ b, p: pontuar(b) }))
    .filter((x) => Number.isFinite(x.p))
    .sort((x, y) => (x.p - y.p) || (y.b.pessoas - x.b.pessoas) || x.b.nome.localeCompare(y.b.nome, 'pt-BR'))
    .slice(0, limite)
    .map((x) => x.b);
}
