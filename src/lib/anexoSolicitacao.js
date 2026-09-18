// ════════════════════════════════════════════════════════════════════════════
//  Anexo de solicitação · "isto é imagem ou é arquivo?" e "qual é o nome dele?"
//
//  Pedido do Matheus (03/09/2026): *"nas solicitacoes, gostaria que tivesse a
//  funcionalidade para anexar PDF (arquivo), pois as vezes tem propostas e
//  orcamentos por pdf e etc."*
//
//  ⚠️⚠️ POR QUE ISTO É UM MÓDULO PURO, e não um `if` dentro do componente
//  Ele decide se a tela renderiza `<img src=...>` ou um card de arquivo. Errar
//  para o lado da imagem produz **imagem quebrada em silêncio** — o anexo
//  aparece como um quadrado vazio e ninguém descobre que o orçamento está lá.
//  Guarda que decide algo e vive dentro do componente é guarda que nenhum
//  mutante do gate alcança (lição de 01/09, `escalaLinhaEquipe`).
//
//  ⚠️⚠️ A URL QUE CHEGA NA TELA É ASSINADA, com query string
//  `anexosSolicitacao.js` troca a URL gravada por uma `createSignedUrls`, que
//  termina em `?token=<jwt>`. Um `.endsWith('.pdf')` ingênuo devolve **false**
//  para TODO PDF do sistema — ou seja, a régua erraria exatamente no formato
//  que ela existe para reconhecer. Por isso `?` e `#` são cortados antes de
//  olhar a extensão.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extensões que o navegador desenha dentro de `<img>`.
 * ⚠️ `svg` fica FORA de propósito: é documento executável (pode carregar script)
 * e o anexo vem de upload de terceiro — renderizá-lo inline é superfície de XSS.
 * Ele cai no card de arquivo, que abre em aba nova, e não perde nada.
 */
const EXT_IMAGEM = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif']);

/** Tira query (`?token=`), fragmento e barra final. Devolve '' se não sobrar nada. */
function semQuery(url) {
  return String(url || '').trim().split('?')[0].split('#')[0].replace(/\/+$/, '');
}

/** Último segmento do caminho, com percent-encoding desfeito quando possível. */
function ultimoSegmento(url) {
  let limpo = semQuery(url);
  if (!limpo) return '';
  // ⚠️ URL absoluta sem caminho (`https://host/`) tem o HOST como último
  // segmento — devolvê-lo daria um card chamado "abc.supabase.co". Corta o
  // esquema+host e, sem caminho nenhum, devolve vazio (o chamador rotula).
  const abs = limpo.match(/^https?:\/\/[^/]+(\/.*)?$/i);
  if (abs) limpo = (abs[1] || '').replace(/^\/+/, '');
  if (!limpo) return '';
  const bruto = limpo.split('/').pop() || '';
  try {
    return decodeURIComponent(bruto);
  } catch {
    return bruto; // percent-encoding quebrado: melhor o nome cru que nada
  }
}

/** Extensão em minúsculas, sem o ponto. '' quando não há. */
function extensaoDe(url) {
  const nome = ultimoSegmento(url);
  const i = nome.lastIndexOf('.');
  if (i <= 0 || i === nome.length - 1) return '';
  return nome.slice(i + 1).toLowerCase();
}

/**
 * A tela pode desenhar isto como imagem?
 *
 * ⚠️⚠️ FAIL-CLOSED: sem extensão reconhecível devolve **false** (vira card de
 * arquivo). O card com o nome escrito é legível em qualquer caso; a imagem
 * quebrada não diz nada a ninguém. Na dúvida, o estado honesto é "arquivo".
 */
export function ehImagem(url) {
  return EXT_IMAGEM.has(extensaoDe(url));
}

/**
 * Nome legível do anexo, para o card de arquivo.
 *
 * ⚠️ O upload embute o nome original sanitizado no CAMINHO
 * (`anexos/<ts>-<rand>-orcamento-alfa.pdf`) porque não existe coluna para
 * guardá-lo — então é daqui que ele volta. O prefixo técnico é removido para a
 * pessoa ler "orcamento-alfa.pdf", e não o carimbo de tempo.
 */
export function nomeDoArquivo(url) {
  const nome = ultimoSegmento(url);
  if (!nome) return 'arquivo';
  // <13+ dígitos de timestamp>-<aleatório>-<nome real>
  const semPrefixo = nome.replace(/^\d{10,}-[a-z0-9]{4,}-/i, '');
  return (semPrefixo || nome).slice(0, 80);
}

/**
 * Rótulo curto do tipo, para o card ("PDF", "DOCX", "ARQUIVO").
 * ⚠️ Só é exibido quando NÃO é imagem — imagem se identifica sozinha.
 */
