// Formulário público de Apresentação de Crianças (substitui o Google Forms).
// Acontece sempre no 2º domingo do mês. Cria a criança (cadastro mínimo) em
// kids_criancas e avisa a equipe Kids. As respostas aparecem na aba do Kids.
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas inscrições deste endereço. Tente novamente mais tarde.' },
});

// 2º domingo de um mês (year, month 0-11)
function segundoDomingo(year, month) {
  const primeiro = new Date(year, month, 1);
  const offset = (7 - primeiro.getDay()) % 7; // dias até o 1º domingo
  return new Date(year, month, 1 + offset + 7);
}

function fmtLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function proximoSegundoDomingoISO() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let year = hoje.getFullYear();
  let month = hoje.getMonth();
  let d = segundoDomingo(year, month);
  if (d < hoje) {
    month += 1;
    if (month > 11) { year += 1; month = 0; }
    d = segundoDomingo(year, month);
  }
  return fmtLocalISO(d);
}

// GET /api/public/apresentacao-criancas/proxima-data
router.get('/proxima-data', (_req, res) => {
  res.json({ data_apresentacao: proximoSegundoDomingoISO() });
});

// POST /api/public/apresentacao-criancas
router.post('/', limiter, async (req, res) => {
  try {
    const {
      nome_pai, nome_mae, crianca_nome, crianca_idade, telefone,
      observacoes, website, // website = honeypot
    } = req.body || {};

    if (website) return res.json({ ok: true }); // honeypot · ignora silenciosamente

    const criancaNome = (crianca_nome || '').trim();
    const tel = String(telefone || '').replace(/\D+/g, '');
    if (criancaNome.length < 2) return res.status(400).json({ error: 'Informe o nome da criança.' });
    if (tel.length < 10) return res.status(400).json({ error: 'Telefone inválido.' });

    const dataApresentacao = proximoSegundoDomingoISO();
    const nomePaiT = nome_pai ? String(nome_pai).trim().slice(0, 200) : null;
    const nomeMaeT = nome_mae ? String(nome_mae).trim().slice(0, 200) : null;
    const idadeT = crianca_idade ? String(crianca_idade).trim().slice(0, 120) : null;

    // Cadastro mínimo da criança em kids_criancas (sem data de nascimento · o form
    // pede idade). Best-effort: se falhar, a inscrição ainda é registrada.
    let criancaId = null;
    try {
      const obsInterna = `Cadastrado via formulário de Apresentação de Crianças (${dataApresentacao}). `
        + `Pais: ${nomePaiT || '—'} / ${nomeMaeT || '—'}. Idade informada: ${idadeT || '—'}.`;
      const { data: kid, error: kidErr } = await supabase
        .from('kids_criancas')
        .insert({ nome: criancaNome.slice(0, 200), visitante: true, observacoes_internas: obsInterna })
        .select('id')
        .single();
      if (kidErr) throw kidErr;
      criancaId = kid?.id || null;
    } catch (e) {
      console.error('[publicApresentacao] cadastro kids_criancas falhou:', e.message);
    }

    const { data, error } = await supabase
      .from('apresentacao_criancas')
      .insert({
        nome_pai: nomePaiT,
        nome_mae: nomeMaeT,
        crianca_nome: criancaNome.slice(0, 300),
        crianca_idade: idadeT,
        telefone: tel,
        data_apresentacao: dataApresentacao,
        status: 'pendente',
        origem: 'publico',
        crianca_id: criancaId,
        observacoes: observacoes ? String(observacoes).trim().slice(0, 1000) : null,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[publicApresentacao] insert error:', error.message);
      return res.status(500).json({ error: 'Erro ao enviar inscrição.' });
    }

    notificar({
      modulo: 'kids',
      tipo: 'nova_apresentacao_crianca',
      titulo: 'Nova apresentação de criança',
      mensagem: `${criancaNome} foi inscrita para a apresentação de ${dataApresentacao}. Entrar em contato com a família para agendar o horário.`,
      link: '/ministerial/totem-kids/apresentacao',
      severidade: 'info',
      chaveDedup: `apresentacao_crianca_${data.id}`,
    }).catch(err => console.error('[publicApresentacao] notificacao falhou:', err.message));

    res.status(201).json({ ok: true, id: data.id, data_apresentacao: dataApresentacao });
  } catch (e) {
    console.error('[publicApresentacao] erro:', e.message);
    res.status(500).json({ error: 'Erro ao enviar inscrição.' });
  }
});

module.exports = router;
