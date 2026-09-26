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
      .select('id, papel, aprovado_em, respondido_em, ciclo_id, avaliado_id, ciclo:ciclo_id(id, nome, status, coleta_ate, escala_max, deleted_at), avaliado:avaliado_id(id, nome, cargo, area)')
      .eq('avaliador_id', eu.id)
      .is('deleted_at', null)
      .is('suprimido_em', null)
      .order('papel');
    if (error) throw new Error(error.message);

    // ⚠️ Só ciclo em COLETA aparece para responder. Ciclo em apuração já
    // fechou a janela; deixar o formulário aberto ali mudaria o denominador
    // depois de a coordenação já ter começado a ler.
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const abertos = (data || []).filter((c) => c.ciclo?.status === 'coleta'
      && !c.ciclo.deleted_at && (!c.ciclo.coleta_ate || c.ciclo.coleta_ate >= hoje)
      && (c.papel !== 'par' || c.aprovado_em));

    res.json({
      eu: { id: eu.id, nome: eu.nome, area: eu.area },
      pendentes: abertos.filter((c) => !c.respondido_em),
      respondidos: abertos.filter((c) => c.respondido_em),
    });
  } catch (e) {
    console.error('[aval360] minhas:', e.message);
    // ⚠️ Erro nunca vira lista vazia: "não tenho nada para responder" e "a
    // consulta falhou" levam a decisões opostas.
    res.status(500).json({ error: 'Não foi possível carregar suas avaliações.' });
  }
});

// SQL de domínio não expõe detalhes internos; demais falhas ficam só no log.
function falhaDeDominio(res, erro, mensagem) {
  const status = { P0400: 400, P0403: 403, P0409: 409 }[erro.code];
  return res.status(status || 500).json({ error: status ? erro.message : mensagem });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O mesmo formulário determina as competências aceitas ao responder.
router.get('/convite/:id', async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Convite inválido.' });
    const eu = await comFuncionario(req, res);
    if (!eu) return;
    const { data, error } = await supabase.rpc('fn_aval360_formulario', {
      p_convite_id: req.params.id, p_avaliador_id: eu.id,
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] convite:', e.message);
    falhaDeDominio(res, e, 'Não foi possível carregar o formulário.');
  }
});

router.post('/convite/:id/responder', async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Convite inválido.' });
    const eu = await comFuncionario(req, res);
    if (!eu) return;
    // A função transacional valida proprietário, janela e conjunto de notas;
    // resposta, notas e carimbo são confirmados juntos ou todos revertidos.
    const { data, error } = await supabase.rpc('fn_aval360_responder', {
      p_convite_id: req.params.id, p_avaliador_id: eu.id, p_notas: req.body?.notas ?? null,
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] responder:', e.message);
    falhaDeDominio(res, e, 'Não foi possível salvar sua resposta.');
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
    res.status(500).json({ error: 'Não foi possível carregar os ciclos.' });
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
    res.status(500).json({ error: 'Não foi possível montar o retrato do ciclo.' });
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
    falhaDeDominio(res, e, 'Não foi possível gerar os convites.');
  }
});

module.exports = router;
