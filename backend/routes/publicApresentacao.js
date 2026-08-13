// Formulário público de Apresentação de Crianças (substitui o Google Forms).
// Acontece sempre no 2º domingo do mês. Cria/reusa a criança em kids_criancas
// (agora com nascimento/sexo e SEM duplicar), liga o responsável via matcher
// canônico e avisa a equipe Kids. As respostas aparecem na aba do Kids.
//
// PORTA 2 do Contrato de Inscrição (F3.1 · docs/modulo-inscricoes/): é PII de
// MENOR — consentimento específico do responsável (LGPD art. 14 §1º) é
// obrigatório; nascimento+sexo da criança obrigatórios p/ inscrições novas;
// e-mail do responsável obrigatório; endereço opcional. Linhas antigas nunca
// são alteradas nem re-validadas.
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const {
  honeypotPreenchido, temAbreviacaoNome, validarNascimento, SEXOS, TEXTOS,
  processarIdentidade, registrarConsentimentos, normalizarCpf, normalizarEmail,
  emailValido,
} = require('../services/inscricaoContrato');
// ⚠️ As 3 perguntas de saúde são a régua ÚNICA das duas portas de apresentação
// (esta e a do app). Duas listas fariam a criança entrar com dado diferente
// conforme a porta — o desalinhamento que o Marcos mandou consertar.
const { normalizarSaude } = require('../utils/saudeCrianca');

// Limiter GENEROSO do router (padrão grupos/NPS/eventos): Wi-Fi único da
// igreja — 10/15min por IP dava 429 na 11ª família (sweep 28/07).
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_FORM_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 600 : 5000),
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições deste endereço. Tente novamente em alguns minutos.' },
});
router.use(limiter);

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

// "8 meses" / "3 anos" derivado do nascimento — mantém a coluna legada
// crianca_idade viva sem pedir dois campos pra pessoa.
function idadeTexto(nascISO, refISO) {
  const n = new Date(`${nascISO}T12:00:00`);
  const r = new Date(`${refISO}T12:00:00`);
  const dias = Math.floor((r.getTime() - n.getTime()) / 86400000);
  if (Number.isNaN(dias) || dias < 0) return null;
  if (dias < 60) return `${dias} dias`;
  let meses = (r.getFullYear() - n.getFullYear()) * 12 + (r.getMonth() - n.getMonth());
  if (r.getDate() < n.getDate()) meses -= 1;
  if (meses < 24) return `${meses} meses`;
  return `${Math.floor(meses / 12)} anos`;
}

function nomeCompletoOk(nome) {
  const n = String(nome || '').trim().replace(/\s+/g, ' ');
  return n.length >= 5 && n.split(' ').length >= 2 && !temAbreviacaoNome(n);
}

// GET /api/public/apresentacao-criancas/proxima-data
router.get('/proxima-data', (_req, res) => {
  res.json({ data_apresentacao: proximoSegundoDomingoISO() });
});

// GET /api/public/apresentacao-criancas/textos — textos canônicos (o snapshot
// gravado no consentimento é sempre o do backend)
router.get('/textos', (_req, res) => {
  res.json({
    menor_responsavel: TEXTOS.menor_responsavel,
    imagem: TEXTOS.imagem,
    aviso_optin: TEXTOS.aviso_optin,
  });
});

