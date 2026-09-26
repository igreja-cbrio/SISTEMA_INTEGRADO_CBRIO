'use strict';
// Régua PURA da Linha do tempo do Marketing (Fase 3 · 2026-09-25).
// Sem supabase de propósito: entra no gate. Quem lê o banco é routes/marketingLinha.js.
//
// Semana = domingo a sábado, dentro do ano: a semana 1 vai de 01/01 até o
// primeiro sábado (pode ter 1 dia), a última termina em 31/12. Até 54 semanas.
// Pendência só existe até a semana ATUAL; depois disso é "previsto".
// Quem vê o quê: docs/modulo-marketing/linha-do-tempo/README.md, seção 3.

const regra = require('./marketingChecklist');

const TZ = 'America/Sao_Paulo';
const DIA_MS = 86400000;
// A rotina passa a ser cobrada a partir desta semana (deploy da Fase 3).
// Antes disso ninguém marcava, e cobrar o passado pintaria tudo de vermelho.
const ROTINA_DESDE = '2026-09-27';

const utc = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);

// Data civil em São Paulo de um timestamptz (ou de uma date 'YYYY-MM-DD').
function dataSP(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function semanasDoAno(ano) {
  const out = [];
  let ini = utc(`${ano}-01-01`);
  const fimAno = utc(`${ano}-12-31`);
  let n = 1;
  while (ini <= fimAno) {
    let fim = new Date(ini.getTime() + (6 - ini.getUTCDay()) * DIA_MS);
    if (fim > fimAno) fim = fimAno;
    out.push({ n, inicio: iso(ini), fim: iso(fim) });
    ini = new Date(fim.getTime() + DIA_MS);
    n++;
  }
  return out;
}

// Nº da semana de uma data no ano. Antes do ano = 0 (vem de trás, atrasado);
// depois do ano = null (fora); sem data = null.
function semanaDe(data, semanas) {
  const d = dataSP(data);
  if (!d || !semanas.length) return null;
  if (d < semanas[0].inicio) return 0;
  const s = semanas.find(w => d >= w.inicio && d <= w.fim);
  return s ? s.n : null;
}

// Domingo da semana civil de uma data (a chave da rotina).
function domingoDe(data) {
  const d = utc(dataSP(data));
  return iso(new Date(d.getTime() - d.getUTCDay() * DIA_MS));
}

// Prazo que manda na posição do card: mesma ordem de fn_marketing_card_prazo_atual.
function prazoDoCard(c) {
  return dataSP(c.data_fim) || dataSP(c.prazo_producao) || dataSP(c.prazo_confirmado) || dataSP(c.prazo_preliminar);
}

// Institucionais = ciclo de evento · Sistema = pedido (formulário/campanha) · Interno = o resto.
function frenteDoCard(c) {
  if (c.event_id || c.origem === 'evento') return 'ins';
  if (c.campanha_id || c.solicitacao_id || c.origem === 'solicitacao') return 'sis';
  return 'int';
}

// Recorte de UM card para quem está vendo. Devolve null quando a pessoa não vê nada dele.
// ctx = { lider, nivel, meusMembroIds } (mesmo contexto da régua da subtarefa).
// responsaveisDoCulto = membros que respondem pelo culto daquela série (vêem lider_move).
function recortarCard({ card, itens = [], ctx, responsaveisDoCulto = [] }) {
  const meus = ctx.meusMembroIds || [];
  const vis = card.visibilidade || 'equipe';
  const marca = (item) => regra.podeMarcarItem({ ...ctx, item, card });
  const comMarca = (lista) => lista.map(i => ({ ...i, pode_marcar: marca(i) }));

  if (ctx.lider) return { papel: 'lider', itens: comMarca(itens) };
  if (vis === 'so_lider') return null;
  const ehResp = !!card.atribuido_a && meus.includes(card.atribuido_a);
  if (vis === 'lider_move') {
    const doCulto = ehResp || responsaveisDoCulto.some(m => meus.includes(m));
    return doCulto ? { papel: 'responsavel', itens: comMarca(itens) } : null;
  }
  if (ehResp) return { papel: 'responsavel', itens: comMarca(itens) };
  const meusItens = itens.filter(i => i.membro_id && meus.includes(i.membro_id));
  return meusItens.length ? { papel: 'dono', itens: comMarca(meusItens) } : null;
}

// Tarefa em aberto no recorte: card não concluído e (sem itens ou com item visível aberto).
// Quem só vê os próprios itens está em dia quando os DELE estão feitos.
function tarefaAberta({ estado, papel, itens }) {
  if (papel === 'dono') return itens.some(i => !i.feito);
  if (estado === 'concluido') return false;
  return !itens.length || itens.some(i => !i.feito);
}

// Cor do quadrado e semanas vermelhas: só o que está aberto até a semana atual.
function statusFrente(tarefas, semanaAtual) {
  const atrasadas = new Set();
  let pendentes = 0;
  for (const t of tarefas) {
    if (!t.aberta || t.semana == null || t.semana > semanaAtual) continue;
    pendentes++;
    if (t.semana < semanaAtual) atrasadas.add(t.semana);
  }
  return {
    status: pendentes ? 'vermelho' : 'verde',
    pendentes,
    semanas_atrasadas: [...atrasadas].sort((a, b) => a - b),
  };
}

// Rotina: 1 tarefa por pessoa × semana, com os compromissos dela como itens.
// execucoes = [{ compromisso_id, membro_id, semana_inicio }].
function tarefasDaRotina({ compromissos, execucoes, semanas, ctx }) {
  const feitos = new Set((execucoes || []).map(e => `${e.compromisso_id}|${e.membro_id}|${e.semana_inicio}`));
  const meus = ctx.meusMembroIds || [];
  const porChave = new Map();
  for (const c of compromissos || []) {
    const pessoas = [...new Set([c.membro_id, ...(c.participantes_ids || [])].filter(Boolean))];
    const desde = [ROTINA_DESDE, c.created_at ? domingoDe(c.created_at) : ROTINA_DESDE].sort().pop();
    for (const m of pessoas) {
      if (!ctx.lider && !meus.includes(m)) continue;
      for (const w of semanas) {
        const domingo = domingoDe(w.inicio);
        if (domingo < desde) continue;
        const chave = `${m}|${w.n}`;
        if (!porChave.has(chave)) {
          porChave.set(chave, { id: `rot-${m}-${w.n}`, frente: 'rot', membro_id: m, semana: w.n, semana_inicio: domingo, itens: [] });
        }
        const feito = feitos.has(`${c.id}|${m}|${domingo}`);
        porChave.get(chave).itens.push({
          id: `${c.id}|${domingo}`, compromisso_id: c.id, texto: c.descricao, membro_id: m,
          dia_semana: c.dia_semana, hora_inicio: c.hora_inicio,
          esforco_valor: Number(c.duracao_h) || 0, esforco_unidade: 'horas',
          feito, pode_marcar: ctx.lider || meus.includes(m),
        });
      }
    }
  }
  // aberta no futuro = previsto; quem separa pendência de previsto é statusFrente
  return [...porChave.values()].map(t => ({ ...t, aberta: t.itens.some(i => !i.feito) }));
}

module.exports = {
  ROTINA_DESDE,
  dataSP,
  semanasDoAno,
  semanaDe,
  domingoDe,
  prazoDoCard,
  frenteDoCard,
  recortarCard,
  tarefaAberta,
  statusFrente,
  tarefasDaRotina,
};
