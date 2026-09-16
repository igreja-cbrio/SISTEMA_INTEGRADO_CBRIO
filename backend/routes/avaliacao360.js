// Avaliação 360 · a PORTA.
//
// ⚠️⚠️ ESTE ARQUIVO NÃO PODE TER `authorizeModule('rh')` NO `router.use`.
// Medido em 16/09: o módulo `rh` é alcançado por **3 cargos** (Dir RH, Coord
// Estratégico, Coord Financeiro) e `authorizeModule` tem default nível 2. Numa
// 360 TODO funcionário responde — 46 pessoas, 39 com login. Pôr o gate do RH
// aqui faria o ciclo ser anunciado e ninguém conseguir responder.
//
// O gate correto é: estar logado + ser colaborador (não conta só-de-membro do
// app). Quem a pessoa É sai do PRÓPRIO login, nunca de id no corpo.
//
// ⚠️ As rotas de ADMINISTRAÇÃO do ciclo (criar, gerar convites, ver retrato)
// têm `authorizeModule('rh', 3)` POR ROTA — não no `router.use`.
const express = require('express');
const { authenticate, authorizeModule, apenasColaborador } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const {
  funcionarioDoLogin, retratoDoCiclo, gerarConvitesAutomaticos,
} = require('../services/avaliacao360');

const router = express.Router();
router.use(authenticate, apenasColaborador);

// Traduz o motivo técnico da resolução de identidade em algo acionável.
// ⚠️ "não encontrei você" e "a consulta falhou" levam a ações opostas: a
// primeira é cadastro, a segunda é tentar de novo.
const MOTIVO_HTTP = {
  sem_email: [403, 'Sua conta não tem e-mail — fale com o RH.'],
  nao_e_funcionario: [403, 'Seu login não está vinculado a um cadastro de colaborador no RH.'],
  email_ambiguo: [409, 'Há mais de um cadastro ativo com o seu e-mail no RH. Peça ao RH para consolidar antes de responder.'],
  consulta_falhou: [503, 'Não foi possível confirmar seu cadastro agora. Tente de novo em instantes.'],
};

async function comFuncionario(req, res) {
  const { funcionario, erro } = await funcionarioDoLogin(req);
  if (erro) {
    const [status, msg] = MOTIVO_HTTP[erro] || [500, 'Erro ao resolver seu cadastro.'];
    res.status(status).json({ error: msg, motivo: erro });
    return null;
  }
  return funcionario;
}

// ────────────────────────────────────────────────────────────
// O COLABORADOR · o que eu tenho para responder
// ────────────────────────────────────────────────────────────

// GET /api/avaliacao360/minhas · os convites DESTE login
router.get('/minhas', async (req, res) => {
  try {
    const eu = await comFuncionario(req, res);
    if (!eu) return;

    const { data, error } = await supabase
      .from('rh_aval360_convite')
      .select('id, papel, respondido_em, ciclo_id, avaliado_id, ciclo:ciclo_id(id, nome, status, coleta_ate, escala_max), avaliado:avaliado_id(id, nome, cargo, area)')
      .eq('avaliador_id', eu.id)
      .is('deleted_at', null)
      .is('suprimido_em', null)
      .order('papel');
    if (error) throw new Error(error.message);

    // ⚠️ Só ciclo em COLETA aparece para responder. Ciclo em apuração já
    // fechou a janela; deixar o formulário aberto ali mudaria o denominador
    // depois de a coordenação já ter começado a ler.
    const abertos = (data || []).filter((c) => c.ciclo?.status === 'coleta');

    res.json({
      eu: { id: eu.id, nome: eu.nome, area: eu.area },
      pendentes: abertos.filter((c) => !c.respondido_em),
      respondidos: abertos.filter((c) => c.respondido_em),
    });
  } catch (e) {
    console.error('[aval360] minhas:', e.message);
    // ⚠️ Erro nunca vira lista vazia: "não tenho nada para responder" e "a
    // consulta falhou" levam a decisões opostas.
    res.status(500).json({ error: 'Não foi possível carregar suas avaliações.', detalhe: e.message });
  }
});

// GET /api/avaliacao360/convite/:id · o formulário de UM convite
router.get('/convite/:id', async (req, res) => {
  try {
    const eu = await comFuncionario(req, res);
    if (!eu) return;

    const { data: convite, error } = await supabase
      .from('rh_aval360_convite')
      .select('id, papel, avaliado_id, ciclo_id, respondido_em, ciclo:ciclo_id(id, nome, status, escala_max), avaliado:avaliado_id(id, nome, cargo, area)')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!convite) return res.status(404).json({ error: 'Convite não encontrado.' });

    // ⚠️⚠️ A trava que importa: o convite tem que ser DESTE login. Sem ela,
    // qualquer pessoa autenticada responderia pelo convite de outra sabendo o
    // id — e a resposta entraria com o papel e o avaliado daquele convite.
    const { data: meu } = await supabase
      .from('rh_aval360_convite')
      .select('id')
      .eq('id', req.params.id)
      .eq('avaliador_id', eu.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!meu) return res.status(403).json({ error: 'Este convite não é seu.' });

    if (convite.ciclo?.status !== 'coleta') {
      return res.status(409).json({ error: 'A janela de respostas deste ciclo não está aberta.', status: convite.ciclo?.status });
    }

    // competências do ciclo, filtrando as que só valem para gestores
    const { data: vinculos, error: errV } = await supabase
      .from('rh_aval360_ciclo_competencia')
      .select('peso, ordem, competencia:competencia_id(id, codigo, nome, descricao, aplica_a, eixo)')
      .eq('ciclo_id', convite.ciclo_id)
      .is('deleted_at', null)
      .order('ordem');
    if (errV) throw new Error(errV.message);

    // ⚠️ "é gestor" é sobre o AVALIADO, não sobre quem responde.
    const { count: nLiderados } = await supabase
      .from('rh_funcionarios')
      .select('id', { count: 'exact', head: true })
      .eq('gestor_id', convite.avaliado_id)
      .eq('status', 'ativo')
      .is('deleted_at', null);
    const avaliadoEhGestor = (nLiderados || 0) > 0;

    const competencias = (vinculos || [])
      .map((v) => v.competencia)
      .filter(Boolean)
      .filter((c) => c.aplica_a !== 'gestores' || avaliadoEhGestor);

    res.json({ convite, competencias, escala_max: convite.ciclo?.escala_max || 5 });
  } catch (e) {
    console.error('[aval360] convite:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar o formulário.', detalhe: e.message });
  }
});

