// Régua PURA: ÁREA de um evento de inscrição → SLUG do módulo que cuida dela.
//
// ⚠️ Por que existe (17/08/2026): o Celebra 2026 é o formulário dos VOLUNTÁRIOS
// ("Em qual ministério você serve?"), mas vive no módulo `inscricoes` — então o
// aviso de nova inscrição saía como `modulo='inscricoes'` e caía no fallback de
// admin/diretor. Quem cuida do voluntariado (regras do módulo `voluntariado`)
// não recebia NADA: nem push, nem sino. Medido: 8 destinatários, nenhum deles a
// coordenação de voluntariado.
//
// A régua é "evento da área X avisa também quem cuida do módulo X". Quem decide
// a área é o construtor do evento (campo que já existia); quem decide as PESSOAS
// continua sendo `notificacao_regras` em /admin — nome de gente NUNCA entra aqui
// (lei: não nomear pessoa como dono de fluxo).
//
// ⚠️ O mapa liga NOME DE ÁREA (catálogo `areas`, texto que o humano lê) a SLUG
// DE MÓDULO (catálogo `modulos`, identificador). Os dois catálogos são
// independentes e nem toda área tem módulo: Sede, Louvor, Infraestrutura e TI
// não têm, e devolver um slug inventado ali faria `resolverDestinatarios`
// procurar regra de um módulo inexistente — sem erro, sem destinatário extra, e
// sem ninguém descobrir. Área sem módulo devolve `null` de propósito.
//
// ⚠️ Área NOVA no catálogo `areas` só passa a avisar alguém depois de entrar
// aqui — e só se o slug existir mesmo em `modulos` (há teste travando isso).

// nome da área (normalizado) → slug do módulo. Conferido no catálogo vivo em
// 17/08/2026: as 19 áreas ativas de `areas` × os slugs ativos de `modulos`.
const MAPA = {
  ami: 'ami',
  bridge: 'bridge',
  cuidados: 'cuidados',
  financeiro: 'financeiro',
  grupos: 'grupos',
  integracao: 'integracao',
  kids: 'kids',
  logistica: 'logistica',
  marketing: 'marketing',
  next: 'next',
  online: 'online',
  patrimonio: 'patrimonio',
  producao: 'producao',
  'rh/administrativo': 'rh',
  voluntariado: 'voluntariado',
};

// Áreas que existem no catálogo e NÃO têm módulo correspondente. Listadas de
// propósito: é a diferença entre "ninguém a mais é avisado" (decisão) e
// "esqueceram de mapear" (defeito).
const AREAS_SEM_MODULO = ['sede', 'louvor', 'infraestrutura', 'ti'];

/**
 * Normaliza nome de área para comparação: sem acento, minúsculo, espaço
 * colapsado. ⚠️ Compara normalizado contra normalizado — a área é digitada por
 * humano no catálogo ("KIDS", "Produção", "Logística") e casar cru erraria em
 * quase todas.
 */
function normalizarArea(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Devolve o slug do módulo que cuida da área do evento, ou null quando a área
 * não tem módulo (Sede/Louvor/TI/Infraestrutura), está vazia ou é desconhecida.
 */
function moduloDaAreaEvento(area) {
  const chave = normalizarArea(area);
  if (!chave) return null;
  return MAPA[chave] || null;
}

module.exports = { moduloDaAreaEvento, normalizarArea, MAPA, AREAS_SEM_MODULO };
