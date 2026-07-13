// Formulário PÚBLICO de onboarding do novo colaborador (sem login).
// A Juliana (RH) gera um link por colaborador (POST /rh/funcionarios/:id/onboarding-link)
// e envia; o colaborador abre o link e preenche os DADOS PESSOAIS, que caem
// direto no rh_funcionarios. O RH só cuida de salário/cargo.
// Segurança: token aleatório (índice único), só expõe/edita campos pessoais,
// nunca salário/cargo/status. Sob o publicLimiter (rate limit estrito).
const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');

const soDigitos = (v) => String(v || '').replace(/\D/g, '');
function mascaraTelefone(dig) {
  const d = soDigitos(dig).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function normalizarFilhos(filhos) {
  const arr = Array.isArray(filhos) ? filhos : [];
  return arr.slice(0, 20).map((f) => ({
    nome: f?.nome ? String(f.nome).slice(0, 120) : null,
    idade: (f?.idade === '' || f?.idade == null) ? null
      : (Number.isFinite(Number(f.idade)) ? Math.max(0, Math.min(120, Math.trunc(Number(f.idade)))) : null),
  })).filter((f) => f.nome || f.idade != null);
}

async function acharPorToken(token) {
  if (!token || String(token).length < 16) return null;
  const { data } = await supabase.from('rh_funcionarios')
    .select('id, nome, cargo, area, telefone, cpf, data_nascimento, endereco, filhos, onboarding_preenchido_em')
    .eq('onboarding_token', String(token)).is('deleted_at', null).maybeSingle();
  return data || null;
}

// GET /api/public/rh-onboarding/:token — dados pra preencher o formulário.
router.get('/:token', async (req, res) => {
  try {
    const f = await acharPorToken(req.params.token);
    if (!f) return res.status(404).json({ error: 'Link inválido ou expirado.' });
    res.json({
      nome: f.nome,
      cargo: f.cargo || null,
      area: f.area || null,
      ja_preenchido: !!f.onboarding_preenchido_em,
      telefone: f.telefone || null,
      cpf: f.cpf || null,
      data_nascimento: f.data_nascimento || null,
      endereco: f.endereco || null,
      filhos: Array.isArray(f.filhos) ? f.filhos : [],
    });
  } catch (e) {
    console.error('[public rh-onboarding] GET:', e.message);
    res.status(500).json({ error: 'Erro ao abrir o formulário.' });
  }
});

// POST /api/public/rh-onboarding/:token — o colaborador salva os próprios dados.
router.post('/:token', async (req, res) => {
  try {
    const f = await acharPorToken(req.params.token);
    if (!f) return res.status(404).json({ error: 'Link inválido ou expirado.' });
    const { telefone, cpf, data_nascimento, endereco, filhos } = req.body || {};

    const patch = { updated_at: new Date().toISOString(), onboarding_preenchido_em: new Date().toISOString() };
    if (telefone !== undefined) {
      const d = soDigitos(telefone);
      if (d && (d.length < 10 || d.length > 11)) return res.status(400).json({ error: 'Telefone inválido (DDD + número).' });
      patch.telefone = d ? mascaraTelefone(d) : null;
    }
    if (cpf !== undefined) {
      const d = soDigitos(cpf);
      if (d && d.length !== 11) return res.status(400).json({ error: 'CPF inválido (11 dígitos).' });
      patch.cpf = d || null;
    }
    if (data_nascimento !== undefined) patch.data_nascimento = data_nascimento || null;
    if (endereco !== undefined) patch.endereco = endereco ? String(endereco).slice(0, 500) : null;
    if (filhos !== undefined) patch.filhos = normalizarFilhos(filhos);

    const { error } = await supabase.from('rh_funcionarios').update(patch).eq('id', f.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[public rh-onboarding] POST:', e.message);
    res.status(500).json({ error: 'Erro ao salvar o formulário.' });
  }
});

module.exports = router;
