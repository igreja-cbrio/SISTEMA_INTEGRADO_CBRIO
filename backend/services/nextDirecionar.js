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
const { acharOuCriarGuardado } = require('./membroMatch');

// destino → flag na matrícula + (grupos/voluntarios) caixa da área
const NEXT_DIRECIONA = {
  grupos:      { flag: 'indicou_grupo',      destino: 'grupos',      valor_alvo: 'conectar', modulo: 'grupos',       label: 'Grupos',      link: '/grupos' },
  voluntarios: { flag: 'indicou_servir',     destino: 'voluntarios', valor_alvo: 'servir',   modulo: 'voluntariado', label: 'Voluntários', link: '/ministerial/voluntariado/encaminhados' },
  batismo:     { flag: 'indicou_batismo' },
  devocional:  { flag: 'indicou_devocional' },
};

// Deriva a área canônica única a partir das áreas escolhidas (mesma prioridade
// do formulário público de voluntariado · InscricaoVoluntariado.deriveArea).
function deriveAreaCanonica(canonicas) {
  const set = new Set((canonicas || []).map(c => String(c || '').toLowerCase()));
  if (set.has('kids')) return 'kids';
  if (set.has('bridge')) return 'bridge';
  if (set.has('ami')) return 'ami';
  if (set.has('online')) return 'online';
  return 'sede';
}

// Resolve as áreas do "quero servir" contra vol_form_opcoes (fonte da verdade).
// Recebe rótulos escolhidos no totem; devolve os rótulos válidos + a área canônica.
async function resolverAreasVol(labels) {
  const escolhidos = (Array.isArray(labels) ? labels : []).map(s => String(s || '').trim()).filter(Boolean);
  if (escolhidos.length === 0) return { labels: [], area: 'sede' };
  const { data: opcoes } = await supabase
    .from('vol_form_opcoes')
    .select('label, area_canonica')
    .eq('ativo', true);
  const mapa = new Map((opcoes || []).map(o => [o.label, o.area_canonica]));
  const validos = escolhidos.filter(l => mapa.has(l));
  const usar = validos.length ? validos : escolhidos; // tolera opção fora do catálogo
  const canonicas = usar.map(l => mapa.get(l)).filter(Boolean);
  return { labels: usar, area: deriveAreaCanonica(canonicas) };
}

// ── Token FIXO do QR de direcionamento · HMAC com CRON_SECRET (fail-closed) ──
// UM QR pro Next inteiro: resolve a TURMA ABERTA do momento (não há turmas simultâneas).
// Estável (não expira · é um QR que se imprime/fixa na tela) e assinado pra não ser
// adivinhável. A resolução da turma aberta fica no endpoint público.
const CRON_SECRET = process.env.CRON_SECRET || '';
const DIRECIONAR_PAYLOAD = 'next-direcionar-v1';

function signDirecionarToken() {
  if (!CRON_SECRET) return null;
  const sig = crypto.createHmac('sha256', CRON_SECRET).update(DIRECIONAR_PAYLOAD).digest('hex').slice(0, 24);
  return Buffer.from(`${DIRECIONAR_PAYLOAD}.${sig}`).toString('base64url');
}

function verifyDirecionarToken(token) {
  if (!CRON_SECRET || !token) return false;
  try {
    const raw = Buffer.from(String(token), 'base64url').toString('utf8');
    const [payload, sig] = raw.split('.');
    if (payload !== DIRECIONAR_PAYLOAD || !sig) return false;
    const expected = crypto.createHmac('sha256', CRON_SECRET).update(DIRECIONAR_PAYLOAD).digest('hex').slice(0, 24);
    return sig === expected;
  } catch (_) { return false; }
}

// Direciona UMA matrícula pros destinos pedidos. permitir = lista de destinos aceitos
// (o público passa só grupos/voluntarios/batismo · o Devocional é Fase 2b).
// Retorna { ok, destinos, criados } · NÃO recalcula KPIs (chamador faz).
async function direcionarMatricula({ matriculaId, destinos = [], areas = [], userId = null, permitir = null }) {
  const validos = (Array.isArray(destinos) ? destinos : [])
    .filter(d => NEXT_DIRECIONA[d] && (!permitir || permitir.includes(d)));
  if (validos.length === 0) { const e = new Error('Informe ao menos um destino válido'); e.status = 400; throw e; }

  const { data: m, error: em } = await supabase
    .from('next_matriculas')
    .select('id, turma_id, nome, sobrenome, cpf, telefone, email, data_nascimento, membro_id, indicou_grupo, indicou_servir, indicou_batismo, indicou_devocional')
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
      const r = await acharOuCriarGuardado({ cpf: m.cpf || null, telefone: m.telefone || null, nome: nomeCompleto, dataNascimento: m.data_nascimento || null, status: 'visitante', origem: 'next_direcionamento', origemId: m.id });
      membroId = r?.membro_id || null;
      if (membroId) await supabase.from('next_matriculas').update({ membro_id: membroId }).eq('id', m.id);
    } catch (e) { console.error('[nextDirecionar] acharOuCriarGuardado:', e.message); }
    return membroId;
  }

  const criados = {};
  for (const d of validos) {
    const cfg = NEXT_DIRECIONA[d];
    if (d === 'voluntarios' && Array.isArray(areas) && areas.length > 0) {
      // "Quero servir" com áreas escolhidas → inscrição REAL no Voluntariado
      // (mesma tabela do formulário público), tag origem='next'. Dedup por matrícula.
      const { data: ja } = await supabase.from('vol_inscricoes').select('id')
        .eq('next_matricula_id', m.id).limit(1).maybeSingle();
      if (!ja) {
        await garantirMembro();
        const { labels, area } = await resolverAreasVol(areas);
        const partes = String(m.nome || '').trim().split(/\s+/);
        await supabase.from('vol_inscricoes').insert({
          nome: partes[0] || (m.nome || 'Voluntário'),
          sobrenome: m.sobrenome || partes.slice(1).join(' ') || '',
          nome_completo: nomeCompleto,
          cpf: m.cpf || null, email: m.email || null, telefone: m.telefone || null,
          data_nascimento: m.data_nascimento || null, nome_mae: null,
          data_inscricao: new Date().toISOString(),
          participou_next: 'True',
          ministerios_interesse: labels.join(', '),
          area, status: 'inscrito', primeiro_contato_em: 'False',
          membro_id: membroId || m.membro_id || null,
          origem: 'next', next_matricula_id: m.id,
        });
        await supabase.from('next_matriculas').update({ indicou_servir: true, updated_at: new Date().toISOString() }).eq('id', m.id);
        notificar({
          modulo: 'voluntariado', titulo: 'Interesse em servir (veio do NEXT)',
          mensagem: `${nomeCompleto} quer servir${labels.length ? ` em: ${labels.join(', ')}` : ''} (via NEXT). Faça o primeiro contato.`,
          link: '/ministerial/voluntariado/inscricoes',
        }).catch(() => {});
        criados.voluntarios = true;
      }
    } else if (d === 'grupos' || d === 'voluntarios') {
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
          status: 'pendente', origem: 'next', observacoes: 'Direcionado pelo NEXT', inscrito_por: userId,
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

module.exports = { NEXT_DIRECIONA, signDirecionarToken, verifyDirecionarToken, direcionarMatricula };
