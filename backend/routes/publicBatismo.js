const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
const {
  temAbreviacaoNome, splitNomeCompleto, validarNascimento, honeypotPreenchido,
  registrarConsentimentos, TEXTOS, cpfValido, emailValido,
} = require('../services/inscricaoContrato');
const { avaliarHorarioBatismo, horariosDisponiveis } = require('../utils/batismoHorario');
const { horariosConfigurados, ocupacaoPorHorario } = require('../services/batismoHorarios');

// Limiter GENEROSO do router (padrão grupos/NPS/eventos): o form roda em
// Wi-Fi único (lounge da igreja num domingo) — 10/15min por IP dava 429 na
// 11ª pessoa da fila (sweep 28/07). Anti-spam real = honeypot + contrato.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_FORM_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 600 : 5000),
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições deste endereço. Tente novamente em alguns minutos.' },
});
router.use(limiter);

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

// cpfValido agora vem de services/inscricaoContrato (fonte única — P3 do
// sweep 28/07: a cópia local era idêntica, mas cópia diverge um dia).

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
  // Formato LOCAL (não toISOString/UTC): perto da meia-noite o UTC vira o dia
  // seguinte e a data do batismo saía errada — mesmo fix do fmtLocalISO da
  // apresentação de crianças.
  return `${q.getFullYear()}-${String(q.getMonth() + 1).padStart(2, '0')}-${String(q.getDate()).padStart(2, '0')}`;
}

// GET /api/public/batismo/proxima-data
// Retorna a próxima data agendada (4o domingo do mês) - usada pelo form
// para mostrar ao usuário quando ele será batizado.
router.get('/proxima-data', (_req, res) => {
  res.json({ data_batismo: proximoQuartoDomingoISO() });
});

// GET /api/public/batismo/textos — textos canônicos de consentimento (o
// snapshot gravado é sempre o do backend)
router.get('/textos', (_req, res) => {
  res.json({
    termos_lgpd: TEXTOS.termos_lgpd,
    imagem: TEXTOS.imagem,
    aviso_optin: TEXTOS.aviso_optin,
  });
});

// ⚠️ `horariosConfigurados` e `ocupacaoPorHorario` vivem em
// `services/batismoHorarios.js` — o app de membros usa as MESMAS consultas.