// POST /api/public/apresentacao-criancas
router.post('/', async (req, res) => { // limiter geral já está no router.use (contar 2x reduziria o teto pela metade)
  try {
    const body = req.body || {};
    const {
      nome_pai, nome_mae, criancas, crianca_nome, crianca_idade, telefone,
      cpf_responsavel, email, endereco, observacoes,
      aceita_termos_menor, consent_imagem, whatsapp_optin,
    } = body;

    if (honeypotPreenchido(body)) return res.json({ ok: true }); // honeypot · ignora silenciosamente

    // Aceita lista de crianças (1 por filho) · tolera o formato antigo (1 campo).
    const listaBruta = Array.isArray(criancas) && criancas.length
      ? criancas
      : [{ nome: crianca_nome, idade: crianca_idade }];
    const lista = listaBruta
      .map(c => ({
        nome: String(c?.nome || '').trim().replace(/\s+/g, ' ').slice(0, 200),
        nascimento: validarNascimento(c?.data_nascimento),
        sexo: SEXOS.includes(String(c?.sexo || '').toLowerCase()) ? String(c.sexo).toLowerCase() : null,
        idade: c?.idade ? String(c.idade).trim().slice(0, 60) : null,
        // ⚠️ Régua ÚNICA com a porta do app (`utils/saudeCrianca`): as 3 perguntas
        // que MOVEM a operação de domingo. Não perguntada ⇒ chave ausente ⇒ o
        // campo fica NULO, que é diferente de "respondeu que não".
        saude: normalizarSaude(c),
      }))
      .filter(c => c.nome.length >= 2);

    if (!lista.length) return res.status(400).json({ error: 'Informe o nome de ao menos uma criança.' });

    // Contrato: nome completo da criança + nascimento + sexo (inscrições novas)
    for (const c of lista) {
      if (!nomeCompletoOk(c.nome)) return res.status(400).json({ error: `Escreva o nome completo da criança, sem abreviações (${c.nome}).` });
      if (!c.nascimento) return res.status(400).json({ error: `Informe a data de nascimento de ${c.nome}.` });
      if (!c.sexo) return res.status(400).json({ error: `Selecione o sexo de ${c.nome}.` });
    }

    // Responsável: pai OU mãe (agora validado também no servidor), nome completo
    const nomePaiT = nome_pai ? String(nome_pai).trim().replace(/\s+/g, ' ').slice(0, 200) : null;
    const nomeMaeT = nome_mae ? String(nome_mae).trim().replace(/\s+/g, ' ').slice(0, 200) : null;
    if (!nomePaiT && !nomeMaeT) return res.status(400).json({ error: 'Informe o nome do pai ou da mãe.' });
    for (const n of [nomePaiT, nomeMaeT]) {
      if (n && !nomeCompletoOk(n)) return res.status(400).json({ error: 'Escreva o nome completo do pai/mãe, sem abreviações.' });
    }

    const tel = String(telefone || '').replace(/\D+/g, '');
    if (tel.length < 10 || tel.length > 11) return res.status(400).json({ error: 'Informe um telefone válido com DDD.' });

    const cpfDig = normalizarCpf(cpf_responsavel);
    if (!cpfDig) return res.status(400).json({ error: 'Informe um CPF válido do responsável.' });

    const emailNorm = normalizarEmail(email);
    if (!emailNorm || !emailValido(emailNorm)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }

    // LGPD art. 14 §1º — consentimento específico do responsável é obrigatório
    if (!aceita_termos_menor) {
      return res.status(400).json({ error: 'É preciso aceitar a autorização de responsável para inscrever a criança.' });
    }

    const enderecoT = endereco ? String(endereco).trim().slice(0, 300) : null;
    const optin = Boolean(whatsapp_optin);
    const dataApresentacao = proximoSegundoDomingoISO();
    const obsExtra = observacoes ? String(observacoes).trim().slice(0, 1000) : null;

    // 1 registro por criança. Dedup: mesma criança × mesmo CPF × mesma data
    // não duplica (reenvio conta como "já inscrita").
    const criados = [];
    const criancaIds = [];
    const jaInscritas = [];
    for (const c of lista) {
      const { data: dup, error: eDup } = await supabase
        .from('apresentacao_criancas')
        .select('id')
        .eq('cpf_responsavel', cpfDig)
        .eq('data_apresentacao', dataApresentacao)
        .ilike('crianca_nome', c.nome)
        .neq('status', 'cancelado')
        .is('deleted_at', null)
        .limit(1);
      if (eDup) throw eDup;
      if (dup && dup.length) { jaInscritas.push(c.nome); continue; }

      // kids_criancas: reusa se já existe (nome + nascimento), senão cria com
      // dados de verdade — antes criava criança "órfã" duplicada a cada envio.
      let criancaId = null;
      try {
        const { data: kidDup } = await supabase
          .from('kids_criancas')
          .select('id, tem_alergia, alergia_qual, tem_espectro, espectro_qual, tem_limitacao_fisica, limitacao_fisica_qual')
          .ilike('nome', c.nome)
          .eq('data_nascimento', c.nascimento)
          .eq('ativo', true)
          .limit(1);
        if (kidDup && kidDup.length) {
          criancaId = kidDup[0].id;
          // ⚠️ SÓ-ONDE-VAZIO (política do censo e do CPF tardio): a criança já
          // existe e a família acabou de responder sobre alergia/TEA/limitação.
          // Preenche o que está NULO e **nunca** sobrescreve — o que está lá
          // pode ter sido corrigido pela equipe do Kids no atendimento.
          const patch = {};
          for (const [k, v] of Object.entries(c.saude)) {
            if (kidDup[0][k] === null || kidDup[0][k] === undefined) patch[k] = v;
          }
          if (Object.keys(patch).length) {
            await supabase.from('kids_criancas').update(patch).eq('id', criancaId);
          }
        } else {
          const obsInterna = `Cadastrado via formulário de Apresentação de Crianças (${dataApresentacao}). `
            + `Pais: ${nomePaiT || '—'} / ${nomeMaeT || '—'}.`;
          const { data: kid } = await supabase
            .from('kids_criancas')
            .insert({
              nome: c.nome,
              data_nascimento: c.nascimento,
              sexo: c.sexo === 'masculino' ? 'M' : 'F', // vocabulário local do Kids
              visitante: true,
              observacoes_internas: obsInterna,
              ...c.saude,
            })
            .select('id').single();
          criancaId = kid?.id || null;
        }
      } catch (e) {
        console.error('[publicApresentacao] cadastro kids_criancas falhou:', e.message);
      }

      const { data, error } = await supabase
        .from('apresentacao_criancas')
        .insert({
          nome_pai: nomePaiT,
          nome_mae: nomeMaeT,
          crianca_nome: c.nome,
          crianca_idade: c.idade || idadeTexto(c.nascimento, dataApresentacao),
          crianca_data_nascimento: c.nascimento,
          crianca_sexo: c.sexo,
          telefone: tel,
          cpf_responsavel: cpfDig,
          email: emailNorm,
          endereco: enderecoT,
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
      if (criancaId) criancaIds.push(criancaId);
    }

    if (!criados.length && !jaInscritas.length) return res.status(500).json({ error: 'Erro ao enviar inscrição.' });

    if (criados.length) {
      // CONSENTIMENTO DE MENOR (art. 14 §1º) é INDEPENDENTE do matcher — antes
      // vivia dentro do .then() da identidade, e uma falha lá apagava a prova
      // legal justamente na porta de PII de menor. Grava SEMPRE (satélite é
      // append-only); o vínculo com o membro fica na própria inscrição
      // (responsavel_membro_id), que o matcher preenche em paralelo.
      const gravarConsentimentos = (membroId) => Promise.all(criados.map((id) => registrarConsentimentos({
        porta: 'apresentacao', refId: id, membroId: membroId || null,
        ip: req.ip || null, userAgent: req.headers['user-agent'] || null,
        itens: [
          { tipo: 'menor_responsavel', aceito: true },
          { tipo: 'whatsapp', aceito: optin },
          { tipo: 'imagem', aceito: Boolean(consent_imagem) },
        ],
      })));
      gravarConsentimentos(null)
        .catch((err) => console.error('[publicApresentacao] consentimentos:', err.message));

      // Funil de identidade do RESPONSÁVEL (matcher read-only + observação) +
      // vínculo criança↔responsável no Kids. Best-effort: a inscrição nunca é
      // perdida por falha aqui.
      const nomeResp = nomeMaeT || nomePaiT;
      processarIdentidade({
        nomeCompleto: nomeResp, cpf: cpfDig, email: emailNorm, telefone: tel,
        politica: 'ligar', origem: 'apresentacao_formulario', origemId: criados[0],
      }).then(async (ident) => {
        if (ident.membroId) {
          const { error: eR } = await supabase.from('apresentacao_criancas')
            .update({ responsavel_membro_id: ident.membroId }).in('id', criados);
          if (eR) console.error('[publicApresentacao] responsavel_membro_id:', eR.message);
          // Estado do opt-in persiste no membro (padrão batismo) — antes só o
          // ATO ia pra satélite e o notificarMembro seguia tratando o
          // responsável como não-optado (achado do sweep 28/07). Só liga.
          if (optin) {
            const { error: eO } = await supabase.from('mem_membros')
              .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
              .eq('id', ident.membroId).eq('whatsapp_optin', false).is('deleted_at', null);
            if (eO) console.error('[publicApresentacao] optin membro:', eO.message);
          }
          // parentesco só quando dá pra afirmar (um único nome preenchido)
          const parentesco = nomeMaeT && !nomePaiT ? 'mae' : (nomePaiT && !nomeMaeT ? 'pai' : null);
          for (const cid of criancaIds) {
            // ⚠️ LEI (Marcos 2026-06-14): vínculo de RETIRADA nunca é automático.
            // O default da coluna é autorizado_buscar=true — um formulário
            // público com CPF válido + nome/nascimento de criança já cadastrada
            // viraria responsável autorizado no totem. Aqui entra SEMPRE false;
            // autorização de busca só pelo fluxo com documentos
            // (kids_vinculo_solicitacoes) ou pela equipe no atendimento.
            const { error: eV } = await supabase.from('kids_responsaveis').upsert({
              crianca_id: cid, membro_id: ident.membroId, parentesco,
              autorizado_buscar: false,
              observacao: `Vínculo criado pela inscrição pública de apresentação (${dataApresentacao}) — retirada NÃO autorizada por esta via.`,
            }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: true });
            if (eV) console.error('[publicApresentacao] kids_responsaveis:', eV.message);
          }
        }
      }).catch((err) => console.error('[publicApresentacao] identidade:', err.message));

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
        titulo: criados.length > 1 ? 'Nova apresentação de crianças' : 'Nova apresentação de criança',
        mensagem: `${nomes} — inscriç${criados.length > 1 ? 'ões' : 'ão'} para a apresentação de ${dataApresentacao}. Entrar em contato com a família para agendar o horário.`,
        link: '/ministerial/totem-kids/apresentacao',
        severidade: 'info',
        chaveDedup: `apresentacao_crianca_${criados[0]}`,
        targetIds: alvosKids && alvosKids.length ? alvosKids : undefined,
      }).catch(err => console.error('[publicApresentacao] notificacao falhou:', err.message));
    }

    res.status(201).json({ ok: true, ids: criados, ja_inscritas: jaInscritas, data_apresentacao: dataApresentacao });
  } catch (e) {
    console.error('[publicApresentacao] erro:', e.message);
    res.status(500).json({ error: 'Erro ao enviar inscrição.' });
  }
});

module.exports = router;
