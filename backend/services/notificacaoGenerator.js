const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');

/**
 * Gera todas as notificações automáticas de todos os módulos.
 * Chamada por cron (setInterval) ou manualmente.
 */
async function gerarTodasNotificacoes() {
  console.log('[Notificações] Gerando notificações automáticas...');
  let total = 0;
  // Cada gerador é isolado: um erro num módulo (ex.: tabela ausente em prod)
  // não pode abortar os demais — senão um único bug derruba a fila inteira.
  const safe = async (nome, fn) => {
    try {
      const n = await fn();
      return typeof n === 'number' ? n : 0;
    } catch (e) {
      console.error(`[Notificações] ${nome} falhou:`, e.message);
      return 0;
    }
  };
  total += await safe('RH', gerarNotificacoesRH);
  await safe('snapshotFolha', snapshotFolhaMensal); // foto mensal da folha (não gera notificação)
  total += await safe('Financeiro', gerarNotificacoesFinanceiro);
  total += await safe('AnaliseFinanceira', rodarAnaliseFinanceiraDiaria);
  total += await safe('Logistica', gerarNotificacoesLogistica);
  total += await safe('Patrimonio', gerarNotificacoesPatrimonio);
  total += await safe('Membresia', gerarNotificacoesMembresia);
  total += await safe('Kpis', gerarNotificacoesKpis);
  total += await safe('Cuidados', gerarNotificacoesCuidados);
  total += await safe('JornadaConvertidos', gerarNotificacoesJornadaConvertidos);
  // Agente de Primeiro Contato (piloto): enfileira convertidos sem contato com
  // mensagem rascunhada p/ o líder revisar e enviar (não gera notificação aqui).
  await safe('AgentePrimeiroContato', async () => {
    const { enfileirarPrimeiroContato } = require('./agentePrimeiroContato');
    return enfileirarPrimeiroContato();
  });
  total += await safe('Grupos', gerarNotificacoesGrupos);
  total += await safe('Ritual', gerarNotificacoesRitual);
  total += await safe('Solicitacoes', gerarNotificacoesSolicitacoes);
  total += await safe('Marketing', gerarNotificacoesMarketing);
  total += await safe('Online', gerarNotificacoesOnline);
  // Monitor de Automações: alerta pipelines (sync financeiro/WiFi/YouTube/etc.)
  // que pararam de atualizar. Read-only (só alerta).
  total += await safe('MonitorAutomacoes', async () => {
    const { checarEAlertar } = require('./monitorAutomacoes');
    return checarEAlertar();
  });
  // Agente de Voluntariado: escalas pendentes/recusadas dos próximos cultos +
  // no-show do último culto (só sugere/alerta).
  total += await safe('AgenteVoluntariado', async () => {
    const { alertar } = require('./agenteVoluntariado');
    return alertar();
  });
  // Agente Batismo/Next 90d: enfileira convertidos perto do prazo sem batismo/
  // Next com convite rascunhado p/ o líder revisar e enviar (não notifica aqui).
  await safe('AgenteBatismoNext', async () => {
    const { enfileirar } = require('./agenteBatismoNext');
    return enfileirar();
  });
  total += await safe('Governanca', gerarNotificacoesGovernanca);
  total += await safe('TarefasPessoais', gerarNotificacoesTarefasPessoais);
  total += await safe('Kids', gerarNotificacoesKids);
  console.log(`[Notificações] ${total} notificação(ões) gerada(s).`);
  return total;
}

// ── Tarefas pessoais · prazo (vence hoje / atrasou) ─────────────────────────
// Sempre direto pro DONO (targetIds) — não passa pelas regras de módulo.
// Dedup: "vence hoje" 1x por tarefa/data; "atrasada" 1x por tarefa.
async function gerarNotificacoesTarefasPessoais() {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  let count = 0;

  const { data: pendentes } = await supabase
    .from('tarefas_pessoais')
    .select('id, titulo, data, created_by')
    .eq('done', false)
    .not('data', 'is', null)
    .not('created_by', 'is', null)
    .lte('data', hoje)
    .limit(2000);

  for (const t of pendentes || []) {
    const venceHoje = t.data === hoje;
    count += await notificar({
      modulo: 'tarefas',
      tipo: venceHoje ? 'tarefa_vence_hoje' : 'tarefa_atrasada',
      titulo: venceHoje ? 'Tarefa vence hoje' : 'Tarefa atrasada',
      mensagem: venceHoje
        ? `"${t.titulo}" vence hoje.`
        : `"${t.titulo}" venceu em ${new Date(`${t.data}T12:00:00`).toLocaleDateString('pt-BR')}.`,
      link: '/tarefas',
      severidade: venceHoje ? 'aviso' : 'urgente',
      chaveDedup: venceHoje ? `tarefa_hoje_${t.id}_${t.data}` : `tarefa_atrasada_${t.id}`,
      targetIds: [t.created_by],
    });
  }
  return count;
}

