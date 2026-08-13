// Régua do "culto de AGORA" do totem Kids, extraída de TotemKidsCheckin.tsx
// pra ser PURA e testável no gate ('agora' injetável — teste que lê o relógio
// da máquina foi o que mordeu no faixaEtaria.test.ts).
//
// Check-in nos minutos ANTES de um culto já conta pra ele (Marcos 2026-07-19):
// abre 30 min antes (60 no ÚLTIMO do dia · filho de voluntário chega cedo) e
// fecha quando o culto acaba (~60 min) ou quando o próximo abre. Fora de
// qualquer janela NÃO há culto de agora → sem sessão.
//
// ⚠️ Grade nova de domingo (corte 24/08/2026 · docs/cultos-domingo/): com
// 09:30 + 11:30 as janelas deixariam um BURACO 10:30–11:00 (o 09:30 fecha às
// 10:30 · a antecedência do 11:30 só abre às 11:00) — check-in nesse intervalo
// ficaria SEM culto de agora. Regra do buraco zero: entre cultos do MESMO
// período (manhã/tarde/noite), a antecedência do PRÓXIMO estica até onde a
// janela do anterior fechou. NUNCA o contrário — esticar o fim do anterior
// mandaria a criança das 10:45 pro culto que JÁ ACABOU. Entre períodos
// diferentes o vazio é intencional (12:30–18:00 segue sem culto). Com a grade
// ATUAL (08:30/10:00/11:30/19:00) as janelas já são contíguas → comportamento
// IDÊNTICO até o corte.

export function horaMin(h: string): number {
  const [hh, mm] = String(h || '').split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

// Chave de período pra agrupar cultos (manhã <12h · tarde <18h · noite).
export function periodoKey(hora?: string): 'manha' | 'tarde' | 'noite' {
  const h = Number(String(hora || '').slice(0, 2)) || 0;
  return h < 12 ? 'manha' : h < 18 ? 'tarde' : 'noite';
}

// Minutos desde a meia-noite AGORA, no fuso da igreja (BRT).
export function agoraMinBRT(): number {
  const s = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit',
  });
  return horaMin(s);
}

export function escolherCultoPorRelogio(
  cultos: any[],
  agoraMin: number = agoraMinBRT(),
): { atual: any | null; visiveis: any[] } {
  const lista = (cultos || []).filter((c) => c.hora).sort((a, b) => horaMin(a.hora) - horaMin(b.hora));
  if (!lista.length) return { atual: null, visiveis: [] };
  const ultimoI = lista.length - 1;
  const comFim = lista.map((c, i) => {
    const ini = horaMin(c.hora), ult = i === ultimoI;
    return { ...c, _abre: ini - (ult ? 60 : 30), _fim: ini + (ult ? 180 : 60) };
  });
  // a janela fecha, no máximo, quando o PRÓXIMO culto abre (sem sobreposição)
  for (let i = 0; i < ultimoI; i++) comFim[i]._fim = Math.min(comFim[i]._fim, comFim[i + 1]._abre);
  // buraco ZERO entre cultos do MESMO período (ver cabeçalho): a antecedência
  // do próximo estica até o fim da janela do anterior — nunca o inverso.
  for (let i = 0; i < ultimoI; i++) {
    if (periodoKey(comFim[i].hora) === periodoKey(comFim[i + 1].hora)) {
      comFim[i + 1]._abre = Math.min(comFim[i + 1]._abre, comFim[i]._fim);
    }
  }
  const agora = agoraMin;
  const visiveis = comFim.filter((c) => agora < c._fim); // esconde os que já acabaram
  let atual = visiveis.find((c) => agora >= c._abre && agora < c._fim) || null;
  if (!atual && comFim.length && agora < comFim[0]._abre) atual = comFim[0]; // antes de tudo → 1º culto (early birds)
  return { atual, visiveis };
}
