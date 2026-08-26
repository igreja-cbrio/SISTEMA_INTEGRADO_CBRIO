// Resolve "de qual grupo esta conversa fala" e calcula o próximo encontro,
// para a tela oferecer a sugestão de resposta ao atendente.
//
// ⚠️ A régua do TEXTO mora em `utils/respostaGrupoAgenda` (pura, no gate) e a
// da AGENDA em `utils/agendaGrupo` (idem). Aqui é só banco. Recalcular agenda
// com conta própria seria a 3ª régua de "quando é o encontro" — e o sintoma de
// divergir é o app e o inbox discordarem sobre a mesma terça-feira.

const { supabase } = require('../utils/supabase');
const { proximoEncontro, ancoraDeInicio } = require('../utils/agendaGrupo');
const { ancorasDeGrupos, iniciosDeGrupos } = require('./grupoAncora');
const { montarRespostaAgenda } = require('../utils/respostaGrupoAgenda');

/**
 * O grupo de quem está na conversa.
 *
 * ⚠️ A fonte preferida é o VÍNCULO (`mem_grupo_membros`), não o disparo:
 * `grupos.pedido_aprovado` tem `ref_id` em **5 de 550** envios (medido 26/08),
 * então o disparo sozinho não resolve. Medido nas 74 conversas abertas: o
 * vínculo resolve 22 direto e deixa 4 ambíguas (pessoa em 2+ grupos) — e é
 * SÓ nessas 4 que o disparo entra, para desempatar.
 *
 * ⚠️ Ambiguidade não resolvida devolve `null`, nunca "o primeiro da lista":
 * mandar a pessoa para o endereço do grupo errado é pior que não sugerir nada.
 */
async function grupoDaConversa(conversa) {
  if (!conversa?.membro_id) return { grupo: null, motivo: 'sem_cadastro' };

  const { data, error } = await supabase.from('mem_grupo_membros')
    .select('grupo_id, mem_grupos!inner(id, nome, dia_semana, horario, recorrencia, local, endereco, bairro, temporada, lider_id, ativo, deleted_at)')
    .eq('membro_id', conversa.membro_id).is('saiu_em', null);
  if (error) { console.warn('[sugestaoGrupo] vinculos:', error.message); return { grupo: null, motivo: 'erro' }; }

  const vivos = (data || [])
    .map(v => v.mem_grupos)
    .filter(g => g && g.ativo && !g.deleted_at);

  if (vivos.length === 1) return { grupo: vivos[0], motivo: 'vinculo' };
  if (!vivos.length) return { grupo: null, motivo: 'sem_grupo' };

  const escolhido = await desempatarPeloDisparo(conversa.telefone, vivos);
  return escolhido
    ? { grupo: escolhido, motivo: 'vinculo_disparo' }
    : { grupo: null, motivo: 'ambiguo', candidatos: vivos.map(g => g.nome) };
}

/** Entre N grupos da pessoa, o do disparo mais recente que carregue referência. */
async function desempatarPeloDisparo(telefone, candidatos) {
  const d = String(telefone || '').replace(/\D+/g, '');
  if (d.length < 8) return null;
  const { data, error } = await supabase.from('whatsapp_envios')
    .select('ref_id, criado_em')
    .ilike('telefone', `%${d.slice(-8)}`)
    .like('contexto', 'grupos%')
    .not('ref_id', 'is', null)
    .order('criado_em', { ascending: false }).limit(5);
  if (error || !data?.length) return null;

  const { data: pedidos } = await supabase.from('mem_grupo_pedidos')
    .select('id, grupo_id').in('id', data.map(e => e.ref_id));
  const ids = new Set((pedidos || []).map(p => p.grupo_id));
  const casa = candidatos.filter(g => ids.has(g.id));
  // ⚠️ Dois candidatos com disparo é empate de novo — devolve null.
  return casa.length === 1 ? casa[0] : null;
}

/**
 * Âncora do grupo: a REAL (último encontro registrado) ou a derivada do início
 * da temporada. É `estimada` que decide se a sugestão promete ou pede confirmação.
 *
 * ⚠️ SEMANAL nunca é estimado — o dia da semana já determina tudo, não há
 * cadência a ancorar. Marcá-lo como estimativa poria ressalva em ~2/3 dos
 * grupos sem motivo, e ressalva que aparece sempre para de ser lida.
 */
