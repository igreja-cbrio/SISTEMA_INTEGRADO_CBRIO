import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const { lerNfe, chaveValida } = require_('../../backend/utils/nfeXml.js');

// XML REAL de uma compra do Mercado Livre da igreja (18/08/2026), fornecido pelo
// Matheus. Testar contra o arquivo de verdade — e não contra o formato que eu
// imagino — é o que garante que o importador funciona no primeiro lote.
const XML = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'nfe-mercadolivre.xml'),
  'utf8');

const CNPJ_IGREJA = '07023068000135';

describe('lerNfe · o XML real da compra', () => {
  const { ok, nota } = lerNfe(XML, { cnpjDestinatario: CNPJ_IGREJA });

  it('lê a nota', () => expect(ok).toBe(true));

  it('chave de acesso com 44 dígitos', () => {
    expect(nota.chave_acesso).toBe('35260819556063000157550050000250521618175805');
    expect(nota.chave_acesso).toHaveLength(44);
  });

  it('número, série e data de emissão', () => {
    expect(nota.numero).toBe('25052');
    expect(nota.serie).toBe('5');
    expect(nota.data_emissao).toBe('2026-08-18');
  });

  it('⚠️ o EMITENTE é quem vendeu — não a igreja', () => {
    expect(nota.emitente_cnpj).toBe('19556063000157');
    expect(nota.emitente_nome).toBe('Alessandra Roberta Silvestre Manduca ME');
    expect(nota.emitente_fantasia).toBe('Le Pelucias e Decoracoes');
  });

  it('⚠️ o DESTINATÁRIO é a igreja (a mesma tag CNPJ dos dois lados)', () => {
    expect(nota.destinatario_cnpj).toBe(CNPJ_IGREJA);
  });

  it('⚠️ o valor é o vNF de <ICMSTot>, não um <vProd> qualquer', () => {
    expect(nota.valor).toBe(106.62);
  });

  it('lê os itens com quantidade e valor', () => {
    expect(nota.itens).toHaveLength(1);
    expect(nota.itens[0].descricao).toContain('Trocador De Comoda');
    expect(nota.itens[0].quantidade).toBe(1);
    expect(nota.itens[0].valor_unitario).toBeCloseTo(106.62);
    expect(nota.itens[0].valor_total).toBe(106.62);
    expect(nota.itens[0].ncm).toBe('63026000');
    expect(nota.itens[0].cfop).toBe('6108');
  });

  it('reconhece o Mercado Livre como intermediador', () => {
    expect(nota.via_mercadolivre).toBe(true);
    expect(nota.intermediador).toBe('mercadolivre');
  });

  it('guarda o protocolo de autorização', () => {
    expect(nota.protocolo).toBe('135263395331709');
  });
});

describe('lerNfe · o que precisa ser RECUSADO', () => {
  it('nota de OUTRO destinatário não entra como despesa nossa', () => {
    const r = lerNfe(XML, { cnpjDestinatario: '99999999999999' });
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('destinatario_diferente');
  });

  it('sem informar o CNPJ esperado, não filtra (uso genérico)', () => {
    expect(lerNfe(XML).ok).toBe(true);
  });

  it('⚠️ nota CANCELADA/denegada não vira gasto', () => {
    const cancelada = XML.replace('<cStat>100</cStat>', '<cStat>101</cStat>');
    const r = lerNfe(cancelada, { cnpjDestinatario: CNPJ_IGREJA });
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('nao_autorizada');
  });

  it('arquivo que não é NF-e', () => {
    expect(lerNfe('<html><body>oi</body></html>').erro).toBe('nao_e_nfe');
    expect(lerNfe('').erro).toBe('arquivo_vazio');
    expect(lerNfe(null as never).erro).toBe('arquivo_vazio');
  });

  it('sem total não inventa valor somando itens', () => {
    const semTotal = XML.replace(/<total>[\s\S]*?<\/total>/, '');
    expect(lerNfe(semTotal).erro).toBe('sem_valor_total');
  });

  it('sem data não carimba hoje', () => {
    const semData = XML.replace(/<dhEmi>[\s\S]*?<\/dhEmi>/, '');
    expect(lerNfe(semData).erro).toBe('sem_data_emissao');
  });

  // ⚠️ `Number('abc')` é NaN e `Number('')` é 0 — sem a guarda de finitude, um
  // total ilegível viraria NaN gravado ou uma compra de R$ 0,00. Este caso é o
  // que trava a guarda; sem ele, remover a checagem passa despercebido.
  it('total ilegível é recusado — nunca vira NaN nem R$ 0,00', () => {
    const ruim = XML.replace('<vNF>106.62</vNF>', '<vNF>abc</vNF>');
    const r = lerNfe(ruim, { cnpjDestinatario: CNPJ_IGREJA });
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('sem_valor_total');
  });

  it('quantidade ilegível do item vira null, não 0', () => {
    const ruim = XML.replace('<qCom>1.0000</qCom>', '<qCom>--</qCom>');
    const r = lerNfe(ruim, { cnpjDestinatario: CNPJ_IGREJA });
    expect(r.ok).toBe(true);
    expect(r.nota.itens[0].quantidade).toBeNull();
  });
});

describe('chaveValida', () => {
  it('exige exatamente 44 dígitos', () => {
    expect(chaveValida('3'.repeat(44))).toBe(true);
    expect(chaveValida('3'.repeat(43))).toBe(false);
    expect(chaveValida('3'.repeat(45))).toBe(false);
    expect(chaveValida('')).toBe(false);
    expect(chaveValida(null)).toBe(false);
  });

  it('aceita chave com máscara, comparando só os dígitos', () => {
    expect(chaveValida('3526 0819 5560 6300 0157 5500 5000 0250 5216 1817 5805')).toBe(true);
  });
});
