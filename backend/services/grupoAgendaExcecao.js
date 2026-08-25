// ============================================================================
// EXCEÇÃO DE AGENDA do grupo · o único escritor (25/08/2026)
//
// Remarcar / cancelar / desfazer UMA ocorrência. O encontro recorrente NÃO é uma
// linha — ele é derivado de `mem_grupos.dia_semana + horario + recorrencia`, e o
// que se guarda é a EXCEÇÃO (`mem_grupo_agenda_excecoes`, migration
// 20260818140000).
//
// ⚠️⚠️ POR QUE ISTO É UM SERVIÇO: nasceu dentro de `POST /api/app/grupos/:id/agenda`
// e passou a ser necessário no ERP quando o Marcos pediu (25/08) que o encontro
// passado fosse gerenciável também pelo sistema web. As duas janelas de data
// (futura e de correção do passado), a coerência com a chamada já registrada e a
// tradução dos erros de banco em resposta de negócio são regra — e duas cópias
// divergiriam no primeiro ajuste. O sintoma seria "no app deu, no web não".
//
// ⚠️ O AVISO fica com quem chama: o app avisa a coordenação em nome do líder; o
// ERP é a própria coordenação agindo, e avisar a si mesma é ruído.
//
// Devolve `{ ok, http, ... }`. Regra de negócio NUNCA vira exceção: quem chama
// decide o HTTP (mesma lei do `fn_insc_inscrever`).
// ============================================================================
const { supabase } = require('../utils/supabase');
const {
  proximasOcorrencias, ocorrenciasPassadas, janelaCorrecaoPassada,
} = require('../utils/agendaGrupo');
const { ancorasDeGrupos, iniciosDeGrupos } = require('./grupoAncora');

const D = /^\d{4}-\d{2}-\d{2}$/;

/** O dia de operação da igreja é BRT — sempre. */
function hojeBRTLocal() {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
}

