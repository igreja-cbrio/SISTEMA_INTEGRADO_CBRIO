'use strict';
// Régua PURA da subtarefa do Marketing (linha do tempo · Fase 1 · 2026-09-25).
// Sem supabase de propósito: entra no gate. Quem lê o banco é routes/marketing.js.
//
// ⚠️ LÍDER ≠ nível de módulo. O AREA_MODULO_BOOST dá nível 5 à equipe inteira
// de Marketing, então "nível 5" não distingue o Pedro de ninguém. Líder aqui é
// role admin/diretor OU um marketing_membros ativo com habilidade 'coordenador'.

const UNIDADES = ['horas', 'dias'];
const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'];
const VISIBILIDADES = ['equipe', 'so_lider', 'lider_move'];
const CULTOS = ['cbrio', 'ami', 'kids'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ESFORCO_MAX = 999;

function ehLider({ role, habilidades } = {}) {
  if (role === 'admin' || role === 'diretor') return true;
  return Array.isArray(habilidades) && habilidades.includes('coordenador');
}

// Quem pode MARCAR (feito / registro) um item.
// · lider_move (Aprovação, Pré-Testes, Dia D): só o líder, e isso vale até para
//   quem tem nível 3 — é o ponto da visibilidade.
// · so_lider: só o líder (o card nem aparece para a equipe).
// · equipe: quem já podia (nível ≥3, o Kanban de hoje) + o dono do item + o
//   responsável do card. A Fase 1 ACRESCENTA gente, não tira ninguém.
function podeMarcarItem({ lider, nivel, meusMembroIds, item, card }) {
  if (lider) return true;
  const vis = card?.visibilidade || 'equipe';
  if (vis === 'lider_move' || vis === 'so_lider') return false;
  const meus = Array.isArray(meusMembroIds) ? meusMembroIds : [];
  if (item?.membro_id && meus.includes(item.membro_id)) return true;
  if (card?.atribuido_a && meus.includes(card.atribuido_a)) return true;
  return typeof nivel === 'number' && nivel >= 3;
}

// Quem pode mudar a ESTRUTURA do item (texto, dono, esforço, prazo, exige_registro).
// Continua sendo quem já podia: nível ≥3 ou líder. Em card do líder, só o líder.
function podeEditarItem({ lider, nivel, card }) {
  if (lider) return true;
  const vis = card?.visibilidade || 'equipe';
  if (vis === 'lider_move' || vis === 'so_lider') return false;
  return typeof nivel === 'number' && nivel >= 3;
}

// Saneia os campos de subtarefa. Devolve { campos, erro }.
// ⚠️ Valor inválido é ERRO (400), nunca coerção: '2 dias' virar 2 horas, ou
// 'dia' virar 'horas', mudaria a carga do planner em silêncio.
function camposSubtarefa(body = {}) {
  const campos = {};
  if (body.membro_id !== undefined) {
    if (body.membro_id === null || body.membro_id === '') campos.membro_id = null;
    else if (UUID_RE.test(String(body.membro_id))) campos.membro_id = String(body.membro_id);
    else return { erro: 'membro_id inválido' };
  }
  if (body.esforco_valor !== undefined) {
    const v = body.esforco_valor;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > ESFORCO_MAX) {
      return { erro: `esforco_valor deve ser um número entre 0 e ${ESFORCO_MAX}` };
    }
    campos.esforco_valor = Math.round(v * 10) / 10;
  }
  if (body.esforco_unidade !== undefined) {
    if (!UNIDADES.includes(body.esforco_unidade)) return { erro: "esforco_unidade deve ser 'horas' ou 'dias'" };
    campos.esforco_unidade = body.esforco_unidade;
  }
  if (body.prazo !== undefined) {
    if (body.prazo === null || body.prazo === '') campos.prazo = null;
    else if (DATA_RE.test(String(body.prazo)) && !Number.isNaN(Date.parse(String(body.prazo) + 'T12:00:00Z'))) {
      campos.prazo = String(body.prazo);
    } else return { erro: 'prazo deve ser uma data AAAA-MM-DD' };
  }
  if (body.exige_registro !== undefined) {
    if (typeof body.exige_registro !== 'boolean') return { erro: 'exige_registro deve ser verdadeiro ou falso' };
    campos.exige_registro = body.exige_registro;
  }
  if (body.registro !== undefined) {
    if (body.registro !== null && typeof body.registro !== 'string') return { erro: 'registro deve ser texto' };
    campos.registro = body.registro === null ? null : body.registro.trim() || null;
  }
  return { campos };
}

// Item que exige registro só fecha com texto. O banco também recusa (CHECK),
// mas aqui a mensagem é para gente, não 23514.
function faltaRegistro({ exigeRegistro, feito, registro }) {
  return !!(feito && exigeRegistro && !(typeof registro === 'string' && registro.trim()));
}

// Campos do CARD que só o líder muda nesta fase.
function camposCardLider(body = {}) {
  const campos = {};
  if (body.culto !== undefined) {
    if (body.culto !== null && !CULTOS.includes(body.culto)) return { erro: 'culto inválido' };
    campos.culto = body.culto;
  }
  if (body.prioridade !== undefined) {
    if (body.prioridade !== null && !PRIORIDADES.includes(body.prioridade)) return { erro: 'prioridade inválida' };
    campos.prioridade = body.prioridade;
  }
  if (body.visibilidade !== undefined) {
    if (!VISIBILIDADES.includes(body.visibilidade)) return { erro: 'visibilidade inválida' };
    campos.visibilidade = body.visibilidade;
  }
  return { campos };
}

module.exports = {
  UNIDADES, PRIORIDADES, VISIBILIDADES, CULTOS,
  ehLider, podeMarcarItem, podeEditarItem, camposSubtarefa, faltaRegistro, camposCardLider,
};
