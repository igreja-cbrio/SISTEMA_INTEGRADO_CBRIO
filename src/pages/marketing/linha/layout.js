// Geometria e régua de exibição da Linha do tempo. Pura (sem React): recebe a
// resposta do GET /marketing/linha e devolve onde cada coisa fica no canvas.
// Altura dos cartões é FIXA por fórmula, não medida no DOM: o quadro se monta
// numa passada só e não pula depois de renderizar.

export const FRENTES = [
  { key: 'ins', nome: 'Institucionais', desc: 'Séries com ciclo criativo · CBRio, AMI e Kids' },
  { key: 'sis', nome: 'Sistema', desc: 'Solicitações feitas pelo formulário' },
  { key: 'int', nome: 'Interno', desc: 'Demandas do líder para a equipe' },
  { key: 'rot', nome: 'Rotina', desc: 'O que cada pessoa faz na semana' },
  // Só o líder: pedidos do formulário esperando ele alocar. Fica por ÚLTIMO de
  // propósito: quem não é líder não a vê, e as outras frentes não mudam de lugar.
  { key: 'pen', nome: 'Pendentes', desc: 'Pedidos esperando você alocar', soLider: true },
];
export const frenteVisivel = (f, dados) => !f.soLider || !!dados?.perfil?.lider;
export const NOME_FRENTE = Object.fromEntries(FRENTES.map(f => [f.key, f.nome]));
export const CULTOS = { cbrio: 'CBRio', ami: 'AMI', kids: 'Kids' };
export const rotuloCulto = (c) => CULTOS[c] || 'Sem culto';

export const G = {
  BX: 40, BW: 240, BH: 128, BGAP: 28, TOPY: 250,
  HY: 150, COLW: 256, SPX: 22, NX: 44, NW: 200,
  SBW: 224, SBH: 118,
  CARD_H: 112, ETAPA_TOPO: 62, FAIXA_H: 30, GAP: 18, GG: 56,
};
G.SBX = G.BX + G.BW + 70;
G.NOTE_Y = G.TOPY + FRENTES.length * (G.BH + G.BGAP) + 6;

export const laneY = (i) => G.TOPY + i * (G.BH + G.BGAP) + G.BH / 2;
export const x0Para = (aberta) => (aberta === 'ins' ? G.SBX + G.SBW + 80 : G.BX + G.BW + 100);

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const ddmm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
export const ddmmaaaa = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const mesDe = (s) => (s ? MESES[Number(s.slice(5, 7)) - 1] : '');

export const alturaEtapa = (etapa) => G.ETAPA_TOPO + etapa.faixas.length * G.FAIXA_H;

// Unidades posicionáveis por frente: etapa (Institucionais) ou tarefa (demais).
function unidades(data, key) {
  const f = data.frentes?.[key];
  if (!f) return [];
  if (key === 'ins') {
    return (f.series || []).flatMap((s, si) => (s.etapas || []).map((e, ei) => ({
      tipo: 'etapa', frente: 'ins', si, key: `ins-${si}-${e.event_phase_id ?? ei}`,
      semana: e.semana, aberta: (e.faixas || []).some(t => t.aberta), serie: s, etapa: e,
    })));
  }
  return (f.tarefas || []).map(t => ({ tipo: 'tarefa', frente: key, key: `${key}-${t.id}`, semana: t.semana, aberta: t.aberta, tarefa: t }));
}

// Cor da série: vermelha se algo aberto até a semana atual.
export function statusSerie(serie, semanaAtual) {
  const faixas = (serie.etapas || []).flatMap(e => e.faixas || []);
  const abertas = faixas.filter(t => t.aberta && t.semana != null);
  const pend = abertas.filter(t => t.semana <= semanaAtual);
  const cultosAtrasados = new Set(abertas.filter(t => t.semana < semanaAtual).map(t => t.culto));
  const cultos = [...new Set(faixas.map(t => t.culto))];
  return { pendentes: pend.length, atrasadas: abertas.filter(t => t.semana < semanaAtual).length, cultos, cultosAtrasados };
}

