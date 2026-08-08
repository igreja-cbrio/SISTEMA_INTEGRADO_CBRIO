// ════════════════════════════════════════════════════════════════════════════
//  LINKS E QR · administração dos links curtos
//
//  A regra que organiza tudo aqui: o SLUG é imutável depois de criado.
//  Trocar o slug é exatamente o que a feature existe para evitar — o slug está
//  impresso no papel. Mudar destino: à vontade, é o ponto. Mudar slug: nunca,
//  porque quebraria em silêncio todo cartaz já pendurado.
// ════════════════════════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule } = require('../middleware/auth');

router.use(authenticate);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

// Nomes que não podem virar slug porque já significam outra coisa para quem lê
// — ou porque um dia podem virar rota nossa.
const RESERVADOS = new Set([
  'api', 'admin', 'app', 'r', 'login', 'logout', 'assets', 'static',
  'privacidade', 'aplicativo', 'null', 'undefined', 'www',
]);

/**
 * Normaliza e valida o destino.
 *
 * A guarda que importa aqui é contra `javascript:` e `data:`. Um redirecionador
 * que aceita esses esquemas vira um vetor de XSS hospedado no nosso domínio: o
 * link parece cbrio.org e executa código de terceiro. O CHECK do banco também
 * barra, mas a mensagem de erro daqui é a que a pessoa lê.
 *
 * Domínio externo É permitido de propósito — muito QR legítimo aponta para
 * YouTube, formulário do Google, wa.me. O controle é quem pode criar (nível 4)
 * e o registro de quem criou, não uma lista de permitidos que engessaria o uso.
 */
function normalizarDestino(bruto) {
  const v = String(bruto || '').trim();
  if (!v) return { erro: 'Informe o destino do link' };
  let u;
  try { u = new URL(v); } catch { return { erro: 'Destino precisa ser uma URL completa (com https://)' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { erro: 'Só aceito destino http ou https' };
  }
  // Redirecionador apontando para si mesmo = laço infinito no celular de quem
  // escaneou. Barro o caminho inteiro, não só o slug exato.
  if (/\/r\/[a-z0-9-]/i.test(u.pathname)) {
    return { erro: 'O destino não pode ser outro link curto — isso criaria um laço' };
  }
  return { destino: u.toString() };
}

function limpar(v, max) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
}

