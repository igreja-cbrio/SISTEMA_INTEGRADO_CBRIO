// ============================================================================
// services/cobertura · cobertura de férias/licença (RH · Marcos 2026-06-17)
//
// Quando o RH aprova uma licença com substituto, o substituto herda os módulos
// OPERACIONAIS do titular (áreas/filas · NÃO Financeiro/RH/estratégico) como
// overrides `permissoes_modulo` com `expira_em = fim+1d`. O authenticate já
// IGNORA override expirado → revert automático no retorno. Sem tocar no hot-path.
//
// Segurança: nunca rebaixa nem sobrescreve override que o substituto já tenha
// (só concede onde o titular tem MAIS que o substituto e não há override dele).
// ============================================================================

const { supabase } = require('../utils/supabase');
const { resolveEffectivePerms, getCargoMatrix, getModulos, bustPermissionCaches } = require('../middleware/auth');

// Módulos que o substituto PODE herdar (só áreas/filas operacionais · decisão do
// Marcos: nada de Financeiro/RH/estratégico/admin).
const OPERACIONAIS = new Set([
  'integracao', 'cuidados', 'grupos', 'voluntariado', 'next', 'next-batismo',
  'membresia', 'kids', 'ami', 'bridge', 'online', 'marketing', 'producao',
]);

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

// Resolve as permissões EFETIVAS operacionais de uma pessoa (por e-mail):
//   { usuarioId, ops: { <slug>: {leitura, escrita, modulo_id} }, overrideMods: Set<modulo_id> }
async function resolverOperacionais(email) {
  const em = normEmail(email);
  if (!em) return { usuarioId: null, ops: {}, overrideMods: new Set() };

  const { data: usuario } = await supabase
    .from('usuarios').select('id, cargo_id').ilike('email', em).maybeSingle();
  if (!usuario) return { usuarioId: null, ops: {}, overrideMods: new Set() };

  const { data: overridesRaw } = await supabase
    .from('permissoes_modulo')
    .select('modulo_id, nivel_leitura, nivel_escrita, pode_exportar, pode_aprovar, escopo_proprio, expira_em')
    .eq('usuario_id', usuario.id);
  const now = Date.now();
  const overrides = (overridesRaw || []).filter(o => !o.expira_em || new Date(o.expira_em).getTime() > now);
  const overrideMods = new Set((overrides || []).map(o => o.modulo_id));

  const { data: userAreas } = await supabase
    .from('usuario_areas').select('areas(nome)').eq('usuario_id', usuario.id);
  const areas = (userAreas || []).map(ua => ua.areas?.nome).filter(Boolean);

  const modulos = await getModulos();
  const cargoMatrix = await getCargoMatrix(usuario.cargo_id);
  const perms = resolveEffectivePerms({ overrides, cargoMatrix, cargoId: usuario.cargo_id, modulos, areas });

  const bySlug = {};
  for (const m of modulos) if (m.slug) bySlug[m.slug] = m.id;

  const ops = {};
  for (const slug of OPERACIONAIS) {
    const p = perms[slug];
    if (p && p.leitura > 0 && bySlug[slug] != null) {
      ops[slug] = { leitura: p.leitura, escrita: p.escrita, modulo_id: bySlug[slug] };
    }
  }
  return { usuarioId: usuario.id, ops, overrideMods };
}

// fim da licença → timestamp de expiração do acesso (cobre o último dia inteiro)
function expiraEmDe(dataFim) {
  const d = new Date(dataFim + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1); // dia seguinte 00:00 UTC → o dia do fim fica coberto
  return d.toISOString();
}

// Aplica a cobertura: cria a linha rh_cobertura + concede os overrides ao
// substituto. Idempotente o suficiente (não duplica grant pra a mesma licença).
async function aplicarCobertura({
  feriasId, titular, substituto, dataInicio, dataFim, criadoPor, observacao,
}) {
  // titular/substituto = { funcionario_id, email, nome }
  if (!substituto?.email) return { ok: false, motivo: 'substituto sem e-mail' };

  // não recria se já há cobertura ativa pra essa licença
  if (feriasId) {
    const { data: ja } = await supabase.from('rh_cobertura')
      .select('id').eq('ferias_id', feriasId).eq('status', 'ativa').limit(1).maybeSingle();
    if (ja) return { ok: true, jaExistia: true, cobertura_id: ja.id };
  }

  const tit = await resolverOperacionais(titular?.email);
  const sub = await resolverOperacionais(substituto.email);

  // cria a linha primeiro (pra ter o id no motivo do override)
  const { data: cob, error: eCob } = await supabase.from('rh_cobertura').insert({
    ferias_id: feriasId || null,
    titular_funcionario_id: titular?.funcionario_id || null,
    titular_email: normEmail(titular?.email) || null,
    titular_nome: titular?.nome || null,
    substituto_funcionario_id: substituto.funcionario_id || null,
    substituto_email: normEmail(substituto.email),
    substituto_nome: substituto.nome || null,
    data_inicio: dataInicio,
    data_fim: dataFim,
    status: 'ativa',
    criado_por: criadoPor || null,
    observacao: observacao || null,
  }).select('id').single();
  if (eCob) throw eCob;

  const concedidos = {};
  if (sub.usuarioId) {
    const expira = expiraEmDe(dataFim);
    for (const [slug, t] of Object.entries(tit.ops)) {
      const jaEfetivo = sub.ops[slug]?.leitura || 0;
      if (t.leitura <= jaEfetivo) continue;        // substituto já tem ≥ → não precisa
      if (sub.overrideMods.has(t.modulo_id)) continue; // não sobrescreve override dele
      const { error } = await supabase.from('permissoes_modulo').insert({
        usuario_id: sub.usuarioId,
        modulo_id: t.modulo_id,
        nivel_leitura: t.leitura,
        nivel_escrita: t.escrita,
        motivo: `cobertura:${cob.id}`,
        expira_em: expira,
        criado_por: criadoPor || null,
      });
      if (!error) concedidos[slug] = { l: t.leitura, e: t.escrita };
    }
  }

  await supabase.from('rh_cobertura')
    .update({ modulos_concedidos: concedidos, updated_at: new Date().toISOString() })
    .eq('id', cob.id);

  bustPermissionCaches();
  return { ok: true, cobertura_id: cob.id, concedidos, substituto_sem_login: !sub.usuarioId };
}

// Cancela/encerra: remove os overrides concedidos e marca status.
async function encerrarCobertura(coberturaId, novoStatus = 'cancelada') {
  const { data: cob } = await supabase.from('rh_cobertura')
    .select('id, substituto_email').eq('id', coberturaId).maybeSingle();
  if (!cob) return { ok: false };

  const { data: usuario } = await supabase
    .from('usuarios').select('id').ilike('email', normEmail(cob.substituto_email)).maybeSingle();
  if (usuario) {
    await supabase.from('permissoes_modulo')
      .delete().eq('usuario_id', usuario.id).eq('motivo', `cobertura:${coberturaId}`);
  }
  await supabase.from('rh_cobertura')
    .update({ status: novoStatus, updated_at: new Date().toISOString() }).eq('id', coberturaId);
  bustPermissionCaches();
  return { ok: true };
}

module.exports = { OPERACIONAIS, resolverOperacionais, aplicarCobertura, encerrarCobertura };
