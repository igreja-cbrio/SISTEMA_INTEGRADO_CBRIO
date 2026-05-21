// =====================================================================
// cerebroContext · coleta TODO o markdown do vault "Cerebro CBRio"
// pra injetar como contexto institucional em apresentacoes geradas por IA
// =====================================================================
// Estrategia:
//   1. Lista recursivamente todos os .md da biblioteca SharePoint
//      "Cerebro CBRio" via Microsoft Graph
//   2. Baixa o conteudo em paralelo (concurrency 6)
//   3. Concatena com cabeçalho de path por nota
//   4. Trunca em MAX_CHARS pra caber no contexto do Sonnet com folga
//   5. Cache em memoria com TTL · um cold start pode demorar mas as
//      proximas chamadas saem na hora
//
// O Cerebro CBRio guarda resumos (gerados pelo Haiku) das documentos do
// SharePoint · entao cada nota ja vem destilada. Perfeita pra alimentar
// outra IA sem estourar o contexto.
// =====================================================================

const { getGraphToken } = require('./storageService');

const HUB_SITE_ID = 'infracbrio.sharepoint.com,04b50f10-ea32-40ba-84bd-44a3b38ee2a7,94fe6af6-f064-455d-afc5-67a377f5e82c';
const VAULT_NAME = 'Cerebro CBRio';

// Sonnet aceita 200K tokens · system+prompt+output usam ~25K · sobra ~175K
// pro contexto. A 4 chars/token, 200K chars = ~50K tokens. Folga grande.
const DEFAULT_MAX_CHARS = 200_000;

// Cache em memoria (sobrevive entre invocacoes warm da serverless)
let _cache = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15min

// Concorrencia ao baixar arquivos
const DOWNLOAD_CONCURRENCY = 6;

// ─────────────────────────────────────────────────────────────────────
// Helpers de Graph API
// ─────────────────────────────────────────────────────────────────────
async function graphFetch(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph ${res.status} ${url.slice(0, 120)}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function obterVaultDriveId(token) {
  const data = await graphFetch(`https://graph.microsoft.com/v1.0/sites/${HUB_SITE_ID}/drives`, token);
  const drive = (data.value || []).find(d => d.name === VAULT_NAME);
  if (!drive) throw new Error(`Biblioteca "${VAULT_NAME}" nao encontrada no CBRio Hub`);
  return drive.id;
}

// Lista arquivos .md recursivamente · DFS com fila de pastas a visitar
async function listarMarkdownsRecursivo(token, driveId) {
  const itens = [];
  const fila = [{ pasta: 'root', caminho: '' }]; // pasta=itemId | 'root'

  while (fila.length > 0) {
    const { pasta, caminho } = fila.shift();
    const url = pasta === 'root'
      ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children?$top=200&$select=id,name,size,folder,file,lastModifiedDateTime`
      : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${pasta}/children?$top=200&$select=id,name,size,folder,file,lastModifiedDateTime`;

    let next = url;
    while (next) {
      const page = await graphFetch(next, token);
      for (const it of page.value || []) {
        if (it.folder) {
          fila.push({ pasta: it.id, caminho: caminho ? `${caminho}/${it.name}` : it.name });
        } else if (it.file && it.name.toLowerCase().endsWith('.md')) {
          // Ignora AGENTE-REGRAS.md · sao instrucoes do processador, nao contexto
          if (it.name === 'AGENTE-REGRAS.md') continue;
          itens.push({
            itemId: it.id,
            nome: it.name,
            caminho: caminho ? `${caminho}/${it.name}` : it.name,
            tamanho: it.size || 0,
            modificadoEm: it.lastModifiedDateTime,
          });
        }
      }
      next = page['@odata.nextLink'] || null;
    }
  }

  // Mais recente primeiro · se truncar, mantemos o que esta atualizado
  itens.sort((a, b) => (b.modificadoEm || '').localeCompare(a.modificadoEm || ''));
  return itens;
}

async function baixarConteudo(token, driveId, itemId) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Download falhou (${res.status}) item ${itemId}`);
  return res.text();
}

// Pool simples de promises com concorrencia fixa
async function executarComConcorrencia(itens, fn, concorrencia) {
  const resultados = new Array(itens.length);
  let proximo = 0;

  async function worker() {
    while (true) {
      const idx = proximo++;
      if (idx >= itens.length) return;
      try {
        resultados[idx] = { ok: true, valor: await fn(itens[idx], idx) };
      } catch (e) {
        resultados[idx] = { ok: false, erro: e.message };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concorrencia, itens.length) }, () => worker());
  await Promise.all(workers);
  return resultados;
}

// ─────────────────────────────────────────────────────────────────────
// API publica · coleta + cache
// ─────────────────────────────────────────────────────────────────────
async function _coletarCompleto(maxChars) {
  const t0 = Date.now();
  const token = await getGraphToken();
  const driveId = await obterVaultDriveId(token);
  const lista = await listarMarkdownsRecursivo(token, driveId);

  if (lista.length === 0) {
    return {
      textoCompleto: '',
      totalNotas: 0,
      notasIncluidas: 0,
      totalChars: 0,
      truncado: false,
      duracaoMs: Date.now() - t0,
    };
  }

  // Baixa em paralelo
  const conteudos = await executarComConcorrencia(
    lista,
    (n) => baixarConteudo(token, driveId, n.itemId),
    DOWNLOAD_CONCURRENCY
  );

  // Concatena ate maxChars
  const partes = [];
  let totalChars = 0;
  let notasIncluidas = 0;
  let truncado = false;

  for (let i = 0; i < lista.length; i++) {
    const r = conteudos[i];
    if (!r || !r.ok) continue;
    const corpo = String(r.valor || '').trim();
    if (!corpo) continue;

    const bloco = `\n\n## ${lista[i].caminho}\n\n${corpo}\n`;
    if (totalChars + bloco.length > maxChars) {
      truncado = true;
      break;
    }
    partes.push(bloco);
    totalChars += bloco.length;
    notasIncluidas++;
  }

  return {
    textoCompleto: partes.join(''),
    totalNotas: lista.length,
    notasIncluidas,
    totalChars,
    truncado,
    duracaoMs: Date.now() - t0,
  };
}

async function coletarContextoCompleto({ maxChars = DEFAULT_MAX_CHARS, ignorarCache = false } = {}) {
  if (!ignorarCache && _cache && Date.now() < _cacheExpiry) {
    return { ..._cache, doCache: true };
  }

  const resultado = await _coletarCompleto(maxChars);
  _cache = resultado;
  _cacheExpiry = Date.now() + CACHE_TTL_MS;
  return { ...resultado, doCache: false };
}

function bustCache() {
  _cache = null;
  _cacheExpiry = 0;
}

module.exports = {
  coletarContextoCompleto,
  bustCache,
  DEFAULT_MAX_CHARS,
};
