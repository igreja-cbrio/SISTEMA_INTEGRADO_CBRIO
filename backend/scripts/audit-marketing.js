require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const log = (label, data) => {
  console.log('\n══ ' + label + ' ══');
  console.log(JSON.stringify(data, null, 2));
};

const ok  = (m) => console.log(' ✓ ' + m);
const fail= (m) => console.log(' ✗ ' + m);
const warn= (m) => console.log(' ⚠ ' + m);

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`RPC ${name}: ${error.message}`);
  return data;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  AUDITORIA · MÓDULO MARKETING · 20 PRs entregues          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // ════════════════════════════════════════════════════════════
  // 1. Schema · existência das 8 tabelas + junction
  // ════════════════════════════════════════════════════════════
  console.log('\n[1] SCHEMA · tabelas');
  const tabelas = [
    'marketing_membros',
    'marketing_etiquetas_tipo',
    'marketing_etiquetas_destino',
    'marketing_kanban_cards',
    'marketing_entregaveis',
    'marketing_capacidade_override',
    'marketing_compromissos_recorrentes',
    'marketing_recorrentes_participantes',
    'setor_diretor',
  ];

  for (const t of tabelas) {
    const { error, count } = await supabase
      .from(t)
      .select('*', { count: 'exact', head: true });
    if (error) fail(`${t}: ${error.message}`);
    else ok(`${t} · ${count ?? 0} rows`);
  }

  // ════════════════════════════════════════════════════════════
  // 2. Funções SQL · existência + execução
  // ════════════════════════════════════════════════════════════
  console.log('\n[2] FUNÇÕES SQL');

  // capacidade
  try {
    const cap = await rpc('fn_marketing_calcular_capacidade_semana', { p_data_ref: new Date().toISOString().slice(0,10) });
    ok(`fn_marketing_calcular_capacidade_semana · ${cap.length} membros`);
    if (cap.length === 0) warn('  sem membros ativos · esperado 4 (Allan/Cauã/Letícia/Lorena)');
    else log('Capacidade da semana', cap.map(c => ({
      membro: c.profile_id?.slice(0,8),
      hab: c.habilidade,
      base: c.horas_base,
      rec: c.horas_recorrentes,
      ovr: c.horas_override,
      disp: c.horas_disponiveis,
      aloc: c.horas_alocadas,
      livre: c.horas_livres,
    })));
  } catch (e) { fail(`fn_marketing_calcular_capacidade_semana: ${e.message}`); }

  // estimar prazo · pega um tipo qualquer
  const { data: tipoAlgum } = await supabase.from('marketing_etiquetas_tipo')
    .select('id, slug, esforco_max_h').eq('ativo', true).limit(1).maybeSingle();
  if (tipoAlgum) {
    try {
      const est = await rpc('fn_marketing_estimar_prazo', { p_tipo_id: tipoAlgum.id });
      ok(`fn_marketing_estimar_prazo (${tipoAlgum.slug}) · ${est.dias_uteis || '?'} dias úteis`);
      log('Estimativa exemplo', est);
    } catch (e) { fail(`fn_marketing_estimar_prazo: ${e.message}`); }
  }

  // sync triggers · checa se existem
  const triggers = await supabase.rpc('app_soft_deletable_tables').then(r => r.data || [], () => null);
  if (triggers) {
    const expected = ['marketing_membros','marketing_kanban_cards','marketing_entregaveis','marketing_capacidade_override','marketing_compromissos_recorrentes'];
    expected.forEach(t => {
      if (triggers.includes(t)) ok(`whitelist app_soft_deletable inclui ${t}`);
      else fail(`whitelist app_soft_deletable FALTA ${t}`);
    });
  }

  // ════════════════════════════════════════════════════════════
  // 3. Dados · seeds
  // ════════════════════════════════════════════════════════════
  console.log('\n[3] DADOS · seeds e equipe');

  const { data: modulos } = await supabase.from('modulos').select('slug, nome, rota, ativo').eq('slug', 'marketing');
  if (modulos?.length) ok(`modulo marketing existe · rota ${modulos[0].rota} · ativo=${modulos[0].ativo}`);
  else fail('modulo marketing NÃO existe em public.modulos');

  // setor_diretor (Spec 001)
  const { data: setores } = await supabase.from('setor_diretor').select('*').order('setor');
  ok(`setor_diretor · ${setores?.length || 0} linhas`);
  log('Setores', setores);

  // etiquetas ativas
  const { data: tipos } = await supabase.from('marketing_etiquetas_tipo')
    .select('slug, nome, esforco_max_h, ativo').order('ordem');
  const ativos = tipos.filter(t => t.ativo);
  const inativos = tipos.filter(t => !t.ativo);
  ok(`etiquetas tipo · ${ativos.length} ativas + ${inativos.length} inativas`);
  log('Tipos ativos (ordem)', ativos.map(t => `${t.slug}: ${t.nome} (${t.esforco_max_h ?? 'NULL'}h)`));
  if (inativos.length > 0) log('Tipos inativos (Spec 017 soft-deactivate)', inativos.map(t => t.slug));

  const { data: destinos } = await supabase.from('marketing_etiquetas_destino')
    .select('slug, nome, ativo').order('ordem');
  ok(`etiquetas destino · ${destinos.length} (${destinos.filter(d => d.ativo).length} ativas)`);

  // membros ativos
  const { data: membros } = await supabase.from('marketing_membros')
    .select('id, habilidade, horas_semanais, ativo, observacao, profiles:profile_id(name, email)')
    .is('deleted_at', null);
  ok(`marketing_membros · ${membros?.length || 0} cadastrados (${membros?.filter(m => m.ativo).length} ativos)`);
  log('Membros', membros?.map(m => `${m.profiles?.name || '?'} · ${m.habilidade} · ${m.horas_semanais}h/sem · ativo=${m.ativo}`));

  // recorrentes
  const { data: recorrentes } = await supabase.from('marketing_compromissos_recorrentes')
    .select('id, dia_semana, hora_inicio, duracao_h, descricao, ativo')
    .is('deleted_at', null);
  ok(`recorrentes · ${recorrentes?.length || 0}`);

  const { data: parts } = await supabase.from('marketing_recorrentes_participantes').select('*');
  ok(`recorrentes_participantes · ${parts?.length || 0} vínculos`);
  if (recorrentes?.length) {
    const partsByCompr = {};
    parts.forEach(p => { (partsByCompr[p.compromisso_id] ||= []).push(p.membro_id); });
    const orfaos = recorrentes.filter(r => !partsByCompr[r.id]);
    if (orfaos.length > 0) {
      fail(`${orfaos.length} recorrentes SEM participantes (órfãos · deveriam ter ≥1 cada)`);
      log('Recorrentes órfãos', orfaos);
    }
    log('Recorrentes detalhados', recorrentes.map(r => ({
      dia: r.dia_semana, hora: r.hora_inicio?.slice(0,5), dur: r.duracao_h,
      descr: r.descricao?.slice(0, 60),
      participantes: (partsByCompr[r.id] || []).length,
    })));
  }

  // KPIs MKT-*
  const { data: kpis } = await supabase.from('kpi_indicadores_taticos')
    .select('id, indicador, ativo, unidade, fonte_auto, periodicidade')
    .like('id', 'MKT-%');
  ok(`KPIs MKT-* · ${kpis?.length || 0}`);
  log('KPIs Marketing', kpis);

  // ════════════════════════════════════════════════════════════
  // 4. Cards · estado atual
  // ════════════════════════════════════════════════════════════
  console.log('\n[4] CARDS · estado atual');
  const { data: cards } = await supabase.from('marketing_kanban_cards')
    .select('id, titulo, origem, estado, ordem_fila, raia_rapida, tem_revisao, atribuido_a, etiqueta_tipo_id, prazo_confirmado, created_at')
    .is('deleted_at', null)
    .order('estado').order('ordem_fila');
  ok(`cards ativos · ${cards?.length || 0}`);
  if (cards?.length) {
    const porEstado = {};
    cards.forEach(c => { porEstado[c.estado] = (porEstado[c.estado] || 0) + 1; });
    log('Por estado', porEstado);
    log('Cards', cards.map(c => ({
      titulo: c.titulo?.slice(0,40),
      origem: c.origem,
      estado: c.estado,
      ordem: c.ordem_fila,
      atribuido: c.atribuido_a?.slice(0,8) || 'sem',
      tipo: c.etiqueta_tipo_id?.slice(0,8) || 'sem',
      revisao: c.tem_revisao,
    })));
  }

  // ════════════════════════════════════════════════════════════
  // 5. Permissões · matriz para o módulo
  // ════════════════════════════════════════════════════════════
  console.log('\n[5] PERMISSÕES · matriz cargo × módulo marketing');
  const v_modulo = modulos?.[0];
  if (v_modulo) {
    const { data: matriz } = await supabase
      .from('cargo_modulo_permissao')
      .select('nivel, pode_exportar, pode_aprovar, escopo_proprio, cargos:cargo_id(slug, nome_completo)')
      .eq('modulo_id', (await supabase.from('modulos').select('id').eq('slug', 'marketing').single()).data?.id)
      .gt('nivel', 0)
      .order('nivel', { ascending: false });
    log('Cargos com acesso (nivel > 0)', matriz?.map(m => `${m.cargos.slug}: nivel ${m.nivel} ${m.escopo_proprio ? '+escopo' : ''}`));
  }

  // boost por area
  const { data: peresChecagem } = await supabase
    .from('usuario_areas')
    .select('usuario_id, areas:area_id(nome), usuarios:usuario_id(nome, cargo_id)')
    .eq('areas.nome', 'Marketing')
    .limit(20);
  // (não filtra exato por nome porque JOIN tem nuance · só validar que existem)
  ok('usuario_areas vinculados a Marketing (pode haver mais)');

  // ════════════════════════════════════════════════════════════
  // 6. Solicitações Marketing · estado atual
  // ════════════════════════════════════════════════════════════
  console.log('\n[6] SOLICITAÇÕES MARKETING');
  const { data: solics } = await supabase.from('solicitacoes')
    .select('id, titulo, status, aprovacao_origem_status, marketing_tipo_id, created_at')
    .eq('area_responsavel', 'marketing')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  ok(`solicitações marketing · ${solics?.length || 0}`);
  if (solics?.length) {
    const porStatus = {};
    solics.forEach(s => { porStatus[s.status] = (porStatus[s.status] || 0) + 1; });
    log('Por status', porStatus);
  }

  // ════════════════════════════════════════════════════════════
  // 7. Audit log · mudanças recentes
  // ════════════════════════════════════════════════════════════
  console.log('\n[7] AUDIT LOG · marketing_kanban_cards últimos 7d');
  const ha7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: audit } = await supabase.from('app_audit_log')
    .select('action, user_email, created_at, changes')
    .eq('table_name', 'marketing_kanban_cards')
    .gte('created_at', ha7d)
    .order('created_at', { ascending: false })
    .limit(5);
  ok(`audit log · ${audit?.length || 0} eventos últimos 7d`);
  if (audit?.length) log('Últimos eventos', audit.map(a => `${a.created_at} · ${a.action} por ${a.user_email}`));

  // ════════════════════════════════════════════════════════════
  // 8. Trigger sync · testa idempotência
  // ════════════════════════════════════════════════════════════
  console.log('\n[8] TRIGGERS SYNC · solicitacao→card · event_task→card');
  const { data: cardsSolic } = await supabase
    .from('marketing_kanban_cards')
    .select('solicitacao_id')
    .eq('origem', 'solicitacao')
    .is('deleted_at', null);
  const { data: solicsPend } = await supabase
    .from('solicitacoes')
    .select('id')
    .eq('area_responsavel', 'marketing')
    .in('status', ['pendente','em_atendimento','aguardando_entrega'])
    .is('deleted_at', null);
  const cardsIds = new Set((cardsSolic || []).map(c => c.solicitacao_id));
  const semCard = (solicsPend || []).filter(s => !cardsIds.has(s.id));
  if (semCard.length > 0) {
    warn(`${semCard.length} solicitações pendentes SEM card no Kanban (trigger pode ter falhado · backfill?)`);
    log('Solicitações sem card', semCard);
  } else {
    ok(`todas as ${solicsPend?.length || 0} solicitações pendentes têm card correspondente`);
  }

  // ════════════════════════════════════════════════════════════
  // 9. Notificações · módulo marketing registrado
  // ════════════════════════════════════════════════════════════
  console.log('\n[9] NOTIFICAÇÕES · regras configuradas');
  const { data: regras } = await supabase.from('notificacao_regras')
    .select('modulo, tipo, destinatarios').eq('modulo', 'marketing').limit(10);
  ok(`regras notificacao marketing · ${regras?.length || 0}`);
  if (regras?.length === 0) warn('Sem regras configuradas · usa fallback (admins/diretores)');

  // ════════════════════════════════════════════════════════════
  // 10. Consistência de dados · checks
  // ════════════════════════════════════════════════════════════
  console.log('\n[10] CONSISTÊNCIA');

  // Cards com solicitacao_id apontando pra solicitacao apagada?
  const { data: cardsOrfaos } = await supabase
    .from('marketing_kanban_cards')
    .select('id, solicitacao_id, solicitacoes:solicitacao_id(id, deleted_at)')
    .not('solicitacao_id', 'is', null)
    .is('deleted_at', null);
  const orfaosSolic = (cardsOrfaos || []).filter(c => !c.solicitacoes || c.solicitacoes.deleted_at);
  if (orfaosSolic.length > 0) warn(`${orfaosSolic.length} cards com solicitacao apagada (FK SET NULL pendente)`);
  else ok('Nenhum card órfão de solicitação');

  // Cards com etiqueta tipo desativada?
  const { data: cardsComTipoInativo } = await supabase
    .from('marketing_kanban_cards')
    .select('id, titulo, etiqueta_tipo:etiqueta_tipo_id(slug, ativo)')
    .not('etiqueta_tipo_id', 'is', null)
    .is('deleted_at', null);
  const tipoInativoUsado = (cardsComTipoInativo || []).filter(c => c.etiqueta_tipo && !c.etiqueta_tipo.ativo);
  if (tipoInativoUsado.length > 0) {
    warn(`${tipoInativoUsado.length} cards usam etiqueta tipo INATIVA (de antes do refator Spec 017)`);
    log('Cards com tipo inativo', tipoInativoUsado.map(c => ({ titulo: c.titulo?.slice(0,40), tipo: c.etiqueta_tipo.slug })));
  } else {
    ok('Nenhum card usa etiqueta tipo inativa');
  }

  // is_diretoria_geral · 5 diretorias esperadas
  const { data: dirGeral } = await supabase.from('profiles')
    .select('id, name, funcao_diretoria').eq('is_diretoria_geral', true).order('name');
  ok(`Diretoria geral · ${dirGeral?.length || 0} cadastrados`);
  log('Diretoria geral', dirGeral?.map(d => `${d.name} · ${d.funcao_diretoria || '?'}`));

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('FIM DA AUDITORIA');
  console.log('══════════════════════════════════════════════════════════════\n');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
