// Lista mensal de aniversariantes do CBKids em A4, no molde do
// imprimirListaPresencaBatismo (thead repetido por folha + page-break-inside).
//
// Agrupamento à escolha (pedido do Matheus 2026-08-03): por DIA do mês ou por
// SALA (Berçário, Maternal, POP! 1/2, ELEVATE 1/2).
//
// ⚠️ A lista impressa SAI COM TELEFONE (decisão explícita dele — quem imprime vai
// ligar parabenizando). É PII em papel: o cabeçalho avisa, e quem imprimir é
// responsável por descartar. Se um dia isso mudar, o único lugar a mexer é aqui.

export type AniversarianteKids = {
  id: string;
  nome: string;
  dia: number;
  data_nascimento: string;
  idade_label?: string | null;
  completa_anos?: number | null;
  sala_nome?: string | null;
  sala_ordem?: number | null;
  responsaveis?: { nome?: string | null; telefone?: string | null; parentesco?: string | null }[];
};

export type AgrupamentoAniversariantes = 'dia' | 'sala';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const fmtTelefone = (t?: string | null) => {
  const d = String(t ?? '').replace(/\D+/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '';
};

const contato = (a: AniversarianteKids) => {
  const rs = (a.responsaveis || []).filter((r) => r?.nome || r?.telefone).slice(0, 2);
  if (!rs.length) return '—';
  return rs.map((r) => {
    const tel = fmtTelefone(r.telefone);
    return [esc(r.nome || 'responsável'), tel ? esc(tel) : null].filter(Boolean).join(' · ');
  }).join('<br>');
};

// Grupos na ordem OPERACIONAL (dia 1→31, ou sala do berçário ao Elevate), não A-Z.
// Grupo desconhecido/sem sala vai pro FIM em vez de desaparecer.
function agrupar(lista: AniversarianteKids[], por: AgrupamentoAniversariantes) {
  const mapa = new Map<string, { titulo: string; ordem: number; itens: AniversarianteKids[] }>();
  for (const a of lista) {
    const chave = por === 'sala' ? (a.sala_nome || '__sem__') : String(a.dia);
    const titulo = por === 'sala'
      ? (a.sala_nome || 'Sem sala definida pela idade')
      : `Dia ${a.dia}`;
    const ordem = por === 'sala' ? (a.sala_nome ? (a.sala_ordem ?? 998) : 999) : a.dia;
    if (!mapa.has(chave)) mapa.set(chave, { titulo, ordem, itens: [] });
    mapa.get(chave)!.itens.push(a);
  }
  return [...mapa.values()].sort((x, y) => x.ordem - y.ordem || x.titulo.localeCompare(y.titulo, 'pt-BR'));
}

export function imprimirAniversariantesKids(
  lista: AniversarianteKids[],
  opcoes: { mes: number; agrupamento?: AgrupamentoAniversariantes },
) {
  const por = opcoes.agrupamento || 'dia';
  const grupos = agrupar(lista || [], por);
  const total = (lista || []).length;
  const mesNome = MESES[Math.min(11, Math.max(0, (opcoes.mes || 1) - 1))];
  const hoje = new Date().toLocaleDateString('pt-BR');

  const secoes = grupos.map((g) => `
    <section>
      <h2>${esc(g.titulo)} <span class="qtd">${g.itens.length}</span></h2>
      <table>
        <thead><tr>
          <th class="w-dia">Dia</th>
          <th>Nome</th>
          <th class="w-idade">Faz</th>
          ${por === 'dia' ? '<th class="w-sala">Sala</th>' : ''}
          <th>Responsável · telefone</th>
        </tr></thead>
        <tbody>
          ${g.itens.map((a) => `<tr>
            <td class="dia">${esc(a.dia)}</td>
            <td>${esc(a.nome)}</td>
            <td>${a.completa_anos != null ? esc(a.completa_anos) + ' anos' : esc(a.idade_label || '—')}</td>
            ${por === 'dia' ? `<td class="sala">${esc(a.sala_nome || '—')}</td>` : ''}
            <td class="contato">${contato(a)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`).join('');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>Aniversariantes CBKids · ${esc(mesNome)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: system-ui, -apple-system, Arial, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    p.sub { color: #666; font-size: 11px; margin: 0 0 4px; }
    p.pii { color: #92400e; background: #fef3c7; border: 1px solid #fde68a; padding: 6px 8px;
            font-size: 10px; margin: 0 0 14px; border-radius: 4px; }
    section { margin: 0 0 16px; page-break-inside: avoid; }
    h2 { font-size: 13px; margin: 0 0 4px; padding-bottom: 3px; border-bottom: 2px solid #111; }
    h2 .qtd { font-weight: 400; color: #666; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e5e5e5;
             font-size: 11.5px; vertical-align: top; }
    th { background: #f6f6f6; font-size: 9.5px; text-transform: uppercase;
         letter-spacing: .4px; color: #555; }
    tr { page-break-inside: avoid; }
    .w-dia { width: 34px; } .w-idade { width: 60px; } .w-sala { width: 110px; }
    td.dia { text-align: center; font-weight: 600; }
    td.sala, td.contato { color: #444; }
    @media print { body { margin: 0 } }
  </style></head><body>
  <h1>Aniversariantes do CBKids — ${esc(mesNome)}</h1>
  <p class="sub">${total} criança(s) · agrupado por ${por === 'sala' ? 'sala' : 'dia'} · impresso em ${esc(hoje)}</p>
  <p class="pii">Contém telefone de responsável. Não deixe esta folha em área de circulação e descarte depois de usar.</p>
  ${total === 0 ? '<p>Nenhuma criança faz aniversário neste mês.</p>' : secoes}
  <script>window.onload=function(){window.print()}</script></body></html>`;

  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
