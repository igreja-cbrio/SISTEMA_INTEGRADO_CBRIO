/**
 * Mapa dos Managed Agents da Anthropic criados para o CBRio ERP.
 * Cada agente foi configurado na plataforma Anthropic com system prompts
 * e tools específicos para seu módulo.
 */

const ENVIRONMENT_ID = 'env_01UMJ12N3YjCfoyLyEKL4xcu';

const AGENTS = {
  rh:              { id: 'agent_011CZtnVdHLgUvoBzJbKEQpr', label: '👥 Recursos Humanos',  icon: '👥' },
  financeiro:      { id: 'agent_011CZtnVf2WXH3NhrQ131Q8Y', label: '💰 Financeiro',        icon: '💰' },
  logistica:       { id: 'agent_011CZtnVgDw7HDeKz46v7zrt', label: '🚚 Logística',         icon: '🚚' },
  patrimonio:      { id: 'agent_011CZtnVhRsXSphFD561F3VX', label: '🏢 Patrimônio',        icon: '🏢' },
  solicitarCompra: { id: 'agent_011CZtnVioiAi2X6ow27fAYo', label: '🛒 Solicitar Compra',  icon: '🛒' },
  eventos:         { id: 'agent_011CZtnVkFXQKdGTpWZ7dMdJ', label: '📅 Eventos',           icon: '📅' },
  projetos:        { id: 'agent_011CZtnVmrXYh7CVtZRiADNh', label: '📊 Projetos',          icon: '📊' },
  expansao:        { id: 'agent_011CZtnVnuHFCpQcEGHB4Zu1', label: '🏗️ Expansão',          icon: '🏗️' },
  integracao:      { id: 'agent_011CZtnVpVmja172Tu75jNNB', label: '🔗 Integração',        icon: '🔗' },
  grupos:          { id: 'agent_011CZtnVqghrrVcLzkovohNQ', label: '👥 Grupos',             icon: '👥' },
  cuidados:        { id: 'agent_011CZtnVryLkALLSVTdnWgrz', label: '💜 Cuidados',          icon: '💜' },
  voluntariado:    { id: 'agent_011CZtnVsxtFRW9JsYUrTr74', label: '🤝 Voluntariado',      icon: '🤝' },
  membresia:       { id: 'agent_011CZtnVuDHVWYv1eneWEdy6', label: '⛪ Membresia',          icon: '⛪' },
  marketing:       { id: 'agent_011CZtnVvVBY7TQWBAoF4rJj', label: '📣 Marketing',         icon: '📣' },
  supervisor:      { id: 'agent_011CZtnVwVDPjxu4cJgm9ne2', label: '🧠 Supervisor',        icon: '🧠' },
};

/**
 * Retorna o agent ID para um módulo. Fallback para supervisor.
 */
function getAgentId(module) {
  return (AGENTS[module]?.id) || AGENTS.supervisor.id;
}

/**
 * Lista os módulos disponíveis para o seletor do frontend.
 */
function listModules() {
  return Object.entries(AGENTS).map(([key, val]) => ({
    value: key,
    label: val.label,
    icon: val.icon,
  }));
}

module.exports = { ENVIRONMENT_ID, AGENTS, getAgentId, listModules };
