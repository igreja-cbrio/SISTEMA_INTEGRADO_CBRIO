const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');

/**
 * Gera todas as notificações automáticas de todos os módulos.
 * Chamada por cron (setInterval) ou manualmente.
 */
async function gerarTodasNotificacoes() {
  console.log('[Notificações] Gerando notificações automáticas...');
  let total = 0;
  try {
    total += await gerarNotificacoesRH();
    total += await gerarNotificacoesFinanceiro();
    total += await gerarNotificacoesLogistica();
    total += await gerarNotificacoesPatrimonio();
    total += await gerarNotificacoesMembresia();
    total += await gerarNotificacoesKpis();
    total += await gerarNotificacoesCuidados();
    total += await gerarNotificacoesGrupos();
    total += await gerarNotificacoesRitual();
    console.log(`[Notificações] ${total} notificação(ões) gerada(s).`);
  } catch (e) {
    console.error('[Notificações] Erro:', e.message);
  }
  return total;
}

// ═══════════════════════════════════════════════════════════
// RH
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesRH() {
  let count = 0;
  const today = new Date().toISOString().slice(0, 10);
  const in7d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const in3d = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const in30d = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const in15d = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

  // 1. Férias vencendo em 7 dias (data_fim próxima)
  const { data: feriasVencendo } = await supabase
    .from('rh_ferias_licencas')
    .select('id, funcionario_id, tipo, data_inicio, data_fim, rh_funcionarios(nome)')
    .eq('status', 'aprovado')
    .gte('data_fim', today)
    .lte('data_fim', in7d);

  for (const f of feriasVencendo || []) {
    const nome = f.rh_funcionarios?.nome || 'Funcionário';
    const fmtDate = new Date(f.data_fim + 'T12:00:00').toLocaleDateString('pt-BR');
    count += await notificar({
      modulo: 'rh',
      tipo: 'ferias_vencendo',
      titulo: `Férias terminando — ${nome}`,
      mensagem: `As férias de ${nome} terminam em ${fmtDate}.`,
      link: '/admin/rh',
      severidade: 'aviso',
      chaveDedup: `ferias_vencendo_${f.id}`,
    });
  }

  // 2. Férias começando em 3 dias
  const { data: feriasInicio } = await supabase
    .from('rh_ferias_licencas')
    .select('id, funcionario_id, tipo, data_inicio, rh_funcionarios(nome)')
    .eq('status', 'aprovado')
    .gte('data_inicio', today)
    .lte('data_inicio', in3d);

  for (const f of feriasInicio || []) {
    const nome = f.rh_funcionarios?.nome || 'Funcionário';
    const fmtDate = new Date(f.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR');
    count += await notificar({
      modulo: 'rh',
      tipo: 'ferias_inicio',
      titulo: `Férias iniciando — ${nome}`,
      mensagem: `${nome} entra de férias em ${fmtDate}.`,
      link: '/admin/rh',
      severidade: 'info',
      chaveDedup: `ferias_inicio_${f.id}`,
    });
  }

  // 3. Férias pendentes de aprovação há muito tempo
  const { data: feriasPendentes } = await supabase
    .from('rh_ferias_licencas')
    .select('id, funcionario_id, created_at, rh_funcionarios(nome)')
    .eq('status', 'pendente');

  for (const f of feriasPendentes || []) {
    const dias = Math.floor((Date.now() - new Date(f.created_at).getTime()) / 86400000);
    if (dias < 3) continue;
    const nome = f.rh_funcionarios?.nome || 'Funcionário';
    count += await notificar({
      modulo: 'rh',
      tipo: 'ferias_pendente',
      titulo: `Férias pendente — ${nome}`,
      mensagem: `Solicitação de férias de ${nome} aguarda aprovação há ${dias} dias.`,
      link: '/admin/rh',
      severidade: 'aviso',
      chaveDedup: `ferias_pendente_${f.id}`,
    });
  }

  // 4. Documentos vencendo em 30 dias
  const { data: docsVencendo } = await supabase
    .from('rh_documentos')
    .select('id, nome, tipo, data_expiracao, funcionario_id, rh_funcionarios(nome)')
    .gte('data_expiracao', today)
    .lte('data_expiracao', in30d);

  for (const d of docsVencendo || []) {
    const nome = d.rh_funcionarios?.nome || 'Funcionário';
    const fmtDate = new Date(d.data_expiracao + 'T12:00:00').toLocaleDateString('pt-BR');
    count += await notificar({
      modulo: 'rh',
      tipo: 'doc_vencendo',
      titulo: `Documento vencendo — ${nome}`,
      mensagem: `${d.nome} de ${nome} vence em ${fmtDate}.`,
      link: '/admin/rh',
      severidade: 'aviso',
      chaveDedup: `doc_vencendo_${d.id}`,
    });
  }

  // 5. Documentos já vencidos
  const { data: docsVencidos } = await supabase
    .from('rh_documentos')
    .select('id, nome, tipo, data_expiracao, funcionario_id, rh_funcionarios(nome)')
    .lt('data_expiracao', today)
    .not('data_expiracao', 'is', null);

  for (const d of docsVencidos || []) {
    const nome = d.rh_funcionarios?.nome || 'Funcionário';
    count += await notificar({
      modulo: 'rh',
      tipo: 'doc_vencido',
      titulo: `Documento VENCIDO — ${nome}`,
      mensagem: `${d.nome} de ${nome} está vencido!`,
      link: '/admin/rh',
      severidade: 'urgente',
      chaveDedup: `doc_vencido_${d.id}`,
    });
  }

  // 6. Experiência vencendo (CLT com 90 dias se aproximando)
  const { data: funcionarios } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, data_admissao, tipo_contrato')
    .eq('status', 'ativo')
    .eq('tipo_contrato', 'clt');

  for (const func of funcionarios || []) {
    const admissao = new Date(func.data_admissao + 'T12:00:00');
    const fim90 = new Date(admissao.getTime() + 90 * 86400000);
    const todayDate = new Date(today + 'T12:00:00');
    const diff = Math.floor((fim90.getTime() - todayDate.getTime()) / 86400000);
    if (diff >= 0 && diff <= 15) {
      const fmtDate = fim90.toLocaleDateString('pt-BR');
      count += await notificar({
        modulo: 'rh',
        tipo: 'experiencia_vencendo',
        titulo: `Experiência vencendo — ${func.nome}`,
        mensagem: `Período de experiência de ${func.nome} termina em ${fmtDate} (${diff} dias).`,
        link: '/admin/rh',
        severidade: 'aviso',
        chaveDedup: `exp_vencendo_${func.id}`,
      });
    }
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// FINANCEIRO
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesFinanceiro() {
  let count = 0;
  const today = new Date().toISOString().slice(0, 10);
  const in3d = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  // 1. Contas a pagar vencendo em 3 dias
  const { data: contasVencendo } = await supabase
    .from('fin_contas_pagar')
    .select('id, descricao, valor, data_vencimento')
    .eq('status', 'pendente')
    .gte('data_vencimento', today)
    .lte('data_vencimento', in3d);

  for (const c of contasVencendo || []) {
    const fmtDate = new Date(c.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR');
    const fmtVal = Number(c.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    count += await notificar({
      modulo: 'financeiro',
      tipo: 'conta_vencendo',
      titulo: `Conta a pagar vencendo`,
      mensagem: `${c.descricao} — ${fmtVal} vence em ${fmtDate}.`,
      link: '/admin/financeiro',
      severidade: 'aviso',
      chaveDedup: `conta_vencendo_${c.id}`,
    });
  }

  // 2. Contas vencidas
  const { data: contasVencidas } = await supabase
    .from('fin_contas_pagar')
    .select('id, descricao, valor, data_vencimento')
    .eq('status', 'pendente')
    .lt('data_vencimento', today);

  for (const c of contasVencidas || []) {
    const fmtVal = Number(c.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    count += await notificar({
      modulo: 'financeiro',
      tipo: 'conta_vencida',
      titulo: `Conta VENCIDA`,
      mensagem: `${c.descricao} — ${fmtVal} está vencida!`,
      link: '/admin/financeiro',
      severidade: 'urgente',
      chaveDedup: `conta_vencida_${c.id}`,
    });
  }

  // 3. Reembolsos pendentes há muito tempo
  const { data: reembolsos } = await supabase
    .from('fin_reembolsos')
    .select('id, descricao, valor, created_at, solicitante_id, profiles!solicitante_id(name)')
    .eq('status', 'pendente');

  for (const r of reembolsos || []) {
    const dias = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
    if (dias < 5) continue;
    const fmtVal = Number(r.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    count += await notificar({
      modulo: 'financeiro',
      tipo: 'reembolso_pendente',
      titulo: `Reembolso pendente`,
      mensagem: `${r.descricao} — ${fmtVal} de ${r.profiles?.name || 'usuário'} aguarda há ${dias} dias.`,
      link: '/admin/financeiro',
      severidade: 'aviso',
      chaveDedup: `reembolso_pendente_${r.id}`,
    });
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// LOGÍSTICA
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesLogistica() {
  let count = 0;
  const today = new Date().toISOString().slice(0, 10);

  // 1. Pedidos atrasados
  const { data: pedidos } = await supabase
    .from('log_pedidos')
    .select('id, descricao, data_prevista, status')
    .in('status', ['aguardando', 'em_transito'])
    .lt('data_prevista', today)
    .not('data_prevista', 'is', null);

  for (const p of pedidos || []) {
    count += await notificar({
      modulo: 'logistica',
      tipo: 'pedido_atrasado',
      titulo: `Pedido atrasado`,
      mensagem: `${p.descricao?.slice(0, 60) || 'Pedido'} está atrasado (previsão: ${new Date(p.data_prevista + 'T12:00:00').toLocaleDateString('pt-BR')}).`,
      link: '/admin/logistica',
      severidade: 'aviso',
      chaveDedup: `ped_atrasado_${p.id}`,
    });
  }

  // 2. Solicitações pendentes há 3+ dias
  const { data: solic } = await supabase
    .from('log_solicitacoes_compra')
    .select('id, descricao, created_at')
    .eq('status', 'pendente');

  for (const s of solic || []) {
    const dias = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000);
    if (dias < 3) continue;
    count += await notificar({
      modulo: 'logistica',
      tipo: 'solic_pendente',
      titulo: `Solicitação de compra pendente`,
      mensagem: `"${s.descricao?.slice(0, 50)}" aguarda aprovação há ${dias} dias.`,
      link: '/admin/logistica',
      severidade: 'aviso',
      chaveDedup: `solic_pendente_${s.id}`,
    });
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// PATRIMÔNIO
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesPatrimonio() {
  let count = 0;

  // 1. Bens extraviados
  const { data: extraviados } = await supabase
    .from('pat_bens')
    .select('id, nome, codigo_patrimonio')
    .eq('status', 'extraviado');

  for (const b of extraviados || []) {
    count += await notificar({
      modulo: 'patrimonio',
      tipo: 'bem_extraviado',
      titulo: `Bem extraviado`,
      mensagem: `${b.nome} (${b.codigo_patrimonio || 'sem código'}) está marcado como extraviado.`,
      link: '/admin/patrimonio',
      severidade: 'urgente',
      chaveDedup: `extraviado_${b.id}`,
    });
  }

  // 2. Inventários abertos há muito tempo
  const { data: invs } = await supabase
    .from('pat_inventarios')
    .select('id, descricao, created_at')
    .eq('status', 'em_andamento');

  for (const inv of invs || []) {
    const dias = Math.floor((Date.now() - new Date(inv.created_at).getTime()) / 86400000);
    if (dias < 15) continue;
    count += await notificar({
      modulo: 'patrimonio',
      tipo: 'inventario_aberto',
      titulo: `Inventário aberto há ${dias} dias`,
      mensagem: `${inv.descricao || 'Inventário'} está em andamento há ${dias} dias.`,
      link: '/admin/patrimonio',
      severidade: 'aviso',
      chaveDedup: `inv_aberto_${inv.id}`,
    });
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// MEMBRESIA
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesMembresia() {
  let count = 0;

  // 1. Cadastros pendentes aguardando aprovação há 1+ dia
  const { data: pendentes } = await supabase
    .from('mem_cadastros_pendentes')
    .select('id, nome, created_at')
    .eq('status', 'pendente');

  for (const c of pendentes || []) {
    const dias = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
    const severidade = dias >= 3 ? 'urgente' : dias >= 1 ? 'aviso' : 'info';
    if (dias < 1) continue;
    count += await notificar({
      modulo: 'membresia',
      tipo: 'cadastro_pendente',
      titulo: `Cadastro pendente — ${c.nome}`,
      mensagem: dias === 1
        ? `${c.nome} enviou cadastro de membresia ontem e aguarda aprovação.`
        : `${c.nome} aguarda aprovação de membresia há ${dias} dias.`,
      link: '/ministerial/membresia',
      severidade,
      chaveDedup: `cadastro_pendente_${c.id}`,
    });
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// KPIs / Online (cultos sem coleta de YouTube)
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesKpis() {
  let count = 0;
  const today = new Date().toISOString().slice(0, 10);
  // Cultos com mais de 48h sem video_id vinculado
  const limite48h = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const limite30d = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data: semVideo } = await supabase
    .from('cultos')
    .select('id, nome, data')
    .is('youtube_video_id', null)
    .lte('data', limite48h)
    .gte('data', limite30d);

  for (const c of semVideo || []) {
    const fmtDate = new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR');
    count += await notificar({
      modulo: 'kpis',
      tipo: 'culto_sem_video',
      titulo: `Culto sem vídeo do YouTube`,
      mensagem: `"${c.nome}" (${fmtDate}) está sem ID de vídeo do YouTube há mais de 48h. Sincronização não vai coletar views.`,
      link: '/kpis',
      severidade: 'aviso',
      chaveDedup: `culto_sem_video_${c.id}`,
    });
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// CUIDADOS — Acompanhamentos sem atualização há 30+ dias
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesCuidados() {
  let count = 0;

  // Busca acompanhamentos ativos
  const { data: acomps } = await supabase
    .from('cui_acompanhamentos')
    .select('id, nome, responsavel_id, membro_id, created_at, status');

  const ativos = (acomps || []).filter(a => a.status !== 'encerrado');

  // Busca último histórico por membro (mem_historico) e último atendimento por acompanhamento (cui_atendimentos)
  const membroIds = [...new Set(ativos.map(a => a.membro_id).filter(Boolean))];
  const acompIds = ativos.map(a => a.id);
  const ultimoHistPorMembro = {};
  const ultimoAtendPorAcomp = {};

  if (membroIds.length) {
    const { data: hists } = await supabase
      .from('mem_historico')
      .select('membro_id, data, created_at')
      .in('membro_id', membroIds)
      .order('data', { ascending: false });
    for (const h of hists || []) {
      if (!ultimoHistPorMembro[h.membro_id]) {
        ultimoHistPorMembro[h.membro_id] = h.data || h.created_at;
      }
    }
  }

  if (acompIds.length) {
    const { data: atends } = await supabase
      .from('cui_atendimentos')
      .select('acompanhamento_id, data, created_at')
      .in('acompanhamento_id', acompIds)
      .order('data', { ascending: false });
    for (const a of atends || []) {
      if (!ultimoAtendPorAcomp[a.acompanhamento_id]) {
        ultimoAtendPorAcomp[a.acompanhamento_id] = a.data || a.created_at;
      }
    }
  }

  for (const a of ativos) {
    const candidatos = [new Date(a.created_at).getTime()];
    const ultimoHist = a.membro_id ? ultimoHistPorMembro[a.membro_id] : null;
    if (ultimoHist) {
      const t = new Date(ultimoHist + (ultimoHist.length === 10 ? 'T12:00:00' : '')).getTime();
      if (!isNaN(t)) candidatos.push(t);
    }
    const ultimoAtend = ultimoAtendPorAcomp[a.id];
    if (ultimoAtend) {
      const t = new Date(ultimoAtend + (ultimoAtend.length === 10 ? 'T12:00:00' : '')).getTime();
      if (!isNaN(t)) candidatos.push(t);
    }
    const ultima = Math.max(...candidatos);
    const dias = Math.floor((Date.now() - ultima) / 86400000);
    if (dias < 30) continue;

    const targetIds = a.responsavel_id ? [a.responsavel_id] : null;
    count += await notificar({
      modulo: 'cuidados',
      tipo: 'acomp_inativo',
      titulo: `Acompanhamento sem atualização — ${a.nome}`,
      mensagem: `${a.nome} está em acompanhamento há ${dias} dias sem novo registro. Considere atualizar ou encerrar.`,
      link: '/ministerial/cuidados',
      severidade: dias >= 60 ? 'urgente' : 'aviso',
      chaveDedup: `acomp_inativo_${a.id}_${Math.floor(dias / 30)}`,
      targetIds,
    });
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// GRUPOS — encontros sem registro + membros sem grupo
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesGrupos() {
  let count = 0;
  const now = Date.now();

  // 1. Grupos ativos sem encontro recente (limite varia com recorrencia)
  const limites = { semanal: 14, quinzenal: 21, mensal: 45 };
  const { data: grupos } = await supabase
    .from('mem_grupos')
    .select('id, nome, recorrencia, lider_id, mem_membros!lider_id(nome)')
    .eq('ativo', true);

  if (grupos?.length) {
    const grupoIds = grupos.map(g => g.id);
    const { data: encontros } = await supabase
      .from('mem_grupo_encontros')
      .select('grupo_id, data')
      .in('grupo_id', grupoIds)
      .order('data', { ascending: false });

    // Mapeia ultimo encontro por grupo
    const ultimoPorGrupo = {};
    for (const e of encontros || []) {
      if (!ultimoPorGrupo[e.grupo_id]) ultimoPorGrupo[e.grupo_id] = e.data;
    }

    for (const g of grupos) {
      const recorrencia = g.recorrencia || 'semanal';
      const limiteDias = limites[recorrencia] || 14;
      const ultimo = ultimoPorGrupo[g.id];
      let dias;
      if (ultimo) {
        dias = Math.floor((now - new Date(ultimo + 'T12:00:00').getTime()) / 86400000);
      } else {
        dias = 999; // grupo sem nenhum encontro registrado
      }
      if (dias < limiteDias) continue;

      const lider = g.mem_membros?.nome ? ` (lider: ${g.mem_membros.nome})` : '';
      const msg = ultimo
        ? `Grupo ${g.nome}${lider} esta sem encontro registrado ha ${dias} dias.`
        : `Grupo ${g.nome}${lider} ainda nao teve encontro registrado.`;

      // Dedup em janelas de "limiteDias" para nao alertar todo dia o mesmo grupo
      const janela = Math.floor(dias / limiteDias);
      count += await notificar({
        modulo: 'grupos',
        tipo: 'grupo_sem_encontro',
        titulo: `Grupo sem encontro — ${g.nome}`,
        mensagem: msg,
        link: '/grupos',
        severidade: dias >= limiteDias * 2 ? 'urgente' : 'aviso',
        chaveDedup: `grupo_sem_encontro_${g.id}_${janela}`,
      });
    }
  }

  // 2. Membros (status = membro_ativo) sem grupo ha 90+ dias
  const noventaDias = new Date(now - 90 * 86400000).toISOString().slice(0, 10);
  const { data: membros } = await supabase
    .from('mem_membros')
    .select('id, nome, created_at, status, active')
    .eq('active', true)
    .eq('status', 'membro_ativo')
    .lte('created_at', noventaDias);

  if (membros?.length) {
    const membroIds = membros.map(m => m.id);
    const { data: participacoes } = await supabase
      .from('mem_grupo_membros')
      .select('membro_id')
      .in('membro_id', membroIds)
      .is('saiu_em', null);

    const comGrupo = new Set((participacoes || []).map(p => p.membro_id));
    const semGrupo = membros.filter(m => !comGrupo.has(m.id));

    for (const m of semGrupo) {
      const dias = Math.floor((now - new Date(m.created_at).getTime()) / 86400000);
      // Dedup mensal pra nao spammar
      const janela = Math.floor(dias / 30);
      count += await notificar({
        modulo: 'grupos',
        tipo: 'membro_sem_grupo',
        titulo: `Membro sem grupo — ${m.nome}`,
        mensagem: `${m.nome} e membro ha ${dias} dias mas ainda nao esta em nenhum grupo de conexao.`,
        link: '/grupos',
        severidade: dias >= 180 ? 'aviso' : 'info',
        chaveDedup: `membro_sem_grupo_${m.id}_${janela}`,
      });
    }
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// RITUAL MENSAL · OKR
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesRitual() {
  let count = 0;
  const hoje = new Date();
  const dia = hoje.getDate();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const periodo = `${ano}-${String(mes).padStart(2, '0')}`;

  // Pegar diretoria geral pra avisos do ritual
  const { data: diretoria } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('is_diretoria_geral', true)
    .eq('active', true);
  const targetIds = (diretoria || []).map(d => d.id);

  // KPIs em alerta este mes
  const { data: trajs } = await supabase
    .from('vw_kpi_trajetoria_atual')
    .select('kpi_id, status_trajetoria');
  const emAlerta = (trajs || []).filter(t =>
    t.status_trajetoria === 'critico' || t.status_trajetoria === 'atras'
  );
  const totalAlerta = emAlerta.length;

  if (totalAlerta === 0) return 0;

  // Quantos ja revisados
  const ids = emAlerta.map(t => t.kpi_id);
  const { data: revs } = await supabase
    .from('okr_revisoes')
    .select('kpi_id')
    .in('kpi_id', ids)
    .eq('periodo_referencia', periodo);
  const revisados = new Set((revs || []).map(r => r.kpi_id));
  const totalPendentes = totalAlerta - revisados.size;

  // ─── Aviso dia 5: ritual abre ───
  if (dia === 5 && totalPendentes > 0 && targetIds.length > 0) {
    count += await notificar({
      modulo: 'kpis',
      tipo: 'ritual_aberto',
      titulo: `Ritual Mensal — ${totalPendentes} OKR(s) aguardando revisao`,
      mensagem: `${totalAlerta} KPIs em alerta este mes (${revisados.size} ja revisados, ${totalPendentes} pendentes). Acesse o Ritual Mensal para registrar causa, decisao, responsavel e proximo passo.`,
      link: '/ritual',
      severidade: 'aviso',
      chaveDedup: `ritual_aberto_${periodo}`,
      targetIds,
    });
  }

  // ─── Aviso dia 15: meio do mes ───
  if (dia === 15 && totalPendentes > 0 && targetIds.length > 0) {
    count += await notificar({
      modulo: 'kpis',
      tipo: 'ritual_meio_mes',
      titulo: `Ritual ainda nao concluido — ${totalPendentes} pendentes`,
      mensagem: `Metade do mes ja passou. Faltam ${totalPendentes} OKRs em alerta sem revisao registrada.`,
      link: '/ritual',
      severidade: 'aviso',
      chaveDedup: `ritual_meio_${periodo}`,
      targetIds,
    });
  }

  // ─── Aviso dia 25: faltam 5 dias ───
  if (dia === 25 && totalPendentes > 0 && targetIds.length > 0) {
    count += await notificar({
      modulo: 'kpis',
      tipo: 'ritual_fim_mes',
      titulo: `Ritual fecha em 5 dias — ${totalPendentes} ainda pendentes`,
      mensagem: `O mes esta acabando e ainda ha ${totalPendentes} OKRs em alerta sem revisao. Ate o fim do mes.`,
      link: '/ritual',
      severidade: 'critico',
      chaveDedup: `ritual_fim_${periodo}`,
      targetIds,
    });
  }

  // ─── Aviso dia 30+: KPIs nao revisados viram pendencia visivel ───
  // (gerado depois pelo proprio painel — aqui so notificamos)

  // ─── Lembrete semanal (toda quarta) pra preencher KPIs semanais atrasados ───
  if (hoje.getDay() === 3) { // quarta-feira
    const { data: kpisSemanais } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, area, lider_funcionario_id')
      .eq('ativo', true)
      .eq('periodicidade', 'semanal');

    if (kpisSemanais?.length) {
      // Achar quem tem registro da semana atual
      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - hoje.getDay()); // domingo
      const inicioSemanaStr = inicioSemana.toISOString().slice(0, 10);

      const { data: regs } = await supabase
        .from('kpi_registros')
        .select('indicador_id')
        .gte('data_preenchimento', inicioSemanaStr);
      const preenchidos = new Set((regs || []).map(r => r.indicador_id));

      const pendentes = kpisSemanais.filter(k => !preenchidos.has(k.id));
      if (pendentes.length > 0) {
        const semanaKey = `${ano}-W${Math.ceil((hoje - new Date(ano, 0, 1)) / 86400000 / 7)}`;
        count += await notificar({
          modulo: 'kpis',
          tipo: 'kpis_semanais_pendentes',
          titulo: `${pendentes.length} KPI(s) semanal(is) pendente(s)`,
          mensagem: `Voce tem ${pendentes.length} indicadores semanais sem registro nesta semana. Preenche em "Meus KPIs".`,
          link: '/meus-kpis',
          severidade: 'info',
          chaveDedup: `kpis_semanais_${semanaKey}`,
        });
      }
    }
  }

  return count;
}

module.exports = { gerarTodasNotificacoes };
