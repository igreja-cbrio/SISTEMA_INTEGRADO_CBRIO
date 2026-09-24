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
const { classificar, deveAlertar, textoAlerta } = require('../utils/saudeAutomacao');

const HORA = 3600000;

// Catálogo de pipelines vigiados. `maxHoras` = quanto tempo SEM novo registro
// já é suspeito (folga sobre a periodicidade esperada). Fácil de estender.
const PIPELINES = [
  { chave: 'fin_sync',     label: 'Sincronização financeira',     tabela: 'fin_transacoes',          coluna: 'created_at', maxHoras: 48,  modulo: 'financeiro' },
  { chave: 'contribuicoes',label: 'Contribuições (dízimos/ofertas)',tabela: 'mem_contribuicoes',      coluna: 'created_at', maxHoras: 72,  modulo: 'financeiro' },
  // ⚠️ WiFi SAIU do monitor em 13/08/2026 (decisão do Matheus). O portal
  // cativo que pedia dados da pessoa foi DESATIVADO — última conexão real em
  // 26/06 —, então "sem registro novo" deixou de ser sintoma de pipeline
  // quebrado e virou o estado NORMAL. Medido antes de tirar: **619 alertas
  // `automacao_sem_atualizar`, 515 não lidos**, um por dia desde 03/07,
  // enterrando o sino com um aviso que ninguém pode resolver.
  // ⚠️ NÃO reintroduzir sem o portal voltar a coletar: pipeline que nunca vai
  // atualizar não é automação vigiada, é alarme permanente. Se o WiFi voltar,
  // esta linha volta com ele (label/tabela/maxHoras inalterados) e o cron
  // `/api/wifi/cron/sync` volta ao vercel.json + systemCatalog.
  // ⚠️⚠️ `collected_at`, NÃO `created_at`. Essas duas tabelas nunca tiveram
  // `created_at` — e o monitor nasceu (24/06/2026) perguntando por ela. A
  // consulta dava erro, o erro virava `desconhecido`, e `desconhecido` era
  // PULADO no alerta: por TRÊS MESES esses dois pipelines não foram vigiados
  // por ninguém. Medido em 24/09/2026, quando o Matheus achou que estavam
  // parados: os dois haviam rodado às 06:00 daquela manhã.
  { chave: 'youtube_snap', label: 'Snapshot do canal (YouTube)',   tabela: 'online_canal_snapshot',   coluna: 'collected_at', maxHoras: 48,  modulo: 'online' },
  { chave: 'youtube_vids', label: 'Vídeos do YouTube',             tabela: 'online_videos',           coluna: 'collected_at', maxHoras: 72,  modulo: 'online' },
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
    // ⚠️ A CLASSIFICAÇÃO vive em `utils/saudeAutomacao.js`, pura. Aqui só se
    // busca o dado. Guarda que decide algo dentro do código que lê o banco é
    // guarda que nenhum mutante alcança.
    return { ...p, ...classificar(p, data?.[p.coluna] || null, error) };
  } catch (e) {
    return { ...p, ...classificar(p, null, e) };
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
    // ⚠️⚠️ `erro_config` ENTRA aqui. Foi a ausência dele que deixou dois
    // pipelines três meses sem vigia: um monitor que não consegue olhar ficava
    // cinza e calado, ocupando o lugar de um que funcionaria.
    if (!deveAlertar(s.status)) continue;
    const t = textoAlerta(s);
    count += await notificar({
      modulo: s.modulo,
      // Tipo próprio: "o vigia quebrou" é outra conversa, para outra pessoa,
      // que não deve ser deduplicada junto com "o pipeline parou".
      tipo: s.status === 'erro_config' ? 'monitor_mal_configurado' : 'automacao_sem_atualizar',
      titulo: t.titulo,
      mensagem: t.mensagem,
      link: '/admin',
      severidade: t.severidade,
      chaveDedup: `automacao_${s.chave}_${s.status === 'erro_config' ? 'cfg_' : ''}${hojeStr}`,
    });
  }
  return count;
}

module.exports = { checarSaude, checarEAlertar, PIPELINES };
