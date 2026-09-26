// Catálogo de intenção de isolamento, não comprovação do schema ou da RLS viva.
// "compartilhado" preserva todos os controles de módulo, vínculo e dado sensível.
const entradas = [];
function adicionar(modulo, escopo, tabelas, coluna = null, parent = null) {
  for (const tabela of tabelas.split(' ')) entradas.push(Object.freeze({ tabela, modulo, escopo, coluna, ...(parent ? { parent } : {}) }));
}
adicionar('membresia', 'identidade', 'mem_membros mem_contatos identidade_pendencias profiles');
adicionar('campus', 'compartilhado', 'igrejas modulos cargos areas');
adicionar('campus', 'local', 'usuario_igrejas', 'igreja_id');
adicionar('integracao', 'local', 'cultos batismo_eventos batismo_inscricoes int_visitantes', 'igreja_id');
adicionar('integracao', 'local', 'cultos_decisoes_pessoas cultos_dados_submissoes', 'igreja_id', { tabela: 'cultos', chave: 'culto_id' });
adicionar('cuidados', 'local', 'cui_convertidos cui_acompanhamentos cui_jornada180 cui_jornada', 'igreja_id');
adicionar('cuidados', 'local', 'cui_atendimentos', null, { tabela: 'cui_acompanhamentos', chave: 'acompanhamento_id' });
adicionar('grupos', 'local', 'mem_grupos', 'igreja_id');
adicionar('grupos', 'local', 'mem_grupo_membros mem_grupo_encontros grupo_supervisao_visitas grupo_pedidos mem_grupo_link', 'igreja_id', { tabela: 'mem_grupos', chave: 'grupo_id' });
adicionar('grupos', 'local', 'mem_grupo_encontro_presencas', null, { tabela: 'mem_grupo_encontros', chave: 'encontro_id' });
adicionar('next', 'local', 'next_turmas next_eventos next_inscricoes', 'igreja_id');
adicionar('next', 'local', 'next_encontros next_matriculas', 'igreja_id', { tabela: 'next_turmas', chave: 'turma_id' });
adicionar('next', 'local', 'next_presencas', null, { tabela: 'next_encontros', chave: 'encontro_id' });
// Kids preserva uma criança global; participação e atos têm origem explícita.
adicionar('kids', 'identidade', 'kids_criancas kids_responsaveis');
adicionar('kids', 'local', 'kids_crianca_campi kids_salas kids_pagers kids_estacoes kids_sessoes kids_checkins kids_chamadas kids_etiquetas_log kids_pager_envios kids_portao_scans kids_codigos_reservados kids_pco_presencas kids_atendimentos kids_conversoes_import kids_pre_checkins kids_vinculo_solicitacoes', 'igreja_id');
adicionar('kids', 'local', 'kids_sala_voluntarios kids_estoque', null, { tabela: 'kids_salas', chave: 'sala_id' });
adicionar('totem', 'local', 'totem_estacoes', 'igreja_id');
adicionar('totem', 'local', 'totem_estacao_tokens', null, { tabela: 'totem_estacoes', chave: 'estacao_id' });
adicionar('kids', 'pendente', 'kids_totem_config kids_etiqueta_config');
adicionar('voluntariado', 'identidade', 'vol_profiles');
adicionar('voluntariado', 'local', 'mem_voluntarios vol_services vol_teams vol_schedules vol_escala_culto_itens', 'igreja_id');
adicionar('voluntariado', 'local', 'vol_check_ins', null, { tabela: 'vol_schedules', chave: 'schedule_id' });
adicionar('solicitacoes', 'local', 'solicitacoes', 'igreja_id');
adicionar('logistica', 'local', 'log_solicitacoes_compra log_pedidos log_compras log_notas_fiscais', 'igreja_id');
adicionar('kpis', 'local', 'dados_brutos kpi_registros kpi_valores_calculados kpi_trajetoria nsm_eventos', 'igreja_id');
adicionar('kpis', 'pendente', 'nsm_estado vw_kpi_trajetoria_atual vw_dashboard_semanal vw_okr_score_composto');
adicionar('kpis', 'compartilhado', 'kpi_indicadores_taticos tipos_dado_bruto kpi_objetivos_gerais');
// A decisão central é explícita por tabela; um prefixo novo nunca é autorizado.
adicionar('financeiro', 'compartilhado', 'fin_lancamentos fin_categorias fin_centros_custo fin_contas mem_contribuicoes');
adicionar('rh', 'compartilhado', 'rh_funcionarios rh_ferias rh_folha_snapshots rh_avaliacoes');
adicionar('patrimonio', 'compartilhado', 'pat_bens pat_categorias pat_localizacoes');
const TABELAS_CAMPUS = Object.freeze(Object.fromEntries(entradas.map((item) => [item.tabela, item])));
const ROTAS_CAMPUS = Object.freeze({
  '/api/integracao': 'local', '/api/cuidados': 'local', '/api/grupos': 'local',
  '/api/next': 'local', '/api/voluntariado': 'local', '/api/kids': 'local',
  '/api/totem-kids': 'local', '/api/solicitacoes': 'local', '/api/logistica': 'local',
  '/api/dados-brutos': 'local', '/api/painel': 'local', '/api/nsm': 'local',
  '/api/membresia': 'identidade', '/api/rh': 'compartilhado',
  '/api/financeiro-v2': 'compartilhado', '/api/patrimonio': 'compartilhado',
  '/api/app': 'pendente', '/api/staff': 'pendente', '/api/public/grupos': 'pendente',
  '/api/public/batismo': 'pendente',
});
function classificarTabela(tabela) {
  return TABELAS_CAMPUS[tabela] || { tabela, modulo: null, escopo: 'pendente', coluna: null };
}
module.exports = { TABELAS_CAMPUS, ROTAS_CAMPUS, classificarTabela };
