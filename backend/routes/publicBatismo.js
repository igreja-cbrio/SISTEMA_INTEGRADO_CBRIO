const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');

// Rate limit: 10 inscrições por IP a cada 15 min
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas inscrições deste endereço. Tente novamente mais tarde.' },
});

// Rate limit dedicado pro acesso às fotos (leitura · mais generoso que o de
// inscrição): uma família reabre/recarrega várias vezes. O token de 32 hex
// (não-enumerável) já torna brute-force inviável; isto é só higiene.
const acessoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde um instante e tente de novo.' },
});

// Bucket público com as fotos da cerimônia (pasta = YYYY-MM-DD). Mesmo padrão do
// admin (batismoFotos.js): lista os arquivos da data e devolve a URL pública.
const BUCKET_FOTOS = 'batismos';
async function listarFotosData(data) {
  const { data: arquivos, error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .list(data, { limit: 200, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;
  return (arquivos || [])
    .filter((f) => f.name && !f.name.startsWith('.'))
    .map((f) => ({
      nome: f.name,
      url: supabase.storage.from(BUCKET_FOTOS).getPublicUrl(`${data}/${f.name}`).data.publicUrl,
    }));
}

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

// Calcula o 4o domingo de um mês
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
// Retorna a próxima data agendada (4o domingo do mês) - usada pelo form
// para mostrar ao usuário quando ele será batizado.
router.get('/proxima-data', (_req, res) => {
  res.json({ data_batismo: proximoQuartoDomingoISO() });
});

// Conta inscrições ativas por horário numa data (pra calcular vagas restantes).
async function ocupacaoPorHorario(dataBatismo) {
  const { data } = await supabase
    .from('batismo_inscricoes')
    .select('horario_culto')
    .eq('data_batismo', dataBatismo)
    .is('deleted_at', null)
    .not('status', 'in', '(cancelado,rejeitado)');
  const c = {};
  (data || []).forEach(i => { if (i.horario_culto) c[i.horario_culto] = (c[i.horario_culto] || 0) + 1; });
  return c;
}

// GET /api/public/batismo/horarios
// Horários ABERTOS e COM VAGA pro próximo batismo · alimenta o seletor do form.
router.get('/horarios', async (_req, res) => {
  try {
    const dataBatismo = proximoQuartoDomingoISO();
    const { data: horarios, error } = await supabase
      .from('batismo_horarios')
      .select('horario, label, limite')
      .is('deleted_at', null)
      .eq('aberto', true)
      .order('ordem');
    if (error) throw error;
    const ocup = await ocupacaoPorHorario(dataBatismo);
    const lista = (horarios || [])
      .map(h => {
        const vagas = h.limite != null ? Math.max(0, h.limite - (ocup[h.horario] || 0)) : null;
        return { horario: h.horario, label: h.label, vagas_restantes: vagas };
      })
      .filter(h => h.vagas_restantes === null || h.vagas_restantes > 0); // esconde lotados
    let grupoUrl = null;
    try {
      const { data: cfg } = await supabase.from('batismo_config').select('grupo_url').eq('id', 1).maybeSingle();
      grupoUrl = cfg?.grupo_url || null;
    } catch { /* sem grupo */ }
    res.json({ data_batismo: dataBatismo, horarios: lista, grupo_url: grupoUrl });
  } catch (e) {
    console.error('[publicBatismo] horarios:', e.message);
    res.status(500).json({ error: 'Erro ao listar horários' });
  }
});

// POST /api/public/batismo
// Endpoint público (sem autenticação) que recebe inscrição do formulário.
router.post('/', limiter, async (req, res) => {
  try {
    const {
      nome, sobrenome, email, telefone, cpf, data_nascimento, sexo,
      endereco, cep, tamanho_camisa, limitacao_mobilidade, motivo,
      observacoes, horario_culto, area_kpi, fez_next,
      // Novos · LGPD/integracao
      eh_crianca, possui_deficiencia, deficiencia_descricao,
      whatsapp_optin, // consentimento p/ mensagens no WhatsApp (Marketing · LGPD)
    } = req.body || {};

    // Validacoes básicas
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
    if (!cpf || !cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF é obrigatório e precisa ser válido.' });
    }

    const cpfNorm = cpf ? soDigitos(cpf) : null;
    const telNorm = soDigitos(telefone);
    const emailNorm = String(email).trim().toLowerCase();
    const nomeT = String(nome).trim();
    const sobrenomeT = String(sobrenome).trim();

    // Guarda na origem (membroMatch · 2026-06-19): resolve-ou-cria UM membro
    // deduplicado (CPF → e-mail → telefone+nome → nome+nascimento · NUNCA
    // telefone/e-mail sozinho) em vez do match-só-por-CPF com full-scan de
    // mem_membros — que batia no cap de 1000 do PostgREST e deixava órfão mesmo
    // quando a pessoa já existia. Toda inscrição nasce ligada a uma pessoa real
    // e deduplicada → some o backlog de "sem vínculo" do funil (Entradas).
    let membroId = null;
    try {
      const r = await acharOuCriarGuardado({
        cpf: cpfNorm, email: emailNorm, telefone: telNorm,
        nome: `${nomeT} ${sobrenomeT}`.trim(),
        dataNascimento: data_nascimento || null,
        status: 'visitante',
        origem: 'batismo_formulario',
      });
      membroId = r.membro_id;
    } catch (e) {
      console.error('[publicBatismo] acharOuCriarGuardado:', e.message);
      // fail-open: segue sem vínculo (o funil/Entradas liga depois)
    }

    // Opt-in de WhatsApp (só liga, nunca desliga um consentimento existente).
    if (whatsapp_optin && membroId) {
      try {
        await supabase.from('mem_membros')
          .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
          .eq('id', membroId).is('deleted_at', null);
      } catch (e) {
        console.warn('[publicBatismo] optin membro:', e.message);
      }
    }

    // Dedup de INSCRIÇÃO: a mesma pessoa não se inscreve 2x pro batismo em aberto
    // — agora por membro resolvido OU por CPF (pega a reinscrição sem CPF, que o
    // check antigo só-por-CPF deixava passar criando 2 inscrições).
    {
      const ors = [];
      if (membroId) ors.push(`membro_id.eq.${membroId}`);
      if (cpfNorm) ors.push(`cpf.eq.${cpfNorm}`);
      if (ors.length) {
        const { data: dups } = await supabase
          .from('batismo_inscricoes')
          .select('id, status')
          .or(ors.join(','))
          .in('status', ['pendente', 'confirmado'])
          .is('deleted_at', null)
          .limit(1);
        const dup = dups && dups[0];
        if (dup) {
          return res.status(200).json({
            ok: true,
            duplicado: true,
            mensagem: `Você já tem uma inscrição em andamento (status: ${dup.status}). Sua data será mantida.`,
          });
        }
      }
    }

    const dataBatismo = proximoQuartoDomingoISO();

    // Valida o horário escolhido contra os horários configurados (aberto + vaga).
    // Tolerante: se a tabela ainda não existe ou nada foi enviado, segue sem travar.
    let horarioEscolhido = horario_culto ? String(horario_culto).trim().slice(0, 80) : null;
    if (horarioEscolhido) {
      const { data: hConf, error: hErr } = await supabase
        .from('batismo_horarios')
        .select('horario, label, aberto, limite')
        .eq('horario', horarioEscolhido)
        .is('deleted_at', null)
        .maybeSingle();
      if (!hErr) {
        if (!hConf || !hConf.aberto) {
          return res.status(409).json({ error: 'Esse horário não está mais disponível. Escolha outro.' });
        }
        if (hConf.limite != null) {
          const ocup = await ocupacaoPorHorario(dataBatismo);
          if ((ocup[horarioEscolhido] || 0) >= hConf.limite) {
            return res.status(409).json({ error: 'Esse horário lotou. Por favor, escolha outro.' });
          }
        }
      }
    }

    // Observações agora so guarda o que não tem coluna própria.
    // CEP e horário (Culto) têm colunas dedicadas (cep, horario_culto) → não entram aqui.
    const obsParts = [];
    if (motivo) obsParts.push(`Motivo: ${String(motivo).trim().slice(0, 500)}`);
    if (observacoes) obsParts.push(`Comentario: ${String(observacoes).trim().slice(0, 1000)}`);
    const cepNorm = cep ? String(cep).trim().slice(0, 20) : null;
    // Sexo · paridade com o totem (armazenado como 'M'/'F' · opcional).
    const sexoNorm = (() => {
      const s = sexo ? String(sexo).trim().toUpperCase() : '';
      if (s === 'M' || s === 'MASCULINO') return 'M';
      if (s === 'F' || s === 'FEMININO') return 'F';
      return null;
    })();

    const AREAS_OK = ['kids', 'sede', 'bridge', 'ami', 'online'];
    const areaKpiValida = AREAS_OK.includes(area_kpi) ? area_kpi : 'sede';

    // Deficiencia/acessibilidade: flag explícito OU resposta "Sim" à pergunta de
    // limitação de mobilidade. ⚠️ BUG ANTERIOR: tratava QUALQUER resposta como
    // "descrição" — então "Não" (string não-vazia) marcava deficiência em todo
    // mundo que respondia a pergunta. Agora só "Sim" (ou descrição real) marca.
    const limitacaoSim = /^sim$/i.test(
      limitacao_mobilidade != null ? String(limitacao_mobilidade).trim() : ''
    );
    const descReal = (deficiencia_descricao && String(deficiencia_descricao).trim()) || null;
    const possuiDef = possui_deficiencia === true || limitacaoSim || !!descReal;
    const defDescricao = descReal || (limitacaoSim ? 'Limitação de mobilidade' : null);

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
      observacoes: obsParts.length ? obsParts.join('. ').slice(0, 2500) : null,
      membro_id: membroId,
      // Colunas dedicadas · tamanho_camisa whitelist
      tamanho_camisa: (() => {
        const v = tamanho_camisa ? String(tamanho_camisa).trim().toUpperCase() : null;
        const validos = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];
        return v && validos.includes(v) ? v : null;
      })(),
      endereco: endereco ? String(endereco).trim().slice(0, 300) : null,
      horario_culto: horarioEscolhido,
      eh_crianca: !!eh_crianca,
      possui_deficiencia: possuiDef,
      deficiencia_descricao: possuiDef && defDescricao ? defDescricao.slice(0, 500) : null,
      // "Você já fez o NEXT?" · boolean | null (não informado)
      fez_next: typeof fez_next === 'boolean' ? fez_next : null,
      cep: cepNorm,
      sexo: sexoNorm,
    };

    const { data, error } = await supabase
      .from('batismo_inscricoes')
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error('[publicBatismo] insert error:', error.message);
      return res.status(500).json({ error: 'Não foi possível registrar sua inscrição.' });
    }
    await registrarObservacaoSegura({
      membroId, origem: 'batismo_formulario', origemId: data.id,
      nome: `${nomeT} ${sobrenomeT}`.trim(), cpf: cpfNorm,
      telefone: telNorm, email: emailNorm, dataNascimento: data_nascimento || null,
    });

    // Notifica responsáveis pela integração (assincrono)
    notificar({
      modulo: 'batismos',
      tipo: 'nova_inscricao_batismo',
      titulo: 'Nova inscrição de batismo',
      mensagem: `${nomeT} ${sobrenomeT} se inscreveu para o batismo de ${dataBatismo}.`,
      link: `/ministerial/integracao?tab=batismos&inscricao=${data.id}`,
      severidade: 'info',
      chaveDedup: `batismo_inscricao_${data.id}`,
      email: true, // responsável da Integração (Lorena) recebe também por e-mail
      emailsExtra: ['lorena@cbrio.com.br'], // 2o e-mail da Lorena (sem conta no sistema)
    }).catch(err => console.error('[publicBatismo] notificacao falhou:', err.message));

    // Se for criança, avisa também a equipe Kids (pra contatar a família)
    if (payload.eh_crianca) {
      notificar({
        modulo: 'kids',
        tipo: 'crianca_batismo',
        titulo: 'Criança para batizar',
        mensagem: `${nomeT} ${sobrenomeT} (criança) se inscreveu para o batismo de ${dataBatismo}. Entrar em contato com a família.`,
        link: '/ministerial/totem-kids/batismos',
        severidade: 'info',
        chaveDedup: `kids_batismo_${data.id}`,
      }).catch(err => console.error('[publicBatismo] notificacao kids falhou:', err.message));
    }

    // Link do grupo de WhatsApp do batismo (Lorena atualiza a cada mês)
    let grupoUrl = null;
    try {
      const { data: cfg } = await supabase.from('batismo_config').select('grupo_url').eq('id', 1).maybeSingle();
      grupoUrl = cfg?.grupo_url || null;
    } catch { /* sem grupo configurado */ }

    res.status(201).json({
      ok: true,
      id: data.id,
      data_batismo: dataBatismo,
      membro_vinculado: !!membroId,
      grupo_url: grupoUrl,
    });
  } catch (e) {
    console.error('[publicBatismo] erro:', e.message);
    res.status(500).json({ error: 'Erro inesperado. Tente novamente.' });
  }
});

