// ============================================================================
// Lançamento de decisões pelo VOLUNTÁRIO, no culto, pelo link assinado
// ============================================================================
// O voluntário já coleta nome+telefone no fim do culto. Hoje isso vira papel e
// alguém lança dias depois (média 3, máximo 9 · medido em 14/08/2026), quando o
// SLA de primeiro contato de 3 dias já venceu. Aqui ele lança do celular dele.
//
// ⚠️ O `culto_id` vem SEMPRE do token, NUNCA do corpo. É isso que torna o bug
// de 12/07 impossível por construção (naquele dia 19 nomes foram lançados no
// culto errado porque quem digitou 9 dias depois não lembrava qual papel era
// de qual culto).
//
// ⚠️ NENHUM endpoint aqui devolve lista de pessoas. Um link vaza (print, grupo
// de WhatsApp, celular emprestado) e não pode virar janela pra base de gente.
// O contador é agregado justamente pra dois voluntários não duplicarem sem
// que ninguém precise ver nome de ninguém.
//
// ⚠️ Público · sem auth · service_role (bypassa RLS). Montado ANTES do
// `publicLimiter` estrito e com entrada no `skip()` do limiter global: a
// igreja inteira sai por 1 IP (NAT do prédio) e o teto por IP quebraria o
// fluxo no 11º envio — lição do censo e da doação.
// ============================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { verificarTokenCulto } = require('../utils/cultoToken');
const { registrarConsentimentos } = require('../services/inscricaoContrato');
// Janela de lançamento (dia do culto + 2). ⚠️ A régua mora em `utils/` pra
// entrar no gate de deploy — NÃO reimplementar aqui: é ela que decide se uma
// escrita pública de PESSOA é aceita, e duas cópias divergiriam.
const { DIAS_JANELA, hojeBRT, estadoJanelaCulto, dataBR } = require('../utils/cultoJanela');

// ⚠️ Texto próprio, e ele é DELIBERADAMENTE diferente do `termos_lgpd` padrão:
// quem preenche aqui é o VOLUNTÁRIO transcrevendo o que a pessoa falou, não a
// própria pessoa. Marcar uma caixa por outro alguém não é consentimento do
// titular — é declaração de um terceiro, e o honesto é gravar exatamente isso.
// Gravar como se fosse consentimento do titular seria fabricar prova legal.
const TEXTO_DECLARADO_VOLUNTARIO =
  'Registro de decisão feito por voluntário da CBRio no culto, a pedido da ' +
  'pessoa e na presença dela. A pessoa informou nome e contato para que a ' +
  'equipe pastoral entre em contato sobre os primeiros passos. Consentimento ' +
  'DECLARADO PELO VOLUNTARIO (nao coletado diretamente do titular). A pessoa ' +
  'pode solicitar acesso, correcao ou exclusao dos dados pelos canais da igreja.';

// Generoso de proposito: 1 voluntario lanca varias pessoas em sequencia no fim
// do culto, e varios voluntarios saem pelo MESMO IP (wifi da igreja).
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas · aguarde um instante.' },
});
router.use(limiter);

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

// Resolve o culto do token e diz se a janela de lançamento ainda está aberta.
// Recusa NEUTRA em todos os casos de falha: não distingue token malformado de
// segredo ausente de culto inexistente — distinguir entrega um oráculo a quem
// está sondando.
async function abrirCulto(token) {
  const id = verificarTokenCulto(token);
  if (!id) return { erro: 404 };

  const { data: c } = await supabase
    .from('cultos')
    .select('id, data, nome, service_type_id')
    .eq('id', id)
    .maybeSingle();
  if (!c) return { erro: 404 };

  const { data: st } = await supabase
    .from('vol_service_types')
    .select('name')
    .eq('id', c.service_type_id)
    .maybeSingle();

  const { estado, dias } = estadoJanelaCulto(c.data, hojeBRT());
  return {
    culto: {
      id: c.id,
      data: c.data,
      data_br: dataBR(c.data),
      nome: st?.name || c.nome || 'Culto',
      // A validade REAL é decidida aqui, no servidor, a cada uso — o token não
      // carrega expiração porque o culto já é datado. Guardar link da semana
      // inteira no celular não abre nada antes da hora.
      estado,
      aberto: estado === 'aberto',
      dias_desde: dias,
      dias_janela: DIAS_JANELA,
    },
  };
}