// POST /api/avaliacao360/convite/:id/responder
router.post('/convite/:id/responder', async (req, res) => {
  try {
    const eu = await comFuncionario(req, res);
    if (!eu) return;

    const { data: convite, error } = await supabase
      .from('rh_aval360_convite')
      .select('id, papel, avaliado_id, ciclo_id, respondido_em, ciclo:ciclo_id(status, escala_max)')
      .eq('id', req.params.id)
      .eq('avaliador_id', eu.id)      // ⚠️ o convite tem que ser DESTE login
      .is('deleted_at', null)
      .is('suprimido_em', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!convite) return res.status(403).json({ error: 'Este convite não é seu ou não existe.' });
    if (convite.ciclo?.status !== 'coleta') {
      return res.status(409).json({ error: 'A janela de respostas deste ciclo não está aberta.' });
    }
    if (convite.respondido_em) {
      return res.status(409).json({ error: 'Você já respondeu esta avaliação.', ja_respondido: true });
    }

    const escalaMax = Number(convite.ciclo?.escala_max) || 5;
    const notas = Array.isArray(req.body?.notas) ? req.body.notas : [];
    if (notas.length === 0) return res.status(400).json({ error: 'Nenhuma resposta enviada.' });

    // ⚠️ A nota é validada contra a escala DO CICLO, não contra um teto fixo.
    for (const n of notas) {
      const v = Number(n?.nota);
      if (!Number.isInteger(v) || v < 1 || v > escalaMax) {
        return res.status(400).json({ error: `Nota fora da escala (1 a ${escalaMax}).` });
      }
    }

    // A resposta NÃO carrega avaliador_id — a identidade fica no convite.
    const { data: resposta, error: errR } = await supabase
      .from('rh_aval360_resposta')
      .insert({
        ciclo_id: convite.ciclo_id,
        avaliado_id: convite.avaliado_id,
        papel: convite.papel,
        convite_id: convite.id,
      })
      .select('id')
      .single();
    // ⚠️ `convite_id` é UNIQUE: duas submissões simultâneas viram 23505, e é
    // isso que impede resposta dupla mesmo com dois cliques.
    if (errR) {
      if (errR.code === '23505') return res.status(409).json({ error: 'Você já respondeu esta avaliação.', ja_respondido: true });
      throw new Error(errR.message);
    }

    const linhas = notas.map((n) => ({
      resposta_id: resposta.id,
      competencia_id: n.competencia_id,
      nota: Number(n.nota),
      comentario: (n.comentario || '').trim() || null,
    }));
    const { error: errN } = await supabase.from('rh_aval360_nota').insert(linhas);
    if (errN) throw new Error(errN.message);

    // ⚠️ Carimba o convite DEPOIS das notas: morrer no meio deixa a resposta
    // sem carimbo (e a pessoa reenvia), nunca carimbo sem resposta — que faria
    // a pessoa aparecer como respondida sem ter respondido.
    await supabase
      .from('rh_aval360_convite')
      .update({ respondido_em: new Date().toISOString() })
      .eq('id', convite.id)
      .is('respondido_em', null);

    res.json({ ok: true, respostas: linhas.length });
  } catch (e) {
    console.error('[aval360] responder:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar sua resposta.', detalhe: e.message });
  }
});

// ────────────────────────────────────────────────────────────
// ADMINISTRAÇÃO · gate por ROTA, nunca no router.use
// ────────────────────────────────────────────────────────────

// GET /api/avaliacao360/ciclos
router.get('/ciclos', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rh_aval360_ciclo')
      .select('*')
      .is('deleted_at', null)
      .order('periodo_inicio', { ascending: false });
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível carregar os ciclos.', detalhe: e.message });
  }
});

// GET /api/avaliacao360/ciclos/:id/retrato · o que será coletado, ANTES de convidar
router.get('/ciclos/:id/retrato', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { data: ciclo, error } = await supabase
      .from('rh_aval360_ciclo')
      .select('id, nome, piso_respondentes, max_pares, status')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado.' });
    res.json({ ciclo, ...(await retratoDoCiclo(ciclo)) });
  } catch (e) {
    console.error('[aval360] retrato:', e.message);
    res.status(500).json({ error: 'Não foi possível montar o retrato do ciclo.', detalhe: e.message });
  }
});

// POST /api/avaliacao360/ciclos/:id/convites · gera auto + gestor + liderado
router.post('/ciclos/:id/convites', authorizeModule('rh', 3), async (req, res) => {
  try {
    const r = await gerarConvitesAutomaticos(req.params.id);
    if (!r.ok) return res.status(409).json(r);
    res.json(r);
  } catch (e) {
    console.error('[aval360] convites:', e.message);
    res.status(500).json({ error: 'Não foi possível gerar os convites.', detalhe: e.message });
  }
});

module.exports = router;