// GET /api/public/batismo/acesso?token=...
// O QR da etiqueta do quiosque aponta pra cá. O token (batismo_inscricoes.
// codigo_acesso · 32 hex, não-enumerável) É a credencial: quem o tem (recebeu a
// etiqueta na mão · presença física verificada) vê as fotos do batismo DAQUELE
// DIA. Sem conta, sem senha, sem sessão (passwordless · CPF nunca vira senha ·
// lição do account-takeover). Fotos por data na Fase 1; "as suas" vem na Fase 2
// (rosto). O backend (service_role) só devolve a data ligada ao token — que está
// sob lockdown column-level (20260630160000) e não vaza pela anon key.
router.get('/acesso', acessoLimiter, async (req, res) => {
  const token = String(req.query.token || '').trim();
  // token = 32 hex (gen_random_uuid sem hífens). Valida o formato antes de tocar
  // o banco e não revela nada quando não casa.
  if (!/^[0-9a-f]{32}$/i.test(token)) {
    return res.status(404).json({ error: 'Link inválido ou expirado. Procure a equipe.' });
  }
  try {
    const { data: insc, error } = await supabase
      .from('batismo_inscricoes')
      .select('nome, sobrenome, data_batismo, status')
      .eq('codigo_acesso', token)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      console.error('[publicBatismo] acesso lookup:', error.message);
      return res.status(500).json({ error: 'Erro ao validar o acesso. Tente novamente.' });
    }
    if (!insc || ['cancelado', 'rejeitado'].includes(insc.status)) {
      return res.status(404).json({ error: 'Link inválido ou expirado. Procure a equipe.' });
    }
    let fotos = [];
    try {
      if (insc.data_batismo) fotos = await listarFotosData(insc.data_batismo);
    } catch (e) {
      // pasta pode ainda não existir (fotos não subiram) — não falha o acesso
      console.error('[publicBatismo] acesso listar fotos:', e.message);
    }
    res.json({
      nome: `${insc.nome} ${insc.sobrenome || ''}`.trim(),
      data_batismo: insc.data_batismo,
      fotos,
    });
  } catch (e) {
    console.error('[publicBatismo] acesso erro:', e.message);
    res.status(500).json({ error: 'Erro inesperado. Tente novamente.' });
  }
});

module.exports = router;
