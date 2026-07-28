// Lista de participantes de um evento de inscrição, em A4, agrupada por faixa
// de idade / sexo / status / forma de pagamento — ou sem agrupar.
//
// Modelada em `imprimirListaPresencaBatismo.ts` (mesmo padrão de popup,
// `@page`, `thead { display: table-header-group }` pra repetir o cabeçalho a
// cada folha, `page-break-inside: avoid` na linha e `escapeHtml` em tudo que
// vem do banco).
//
// ⚠️ Telefone e e-mail NÃO entram por padrão. É PII em papel, que circula na
// mão de voluntário e fica em cima de mesa — só sai quando quem imprime pede
// explicitamente (`colunas.contato`).

import {
  faixaEtaria, idadeEmAnos, FAIXAS, FAIXA_LABEL, sexoLabel,
} from './faixaEtaria';

export type Agrupamento = 'nenhum' | 'faixa' | 'sexo' | 'status' | 'pagamento';

export interface InscritoImpressao {
  nome_completo: string;
  data_nascimento?: string | null;
  sexo?: string | null;
  telefone?: string | null;
  email?: string | null;
  status?: string | null;
  numero_sorte?: number | null;
  pagamento?: { metodo?: string | null; status_pagamento?: string | null } | null;
}

export interface OpcoesImpressao {
  agrupamento?: Agrupamento;
  /** Colunas opcionais. `contato` é PII em papel — sai só quando pedido. */
  colunas?: { contato?: boolean; pagamento?: boolean; presenca?: boolean };
  /** Inclui canceladas. Padrão: fora (a lista serve pra operar o evento). */
  incluirCanceladas?: boolean;
}

const METODO_LABEL: Record<string, string> = {
  pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto', apple_pay: 'Apple Pay',
  dinheiro: 'Dinheiro', transferencia: 'Transferência',
};

const PAG_LABEL: Record<string, string> = {
  pago: 'Pago', pago_parcial: 'Parcial', aguardando: 'Aguardando',
  aguardando_pagamento: 'Aguardando', pendente: 'Pendente',
  criada: 'Pendente', expirado: 'Expirado', expirada: 'Expirado',
  cancelada: 'Cancelado', falhou: 'Falhou',
  estornado: 'Estornado', estornado_parcial: 'Estornado', chargeback: 'Contestado',
};

const CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #111; background: #fff;
    font-family: 'Inter', system-ui, -apple-system, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .topo { border-bottom: 2px solid #00B39D; padding-bottom: 6px; margin-bottom: 14px; }
  .marca { font-size: 10.5pt; font-weight: 800; color: #00B39D; letter-spacing: .3px; }
  .nome-evento { font-size: 15pt; font-weight: 800; margin-top: 2px; }
  .meta { font-size: 9.5pt; color: #555; margin-top: 3px; }
  .grupo { margin-bottom: 18px; }
  /* Cabeçalho de grupo nunca fica órfão no pé da folha. */
  .grupo-titulo { font-size: 11.5pt; font-weight: 800; color: #0b6; background: #E8F8F5;
    border-left: 4px solid #00B39D; padding: 5px 8px; margin-bottom: 7px;
    page-break-after: avoid; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }   /* repete o cabeçalho a cada folha */
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #999; padding: 6px 8px; font-size: 10.5pt; text-align: left; }
  thead th { background: #EEF7F5; font-size: 9pt; text-transform: uppercase; letter-spacing: .4px; }
  th.num, td.num { width: 32px; text-align: center; color: #666; }
  th.idade, td.idade { width: 52px; text-align: center; }
  th.sexo, td.sexo { width: 74px; }
  th.faixa, td.faixa { width: 92px; }
  th.sorte, td.sorte { width: 52px; text-align: center; font-variant-numeric: tabular-nums; }
  th.pag, td.pag { width: 118px; }
  th.chk, td.chk { width: 66px; text-align: center; }
  .box { display: inline-block; width: 15px; height: 15px; border: 2px solid #333; border-radius: 3px; }
  tbody tr { height: 27px; }
  .cancelada td { color: #999; text-decoration: line-through; }
  .subtotal { font-size: 9.5pt; color: #444; margin-top: 5px; }
  .totalgeral { margin-top: 16px; border-top: 2px solid #00B39D; padding-top: 7px;
    font-size: 11pt; font-weight: 700; display: flex; justify-content: space-between; }
  .totalgeral .ass { font-weight: 400; color: #999; }
  .vazio { text-align: center; color: #999; font-style: italic; }
`;

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

function textoPagamento(i: InscritoImpressao): string {
  const p = i.pagamento;
  if (!p) return '—';
  const metodo = p.metodo ? (METODO_LABEL[p.metodo] || p.metodo) : '';
  const st = p.status_pagamento ? (PAG_LABEL[p.status_pagamento] || p.status_pagamento) : '';
  return [metodo, st].filter(Boolean).join(' · ') || '—';
}

/**
 * Chave e rótulo do grupo. A ordem dos grupos é a de `ordemGrupos`, não a
 * alfabética — "Criança, Adolescente, Jovem, Adulto" é a ordem que a operação
 * espera ler, e A-Z devolveria "Adolescente, Adulto, Criança, Jovem".
 */
function chaveGrupo(i: InscritoImpressao, ag: Agrupamento): string {
  if (ag === 'faixa') return faixaEtaria(i.data_nascimento) || 'sem_nascimento';
  if (ag === 'sexo') return i.sexo || 'sem_sexo';
  if (ag === 'status') return i.status || 'sem_status';
  if (ag === 'pagamento') return i.pagamento?.status_pagamento || 'sem_pagamento';
  return 'todos';
}

function rotuloGrupo(chave: string, ag: Agrupamento): string {
  if (ag === 'faixa') {
    return chave === 'sem_nascimento'
      ? 'Sem data de nascimento'
      : FAIXA_LABEL[chave as keyof typeof FAIXA_LABEL] || chave;
  }
  if (ag === 'sexo') return chave === 'sem_sexo' ? 'Sexo não informado' : sexoLabel(chave);
  if (ag === 'status') {
    return { confirmada: 'Confirmadas', recebida: 'Aguardando pagamento', cancelada: 'Canceladas' }[chave]
      || chave;
  }
  if (ag === 'pagamento') {
    return chave === 'sem_pagamento' ? 'Sem cobrança' : (PAG_LABEL[chave] || chave);
  }
  return 'Participantes';
}

function ordemGrupos(chaves: string[], ag: Agrupamento): string[] {
  const prioridade: Record<Agrupamento, string[]> = {
    faixa: [...FAIXAS, 'sem_nascimento'],
    sexo: ['feminino', 'masculino', 'sem_sexo'],
    status: ['confirmada', 'recebida', 'cancelada', 'sem_status'],
    pagamento: ['pago', 'pago_parcial', 'aguardando', 'pendente', 'expirado', 'estornado', 'sem_pagamento'],
    nenhum: ['todos'],
  };
  const ordem = prioridade[ag] || [];
  return [...chaves].sort((a, b) => {
    const ia = ordem.indexOf(a); const ib = ordem.indexOf(b);
    // Chave fora da lista conhecida vai pro fim, em ordem alfabética — status
    // novo no banco aparece na folha em vez de desaparecer.
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'pt-BR');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function tabela(lista: InscritoImpressao[], ag: Agrupamento, col: Required<NonNullable<OpcoesImpressao['colunas']>>): string {
  // Coluna redundante com o agrupamento é omitida: agrupado por sexo, repetir
  // "Feminino" em 80 linhas é só ruído.
  const mostraFaixa = ag !== 'faixa';
  const mostraSexo = ag !== 'sexo';
  const cols = [
    '<th class="num">#</th>',
    '<th>Nome</th>',
    '<th class="idade">Idade</th>',
    mostraFaixa ? '<th class="faixa">Faixa</th>' : '',
    mostraSexo ? '<th class="sexo">Sexo</th>' : '',
    col.contato ? '<th>Contato</th>' : '',
    col.pagamento ? '<th class="pag">Pagamento</th>' : '',
    '<th class="sorte">Nº</th>',
    col.presenca ? '<th class="chk">Presente</th>' : '',
  ].filter(Boolean);

  const linhas = lista.length ? lista.map((i, n) => {
    const idade = idadeEmAnos(i.data_nascimento);
    return `<tr class="${i.status === 'cancelada' ? 'cancelada' : ''}">
      <td class="num">${n + 1}</td>
      <td>${escapeHtml(i.nome_completo)}</td>
      <td class="idade">${idade == null ? '—' : idade}</td>
      ${mostraFaixa ? `<td class="faixa">${escapeHtml(faixaEtaria(i.data_nascimento) ? FAIXA_LABEL[faixaEtaria(i.data_nascimento)!].split(' (')[0] : '—')}</td>` : ''}
      ${mostraSexo ? `<td class="sexo">${escapeHtml(i.sexo ? sexoLabel(i.sexo) : '—')}</td>` : ''}
      ${col.contato ? `<td>${escapeHtml(i.telefone || i.email || '—')}</td>` : ''}
      ${col.pagamento ? `<td class="pag">${escapeHtml(textoPagamento(i))}</td>` : ''}
      <td class="sorte">${i.numero_sorte ?? '—'}</td>
      ${col.presenca ? '<td class="chk"><span class="box"></span></td>' : ''}
    </tr>`;
  }).join('') : `<tr><td class="vazio" colspan="${cols.length}">Ninguém neste grupo</td></tr>`;

  return `<table><thead><tr>${cols.join('')}</tr></thead><tbody>${linhas}</tbody></table>`;
}

export function imprimirListaInscritos(
  evento: { nome: string; data?: string | null; hora?: string | null; local?: string | null },
  inscritos: InscritoImpressao[],
  opcoes: OpcoesImpressao = {},
): void {
  const ag: Agrupamento = opcoes.agrupamento || 'nenhum';
  const col = {
    contato: !!opcoes.colunas?.contato,
    pagamento: !!opcoes.colunas?.pagamento,
    presenca: opcoes.colunas?.presenca !== false,   // checkbox é o padrão útil
  };

  const base = (opcoes.incluirCanceladas ? inscritos : inscritos.filter((i) => i.status !== 'cancelada'))
    .slice()
    .sort((a, b) => String(a.nome_completo || '').localeCompare(String(b.nome_completo || ''), 'pt-BR'));

  const grupos = new Map<string, InscritoImpressao[]>();
  for (const i of base) {
    const k = chaveGrupo(i, ag);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(i);
  }

  const secoes = ordemGrupos([...grupos.keys()], ag).map((k) => {
    const lista = grupos.get(k) || [];
    const titulo = ag === 'nenhum'
      ? ''
      : `<div class="grupo-titulo">${escapeHtml(rotuloGrupo(k, ag))} — ${lista.length}</div>`;
    const sub = ag === 'nenhum' ? '' : `<div class="subtotal">Subtotal: <strong>${lista.length}</strong></div>`;
    return `<section class="grupo">${titulo}${tabela(lista, ag, col)}${sub}</section>`;
  }).join('');

  const metaPartes = [
    evento.data ? new Date(`${evento.data}T00:00:00`).toLocaleDateString('pt-BR') : '',
    evento.hora || '',
    evento.local || '',
  ].filter(Boolean);
  const rotuloAg = {
    nenhum: '', faixa: 'agrupada por faixa de idade', sexo: 'agrupada por sexo',
    status: 'agrupada por status', pagamento: 'agrupada por pagamento',
  }[ag];

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Participantes — ${escapeHtml(evento.nome)}</title><style>${CSS}</style></head><body>
    <div class="topo">
      <div class="marca">⛪ CB Rio · Lista de participantes</div>
      <div class="nome-evento">${escapeHtml(evento.nome)}</div>
      <div class="meta">${escapeHtml(metaPartes.join(' · '))}${rotuloAg ? `${metaPartes.length ? ' · ' : ''}${rotuloAg}` : ''}</div>
    </div>
    ${secoes}
    <div class="totalgeral">
      <span>Total de participantes: ${base.length}</span>
      <span class="ass">Responsável: ______________________</span>
    </div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
  if (!win) {
    console.warn('[listaInscritos] popup bloqueado · libere popups do site');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch (e) { console.error('[listaInscritos] print:', e); } }, 350);
}