async function ancoraDoGrupo(grupo) {
  const [reais, inicios] = await Promise.all([
    ancorasDeGrupos([grupo.id]).catch(() => ({})),
    iniciosDeGrupos([grupo.id]).catch(() => ({})),
  ]);
  const real = reais?.[grupo.id] || null;
  if (real) return { ancoraISO: real, estimada: false };

  const semanal = String(grupo.recorrencia || 'semanal').toLowerCase() === 'semanal';
  if (semanal) return { ancoraISO: null, estimada: false };

  const derivada = ancoraDeInicio({ diaSemana: grupo.dia_semana, inicioISO: inicios?.[grupo.id] || null });
  return { ancoraISO: derivada, estimada: !!derivada };
}

/** Endereço legível — o disparo de boas-vindas usa os mesmos campos. */
function localDoGrupo(g) {
  return [g.local, g.endereco, g.bairro].map(x => String(x || '').trim()).filter(Boolean).join(' — ');
}

async function liderDoGrupo(grupo) {
  if (!grupo?.lider_id) return { nome: '', telefone: '' };
  const { data } = await supabase.from('mem_membros')
    .select('nome, telefone').eq('id', grupo.lider_id).is('deleted_at', null).maybeSingle();
  return { nome: data?.nome || '', telefone: data?.telefone || '' };
}

/**
 * A sugestão pronta para o atendente revisar e enviar.
 *
 * ⚠️ Devolve `{ disponivel:false, motivo }` em vez de texto genérico quando não
 * dá para saber o grupo. Sugestão que chuta é pior que sugestão ausente: quem
 * está com pressa envia sem ler.
 */
async function sugerirAgenda(conversaId) {
  const { data: conversa, error } = await supabase.from('wa_conversas')
    .select('id, nome, telefone, membro_id').eq('id', conversaId).is('deleted_at', null).maybeSingle();
  if (error || !conversa) return { disponivel: false, motivo: 'conversa_nao_encontrada' };

  const { grupo, motivo, candidatos } = await grupoDaConversa(conversa);
  if (!grupo) return { disponivel: false, motivo, candidatos };

  const { ancoraISO, estimada } = await ancoraDoGrupo(grupo);
  // ⚠️ As colunas são `nova_data` e `status` — NÃO `data_nova`/`cancelado`.
  // Escrevi errado na primeira versão e o `information_schema` pegou: pedir
  // coluna inexistente faz o PostgREST recusar a query INTEIRA (42703), e como
  // o `error` estava sendo descartado a sugestão simplesmente nunca apareceria.
  // ⚠️ Erro aqui NÃO vira "não há exceção": um encontro cancelado que passe
  // batido faria a sugestão mandar a pessoa numa reunião que não vai existir.
  const { data: exc, error: eExc } = await supabase.from('mem_grupo_agenda_excecoes')
    .select('data_original, status, nova_data, novo_horario').eq('grupo_id', grupo.id);
  if (eExc) {
    console.warn('[sugestaoGrupo] excecoes:', eExc.message);
    return { disponivel: false, motivo: 'agenda_indisponivel' };
  }

  const prox = proximoEncontro({
    diaSemana: grupo.dia_semana, horario: grupo.horario,
    recorrencia: grupo.recorrencia, ancoraISO, excecoes: exc || [],
  });

  const lider = await liderDoGrupo(grupo);
  const { texto, confianca } = montarRespostaAgenda({
    nome: conversa.nome, grupoNome: grupo.nome,
    proximaISO: prox?.data || null, horario: grupo.horario,
    recorrencia: grupo.recorrencia, local: localDoGrupo(grupo),
    liderNome: lider.nome, liderTelefone: lider.telefone,
    // ⚠️ Ocorrência que o próprio `agendaGrupo` marcou como incerta também é
    // estimativa — não basta olhar a âncora.
    estimada: estimada || !!prox?.ancora_incerta || !!prox?.data_estimada,
  });

  return {
    disponivel: true, texto, confianca,
    grupo: { id: grupo.id, nome: grupo.nome, recorrencia: grupo.recorrencia },
    proxima: prox?.data || null, origem_grupo: motivo,
  };
}

module.exports = { sugerirAgenda, grupoDaConversa, ancoraDoGrupo, localDoGrupo };