// ── Lista, com contagem de acesso ──────────────────────────────────────────
router.get('/', authorizeModule('links', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_link_curto_stats').select('*').order('criado_em', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Um link, com histórico de destino ──────────────────────────────────────
router.get('/:id', authorizeModule('links', 1), async (req, res) => {
  try {
    const [link, hist, porDia] = await Promise.all([
      supabase.from('link_curto').select('*').eq('id', req.params.id)
        .is('deleted_at', null).maybeSingle(),
      supabase.from('link_curto_destino_hist').select('*')
        .eq('link_id', req.params.id).order('alterado_em', { ascending: false }).limit(50),
      supabase.from('link_curto_acesso').select('em, aparelho')
        .eq('link_id', req.params.id).order('em', { ascending: false }).limit(2000),
    ]);
    if (link.error) throw link.error;
    if (!link.data) return res.status(404).json({ error: 'Link não encontrado' });

    // Agrega os acessos por dia aqui: a tela quer a curva, não 2.000 linhas.
    const dias = {};
    const aparelhos = {};
    for (const a of porDia.data || []) {
      const d = String(a.em).slice(0, 10);
      dias[d] = (dias[d] || 0) + 1;
      aparelhos[a.aparelho || 'outro'] = (aparelhos[a.aparelho || 'outro'] || 0) + 1;
    }
    res.json({
      ...link.data,
      historico: hist.data || [],
      por_dia: Object.entries(dias).map(([dia, total]) => ({ dia, total }))
        .sort((a, b) => a.dia.localeCompare(b.dia)),
      por_aparelho: Object.entries(aparelhos).map(([aparelho, total]) => ({ aparelho, total })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Criar ──────────────────────────────────────────────────────────────────
router.post('/', authorizeModule('links', 4), async (req, res) => {
  try {
    const slug = String(req.body?.slug || '').trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return res.status(400).json({
        error: 'O código deve ter de 3 a 50 caracteres, só letras minúsculas, números e hífen',
      });
    }
    if (RESERVADOS.has(slug)) {
      return res.status(400).json({ error: `"${slug}" é um nome reservado do sistema` });
    }
    const d = normalizarDestino(req.body?.destino);
    if (d.erro) return res.status(400).json({ error: d.erro });
    const titulo = limpar(req.body?.titulo, 160);
    if (!titulo) return res.status(400).json({ error: 'Dê um nome ao link (é como você vai achá-lo depois)' });

    const { data, error } = await supabase.from('link_curto').insert({
      slug, titulo, destino: d.destino,
      descricao: limpar(req.body?.descricao, 500),
      onde: limpar(req.body?.onde, 300),
      criado_por: req.user?.id || null,
      atualizado_por: req.user?.id || null,
    }).select('*').single();

    if (error) {
      // 23505 = unique. A mensagem crua do Postgres não ajuda ninguém.
      if (error.code === '23505') {
        return res.status(409).json({ error: `O código "${slug}" já está em uso` });
      }
      throw error;
    }

    await supabase.from('link_curto_destino_hist').insert({
      link_id: data.id, destino_antigo: null, destino_novo: d.destino,
      alterado_por: req.user?.id || null,
    });
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Atualizar ──────────────────────────────────────────────────────────────
// O slug NÃO entra aqui de propósito: é o que está impresso.
router.put('/:id', authorizeModule('links', 4), async (req, res) => {
  try {
    const { data: atual, error: e0 } = await supabase.from('link_curto')
      .select('id, destino').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) throw e0;
    if (!atual) return res.status(404).json({ error: 'Link não encontrado' });

    const patch = { atualizado_por: req.user?.id || null, atualizado_em: new Date().toISOString() };
    if (req.body?.titulo !== undefined) {
      const t = limpar(req.body.titulo, 160);
      if (!t) return res.status(400).json({ error: 'O nome não pode ficar vazio' });
      patch.titulo = t;
    }
    if (req.body?.descricao !== undefined) patch.descricao = limpar(req.body.descricao, 500);
    if (req.body?.onde !== undefined) patch.onde = limpar(req.body.onde, 300);
    if (req.body?.ativo !== undefined) patch.ativo = req.body.ativo === true;

    let mudouDestino = false;
    if (req.body?.destino !== undefined) {
      const d = normalizarDestino(req.body.destino);
      if (d.erro) return res.status(400).json({ error: d.erro });
      if (d.destino !== atual.destino) { patch.destino = d.destino; mudouDestino = true; }
    }

    const { data, error } = await supabase.from('link_curto')
      .update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    if (mudouDestino) {
      await supabase.from('link_curto_destino_hist').insert({
        link_id: data.id, destino_antigo: atual.destino, destino_novo: patch.destino,
        alterado_por: req.user?.id || null,
      });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Remover ────────────────────────────────────────────────────────────────
// Soft-delete, e mesmo assim é a operação errada quase sempre: se o QR está
// impresso, DESATIVAR mostra uma explicação a quem escaneia; apagar mostra 404.
router.delete('/:id', authorizeModule('links', 5), async (req, res) => {
  try {
    const { error } = await supabase.from('link_curto')
      .update({ deleted_at: new Date().toISOString(), atualizado_por: req.user?.id || null })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Achar-ou-criar por destino ─────────────────────────────────────────────
// É o que o botão "QR dinâmico" do diálogo de compartilhar usa: transforma um
// link que já existe num link curto sem obrigar ninguém a vir até este módulo.
// Reusa quando já existe um link ATIVO para o mesmo destino — senão cada clique
// criaria um slug novo e a lista viraria lixo em uma semana.
router.post('/para-destino', authorizeModule('links', 4), async (req, res) => {
  try {
    const d = normalizarDestino(req.body?.destino);
    if (d.erro) return res.status(400).json({ error: d.erro });

    const { data: existente } = await supabase.from('link_curto')
      .select('*').eq('destino', d.destino).eq('ativo', true).is('deleted_at', null)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (existente) return res.json({ ...existente, reusado: true });

    const base = String(req.body?.slug_sugerido || req.body?.titulo || 'link')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'link';

    // Tenta o nome bonito primeiro; só cai para o sufixo se já estiver tomado.
    for (let i = 0; i < 12; i += 1) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      if (!SLUG_RE.test(slug) || RESERVADOS.has(slug)) continue;
      const { data, error } = await supabase.from('link_curto').insert({
        slug, titulo: limpar(req.body?.titulo, 160) || slug, destino: d.destino,
        onde: limpar(req.body?.onde, 300),
        criado_por: req.user?.id || null, atualizado_por: req.user?.id || null,
      }).select('*').single();
      if (!error) {
        await supabase.from('link_curto_destino_hist').insert({
          link_id: data.id, destino_antigo: null, destino_novo: d.destino,
          alterado_por: req.user?.id || null,
        });
        return res.status(201).json({ ...data, reusado: false });
      }
      if (error.code !== '23505') throw error;
    }
    res.status(409).json({ error: 'Não consegui gerar um código livre — crie um manualmente' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.normalizarDestino = normalizarDestino;
module.exports.SLUG_RE = SLUG_RE;
module.exports.RESERVADOS = RESERVADOS;