async function aplicarExcecaoAgenda({
  grupoId, dataOriginal, acao, novaData = null, novoHorario = null, motivo = null,
  autor = {},
}) {
  if (!D.test(String(dataOriginal || ''))) {
    return { ok: false, http: 400, error: 'Informe a data do encontro que você quer alterar.' };
  }
  if (!['remarcar', 'cancelar', 'desfazer'].includes(acao)) {
    return { ok: false, http: 400, error: 'Ação inválida.' };
  }

  const hojeISO = hojeBRTLocal();
  // ⚠️⚠️ O PASSADO É EDITÁVEL desde 25/08/2026 (Marcos): *"a pessoa clica em um
  // encontro passado, altera data ou registra que encontro não aconteceu."* A
  // versão anterior recusava, com o argumento de que "mexer no passado não muda
  // o que aconteceu" — ele corrigiu a premissa: mexer no passado é justamente
  // REGISTRAR o que aconteceu, e em grupo quinzenal/mensal a data que a
  // recorrência supôs é ESTIMADA.
  const noPassado = dataOriginal < hojeISO;

  if (acao === 'desfazer') {
    const { error } = await supabase.from('mem_grupo_agenda_excecoes')
      .delete().eq('grupo_id', grupoId).eq('data_original', dataOriginal);
    if (error) return traduzErro(error);
    return { ok: true, http: 200, acao: 'desfeito' };
  }

  // ⚠️⚠️ A CHAMADA JÁ REGISTRADA é um FATO, e ela manda:
  //  · "não aconteceu" num dia que TEM chamada é contradição — e o efeito seria
  //    INVISÍVEL, porque a timeline dá precedência ao registrado ("o fato vence a
  //    intenção"). Quem clicasse veria nada mudar e concluiria que o app quebrou.
  //  · corrigir a DATA tem que mover a chamada junto, senão a tela racha: a
  //    ocorrência aparece vazia na data nova e a chamada vira "avulso" na antiga.
  let encontroNaData = null;
  if (noPassado) {
    const { data: enc } = await supabase.from('mem_grupo_encontros')
      .select('id').eq('grupo_id', grupoId).eq('data', dataOriginal)
      .is('deleted_at', null).limit(1).maybeSingle();
    encontroNaData = enc || null;
  }
  if (acao === 'cancelar' && encontroNaData) {
    return {
      ok: false, http: 409, codigo: 'tem_chamada',
      error: 'Esse dia já tem presença registrada, então ele aconteceu. Se a chamada foi lançada por engano, apague-a antes.',
    };
  }

  const linha = {
    grupo_id: grupoId,
    data_original: dataOriginal,
    status: acao === 'cancelar' ? 'cancelado' : 'remarcado',
    motivo: motivo ? String(motivo).trim().slice(0, 300) : null,
    decidido_por: autor.id || null,
    decidido_por_nome: autor.nome || null,
    updated_at: new Date().toISOString(),
  };

  if (acao === 'remarcar') {
    if (!D.test(String(novaData || ''))) {
      return { ok: false, http: 400, error: 'Informe a nova data.' };
    }
    // ⚠️ No PASSADO a data nova também é passada (correção de registro); no
    // FUTURO ela não pode ser passada (aí seria correção, não remarcação).
    if (!noPassado && novaData < hojeISO) {
      return { ok: false, http: 400, error: 'A nova data não pode ser no passado.' };
    }
    if (noPassado && novaData > hojeISO) {
      return {
        ok: false, http: 400,
        error: 'Para mover o encontro para frente, use a agenda dos próximos encontros.',
      };
    }
    if (novoHorario && !/^\d{2}:\d{2}$/.test(String(novoHorario))) {
      return { ok: false, http: 400, error: 'Horário inválido (use HH:MM).' };
    }

    // ⚠️⚠️ A JANELA É DECIDIDA AQUI, nunca no cliente: o payload diz QUAL
    // encontro, jamais SE pode (mesma lei da aprovação em lote e do
    // `ligar-lote`). O calendário da tela já limita, mas bundle antigo,
    // requisição na mão ou tela aberta por horas passariam direto.
    let janela = null;
    try {
      const { data: g } = await supabase.from('mem_grupos')
        .select('dia_semana, horario, recorrencia').eq('id', grupoId).maybeSingle();
      const [anc, ini] = await Promise.all([ancorasDeGrupos([grupoId]), iniciosDeGrupos([grupoId])]);
      if (noPassado) {
        // A MESMA lista que a aba de Encontros mostra — e os vizinhos saem dela,
        // então a janela reflete a cadência real do grupo.
        const passadas = ocorrenciasPassadas({
          diaSemana: g?.dia_semana, horario: g?.horario, recorrencia: g?.recorrencia,
          ancoraISO: anc[grupoId] || null,
          inicioISO: ini[grupoId] || null, desdeISO: ini[grupoId] || null,
          excecoes: [], quantas: 24,
        });
        const i = passadas.findIndex(o => o.data_original === dataOriginal);
        if (i >= 0) {
          const j = janelaCorrecaoPassada({
            dataOriginal,
            anteriorISO: passadas[i + 1]?.data || null,
            proximaISO: passadas[i - 1]?.data || null,
            hojeISO,
          });
          // Normaliza pro MESMO formato do ramo futuro, pra as recusas abaixo
          // servirem aos dois — duas cópias das mensagens divergiriam.
          if (j) janela = { pode_remarcar: j.pode, remarcar_de: j.de, remarcar_ate: j.ate };
        }
      } else {
        const lista = proximasOcorrencias({
          diaSemana: g?.dia_semana, horario: g?.horario, recorrencia: g?.recorrencia,
          ancoraISO: anc[grupoId] || null, excecoes: [], quantas: 40, janelaDias: 200,
        });
        janela = lista.find(o => o.data_original === dataOriginal) || null;
      }
    } catch (e) {
      console.warn('[grupoAgendaExcecao] janela:', e.message);
    }
    // ⚠️ Falha ao MONTAR a agenda RECUSA, nunca libera: guarda que falha aberta
    // é enfeite.
    if (!janela) {
      return {
        ok: false, http: 409, codigo: 'janela_indisponivel',
        error: 'Não consegui conferir a agenda deste grupo agora. Tente de novo em instantes.',
      };
    }
    if (!janela.pode_remarcar) {
      return {
        ok: false, http: 409, codigo: 'sem_janela',
        error: noPassado
          ? 'Este encontro está colado nos vizinhos — não sobra data para corrigir.'
          : 'Este encontro está colado no seguinte — não dá para remarcar. Se ele não vai acontecer, cancele.',
      };
    }
    if (novaData < janela.remarcar_de || novaData > janela.remarcar_ate) {
      return {
        ok: false, http: 409, codigo: 'fora_da_janela',
        error: noPassado
          ? `A data precisa ficar entre ${janela.remarcar_de} e ${janela.remarcar_ate} — senão o encontro passa por cima do anterior ou do seguinte.`
          : `A nova data precisa ficar entre ${janela.remarcar_de} e ${janela.remarcar_ate}. Para mover mais que isso, cancele este encontro.`,
        remarcar_de: janela.remarcar_de,
        remarcar_ate: janela.remarcar_ate,
      };
    }

    // ⚠️⚠️ MOVE A CHAMADA JUNTO, e ANTES da exceção. A ordem importa: se a
    // exceção fosse gravada primeiro e este UPDATE falhasse, a tela mostraria a
    // ocorrência vazia na data nova e a chamada como "avulso" na antiga — dois
    // registros do mesmo encontro. Fazendo primeiro, uma falha aqui aborta tudo
    // e NADA muda.
    // ⚠️ `mem_grupo_encontros` tem UNIQUE (grupo_id, data): mover pra um dia que
    // já tem chamada levanta 23505 — resposta de NEGÓCIO, não erro de sistema.
    if (encontroNaData) {
      const { error: eMove } = await supabase.from('mem_grupo_encontros')
        .update({ data: novaData }).eq('id', encontroNaData.id);
      if (eMove) {
        if (eMove.code === '23505') {
          return {
            ok: false, http: 409, codigo: 'data_ocupada',
            error: 'Já existe um encontro registrado nessa data. Escolha outro dia.',
          };
        }
        return traduzErro(eMove);
      }
    }
    linha.nova_data = novaData;
    linha.novo_horario = novoHorario || null;
  } else {
    linha.nova_data = null;
    linha.novo_horario = null;
  }

  // Uma exceção por ocorrência: remarcar de novo ATUALIZA (o UNIQUE garante).
  const { error } = await supabase.from('mem_grupo_agenda_excecoes')
    .upsert(linha, { onConflict: 'grupo_id,data_original' });
  if (error) return traduzErro(error);

  return {
    ok: true, http: 200, acao: linha.status, no_passado: noPassado,
    motivo: linha.motivo, nova_data: linha.nova_data, novo_horario: linha.novo_horario,
    chamada_movida: Boolean(encontroNaData && acao === 'remarcar'),
  };
}

/** Migration não aplicada não pode virar 500 genérico (lição do `parcelas_max`). */
function traduzErro(error) {
  if (/does not exist|schema cache/i.test(error.message || '')) {
    return {
      ok: false, http: 503, codigo: 'sem_tabela',
      error: 'A agenda ainda não está disponível. Avise a equipe de grupos.',
    };
  }
  throw error;
}

module.exports = { aplicarExcecaoAgenda };
