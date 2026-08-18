// ============================================================================
//  ONLINE · "isto é um ERRO, ou é o estado normal de não ter live agora?"
//
//  Régua PURA (sem banco, sem rede) para entrar no gate de deploy.
//
//  ⚠️⚠️ POR QUE EXISTE (18/08/2026 · levantado pelo Matheus)
//
//  Ele perguntou o que era o aviso "Coleta online com erro recente" que
//  aparecia em manhãs aleatórias. Medido: a coleta **não estava quebrada** —
//  agosto tinha 17 de 17 cultos online com vídeo vinculado, pico e DS.
//
//  A causa era de VOCABULÁRIO. O monitor de live roda a cada 5 minutos nas
//  janelas de culto; quando olha e a transmissão já acabou, gravava
//
//      last_error = 'live_encerrada_ou_sem_dado'
//
//  no token OAuth. Isso NÃO é erro — é a resposta normal de "não tem live
//  agora", e acontece na esmagadora maioria das execuções (a janela cobre
//  horas; a live dura ~1h30). Mas `verificarColetaOnline` lê QUALQUER
//  `last_error` não-nulo como "coleta degradada" e dispara o aviso diário.
//
//  Como uma coleta bem-sucedida limpa o campo, o alarme aparecia ou não
//  conforme qual tinha sido a ÚLTIMA execução do dia — daí a aleatoriedade.
//
//  ⚠️ A distinção que vale: `last_error` responde "a coleta está quebrada?".
//  Só entra ali o que IMPEDE coletar e exige gente (token revogado, credencial
//  recusada, quota estourada). "Não tem live agora" e "ainda não achei o vídeo
//  deste culto" são ESTADO — o monitor viu, e não havia o que colher.
//
//  ⚠️ Alarme que toca sem nada quebrado é pior que alarme nenhum: ele treina a
//  equipe a ignorar o sino, e no dia em que o token cair de verdade o aviso
//  vai parecer com todos os outros. É a mesma lição do WiFi (13/08).
// ============================================================================

/**
 * Motivos que são ESTADO ESPERADO da coleta, não falha.
 *
 * ⚠️ Lista FECHADA e comparada por igualdade: motivo desconhecido é tratado
 * como ERRO (fail-closed). Se um dia surgir um estado novo e ele começar a
 * alarmar, a correção é acrescentá-lo aqui — de propósito, com o motivo
 * escrito. O inverso (tratar desconhecido como estado) esconderia falha nova.
 */
const ESTADOS_ESPERADOS = Object.freeze([
  // A janela do monitor cobre horas; a live dura ~1h30. Fora dela, isto é o
  // que acontece — e é o caso MAIS COMUM de todos.
  'live_encerrada_ou_sem_dado',
  // Não há transmissão ativa no canal neste instante.
  'sem_live_ativa',
  // Há live, mas nenhuma casa com o horário deste culto (a guarda 1:1 do
  // `escolherVideoDoCulto` recusando vídeo de outro culto é comportamento
  // correto, não defeito).
  'sem_video_compativel',
  // O tipo de culto não tem horário cadastrado — é lacuna de CADASTRO, e quem
  // resolve não é quem cuida do token do YouTube.
  'sem_horario_culto',
]);

/**
 * @param {string|null|undefined} motivo
 * @returns {'estado'|'erro'} — 'estado' NÃO deve ir para `last_error`.
 */
function classificarDiagOnline(motivo) {
  const m = String(motivo ?? '').trim();
  if (!m) return 'estado';                       // sucesso: nada a reportar
  return ESTADOS_ESPERADOS.includes(m) ? 'estado' : 'erro';
}

/**
 * Monta o patch de diagnóstico do token a partir de um motivo.
 *
 * ⚠️ Estado esperado **LIMPA** o `last_error` em vez de só não escrever: sem
 * isso, um erro real de ontem ficaria pendurado para sempre e o aviso diário
 * seguiria tocando depois que o problema já passou — que é exatamente o que a
 * linha revogada de maio ("Canal Rede Social CBrio não tem acesso…") ainda faz
 * naquela linha morta.
 */
function patchDiagOnline(motivo, agoraIso) {
  return {
    last_check_at: agoraIso,
    last_error: classificarDiagOnline(motivo) === 'erro' ? String(motivo) : null,
  };
}

module.exports = { ESTADOS_ESPERADOS, classificarDiagOnline, patchDiagOnline };
