// ════════════════════════════════════════════════════════════════════════════
//  CENSO · gravação do consentimento (o lado que toca o banco)
//
//  A régua pura vive em `utils/censoConsentimento.js` (decide o QUE vira prova).
//  Aqui fica o que ela não pode fazer: falar com o banco. Existe como serviço
//  porque TRÊS caminhos precisam do mesmo comportamento e duas cópias
//  divergiriam — o envio público, o modo síncrono do mesmo envio, e o reparo do
//  pós-processamento.
//
//  ⚠️⚠️ NO CENSO A PESSOA É RESOLVIDA DEPOIS, e é isso que molda este arquivo.
//  No caminho padrão o matcher NÃO roda no envio (7 das 8,3 idas ao banco por
//  resposta; com 2.500 pessoas no culto seriam ~17.500 queries com a pessoa
//  olhando a tela). Então:
//    · a PROVA é gravada no envio, ancorada em `ref_id = cen_resposta.id`,
//      quase sempre com `membro_id` NULL;
//    · o OPT-IN no cadastro só pode ser ligado quando a pessoa existe — ou seja,
//      no pós-processamento (ou no modo síncrono, quando o matcher já rodou).
//  Inverter isso perderia a prova toda vez que o pós-processamento falhasse, e
//  prova de consentimento é justamente o que não dá para pedir de novo.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const { consentimentosDaResposta, patchDoCadastro } = require('../utils/censoConsentimento');
const { registrarConsentimentos } = require('./inscricaoContrato');

const PORTA = 'censo';

/**
 * Grava no ledger o que ESTA resposta consentiu — só o que ainda não está lá.
 *
 * ⚠️ Idempotente por consulta, não por UNIQUE: `inscricao_consentimentos` é
 * append-only e NÃO tem unicidade por (porta, ref_id, tipo) — é append-only de
 * propósito, porque a mesma pessoa pode consentir em portas e momentos
 * diferentes. Aqui a repetição não acrescentaria fato nenhum (é a MESMA
 * resposta), e duas linhas contraditórias para o mesmo aceite deixariam a
 * leitura sem saber qual vale. Por isso lemos antes.
 *
 * ⚠️ `ip_origem` fica NULL de propósito. O censo guarda `ip_hash` na resposta
 * porque o que ele coleta é convicção religiosa e saúde emocional; gravar o IP
 * cru numa linha ancorada em `ref_id` daquela mesma resposta desfaria essa
 * escolha pela porta dos fundos. A cadeia de prova é o `ref_id` — a resposta
 * carrega quando, de onde (hash) e o texto aceito.
 */
async function gravarConsentimentosDoCenso({
  respostaId, perguntas, respostas, membroId = null, userAgent = null,
}) {
  const { consentimentos, indefinidos } = consentimentosDaResposta(perguntas, respostas);
  if (!consentimentos.length) return { ok: true, gravados: 0, indefinidos, consentimentos };

  const { data: jaTem, error: eLer } = await supabase
    .from('inscricao_consentimentos')
    .select('tipo')
    .eq('porta', PORTA).eq('ref_id', respostaId).is('deleted_at', null);
  // ⚠️ Falha de LEITURA não vira "não tem nada": gravaríamos por cima e a
  // auditoria veria dois aceites para o mesmo fato. Propaga para quem chamou
  // decidir (no envio isso vira marca de pendência, não erro na cara da pessoa).
  if (eLer) throw new Error(`consentimento_nao_lido: ${eLer.message}`);

  const tem = new Set((jaTem || []).map((l) => l.tipo));
  const faltam = consentimentos.filter((c) => !tem.has(c.tipo));
  if (!faltam.length) return { ok: true, gravados: 0, indefinidos, consentimentos };

  const out = await registrarConsentimentos({
    porta: PORTA,
    refId: respostaId,
    membroId,
    ip: null,
    userAgent,
    itens: faltam,
  });
  // ⚠️ `registrarConsentimentos` ENGOLE o erro do insert (console.error +
  // `{ok:false}`). Sem levantar aqui, um CHECK barrando a porta ou o tipo
  // sumiria sem deixar rastro — que é exatamente a falha muda que este caminho
  // existe para impedir.
  if (!out.ok) throw new Error('consentimento_nao_gravado');
  return { ok: true, gravados: out.gravados, indefinidos, consentimentos };
}

/**
 * Liga o opt-in no cadastro da pessoa.
 *
 * ⚠️⚠️ SÓ LIGA, NUNCA DESLIGA (lei de 05/08). Não marcar — ou marcar "não" —
 * nesta porta é ausência de consentimento AQUI, não revogação do que a pessoa
 * autorizou em outra. Revogar é ato dela, pelo "SAIR" do WhatsApp.
 *
 * ⚠️ O `.or(...)` preserva `whatsapp_optin_em` de quem já tinha consentido:
 * aquela data é a prova de DESDE QUANDO vale, e sobrescrevê-la com a de hoje
 * não atualiza nada — apaga.
 */
async function ligarOptinDoCenso({ membroId, consentimentos, em = null }) {
  if (!membroId) return { ligado: false, motivo: 'sem_membro' };
  const patch = patchDoCadastro(consentimentos, em);
  if (!patch) return { ligado: false, motivo: 'sem_aceite' };

  const { data, error } = await supabase
    .from('mem_membros')
    .update(patch)
    .eq('id', membroId)
    .or('whatsapp_optin.is.null,whatsapp_optin.eq.false')
    .select('id');
  if (error) throw new Error(`optin_nao_ligado: ${error.message}`);
  return { ligado: (data || []).length > 0, motivo: (data || []).length ? null : 'ja_tinha' };
}

module.exports = { PORTA, gravarConsentimentosDoCenso, ligarOptinDoCenso };
