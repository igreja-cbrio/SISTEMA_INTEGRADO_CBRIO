// Contrato da extração de CPF/CNPJ do memo de extrato bancário.
//
// ⚠️⚠️ Este arquivo existe por causa de um bug que só apareceu quando o extrato
// ficou BOM. Do arquivo real de 90 dias (04/06→02/09/2026), 5.921 créditos
// trazem CPF no memo — e o parser antigo acertou ZERO, devolvendo 5.921 CNPJs
// inexistentes, porque colapsava o memo em dígitos e a data `04/06` colava no
// CPF. Depois do conserto: 5.921 de 5.921.
//
// ⚠️ Os documentos aqui são SINTÉTICOS (dígito verificador válido, pessoa
// nenhuma). CPF de doador real não entra em arquivo versionado.
import { describe, it, expect } from 'vitest';
import {
  cpfValido, cnpjValido, extrairDocumentoDoMemo, ehBloqueado, CNPJ_IGREJA,
} from '../../backend/utils/documentoBr';

const CPF = '11144477735';
const CPF_FMT = '111.444.777-35';
const CPF2 = '12345678909';
const CNPJ = '11222333000181';
const CNPJ_FMT = '11.222.333/0001-81';

const doc = (memo: string) => extrairDocumentoDoMemo(memo)?.documento ?? null;

describe('dígito verificador', () => {
  it('valida CPF', () => {
    expect(cpfValido(CPF)).toBe(true);
    expect(cpfValido(CPF_FMT)).toBe(true);
    expect(cpfValido('11144477736')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false); // repetido não é CPF
    expect(cpfValido('')).toBe(false);
  });

  it('valida CNPJ — não existia no sistema, e é o que barra o lixo do memo', () => {
    expect(cnpjValido(CNPJ)).toBe(true);
    expect(cnpjValido(CNPJ_FMT)).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    // Nasceu de "237.6592.JOAO M N JOAO MORAES NETO": banco+agência colados.
    expect(cnpjValido('23765921258137')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });
});

describe('extração do memo', () => {
  it('⚠️ o caso que quebrava: a DATA colada no CPF', () => {
    // Antes: dígitos viravam "0406" + CPF, e `\d{14}` devolvia "04061114447773".
    expect(doc(`PIX RECEBIDO FULANO 04/06 FULANO DE TAL ${CPF_FMT}`)).toBe(CPF);
    expect(doc(`PIX RECEBIDO FULANO04/06 FULANO DE TAL ${CPF_FMT}`)).toBe(CPF);
    expect(doc(`PIX RECEBIDO X 31/12 SICRANO ${CPF_FMT}`)).toBe(CPF);
  });

  it('aceita CPF formatado E cru', () => {
    expect(doc(`PIX RECEBIDO ${CPF_FMT}`)).toBe(CPF);
    expect(doc(`PIX RECEBIDO ${CPF}`)).toBe(CPF);
  });

  it('aceita CNPJ formatado e cru', () => {
    expect(doc(`PIX RECEBIDO EMPRESA ${CNPJ_FMT}`)).toBe(CNPJ);
    expect(doc(`PIX RECEBIDO EMPRESA ${CNPJ}`)).toBe(CNPJ);
    expect(extrairDocumentoDoMemo(`PIX ${CNPJ_FMT}`)?.tipo).toBe('cnpj');
  });

  it('⚠️ documento com DV inválido é DESCARTADO, nunca devolvido', () => {
    expect(doc('PIX RECEBIDO 11144477736')).toBeNull();
    expect(doc('237.6592.JOAO M N JOAO MORAES NETO')).toBeNull();
    expect(doc('TED 12345678901234')).toBeNull();
  });

  it('⚠️ o CNPJ da PRÓPRIA IGREJA nunca é contraparte', () => {
    expect(ehBloqueado(CNPJ_IGREJA)).toBe(true);
    // Entrou como "contraparte" em 10 créditos de R$ 360.680 que são
    // transferência entre contas próprias — nem receita são.
    expect(doc(`PIX RECEBIDO ${CNPJ_IGREJA}`)).toBeNull();
  });

  it('⚠️ adquirente não é doador — o crédito dela é repasse agregado', () => {
    expect(doc('RECEBIMENTO REDE AMEX CD REDECARD 00749048760142')).toBeNull();
    expect(doc('RECEBIMENTO STONE MAST CD STONE 16501555000157')).toBeNull();
  });

  it('⚠️ dois documentos DIFERENTES no mesmo memo não viram chute', () => {
    const r = extrairDocumentoDoMemo(`PIX ${CPF_FMT} ${CPF2}`);
    expect(r?.documento).toBeNull();
    expect(r?.motivo).toBe('ambiguo'); // e o motivo é declarado, não silêncio
  });

  it('o MESMO documento repetido no memo não é ambiguidade', () => {
    expect(doc(`PIX ${CPF_FMT} REF ${CPF}`)).toBe(CPF);
  });

  it('memo sem documento devolve null', () => {
    expect(doc('TRANSFERENCIA ENTRE CONTA')).toBeNull();
    expect(doc('PIX RECEBIDO')).toBeNull();
    expect(doc('')).toBeNull();
    expect(doc(null as unknown as string)).toBeNull();
  });

  it('⚠️ a fronteira segura o número maior dos dois lados', () => {
    // Sem fronteira, um id longo entrega os 11/14 primeiros dígitos dele.
    expect(doc(`FITID 3957130004222202605040 ${CPF_FMT}`)).toBe(CPF);
    expect(doc('DOC 999111444777350000')).toBeNull();
  });

  it('CNPJ formatado vence CPF cru no mesmo memo — pontuação é sinal mais forte', () => {
    expect(doc(`PIX ${CNPJ_FMT} REF ${CPF}`)).toBe(CNPJ);
  });
});
