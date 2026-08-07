/**
 * Régua PURA da CAPA do grupo pelo app (07/08/2026 · fecho da Onda 2).
 * Sem banco, sem rede, sem relógio → entra no gate de deploy.
 *
 * ⚠️⚠️ POR QUE ISTO É TESTADO E NÃO MORA DENTRO DO HANDLER.
 * `caminhoDaCapa` decide **apagar um objeto do Storage** a partir de uma
 * STRING que nem sempre veio de nós: `src/pages/ministerial/Grupos.jsx:2500` é
 * um campo de TEXTO LIVRE (`placeholder="https://..."`) gravando direto em
 * `mem_grupos.foto_url`. Ou seja, a coluna pode conter qualquer URL que alguém
 * colou à mão — inclusive de outro bucket, de outro site, ou com `..` no meio.
 * Uma função que erra aqui apaga arquivo que não é dela. Por isso ela recusa
 * tudo que não for, sem ambiguidade, um objeto do bucket `grupos`.
 *
 * ⚠️ O bucket `grupos` é PÚBLICO: quem lê a URL não precisa de sessão. Isso é
 * intencional (a capa aparece no catálogo público de grupos), mas significa que
 * o caminho não é segredo — a proteção está em QUEM ESCREVE (gateGrupoApp), não
 * em quem lê.
 */

/** Marca que identifica um objeto do bucket `grupos` numa URL pública. */
const MARCA_BUCKET = '/storage/v1/object/public/grupos/';

/**
 * Caminho do objeto dentro do bucket `grupos`, ou `null`.
 *
 * Devolve `null` — ou seja, NÃO APAGA NADA — para:
 *  · vazio / null / não-string;
 *  · URL de outro bucket (`/object/public/avatars/...`);
 *  · a marca aparecendo só dentro da QUERY (`https://site.com/?u=/storage/...`),
 *    que é como uma URL forjada tentaria se passar por nossa;
 *  · caminho vazio depois da marca;
 *  · qualquer caminho com segmento `..` (travessia pra fora do bucket).
 *
 * ⚠️ Na dúvida devolve null: deixar um objeto órfão no bucket custa bytes;
 * apagar o objeto errado custa a capa de outro grupo — ou pior, um avatar.
 */
function caminhoDaCapa(fotoUrl) {
  if (typeof fotoUrl !== 'string') return null;
  const s = fotoUrl.trim();
  if (!s) return null;

  const i = s.indexOf(MARCA_BUCKET);
  if (i < 0) return null;

  // A marca tem que estar no CAMINHO da URL, nunca depois de um `?` ou `#`.
  const corte = s.search(/[?#]/);
  if (corte >= 0 && corte < i) return null;

  let bruto = s.slice(i + MARCA_BUCKET.length).split(/[?#]/)[0];
  if (!bruto) return null;

  try {
    bruto = decodeURIComponent(bruto);
  } catch {
    return null; // `%` solto = URL malformada; não arriscamos adivinhar
  }

  if (!bruto || bruto.split('/').some((p) => p === '..')) return null;
  return bruto;
}

/**
 * Extensão do arquivo a partir do mime — e a allowlist de formato num lugar só.
 *
 * ⚠️ Não derivar extensão da URI do aparelho (era o que a tela fazia:
 * `asset.uri.split('.').pop()`): no Android a URI é `content://...` e sai sem
 * extensão nenhuma, e um `.HEIC` do iPhone entraria com o nome mentindo sobre o
 * conteúdo. Quem manda é o mime que o multer validou.
 */
const EXT_POR_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

/** Formatos aceitos (o mesmo array que alimenta o `fileFilter` do multer). */
const MIMES_CAPA = Object.freeze(Object.keys(EXT_POR_MIME));

/** Extensão para o mime, ou `null` se o formato não é aceito. */
function extensaoDaCapa(mimetype) {
  if (typeof mimetype !== 'string') return null;
  return EXT_POR_MIME[mimetype.trim().toLowerCase()] ?? null;
}

/**
 * Caminho do objeto novo. ÚNICO por upload, de propósito.
 *
 * ⚠️ Caminho fixo (`${gid}.jpg`) parece mais limpo e é uma armadilha: o bucket é
 * público e o CDN guarda o objeto por ~1h. Com caminho fixo, trocar a capa não
 * aparece pra ninguém durante esse tempo — foi por isso que a tela improvisou um
 * `?t=Date.now()` no cliente, que só engana o cache do próprio aparelho e não o
 * do CDN. Caminho novo a cada upload resolve na origem.
 */
function caminhoNovoDaCapa(grupoId, ext, agoraMs) {
  return `${grupoId}/${agoraMs}.${ext}`;
}

module.exports = {
  MARCA_BUCKET,
  MIMES_CAPA,
  caminhoDaCapa,
  extensaoDaCapa,
  caminhoNovoDaCapa,
};
