// Relatório do censo em A4, no molde dos outros imprimíveis da casa
// (window.open + HTML próprio + window.print) — o sistema não usa lib de PDF,
// e quem gera o arquivo é o "Salvar como PDF" do navegador.
//
// ⚠️ O relatório sai COM AS TABELAS que sustentam o texto, não só com a prosa
// da IA. Análise sem o número ao lado não se confere — e este documento vai
// para uma reunião onde alguém vai querer discordar com base.
//
// ⚠️ NÃO contém dado de pessoa: o relatório inteiro é contagem e porcentagem
// (ver `backend/utils/censoRelatorioDados.js`). É a única razão de poder ser
// impresso e circular sem o aviso de PII que a lista do Kids leva.

export type RelatorioCenso = {
  modelo?: string;
  gerado_em?: string;
  respostas_na_base?: number;
  conteudo: {
    resumo_executivo?: { paragrafo?: string; pontos?: string[] } | null;
    achados?: { titulo: string; o_que_os_dados_mostram: string; forca: string; ressalva: string }[];
    recomendacoes?: { titulo: string; tipo: string; porque: string; base_numerica: number; como_medir: string }[];
    recomendacoes_descartadas?: { titulo: string; base_numerica: number | null }[];
    o_que_o_censo_nao_responde?: string[];
    perfil?: { pergunta: string; base: number; opcoes: { valor: string; n: number; pct: number | null }[] }[];
    cruzamentos?: {
      eixo: string; controle?: string | null; motivo: string;
      faixas: { controle: string | null; valor: string; pessoas: number;
                metricas: Record<string, { n: number; sim: number; pct_sim: number | null }> }[];
    }[];
  };
};

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const TIPO_ROTULO: Record<string, string> = {
  serie_pregacao: 'Série de pregação',
  evento: 'Evento',
  processo: 'Processo',
  comunicacao: 'Comunicação',
  cuidado: 'Cuidado',
};

