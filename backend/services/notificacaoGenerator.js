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

module.exports = { gerarTodasNotificacoes };
