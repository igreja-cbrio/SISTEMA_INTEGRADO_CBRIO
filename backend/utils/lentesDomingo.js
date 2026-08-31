// Lentes dos cultos de DOMINGO (docs/cultos-domingo/ · Lotes 3-4 · corte
// 24/08/2026). Régua PURA (testada no gate · src/test/lentesDomingo.test.ts):
// recebe os tipos de culto de domingo + as linhas semanais da view e monta as
// TRÊS lentes aprovadas + a série de ocupação sobre lugares OFERECIDOS.
//
//   · separada     (default) — dado cru por tipo: o 09:30 nasce série nova, o
//                   10:00 encerra. Nenhuma chave necessária.
//   · continuidade (Matheus) — tipos com a MESMA linhagem_key são UMA série
//                   através do tempo ("o 10:00 virou 09:30").
//   · consolidacao (Pr. Juninho) — tipos com a MESMA consolidacao_key são
//                   SOMADOS POR SEMANA antes de qualquer média (08:30 + 10:00
//                   no passado × o 09:30 novo). ⚠️ A pegadinha que a lente
//                   existe pra evitar: tirar média POR CULTO e depois somar
//                   distorce — a soma é POR SEMANA, sempre.
//
// Ocupação OFERECIDA (ideia do Marcos, aprovada 11/08): freq_adulto do domingo
// ÷ (capacidade × nº de cultos VIGENTES naquele domingo). Vigência vem de
// vigente_de/vigente_ate + is_active — é o que faz o denominador cair de
// 4×1050 pra 3×1050 no corte, sem mexer em número histórico.
//
// 'hoje' é INJETADO (teste que lê o relógio da máquina foi o que mordeu no
// faixaEtaria.test.ts). Datas em ISO (YYYY-MM-DD), aritmética em UTC ao
// meio-dia (meia-noite UTC vira véspera no fuso do Rio).

const { isoWeekOf } = require('./isoWeek');

const CORTE_DOMINGO_0930 = '2026-08-24';

// O tipo vale neste dia? (janela de vigência + is_active · NULL = aberto)
function tipoVigenteEm(tipo, diaISO) {
  if (!tipo) return false;
  if (tipo.is_active === false) return false;
  if (tipo.vigente_de && diaISO < String(tipo.vigente_de).slice(0, 10)) return false;
  if (tipo.vigente_ate && diaISO > String(tipo.vigente_ate).slice(0, 10)) return false;
  return true;
}

// Chave da série de um tipo numa lente. Sem chave própria, o tipo é a própria
// série (vale pras 3 lentes — 11:30/19:00 aparecem iguais em todas).
// TURNO do culto de domingo, pelo HORÁRIO. Manhã até 12h, noite a partir dela.
//
// ⚠️⚠️ Esta é a lente IMUNE ao corte de 24/08: o 08:30 e o 10:00 encerraram e o
// 09:30 nasceu, mas os três são MANHÃ — então a série do turno atravessa a
// mudança de formato sem degrau artificial, ao contrário da visão por culto
// (onde a média por culto sobe ~33% só porque o denominador caiu).
//
// ⚠️ Sem horário devolve null, nunca "manhã": chutar o turno de um tipo de
// culto sem hora colocaria a frequência dele na série errada, e ninguém
// perceberia. Quem não tem turno é DECLARADO na saída.
function turnoDoTipo(tipo) {
  const h = String((tipo && tipo.recurrence_time) || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(h)) return null;
  return h < '12:00' ? 'manha' : 'noite';
}

const ROTULO_TURNO = { manha: 'Domingo manhã', noite: 'Domingo noite' };

function chaveDaSerie(tipo, lente) {
  if (lente === 'turno') {
    const t = turnoDoTipo(tipo);
    return t ? `turno:${t}` : 'turno:sem_horario';
  }
  if (lente === 'continuidade' && tipo.linhagem_key) return `linh:${tipo.linhagem_key}`;
  if (lente === 'consolidacao' && tipo.consolidacao_key) return `cons:${tipo.consolidacao_key}`;
  return `tipo:${tipo.id}`;
}

function _fmtDDMM(iso) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }
function _mais7(d) { return new Date(d.getTime() + 7 * 86400000); }

// Eixo de DOMINGOS: os últimos nSemanas domingos completos + extensão até o
// 1º domingo do formato novo (>= corte), pra linha do corte aparecer na prévia
// mesmo antes de 24/08 (semanas futuras entram VAZIAS — a linha só marca).
function eixoDomingos({ hoje, corte = CORTE_DOMINGO_0930, nSemanas = 16 }) {
  const hd = new Date(`${hoje}T12:00:00Z`);
  const ultimo = new Date(hd);
  ultimo.setUTCDate(hd.getUTCDate() - hd.getUTCDay()); // domingo <= hoje (domingo conta ele mesmo)
  const cd = new Date(`${corte}T12:00:00Z`);
  const domingoNovo = new Date(cd);
  domingoNovo.setUTCDate(cd.getUTCDate() + ((7 - cd.getUTCDay()) % 7)); // 1º domingo >= corte
  const eixo = [];
  for (let i = nSemanas - 1; i >= 0; i--) {
    const d = new Date(ultimo);
    d.setUTCDate(ultimo.getUTCDate() - i * 7);
    eixo.push(d);
  }
  for (let d = _mais7(ultimo); d <= domingoNovo; d = _mais7(d)) eixo.push(d);
  return eixo.map((d) => {
    const { ano, semana } = isoWeekOf(d);
    const iso = d.toISOString().slice(0, 10);
    return { ano_iso: ano, semana_iso: semana, domingo: iso, label: _fmtDDMM(iso) };
  });
}

