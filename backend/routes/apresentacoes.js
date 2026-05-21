// =====================================================================
// /api/apresentacoes · CRUD + geracao IA + viewer publico
// =====================================================================
// Nivel minimo 3 (lider+) pra criar/editar. Nivel 1 ve a propria lista.
// Geracao sincrona dentro do timeout do Vercel (60s Hobby).
// =====================================================================

const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { extractText } = require('../services/textExtractor');
const { gerarApresentacao, MODEL_DEFAULT, MODEL_PREMIUM, PRICING } = require('../services/apresentacaoGenerator');

// Multer em memoria · arquivos pequenos (15MB max por arquivo)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 6 },
});

// Endpoint publico do viewer (HTML montado) NAO vai aqui · veja
// /api/apresentacoes/:id/render abaixo · ele retorna HTML pra iframe
// e exige auth via header tambem.

router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/apresentacoes · lista do usuario logado (admin ve tudo)
// query: limit (default 50), status (filtro)
// ─────────────────────────────────────────────────────────────
router.get('/', authorizeModule('apresentacoes', 1), async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'diretor';
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const status = req.query.status;

    let q = supabase
      .from('apresentacoes')
      .select('id, profile_id, titulo, tom, status, slides_count, custo_usd, created_at, generated_at, erro_mensagem')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!isAdmin) q = q.eq('profile_id', req.user.id);
    if (status)   q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (e) {
    console.error('apresentacoes list:', e.message);
    res.status(500).json({ error: 'Erro ao listar apresentacoes' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/apresentacoes/contexto/explorar-vault
// Lista TODOS os .md do vault Cerebro CBRio recursivamente · admin
// usa pra descobrir o que ja existe e me passar a lista pra eu
// decidir o que injetar no contexto das apresentacoes.
// ─────────────────────────────────────────────────────────────
router.get('/contexto/explorar-vault', authorizeModule('apresentacoes', 5), async (req, res) => {
  try {
    const { getGraphToken } = require('../services/storageService');
    const HUB_SITE_ID = 'infracbrio.sharepoint.com,04b50f10-ea32-40ba-84bd-44a3b38ee2a7,94fe6af6-f064-455d-afc5-67a377f5e82c';

    const token = await getGraphToken();

    // Descobre drive do vault
    const drivesRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${HUB_SITE_ID}/drives`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!drivesRes.ok) {
      return res.status(500).json({ error: 'Falha ao listar drives', status: drivesRes.status });
    }
    const drives = await drivesRes.json();
    const vault = drives.value?.find(d => d.name === 'Cerebro CBRio');
    if (!vault) {
      return res.status(404).json({
        error: 'Drive "Cerebro CBRio" nao encontrado',
        drives_disponiveis: drives.value?.map(d => d.name) || [],
      });
    }

    // BFS · lista recursivo
    async function listChildren(folderEndpoint) {
      const r = await fetch(folderEndpoint + '?$top=200&$select=id,name,file,folder,size,parentReference', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return [];
      const j = await r.json();
      return j.value || [];
    }

    const arquivos = [];
    const pastas = [];
    const queue = [{
      endpoint: `https://graph.microsoft.com/v1.0/drives/${vault.id}/root/children`,
      path: '/',
    }];

    let visitados = 0;
    const MAX = 100;

    while (queue.length > 0 && visitados < MAX) {
      const { endpoint, path } = queue.shift();
      visitados++;
      const children = await listChildren(endpoint);
      for (const item of children) {
        const fullPath = path + item.name;
        if (item.folder) {
          pastas.push({ path: fullPath + '/', count: item.folder.childCount });
          queue.push({
            endpoint: `https://graph.microsoft.com/v1.0/drives/${vault.id}/items/${item.id}/children`,
            path: fullPath + '/',
          });
        } else if (item.file) {
          // Lista TODOS os arquivos (nao so .md) pra Marcos ver
          arquivos.push({
            path: fullPath,
            nome: item.name,
            tamanho: item.size,
            md: /\.md$/i.test(item.name),
          });
        }
      }
    }

    res.json({
      vault_drive: { id: vault.id, nome: vault.name },
      total_pastas: pastas.length,
      total_arquivos: arquivos.length,
      total_md: arquivos.filter(a => a.md).length,
      visitados_recursao: visitados,
      pastas: pastas.sort((a, b) => a.path.localeCompare(b.path)),
      arquivos_md: arquivos.filter(a => a.md).sort((a, b) => a.path.localeCompare(b.path)),
      outros_arquivos_amostra: arquivos.filter(a => !a.md).slice(0, 30),
    });
  } catch (e) {
    console.error('explorar-vault:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/apresentacoes/contexto/ler-arquivo?path=...
// Le conteudo de um arquivo .md especifico do vault · admin usa
// pra confirmar conteudo antes de injetar no contexto.
// ─────────────────────────────────────────────────────────────
router.get('/contexto/ler-arquivo', authorizeModule('apresentacoes', 5), async (req, res) => {
  try {
    const path = req.query.path;
    if (!path || !path.startsWith('/')) {
      return res.status(400).json({ error: 'parametro path obrigatorio · formato /pasta/arquivo.md' });
    }
    const { getGraphToken } = require('../services/storageService');
    const HUB_SITE_ID = 'infracbrio.sharepoint.com,04b50f10-ea32-40ba-84bd-44a3b38ee2a7,94fe6af6-f064-455d-afc5-67a377f5e82c';
    const token = await getGraphToken();
    const drivesRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${HUB_SITE_ID}/drives`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const drives = await drivesRes.json();
    const vault = drives.value?.find(d => d.name === 'Cerebro CBRio');
    if (!vault) return res.status(404).json({ error: 'vault nao encontrado' });

    const cleanPath = path.replace(/^\//, '');
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${vault.id}/root:/${encodeURIComponent(cleanPath).replace(/%2F/g, '/')}:/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) return res.status(r.status).json({ error: 'arquivo nao encontrado', status: r.status });
    const conteudo = await r.text();
    res.json({ path, tamanho: conteudo.length, conteudo });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/apresentacoes/:id · detalhe (sem html/css pra UI leve)
// ─────────────────────────────────────────────────────────────
router.get('/:id', authorizeModule('apresentacoes', 1), async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'diretor';

    const { data: apres, error } = await supabase
      .from('apresentacoes')
      .select('id, profile_id, titulo, prompt, tom, modelo_ia, usar_contexto_cerebro, status, slides_count, slides_html, slides_css, tokens_input, tokens_output, custo_usd, duracao_ms, erro_mensagem, created_at, generated_at')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!apres) return res.status(404).json({ error: 'Apresentacao nao encontrada' });
    if (!isAdmin && apres.profile_id !== req.user.id) {
      return res.status(403).json({ error: 'Sem acesso a esta apresentacao' });
    }

    const { data: arquivos } = await supabase
      .from('apresentacoes_arquivos')
      .select('id, nome, mime_type, tamanho_bytes, created_at')
      .eq('apresentacao_id', apres.id)
      .order('created_at', { ascending: true });

    res.json({ apresentacao: apres, arquivos: arquivos || [] });
  } catch (e) {
    console.error('apresentacoes get:', e.message);
    res.status(500).json({ error: 'Erro ao buscar apresentacao' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/apresentacoes · cria registro pendente
// body: { titulo, prompt, tom? }
// retorno: { id, status: 'pendente' }
// ─────────────────────────────────────────────────────────────
router.post('/', authorizeModule('apresentacoes', 3), async (req, res) => {
  try {
    const { titulo, prompt, tom, modelo, usar_contexto_cerebro } = req.body || {};
    if (!titulo || titulo.length < 3) {
      return res.status(400).json({ error: 'titulo obrigatorio (min 3 chars)' });
    }
    if (!prompt || prompt.length < 20) {
      return res.status(400).json({ error: 'prompt obrigatorio (min 20 chars · descreva o que quer apresentar)' });
    }

    // Valida modelo (so aceita ids conhecidos no PRICING map)
    const modeloFinal = modelo && PRICING[modelo] ? modelo : MODEL_DEFAULT;

    const { data, error } = await supabase
      .from('apresentacoes')
      .insert({
        profile_id: req.user.id,
        titulo: String(titulo).slice(0, 200),
        prompt: String(prompt).slice(0, 8000),
        tom: ['executivo', 'comercial', 'relatorio', 'criativo'].includes(tom) ? tom : 'executivo',
        modelo_ia: modeloFinal,
        usar_contexto_cerebro: !!usar_contexto_cerebro,
        status: 'pendente',
      })
      .select('id, status')
      .single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (e) {
    console.error('apresentacoes create:', e.message);
    res.status(500).json({ error: 'Erro ao criar apresentacao' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/apresentacoes/:id/arquivos · upload (1+ files)
// multipart/form-data com campo `files`
// ─────────────────────────────────────────────────────────────
router.post('/:id/arquivos', authorizeModule('apresentacoes', 3), upload.array('files', 6), async (req, res) => {
  try {
    const { data: apres, error: e1 } = await supabase
      .from('apresentacoes')
      .select('id, profile_id, status')
      .eq('id', req.params.id)
      .single();
    if (e1) throw e1;
    if (!apres) return res.status(404).json({ error: 'Apresentacao nao encontrada' });
    if (apres.profile_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem acesso' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado (campo: files)' });
    }

    const inseridos = [];
    for (const f of req.files) {
      const texto = await extractText(f.buffer, f.mimetype, f.originalname, 15000)
        .catch(err => `[Erro ao extrair texto: ${err.message}]`);

      const { data: row, error: e2 } = await supabase
        .from('apresentacoes_arquivos')
        .insert({
          apresentacao_id: apres.id,
          nome: f.originalname,
          mime_type: f.mimetype,
          tamanho_bytes: f.size,
          texto_extraido: texto,
        })
        .select('id, nome, mime_type, tamanho_bytes')
        .single();
      if (e2) throw e2;
      inseridos.push(row);
    }

    res.status(201).json({ arquivos: inseridos });
  } catch (e) {
    console.error('apresentacoes upload:', e.message);
    res.status(500).json({ error: 'Erro ao processar upload · ' + e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/apresentacoes/:id/arquivos/:arquivoId
// ─────────────────────────────────────────────────────────────
router.delete('/:id/arquivos/:arquivoId', authorizeModule('apresentacoes', 3), async (req, res) => {
  try {
    const { data: apres } = await supabase
      .from('apresentacoes')
      .select('id, profile_id')
      .eq('id', req.params.id)
      .single();
    if (!apres) return res.status(404).end();
    if (apres.profile_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem acesso' });
    }
    const { error } = await supabase
      .from('apresentacoes_arquivos')
      .delete()
      .eq('id', req.params.arquivoId)
      .eq('apresentacao_id', apres.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('apres arq delete:', e.message);
    res.status(500).json({ error: 'Erro ao deletar arquivo' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/apresentacoes/:id/gerar · executa Claude Opus sincrono
// body: { regenerar? } · se regenerar=true, sobrescreve mesmo se status=pronto
// ─────────────────────────────────────────────────────────────
router.post('/:id/gerar', authorizeModule('apresentacoes', 3), async (req, res) => {
  try {
    const { data: apres, error: e1 } = await supabase
      .from('apresentacoes')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (e1) throw e1;
    if (!apres) return res.status(404).json({ error: 'Apresentacao nao encontrada' });
    if (apres.profile_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem acesso a esta apresentacao' });
    }
    if (apres.status === 'gerando') {
      return res.status(409).json({ error: 'Apresentacao ja esta sendo gerada' });
    }
    if (apres.status === 'pronto' && !req.body?.regenerar) {
      return res.status(409).json({ error: 'Ja gerada · use regenerar=true pra sobrescrever' });
    }

    // Carrega arquivos com texto extraido (contexto CBRio vem do codigo,
    // veja backend/services/apresentacaoContextoCbrio.js)
    const { data: arquivos } = await supabase
      .from('apresentacoes_arquivos')
      .select('nome, texto_extraido')
      .eq('apresentacao_id', apres.id)
      .order('created_at', { ascending: true });

    // Marca como gerando
    await supabase.from('apresentacoes')
      .update({ status: 'gerando', erro_mensagem: null })
      .eq('id', apres.id);

    // Coleta contexto do Cerebro CBRio se solicitado · pode demorar no cold start
    // (lista + baixa dezenas/centenas de .md do SharePoint). Cache 15min ameniza.
    let contextoCerebro = null;
    if (apres.usar_contexto_cerebro) {
      try {
        const { coletarContextoCompleto } = require('../services/cerebroContext');
        contextoCerebro = await coletarContextoCompleto();
        console.log(`[apresentacoes] contexto Cerebro: ${contextoCerebro.notasIncluidas}/${contextoCerebro.totalNotas} notas, ${contextoCerebro.totalChars} chars, ${contextoCerebro.doCache ? 'cache' : 'fresco'} (${contextoCerebro.duracaoMs}ms)`);
      } catch (ctxErr) {
        console.warn('[apresentacoes] falha ao coletar contexto Cerebro (segue sem):', ctxErr.message);
      }
    }

    try {
      const r = await gerarApresentacao({
        titulo:   apres.titulo,
        prompt:   apres.prompt,
        tom:      apres.tom,
        arquivos: arquivos || [],
        modelo:   apres.modelo_ia,
        contextoCerebro,
      });

      const { error: e2 } = await supabase.from('apresentacoes')
        .update({
          status: 'pronto',
          slides_html: r.html,
          slides_css:  r.css,
          slides_count: r.slides_count,
          tokens_input:  r.tokens_input,
          tokens_output: r.tokens_output,
          custo_usd:     r.custo_usd,
          duracao_ms:    r.duracao_ms,
          modelo_ia:     r.modelo,
          generated_at:  new Date().toISOString(),
        })
        .eq('id', apres.id);
      if (e2) throw e2;

      // Agrega telemetria diaria · best effort (upsert · soma manual se ja existir)
      try {
        const hoje = new Date().toISOString().slice(0, 10);
        const { data: existing } = await supabase
          .from('apresentacoes_uso')
          .select('total_geradas, tokens_input, tokens_output, custo_usd')
          .eq('data', hoje)
          .eq('profile_id', req.user.id)
          .eq('modelo_ia', r.modelo)
          .maybeSingle();

        const novo = {
          data: hoje,
          profile_id: req.user.id,
          modelo_ia: r.modelo,
          total_geradas:  (existing?.total_geradas  || 0) + 1,
          tokens_input:   (existing?.tokens_input   || 0) + r.tokens_input,
          tokens_output:  (existing?.tokens_output  || 0) + r.tokens_output,
          custo_usd:     ((Number(existing?.custo_usd) || 0) + r.custo_usd).toFixed(4),
        };
        await supabase.from('apresentacoes_uso').upsert(novo, {
          onConflict: 'data,profile_id,modelo_ia',
        });
      } catch (telErr) {
        console.warn('[apresentacoes] telemetria falhou (nao critico):', telErr.message);
      }

      // Notifica o solicitante
      try {
        const { notificar } = require('../services/notificar');
        await notificar({
          modulo: 'apresentacoes',
          tipo: 'apresentacao_pronta',
          titulo: 'Apresentação pronta',
          mensagem: `"${apres.titulo}" foi gerada (${r.slides_count} slides)`,
          link: `/admin/apresentacoes/${apres.id}`,
          severidade: 'info',
          chaveDedup: `apresentacao_${apres.id}`,
          targetIds: [req.user.id],
        });
      } catch (notifErr) {
        console.warn('[apresentacoes] notificacao falhou (nao critico):', notifErr.message);
      }

      res.json({
        status: 'pronto',
        slides_count: r.slides_count,
        custo_usd: r.custo_usd,
        duracao_ms: r.duracao_ms,
      });

    } catch (genErr) {
      console.error('[apresentacoes] geracao falhou:', genErr.message);
      await supabase.from('apresentacoes')
        .update({ status: 'erro', erro_mensagem: String(genErr.message).slice(0, 1000) })
        .eq('id', apres.id);
      res.status(500).json({ error: 'Geracao falhou: ' + genErr.message });
    }

  } catch (e) {
    console.error('apresentacoes gerar:', e.message);
    res.status(500).json({ error: 'Erro ao iniciar geracao · ' + e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/apresentacoes/:id/reset · marca como erro se travada
// em 'gerando' ha mais de 90s (timeout da Vercel ja deve ter matado).
// Permite ao usuario destravar e clicar "Tentar novamente".
// ─────────────────────────────────────────────────────────────
router.post('/:id/reset', authorizeModule('apresentacoes', 3), async (req, res) => {
  try {
    const { data: apres } = await supabase
      .from('apresentacoes')
      .select('id, profile_id, status, updated_at')
      .eq('id', req.params.id)
      .single();
    if (!apres) return res.status(404).end();
    if (apres.profile_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem acesso' });
    }
    if (apres.status !== 'gerando') {
      return res.status(409).json({ error: `Status atual: ${apres.status} · reset so vale pra 'gerando'` });
    }
    const idadeMs = Date.now() - new Date(apres.updated_at).getTime();
    if (idadeMs < 300_000) {
      return res.status(409).json({
        error: 'Aguarde · ainda esta dentro do tempo normal de geracao (5min)',
        idade_segundos: Math.floor(idadeMs / 1000),
      });
    }
    const { error } = await supabase
      .from('apresentacoes')
      .update({
        status: 'erro',
        erro_mensagem: 'Timeout · function Vercel limita 5min. Tente com prompt mais enxuto.',
      })
      .eq('id', apres.id);
    if (error) throw error;
    res.json({ status: 'erro', idade_segundos: Math.floor(idadeMs / 1000) });
  } catch (e) {
    console.error('apresentacoes reset:', e.message);
    res.status(500).json({ error: 'Erro ao resetar · ' + e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/apresentacoes/:id
// ─────────────────────────────────────────────────────────────
router.delete('/:id', authorizeModule('apresentacoes', 3), async (req, res) => {
  try {
    const { data: apres } = await supabase
      .from('apresentacoes')
      .select('id, profile_id')
      .eq('id', req.params.id)
      .single();
    if (!apres) return res.status(404).end();
    if (apres.profile_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem acesso' });
    }
    const { error } = await supabase.from('apresentacoes').delete().eq('id', apres.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('apresentacoes delete:', e.message);
    res.status(500).json({ error: 'Erro ao deletar' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/apresentacoes/:id/render · serve HTML completo
// pra carregar dentro de iframe. Auth via header Bearer (igual outras).
// Aproveita o deck-stage.js servido como asset estatico em /apresentacoes/
// ─────────────────────────────────────────────────────────────
router.get('/:id/render', authorizeModule('apresentacoes', 1), async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'diretor';
    const { data: apres, error } = await supabase
      .from('apresentacoes')
      .select('id, profile_id, titulo, status, slides_html, slides_css')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!apres) return res.status(404).send('Apresentacao nao encontrada');
    if (!isAdmin && apres.profile_id !== req.user.id) {
      return res.status(403).send('Sem acesso');
    }
    if (apres.status !== 'pronto') {
      return res.status(409).send('Apresentacao ainda nao foi gerada');
    }

    // URL absoluta porque o HTML sera carregado dentro de iframe srcDoc
    // (cuja base e' about:srcdoc · paths relativos quebram).
    const frontendOrigin = process.env.FRONTEND_URL
      || (req.get('origin'))
      || `${req.protocol}://${req.get('host')}`;
    const deckStageUrl = `${frontendOrigin.replace(/\/$/, '')}/apresentacoes/deck-stage.js`;

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1920,initial-scale=1" />
<title>${escapeHtml(apres.titulo)}</title>
<style>
  /* Baseline · garante que slides escalonem corretamente */
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; }
  deck-stage:not(:defined) { visibility: hidden; }
  section.slide {
    width: 1920px;
    height: 1080px;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
  }
</style>
<style>
${apres.slides_css || ''}
</style>
<script src="${deckStageUrl}"></script>
</head>
<body>
<deck-stage>
${apres.slides_html || ''}
</deck-stage>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-cache');
    res.send(html);
  } catch (e) {
    console.error('apresentacoes render:', e.message);
    res.status(500).send('Erro ao renderizar');
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────
// GET /api/apresentacoes/uso/resumo · dashboard de custo (admin)
// ─────────────────────────────────────────────────────────────
router.get('/uso/resumo', authorizeModule('apresentacoes', 5), async (req, res) => {
  try {
    const { data: mes } = await supabase.from('vw_apresentacoes_uso_mes').select('*').limit(1);
    const { data: topUsers } = await supabase
      .from('apresentacoes_uso')
      .select('profile_id, total_geradas, custo_usd')
      .gte('data', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
      .order('custo_usd', { ascending: false })
      .limit(10);
    res.json({ mes: mes?.[0] || null, top_users: topUsers || [] });
  } catch (e) {
    console.error('apresentacoes uso:', e.message);
    res.status(500).json({ error: 'Erro ao buscar uso' });
  }
});

module.exports = router;
