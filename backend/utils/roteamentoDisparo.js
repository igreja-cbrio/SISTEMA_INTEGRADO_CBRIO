// ════════════════════════════════════════════════════════════════════════════
//  "Essa conversa é de quem?" — roteamento da resposta a um DISPARO
//
//  Pedido do Matheus (25/08/2026), em duas mensagens seguidas:
//    *"toda mensagem que seja respondida, referente a grupos, já deve chegar
//     atribuída à Natasha com a tag de entrada de grupos"*
//    *"qualquer resposta a um disparo de escalas e voluntariado em geral, deve
//     cair atribuído à Ariel e com tag de entrada de voluntariado"*
//
//  ⚠️⚠️ NENHUM DOS DOIS NOMES ESTÁ NESTE ARQUIVO, e é lei do projeto (05/08):
//  quem é o dono do fluxo vive no BANCO e muda sem PR. Aqui mora só a pergunta
//  "qual setor cuida do disparo que originou esta conversa?"; quem responde
//  "e quem é a pessoa daquele setor" é `conversas_setores.atendente_id`.
//  Ele provou a lei ao vivo: acrescentou a segunda pessoa dois minutos depois
//  da primeira, e amanhã vem Kids, Cuidados, Next. Hardcodar seria um PR por
//  pessoa, para sempre.
//
//  O MECANISMO JÁ EXISTIA E NÃO ERA ALCANÇADO. `concluirTriagem` (o menu do
//  bot) já atribui e etiqueta quando o setor tem `destino_tipo='atendente'`.
//  Só que quem responde a um disparo NUNCA passa pelo menu — ela responde a
//  mensagem que a igreja mandou. Medido em 26/08: **62 das 68 conversas
//  abertas estão com `area` NULL e 68 sem dono**, enquanto o setor "Grupos"
//  existe e está ativo desde sempre. Não faltava tela nem tabela: faltava a
//  resposta a disparo encontrar o caminho que o menu já tinha.
// ════════════════════════════════════════════════════════════════════════════

const { moduloDoContexto } = require('./whatsappModulo');

/**
 * Janela em que uma resposta ainda "é referente" ao disparo.
 *
 * ⚠️ Sete dias, medido nos casos reais: o lembrete de escala é SEMANAL (Syogi
 * respondeu o de 22/08 no dia 23), e a boas-vindas de grupo é respondida no
 * mesmo dia ou no seguinte (Aline, Josianne, Thalya, Jessica). Mais que isso e
 * a pessoa está falando de outro assunto — atribuir ali mandaria à Natasha uma
 * conversa que não é dela, e o custo de errar o dono é a conversa parar na
 * caixa de alguém que não sabe responder.
 * ⚠️ Fora da janela a conversa fica SEM área, exatamente como hoje. Degradar
 * para o comportamento atual é honesto; chutar dono não é.
 */
const JANELA_DIAS = 7;

/** Sem acento, minúsculo, sem espaço nas pontas. */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

/**
 * Qual setor cuida deste módulo?
 *
 * ⚠️ O casamento é `conversas_setores.area` normalizada == slug do módulo, e
 * isso NÃO é coincidência feliz: as áreas cadastradas ("Grupos", "Integração",
 * "KIDS", "Voluntariado") viram exatamente os slugs do `whatsappModulo`
 * (grupos, integracao, kids, voluntariado) depois de tirar acento e caixa.
 * Conferido contra as 8 linhas vivas em 26/08.
 *
 * ⚠️ DUAS linhas podem apontar para a MESMA área — hoje "Integração" (ordem 3)
 * e "Batismo" (ordem 7). Desempate pela MENOR `ordem`, que é a que a pessoa vê
 * primeiro no menu e a genérica das duas. Sem o desempate a escolha dependeria
 * da ordem em que o banco devolveu as linhas, e mudaria sozinha.
 *
 * ⚠️ Módulo SEM setor (membresia, inscricoes, solicitacoes, financeiro, rh)
 * devolve null — não roteia, não inventa destino. Área que não existe no menu
 * não tem quem a atenda.
 */
function setorDoModulo(modulo, setores) {
  const alvo = normalizar(modulo);
  if (!alvo) return null;
  const candidatos = (Array.isArray(setores) ? setores : [])
    .filter((s) => s && s.ativo !== false && normalizar(s.area) === alvo);
  if (!candidatos.length) return null;
  return candidatos.reduce((a, b) => (Number(a.ordem ?? 1e9) <= Number(b.ordem ?? 1e9) ? a : b));
}

/**
 * A conversa deve ser etiquetada e atribuída por causa deste disparo?
 *
 * Devolve `{ area, atendenteId, setor }` ou **null** quando não há decisão
 * segura. `atendenteId` só vem preenchido quando o setor declara um dono
 * (`destino_tipo='atendente'` + `atendente_id`) — senão etiqueta a área e
 * deixa sem dono, que é o comportamento do menu para setor de área.
 *
 * ⚠️⚠️ NUNCA SOBRESCREVE. Área já preenchida ou conversa já atribuída ⇒ null.
 * Uma pessoa transferiu de propósito, ou a própria pessoa escolheu o setor no
 * menu — puxar de volta para o dono do disparo desfaria trabalho humano em
 * silêncio, e o sintoma seria "a conversa some da minha caixa sozinha".
 */
function decidirRoteamento({
  area = null, atribuidoA = null, contexto = null,
  disparoEm = null, agora = null, setores = [],
} = {}) {
  if (area || atribuidoA) return null;        // ⚠️ decisão humana manda
  if (!contexto) return null;                  // não veio de disparo nenhum
  if (!dentroDaJanela(disparoEm, agora)) return null;

  const destino = moduloDoContexto(contexto);
  const setor = setorDoModulo(destino?.modulo, setores);
  if (!setor) return null;

  const temDono = setor.destino_tipo === 'atendente' && !!setor.atendente_id;
  return {
    area: setor.area,
    atendenteId: temDono ? setor.atendente_id : null,
    setor,
  };
}

/**
 * O disparo é recente o bastante para explicar esta resposta?
 *
 * ⚠️ Data ilegível devolve **false**, nunca true: sem saber QUANDO o disparo
 * saiu, não dá para afirmar que a mensagem responde a ele. Fail-closed aqui
 * custa uma conversa sem etiqueta; fail-open custa uma conversa na caixa da
 * pessoa errada.
 * ⚠️ Disparo no FUTURO (relógio torto, fila adiantada) também não vale.
 */
function dentroDaJanela(disparoEm, agora) {
  if (!disparoEm) return false;
  const t = new Date(disparoEm).getTime();
  const ref = agora ? new Date(agora).getTime() : Date.now();
  if (!Number.isFinite(t) || !Number.isFinite(ref)) return false;
  const dias = (ref - t) / 86400000;
  return dias >= 0 && dias <= JANELA_DIAS;
}

module.exports = { decidirRoteamento, setorDoModulo, dentroDaJanela, normalizar, JANELA_DIAS };