// GET /api/public/batismo/horarios
// Horários ABERTOS e COM VAGA pro próximo batismo · alimenta o seletor do form.
router.get('/horarios', async (_req, res) => {
  try {
    const dataBatismo = proximoQuartoDomingoISO();
    const configurados = await horariosConfigurados();
    if (configurados === null) throw new Error('catalogo_indisponivel');
    const ocup = await ocupacaoPorHorario(dataBatismo);
    // Régua ÚNICA (utils/batismoHorario) — a MESMA que o app e o formulário
    // consomem, e a mesma que o POST usa pra validar. Duas cópias é como o
    // seletor passa a oferecer horário que o servidor recusa.
    const lista = horariosDisponiveis(configurados, ocup);
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
router.post('/', async (req, res) => { // limiter geral já está no router.use (contar 2x reduziria o teto pela metade)
  try {
    const {
      nome, sobrenome, nome_completo, email, telefone, cpf, data_nascimento, sexo,
      endereco, cep, tamanho_camisa, limitacao_mobilidade, motivo,
      observacoes, horario_culto, area_kpi, fez_next,
      // Novos · LGPD/integracao
      eh_crianca, possui_deficiencia, deficiencia_descricao,
      aceita_termos, // termos LGPD (Contrato de Inscrição)
      consent_imagem, // uso de imagem — fotos da cerimônia (opcional)
      whatsapp_optin, // consentimento p/ mensagens no WhatsApp (Marketing · LGPD)
    } = req.body || {};

    // Honeypot agora tratado no server (antes era só no client — caminho morto)
    if (honeypotPreenchido(req.body)) return res.status(200).json({ ok: true });

    // D1: campo único "Nome completo" (split determinístico); tolera o payload
    // antigo nome+sobrenome de abas abertas antes do deploy.
    let nomeT = String(nome || '').trim();
    let sobrenomeT = String(sobrenome || '').trim();
    if (nome_completo && String(nome_completo).trim()) {
      const s = splitNomeCompleto(nome_completo);
      nomeT = s.nome;
      sobrenomeT = s.sobrenome;
    }

    // Validacoes básicas
    if (!nomeT || nomeT.length < 2) {
      return res.status(400).json({ error: 'Informe o nome.' });
    }
    if (!sobrenomeT) {
      return res.status(400).json({ error: 'Informe o nome completo.' });
    }
    if (temAbreviacaoNome(`${nomeT} ${sobrenomeT}`)) {
      return res.status(400).json({ error: 'Escreva seu nome completo, sem abreviações.' });
    }
    const telNorm = soDigitos(telefone);
    if (telNorm.length < 10 || telNorm.length > 11) {
      return res.status(400).json({ error: 'Informe um telefone valido (com DDD).' });
    }
    // emailValido vem do contrato (fonte única). O .trim() fica: o valor cru
    // com espaço nas pontas era aceito aqui e é o mesmo que vai pro emailNorm.
    if (!email || !emailValido(String(email).trim())) {
      return res.status(400).json({ error: 'Informe um email valido.' });
    }
    if (!cpf || !cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF é obrigatório e precisa ser válido.' });
    }
    // Nascimento sempre foi obrigatório no server — agora com validação real
    // (formato/data existente/não-futura) e o form perdeu o rótulo "(opcional)".
    const nascValid = validarNascimento(data_nascimento);
    if (!nascValid) {
      return res.status(400).json({ error: 'Informe uma data de nascimento válida.' });
    }
    if (!aceita_termos) {
      return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever.' });
    }
    const camisaNorm = tamanho_camisa ? String(tamanho_camisa).trim().toUpperCase() : null;
    if (!camisaNorm || !['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'].includes(camisaNorm)) {
      return res.status(400).json({ error: 'Escolha o tamanho da camisa.' });
    }

    const cpfNorm = cpf ? soDigitos(cpf) : null;
    const emailNorm = String(email).trim().toLowerCase();

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
        dataNascimento: nascValid,
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

    // Horário escolhido · régua ÚNICA em utils/batismoHorario (compartilhada com
    // o GET /horarios e com o POST /app/inscricoes).
    // ⚠️ FALHA FECHADA: a versão anterior envolvia a validação num `if (!hErr)`,
    // então consulta que falhava PULAVA a regra e gravava em `horario_culto` o
    // texto cru do cliente — campo que alimenta o {{2}} do lembrete enviado pelo
    // número oficial da igreja. Não conseguir conferir agora RECUSA.
    // Ausência de horário segue passando (o campo é opcional desde sempre).
    // As 2 consultas só rodam quando há horário a conferir — quem não escolheu
    // não paga round-trip nenhum.
    let horarioEscolhido = null;
    if (horario_culto && String(horario_culto).trim()) {
      const [configurados, ocupacao] = await Promise.all([
        horariosConfigurados(),
        ocupacaoPorHorario(dataBatismo),
      ]);
      const av = avaliarHorarioBatismo(horario_culto, { configurados, ocupacao });
      if (!av.ok) return res.status(409).json({ error: av.mensagem });
      horarioEscolhido = av.horario;
    }

    // Observações agora so guarda o que não tem coluna própria.
    // CEP e horário (Culto) têm colunas dedicadas (cep, horario_culto) → não entram aqui.
    const obsParts = [];
    if (motivo) obsParts.push(`Motivo: ${String(motivo).trim().slice(0, 500)}`);
    if (observacoes) obsParts.push(`Comentario: ${String(observacoes).trim().slice(0, 1000)}`);
    const cepNorm = cep ? String(cep).trim().slice(0, 20) : null;
    // Sexo · paridade com o totem (armazenado como 'M'/'F'). Aceita o
    // vocabulário canônico do contrato (masculino|feminino) e o legado M/F.
    // Obrigatório desde 28/07 (ajuste do contrato) — só para inscrições novas.
    const sexoNorm = (() => {
      const s = sexo ? String(sexo).trim().toUpperCase() : '';
      if (s === 'M' || s === 'MASCULINO') return 'M';
      if (s === 'F' || s === 'FEMININO') return 'F';
      return null;
    })();
    if (!sexoNorm) {
      return res.status(400).json({ error: 'Selecione masculino ou feminino.' });
    }

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
      data_nascimento: nascValid,
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
      telefone: telNorm, email: emailNorm, dataNascimento: nascValid,
    });

    // Atos de consentimento na satélite (Contrato de Inscrição). O de IMAGEM
    // (fotos da cerimônia) é o que destrava fotos→marketing na revisão
    // estrutural. Best-effort: a inscrição nunca é perdida por falha aqui.
    registrarConsentimentos({
      porta: 'batismo', refId: data.id, membroId,
      ip: req.ip || null, userAgent: (req.headers['user-agent'] || '').slice(0, 300) || null,
      itens: [
        { tipo: 'termos_lgpd', aceito: true },
        { tipo: 'imagem', aceito: Boolean(consent_imagem) },
        { tipo: 'whatsapp', aceito: !!whatsapp_optin },
      ],
    }).catch((e) => console.error('[publicBatismo] consentimentos:', e.message));

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
