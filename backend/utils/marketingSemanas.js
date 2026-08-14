// ============================================================================
// Régua PURA do calendário semanal do ciclo criativo (dashboard do Marketing).
//
// Responde: "na semana X, em que FASE do ciclo cada evento/série está?"
//
// Mora em utils/ (sem Supabase, sem rede, sem relógio implícito) pra entrar no
// gate de deploy · contrato em src/test/marketingSemanas.test.ts.
//
// ⚠️ Toda conta é feita em STRING 'YYYY-MM-DD' com aritmética em UTC. As datas
// de fase (`event_cycle_phases.data_inicio_prevista/_fim_prevista`) são colunas
// DATE, então comparar string é exato. Usar `new Date('2026-08-14')` e ler
// getDate() cairia no fuso local — o bug que já mordeu o censo, o totem Kids e
// o "culto de agora".
//
// ⚠️ A semana é SEG→DOM (a mesma da frequência de cultos · ver CLAUDE.md).
//    NÃO é a semana financeira (quarta→terça).
// ============================================================================

const MS_DIA = 86400000;

// 'YYYY-MM-DD' → número de dias desde a época (UTC · sem fuso local).
function paraDia(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.parse(s + 'T00:00:00Z');
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / MS_DIA);
}

// número de dias → 'YYYY-MM-DD'
function paraStr(dia) {
  return new Date(dia * MS_DIA).toISOString().slice(0, 10);
}

// O "hoje" da igreja. `agoraMs` é INJETADO — teste que lê o relógio da máquina
// é o que mordeu no faixaEtaria.test.ts.
function hojeBRT(agoraMs) {
  const ms = typeof agoraMs === 'number' ? agoraMs : Date.now();
  return new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Segunda-feira da semana que contém `diaStr`.
function segundaDa(diaStr) {
  const d = paraDia(diaStr);
  if (d === null) return null;
  // 1970-01-01 (dia 0) foi uma QUINTA. (d + 3) % 7 dá 0 na segunda.
  const desdeSegunda = ((d + 3) % 7 + 7) % 7;
  return d - desdeSegunda;
}

// Janela de semanas SEG→DOM. `retro` semanas antes da atual + `adiante` depois.
//
// ⚠️ `retro`/`adiante` são SANEADOS aqui também (defesa em profundidade): um NaN
// vindo do chamador fazia o laço nem começar e a janela voltava VAZIA — o
// calendário inteiro desaparecia sem erro nenhum. Com data válida esta função
// NUNCA devolve lista vazia.
function montarSemanas(hojeStr, { retro = 1, adiante = 6 } = {}) {
  const seg = segundaDa(hojeStr);
  if (seg === null) return [];
  const r = Number.isFinite(retro) ? Math.max(Math.trunc(retro), 0) : 1;
  const a = Number.isFinite(adiante) ? Math.max(Math.trunc(adiante), 0) : 6;
  const out = [];
  for (let i = -r; i <= a; i++) {
    const ini = seg + i * 7;
    out.push({
      idx: out.length,
      ini: paraStr(ini),
      fim: paraStr(ini + 6),
      eh_atual: i === 0,
      offset: i,
    });
  }
  return out;
}

// ── Grade MENSAL (o calendário do /eventos) ─────────────────────────────────
//
// O dashboard mostra o ciclo num calendário de mês com setas, igual ao
// `BigCalendar` do /eventos (pedido do Pedro · 14/08). Cada LINHA da grade é
// uma semana, e é nessa linha que as fases vigentes aparecem.
//
// ⚠️⚠️ `primeiroDiaSemana` existe porque a grade do /eventos começa no DOMINGO
// (0), enquanto a semana da igreja para frequência é SEG→DOM. Aqui manda a
// GRADE: as fases de cada linha são calculadas para o intervalo que a linha
// realmente exibe. Se a faixa usasse SEG→DOM sobre uma linha DOM→SÁB, ela
// afirmaria fase para dias que não estão ali em cima — que é pior que a
// divergência de convenção.
//
// ⚠️ A primeira e a última linha invadem o mês vizinho, como em qualquer
// calendário. Fase ativa nesses dias APARECE (a linha contém aqueles dias) e o
// dia vem marcado com `no_mes: false` pra tela pintar em cinza.
function inicioDaSemanaGrade(diaStr, primeiroDiaSemana = 0) {
  const d = paraDia(diaStr);
  if (d === null) return null;
  // 1970-01-01 (dia 0) foi QUINTA → (d + 4) % 7 dá 0 no domingo.
  const dow = ((d + 4) % 7 + 7) % 7;                  // 0=dom … 6=sáb
  const desde = ((dow - primeiroDiaSemana) % 7 + 7) % 7;
  return d - desde;
}

// `mes` = 'YYYY-MM'. Devolve as linhas da grade, cada uma com os 7 dias.
function semanasDoMesGrade(mes, { primeiroDiaSemana = 0, hoje = null } = {}) {
  if (typeof mes !== 'string' || !/^\d{4}-\d{2}$/.test(mes)) return [];
  const primeiroDoMes = `${mes}-01`;
  if (paraDia(primeiroDoMes) === null) return [];

  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  if (m < 1 || m > 12) return [];
  // Último dia: dia 0 do mês seguinte, em UTC (nunca em fuso local).
  const ultimoDoMes = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);

  const ini = inicioDaSemanaGrade(primeiroDoMes, primeiroDiaSemana);
  const fim = inicioDaSemanaGrade(ultimoDoMes, primeiroDiaSemana);
  const out = [];
  for (let s = ini; s <= fim; s += 7) {
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const data = paraStr(s + i);
      dias.push({
        data,
        no_mes: data.slice(0, 7) === mes,
        eh_hoje: !!hoje && data === hoje,
      });
    }
    out.push({
      idx: out.length,
      ini: paraStr(s),
      fim: paraStr(s + 6),
      dias,
      eh_semana_atual: dias.some(d => d.eh_hoje),
    });
  }
  return out;
}

