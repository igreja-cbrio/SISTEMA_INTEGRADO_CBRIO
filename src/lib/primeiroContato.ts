// ─────────────────────────────────────────────────────────────────────────────
// O vocabulário do 1º contato dos Próximos passos — régua ÚNICA do front.
//
// ⚠️⚠️ POR QUE ISTO EXISTE (16/09/2026)
// A lista de status estava escrita dentro de `Cuidados.tsx`, e o
// `PainelVisitantes.tsx` — que mostra o MESMO campo — não tinha acesso a ela:
// imprimia o valor CRU (`nao_atendido` em vez de "Não atendido"). Duas telas
// sobre o mesmo dado, uma sabendo traduzir e a outra não.
//
// ⚠️ Os ESPELHOS no backend continuam existindo (`routes/cuidados.js`,
// `routes/painel.js`, `routes/nextConvite.js`, `services/agentePrimeiroContato.js`):
// mudou aqui, muda lá. Este arquivo unifica o que é do NAVEGADOR, não o sistema
// inteiro.
// ─────────────────────────────────────────────────────────────────────────────

export type OpcaoPrimeiroContato = {
  v: string;
  label: string;
  /** Desfecho bom — a tela pinta diferente. */
  positivo?: boolean;
};

/**
 * O que a tela OFERECE, na ordem do estado inicial ao melhor desfecho.
 *
 * ⚠️ `contactada` exige a migration `20260901130000` e `contato_impossivel` a
 * `20260916180000` — o CHECK vivo recusa valor que ele não conhece (23514).
 */
export const PCONTATO_OPCOES: OpcaoPrimeiroContato[] = [
  { v: 'contactada',          label: 'Contactada (aguardando resposta)' },
  { v: 'nao_respondeu',       label: 'Não respondeu' },
  { v: 'nao_atendido',        label: 'Não atendido' },
  { v: 'numero_errado',       label: 'Número errado' },
  // ⚠️⚠️ Pedido do Marcelo (16/09): converso do ONLINE de quem só temos o id do
  // YouTube. Não é `numero_errado` — lá existe um número e ele é de outra
  // pessoa; aqui não existe número nenhum.
  { v: 'contato_impossivel',  label: 'Contato impossível' },
  { v: 'atendido_respondido', label: 'Atendido e respondido', positivo: true },
];

/**
 * Rótulo de TODOS os status, inclusive os legados da planilha já importada.
 * ⚠️ Status legado continua aqui de propósito: ele não é mais OFERECIDO, mas
 * existe em linha antiga — sem o rótulo, a tela mostraria o valor cru.
 */
export const PCONTATO_LABEL: Record<string, string> = {
  contactada: 'Contactada (aguardando resposta)',
  nao_respondeu: 'Não respondeu',
  nao_atendido: 'Não atendido',
  atendido_respondido: 'Atendido e respondido',
  respondeu: 'Respondeu',
  nao_compareceu: 'Não compareceu',
  sem_retorno: 'Sem retorno do responsável',
  numero_errado: 'Número errado',
  contato_impossivel: 'Contato impossível',
};

/** Cor por status (dashboard · Próximos passos). */
export const PCONTATO_COR: Record<string, string> = {
  atendido_respondido: '#10b981',
  contactada: '#3b82f6',
  nao_respondeu: '#f59e0b',
  nao_atendido: '#64748b',
  numero_errado: '#94a3b8',
  contato_impossivel: '#a78bfa',
  pendente: '#ef476f',
};

/**
 * Status que dizem que o 1º contato FOI FEITO — a pessoa recebeu a mensagem,
 * independente de ter respondido.
 *
 * ⚠️⚠️ `contato_impossivel` NÃO entra: nenhuma mensagem saiu, porque não há
 * para onde mandar. Marcar como feito inflaria o indicador de contato com
 * contato que não aconteceu — que é exatamente o defeito que este status existe
 * para consertar (medido em 16/09: 6 linhas do YouTube em `contactada`).
 * ⚠️ `sem_retorno` e `numero_errado` também ficam de fora aqui.
 */
export const PCONTATO_FEITO = new Set([
  'contactada', 'respondeu', 'atendido_respondido', 'nao_respondeu',
  'nao_compareceu', 'nao_atendido',
]);

/**
 * Status em que a equipe não tinha como alcançar a pessoa. Saem do DENOMINADOR
 * do percentual de atendimento — cobrar disso é cobrar o que não está na mão.
 */
export const PCONTATO_INALCANCAVEL = new Set(['numero_errado', 'contato_impossivel']);

/** Rótulo de um status, com o valor cru como último recurso (nunca vazio). */
export function rotuloPrimeiroContato(status: unknown): string {
  const s = String(status ?? '').trim();
  if (!s) return '—';
  return PCONTATO_LABEL[s] || s;
}
