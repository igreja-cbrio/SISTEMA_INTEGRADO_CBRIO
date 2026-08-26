// ════════════════════════════════════════════════════════════════════════════
//  "Quando é o meu grupo?" — o texto da sugestão de resposta
//
//  Nasceu de QUATRO conversas reais, todas do mesmo disparo de grupos e todas
//  a mesma pergunta com roupas diferentes (25/08/2026):
//    Ana Cristina  · "E quando inicia ?"
//    Jessica       · "Gostaria de saber se está tudo ok para a reunião hoje ?"
//    (21) 98633... · "Vai começar amanhã mesmo?"
//    Thalya        · "Vou semana que vem com minha amiga! Ta bom?!"
//
//  ⚠️⚠️ A RESPOSTA NÃO É "o grupo já iniciou". O Matheus pediu que o agente
//  dissesse "está tudo certo para hoje" — e a medição do caso dele mostrou o
//  contrário: o CASAIS ALPHA é QUINZENAL, a temporada abriu em 01/08 (sábado),
//  o 1º encontro caiu em 04/08 e a cadência dá 04/08 · 18/08 · 01/09. O dia em
//  que ela perguntou (25/08) era **semana de folga**. Responder "tudo certo
//  para hoje" mandaria a Jessica à Barra da Tijuca numa terça sem reunião.
//
//  ⚠️⚠️ E NEM DÁ PARA AFIRMAR O CONTRÁRIO: aquele grupo tem ZERO encontros
//  registrados, então a âncora é DERIVADA do início da temporada — estimativa,
//  não fato. Medido em 25/08: dos 35 grupos não-semanais ativos, **34 nunca
//  registraram um encontro**. Ou seja o estado "eu calculei, mas não tenho
//  prova" é o caso NORMAL, não a exceção.
//
//  ⇒ Decisão do Matheus (26/08), depois de ver o número: a sugestão DECLARA a
//  cadência, dá a data calculada e manda confirmar com a liderança quando a
//  âncora é estimada. Precisão inventada aqui custa uma pessoa parada na porta
//  de um endereço errado — e ela não volta.
//
//  ⚠️ Isto é SUGESTÃO para uma pessoa enviar, não resposta automática. A lei de
//  12/08 (reafirmada em 24/08 · `whatsapp_config.respostas_automaticas=false`)
//  é dele: "não quero bot; será apenas atendimento humanizado". Uma detecção
//  errada aqui custa uma sugestão recusada, não uma mensagem errada enviada em
//  nome da igreja — e é isso que permite a régua ser generosa.
// ════════════════════════════════════════════════════════════════════════════

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Como a cadência é DITA para quem lê. Silêncio no semanal é proposital: é o esperado. */
const CADENCIA_TEXTO = {
  semanal: '',
  quinzenal: ' (a cada 15 dias)',
  mensal: ' (uma vez por mês)',
  diario: ' (todos os dias)',
};

function primeiroNomeDe(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

/**
 * "terça-feira, 01/09, às 19:00" a partir do ISO e do horário do grupo.
 *
 * ⚠️ Data é FATIADA da string, nunca `new Date(iso)`: `new Date('2026-09-01')`
 * é meia-noite UTC = 31/08 21h no Rio, e o rótulo sairia com o dia anterior.
 * É a mesma armadilha do dia da curva do censo e do "culto de agora".
 */
function quandoPorExtenso(dataISO, horario) {
  if (!dataISO) return null;
  const [a, m, d] = String(dataISO).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  const hh = String(horario || '').slice(0, 5);
  const data = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  return hh ? `${dia}, ${data}, às ${hh}` : `${dia}, ${data}`;
}

/**
 * O texto da sugestão.
 *
 * Três estados, e confundi-los é o defeito que esta régua existe para impedir:
 *   • `proximaISO` + `estimada:false` → afirma a data
 *   • `proximaISO` + `estimada:true`  → dá a data, DIZ que é cálculo e manda confirmar
 *   • sem `proximaISO`               → não inventa data nenhuma
 *
 * Devolve `{ texto, confianca }` — `confianca` sobe para a tela poder avisar
 * quem vai enviar. Sugestão que não diz o quanto confia é sugestão que se
 * envia sem ler.
 */
function montarRespostaAgenda({
  nome = '', grupoNome = '', proximaISO = null, horario = '',
  recorrencia = 'semanal', local = '', liderNome = '', liderTelefone = '',
  estimada = false,
} = {}) {
  const oi = primeiroNomeDe(nome) ? `Oi, ${primeiroNomeDe(nome)}!` : 'Oi!';
  const grupo = String(grupoNome || '').trim();
  const quando = quandoPorExtenso(proximaISO, horario);
  const cadencia = CADENCIA_TEXTO[String(recorrencia || '').toLowerCase()] ?? '';
  const lider = String(liderNome || '').trim();
  const contatoLider = lider
    ? `${primeiroNomeDe(lider)}${liderTelefone ? ` (${liderTelefone})` : ''}`
    : null;

  const l = [];

  if (!quando) {
    // ⚠️ Sem data calculável (grupo sem dia da semana — são 4 ativos assim) o
    // texto NÃO inventa nada. Mandar alguém num dia errado é pior que mandá-la
    // perguntar.
    l.push(`${oi} O grupo *${grupo}* já está acontecendo e você já pode participar.`);
    l.push('');
    l.push(contatoLider
      ? `Para confirmar o próximo encontro, fale com ${contatoLider}.`
      : 'A liderança vai te confirmar a data do próximo encontro.');
    return { texto: l.join('\n'), confianca: 'sem_data' };
  }

  l.push(`${oi} O grupo *${grupo}* já está acontecendo e você já pode participar do próximo encontro.`);
  l.push('');
  l.push(`📅 ${quando}${cadencia}`);
  if (String(local || '').trim()) l.push(`📍 ${String(local).trim()}`);

  if (estimada) {
    // ⚠️ A ressalva vem DEPOIS da data, nunca no lugar dela: quem lê quer saber
    // quando ir. E ela é explícita sobre o motivo — "ainda não temos os
    // encontros registrados" é verdade e não joga a culpa em ninguém.
    l.push('');
    l.push(contatoLider
      ? `Como os encontros deste grupo ainda não estão registrados no sistema, confirme com ${contatoLider} antes de ir. 🙏`
      : 'Como os encontros deste grupo ainda não estão registrados no sistema, confirme com a liderança antes de ir. 🙏');
    return { texto: l.join('\n'), confianca: 'estimada' };
  }

  if (contatoLider) {
    l.push('');
    l.push(`Qualquer dúvida, fale com ${contatoLider}.`);
  }
  l.push('');
  l.push('Te esperamos lá! 💚');
  return { texto: l.join('\n'), confianca: 'confirmada' };
}

module.exports = { montarRespostaAgenda, quandoPorExtenso, primeiroNomeDe, CADENCIA_TEXTO, DIAS };