export function montarLayout(data, aberta, esconderConcluidas) {
  const semanaAtual = data.semana_atual;
  const semanas = data.semanas || [];
  const todas = FRENTES.flatMap(f => unidades(data, f.key)).filter(u => u.aberta && u.semana != null);
  const escopo = aberta ? todas.filter(u => u.frente === aberta) : todas;
  const frentesEscopo = aberta ? [aberta] : FRENTES.map(f => f.key);

  // 1ª coluna = a semana mais antiga com pendência (de qualquer frente, pra não
  // pular ao abrir um quadrado); sem pendência, a semana atual.
  const atrasadasTodas = FRENTES.flatMap(f => data.frentes?.[f.key]?.semanas_atrasadas || []);
  let inicio;
  if (atrasadasTodas.length) inicio = Math.min(...atrasadasTodas);
  else inicio = semanaAtual >= 1 && semanaAtual <= semanas.length ? semanaAtual : 1;

  const atrasadasEscopo = new Set(frentesEscopo.flatMap(k => data.frentes?.[k]?.semanas_atrasadas || []));
  const comAberto = new Set(escopo.map(u => u.semana));

  let cols = [];
  if (inicio === 0) cols.push({ n: 0, inicio: null, fim: null, antes: true });
  cols.push(...semanas.filter(w => w.n >= Math.max(1, inicio)));
  if (esconderConcluidas) cols = cols.filter(w => w.n >= semanaAtual || comAberto.has(w.n));
  if (!cols.length && semanas.length) cols = [semanas[semanas.length - 1]];

  const X0 = x0Para(aberta);
  const colX = (i) => X0 + i * G.COLW;
  const colunas = cols.map((w, i) => ({
    ...w, i, x: colX(i),
    atual: w.n === semanaAtual,
    atrasada: atrasadasEscopo.has(w.n),
    futura: w.n > semanaAtual,
  }));
  // Semana sem coluna (escondida ou antes do início): cai na próxima que existe.
  const idxDe = (n) => {
    const i = colunas.findIndex(c => c.n >= n);
    return i < 0 ? colunas.length - 1 : i;
  };

  const CW = colX(colunas.length) + 160;
  let CH = G.NOTE_Y + 200;
  const nos = [];
  const grupos = [];
  let li = -1;

  if (aberta) {
    li = FRENTES.findIndex(f => f.key === aberta);
    const yLane = laneY(li);
    const lista = [];
    if (aberta === 'ins') {
      (data.frentes?.ins?.series || []).forEach((s, si) => {
        const us = escopo.filter(u => u.si === si);
        if (us.length) lista.push({ serie: s, us });
      });
    } else {
      lista.push({ serie: null, us: escopo });
    }

    const altura = (u) => (u.tipo === 'etapa' ? alturaEtapa(u.etapa) : G.CARD_H);
    const pilhas = lista.map(g => {
      const porCol = {};
      for (const u of g.us) (porCol[idxDe(u.semana)] ||= []).push(u);
      const altCol = Object.values(porCol).map(us => us.reduce((a, u) => a + altura(u), 0) + G.GAP * (us.length - 1));
      return { porCol, banda: Math.max(0, ...altCol, g.serie ? G.SBH : 60) };
    });
    const total = pilhas.reduce((a, p) => a + p.banda, 0) + G.GG * Math.max(0, pilhas.length - 1);
    let topo = Math.max(G.HY + 100, yLane - total / 2);

    lista.forEach((g, gi) => {
      const { porCol, banda } = pilhas[gi];
      const yc = g.serie ? topo + banda / 2 : yLane;
      const grupo = { gi, serie: g.serie, yc, x0: g.serie ? G.SBX + G.SBW : G.BX + G.BW, colsComNo: new Set() };
      if (g.serie) grupo.blocoY = yc - G.SBH / 2;
      for (const [ci, us] of Object.entries(porCol)) {
        const h = us.reduce((a, u) => a + altura(u), 0) + G.GAP * (us.length - 1);
        let y = Math.max(G.HY + 100, yc - h / 2);
        for (const u of us) {
          const c = colunas[+ci];
          nos.push({ ...u, gi, ci: +ci, x: c.x + G.NX, y, h: altura(u), fut: c.futura });
          grupo.colsComNo.add(+ci);
          y += altura(u) + G.GAP;
          CH = Math.max(CH, y + 120);
        }
      }
      grupos.push(grupo);
      topo += banda + G.GG;
      CH = Math.max(CH, topo + 80);
    });
  }

  return { colunas, CW, CH, nos, grupos, li, X0, semanaAtual, vazioIns: aberta === 'ins' && !(data.frentes?.ins?.series || []).length };
}

// Caminho ortogonal com cantos arredondados (espinha até o bloco da série).
export function orth(sx, sy, tx, ty, mx, r = 10) {
  if (Math.abs(ty - sy) < 2) return `M${sx},${sy} L${tx},${ty}`;
  const d = ty > sy ? 1 : -1;
  return `M${sx},${sy} L${mx - r},${sy} Q${mx},${sy} ${mx},${sy + d * r} L${mx},${ty - d * r} Q${mx},${ty} ${mx + r},${ty} L${tx},${ty}`;
}

export function ramo(sx, yc, tx, ty, r = 9) {
  if (Math.abs(ty - yc) < 2) return `M${sx},${yc} L${tx},${ty}`;
  const dir = ty > yc ? 1 : -1;
  return `M${sx},${yc} L${sx},${ty - dir * r} Q${sx},${ty} ${sx + r},${ty} L${tx},${ty}`;
}

export function nomeMembro(membros, id) {
  if (!id) return null;
  const m = (membros || []).find(x => x.id === id);
  return m ? (m.nome || 'Sem nome') : 'Sem nome';
}

export function textoEsforco(valor, unidade) {
  const v = Number(valor);
  if (!v) return '';
  const n = (Math.round(v * 10) / 10).toString().replace('.', ',');
  if (unidade === 'dias') return `${n} ${v === 1 ? 'dia' : 'dias'}`;
  return `${n}h`;
}