// Mês anterior/seguinte de 'YYYY-MM' (sem `new Date` de string solta).
function mesVizinho(mes, passo) {
  if (typeof mes !== 'string' || !/^\d{4}-\d{2}$/.test(mes)) return null;
  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7)) - 1 + passo;
  const d = new Date(Date.UTC(ano, m, 1));
  return d.toISOString().slice(0, 7);
}

// Dias de sobreposição (inclusivo) entre dois intervalos de data.
// ⚠️ As fases COMPARTILHAM o dia de fronteira no banco (a fase 2 termina no
// mesmo dia em que a 3 começa), então a soma das sobreposições de uma semana
// pode passar de 7. Isso é da natureza do dado e não afeta a comparação, que é
// relativa entre as fases da MESMA semana.
function diasSobrepostos(aIni, aFim, bIni, bFim) {
  const ai = paraDia(aIni), af = paraDia(aFim), bi = paraDia(bIni), bf = paraDia(bFim);
  if (ai === null || af === null || bi === null || bf === null) return 0;
  if (af < ai || bf < bi) return 0;
  const i = Math.max(ai, bi);
  const f = Math.min(af, bf);
  if (i > f) return 0;
  return f - i + 1;
}

// A fase de um evento numa semana: a que OCUPA MAIS DIAS dela.
//
// ⚠️ Empate → vence a fase de número MAIOR (a mais adiantada). Um calendário
// serve pra planejar o que vem, e na metade final da semana é a fase seguinte
// que está valendo.
//
// Devolve também `transicao`: a próxima fase que já começa dentro da mesma
// semana. Sem ela, a semana em que o ciclo VIRA de fase pareceria uma semana
// comum — e é justamente a que a equipe precisa ver.
function faseDaSemana(fases, semana) {
  const candidatas = [];
  for (const f of fases || []) {
    const dias = diasSobrepostos(f.data_inicio_prevista, f.data_fim_prevista, semana.ini, semana.fim);
    if (dias > 0) candidatas.push({ fase: f, dias });
  }
  if (!candidatas.length) return null;

  candidatas.sort((a, b) => (b.dias - a.dias) || (numeroDaFase(b.fase) - numeroDaFase(a.fase)));
  const escolhida = candidatas[0];

  const transicao = candidatas
    .slice(1)
    .filter(c => numeroDaFase(c.fase) > numeroDaFase(escolhida.fase))
    .sort((a, b) => numeroDaFase(a.fase) - numeroDaFase(b.fase))[0] || null;

  return {
    fase: escolhida.fase,
    dias: escolhida.dias,
    transicao: transicao ? { fase: transicao.fase, dias: transicao.dias } : null,
    concorrentes: candidatas.length,
  };
}

function numeroDaFase(f) {
  const n = Number(f?.numero_fase);
  return Number.isFinite(n) ? n : -1;
}

// Monta a grade do calendário: uma linha por evento, uma célula por semana.
//
// `fasesPorEvento` = { [event_id]: [fase, ...] }
// `eventos`        = [{ id, nome, ... }] — a ORDEM de entrada é preservada
//
// ⚠️ Evento sem NENHUMA fase na janela visível fica FORA da grade (não vira
// linha vazia): hoje há 7 ciclos ativos e 3 deles só começam em setembro.
// Ocupar linha com sete "—" faria a tela parecer cheia de nada.
//
// ⚠️ Fase sem data NÃO é posicionável e é CONTADA em `sem_data`, não descartada
// em silêncio — número que desaparece é o que ninguém investiga.
function montarCalendario({ eventos = [], fasesPorEvento = {}, semanas = [] } = {}) {
  const linhas = [];
  let semData = 0;

  for (const ev of eventos) {
    const todas = fasesPorEvento[ev.id] || [];
    const posicionaveis = [];
    for (const f of todas) {
      if (paraDia(f.data_inicio_prevista) === null || paraDia(f.data_fim_prevista) === null) semData++;
      else posicionaveis.push(f);
    }

    const celulas = semanas.map(s => {
      const r = faseDaSemana(posicionaveis, s);
      if (!r) return { semana_idx: s.idx, vazio: true };
      return {
        semana_idx: s.idx,
        vazio: false,
        fase_id: r.fase.id,
        numero_fase: r.fase.numero_fase,
        nome_fase: r.fase.nome_fase,
        area: r.fase.area || null,
        status: r.fase.status || null,
        dias_na_semana: r.dias,
        transicao: r.transicao
          ? { fase_id: r.transicao.fase.id, numero_fase: r.transicao.fase.numero_fase, nome_fase: r.transicao.fase.nome_fase }
          : null,
      };
    });

    if (celulas.every(c => c.vazio)) continue;
    linhas.push({ ...ev, celulas });
  }

  return { linhas, sem_data: semData };
}

module.exports = {
  paraDia, paraStr, hojeBRT, segundaDa, montarSemanas,
  inicioDaSemanaGrade, semanasDoMesGrade, mesVizinho,
  diasSobrepostos, faseDaSemana, montarCalendario,
};