// GET /:token — o voluntário abre a tela. Devolve o MÍNIMO: qual culto é, se a
// janela está aberta e QUANTAS decisões já foram lançadas (contagem agregada,
// jamais nomes).
router.get('/:token', async (req, res) => {
  try {
    const r = await abrirCulto(req.params.token);
    if (r.erro) return res.status(404).json({ error: 'Link inválido ou expirado.' });

    const { count } = await supabase
      .from('cultos_decisoes_pessoas')
      .select('id', { count: 'exact', head: true })
      .eq('culto_id', r.culto.id)
      .is('deleted_at', null);

    res.json({ ...r.culto, ja_lancadas: count || 0 });
  } catch (e) {
    console.error('[public/decisao-culto GET]', e.message);
    res.status(500).json({ error: 'Não foi possível abrir agora. Tente novamente.' });
  }
});

// POST /:token — registra UMA decisão naquele culto.
router.post('/:token', async (req, res) => {
  try {
    const r = await abrirCulto(req.params.token);
    if (r.erro) return res.status(404).json({ error: 'Link inválido ou expirado.' });
    // ⚠️ ANTES do culto tem resposta PRÓPRIA, e vem primeiro. O link circula com
    // dias de antecedência; recusar com "o prazo encerrou" seria mentir sobre um
    // link que ainda vai valer. O servidor recusa de qualquer jeito — a tela
    // esconder o formulário não é a trava, esta é.
    if (r.culto.estado === 'antes') {
      return res.status(409).json({
        error: 'janela_nao_abriu',
        message: `O lançamento deste culto abre no dia ${r.culto.data_br}. Guarde o link até lá.`,
      });
    }
    if (!r.culto.aberto) {
      return res.status(410).json({
        error: 'janela_encerrada',
        message: `O prazo de lançamento deste culto encerrou (${DIAS_JANELA} dias). Passe os nomes para a equipe de Integração.`,
      });
    }

    const nome = String(req.body?.nome || '').trim();
    const telefone = soDigitos(req.body?.telefone);
    const semContato = req.body?.sem_contato === true;

    if (nome.length < 2) {
      return res.status(400).json({ error: 'Informe o nome da pessoa.' });
    }
    // ⚠️ Telefone é obrigatório, e a válvula é EXPLÍCITA. O módulo inteiro
    // existe pra fazer o 1º contato em até 3 dias: registro sem contato é a
    // versão digital de "55 decisões declaradas, 1 nome". Mas perder a
    // contagem porque a pessoa não quis dar o número é pior — então a recusa
    // se declara e fica registrada, em vez de virar campo vazio silencioso.
    if (!semContato && (telefone.length < 10 || telefone.length > 11)) {
      return res.status(400).json({ error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos), ou marque que a pessoa não quis deixar contato.' });
    }

    // ⚠️ Só adulto/adolescente por esta porta. Criança exige consentimento do
    // responsável (LGPD art. 14, §1º) e o fluxo próprio do Kids — coletar nome
    // e telefone de menor aqui seria coleta sem base legal.
    if (req.body?.crianca === true) {
      return res.status(400).json({
        error: 'crianca_fora_desta_porta',
        message: 'Decisão de criança é registrada pela equipe do Kids, com o responsável.',
      });
    }

    // ⚠️ O id é gerado AQUI pra que o consentimento seja gravado ANTES da
    // decisão. Se a gravação da decisão falhar, sobra uma linha órfã no ledger
    // (inofensiva); na ordem inversa sobraria dado de pessoa SEM prova legal,
    // que é a lição do "consentimento não vive dentro do .then() do matcher".
    const decisaoId = crypto.randomUUID();

    await registrarConsentimentos({
      porta: 'decisao',
      refId: decisaoId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      itens: [{ tipo: 'termos_lgpd', aceito: true, texto: TEXTO_DECLARADO_VOLUNTARIO }],
    });

    // O matcher canônico roda no trigger BEFORE INSERT
    // (`tg_cultos_dec_pessoas_resolve_membro`): CPF → e-mail+NOME →
    // telefone+NOME → nascimento+NOME → cria visitante. Contrato de porta
    // cumprido sem segunda implementação aqui.
    const { error } = await supabase.from('cultos_decisoes_pessoas').insert({
      id: decisaoId,
      culto_id: r.culto.id, // ⚠️ do TOKEN, nunca do body
      nome,
      telefone: telefone || null,
      tipo_decisao: 'presencial',
      fonte: 'link_culto',
      observacoes: semContato ? 'Pessoa não quis deixar contato (lançado pelo voluntário no culto).' : null,
    });
    if (error) throw error;

    res.json({ ok: true, nome: nome.split(/\s+/)[0] });
  } catch (e) {
    console.error('[public/decisao-culto POST]', e.message);
    res.status(500).json({ error: 'Não foi possível registrar agora. Tente novamente.' });
  }
});

module.exports = router;