export function rotuloTipo(url) {
  const ext = extensaoDe(url);
  return ext ? ext.toUpperCase().slice(0, 5) : 'ARQUIVO';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Limites e caminho do upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ O backend já capa em 5 (`imagensNorm ... .slice(0, 5)`), e o front capava
 * em 3 — o 4º e o 5º arquivo do app do Staff sumiam **sem erro**. Uma régua só.
 */
export const MAX_ANEXOS = 5;

/**
 * ⚠️ O texto do dropzone promete "até 10 MB" desde sempre e **nada validava** —
 * o bucket está com `file_size_limit: null`. Proposta de fornecedor em PDF passa
 * de 10 MB com frequência, e o estouro chegava como erro cru do Storage.
 */
export const LIMITE_ARQUIVO_MB = 10;
const LIMITE_BYTES = LIMITE_ARQUIVO_MB * 1024 * 1024;

/** Extensões que o intake aceita. Fechada: o que não está aqui não sobe. */
const EXT_ACEITAS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);
export const ACCEPT_ANEXOS = '.pdf,.jpg,.jpeg,.png,.webp';

/**
 * Valida a LISTA INTEIRA antes de subir o primeiro byte.
 *
 * ⚠️⚠️ Validar arquivo a arquivo durante o laço de upload é o que faz o 3º
 * arquivo estourar DEPOIS de os dois primeiros já estarem no bucket: a
 * solicitação não é criada, e os que subiram viram órfãos permanentes. Aqui a
 * resposta é tudo-ou-nada, antes de qualquer rede.
 *
 * Devolve `{ ok, erro }` — `erro` é a frase pronta pra tela (nomeia o arquivo).
 */
export function validarAnexos(arquivos, opcoes) {
  const lista = Array.isArray(arquivos) ? arquivos.filter(Boolean) : [];
  // ⚠️ O TETO só vale para a caixa de anexos gerais. Foto por item de compra e
  // comprovante têm slots próprios: contá-los junto bloquearia um pedido
  // legítimo de 10 itens com foto. Formato e tamanho valem para todos.
  // ⚠️ `Number.isFinite(Infinity)` é FALSE — usá-lo aqui faria `max: Infinity`
  // cair no default e o teto voltar a valer em silêncio (pego pelo teste).
  const maxPedido = opcoes ? opcoes.max : undefined;
  const max = typeof maxPedido === 'number' && !Number.isNaN(maxPedido) && maxPedido > 0
    ? maxPedido
    : MAX_ANEXOS;
  if (lista.length > max) {
    return { ok: false, erro: `Máximo de ${max} anexos por solicitação (você escolheu ${lista.length}).` };
  }
  for (const f of lista) {
    const nome = String(f?.name || 'arquivo');
    const ext = nome.includes('.') ? nome.split('.').pop().toLowerCase() : '';
    if (!EXT_ACEITAS.has(ext)) {
      return { ok: false, erro: `"${nome}": formato não aceito. Envie PDF, JPG, PNG ou WEBP.` };
    }
    // ⚠️ `size` ausente não bloqueia: em alguns caminhos (app, drag de fonte
    // exótica) ele vem indefinido, e recusar ali barraria anexo legítimo. O teto
    // do bucket é a rede de segurança para esse caso.
    if (Number.isFinite(f?.size) && f.size > LIMITE_BYTES) {
      const mb = (f.size / 1024 / 1024).toFixed(1);
      return { ok: false, erro: `"${nome}" tem ${mb} MB — o limite é ${LIMITE_ARQUIVO_MB} MB por arquivo.` };
    }
  }
  return { ok: true, erro: null };
}

/**
 * Nome seguro para virar parte de um caminho do Storage.
 * ⚠️ Acento, espaço e `/` fazem o Storage engasgar ou escapam da pasta. O
 * resultado é sempre `[a-z0-9-_.]`, sem `..` e sem barra.
 */
export function sanitizarNome(nome) {
  const bruto = String(nome || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const limpo = bruto
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .toLowerCase();
  return limpo.slice(0, 60) || 'arquivo';
}

/**
 * Caminho do arquivo no bucket, com o NOME ORIGINAL embutido.
 *
 * ⚠️⚠️ É o que faz "Orçamento Alfa.pdf" sobreviver SEM coluna nova: `imagens_url`
 * é um array de strings e não carrega nome. Sem isto, o diretor com 3 propostas
 * anexadas vê três links idênticos e precisa abrir os três pra saber qual é de
 * qual fornecedor — perda funcional, não desconforto de nomenclatura.
 * `nomeDoArquivo()` (acima) é quem desfaz o prefixo na leitura.
 */
export function caminhoDeUpload(pasta, nome, agoraMs, aleatorio) {
  const ts = Number.isFinite(agoraMs) ? agoraMs : Date.now();
  const rnd = aleatorio || Math.random().toString(36).slice(2, 8);
  return `${pasta}/${ts}-${rnd}-${sanitizarNome(nome)}`;
}
