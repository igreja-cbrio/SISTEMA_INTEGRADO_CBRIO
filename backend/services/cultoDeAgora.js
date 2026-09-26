// O culto que a pessoa está VIVENDO agora · régua ÚNICA.
//
// Extraída de routes/app.js em 2026-09-01, quando o totem de novos convertidos
// virou o segundo consumidor (o primeiro é o Modo Culto do app). Duas cópias
// desta régua divergiriam exatamente no caso que ela existe pra acertar — a
// atribuição de culto da decisão de fé, que alimenta a NSM.
//
// ⚠️ O histórico do desenho (achado de 04/08/2026) segue valendo:
//  1. O dia é BRT, nunca `toISOString()` — das 21h BRT em diante o "hoje" UTC
//     já é AMANHÃ, e no culto de domingo 19h o culto viria nulo.
//  2. Entre os cultos que JÁ COMEÇARAM e estão na janela de 3h vale o MAIS
//     RECENTE (às 10:30 é o das 10:00, não o das 08:30); só quando nada
//     começou é que a antecedência de 30 min conta.
//
// `ao_vivo` = existe culto cuja janela [hora − 30min, hora + 3h] contém o
// agora. Sem janela ativa devolve o PRÓXIMO de hoje (ou o último, se todos já
// passaram) com `ao_vivo: false` — quem decide se isso serve é o chamador.

// Dia em BRT (offset fixo −3h · o Brasil não muda o relógio desde 2019).
function hojeBRT(agora = Date.now()) { return new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10); }

/** Minutos desde a meia-noite em BRT (mesma convenção do hojeBRT). */
function agoraMinutosBRT(agora = Date.now()) {
  const d = new Date(agora - 3 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function minutosDaHora(hora) {
  const [hh, mm] = String(hora || '').split(':');
  const h = Number(hh), m = Number(mm || 0);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
}

async function cultoDeAgora({ supabase: cliente, campusId = null, agora: instante = Date.now() } = {}) {
  const supabase = cliente || require('../utils/supabase').supabase;
  if (campusId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campusId)) {
    throw new Error('Campus inválido para consultar o culto.');
  }
  const hoje = hojeBRT(instante);
  const lista = [];
  for (let inicio = 0; ; inicio += 1000) {
    let query = supabase.from('cultos').select('id, nome, data, hora')
      .eq('data', hoje).is('deleted_at', null)
      .order('hora', { ascending: true }).order('id').range(inicio, inicio + 999);
    if (campusId) query = query.eq('igreja_id', campusId);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error('Não foi possível carregar os cultos.');
    lista.push(...data.map(c => ({ id: c.id, nome: c.nome, data: c.data, hora: c.hora })));
    if (data.length < 1000) break;
  }
  if (!lista.length) return { culto: null, ao_vivo: false };

  const agora = agoraMinutosBRT(instante);

  const iniciados = lista.filter((c) => {
    const ini = minutosDaHora(c.hora);
    return ini != null && agora >= ini && agora <= ini + 180;
  });
  if (iniciados.length) return { culto: iniciados[iniciados.length - 1], ao_vivo: true };

  const chegando = lista.find((c) => {
    const ini = minutosDaHora(c.hora);
    return ini != null && agora >= ini - 30 && agora < ini;
  });
  if (chegando) return { culto: chegando, ao_vivo: true };

  const proximo = lista.find((c) => {
    const ini = minutosDaHora(c.hora);
    return ini != null && ini > agora;
  });
  return { culto: proximo || lista[lista.length - 1], ao_vivo: false };
}

module.exports = { cultoDeAgora };
