// Relatório A4 das inscrições de voluntariado, gerado a partir do filtro
// aplicado na tela (período por data de inscrição, área, status, busca).
//
// Modelado em `imprimirListaInscritos.ts` (mesmo padrão de popup, `@page`,
// `thead { display: table-header-group }` pra repetir o cabeçalho a cada
// folha, `page-break-inside: avoid` na linha e `escapeHtml` em tudo que vem
// do banco).
//
// ⚠️ A JANELA vai colada no número (lei do projeto): o cabeçalho declara o
// período e todos os filtros aplicados — "42 inscrições" sem dizer de quando
// faz um número correto parecer errado.
// ⚠️ Telefone/e-mail NÃO entram por padrão (PII em papel, que circula na mão
// de voluntário) — só com `incluirContato`. CPF nunca sai no relatório.

export interface InscricaoRelatorio {
  nome_completo: string;
  data_inscricao: string;
  area: string;
  status: string;
  ministerios_interesse?: string | null;
  area_direcionada?: string[] | null;
  integrado_em?: string | null;
  telefone?: string | null;
  email?: string | null;
}

export interface FiltrosRelatorio {
  /** Rótulo humano do período (ex.: "01/08/2026 a 17/08/2026" ou "Ano 2026"). */
  periodoLabel: string;
  areaLabel?: string | null;
  statusLabel?: string | null;
  busca?: string | null;
  /**
   * Quantas linhas o filtro tem NO SERVIDOR. Quando é maior que as linhas
   * recebidas, a folha declara "mostrando X de Y" — contagem truncada em
   * silêncio é a que ninguém percebe que está faltando gente.
   */
  totalNoFiltro?: number | null;
}

export const STATUS_LABELS_INSCRICAO: Record<string, string> = {
  integrado: 'Integrado',
  enviado_ministerio: 'Enviado ao ministério',
  inscrito: 'Inscrito (triagem)',
  kids: 'Kids',
  nao_responde: 'Não responde',
  nao_pode_ou_duplicata: 'Não pode / duplicata',
  desistente: 'Desistiu de servir',
};

/**
 * Texto exibível de `integrado_em`. A coluna é TEXT e carrega três gerações
 * de dado (medido em produção · 2026-08-17): data ISO carimbada pelo sistema
 * (~67 linhas), o boolean "True"/"False" da planilha do Google (625 linhas —
 * NÃO é data) e texto livre da equipe ("Integrada 19/01"). Boolean vira null:
 * o STATUS já diz se a pessoa integrou, e exibir "True" como data é lixo.
 */
export function integradoEmTexto(v?: string | null): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^(true|false)$/i.test(s)) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

const CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #111; background: #fff;
    font-family: 'Inter', system-ui, -apple-system, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .topo { border-bottom: 2px solid #00B39D; padding-bottom: 6px; margin-bottom: 10px; }
  .marca { font-size: 10.5pt; font-weight: 800; color: #00B39D; letter-spacing: .3px; }
  .titulo { font-size: 15pt; font-weight: 800; margin-top: 2px; }
  .meta { font-size: 9.5pt; color: #555; margin-top: 3px; }
  .resumo { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 14px; }
  .chip { border: 1px solid #cde; border-radius: 999px; padding: 3px 10px;
    font-size: 9.5pt; background: #F4FAF9; }
  .chip b { font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }   /* repete o cabeçalho a cada folha */
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #999; padding: 5px 7px; font-size: 10pt; text-align: left; }
  thead th { background: #EEF7F5; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .4px; }
  th.num, td.num { width: 30px; text-align: center; color: #666; }
  th.data, td.data { width: 72px; white-space: nowrap; }
  th.area, td.area { width: 46px; text-transform: capitalize; }
  th.status, td.status { width: 112px; }
  th.integ, td.integ { width: 82px; white-space: nowrap; }
  .totalgeral { margin-top: 16px; border-top: 2px solid #00B39D; padding-top: 7px;
    font-size: 11pt; font-weight: 700; display: flex; justify-content: space-between; }
  .totalgeral .ass { font-weight: 400; color: #999; }
  .vazio { text-align: center; color: #999; font-style: italic; padding: 18px 0; }
  .aviso { border: 1px solid #e0b000; background: #FFF8E1; color: #7a5a00;
    border-radius: 6px; padding: 6px 10px; font-size: 9.5pt; margin-bottom: 12px; }
`;

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

const fmtData = (v?: string | null): string => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toLocaleDateString('pt-BR');
};

export function imprimirRelatorioInscricoesVol(
  rows: InscricaoRelatorio[],
  filtros: FiltrosRelatorio,
  /**
   * `win`: janela pré-aberta pelo chamador DENTRO do gesto do clique — quando
   * o dado chega por fetch, o `window.open` pós-await é bloqueado pelo
   * navegador; abrir antes e escrever depois é o que mantém o popup vivo.
   */
  opcoes: { incluirContato?: boolean; win?: Window | null } = {},
): boolean {
  const incluirContato = !!opcoes.incluirContato;

  // Ordem cronológica: o relatório conta a história do período.
  const base = rows.slice().sort((a, b) =>
    String(a.data_inscricao || '').localeCompare(String(b.data_inscricao || '')));

  const truncou = typeof filtros.totalNoFiltro === 'number' && filtros.totalNoFiltro > base.length;

  // Resumo por status — chave fora do catálogo aparece com o slug cru em vez
  // de desaparecer (status novo no banco não pode sumir da folha).
  const porStatus = new Map<string, number>();
  for (const r of base) porStatus.set(r.status, (porStatus.get(r.status) || 0) + 1);
  const chips = [...porStatus.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<span class="chip">${escapeHtml(STATUS_LABELS_INSCRICAO[k] || k)}: <b>${n}</b></span>`)
    .join('');

  const cols = [
    '<th class="num">#</th>',
    '<th>Nome</th>',
    '<th class="data">Inscrição</th>',
    '<th class="area">Área</th>',
    '<th class="status">Status</th>',
    '<th>Direcionada para</th>',
    '<th class="integ">Integrado em</th>',
    incluirContato ? '<th>Contato</th>' : '',
  ].filter(Boolean);

  const linhas = base.length ? base.map((r, n) => {
    const direcionada = Array.isArray(r.area_direcionada) && r.area_direcionada.length
      ? r.area_direcionada.join(', ')
      : '—';
    return `<tr>
      <td class="num">${n + 1}</td>
      <td>${escapeHtml(r.nome_completo)}</td>
      <td class="data">${escapeHtml(fmtData(r.data_inscricao))}</td>
      <td class="area">${escapeHtml(r.area || '—')}</td>
      <td class="status">${escapeHtml(STATUS_LABELS_INSCRICAO[r.status] || r.status || '—')}</td>
      <td>${escapeHtml(direcionada)}</td>
      <td class="integ">${escapeHtml(integradoEmTexto(r.integrado_em) || '—')}</td>
      ${incluirContato ? `<td>${escapeHtml(r.telefone || r.email || '—')}</td>` : ''}
    </tr>`;
  }).join('') : `<tr><td class="vazio" colspan="${cols.length}">Nenhuma inscrição no filtro aplicado</td></tr>`;

  const metaPartes = [
    `Período: ${filtros.periodoLabel}`,
    filtros.areaLabel ? `Área: ${filtros.areaLabel}` : '',
    filtros.statusLabel ? `Status: ${filtros.statusLabel}` : '',
    filtros.busca ? `Busca: "${filtros.busca}"` : '',
    `Gerado em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
  ].filter(Boolean);

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Inscrições de voluntariado — ${escapeHtml(filtros.periodoLabel)}</title><style>${CSS}</style></head><body>
    <div class="topo">
      <div class="marca">⛪ CB Rio · Voluntariado</div>
      <div class="titulo">Relatório de inscrições</div>
      <div class="meta">${escapeHtml(metaPartes.join(' · '))}</div>
    </div>
    <div class="resumo">
      <span class="chip">Total: <b>${base.length}</b></span>
      ${chips}
    </div>
    ${truncou ? `<div class="aviso">⚠️ Esta folha mostra ${base.length} de ${filtros.totalNoFiltro} inscrições do filtro — o restante não coube nesta geração.</div>` : ''}
    <table><thead><tr>${cols.join('')}</tr></thead><tbody>${linhas}</tbody></table>
    <div class="totalgeral">
      <span>Total de inscrições: ${base.length}</span>
      <span class="ass">Responsável: ______________________</span>
    </div>
  </body></html>`;

  const win = opcoes.win ?? window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
  // Devolve false em vez de só logar: o chamador precisa avisar na tela —
  // console.warn é onde a equipe da igreja nunca olha, e o diálogo fechando
  // sem nada acontecer se lê como botão quebrado.
  if (!win) {
    console.warn('[relatorioInscricoesVol] popup bloqueado · libere popups do site');
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch (e) { console.error('[relatorioInscricoesVol] print:', e); } }, 350);
  return true;
}
