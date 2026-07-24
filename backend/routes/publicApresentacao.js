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
      nome_pai, nome_mae, criancas, crianca_nome, crianca_idade, telefone, cpf_responsavel,
      observacoes, website, // website = honeypot
    } = req.body || {};

    if (website) return res.json({ ok: true }); // honeypot · ignora silenciosamente

    // Aceita lista de crianças (1 por filho) · tolera o formato antigo (1 campo).
    const listaBruta = Array.isArray(criancas) && criancas.length
      ? criancas
      : [{ nome: crianca_nome, idade: crianca_idade }];
    const lista = listaBruta
      .map(c => ({
        nome: String(c?.nome || '').trim().slice(0, 200),
        idade: c?.idade ? String(c.idade).trim().slice(0, 60) : null,
      }))
      .filter(c => c.nome.length >= 2);

    const tel = String(telefone || '').replace(/\D+/g, '');
    if (!lista.length) return res.status(400).json({ error: 'Informe o nome de ao menos uma criança.' });
    // CPF do responsável obrigatório (pedido da gestão · 2026-07-24 · toda
    // inscrição do sistema pede CPF — chave da identidade global)
    const cpfDig = String(cpf_responsavel || '').replace(/\D+/g, '');
    const cpfOk = (() => {
      if (cpfDig.length !== 11 || /^(\d)\1+$/.test(cpfDig)) return false;
      let s1 = 0; for (let i = 0; i < 9; i++) s1 += parseInt(cpfDig[i]) * (10 - i);
      let d1 = (s1 * 10) % 11; if (d1 === 10) d1 = 0;
      if (d1 !== parseInt(cpfDig[9])) return false;
      let s2 = 0; for (let i = 0; i < 10; i++) s2 += parseInt(cpfDig[i]) * (11 - i);
      let d2 = (s2 * 10) % 11; if (d2 === 10) d2 = 0;
      return d2 === parseInt(cpfDig[10]);
    })();
    if (!cpfOk) return res.status(400).json({ error: 'Informe um CPF válido do responsável.' });
    if (tel.length < 10) return res.status(400).json({ error: 'Telefone inválido.' });

    const dataApresentacao = proximoSegundoDomingoISO();
    const nomePaiT = nome_pai ? String(nome_pai).trim().slice(0, 200) : null;
    const nomeMaeT = nome_mae ? String(nome_mae).trim().slice(0, 200) : null;
    const obsExtra = observacoes ? String(observacoes).trim().slice(0, 1000) : null;

    // 1 registro por criança (cada uma aparece/cadastra separada · mesmo
    // responsável/telefone/turma). Best-effort no cadastro em kids_criancas.
    const criados = [];
    for (const c of lista) {
      let criancaId = null;
      try {
        const obsInterna = `Cadastrado via formulário de Apresentação de Crianças (${dataApresentacao}). `
          + `Pais: ${nomePaiT || '—'} / ${nomeMaeT || '—'}. Idade informada: ${c.idade || '—'}.`;
        const { data: kid } = await supabase
          .from('kids_criancas')
          .insert({ nome: c.nome, visitante: true, observacoes_internas: obsInterna })
          .select('id').single();
        criancaId = kid?.id || null;
      } catch (e) {
        console.error('[publicApresentacao] cadastro kids_criancas falhou:', e.message);
      }

      const { data, error } = await supabase
        .from('apresentacao_criancas')
        .insert({
          nome_pai: nomePaiT,
          nome_mae: nomeMaeT,
          crianca_nome: c.nome,
          crianca_idade: c.idade,
          telefone: tel,
          cpf_responsavel: cpfDig,
          data_apresentacao: dataApresentacao,
          status: 'pendente',
          origem: 'publico',
          crianca_id: criancaId,
          observacoes: obsExtra,
        })
        .select('id').single();
      if (error) {
        console.error('[publicApresentacao] insert error:', error.message);
        continue;
      }
      criados.push(data.id);
    }

    if (!criados.length) return res.status(500).json({ error: 'Erro ao enviar inscrição.' });

    const nomes = lista.map(c => c.nome).join(', ');
    // Notifica diretamente a líder do Kids (Mariane Gaia) e a Milena. Se não
    // achar (e-mail mudou), cai no módulo 'kids'.
    let alvosKids;
    try {
      const { data: alvos } = await supabase
        .from('profiles').select('id')
        .in('email', ['mariane.gaia@cbrio.org', 'milena.rochet@cbrio.org']);
      alvosKids = (alvos || []).map(a => a.id);
    } catch { /* fallback no módulo kids */ }

    notificar({
      modulo: 'kids',
      tipo: 'nova_apresentacao_crianca',
      titulo: lista.length > 1 ? 'Nova apresentação de crianças' : 'Nova apresentação de criança',
      mensagem: `${nomes} — inscriç${lista.length > 1 ? 'ões' : 'ão'} para a apresentação de ${dataApresentacao}. Entrar em contato com a família para agendar o horário.`,
      link: '/ministerial/totem-kids/apresentacao',
      severidade: 'info',
      chaveDedup: `apresentacao_crianca_${criados[0]}`,
      targetIds: alvosKids && alvosKids.length ? alvosKids : undefined,
    }).catch(err => console.error('[publicApresentacao] notificacao falhou:', err.message));

    res.status(201).json({ ok: true, ids: criados, data_apresentacao: dataApresentacao });
  } catch (e) {
    console.error('[publicApresentacao] erro:', e.message);
    res.status(500).json({ error: 'Erro ao enviar inscrição.' });
  }
});

module.exports = router;
