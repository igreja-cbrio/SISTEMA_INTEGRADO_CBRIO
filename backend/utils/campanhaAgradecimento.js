// ════════════════════════════════════════════════════════════════════════════
//  Agradecimento ao doador — régua PURA
//
//  ⚠️⚠️ A MENSAGEM NÃO CHAMA A PESSOA PELO NOME. Isso é decisão da reunião, e o
//  motivo é técnico, não estilístico: "por causa de inconsistências na base de
//  contatos — como números de telefone cadastrados em nome de familiares ou
//  filhos — a mensagem de agradecimento deverá ser genérica, sem citar o nome da
//  pessoa, para evitar erros de identificação".
//
//  A base confirma o risco: `mem_contatos` existe justamente porque telefone e
//  e-mail são COMPARTILHADOS por família nesta igreja, e o matcher tem proibição
//  explícita de ligar pessoa por telefone/e-mail sozinho (LEI do Contrato de
//  porta). Um "Obrigado, Maria!" enviado pro celular que está no cadastro da
//  Maria mas é do marido dela é um erro que a igreja não pode cometer com quem
//  acabou de doar.
//
//  ⚠️ E o tom é HUMANO, não robótico: "o retorno deverá ser pessoal ou
//  humanizado em tom, evitando uma aparência meramente automática". Genérico no
//  NOME, específico no que aconteceu (a campanha, o que o dinheiro faz).
//
//  ⚠️ O canal preferencial é E-MAIL, "por ser mais adequado às restrições de
//  envio em massa" da Meta. WhatsApp só com opt-in — ver `campanhaPublico.js`.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Janela de silêncio entre dois agradecimentos pra MESMA pessoa.
 *
 * ⚠️ Quem doa 3× na mesma semana (Pix no domingo, transferência na terça, mais
 * uma no sábado) não pode receber 3 e-mails de obrigado — vira ruído e faz a
 * pessoa marcar como spam, o que custa a reputação do domínio pra igreja
 * INTEIRA. 72h é a janela: cobre o intervalo entre dois cultos sem juntar
 * doações de semanas diferentes num único agradecimento tardio.
 */
const JANELA_SILENCIO_HORAS = 72;

/**
 * Esta doação merece agradecimento AGORA?
 *
 * `doacao`   = { id, membro_id, valor_centavos, quando (ISO) }
 * `contexto` = { ja_agradecida, ultimo_agradecimento_em, canal_disponivel, agora }
 *
 * Devolve { agradecer, motivo } — `motivo` sempre preenchido quando NÃO, porque
 * "por que essa doação não foi agradecida" é a pergunta que alguém vai fazer.
 */
function deveAgradecer(doacao, contexto = {}) {
  if (!doacao) return { agradecer: false, motivo: 'doação inexistente' };

  // ⚠️ Idempotência: uma doação é agradecida UMA vez. A guarda real é o índice
  // único em `camp_agradecimentos.transacao_id` — esta checagem só evita a
  // viagem ao banco e o 23505 no log. As duas existem de propósito: a lição de
  // "guarda de idempotência tem que ser na MESMA chave do índice único".
  if (contexto.ja_agradecida) {
    return { agradecer: false, motivo: 'esta doação já foi agradecida' };
  }

  // Doação sem cadastro casado é legítima (doação anônima é legítima), mas não
  // tem para onde mandar. Não é erro — é o caminho normal de quem doou sem CPF.
  if (!doacao.membro_id) {
    return { agradecer: false, motivo: 'doação sem cadastro vinculado (anônima)' };
  }

  if (!contexto.canal_disponivel) {
    return { agradecer: false, motivo: 'pessoa sem e-mail nem opt-in de WhatsApp' };
  }

  // ⚠️ Estorno/valor negativo nunca dispara obrigado. Parece obvio; não é — a
  // fila de transações carrega crédito E débito, e um filtro esquecido aqui
  // manda "obrigado pela sua generosidade" pra quem teve o Pix devolvido.
  if (Number(doacao.valor_centavos) <= 0) {
    return { agradecer: false, motivo: 'valor não é uma entrada de dinheiro' };
  }

  if (contexto.ultimo_agradecimento_em && contexto.agora) {
    const horas = (new Date(contexto.agora) - new Date(contexto.ultimo_agradecimento_em)) / 3600000;
    if (Number.isFinite(horas) && horas >= 0 && horas < JANELA_SILENCIO_HORAS) {
      return {
        agradecer: false,
        motivo: `já foi agradecida nas últimas ${JANELA_SILENCIO_HORAS}h`,
      };
    }
  }

  return { agradecer: true, motivo: null };
}

/**
 * O texto do agradecimento.
 *
 * ⚠️ SEM NOME, SEM VALOR. O nome pelo motivo do cabeçalho. O valor porque a
 * mensagem pode chegar no celular da família: "obrigado pela sua doação de
 * R$ 5.000" exibe na tela de bloqueio quanto a casa doou, e isso não é da conta
 * de quem estiver olhando o telefone. Quem quiser o número tem o comprovante.
 *
 * `campanha` = { nome, descricao_curta, link }
 */
function textoAgradecimento(campanha = {}) {
  const nome = campanha.nome || 'nossa campanha';
  const causa = campanha.descricao_curta
    || 'transformar o espaço onde as nossas crianças são cuidadas e ensinadas';

  const assunto = `Obrigado por fazer parte da ${nome}`;

  const corpoTexto = [
    'Sua contribuição chegou.',
    '',
    `Você acabou de participar da ${nome} — e queríamos que você soubesse `
      + 'que isso não passou em branco por aqui.',
    '',
    `Cada valor que entra vai direto para ${causa}. Não é uma obra de concreto: `
      + 'é o lugar onde uma criança vai ouvir sobre Jesus pela primeira vez, e onde '
      + 'os pais dela vão poder deixá-la em paz enquanto adoram.',
    '',
    'Obrigado por não ter ficado só assistindo.',
    '',
    campanha.link ? `Acompanhe o andamento em ${campanha.link}` : null,
    '',
    'Com gratidão,',
    'Equipe CBRio',
  ].filter((l) => l !== null).join('\n');

  return { assunto, corpo_texto: corpoTexto };
}

module.exports = {
  JANELA_SILENCIO_HORAS,
  deveAgradecer,
  textoAgradecimento,
};
