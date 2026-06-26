// Lista de presença dos batizandos · 1 folha por culto (A4), com checkbox de
// presença. Abre uma janela de impressão (o usuário escolhe a impressora).

export interface BatizandoLinha {
  nome: string;
  categoria?: string | null; // "Criança" / "Adolescente" / "Adulto" (já formatado)
  camisa?: string | null;    // tamanho da camisa (opcional · útil no dia)
}

export interface CultoPresenca {
  titulo: string;            // ex.: "Domingo, 22 de junho · 19h00"
  batizandos: BatizandoLinha[];
}

const CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #111; background: #fff;
    font-family: 'Inter', system-ui, -apple-system, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Documento contínuo · todos os cultos numa folha só, separados pelo cabeçalho
     (quebra de página só natural, quando enche). */
  .culto { margin-bottom: 22px; }
  .cabec { border-bottom: 2px solid #6366F1; padding-bottom: 6px; margin-bottom: 12px; page-break-after: avoid; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .titulo { font-size: 11pt; font-weight: 800; color: #6366F1; letter-spacing: .3px; }
  .sub { font-size: 14pt; font-weight: 800; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 7px 8px; font-size: 11pt; text-align: left; }
  thead th { background: #EEF0FF; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .4px; }
  th.num, td.num { width: 34px; text-align: center; color: #666; }
  th.cat, td.cat { width: 90px; }
  th.cam, td.cam { width: 64px; text-align: center; }
  th.chk, td.chk { width: 72px; text-align: center; }
  .box { display: inline-block; width: 16px; height: 16px; border: 2px solid #333; border-radius: 3px; }
  tbody tr { height: 30px; }
  .vazio { text-align: center; color: #999; font-style: italic; }
  .rodape { margin-top: 10px; font-size: 10pt; color: #444; display: flex; justify-content: space-between; }
  .rodape .ass { color: #999; }
`;

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

function temCamisa(cultos: CultoPresenca[]): boolean {
  return cultos.some((c) => c.batizandos.some((b) => b.camisa));
}

function tabelaCulto(c: CultoPresenca, comCamisa: boolean): string {
  const colCam = comCamisa ? '<th class="cam">Camisa</th>' : '';
  const linhas = c.batizandos.length
    ? c.batizandos.map((b, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(b.nome)}</td>
        <td class="cat">${escapeHtml(b.categoria || '')}</td>
        ${comCamisa ? `<td class="cam">${escapeHtml(b.camisa || '')}</td>` : ''}
        <td class="chk"><span class="box"></span></td>
      </tr>`).join('')
    : `<tr><td class="vazio" colspan="${comCamisa ? 5 : 4}">Nenhum inscrito neste culto</td></tr>`;
  return `
    <section class="culto">
      <div class="cabec">
        <div class="titulo">⛪ CB Rio · Lista de Presença — Batismo</div>
        <div class="sub">${escapeHtml(c.titulo)}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="num">#</th>
            <th>Nome</th>
            <th class="cat">Categoria</th>
            ${colCam}
            <th class="chk">Presente</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="rodape">
        <span>Total de inscritos: <strong>${c.batizandos.length}</strong></span>
        <span class="ass">Responsável: ______________________</span>
      </div>
    </section>`;
}

export function imprimirListaPresencaBatismo(cultos: CultoPresenca[]): void {
  if (!cultos.length) return;
  const comCamisa = temCamisa(cultos);
  const corpo = cultos.map((c) => tabelaCulto(c, comCamisa)).join('');
  const htmlStr = `<!doctype html><html><head><meta charset="utf-8"><title>Lista de presença — Batismo</title><style>${CSS}</style></head><body>${corpo}</body></html>`;
  const win = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
  if (!win) {
    console.warn('[listaPresencaBatismo] popup bloqueado · libere popups do site');
    return;
  }
  win.document.open();
  win.document.write(htmlStr);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch (e) { console.error('[listaPresencaBatismo] print:', e); } }, 350);
}
