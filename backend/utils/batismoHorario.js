/**
 * Régua ÚNICA do horário de batismo · "esse horário pode receber esta pessoa?"
 *
 * Existe porque a escolha de horário passou a ter DOIS clientes: o formulário
 * público (`publicBatismo.js`) e o app de membros (`POST /app/inscricoes`).
 * Duas cópias da regra é como o app e o web passam a discordar sobre o que está
 * aberto — a classe de defeito que a varredura de 05/08 catalogou ("o app
 * reproduz a régua do ERP em vez de consumi-la").
 *
 * Vive em `utils/` (sem Supabase) pra entrar no gate de deploy: quem lê o banco
 * é o chamador; aqui só entra decisão.
 *
 * ⚠️ FALHA FECHADA. A versão anterior (inline no público) envolvia a validação
 * inteira em `if (!hErr)`: se a consulta a `batismo_horarios` falhasse, a regra
 * era PULADA e o texto que veio do cliente era gravado em `horario_culto`. Esse
 * campo alimenta o `{{2}}` do template de lembrete (`whatsappCron.js`), ou seja,
 * texto arbitrário do cliente sairia numa mensagem enviada pelo número oficial
 * da igreja. Aqui, não conseguir conferir é motivo pra RECUSAR, nunca pra
 * aceitar às cegas.
 */

/** Normaliza o que veio do cliente. Devolve null quando não há escolha. */
function normalizarHorario(valor) {
  if (valor == null) return null;
  const s = String(valor).trim().slice(0, 80);
  return s === '' ? null : s;
}

/**
 * @param {string|null} escolhido    horário que a pessoa mandou (já normalizado ou cru)
 * @param {object} ctx
 * @param {Array<{horario:string,aberto:boolean,limite:number|null}>|null} ctx.configurados
 *        linhas VIVAS de `batismo_horarios` (deleted_at IS NULL). `null` = não
 *        foi possível ler → falha fechada.
 * @param {Record<string, number>} ctx.ocupacao  horário → nº de inscritos na data
 * @param {boolean} [ctx.exigir=false]  ver o bloco de ausência abaixo.
 * @returns {{ok: boolean, horario: string|null, motivo: string|null, mensagem: string|null}}
 */
function avaliarHorarioBatismo(escolhido, { configurados, ocupacao = {}, exigir = false } = {}) {
  const horario = normalizarHorario(escolhido);

  // ⚠️ Ausência NÃO é erro POR PADRÃO — é o estado de quem não escolheu. O
  // formulário público sempre tratou o campo como opcional, e o app de bundle
  // antigo (que não aplicou o OTA e nem sabe que existe horário) continua
  // mandando sem. Exigir ALI trancaria essa gente fora do batismo, que é a
  // mecânica do portão que trancou todo mundo em 06/08.
  //
  // ⚠️⚠️ `exigir: true` é do DIRECIONAMENTO DO NEXT (13/08 · pedido do Matheus:
  // "chega inscrição de batismo do Next sem horário definido"). Ali o opcional
  // não se justifica: os 3 clientes são telas WEB deste mesmo bundle (deploy
  // atômico, sem OTA), então quem marca "quero me batizar" tem o seletor na
  // frente. Medido em 13/08: as 3 inscrições `origem='next'` estão 100% sem
  // horário E sem data.
  if (horario === null) {
    if (!exigir) return { ok: true, horario: null, motivo: null, mensagem: null };
    if (!Array.isArray(configurados)) {
      return {
        ok: false,
        horario: null,
        motivo: 'indisponivel',
        mensagem: 'Não conseguimos confirmar os horários agora. Tente de novo em instantes.',
      };
    }
    // ⚠️ Distingue "você esqueceu de escolher" de "não há o que escolher": a
    // segunda é trabalho da EQUIPE (abrir horário no painel da Integração), e
    // mandar a pessoa "escolher" um horário que não existe é beco sem saída.
    if (horariosDisponiveis(configurados, ocupacao).length === 0) {
      return {
        ok: false,
        horario: null,
        motivo: 'sem_horario_aberto',
        mensagem: 'Não há horário de batismo aberto no momento. Fale com a equipe da Integração.',
      };
    }
    return {
      ok: false,
      horario: null,
      motivo: 'obrigatorio',
      mensagem: 'Escolha o horário do batismo.',
    };
  }

  if (!Array.isArray(configurados)) {
    return {
      ok: false,
      horario,
      motivo: 'indisponivel',
      mensagem: 'Não conseguimos confirmar os horários agora. Tente de novo em instantes.',
    };
  }

  const conf = configurados.find((h) => h && h.horario === horario);
  if (!conf || conf.aberto !== true) {
    return {
      ok: false,
      horario,
      motivo: 'fechado',
      mensagem: 'Esse horário não está mais disponível. Escolha outro.',
    };
  }

  // ⚠️ `limite` NULO = SEM TETO, de propósito: é como a coordenação abre um
  // horário sem limite. Tratar nulo como 0 fecharia o horário; como 11,
  // inventaria uma regra que ninguém escreveu.
  if (conf.limite != null && (ocupacao[horario] || 0) >= conf.limite) {
    const label = conf.label || horario;
    return {
      ok: false,
      horario,
      motivo: 'lotado',
      label,
      limite: conf.limite,
      // ⚠️ A mensagem manda pro OUTRO horário — dizer só "lotado" deixa a pessoa
      // sem saída, e o pedido do Marcos (11/08) foi exatamente "liberar apenas o
      // outro". Texto herdado do `vagaNoHorario` que esta função absorveu.
      mensagem:
        `O horário ${label} já está completo (${conf.limite} pessoas). `
        + 'Escolha outro horário — os que ainda têm vaga aparecem na lista.',
    };
  }

  return { ok: true, horario, motivo: null, mensagem: null };
}

/**
 * Lista pro seletor: só os ABERTOS e com vaga, na ordem cadastrada.
 *
 * ⚠️ Esconder o lotado (em vez de mostrá-lo desabilitado com "0 vagas") é
 * decisão de produto herdada do formulário público: a pessoa vê o que dá pra
 * escolher e nada mais. Contagem regressiva de vaga em batismo comunica
 * escassez onde a igreja passa o ano convidando — e o número envelheceria em
 * silêncio, porque não há realtime aqui.
 */
function horariosDisponiveis(configurados, ocupacao = {}) {
  return (Array.isArray(configurados) ? configurados : [])
    .filter((h) => h && h.aberto === true)
    .map((h) => ({
      horario: h.horario,
      label: h.label || h.horario,
      vagas_restantes: h.limite != null ? Math.max(0, h.limite - (ocupacao[h.horario] || 0)) : null,
    }))
    .filter((h) => h.vagas_restantes === null || h.vagas_restantes > 0);
}

module.exports = { avaliarHorarioBatismo, horariosDisponiveis, normalizarHorario };
