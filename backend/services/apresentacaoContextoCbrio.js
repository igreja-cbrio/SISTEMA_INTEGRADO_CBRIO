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
 * Retorna apenas entries hardcoded ativas, na ordem do array.
 * Filtro 'ativo' permite desabilitar uma entrada sem deletar.
 */
function getContextoAtivo() {
  return CONTEXTO_CBRIO.filter(c => c.ativo !== false);
}

// =====================================================================
// Contexto extra · arquivos do vault Obsidian no SharePoint
// =====================================================================
// Le todos os .md da pasta `_contexto-apresentacoes/` no vault
// "Cerebro CBRio" e injeta como contexto adicional. Permite Marcos
// adicionar/atualizar contexto sem precisar deploy.
//
// Cache 5min em memoria · evita 1 chamada Graph por apresentacao.
// Falha silenciosa · se Graph nao responder, usa so o hardcoded.
// =====================================================================

const HUB_SITE_ID = 'infracbrio.sharepoint.com,04b50f10-ea32-40ba-84bd-44a3b38ee2a7,94fe6af6-f064-455d-afc5-67a377f5e82c';
const CONTEXTO_FOLDER = '_contexto-apresentacoes';
const VAULT_DRIVE_NAME = 'Cerebro CBRio';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CHARS_PER_FILE = 4000;
const MAX_TOTAL_CHARS = 16000;

let _cacheData = null;
let _cacheTime = 0;

async function lerContextoSharePoint() {
  if (_cacheData && Date.now() - _cacheTime < CACHE_TTL_MS) return _cacheData;

  try {
    const { getGraphToken } = require('./storageService');
    const token = await getGraphToken();

    // Descobrir drive do vault
    const drivesRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${HUB_SITE_ID}/drives`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!drivesRes.ok) {
      console.warn('[apresentacoes-ctx] falha ao listar drives:', drivesRes.status);
      return [];
    }
    const drives = await drivesRes.json();
    const vault = drives.value?.find(d => d.name === VAULT_DRIVE_NAME);
    if (!vault) {
      console.warn(`[apresentacoes-ctx] drive "${VAULT_DRIVE_NAME}" nao encontrado`);
      return [];
    }

    // Listar arquivos na pasta de contexto
    const listRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${vault.id}/root:/${CONTEXTO_FOLDER}:/children?$select=id,name,file&$top=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!listRes.ok) {
      if (listRes.status === 404) {
        console.log(`[apresentacoes-ctx] pasta /${CONTEXTO_FOLDER}/ nao existe no vault · ok, sem contexto extra`);
      } else {
        console.warn('[apresentacoes-ctx] falha ao listar pasta:', listRes.status);
      }
      _cacheData = [];
      _cacheTime = Date.now();
      return _cacheData;
    }
    const list = await listRes.json();
    const mdFiles = (list.value || []).filter(f => f.file && /\.md$/i.test(f.name));

    // Baixa conteudo de cada
    const entries = [];
    let totalChars = 0;
    for (const f of mdFiles) {
      if (totalChars >= MAX_TOTAL_CHARS) break;
      try {
        const dlRes = await fetch(
          `https://graph.microsoft.com/v1.0/drives/${vault.id}/items/${f.id}/content`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!dlRes.ok) continue;
        let conteudo = await dlRes.text();
        if (conteudo.length > MAX_CHARS_PER_FILE) {
          conteudo = conteudo.slice(0, MAX_CHARS_PER_FILE) + '\n\n[...truncado]';
        }
        const restante = MAX_TOTAL_CHARS - totalChars;
        if (conteudo.length > restante) {
          conteudo = conteudo.slice(0, restante) + '\n\n[...truncado]';
        }
        entries.push({
          chave: `sp_${f.id.slice(0, 16)}`,
          titulo: f.name.replace(/\.md$/i, '').replace(/[-_]/g, ' '),
          conteudo,
        });
        totalChars += conteudo.length;
      } catch (err) {
        console.warn(`[apresentacoes-ctx] falha ao baixar ${f.name}:`, err.message);
      }
    }

    console.log(`[apresentacoes-ctx] carregou ${entries.length} arquivos do vault (${totalChars} chars)`);
    _cacheData = entries;
    _cacheTime = Date.now();
    return entries;
  } catch (e) {
    console.warn('[apresentacoes-ctx] erro geral:', e.message);
    return [];
  }
}

/**
 * Retorna contexto completo: hardcoded + arquivos do SharePoint.
 * Falha silenciosa pra SharePoint · sempre devolve pelo menos o hardcoded.
 */
async function getContextoCompleto() {
  const hardcoded = getContextoAtivo();
  let sharepoint = [];
  try {
    sharepoint = await lerContextoSharePoint();
  } catch (e) {
    console.warn('[apresentacoes-ctx] falha em SharePoint, seguindo so com hardcoded:', e.message);
  }
  return [...hardcoded, ...sharepoint];
}

// Invalida cache manualmente · pode ser chamado por endpoint admin futuro
function bustContextoCache() {
  _cacheData = null;
  _cacheTime = 0;
}

module.exports = {
  CONTEXTO_CBRIO,
  getContextoAtivo,
  getContextoCompleto,
  lerContextoSharePoint,
  bustContextoCache,
};