// Governança · reunião da diretoria que já passou e está sem ata registrada
// (lembra de "recolher as atas"). Dedup por reunião/dia.
async function gerarNotificacoesGovernanca() {
  let count = 0;
  const hoje = new Date().toISOString().slice(0, 10);
  const ha60d = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  const { data: reunioes, error } = await supabase
    .from('governance_meetings')
    .select('id, date, status, ata, governance_meeting_types(nome, sigla)')
    .is('deleted_at', null)
    .lt('date', hoje)
    .gte('date', ha60d)
    .neq('status', 'cancelada')
    .neq('status', 'adiada');
  if (error) {
    if (!String(error.message || '').includes('does not exist')) {
      console.warn('[Governanca notify] erro:', error.message);
    }
    return 0;
  }

  for (const r of reunioes || []) {
    if (r.ata && r.ata.trim().length) continue; // já tem ata
    const tipo = r.governance_meeting_types || {};
    const nome = tipo.nome || 'Reunião';
    const dataBr = String(r.date).split('-').reverse().join('/');
    await notificar({
      modulo: 'governanca',
      tipo: 'ata_pendente',
      titulo: `Ata pendente · ${nome}`,
      mensagem: `A reunião ${nome}${tipo.sigla ? ` (${tipo.sigla})` : ''} de ${dataBr} ainda está sem ata registrada.`,
      link: '/governanca',
      severidade: 'info',
      chaveDedup: `gov_ata_${r.id}_${hoje}`,
    });
    count++;
  }
  return count;
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
    .select('id, funcionario_id, tipo, data_inicio, data_fim, rh_funcionarios!funcionario_id(nome)')
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
    .select('id, funcionario_id, tipo, data_inicio, rh_funcionarios!funcionario_id(nome)')
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
    .select('id, funcionario_id, created_at, rh_funcionarios!funcionario_id(nome)')
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
    .ilike('tipo_contrato', 'clt');  // case-insensitive · os dados estão em 'CLT' (uppercase)

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

  // 7. Reconcilia status de afastamento: quem estava em férias/licença e o período
  // já acabou volta para 'ativo'. Só RETORNA (a ida pra férias/licença é setada na
  // aprovação) e NUNCA toca 'inativo' (desligados). Corrige o status que ficava preso.
  const { data: emAfastamento } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, status')
    .in('status', ['ferias', 'licenca']);
  if (emAfastamento && emAfastamento.length) {
    const { data: ativasHoje } = await supabase
      .from('rh_ferias_licencas')
      .select('funcionario_id')
      .eq('status', 'aprovado')
      .lte('data_inicio', today)
      .gte('data_fim', today);
    const comPeriodoAtivo = new Set((ativasHoje || []).map(f => f.funcionario_id));
    const voltaram = emAfastamento.filter(f => !comPeriodoAtivo.has(f.id));
    if (voltaram.length) {
      await supabase.from('rh_funcionarios').update({ status: 'ativo' }).in('id', voltaram.map(f => f.id));
      // Avisa o RH (líder/coordenação) que o afastamento terminou e o status voltou
      // automaticamente para Ativo — pra conferir retorno efetivo do colaborador.
      for (const f of voltaram) {
        const oQue = f.status === 'licenca' ? 'licença' : 'férias';
        count += await notificar({
          modulo: 'rh',
          tipo: 'afastamento_encerrado',
          titulo: `Retorno de ${oQue} — ${f.nome}`,
          mensagem: `O período de ${oQue} de ${f.nome} terminou. O status foi atualizado automaticamente para Ativo.`,
          link: '/admin/rh',
          severidade: 'info',
          chaveDedup: `afastamento_encerrado_${f.id}_${today}`,
        });
      }
    }
  }

  return count;
}

