// ============================================================================
// Direcionar pros valores no Next · motor COMPARTILHADO (Fase 1B/2a · 2026-06-25)
//
// Usado por dois caminhos:
//   - autenticado: routes/next.js  POST /matriculas/:id/direcionar  (líder marca na Pessoas)
//   - público:     routes/publicNext.js  POST /direcionar/:token     (QR no fim do Next · Fase 2a)
//
// Grupos/Voluntários → encaminhamento (origem='next') na caixa da área (ligado à matrícula).
// Batismo → inscrição pendente em batismo_inscricoes REUSANDO membro_id (sem duplicar).
// Devocional → só registra a escolha (flag · estatística). NÃO marca engajamento (o NSM
// conta o sinal real). Dedup por matrícula × destino e por membro_id (batismo).
//
// O recálculo de KPIs do Next fica a cargo do CHAMADOR (recalcularKpisNext em next.js) —
// o service não importa pra não acoplar.
// ============================================================================
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { findOrCreateMembro } = require('../routes/pessoas');

// destino → flag na matrícula + (grupos/voluntarios) caixa da área
const NEXT_DIRECIONA = {
  grupos:      { flag: 'indicou_grupo',      destino: 'grupos',      valor_alvo: 'conectar', modulo: 'grupos',       label: 'Grupos',      link: '/grupos' },
  voluntarios: { flag: 'indicou_servir',     destino: 'voluntarios', valor_alvo: 'servir',   modulo: 'voluntariado', label: 'Voluntários', link: '/ministerial/voluntariado/encaminhados' },
  batismo:     { flag: 'indicou_batismo' },
  devocional:  { flag: 'indicou_devocional' },
};

// ── Token assinado da turma (pro QR público) · HMAC com CRON_SECRET (fail-closed) ──
const CRON_SECRET = process.env.CRON_SECRET || '';
const TOKEN_TTL_DIAS = 60;

function signTurmaToken(turmaId) {
  if (!CRON_SECRET) return null;
  const exp = Date.now() + TOKEN_TTL_DIAS * 86400000;
  const payload = `${turmaId}.${exp}`;
  const sig = crypto.createHmac('sha256', CRON_SECRET).update(payload).digest('hex').slice(0, 24);
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyTurmaToken(token) {
  if (!CRON_SECRET || !token) return null;
  try {
    const raw = Buffer.from(String(token), 'base64url').toString('utf8');
    const [turmaId, exp, sig] = raw.split('.');
    if (!turmaId || !exp || !sig) return null;
    const expected = crypto.createHmac('sha256', CRON_SECRET).update(`${turmaId}.${exp}`).digest('hex').slice(0, 24);
    if (sig !== expected) return null;
    if (Date.now() > Number(exp)) return null;
    return turmaId;
  } catch (_) { return null; }
}

// Direciona UMA matrícula pros destinos pedidos. permitir = lista de destinos aceitos
// (o público passa só grupos/voluntarios/batismo · o Devocional é Fase 2b).
// Retorna { ok, destinos, criados } · NÃO recalcula KPIs (chamador faz).
async function direcionarMatricula({ matriculaId, destinos = [], userId = null, permitir = null }) {
  const validos = (Array.isArray(destinos) ? destinos : [])
    .filter(d => NEXT_DIRECIONA[d] && (!permitir || permitir.includes(d)));
  if (validos.length === 0) { const e = new Error('Informe ao menos um destino válido'); e.status = 400; throw e; }

  const { data: m, error: em } = await supabase
    .from('next_matriculas')
    .select('id, turma_id, nome, sobrenome, cpf, telefone, membro_id, indicou_grupo, indicou_servir, indicou_batismo, indicou_devocional')
    .eq('id', matriculaId).is('deleted_at', null).single();
  if (em) throw em;

  const nomeCompleto = `${m.nome || ''} ${m.sobrenome || ''}`.trim() || m.nome || 'Sem nome';

  // 1) Flags na matrícula (estatística "pra onde cada um foi")
  const flags = { updated_at: new Date().toISOString() };
  for (const d of validos) flags[NEXT_DIRECIONA[d].flag] = true;
  await supabase.from('next_matriculas').update(flags).eq('id', m.id);

  // Resolve membro_id (pra batismo não duplicar) · reusa o da matrícula, senão cria/liga
  let membroId = m.membro_id || null;
  async function garantirMembro() {
    if (membroId) return membroId;
    try {
      const r = await findOrCreateMembro({ cpf: m.cpf || null, telefone: m.telefone || null, nome: nomeCompleto, status: 'visitante' });
      membroId = r?.membro_id || null;
      if (membroId) await supabase.from('next_matriculas').update({ membro_id: membroId }).eq('id', m.id);
    } catch (e) { console.error('[nextDirecionar] findOrCreateMembro:', e.message); }
    return membroId;
  }

  const criados = {};
  for (const d of validos) {
    const cfg = NEXT_DIRECIONA[d];
    if (d === 'grupos' || d === 'voluntarios') {
      const { data: ja } = await supabase.from('jornada_encaminhamentos').select('id')
        .eq('next_matricula_id', m.id).eq('destino', cfg.destino).is('deleted_at', null)
        .limit(1).maybeSingle();
      if (!ja) {
        await supabase.from('jornada_encaminhamentos').insert({
          origem: 'next', next_matricula_id: m.id, membro_id: membroId || m.membro_id || null,
          nome: nomeCompleto, telefone: m.telefone || null, destino: cfg.destino,
          valor_alvo: cfg.valor_alvo, encaminhado_por: userId,
        });
        notificar({
          modulo: cfg.modulo, titulo: `Direcionado pra ${cfg.label} no NEXT`,
          mensagem: `${nomeCompleto} foi direcionado(a) pra ${cfg.label} no NEXT. Faça o primeiro contato e registre a devolutiva.`,
          link: cfg.link,
        }).catch(() => {});
        criados[d] = true;
      }
    } else if (d === 'batismo') {
      await garantirMembro();
      let ja = null;
      if (membroId) {
        const { data } = await supabase.from('batismo_inscricoes').select('id')
          .eq('membro_id', membroId).in('status', ['pendente', 'confirmado']).limit(1).maybeSingle();
        ja = data;
      }
      if (!ja) {
        const partes = String(m.nome || '').trim().split(/\s+/);
        await supabase.from('batismo_inscricoes').insert({
          nome: partes[0] || (m.nome || 'Convertido'),
          sobrenome: m.sobrenome || partes.slice(1).join(' ') || '',
          cpf: m.cpf || null, telefone: m.telefone || null, membro_id: membroId || null,
          status: 'pendente', origem: 'manual', observacoes: 'Direcionado pelo NEXT', inscrito_por: userId,
        });
        notificar({
          modulo: 'integracao', titulo: 'Direcionado pra Batismo no NEXT',
          mensagem: `${nomeCompleto} foi direcionado(a) pro batismo no NEXT.`,
          link: '/ministerial/integracao?tab=batismos',
        }).catch(() => {});
        criados.batismo = true;
      }
    } else if (d === 'devocional') {
      // Só registra a escolha (flag acima). O 1º acesso/leitura no app é Fase 2b.
      criados.devocional = true;
    }
  }

  return { ok: true, destinos: validos, criados, turma_id: m.turma_id };
}

module.exports = { NEXT_DIRECIONA, signTurmaToken, verifyTurmaToken, direcionarMatricula };
