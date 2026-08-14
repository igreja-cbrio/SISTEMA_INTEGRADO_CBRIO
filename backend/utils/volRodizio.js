/**
 * Rodízio de escala de voluntários — régua PURA (sem banco, sem relógio).
 *
 * Nasceu de duas coisas medidas no Planning Center Services (13/08/2026), que é
 * a ferramenta que a igreja usava e que a equipe conhece:
 *
 *  1. A lista de candidatos de lá vem ordenada por **há quanto tempo a pessoa
 *     não serve** (-7w, -5w, -4w…), não em ordem alfabética. É isso que faz uma
 *     lista de centenas de nomes ser útil sem digitar nada: quem está há mais
 *     tempo sem servir aparece primeiro. A nossa era alfabética, e o topo era
 *     sempre a mesma gente — o rodízio ficava no olho do supervisor.
 *  2. O auto-schedule de lá diz a regra na cara: "filtra quem tem conflito e
 *     escolhe quem foi escalado há mais tempo".
 *
 * ⚠️ Fica em `utils/` (sem `require` de banco) porque é assim que entra no gate
 * de deploy — `src/test/volRodizio.test.ts`. Quem lê o banco é a rota.
 *
 * ⚠️ O "agora" é SEMPRE injetado. Teste que lê o relógio da máquina foi o que
 * mordeu no `faixaEtaria.test.ts`.
 */

const MS_DIA = 24 * 60 * 60 * 1000;
const MS_SEMANA = 7 * MS_DIA;

/** Timestamp de uma data ISO (ou Date). Devolve null pro que não dá pra ler. */
function _ts(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Há quantas semanas INTEIRAS a pessoa não serve.
 *
 * `null` = não há escala anterior na janela consultada. ⚠️ Isso NÃO é "nunca
 * serviu": a rota olha 12 meses pra trás, e quem serviu há 2 anos cai aqui
 * igual a quem nunca serviu. O rótulo abaixo é escrito pra não afirmar o que
 * não sabemos.
 *
 * Escala futura (data depois da referência) conta como 0 — a pessoa já está
 * comprometida naquela semana, então não é candidata "descansada".
 */
function semanasSemServir(ultimaEscalaISO, agoraISO) {
  const ultima = _ts(ultimaEscalaISO);
  const agora = _ts(agoraISO);
  if (ultima === null || agora === null) return null;
  const diff = agora - ultima;
  if (diff <= 0) return 0;
  return Math.floor(diff / MS_SEMANA);
}

/**
 * Texto curto pra tela. Honesto quando não sabemos.
 *
 * ⚠️ O caso `null` NÃO diz "nunca serviu": a busca da rota tem uma janela
 * (`janela_dias` na resposta do contexto), e quem serviu antes dela cai aqui
 * junto de quem nunca serviu. A tela mostra a janela ao lado.
 */
function rotuloTempoSemServir(semanas) {
  if (semanas === null || semanas === undefined) return 'sem escala recente';
  if (semanas <= 0) return 'serviu esta semana';
  if (semanas === 1) return 'há 1 semana';
  if (semanas >= 52) return 'há mais de um ano';
  return `há ${semanas} semanas`;
}

/**
 * Peso de ordenação do tempo sem servir. Quem não tem escala na janela vale
 * mais que qualquer outro (topo da lista), e é por isso que não pode ser 0.
 */
function _pesoTempo(c) {
  return c.semanas === null || c.semanas === undefined
    ? Number.POSITIVE_INFINITY
    : c.semanas;
}

/**
 * Ordena candidatos pro painel de escalar.
 *
 * 1º quem NÃO tem conflito (já serve em outro culto do mesmo dia);
 * 2º quem está há mais tempo sem servir;
 * 3º nome, só pra a ordem ser determinística (lista que muda de ordem a cada
 *    render é lista em que ninguém confia).
 *
 * ⚠️ Indisponível NÃO é ordenado aqui — é FILTRADO antes, pela rota. Ausência
 * declarada é regra de servidor desde 13/08, não item no fim da lista.
 */
function ordenarCandidatos(candidatos) {
  return [...(candidatos || [])].sort((a, b) => {
    const ca = a.conflito ? 1 : 0;
    const cb = b.conflito ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const pa = _pesoTempo(a);
    const pb = _pesoTempo(b);
    if (pa !== pb) return pb - pa;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });
}

/**
 * A pessoa serve NESTA vaga?
 *
 * Dois níveis, e a ordem importa:
 *  - vaga COM posição: só quem tem essa posição, ou quem é da equipe sem
 *    posição definida no vínculo. ⚠️ Quem tem OUTRA posição da mesma equipe
 *    NÃO serve — senão o auto-preencher escala o baterista no vocal.
 *  - vaga SEM posição ("equipe toda"): qualquer vínculo daquela equipe.
 */
function _vinculoParaVaga(candidato, vaga) {
  const vinculos = (candidato.equipes || []).filter(v => v.team_id === vaga.team_id);
  if (!vinculos.length) return null;
  if (!vaga.position_id) return vinculos[0];
  return (
    vinculos.find(v => v.position_id === vaga.position_id) ||
    vinculos.find(v => !v.position_id) ||
    null
  );
}

/** Elegibilidade dura — o que nunca entra por automação. */
function candidatoElegivel(candidato) {
  if (!candidato) return false;
  if (candidato.indisponivel) return false;
  if (candidato.jaEscalado) return false;
  // ⚠️ Conflito (já serve em outro culto do MESMO DIA) não entra por automação.
  // A pessoa pode topar dobrar, mas quem pede isso é gente — o automático
  // deixa a vaga aberta e DECLARA, em vez de comprometer o domingo de alguém.
  if (candidato.conflito) return false;
  return true;
}

/**
 * Distribui candidatos nas vagas em aberto (auto-preencher).
 *
 * ⚠️ Preenche o número de vagas que a composição do culto pede — nunca "todo
 * mundo da equipe", que era o que o auto-fill fazia até 13/08/2026 (numa
 * equipe de 40 pessoas, escalava as 40).
 *
 * Vaga sem ninguém elegível fica ABERTA e é declarada em `vagasSemCandidato`.
 * Vaga silenciosamente não preenchida é a que ninguém descobre até o domingo.
 */
function distribuirVagas({ vagas, candidatos }) {
  const elegiveis = (candidatos || []).filter(candidatoElegivel);
  const ordenados = ordenarCandidatos(elegiveis);
  const usados = new Set();
  const atribuicoes = [];
  const vagasSemCandidato = [];

  for (const vaga of vagas || []) {
    const faltam = Math.max(0, Number(vaga.faltam) || 0);
    for (let i = 0; i < faltam; i++) {
      const escolhido = ordenados.find(c => !usados.has(c.id) && _vinculoParaVaga(c, vaga));
      if (!escolhido) {
        vagasSemCandidato.push({ ...vaga, restantes: faltam - i });
        break;
      }
      usados.add(escolhido.id);
      atribuicoes.push({
        vaga,
        candidato: escolhido,
        vinculo: _vinculoParaVaga(escolhido, vaga),
      });
    }
  }

  return { atribuicoes, vagasSemCandidato };
}

module.exports = {
  semanasSemServir,
  rotuloTempoSemServir,
  ordenarCandidatos,
  candidatoElegivel,
  distribuirVagas,
  MS_SEMANA,
};
