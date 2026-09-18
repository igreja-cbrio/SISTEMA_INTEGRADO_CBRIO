/**
 * Catálogo de horários da apresentação de crianças — a camada que fala com o banco.
 *
 * A DECISÃO ("qual culto recebe esta inscrição?") vive em
 * `utils/apresentacaoHorario.js`, pura, no gate de deploy. Aqui só ficam as
 * consultas, partilhadas pelos DOIS escritores de `apresentacao_criancas`: o
 * formulário público (`routes/publicApresentacao.js`) e o app de membros
 * (`routes/app.js` · `POST /apresentacao-crianca`). Duas cópias é como as duas
 * portas passam a discordar do horário — a classe de defeito da varredura de 05/08.
 *
 * Padrão idêntico ao `services/batismoHorarios.js`.
 */

const { supabase } = require('../utils/supabase');
const { fetchAllRows } = require('../utils/pagination');
const { escolherHorarioApresentacao } = require('../utils/apresentacaoHorario');

/**
 * Catálogo VIVO de `apresentacao_horarios` (inclui fechados — quem filtra é a
 * régua). `null` quando não deu pra ler; `[]` = catálogo sem linhas.
 */
async function horariosConfigurados() {
  const { data, error } = await supabase
    .from('apresentacao_horarios')
    .select('id, horario, label, aberto, limite, ordem')
    .is('deleted_at', null)
    .order('ordem');
  if (error) {
    console.error('[apresentacaoHorarios] catálogo:', error.message);
    return null;
  }
  return data || [];
}

/**
 * Quantas inscrições ATIVAS (= crianças) já ocupam cada horário na data.
 * Cancelada não ocupa vaga. Paginado (o cap de 1000 do PostgREST trunca em silêncio).
 */
async function ocupacaoPorHorario(dataApresentacao) {
  const linhas = await fetchAllRows(() => supabase
    .from('apresentacao_criancas')
    .select('horario_culto')
    .eq('data_apresentacao', dataApresentacao)
    .is('deleted_at', null)
    .neq('status', 'cancelado'));
  const c = {};
  (linhas || []).forEach((i) => {
    if (i.horario_culto) c[i.horario_culto] = (c[i.horario_culto] || 0) + 1;
  });
  return c;
}

/**
 * Conveniência dos escritores: lê catálogo + ocupação e aplica a régua.
 * Nunca lança — falha aqui vira `{ horario: null }` e a inscrição entra sem
 * horário (o Kids corrige na tela). Perder a inscrição por um informativo é
 * pior que deixá-lo em branco.
 *
 * @returns {Promise<{horario:string|null,label:string|null,transbordou:boolean,lotado:boolean,configurados:Array|null,ocupacao:Record<string,number>}>}
 */
async function escolherHorarioPara(dataApresentacao) {
  try {
    const [configurados, ocupacao] = await Promise.all([
      horariosConfigurados(),
      ocupacaoPorHorario(dataApresentacao),
    ]);
    const r = escolherHorarioApresentacao(configurados, ocupacao);
    return { ...r, configurados, ocupacao };
  } catch (e) {
    console.error('[apresentacaoHorarios] escolher:', e.message);
    return { horario: null, label: null, transbordou: false, lotado: false, configurados: null, ocupacao: {} };
  }
}

module.exports = { horariosConfigurados, ocupacaoPorHorario, escolherHorarioPara };
