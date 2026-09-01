// Espelho da NF-e em A4 — abre a janela de impressão, e o navegador salva em PDF.
//
// ⚠️⚠️ ISTO NÃO É O DANFE OFICIAL, e a folha DIZ isso em destaque.
// O DANFE tem layout normatizado pela SEFAZ, com código de barras CODE-128 da
// chave de acesso e blocos em posições fixas. Reproduzi-lo pela metade produz um
// papel que PARECE documento fiscal e não é — pior que um espelho honesto.
// O documento fiscal válido é o XML, que fica guardado em `xml_content`.
//
// Serve para o que o Matheus pediu: ler, arquivar e mandar pro financeiro.
// Mesmo padrão dos outros impressos do sistema (lista de presença do batismo,
// aniversariantes do Kids): HTML A4 + window.print().

export interface NfeItem {
  descricao?: string | null;
  codigo?: string | null;
  ncm?: string | null;
  cfop?: string | null;
  unidade?: string | null;
  quantidade?: number | null;
  valor_unitario?: number | null;
  valor_total?: number | null;
}

export interface NfeEndereco {
  logradouro?: string | null; numero?: string | null; complemento?: string | null;
  bairro?: string | null; municipio?: string | null; uf?: string | null;
  cep?: string | null; fone?: string | null;
}

export interface NfeEspelho {
  chave_acesso: string;
  numero?: string | null;
  serie?: string | null;
  data_emissao?: string | null;
  valor?: number | null;
  natureza_operacao?: string | null;
  emitente_nome?: string | null;
  emitente_fantasia?: string | null;
  emitente_cnpj?: string | null;
  emitente_ie?: string | null;
  emitente_endereco?: NfeEndereco | null;
  destinatario_nome?: string | null;
  destinatario_cnpj?: string | null;
  destinatario_endereco?: NfeEndereco | null;
  itens?: NfeItem[] | null;
  totais?: Record<string, number | null> | null;
  informacoes_complementares?: string | null;
  protocolo?: string | null;
  autorizada_em?: string | null;
  via_mercadolivre?: boolean;
}

const CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #111; background: #fff;
    font-family: 'Inter', system-ui, -apple-system, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .aviso { border: 1.5px solid #B45309; background: #FEF3C7; color: #78350F;
    padding: 7px 10px; border-radius: 5px; font-size: 8.5pt; margin-bottom: 10px; }
  .topo { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; gap: 16px; }
  .tit { font-size: 15pt; font-weight: 800; letter-spacing: .3px; }
  .sub { font-size: 9.5pt; color: #444; margin-top: 2px; }
  .numbox { text-align: right; font-size: 9.5pt; white-space: nowrap; }
  .numbox b { font-size: 13pt; }
  .chave { font-family: ui-monospace, Menlo, monospace; font-size: 8.5pt;
    letter-spacing: .6px; word-break: break-all; border: 1px solid #999;
    padding: 5px 7px; border-radius: 4px; background: #FAFAFA; margin-bottom: 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .bloco { border: 1px solid #999; border-radius: 4px; padding: 7px 9px; }
  .bloco h3 { margin: 0 0 4px; font-size: 8pt; text-transform: uppercase;
    letter-spacing: .5px; color: #555; font-weight: 700; }
  .bloco .nome { font-size: 10.5pt; font-weight: 700; }
  .bloco .linha { font-size: 9pt; color: #333; margin-top: 1px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { border: 1px solid #999; padding: 5px 6px; font-size: 8.5pt; text-align: left;
    vertical-align: top; }
  thead th { background: #EFEFEF; font-size: 7.5pt; text-transform: uppercase;
    letter-spacing: .3px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tot { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
  .tot div { border: 1px solid #999; border-radius: 4px; padding: 5px 7px; }
  .tot .rot { font-size: 7.5pt; text-transform: uppercase; color: #555; letter-spacing: .3px; }
  .tot .val { font-size: 10.5pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .tot .destaque { background: #111; color: #fff; }
  .tot .destaque .rot { color: #ccc; }
  .obs { border: 1px solid #999; border-radius: 4px; padding: 7px 9px; font-size: 8pt;
    color: #333; white-space: pre-wrap; }
  .rodape { margin-top: 10px; font-size: 8pt; color: #666; display: flex;
    justify-content: space-between; gap: 12px; }
`;

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const dinheiro = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ⚠️ Data vem como 'YYYY-MM-DD' (o parser já fatiou do ISO). Montar com
// `new Date('2026-08-18')` devolveria 17/08 em fuso negativo — a armadilha
// registrada no projeto. Aqui é troca de posição, sem Date nenhum.
function dataBR(iso?: string | null) {
  if (!iso) return '—';
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

const doc = (v?: string | null) => {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v || '—';
};

const chaveFormatada = (c: string) =>
  String(c || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim();

function enderecoLinha(e?: NfeEndereco | null) {
  if (!e) return '';
  const rua = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ');
  const cidade = [e.bairro, [e.municipio, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');
  const cep = e.cep ? `CEP ${String(e.cep).replace(/(\d{5})(\d{3})/, '$1-$2')}` : '';
  return [rua, cidade, cep].filter(Boolean).join(' — ');
}

function blocoParte(rotulo: string, nome?: string | null, docNum?: string | null,
                    ie?: string | null, end?: NfeEndereco | null) {
  const linhas = [
    docNum ? `CNPJ/CPF: ${doc(docNum)}${ie ? ` · IE: ${esc(ie)}` : ''}` : '',
    enderecoLinha(end),
    end?.fone ? `Tel: ${esc(end.fone)}` : '',
  ].filter(Boolean);
  return `<div class="bloco">
    <h3>${esc(rotulo)}</h3>
    <div class="nome">${esc(nome || '—')}</div>
    ${linhas.map((l) => `<div class="linha">${l}</div>`).join('')}
  </div>`;
}

export function montarHtmlNfe(n: NfeEspelho): string {
  const itens = Array.isArray(n.itens) ? n.itens : [];
  const t = n.totais || {};
  const emitNome = n.emitente_fantasia
    ? `${n.emitente_fantasia} (${n.emitente_nome || ''})`.replace(' ()', '')
    : n.emitente_nome;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>NF-e ${esc(n.numero || '')} — ${esc(n.emitente_fantasia || n.emitente_nome || '')}</title>
<style>${CSS}</style></head><body>

<div class="aviso">
  <strong>Espelho da NF-e para conferência e arquivo.</strong>
  Não substitui o DANFE oficial — o documento fiscal válido é o arquivo XML,
  guardado no sistema.
</div>

<div class="topo">
  <div>
    <div class="tit">Nota Fiscal Eletrônica</div>
    <div class="sub">${esc(n.natureza_operacao || 'Operação não informada')}</div>
  </div>
  <div class="numbox">
    Nº <b>${esc(n.numero || '—')}</b>${n.serie ? ` · Série ${esc(n.serie)}` : ''}<br>
    Emissão: <b>${dataBR(n.data_emissao)}</b>
    ${n.via_mercadolivre ? '<br><span class="sub">via Mercado Livre</span>' : ''}
  </div>
</div>

<div class="chave"><strong>Chave de acesso:</strong> ${esc(chaveFormatada(n.chave_acesso))}</div>

<div class="grid2">
  ${blocoParte('Emitente', emitNome, n.emitente_cnpj, n.emitente_ie, n.emitente_endereco)}
  ${blocoParte('Destinatário', n.destinatario_nome, n.destinatario_cnpj, null, n.destinatario_endereco)}
</div>

<table>
  <thead><tr>
    <th style="width:26px">#</th><th>Descrição</th>
    <th style="width:62px">NCM</th><th style="width:46px">CFOP</th>
    <th style="width:40px">Un</th><th style="width:52px" class="num">Qtd</th>
    <th style="width:80px" class="num">V. unit.</th><th style="width:88px" class="num">Total</th>
  </tr></thead>
  <tbody>
    ${itens.length ? itens.map((i, k) => `<tr>
      <td>${k + 1}</td>
      <td>${esc(i.descricao || '—')}${i.codigo ? `<br><span style="color:#777">cód. ${esc(i.codigo)}</span>` : ''}</td>
      <td>${esc(i.ncm || '—')}</td><td>${esc(i.cfop || '—')}</td>
      <td>${esc(i.unidade || '—')}</td>
      <td class="num">${i.quantidade ?? '—'}</td>
      <td class="num">${dinheiro(i.valor_unitario)}</td>
      <td class="num">${dinheiro(i.valor_total)}</td>
    </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:#888">Sem itens no XML</td></tr>'}
  </tbody>
</table>

<div class="tot">
  <div><div class="rot">Produtos</div><div class="val">${dinheiro(t.produtos)}</div></div>
  <div><div class="rot">Frete</div><div class="val">${dinheiro(t.frete)}</div></div>
  <div><div class="rot">Desconto</div><div class="val">${dinheiro(t.desconto)}</div></div>
  <div class="destaque"><div class="rot">Total da nota</div><div class="val">${dinheiro(t.nota ?? n.valor)}</div></div>
</div>

${n.informacoes_complementares
    ? `<div class="obs"><strong>Informações complementares:</strong>\n${esc(n.informacoes_complementares)}</div>`
    : ''}

<div class="rodape">
  <span>${n.protocolo ? `Protocolo de autorização: ${esc(n.protocolo)}` : 'Sem protocolo no XML'}</span>
  <span>Sistema Integrado CBRio</span>
</div>

</body></html>`;
}

/**
 * Abre a folha numa janela nova e chama a impressão (o usuário escolhe
 * "Salvar como PDF").
 *
 * ⚠️ Bloqueador de pop-up derruba isso em silêncio: `window.open` devolve null
 * e, sem checar, o clique não faz nada e a pessoa acha que o botão quebrou.
 * @returns false quando não conseguiu abrir — quem chama avisa.
 */
export function imprimirNfe(n: NfeEspelho): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(montarHtmlNfe(n));
  w.document.close();
  // O print precisa esperar o layout; onload cobre o caso do CSS ainda pendente.
  w.onload = () => { w.focus(); w.print(); };
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* já impresso */ } }, 400);
  return true;
}
