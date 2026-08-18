/**
 * Régua PURA de "esta URL é um arquivo NOSSO, e qual é o caminho dele?".
 *
 * Vive em `utils/` (sem supabase, sem rede, sem banco) porque entra no gate de
 * deploy: é ela que decide se um arquivo será assinado — e, no dia em que
 * alguém escrever uma rotina de limpeza em cima disto, o que pode ser APAGADO.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (auditoria de 16/08/2026)
 * Vários módulos gravam a **URL PÚBLICA** do arquivo direto na coluna do banco
 * (`solicitacoes.imagens_url`, `solicitacoes.documento_url`,
 * `rh_funcionarios.foto_url`, `rh_documentos.storage_path`). Isso amarra o dado
 * ao bucket ser público: fechar o bucket quebraria todo registro histórico.
 *
 * A saída é NÃO reescrever o passado, e sim derivar o caminho na LEITURA e
 * assinar na hora — o mesmo padrão que `waInbox.pathDoBucketPublico` já usa
 * desde 12/08. Assim o bucket fecha sem migração de dados e **sem exigir
 * release do app do Staff**, que continua mandando a URL pública no upload
 * (`CBRio-Staff/app/(app)/solicitacao/nova.tsx:104`).
 *
 * ⚠️ FAIL-CLOSED: o que não for reconhecidamente NOSSO devolve `null`. URL de
 * terceiro, caminho de outro bucket, travessia (`..`) e string vazia nunca
 * viram caminho — na dúvida, não é nosso e não se toca.
 */

/** Marca canônica de uma URL pública do Supabase Storage. */
const MARCA_PUBLICA = '/storage/v1/object/public/';

/**
 * Extrai o caminho de um arquivo dentro de `bucket` a partir de:
 *   · URL pública    → `https://x.supabase.co/storage/v1/object/public/<bucket>/a/b.jpg`
 *   · caminho cru    → `a/b.jpg` (já é o que queremos · idempotente)
 *
 * Devolve `null` para qualquer outra coisa.
 *
 * ⚠️ O bucket é comparado com `/<bucket>/` inteiro, nunca por `includes` solto:
 * sem as barras, o bucket `rh-fotos` casaria dentro de `rh-fotos-antigo`, e a
 * assinatura (ou uma limpeza futura) miraria o arquivo errado.
 */
function caminhoNoBucket(valor, bucket) {
  const s = String(valor || '').trim();
  if (!s || !bucket) return null;

  // Caminho cru: sem esquema e sem a marca do Storage.
  if (!/^https?:\/\//i.test(s) && !s.includes(MARCA_PUBLICA)) {
    return caminhoSeguro(s);
  }

  const marca = `${MARCA_PUBLICA}${bucket}/`;
  const i = s.indexOf(marca);
  if (i === -1) return null;

  // A query string (`?t=...` de cache-busting) não faz parte do caminho.
  const bruto = s.slice(i + marca.length).split('?')[0].split('#')[0];
  let decodificado;
  try {
    decodificado = decodeURIComponent(bruto);
  } catch {
    return null; // percent-encoding quebrado: não é caminho utilizável
  }
  return caminhoSeguro(decodificado);
}

/**
 * ⚠️ Recusa caminho vazio, absoluto ou com travessia. Um `..` aqui, num código
 * que um dia assine ou remova arquivos, é o que faz a operação escapar da
 * pasta pretendida.
 */
function caminhoSeguro(p) {
  const s = String(p || '').trim();
  if (!s) return null;
  if (s.startsWith('/')) return null;
  if (s.split('/').some((parte) => parte === '..')) return null;
  return s;
}

/**
 * Dado um objeto e a lista de campos que podem conter anexo, devolve os
 * caminhos ÚNICOS encontrados naquele bucket. Campo pode ser string ou array
 * de strings (o `imagens_url` é jsonb com lista).
 */
function caminhosDosCampos(obj, campos, bucket) {
  const achados = [];
  for (const campo of campos || []) {
    const v = obj ? obj[campo] : null;
    const lista = Array.isArray(v) ? v : [v];
    for (const item of lista) {
      const p = caminhoNoBucket(item, bucket);
      if (p) achados.push(p);
    }
  }
  return [...new Set(achados)];
}

/**
 * Troca, no objeto, cada valor que aponta para `bucket` pela URL assinada
 * correspondente. **Não muda o que não reconhece** — URL de terceiro, link do
 * SharePoint e caminho de outro bucket passam intactos, porque o histórico
 * destes campos é misto (o `rh_documentos.storage_path`, por exemplo, guarda
 * link do SharePoint em parte das linhas).
 *
 * ⚠️ Devolve um objeto NOVO (não muta a linha vinda do banco): a mesma linha
 * pode ser reusada noutro ponto da resposta, e assinar duas vezes produziria
 * URL de URL.
 */
function aplicarAssinaturas(obj, campos, bucket, mapaAssinado) {
  if (!obj) return obj;
  const saida = { ...obj };
  for (const campo of campos || []) {
    const v = obj[campo];
    if (Array.isArray(v)) {
      saida[campo] = v.map((item) => {
        const p = caminhoNoBucket(item, bucket);
        return (p && mapaAssinado[p]) ? mapaAssinado[p] : item;
      });
    } else if (v != null) {
      const p = caminhoNoBucket(v, bucket);
      if (p && mapaAssinado[p]) saida[campo] = mapaAssinado[p];
    }
  }
  return saida;
}

module.exports = {
  MARCA_PUBLICA,
  caminhoNoBucket,
  caminhoSeguro,
  caminhosDosCampos,
  aplicarAssinaturas,
};
