// A hora do OFX é HORA ou é CARIMBO do banco?
//
// ⚠️⚠️ O caso que originou isto (03/09/2026): o Matheus perguntou "no OFX vem
// dia ou horário da contribuição?". Dia vem e é confiável. Hora vem — e as
// **7.297** transações do extrato de 90 dias do Santander têm `<DTPOSTED>`
// terminando em `100000`, ou seja **10:00:00 em todas**, do primeiro ao último
// lançamento. É constante do banco, não hora da transação.
//
// Estava sendo gravada como se fosse medida: **11.716 linhas** de
// `fin_lancamentos_brutos` com `hora_lancamento = 10:00:00` e
// `hora_origem = 'ofx'` (contra 85 com hora real, vinda do `pix_match`).
//
// O dano concreto é o item 1 abaixo — os outros dois são o motivo de nunca
// deixar precisão inventada entrar no banco:
//   1. `matchOfxPix` só age onde `hora_lancamento IS NULL` ⇒ a hora falsa
//      TRANCA o casamento com o extrato PIX, que é justamente quem traria a
//      hora real, o `end_to_end_id` e o `pagador_nome`.
//   2. `hora_origem: 'ofx'` afirma que o dado foi medido.
//   3. `fin_identifica_culto` decide o culto da oferta pela hora.
import { describe, it, expect } from 'vitest';
import { horaEhCarimbo, parseOfx } from '../../backend/services/ofxParser';

const ofx = (dts: string[]) =>
  '<OFX><BANKID>033</BANKID><ACCTID>1</ACCTID>' +
  dts
    .map(
      (dt, i) =>
        `<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>${dt}</DTPOSTED>` +
        `<TRNAMT>10,00</TRNAMT><FITID>F${i}</FITID><MEMO>PIX</MEMO></STMTTRN>`,
    )
    .join('') +
  '</OFX>';

describe('horaEhCarimbo', () => {
  it('⚠️ o caso real: hora idêntica no arquivo inteiro é carimbo', () => {
    const horas = Array(7297).fill('10:00:00');
    expect(horaEhCarimbo(horas)).toEqual({ hora: '10:00:00', transacoes: 7297 });
  });

  it('hora que VARIA é hora de verdade — nunca descarta', () => {
    expect(horaEhCarimbo(['10:00:00', '10:00:00', '14:32:11'])).toBeNull();
    expect(horaEhCarimbo(['09:16:00', '20:18:00', '13:52:00', '16:42:00'])).toBeNull();
  });

  it('⚠️ arquivo pequeno NÃO é carimbo — a igualdade ali é trivial', () => {
    // Uma ou duas transações no mesmo horário pode ser hora real. O piso existe
    // para não jogar fora hora boa de extrato curto.
    expect(horaEhCarimbo(['10:00:00'])).toBeNull();
    expect(horaEhCarimbo(['10:00:00', '10:00:00'])).toBeNull();
    expect(horaEhCarimbo(['10:00:00', '10:00:00', '10:00:00'])).not.toBeNull();
  });

  it('arquivo sem hora nenhuma não vira carimbo', () => {
    expect(horaEhCarimbo([null, null, null, null])).toBeNull();
    expect(horaEhCarimbo([])).toBeNull();
  });

  it('⚠️ hora em PARTE das linhas não é carimbo uniforme — deixa passar', () => {
    // Se só metade tem hora, a hora presente é informação, não constante do
    // arquivo. Descartar ali destruiria dado bom.
    expect(horaEhCarimbo(['10:00:00', '10:00:00', '10:00:00', null])).toBeNull();
  });
});

describe('parseOfx descarta o carimbo e DECLARA', () => {
  it('⚠️ zera hora E hora_origem — não basta zerar uma', () => {
    const r = parseOfx(ofx(['20260605100000', '20260606100000', '20260607100000']));
    expect(r.transactions).toHaveLength(3);
    expect(r.transactions.every((t: any) => t.hora_lancamento === null)).toBe(true);
    // Sem isto, a linha ficaria "sem hora" mas afirmando origem 'ofx'.
    expect(r.transactions.every((t: any) => t.hora_origem === null)).toBe(true);
  });

  it('⚠️ o descarte é DECLARADO no header — sumir em silêncio é o outro erro', () => {
    const r = parseOfx(ofx(['20260605100000', '20260606100000', '20260607100000']));
    expect(r.header.horaDescartada).toEqual({
      motivo: 'carimbo_fixo',
      hora: '10:00:00',
      transacoes: 3,
    });
  });

  it('hora real sobrevive, e o header não declara descarte nenhum', () => {
    const r = parseOfx(ofx(['20260605091600', '20260605201800', '20260606135200']));
    expect(r.transactions.map((t: any) => t.hora_lancamento)).toEqual([
      '09:16:00', '20:18:00', '13:52:00',
    ]);
    expect(r.transactions.every((t: any) => t.hora_origem === 'ofx')).toBe(true);
    expect(r.header.horaDescartada).toBeUndefined();
  });

  it('a DATA nunca é afetada — ela é confiável e é o que o extrato garante', () => {
    const r = parseOfx(ofx(['20260605100000', '20260606100000', '20260607100000']));
    expect(r.transactions.map((t: any) => t.data_lancamento)).toEqual([
      '2026-06-05', '2026-06-06', '2026-06-07',
    ]);
  });

  it('meia-noite continua sendo "sem hora", como antes', () => {
    const r = parseOfx(ofx(['20260605000000', '20260606000000', '20260607000000']));
    expect(r.transactions.every((t: any) => t.hora_lancamento === null)).toBe(true);
    // Nunca teve hora ⇒ não há descarte a declarar.
    expect(r.header.horaDescartada).toBeUndefined();
  });
});
