/**
 * Leitura do catálogo de horários de batismo — a camada que fala com o banco.
 *
 * A DECISÃO ("esse horário pode receber esta pessoa?") vive em
 * `utils/batismoHorario.js`, que é pura e entra no gate de deploy. Aqui só
 * ficam as duas consultas, compartilhadas pelos DOIS clientes: o formulário
 * público (`routes/publicBatismo.js`) e o app de membros
 * (`POST /api/app/inscricoes` com `tipo:'batismo'`).
 *
 * ⚠️ Duas cópias destas consultas é exatamente como o app e o web passam a
 * discordar sobre o que está aberto — a classe de defeito catalogada na
 * varredura de 05/08 ("o app reproduz a régua do ERP em vez de consumi-la").
 */

const { supabase } = require('../utils/supabase');
const { DATAS_ABERTAS_PADRAO } = require('../utils/batismoData');
const { fetchAllRows } = require('../utils/pagination');

/**
 * Catálogo VIVO de `batismo_horarios`.
 * ⚠️ Devolve `null` quando não deu pra ler — quem consome trata isso como falha
 * FECHADA (`avaliarHorarioBatismo`), nunca como "não há horário configurado".
 * Lista vazia (`[]`) é resposta legítima: significa catálogo sem linhas.
 */
async function horariosConfigurados() {
  const { data, error } = await supabase
    .from('batismo_horarios')
    .select('horario, label, aberto, limite')
    .is('deleted_at', null)
    .order('ordem');
  if (error) {
    console.error('[batismoHorarios] catálogo:', error.message);
    return null;
  }
  return data || [];
}

/**
 * Quantas inscrições ativas já ocupam cada horário na data do batismo.
 *
 * ⚠️ Paginado: o cap de 1000 do PostgREST trunca EM SILÊNCIO, e um batismo
 * grande passando disso faria o limite por horário parar de valer sem erro
 * nenhum aparecer.
 */
async function ocupacaoPorHorario(dataBatismo) {
  const linhas = await fetchAllRows(() => supabase
    .from('batismo_inscricoes')
    .select('horario_culto')
    .eq('data_batismo', dataBatismo)
    .is('deleted_at', null)
    .not('status', 'in', '(cancelado,rejeitado)'));
  const c = {};
  linhas.forEach((i) => {
    if (i.horario_culto) c[i.horario_culto] = (c[i.horario_culto] || 0) + 1;
  });
  return c;
}

/**
 * Data do próximo batismo pela MESMA função que o fan-out SQL usa
 * (`fn_proximo_quarto_domingo`). ⚠️ Reimplementar o cálculo em JS aqui faria a
 * ocupação ser contada num dia e a inscrição cair em outro.
 * Devolve `null` em falha — o chamador decide (aqui, falha fechada).
 */
async function dataProximoBatismo() {
  // ⚠️⚠️ Lê o CADASTRO (`fn_batismo_proxima_data`), não mais a fórmula crua.
  // Desde 25/09/2026 as datas vivem em `batismo_eventos`: a fórmula do 4º
  // domingo virou o semeador. Trocar AQUI conserta os 10 pontos de chamada de
  // uma vez — se o gestor fechar uma data, todos passam a respeitar.
  // A própria função tem a fórmula como rede, então tabela vazia não trava.
  const { data, error } = await supabase.rpc('fn_batismo_proxima_data');
  if (error) {
    console.error('[batismoHorarios] fn_batismo_proxima_data:', error.message);
    return null;
  }
  return data || null;
}

/**
 * As N próximas datas ABERTAS de batismo, em ordem.
 *
 * ⚠️ Falha FECHADA (`null`, não `[]`): lista vazia é indistinguível de "não
 * consegui ler", e quem recebe `[]` mostra um formulário sem data nenhuma sem
 * saber que está mostrando um erro.
 */
async function datasAbertas(n = DATAS_ABERTAS_PADRAO) {
  const { data, error } = await supabase.rpc('fn_batismo_datas_abertas', { p_n: n });
  if (error) {
    console.error('[batismoHorarios] fn_batismo_datas_abertas:', error.message);
    return null;
  }
  // A RPC devolve linhas {data: 'YYYY-MM-DD'}; normaliza para lista de texto.
  return (data || []).map((r) => (typeof r === 'string' ? r : r?.data)).filter(Boolean);
}

module.exports = { horariosConfigurados, ocupacaoPorHorario, dataProximoBatismo, datasAbertas };
