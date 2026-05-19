const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

// Rate limit: 10 inscricoes por IP a cada 15 min
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas inscricoes deste endereco. Tente novamente mais tarde.' },
});

function soDigitos(v) {
  return String(v || '').replace(/\D+/g, '');
}

function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base, fator) => {
    let s = 0;
    for (let i = 0; i < base.length; i += 1) s += parseInt(base[i], 10) * (fator - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(d.slice(0, 9), 10) === parseInt(d[9], 10)
    && calc(d.slice(0, 10), 11) === parseInt(d[10], 10);
}

// Calcula o 4o domingo de um mes
function quartoDomingo(year, month /* 0-11 */) {
  const primeiro = new Date(year, month, 1);
  const offset = (7 - primeiro.getDay()) % 7;
  return new Date(year, month, 1 + offset + 21);
}

function proximoQuartoDomingoISO() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let year = hoje.getFullYear();
  let month = hoje.getMonth();
  let q = quartoDomingo(year, month);
  if (q < hoje) {
    month += 1;
    if (month > 11) { year += 1; month = 0; }
    q = quartoDomingo(year, month);
  }
  return q.toISOString().slice(0, 10);
}

// GET /api/public/batismo/proxima-data
// Retorna a proxima data agendada (4o domingo do mes) - usada pelo form
// para mostrar ao usuario quando ele sera batizado.
router.get('/proxima-data', (_req, res) => {
  res.json({ data_batismo: proximoQuartoDomingoISO() });
});

// POST /api/public/batismo
// Endpoint publico (sem autenticacao) que recebe inscricao do formulario.
router.post('/', limiter, async (req, res) => {
  try {
    const {
      nome, sobrenome, email, telefone, cpf, data_nascimento,
      endereco, cep, tamanho_camisa, limitacao_mobilidade, motivo,
      observacoes, horario_culto, area_kpi,
      // Novos · LGPD/integracao
      eh_crianca, possui_deficiencia, deficiencia_descricao,
    } = req.body || {};

    // Validacoes basicas
    if (!nome || !String(nome).trim() || String(nome).trim().length < 2) {
      return res.status(400).json({ error: 'Informe o nome.' });
    }
    if (!sobrenome || !String(sobrenome).trim()) {
      return res.status(400).json({ error: 'Informe o sobrenome.' });
    }
    if (!telefone || soDigitos(telefone).length < 10) {
      return res.status(400).json({ error: 'Informe um telefone valido (com DDD).' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Informe um email valido.' });
    }
    if (cpf && !cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF invalido.' });
    }

    const cpfNorm = cpf ? soDigitos(cpf) : null;
    const telNorm = soDigitos(telefone);
    const emailNorm = String(email).trim().toLowerCase();
    const nomeT = String(nome).trim();
    const sobrenomeT = String(sobrenome).trim();

    // Dedup: nao deixa a mesma pessoa se inscrever duas vezes pro mesmo
    // batismo (mesmo CPF ou email+telefone + status pendente/confirmado)
    if (cpfNorm) {
      const { data: dup } = await supabase
        .from('batismo_inscricoes')
        .select('id, nome, sobrenome, status')
        .eq('cpf', cpfNorm)
        .in('status', ['pendente', 'confirmado'])
        .maybeSingle();
      if (dup) {
        return res.status(200).json({
          ok: true,
          duplicado: true,
          mensagem: `Voce ja tem uma inscricao em andamento (status: ${dup.status}). Sua data sera mantida.`,
        });
      }
    }

    // Tenta vincular a um membro existente por CPF
    let membroId = null;
    if (cpfNorm) {
      const { data: membros } = await supabase
        .from('mem_membros')
        .select('id, cpf')
        .filter('cpf', 'not.is', null);
      const match = (membros || []).find(m =>
        String(m.cpf || '').replace(/\D/g, '') === cpfNorm
      );
      if (match) membroId = match.id;
    }

    const dataBatismo = proximoQuartoDomingoISO();

    // Observacoes agora so guarda o que nao tem coluna propria
    const obsParts = [];
    if (cep) obsParts.push(`CEP: ${String(cep).trim()}`);
    if (horario_culto) obsParts.push(`Culto: ${String(horario_culto).trim()}`);
    if (motivo) obsParts.push(`Motivo: ${String(motivo).trim()}`);
    if (observacoes) obsParts.push(`Comentario: ${String(observacoes).trim()}`);

    const AREAS_OK = ['kids', 'sede', 'bridge', 'ami', 'online'];
    const areaKpiValida = AREAS_OK.includes(area_kpi) ? area_kpi : 'sede';

    // Deficiencia: aceita o flag novo OU o campo legado limitacao_mobilidade
    const defDescricao = (deficiencia_descricao && String(deficiencia_descricao).trim())
      || (limitacao_mobilidade && String(limitacao_mobilidade).trim())
      || null;
    const possuiDef = possui_deficiencia === true || !!defDescricao;

    const payload = {
      nome: nomeT,
      sobrenome: sobrenomeT,
      data_nascimento: data_nascimento || null,
      cpf: cpfNorm,
      telefone: telNorm,
      email: emailNorm,
      status: 'pendente',
      data_batismo: dataBatismo,
      origem: 'publico',
      area_kpi: areaKpiValida,
      observacoes: obsParts.length ? obsParts.join('. ') : null,
      membro_id: membroId,
      // Colunas dedicadas (sai de observacoes)
      tamanho_camisa: tamanho_camisa ? String(tamanho_camisa).trim().toUpperCase() : null,
      endereco: endereco ? String(endereco).trim() : null,
      eh_crianca: !!eh_crianca,
      possui_deficiencia: possuiDef,
      deficiencia_descricao: possuiDef ? defDescricao : null,
    };

    const { data, error } = await supabase
      .from('batismo_inscricoes')
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error('[publicBatismo] insert error:', error.message);
      return res.status(500).json({ error: 'Nao foi possivel registrar sua inscricao.' });
    }

    // Notifica responsaveis pela integracao (assincrono)
    notificar({
      modulo: 'batismos',
      tipo: 'nova_inscricao_batismo',
      titulo: 'Nova inscricao de batismo',
      mensagem: `${nomeT} ${sobrenomeT} se inscreveu para o batismo de ${dataBatismo}.`,
      link: '/ministerial/integracao?tab=batismos',
      severidade: 'info',
      chaveDedup: `batismo_inscricao_${data.id}`,
    }).catch(err => console.error('[publicBatismo] notificacao falhou:', err.message));

    res.status(201).json({
      ok: true,
      id: data.id,
      data_batismo: dataBatismo,
      membro_vinculado: !!membroId,
    });
  } catch (e) {
    console.error('[publicBatismo] erro:', e.message);
    res.status(500).json({ error: 'Erro inesperado. Tente novamente.' });
  }
});

module.exports = router;
