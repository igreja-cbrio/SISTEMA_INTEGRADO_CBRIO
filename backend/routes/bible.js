// ============================================================================
// Bible API proxy — encaminha chamadas para api.bible (https://rest.api.bible)
// Mantem a chave server-side e cacheia respostas em memória por 24h
// (Bíblia raramente muda · reduz chamadas no rate limit gratuito).
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const API_BASE = 'https://rest.api.bible/v1';
// Sem fallback literal: a chave NUNCA fica no código (estava versionada → rotacionar).
// Exige BIBLE_API_KEY no ambiente; sem ela, fetchBible falha fechado (503).
const API_KEY = process.env.BIBLE_API_KEY;

const cache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;

async function fetchBible(path, query) {
  if (!API_KEY) {
    const e = new Error('BIBLE_API_KEY não configurada no ambiente');
    e.status = 503;
    throw e;
  }
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const url = `${API_BASE}${path}${qs}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;

  const res = await fetch(url, { headers: { 'api-key': API_KEY } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let upstreamMsg = text.slice(0, 200);
    try { upstreamMsg = JSON.parse(text).message || upstreamMsg; } catch {}
    const err = new Error(`api.bible ${res.status}: ${upstreamMsg}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  cache.set(url, { ts: Date.now(), data });
  return data;
}

function handleErr(res, e, fallbackMsg) {
  const status = e.status || 500;
  const msg = status === 401
    ? 'Chave da api.bible invalida ou não configurada (BIBLE_API_KEY)'
    : (e.message || fallbackMsg);
  res.status(status).json({ error: msg });
}

// GET /api/bible/bibles?language=por
router.get('/bibles', async (req, res) => {
  try {
    const data = await fetchBible('/bibles', req.query.language ? { language: req.query.language } : undefined);
    res.json(data);
  } catch (e) {
    console.error('bible/bibles:', e.message);
    handleErr(res, e, 'Erro ao listar Biblias');
  }
});

// GET /api/bible/bibles/:bibleId/books
router.get('/bibles/:bibleId/books', async (req, res) => {
  try {
    const data = await fetchBible(`/bibles/${req.params.bibleId}/books`);
    res.json(data);
  } catch (e) {
    console.error('bible/books:', e.message);
    handleErr(res, e, 'Erro ao listar livros');
  }
});

// GET /api/bible/bibles/:bibleId/books/:bookId/chapters
router.get('/bibles/:bibleId/books/:bookId/chapters', async (req, res) => {
  try {
    const data = await fetchBible(`/bibles/${req.params.bibleId}/books/${req.params.bookId}/chapters`);
    res.json(data);
  } catch (e) {
    console.error('bible/chapters:', e.message);
    handleErr(res, e, 'Erro ao listar capítulos');
  }
});

// GET /api/bible/bibles/:bibleId/chapters/:chapterId
//   ?content-type=text|html (default text)
router.get('/bibles/:bibleId/chapters/:chapterId', async (req, res) => {
  try {
    const q = {
      'content-type': req.query['content-type'] || 'text',
      'include-notes': 'false',
      'include-titles': 'true',
      'include-chapter-numbers': 'false',
      'include-verse-numbers': 'true',
      'include-verse-spans': 'false',
    };
    const data = await fetchBible(`/bibles/${req.params.bibleId}/chapters/${req.params.chapterId}`, q);
    res.json(data);
  } catch (e) {
    console.error('bible/chapter:', e.message);
    handleErr(res, e, 'Erro ao buscar capítulo');
  }
});

module.exports = router;