// Foto mensal da folha (caminho B · exatidão daqui pra frente). UPSERT do mês
// corrente todo dia → o mês atual reflete "agora"; meses passados ficam
// congelados no último valor do mês. Alimenta o gráfico de folha do dashboard.
async function snapshotFolhaMensal() {
  try {
    const mes = new Date().toISOString().slice(0, 8) + '01'; // YYYY-MM-01
    const { data: ativos } = await supabase
      .from('rh_funcionarios')
      .select('salario, custo_total_mensal')
      .eq('status', 'ativo')
      .is('deleted_at', null);
    const totalSalarios = (ativos || []).reduce((s, f) => s + Number(f.salario || 0), 0);
    const totalCusto = (ativos || []).reduce((s, f) => s + Number(f.custo_total_mensal || f.salario || 0), 0);
    await supabase.from('rh_folha_snapshots').upsert(
      { mes, total_salarios: totalSalarios, total_custo: totalCusto, headcount: (ativos || []).length, atualizado_em: new Date().toISOString() },
      { onConflict: 'mes' }
    );
  } catch (e) {
    console.error('[RH] snapshot folha:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// FINANCEIRO
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesFinanceiro() {
  let count = 0;
  const today = new Date().toISOString().slice(0, 10);
  const in7d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDia = (d) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');

  // 1. Contas a pagar vencendo nos próximos 7 dias — 1 alerta agregado
  //    (evita inundar o sino com uma notificação por conta).
  const { data: contasVencendo } = await supabase
    .from('fin_contas_pagar')
    .select('id, descricao, valor, data_vencimento')
    .eq('status', 'pendente')
    .gte('data_vencimento', today)
    .lte('data_vencimento', in7d)
    .order('data_vencimento', { ascending: true });

  if ((contasVencendo || []).length) {
    const totalV = contasVencendo.reduce((s, c) => s + Number(c.valor || 0), 0);
    const prox = contasVencendo[0];
    count += await notificar({
      modulo: 'financeiro',
      tipo: 'conta_vencendo',
      titulo: contasVencendo.length === 1
        ? 'Conta a pagar vencendo'
        : `${contasVencendo.length} contas a pagar vencem em 7 dias`,
      mensagem: contasVencendo.length === 1
        ? `${prox.descricao} — ${fmtBRL(prox.valor)} vence em ${fmtDia(prox.data_vencimento)}.`
        : `${contasVencendo.length} contas vencem nos próximos 7 dias · total ${fmtBRL(totalV)}. Próxima: ${prox.descricao} em ${fmtDia(prox.data_vencimento)}.`,
      link: '/admin/financeiro',
      severidade: 'aviso',
      chaveDedup: `contas_vencendo_${today}`,
    });
  }

  // 2. Contas vencidas — 1 alerta agregado (re-alerta a cada dia até quitar)
  const { data: contasVencidas } = await supabase
    .from('fin_contas_pagar')
    .select('id, descricao, valor, data_vencimento')
    .eq('status', 'pendente')
    .lt('data_vencimento', today)
    .order('data_vencimento', { ascending: true });

  if ((contasVencidas || []).length) {
    const totalVenc = contasVencidas.reduce((s, c) => s + Number(c.valor || 0), 0);
    const antiga = contasVencidas[0];
    count += await notificar({
      modulo: 'financeiro',
      tipo: 'conta_vencida',
      titulo: contasVencidas.length === 1
        ? 'Conta a pagar VENCIDA'
        : `${contasVencidas.length} contas a pagar VENCIDAS`,
      mensagem: contasVencidas.length === 1
        ? `${antiga.descricao} — ${fmtBRL(antiga.valor)} está vencida (desde ${fmtDia(antiga.data_vencimento)}).`
        : `${contasVencidas.length} contas vencidas · total ${fmtBRL(totalVenc)}. A mais antiga: ${antiga.descricao} desde ${fmtDia(antiga.data_vencimento)}.`,
      link: '/admin/financeiro',
      severidade: 'urgente',
      chaveDedup: `contas_vencidas_${today}`,
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

  // 4. Fila de classificação acumulada (PR B · estrutura fiscal)
  // Tabela pode não existir em ambientes antigos · try/catch silencioso
  try {
    const { count: filaCount } = await supabase
      .from('fin_fila_classificacao')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pendente');

    const hoje = new Date().toISOString().slice(0, 10);
    if (filaCount && filaCount >= 20) {
      count += await notificar({
        modulo: 'financeiro',
        tipo: 'fila_classificacao_alta',
        titulo: `Fila de classificação com ${filaCount} itens`,
        mensagem: `Ha ${filaCount} lancamentos aguardando classificação. Revise em /admin/financeiro -> Fila de classificação.`,
        link: '/admin/financeiro',
        severidade: filaCount >= 50 ? 'urgente' : 'aviso',
        chaveDedup: `fila_classificacao_alta_${hoje}`,
      });
    }

    // 5. Lancamentos brutos pendentes ha muito tempo (>7d sem classificação)
    const seteDiasAtras = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: brutosVelhos } = await supabase
      .from('fin_lancamentos_brutos')
      .select('id', { count: 'exact', head: true })
      .eq('ja_classificado', false)
      .lt('created_at', seteDiasAtras);

    if (brutosVelhos && brutosVelhos > 0) {
      count += await notificar({
        modulo: 'financeiro',
        tipo: 'lancamentos_pendentes_antigos',
        titulo: `${brutosVelhos} lancamentos sem classificar ha >7 dias`,
        mensagem: `Ha ${brutosVelhos} transacoes importadas ha mais de 7 dias ainda sem classificação. Verifique a fila.`,
        link: '/admin/financeiro',
        severidade: 'aviso',
        chaveDedup: `lanc_pendentes_antigos_${hoje}`,
      });
    }

    // 6. Sem upload de extrato ha 10+ dias (alerta operacional)
    const { data: ultimoUpload } = await supabase
      .from('fin_uploads')
      .select('created_at, tipo')
      .eq('status', 'concluido')
      .order('created_at', { ascending: false })
      .limit(1);

    if (ultimoUpload && ultimoUpload[0]) {
      const diasSemUpload = Math.floor((Date.now() - new Date(ultimoUpload[0].created_at).getTime()) / 86400000);
      if (diasSemUpload >= 10) {
        count += await notificar({
          modulo: 'financeiro',
          tipo: 'sem_upload_recente',
          titulo: `Sem importar extrato ha ${diasSemUpload} dias`,
          mensagem: `Último upload foi ha ${diasSemUpload} dias. Considere importar o extrato mais recente.`,
          link: '/admin/financeiro',
          severidade: 'aviso',
          chaveDedup: `sem_upload_${hoje}`,
        });
      }
    }
  } catch (e) {
    // Tabelas da PR B podem não existir em ambientes antigos · ignora
    if (!String(e.message || '').includes('does not exist')) {
      console.warn('[NOTIF-FIN] Erro nas regras PR B:', e.message);
    }
  }

  // Notas fiscais de compras aguardando lançamento há 3+ dias
  try {
    const limite = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: notasParadas } = await supabase
      .from('log_notas_fiscais')
      .select('id', { count: 'exact' })
      .eq('status', 'enviada_financeiro')
      .lt('enviada_financeiro_em', limite);

    if (notasParadas?.length) {
      const n = notasParadas.length;
      count += await notificar({
        modulo: 'financeiro',
        tipo: 'nf_compra_parada',
        titulo: 'Notas fiscais de compras aguardando lançamento',
        mensagem: `${n} nota${n > 1 ? 's' : ''} fiscal${n > 1 ? 'is' : ''} de compras aguarda${n > 1 ? 'm' : ''} lançamento há mais de 3 dias.`,
        link: '/admin/financeiro',
        severidade: 'aviso',
        chaveDedup: `nf_paradas_${today}`,
      });
    }
  } catch (e) {
    if (!String(e.message || '').includes('does not exist')) {
      console.warn('[NOTIF-FIN] Erro nas notas de compras:', e.message);
    }
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

  // 2. Fila de identidade (conflitos de CPF · identidade_pendencias) com itens
  //    abertos → 1 resumo por dia enquanto a fila não zera. Tolera a tabela
  //    ausente (migration 20260716150000 pode não ter sido aplicada ainda).
  try {
    const { count: abertas, error } = await supabase
      .from('identidade_pendencias')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pendente');
    if (!error && (abertas || 0) > 0) {
      const hoje = new Date().toISOString().slice(0, 10);
      count += await notificar({
        modulo: 'membresia',
        tipo: 'identidade_pendencias',
        titulo: `Fila de identidade — ${abertas} pendência${abertas > 1 ? 's' : ''} de CPF`,
        mensagem: `Há ${abertas} conflito${abertas > 1 ? 's' : ''} de identidade aguardando triagem (CPF a confirmar, duplicatas prováveis, vínculos divergentes) em Entradas > Identidade.`,
        link: '/next-batismo',
        severidade: abertas >= 50 ? 'aviso' : 'info',
        chaveDedup: `identidade_pendencias_${hoje}`,
      });
    }
  } catch { /* tabela ausente · silencioso */ }

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
// JORNADA NOVOS CONVERTIDOS — contato pastoral em até 3 dias
// Líder da área cobra no 2º dia · escala pro Marcelo (Cuidados) no 3º+.
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesJornadaConvertidos() {
  let count = 0;
  const DIA = 86400000;
  const hojeStr = new Date().toISOString().slice(0, 10);
  const desde = new Date(Date.now() - 30 * DIA).toISOString().slice(0, 10);

  const { data: convs } = await supabase
    .from('cui_convertidos')
    .select('id, nome, data_culto, area')
    .is('deleted_at', null)
    .is('primeiro_contato_em', null)
    .gte('data_culto', desde);

  const ehArea = (a) => ['ami', 'bridge', 'online'].includes(a);
  const moduloArea = (a) => ehArea(a) ? a : 'cuidados';
  const linkArea = (a) => ehArea(a) ? `/${a}` : '/ministerial/cuidados?tab=primeiros-passos';

  for (const c of convs || []) {
    const dias = Math.floor((Date.now() - new Date(c.data_culto + 'T12:00:00').getTime()) / DIA);
    if (dias < 2) continue;
    const area = c.area || 'sede';

    // 2º dia: líder da área
    count += await notificar({
      modulo: moduloArea(area),
      tipo: 'convertido_sem_contato',
      titulo: `Sem contato pastoral: ${c.nome}`,
      mensagem: `${c.nome} se converteu há ${dias} dias e ainda não recebeu contato. Faça o contato e marque o encontro (meta: 3 dias).`,
      link: linkArea(area),
      severidade: dias > 3 ? 'warning' : 'info',
      chaveDedup: `jornada_contato_${c.id}_${hojeStr}`,
    });

    // 3º+ dia: escala pro Marcelo (Cuidados) cobrar o líder
    if (dias > 3 && moduloArea(area) !== 'cuidados') {
      count += await notificar({
        modulo: 'cuidados',
        tipo: 'convertido_sem_contato_atrasado',
        titulo: `Atrasado (${area}): ${c.nome}`,
        mensagem: `${c.nome} (${area}) está há ${dias} dias sem contato pastoral — passou do prazo de 3 dias. Cobrar o líder da área.`,
        link: '/ministerial/cuidados?tab=primeiros-passos',
        severidade: 'warning',
        chaveDedup: `jornada_contato_esc_${c.id}_${hojeStr}`,
      });
    }
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

    // Mapeia último encontro por grupo
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
        : `Grupo ${g.nome}${lider} ainda não teve encontro registrado.`;

      // Dedup em janelas de "limiteDias" para não alertar todo dia o mesmo grupo
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
      // Dedup mensal pra não spammar
      const janela = Math.floor(dias / 30);
      count += await notificar({
        modulo: 'grupos',
        tipo: 'membro_sem_grupo',
        titulo: `Membro sem grupo — ${m.nome}`,
        mensagem: `${m.nome} e membro ha ${dias} dias mas ainda não esta em nenhum grupo de conexão.`,
        link: '/grupos',
        severidade: dias >= 180 ? 'aviso' : 'info',
        chaveDedup: `membro_sem_grupo_${m.id}_${janela}`,
      });
    }
  }

  // 3. Grupos sem visita de supervisão há 60+ dias (agregado · 1 notificação
  //    semanal pro módulo, não 1 por grupo — alimenta a aba Visitas do /grupos)
  const { data: supGrupos } = await supabase
    .from('vw_grupos_supervisao')
    .select('id, nome, ultima_visita');

  if (supGrupos?.length) {
    const semVisita = supGrupos.filter(g => {
      if (!g.ultima_visita) return true;
      const dias = Math.floor((now - new Date(g.ultima_visita + 'T12:00:00').getTime()) / 86400000);
      return dias > 60;
    });
    if (semVisita.length) {
      const nomes = semVisita.slice(0, 5).map(g => g.nome).join(', ');
      const resto = semVisita.length > 5 ? ` e mais ${semVisita.length - 5}` : '';
      const semana = Math.floor(now / (7 * 86400000)); // dedup semanal
      count += await notificar({
        modulo: 'grupos',
        tipo: 'grupos_sem_visita',
        titulo: `${semVisita.length} grupo${semVisita.length !== 1 ? 's' : ''} sem visita há mais de 2 meses`,
        mensagem: `Sem visita de supervisão há mais de 60 dias: ${nomes}${resto}. Agende as visitas na aba Visitas de Grupos.`,
        link: '/grupos?tab=visitas',
        severidade: 'aviso',
        chaveDedup: `grupos_sem_visita_w${semana}`,
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

  // KPIs em alerta este mês
  const { data: trajs } = await supabase
    .from('vw_kpi_trajetoria_atual')
    .select('kpi_id, status_trajetoria');
  const emAlerta = (trajs || []).filter(t =>
    t.status_trajetoria === 'critico' || t.status_trajetoria === 'atras'
  );
  const totalAlerta = emAlerta.length;

  if (totalAlerta === 0) return 0;

  // Quantos já revisados
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
      mensagem: `${totalAlerta} KPIs em alerta este mês (${revisados.size} já revisados, ${totalPendentes} pendentes). Acesse o Ritual Mensal para registrar causa, decisão, responsável e próximo passo.`,
      link: '/ritual',
      severidade: 'aviso',
      chaveDedup: `ritual_aberto_${periodo}`,
      targetIds,
    });
  }

  // ─── Aviso dia 15: meio do mês ───
  if (dia === 15 && totalPendentes > 0 && targetIds.length > 0) {
    count += await notificar({
      modulo: 'kpis',
      tipo: 'ritual_meio_mes',
      titulo: `Ritual ainda não concluído — ${totalPendentes} pendentes`,
      mensagem: `Metade do mês já passou. Faltam ${totalPendentes} OKRs em alerta sem revisão registrada.`,
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
      mensagem: `O mês esta acabando e ainda ha ${totalPendentes} OKRs em alerta sem revisão. Até o fim do mês.`,
      link: '/ritual',
      severidade: 'critico',
      chaveDedup: `ritual_fim_${periodo}`,
      targetIds,
    });
  }

  // ─── Aviso dia 30+: KPIs não revisados viram pendência visível ───
  // (gerado depois pelo próprio painel — aqui so notificamos)

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
          mensagem: `Você tem ${pendentes.length} indicadores semanais sem registro nesta semana. Preenche em "Meus KPIs".`,
          link: '/meus-kpis',
          severidade: 'info',
          chaveDedup: `kpis_semanais_${semanaKey}`,
        });
      }
    }
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// SOLICITAÇÕES · lembrete de avaliação NPS pós-conclusão
// Solicitação concluída ha >=24h e <=14d sem nps_nota · pede avaliação.
// Sem isso os KPIs ADM-*-Q (NPS Gestão+Criativo · 11 KPIs) ficam zerados.
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesSolicitacoes() {
  let count = 0;
  const agora = new Date();
  const ha24h = new Date(agora.getTime() - 24 * 3600 * 1000).toISOString();
  const ha14d = new Date(agora.getTime() - 14 * 86400 * 1000).toISOString();

  const { data: concluidas } = await supabase
    .from('solicitacoes')
    .select('id, titulo, solicitante_id, concluido_em, categoria')
    .eq('status', 'concluido')
    .is('nps_nota', null)
    .not('solicitante_id', 'is', null)
    .gte('concluido_em', ha14d)
    .lte('concluido_em', ha24h);

  for (const s of concluidas || []) {
    // Lembrete único por solicitação · se ignorar, o badge "Avalie" na tela cobre o resto
    count += await notificar({
      modulo: 'administrativo',
      tipo: 'solicitacao_avaliar_lembrete',
      titulo: `Lembrete: avalie "${s.titulo}"`,
      mensagem: 'Sua solicitação foi concluída · 30 segundos pra avaliar ajudam o time a melhorar.',
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solic_avaliar_${s.id}`,
      targetIds: [s.solicitante_id],
    });
  }

  // Aprovação hierarquica · lembrete pro diretor de origem com fila parada
  // ≥24h (Spec 001). Antes da escalacao automática (Fase 11), o ping diario
  // chama atenção da fila travada · 1 lembrete por solicitação por dia.
  const { data: aguardandoOrigem } = await supabase
    .from('solicitacoes')
    .select('id, titulo, aprovacao_origem_diretor_id, created_at')
    .eq('aprovacao_origem_status', 'pendente')
    .not('aprovacao_origem_diretor_id', 'is', null)
    .lte('created_at', ha24h)
    .is('deleted_at', null);

  const hojeKey = agora.toISOString().slice(0, 10);
  for (const s of aguardandoOrigem || []) {
    count += await notificar({
      modulo: 'administrativo',
      tipo: 'solicitacao_aprovacao_origem_lembrete',
      titulo: `Aguardando sua aprovação: ${s.titulo}`,
      mensagem: 'Solicitação do seu setor parada há mais de 24h aguardando sua decisão.',
      link: '/solicitacoes?aba=aprovar',
      severidade: 'alta',
      chaveDedup: `solic_aprov_origem_lembrete_${s.id}_${hojeKey}`,
      targetIds: [s.aprovacao_origem_diretor_id],
    });
  }

  // Fluxo BPMN (2026-07-02) · julgamento de mérito parado ≥48h → lembrete
  // diário aos aprovadores de mérito (Pastor Presidente). Mesmo padrão do
  // lembrete de origem (dedup por solicitação + dia). Best-effort: coluna/
  // tabela ausente antes da migration → só pula este bloco.
  try {
    const ha48h = new Date(agora.getTime() - 48 * 3600 * 1000).toISOString();
    const { data: aguardandoMerito, error: errMerito } = await supabase
      .from('solicitacoes')
      .select('id, titulo, updated_at')
      .eq('status', 'aguardando_merito')
      .lte('updated_at', ha48h)
      .is('deleted_at', null);
    if (!errMerito && (aguardandoMerito || []).length) {
      let aprovadoresMerito = [];
      const { data: aps, error: errAps } = await supabase
        .from('solicitacoes_merito_aprovadores')
        .select('profile_id');
      if (!errAps) aprovadoresMerito = (aps || []).map(a => a.profile_id).filter(Boolean);
      if (aprovadoresMerito.length) {
        for (const s of aguardandoMerito) {
          count += await notificar({
            modulo: 'administrativo',
            tipo: 'solicitacao_merito_lembrete',
            titulo: `Aguardando seu julgamento de mérito: ${s.titulo}`,
            mensagem: 'Solicitação parada há mais de 48h aguardando o julgamento de mérito.',
            link: '/solicitacoes?aba=aprovar',
            severidade: 'alta',
            chaveDedup: `solic_merito_lembrete_${s.id}_${hojeKey}`,
            targetIds: aprovadoresMerito,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[Solicitacoes notify] merito:', e.message);
  }

  // Fluxo BPMN (2026-07-02) · sobrestadas: data de revisão vencida OU 30+ dias
  // sem revisão definida → alerta diário pro módulo dono do portão (financeiro
  // quando estava na aprovação financeira · administrativo no resto).
  try {
    const { data: sobrestadas, error: errSob } = await supabase
      .from('solicitacoes')
      .select('id, titulo, sobrestada_em, sobrestada_revisao, sobrestada_status_anterior')
      .eq('status', 'sobrestada')
      .is('deleted_at', null);
    if (!errSob) {
      const hojeData = hojeKey;
      const limite30d = agora.getTime() - 30 * 86400 * 1000;
      for (const s of sobrestadas || []) {
        const revisaoVencida = s.sobrestada_revisao && String(s.sobrestada_revisao) <= hojeData;
        const semRevisao30d = !s.sobrestada_revisao && s.sobrestada_em
          && new Date(s.sobrestada_em).getTime() <= limite30d;
        if (!revisaoVencida && !semRevisao30d) continue;
        const modulo = s.sobrestada_status_anterior === 'aguardando_aprovacao_financeira'
          ? 'financeiro' : 'administrativo';
        count += await notificar({
          modulo,
          tipo: 'solicitacao_sobrestada_revisao',
          titulo: `Sobrestada aguardando revisão: ${s.titulo}`,
          mensagem: revisaoVencida
            ? `A data de revisão do sobrestamento chegou (${String(s.sobrestada_revisao).split('-').reverse().join('/')}) · decida: retomar ou manter em espera.`
            : 'Solicitação sobrestada há mais de 30 dias sem data de revisão definida · decida: retomar ou definir um prazo.',
          link: '/solicitacoes',
          severidade: 'alta',
          chaveDedup: `solic_sobrestada_revisao_${s.id}_${hojeKey}`,
        });
      }
    }
  } catch (e) {
    console.warn('[Solicitacoes notify] sobrestadas:', e.message);
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// MARKETING · cards aguardando solicitante ha >=24h (Spec 014)
// Cron diario · lembra solicitante a aprovar/sugerir revisão.
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesMarketing() {
  let count = 0;
  const agora = new Date();
  const ha24h = new Date(agora.getTime() - 24 * 3600 * 1000).toISOString();
  const hojeKey = agora.toISOString().slice(0, 10);

  const { data: cards, error } = await supabase
    .from('marketing_kanban_cards')
    .select('id, titulo, solicitacao_id, estado, estado_atualizado_em')
    .eq('estado', 'aguardando_solicitante')
    .is('deleted_at', null)
    .lte('estado_atualizado_em', ha24h);

  if (error) {
    if (!String(error.message || '').includes('does not exist')) {
      console.warn('[Marketing notify] erro:', error.message);
    }
    return 0;
  }

  for (const c of cards || []) {
    if (!c.solicitacao_id) continue;
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('solicitante_id, titulo')
      .eq('id', c.solicitacao_id)
      .maybeSingle();
    if (!sol?.solicitante_id) continue;

    count += await notificar({
      modulo: 'marketing',
      tipo: 'marketing_aguardando_solicitante_lembrete',
      titulo: `Aguardando sua revisão: ${sol.titulo}`,
      mensagem: 'Preview Marketing parado há mais de 24h aguardando sua aprovação ou sugestão de revisão.',
      link: '/solicitacoes',
      severidade: 'alta',
      chaveDedup: `marketing_aguardando_lembrete_${c.id}_${hojeKey}`,
      targetIds: [sol.solicitante_id],
    });
  }

  return count;
}

// ═══════════════════════════════════════════════════════════
// ONLINE · BLINDAGEM da coleta automática do YouTube
// Alerta quando: (a) o token OAuth caiu/esta com erro · (b) um culto online
// já encerrado não recebeu as metricas automáticas (pico/DS/video_id).
// Fonte do diagnóstico: collectors.verificarColetaOnline().
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesOnline() {
  let count = 0;
  const hojeKey = new Date().toISOString().slice(0, 10);
  try {
    const { verificarColetaOnline } = require('./onlineCollectors');
    const r = await verificarColetaOnline();

    // 1. Token OAuth caiu por completo · falha critica (toda a coleta para)
    if (!r.token.conectado) {
      count += await notificar({
        modulo: 'online',
        tipo: 'online_oauth_desconectado',
        titulo: 'YouTube desconectado · coleta online parada',
        mensagem: 'O canal do YouTube não esta conectado (sem token OAuth valido). Pico, views e demais metricas dos cultos online NÃO estão sendo coletadas. Reconecte em /online > Conectar canal.',
        link: '/online',
        severidade: 'alta',
        chaveDedup: `online_oauth_desconectado_${hojeKey}`,
      });
    } else if (r.token.degradado) {
      // 2. Token conectado mas com erro recente · degradado
      count += await notificar({
        modulo: 'online',
        tipo: 'online_oauth_erro',
        titulo: 'Coleta online com erro recente',
        mensagem: `A última coleta do YouTube reportou erro: ${String(r.token.last_error || '').slice(0, 180)}. Verifique a conexão em /online.`,
        link: '/online',
        severidade: 'media',
        chaveDedup: `online_oauth_erro_${hojeKey}`,
      });
    }

    // 3. Cultos online encerrados sem metricas automáticas
    for (const c of r.problemas || []) {
      count += await notificar({
        modulo: 'online',
        tipo: 'online_culto_sem_metricas',
        titulo: `Culto online sem dados: ${c.nome} (${c.data})`,
        mensagem: `A coleta automática não preencheu: ${c.faltando.join(', ')}. Pode ser falha do token OAuth, live não detectada ou latencia do YouTube. Verifique em /online.`,
        link: '/online',
        severidade: 'media',
        chaveDedup: `online_culto_sem_metricas_${c.id}_${hojeKey}`,
      });
    }

    // 4. Lembrete · decisões online nunca confirmadas (form/manual não tocaram).
    //    Roteia pra integração (quem lanca decisões) · severidade baixa.
    for (const c of r.decisoesPendentes || []) {
      const dica = c.chat_detectou > 0
        ? ` O chat ao vivo detectou ~${c.chat_detectou} possível(is) decisão(oes) · confirme o número real.`
        : '';
      count += await notificar({
        modulo: 'integracao',
        tipo: 'online_decisoes_a_confirmar',
        titulo: `Confirme as decisões online: ${c.nome} (${c.data})`,
        mensagem: `O culto online de ${c.data} ainda não teve as decisoes/conversoes online confirmadas.${dica} Lance em /integracao (aba Cultos), mesmo que tenha sido zero.`,
        link: '/integracao',
        severidade: 'baixa',
        chaveDedup: `online_decisoes_a_confirmar_${c.id}_${hojeKey}`,
      });
    }
  } catch (e) {
    if (!String(e.message || '').includes('does not exist')) {
      console.warn('[Online notify] Erro:', e.message);
    }
  }
  return count;
}

// ═══════════════════════════════════════════════════════════
// ANALISE FINANCEIRA DIARIA (H · alertas + forecast)
// ═══════════════════════════════════════════════════════════
async function rodarAnaliseFinanceiraDiaria() {
  try {
    const { rodarAnaliseDiaria } = require('./analiseFinanceira');
    const r = await rodarAnaliseDiaria();
    // Conta criados nao-null
    let count = 0;
    if (r.queda) count++;
    if (Array.isArray(r.sumidos)) count += r.sumidos.length;
    if (Array.isArray(r.atrasadas)) count += r.atrasadas.length;
    if (r.pico) count++;
    return count;
  } catch (e) {
    // Tabelas ainda não existem em ambientes antigos · ignora
    if (!String(e.message || '').includes('does not exist')) {
      console.warn('[Analise financeira] Erro:', e.message);
    }
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════
// KIDS — criança ativa faltando N cultos seguidos (Mari/Milena)
// ═══════════════════════════════════════════════════════════
async function gerarNotificacoesKids() {
  let count = 0;
  const { data: ausentes, error } = await supabase
    .rpc('fn_kids_ausentes_consecutivos', { p_min: 3 });
  if (error) { console.error('[Notificações] Kids rpc:', error.message); return 0; }

  for (const c of ausentes || []) {
    const ult = c.ultima_presenca
      ? new Date(c.ultima_presenca + 'T12:00:00').toLocaleDateString('pt-BR')
      : '—';
    count += await notificar({
      modulo: 'kids',
      tipo: 'kids_crianca_ausente',
      titulo: `Criança faltando: ${c.nome}`,
      mensagem: `${c.nome} está há ${c.cultos_perdidos} cultos seguidos sem check-in no Kids (última presença em ${ult}). Vale um contato com a família.`,
      link: '/ministerial/totem-kids/criancas',
      severidade: 'aviso',
      // 1 alerta por streak (ancorado na última presença); se voltar e sumir de
      // novo, a última presença muda → novo alerta.
      chaveDedup: `kids_ausente_${c.crianca_id}_${c.ultima_presenca}`,
    });
  }
  return count;
}

module.exports = { gerarTodasNotificacoes };
