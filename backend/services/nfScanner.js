// Scanner de nota fiscal (compras/logística)
//
// Extrai dados estruturados de uma foto/PDF de nota fiscal (NF-e, NFC-e,
// cupom fiscal, recibo, fatura) via Claude Haiku com visão e sugere a
// categorização contábil reusando o motor do financeiro (memória histórica
// + regras explícitas) com fallback de IA sobre o plano de contas.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');
const { classificarLancamento } = require('./financeiroClassificador');

const MODEL = 'claude-haiku-4-5-20251001';

const EXTRACT_PROMPT = `Você está lendo o documento de uma compra feita por uma igreja: nota fiscal eletrônica (NF-e/DANFE), NFC-e, cupom fiscal, recibo ou fatura.

Extraia os dados e responda APENAS com JSON válido (sem markdown, sem backticks):
{
  "emitente_nome": "razão social ou nome fantasia de quem VENDEU (null se ilegível)",
  "emitente_cnpj": "CNPJ do emitente, só dígitos (null se ausente)",
  "numero": "número da nota/cupom (null se ausente)",
  "serie": "série da nota (null se ausente)",
  "chave_acesso": "chave de acesso de 44 dígitos, só dígitos (null se ausente)",
  "data_emissao": "data de emissão em YYYY-MM-DD (null se ilegível)",
  "valor_total": 123.45,
  "forma_pagamento": "dinheiro | pix | credito | debito | boleto | null",
  "descricao_resumo": "resumo de UMA linha do que foi comprado, em português",
  "itens": [{ "descricao": "...", "quantidade": 1, "valor_unitario": 1.0, "valor_total": 1.0 }],
  "tipo_documento": "nfe | nfce | cupom | recibo | fatura | outro",
  "confianca": 0.0
}

Regras:
- valor_total é o valor FINAL pago (já com descontos/impostos). Número, não string.
- Datas brasileiras vêm como DD/MM/AAAA — converta pra YYYY-MM-DD.
- Se houver muitos itens, liste no máximo 30.
- "confianca" é sua confiança geral na leitura (0 a 1).
- Não invente dados: campo ilegível ou ausente = null.`;

const soDigitos = (s) => String(s || '').replace(/\D/g, '');

function sanearExtracao(raw) {
  const cnpj = soDigitos(raw.emitente_cnpj);
  const chave = soDigitos(raw.chave_acesso);
  const valor = Number(raw.valor_total);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(raw.data_emissao || '') ? raw.data_emissao : null;
  return {
    emitente_nome: raw.emitente_nome || null,
    emitente_cnpj: cnpj.length === 14 ? cnpj : null,
    numero: raw.numero ? String(raw.numero) : null,
    serie: raw.serie ? String(raw.serie) : null,
    chave_acesso: chave.length === 44 ? chave : null,
    data_emissao: data,
    valor_total: Number.isFinite(valor) && valor > 0 ? valor : null,
    forma_pagamento: raw.forma_pagamento || null,
    descricao_resumo: raw.descricao_resumo || null,
    itens: Array.isArray(raw.itens) ? raw.itens.slice(0, 30) : [],
    tipo_documento: raw.tipo_documento || 'outro',
    confianca: Number.isFinite(Number(raw.confianca)) ? Number(raw.confianca) : null,
  };
}

/**
 * Lê a nota fiscal (imagem ou PDF) e devolve { extraido, raw }.
 * Lança erro se a IA não devolver JSON utilizável.
 */
async function extrairNotaFiscal(buffer, mimeType, model = MODEL) {
  const client = new Anthropic();
  const bloco = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } };

  const response = await client.messages.create({
    model,
    max_tokens: 2500,
    messages: [{ role: 'user', content: [bloco, { type: 'text', text: EXTRACT_PROMPT }] }],
  });

  const texto = response.content?.filter((b) => b.type === 'text').map((b) => b.text).join('') || '';
  const raw = JSON.parse(texto.replace(/```json|```/g, '').trim());
  return { extraido: sanearExtracao(raw), raw };
}

/**
 * Sugere plano de contas + centro de custo pra compra.
 * 1. Motor do financeiro (memória histórica do fornecedor + regras por CNPJ/palavra-chave)
 * 2. Fallback: Haiku escolhe a conta de despesa mais adequada do plano vigente
 * Retorna { plano_contas_id, centro_custo_id, origem, confianca, explicacao } ou null.
 */
async function sugerirCategoria({ cnpj, nome, valor, descricao }) {
  try {
    const sugestao = await classificarLancamento({
      valor: -Math.abs(Number(valor) || 0),
      tipo_trn: 'DEBIT',
      memo: [nome, descricao].filter(Boolean).join(' · '),
      documento_contraparte: cnpj || null,
      nome_contraparte: nome || null,
      banco_origem: null,
    });
    if (sugestao?.plano_contas_id) return sugestao;
  } catch (e) {
    console.error('[NF-SCAN] classificador:', e.message);
  }

  try {
    const [{ data: planos }, { data: centros }] = await Promise.all([
      supabase.from('fin_plano_contas')
        .select('id, codigo, nome')
        .eq('tipo', 'despesa').eq('ativo', true).eq('aceita_lancamento', true)
        .order('codigo'),
      supabase.from('fin_centros_custo')
        .select('id, codigo, nome')
        .eq('ativo', true).eq('aceita_lancamento', true)
        .order('codigo'),
    ]);
    if (!planos?.length) return null;

    const client = new Anthropic();
    const prompt = `Uma igreja comprou: "${descricao || 'sem descrição'}" do fornecedor "${nome || 'desconhecido'}" por R$ ${valor || '?'}.

Escolha a conta de DESPESA mais adequada no plano de contas e, se fizer sentido, o centro de custo. Responda APENAS com JSON válido:
{ "plano_codigo": "...", "centro_codigo": "... ou null", "justificativa": "1 frase em português" }

Plano de contas (codigo · nome):
${planos.map((p) => `${p.codigo} · ${p.nome}`).join('\n')}

Centros de custo (codigo · nome):
${(centros || []).map((c) => `${c.codigo} · ${c.nome}`).join('\n')}`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const texto = response.content?.filter((b) => b.type === 'text').map((b) => b.text).join('') || '';
    const json = JSON.parse(texto.replace(/```json|```/g, '').trim());

    const plano = planos.find((p) => p.codigo === json.plano_codigo);
    if (!plano) return null;
    const centro = (centros || []).find((c) => c.codigo === json.centro_codigo) || null;
    return {
      plano_contas_id: plano.id,
      centro_custo_id: centro?.id || null,
      origem: 'ia',
      confianca: 0.6,
      explicacao: `IA: ${json.justificativa || plano.nome}`,
    };
  } catch (e) {
    console.error('[NF-SCAN] sugestão IA:', e.message);
    return null;
  }
}

module.exports = { extrairNotaFiscal, sugerirCategoria };