// tipos:  [{id, name, recurrence_time, color, is_active, vigente_de, vigente_ate,
//           linhagem_key, consolidacao_key}]  (só domingos · recurrence_day=0)
// linhas: [{ano_iso, semana_iso, service_type_id, valor}]  (da vw_dashboard_semanal)
function montarLentes({ tipos, linhas, capacidadeUnitaria, hoje, nSemanas = 16, corte = CORTE_DOMINGO_0930 }) {
  const eixo = eixoDomingos({ hoje, corte, nSemanas });

  // valor por (semana, tipo)
  const porSemanaTipo = new Map();
  for (const r of linhas || []) {
    const k = `${r.ano_iso}-${r.semana_iso}|${r.service_type_id}`;
    porSemanaTipo.set(k, (porSemanaTipo.get(k) || 0) + (Number(r.valor) || 0));
  }
  const valorDe = (s, tipoId) => porSemanaTipo.get(`${s.ano_iso}-${s.semana_iso}|${tipoId}`);

  const hora = (t) => String(t.recurrence_time || '').slice(0, 5);
  const tiposOrdenados = [...(tipos || [])].sort((a, b) => hora(a).localeCompare(hora(b)));

  const lentes = {};
  for (const lente of ['separada', 'continuidade', 'consolidacao', 'turno']) {
    const grupos = new Map();
    for (const t of tiposOrdenados) {
      const c = chaveDaSerie(t, lente);
      if (!grupos.has(c)) grupos.set(c, []);
      grupos.get(c).push(t);
    }

    const series = [...grupos.entries()].map(([key, membros]) => {
      let label;
      if (lente === 'turno') {
        // ⚠️ O rótulo é o TURNO, nunca a lista de cultos: a série existe pra
        // atravessar o corte, e "09:30 + 11:30" mudaria de nome no dia em que
        // a grade mudar de novo.
        const t = key.slice('turno:'.length);
        label = ROTULO_TURNO[t] || 'Domingo · sem horário definido';
      } else if (membros.length === 1) label = membros[0].name;
      else if (lente === 'continuidade') {
        // ordem de vigência: quem começou antes vem primeiro ("10:00 → 09:30")
        const ordenados = [...membros].sort((a, b) =>
          String(a.vigente_de || '0000').localeCompare(String(b.vigente_de || '0000')));
        label = ordenados.map((t) => t.name).join(' → ');
      } else {
        label = membros.map((t) => t.name).join(' + ');
      }
      // 'sem horário' vai pro FIM (string vazia ordenaria antes de 08:30).
      const h = lente === 'turno' && key === 'turno:sem_horario' ? '99:99' : hora(membros[0]);
      return { key, label, hora: h, cor: membros[0].color || null };
    }).sort((a, b) => a.hora.localeCompare(b.hora));

    // pontos: soma POR SEMANA dos membros do grupo (é a regra da consolidação;
    // nas outras lentes o grupo tem 1 membro vivo por semana e a soma é neutra)
    const pontos = eixo.map((s) => {
      const valores = {};
      for (const [key, membros] of grupos) {
        let soma = 0, tem = false;
        for (const t of membros) {
          const v = valorDe(s, t.id);
          if (v != null && v > 0) { soma += v; tem = true; }
        }
        if (tem) valores[key] = soma; // semana sem dado fica FORA (nada de zero falso)
      }
      return { ...s, valores };
    });

    // média por série = média das SOMAS SEMANAIS com dado (nunca média por culto)
    const medias = {};
    for (const [key] of grupos) {
      const vals = pontos.map((p) => p.valores[key]).filter((v) => v != null);
      medias[key] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    }

    lentes[lente] = { series, pontos, medias };
  }

  // ocupação OFERECIDA por semana: freq total do domingo ÷ (cap × vigentes)
  const ocupacao = eixo.map((s) => {
    let freq = 0, tem = false;
    for (const t of tiposOrdenados) {
      const v = valorDe(s, t.id);
      if (v != null && v > 0) { freq += v; tem = true; }
    }
    const vigentes = tiposOrdenados.filter((t) => tipoVigenteEm(t, s.domingo)).length;
    const capacidade = vigentes * (Number(capacidadeUnitaria) || 0);
    return {
      ...s,
      freq_total: tem ? freq : null,
      cultos_vigentes: vigentes,
      capacidade_total: capacidade,
      taxa: tem && capacidade > 0 ? Math.round((freq / capacidade) * 1000) / 10 : null,
    };
  });

  const domingoNovo = eixo.find((s) => s.domingo >= corte) || null;
  return {
    eixo,
    lentes,
    ocupacao,
    corte: { data: corte, domingo: domingoNovo?.domingo || null, label: domingoNovo?.label || null },
  };
}

module.exports = { CORTE_DOMINGO_0930, tipoVigenteEm, chaveDaSerie, turnoDoTipo, ROTULO_TURNO, eixoDomingos, montarLentes };