export function imprimirRelatorioCenso(titulo: string, rel: RelatorioCenso): boolean {
  const c = rel.conteudo || {};
  const hoje = new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' });
  const geradoEm = rel.gerado_em
    ? new Date(rel.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  const resumo = c.resumo_executivo;
  const blocoResumo = resumo ? `
    <section class="destaque">
      <h2>Resumo executivo</h2>
      <p>${esc(resumo.paragrafo)}</p>
      <ul>${(resumo.pontos || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    </section>` : '';

  const blocoAchados = (c.achados || []).length ? `
    <section>
      <h2>Achados</h2>
      ${(c.achados || []).map((a) => `
        <div class="item">
          <h3>${esc(a.titulo)} <span class="forca forca-${esc(a.forca)}">${esc(a.forca)}</span></h3>
          <p>${esc(a.o_que_os_dados_mostram)}</p>
          <p class="ressalva"><b>Ressalva:</b> ${esc(a.ressalva)}</p>
        </div>`).join('')}
    </section>` : '';

  const blocoRec = (c.recomendacoes || []).length ? `
    <section>
      <h2>Recomendações</h2>
      <p class="nota">Cada uma cita um número deste censo. As que não citavam foram descartadas automaticamente.</p>
      ${(c.recomendacoes || []).map((r) => `
        <div class="item">
          <h3>${esc(r.titulo)} <span class="tag">${esc(TIPO_ROTULO[r.tipo] || r.tipo)}</span></h3>
          <p>${esc(r.porque)}</p>
          <p class="medir"><b>Como medir:</b> ${esc(r.como_medir)}</p>
        </div>`).join('')}
    </section>` : '';

  const blocoLimites = (c.o_que_o_censo_nao_responde || []).length ? `
    <section>
      <h2>O que este censo não responde</h2>
      <ul>${(c.o_que_o_censo_nao_responde || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>` : '';

  // ⚠️ As tabelas vêm DEPOIS do texto e em corpo menor: elas são a prova, não
  // a leitura. Mas vêm — sem elas o relatório é a palavra do modelo.
  const blocoPerfil = (c.perfil || []).length ? `
    <section class="anexo">
      <h2>Anexo · perfil dos respondentes</h2>
      ${(c.perfil || []).map((p) => `
        <table>
          <thead><tr><th colspan="3">${esc(p.pergunta)} <span class="qtd">(base ${p.base})</span></th></tr></thead>
          <tbody>${p.opcoes.map((o) => `
            <tr><td>${esc(o.valor)}</td><td class="n">${o.n}</td><td class="n">${o.pct == null ? '—' : o.pct + '%'}</td></tr>`).join('')}
          </tbody>
        </table>`).join('')}
    </section>` : '';

  const blocoCruz = (c.cruzamentos || []).length ? `
    <section class="anexo">
      <h2>Anexo · cruzamentos</h2>
      ${(c.cruzamentos || []).map((cr) => {
        const metricas = [...new Set(cr.faixas.flatMap((f) => Object.keys(f.metricas)))];
        return `
        <h3>${esc(cr.eixo)}${cr.controle ? ` <span class="qtd">(controlando por ${esc(cr.controle)})</span>` : ''}</h3>
        <p class="nota">${esc(cr.motivo)}</p>
        <table>
          <thead><tr>
            ${cr.controle ? `<th>${esc(cr.controle)}</th>` : ''}
            <th>${esc(cr.eixo)}</th><th class="n">pessoas</th>
            ${metricas.map((m) => `<th class="n">${esc(m)}</th>`).join('')}
          </tr></thead>
          <tbody>${cr.faixas.map((f) => `
            <tr>
              ${cr.controle ? `<td>${esc(f.controle)}</td>` : ''}
              <td>${esc(f.valor)}</td><td class="n">${f.pessoas}</td>
              ${metricas.map((m) => {
                const v = f.metricas[m];
                return `<td class="n">${v ? `${v.pct_sim}% <span class="qtd">(${v.sim}/${v.n})</span>` : '—'}</td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>`;
      }).join('')}
    </section>` : '';

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>Relatório do censo — ${esc(titulo)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    body { font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
           color: #111; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -.02em; }
    .sub { color: #666; font-size: 11px; margin: 0 0 18px; }
    h2 { font-size: 14px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #111; }
    h3 { font-size: 12.5px; margin: 12px 0 3px; }
    p { margin: 0 0 7px; }
    ul { margin: 6px 0 0; padding-left: 18px; }
    li { margin-bottom: 4px; }
    section { page-break-inside: auto; }
    .item { page-break-inside: avoid; margin-bottom: 12px; }
    .destaque { background: #f6f7f9; border-left: 3px solid #111; padding: 12px 14px; }
    .ressalva, .medir, .nota { color: #555; font-size: 11px; }
    .forca { font-size: 9.5px; text-transform: uppercase; letter-spacing: .4px;
             padding: 1px 6px; border-radius: 999px; border: 1px solid #bbb; color: #555; font-weight: 600; }
    .forca-forte { border-color: #111; color: #111; }
    .tag { font-size: 9.5px; text-transform: uppercase; letter-spacing: .4px;
           background: #eee; padding: 1px 6px; border-radius: 999px; color: #444; font-weight: 600; }
    .anexo { page-break-before: always; }
    .anexo h2 { margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; page-break-inside: avoid; }
    th, td { text-align: left; padding: 4px 7px; border-bottom: 1px solid #e5e5e5; font-size: 10.5px; }
    th { background: #f6f6f6; font-size: 9.5px; text-transform: uppercase; letter-spacing: .3px; color: #555; }
    td.n, th.n { text-align: right; white-space: nowrap; }
    .qtd { font-weight: 400; color: #777; }
    @media print { body { margin: 0 } }
  </style></head><body>
  <h1>Relatório do censo — ${esc(titulo)}</h1>
  <p class="sub">${rel.respostas_na_base ?? 0} respostas · análise gerada em ${esc(geradoEm)}${rel.modelo ? ` por ${esc(rel.modelo)}` : ''} · impresso em ${esc(hoje)}</p>
  ${blocoResumo}${blocoAchados}${blocoRec}${blocoLimites}${blocoPerfil}${blocoCruz}
  <script>window.onload=function(){window.print()}</script></body></html>`;

  const w = window.open('', '_blank');
  // ⚠️ Bloqueador de pop-up recusa em silêncio. Devolve false para a tela poder
  // dizer o que houve, em vez de o botão parecer quebrado.
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
