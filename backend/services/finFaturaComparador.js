// Comparador de fatura de cartão · IA (Fase 4)
//
// Recebe o PDF da fatura do banco (aceita PDF COM SENHA — o Matheus informa a
// senha no upload), extrai o texto com pdfjs-dist (suporta password nativo),
// pede ao Claude a lista de lançamentos da fatura e cruza com o que está
// LANÇADO no sistema naquele ciclo (itens da fatura · compras + transações).
// Devolve as divergências: só na fatura / só no sistema / totais.

const Anthropic = require('@anthropic-ai/sdk');
const { itensDaFatura } = require('./finFaturas');

const MODEL = 'claude-opus-4-8'; // fatura é o documento crítico do mês · melhor extração

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Texto do PDF (com senha opcional) via pdfjs-dist legacy (roda em Node puro)
async function extrairTextoPdf(buffer, senha) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    password: senha || undefined,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  let texto = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    texto += content.items.map((i) => i.str).join(' ') + '\n';
  }
  try { await doc.destroy(); } catch { /* ignore */ }
  return texto;
}

// IA extrai as linhas da fatura do texto cru
async function extrairLinhasFatura(texto) {
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: `Abaixo está o TEXTO extraído do PDF de uma fatura de cartão de crédito corporativo (banco brasileiro · Itaú ou Santander/Mastercard).

Extraia TODOS os lançamentos de COMPRA da fatura (ignore: pagamentos/créditos da fatura anterior, encargos financeiros/IOF de propostas de parcelamento, linhas de resumo/limite). Compra parcelada aparece como "PARC 02/10" ou "05/08" — normalize em parcela_num/parcelas_total.

Responda SÓ um JSON:
{
  "total_fatura": 12345.67,
  "vencimento": "YYYY-MM-DD",
  "lancamentos": [
    {"data": "YYYY-MM-DD" | "MM-DD", "estabelecimento": "...", "valor": 123.45, "parcela_num": 2|null, "parcelas_total": 10|null}
  ]
}

TEXTO DA FATURA:
${texto.slice(0, 60000)}`,
    }],
  });
  const t = resp.content?.[0]?.text || '{}';
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}

// Cruza fatura (IA) × sistema (itens da fatura no ERP)
function cruzar(linhasFatura, itensSistema) {
  const usados = new Set();
  const soNaFatura = [];
  const casados = [];

  for (const lf of linhasFatura) {
    const v = Math.abs(Number(lf.valor) || 0);
    if (!v) continue;
    // candidato: mesmo valor (±0,01) ainda não usado; desempata por nome
    const cands = itensSistema
      .map((it, idx) => ({ it, idx }))
      .filter(({ it, idx }) => !usados.has(idx) && Math.abs(it.valor - v) <= 0.01);
    let escolhido = null;
    if (cands.length === 1) escolhido = cands[0];
    else if (cands.length > 1) {
      const alvo = norm(lf.estabelecimento);
      escolhido = cands.find(({ it }) => {
        const nome = norm(it.descricao);
        return alvo && nome && (alvo.includes(nome.slice(0, 6)) || nome.includes(alvo.slice(0, 6)));
      }) || cands[0];
    }
    if (escolhido) {
      usados.add(escolhido.idx);
      casados.push({ fatura: lf, sistema: escolhido.it });
    } else {
      soNaFatura.push(lf);
    }
  }

  const soNoSistema = itensSistema.filter((_, idx) => !usados.has(idx));
  return { casados, soNaFatura, soNoSistema };
}

// Fluxo completo · retorna o relatório de divergências
async function compararFatura({ faturaId, buffer, senha }) {
  let texto;
  try {
    texto = await extrairTextoPdf(buffer, senha);
  } catch (e) {
    if (String(e?.name || e?.message).toLowerCase().includes('password')) {
      const err = new Error(senha
        ? 'Senha do PDF incorreta — confira e tente de novo.'
        : 'Este PDF é protegido por senha — informe a senha no envio.');
      err.status = 400;
      throw err;
    }
    throw e;
  }
  if (!texto || texto.trim().length < 100) {
    const err = new Error('Não consegui ler o texto deste PDF (pode ser digitalizado como imagem).');
    err.status = 400;
    throw err;
  }

  const extraido = await extrairLinhasFatura(texto);
  const { itens } = await itensDaFatura(faturaId);
  const { casados, soNaFatura, soNoSistema } = cruzar(extraido.lancamentos || [], itens);

  const totalSistema = itens.reduce((s, i) => s + i.valor, 0);
  return {
    total_fatura: extraido.total_fatura ?? null,
    vencimento_fatura: extraido.vencimento ?? null,
    total_sistema: Math.round(totalSistema * 100) / 100,
    lancamentos_fatura: (extraido.lancamentos || []).length,
    lancamentos_sistema: itens.length,
    casados: casados.length,
    so_na_fatura: soNaFatura,       // está na fatura e NÃO foi lançado
    so_no_sistema: soNoSistema,     // lançado no sistema mas não achado na fatura
  };
}

module.exports = { compararFatura, extrairTextoPdf };
