// =====================================================================
// Base de conhecimento CBRio · injetada no prompt do gerador
// =====================================================================
// Fatos sobre a organizacao que a IA precisa saber pra nao alucinar
// quando o usuario pede algo como "5 valores da CBRio", "as 6 areas",
// "diretoria geral", etc.
//
// Editar AQUI quando algo mudar · versionado no git, sem necessidade
// de UI/banco. Cada entry tem titulo (vira ## no prompt) e conteudo
// (markdown texto livre). Apenas entries com ativo!=false sao injetadas.
// =====================================================================

const CONTEXTO_CBRIO = [
  {
    chave: 'sobre',
    titulo: 'Sobre a CBRio',
    conteudo: `A CBRio e uma igreja modelo "hub" com Sede + Online + igrejas CBA acompanhadas.

Identidade visual:
- Cor primaria: #00B39D (verde-azulado)
- Branding limpo e moderno`,
  },

  {
    chave: 'valores',
    titulo: 'Os 5 valores da CBRio (Jornada do Membro)',
    conteudo: `A CBRio organiza a vida do membro em torno de 5 valores. Um "Membro Modelo" pratica >=2 desses 5 valores. Sao eles:

1. **Seguir Jesus** - decisao + primeiro contato + batismo. Alimentado por decisoes registradas nos cultos (presencial, online, kids).

2. **Conectar** - participacao ativa em grupo de conexao (grupo pequeno semanal).

3. **Investir Tempo com Deus** - devocional diario + jornada 180 + encontros pessoais com Deus.

4. **Servir** - voluntariado ativo em algum ministerio (Kids/AMI/Bridge/Producao/Marketing/Recepcao/Cuidado/etc).

5. **Generosidade** - contribuicao recorrente (dizimo ou oferta).`,
  },

  {
    chave: 'areas',
    titulo: 'As 6 áreas ministeriais (matriz Valor × Área)',
    conteudo: `O sistema tem 6 areas ministeriais que cruzam com os 5 valores formando uma matriz 6×5 de ~150 KPIs.

- **Sede**: culto principal CBRio (Domingo 8h30/10h/11h30/19h + Quarta com Deus 20h).
- **Online**: transmissao YouTube (somente leitura · decisoes preenchidas pela Alda Lorena).
- **Kids**: ministerio infantil. Lider: Mariane Gaia.
- **AMI**: culto de adolescentes/jovens, sabado 20h. Lider: Arthur Cecconi.
- **Bridge**: culto pra novos, sabado 17h. Lider: Lillian Xavier.
- **CBA**: igrejas externas acompanhadas pelo CBRio.`,
  },

  {
    chave: 'lideranca',
    titulo: 'Liderança · Diretoria Geral (5 nominais)',
    conteudo: `A diretoria geral da CBRio sao 5 pessoas nominais:

- **Pr. Pedrão** · Pastor Senior
- **Pr. Juninho** · Pastor Presidente
- **Eduardo Gnisci** · Lider de Gestão
- **Arthur Serpa** · Lider Ministerial
- **Pedro Menezes (Pepe)** · Lider Criativo`,
  },

  {
    chave: 'time_dev',
    titulo: 'Time de desenvolvimento do sistema interno',
    conteudo: `O sistema integrado CBRio foi construido por:

- **Marcos Paulo Almeida** · Backend, integracoes, modulos Administracao (RH/Patrimonio/Solicitacoes), Eventos com ciclo criativo, Painel CBRio.
- **Matheus Toscano** · UI complementar, modulo Online (YouTube + Analytics + OAuth), Devocional com IA, NPS gerado por IA, Financeiro, NEXT, Grupos.`,
  },

  {
    chave: 'jornada_180',
    titulo: 'Programa Jornada 180',
    conteudo: `Programa de discipulado de 180 dias pra novos convertidos. Vincula pessoa a um lider espiritual que faz encontros pessoais regulares. Alimenta o valor "Investir Tempo com Deus" da Jornada do Membro.`,
  },

  {
    chave: 'nps_culto',
    titulo: 'NPS de Culto',
    conteudo: `A cada culto, a CBRio coleta NPS dos participantes (0-10 + comentario). NPS positivo = vai dizer pra amigos · alimenta a frequencia futura.`,
  },

  {
    chave: 'modulos_sistema',
    titulo: 'Módulos do sistema CBRio',
    conteudo: `O sistema esta organizado em 6 modulos macro:

1. **Administração** · RH, Financeiro, Logística, Patrimônio, Solicitações, Permissões
2. **Inteligência** · Painel CBRio (NSM), Dashboard Semanal, KPIs, NPS, Assistente IA, Apresentações
3. **Planejamento** · Eventos (ciclo criativo), Projetos, Expansão, Governança, Revisão Estratégica
4. **Ministerial** · Integração, Membresia, Cuidados, Grupos, Voluntariado, NEXT, Devocional
5. **Cultos** · drill-down por culto (Online/Kids/AMI/Bridge)
6. **Criativo** · Marketing (em construção)`,
  },
];

/**
 * Retorna apenas entries ativas, na ordem do array.
 * Filtro 'ativo' permite desabilitar uma entrada sem deletar.
 */
function getContextoAtivo() {
  return CONTEXTO_CBRIO.filter(c => c.ativo !== false);
}

module.exports = { CONTEXTO_CBRIO, getContextoAtivo };
