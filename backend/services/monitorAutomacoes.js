// ============================================================================
// Monitor de Automações (agente · saúde dos pipelines)
// ============================================================================
// Os pipelines pesados do sistema (sync financeiro, WiFi, YouTube, telemetria
// do app, etc.) rodam sozinhos. Este agente NÃO os reconstrói — ele só vigia a
// RECÊNCIA de cada um e alerta quando algo que deveria atualizar parou. É
// read-only/alerta (não muta dado) → pode ser autônomo. Reusa notificar().
// ============================================================================

const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

const HORA = 3600000;

// Catálogo de pipelines vigiados. `maxHoras` = quanto tempo SEM novo registro
// já é suspeito (folga sobre a periodicidade esperada). Fácil de estender.
const PIPELINES = [
  { chave: 'fin_sync',     label: 'Sincronização financeira',     tabela: 'fin_transacoes',          coluna: 'created_at', maxHoras: 48,  modulo: 'financeiro' },
  { chave: 'contribuicoes',label: 'Contribuições (dízimos/ofertas)',tabela: 'mem_contribuicoes',      coluna: 'created_at', maxHoras: 72,  modulo: 'financeiro' },
  { chave: 'wifi',         label: 'Captura de visitantes (WiFi)',  tabela: 'wifi_visitantes',         coluna: 'created_at', maxHoras: 120, modulo: 'integracao' },
  { chave: 'youtube_snap', label: 'Snapshot do canal (YouTube)',   tabela: 'online_canal_snapshot',   coluna: 'created_at', maxHoras: 48,  modulo: 'online' },
  { chave: 'youtube_vids', label: 'Vídeos do YouTube',             tabela: 'online_videos',           coluna: 'created_at', maxHoras: 72,  modulo: 'online' },
  { chave: 'app_telemetria',label: 'Telemetria do app',            tabela: 'app_eventos',             coluna: 'created_at', maxHoras: 72,  modulo: 'dashboard' },
];

// Lê a recência (MAX da coluna) de um pipeline. Degrada gracioso se a tabela/
// coluna não existir (retorna status 'desconhecido', sem quebrar o cron).
async function recencia(p) {
  try {
    const { data, error } = await supabase
      .from(p.tabela)
      .select(p.coluna)
      .order(p.coluna, { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ...p, status: 'desconhecido', motivo: error.message, ultima: null, horas: null };
    const ultima = data?.[p.coluna] || null;
    if (!ultima) return { ...p, status: 'desconhecido', ultima: null, horas: null };
    const horas = Math.floor((Date.now() - new Date(ultima).getTime()) / HORA);
    let status = 'ok';
    if (horas > p.maxHoras * 2) status = 'parado';
    else if (horas > p.maxHoras) status = 'atrasado';
    return { ...p, status, ultima, horas };
  } catch (e) {
    return { ...p, status: 'desconhecido', motivo: e.message, ultima: null, horas: null };
  }
}

// Retorna a saúde de todos os pipelines (pro painel / status).
async function checarSaude() {
  return Promise.all(PIPELINES.map(recencia));
}

// Roda no cron: checa e ALERTA os que estão atrasado/parado (dedup diário).
// Retorna o nº de alertas gerados (compatível com o agregador de notificações).
async function checarEAlertar() {
  const saude = await checarSaude();
  const hojeStr = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const s of saude) {
    if (s.status !== 'atrasado' && s.status !== 'parado') continue;
    count += await notificar({
      modulo: s.modulo,
      tipo: 'automacao_sem_atualizar',
      titulo: `Automação ${s.status === 'parado' ? 'parada' : 'atrasada'}: ${s.label}`,
      mensagem: `${s.label} está há ${s.horas}h sem novo registro (esperado a cada ${s.maxHoras}h). Verifique se a sincronização/cron está rodando.`,
      link: '/admin',
      severidade: s.status === 'parado' ? 'warning' : 'info',
      chaveDedup: `automacao_${s.chave}_${hojeStr}`,
    });
  }
  return count;
}

module.exports = { checarSaude, checarEAlertar, PIPELINES };
