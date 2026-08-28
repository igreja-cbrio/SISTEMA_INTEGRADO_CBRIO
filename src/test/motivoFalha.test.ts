// Contrato do MOTIVO de uma falha de servidor — o que dá olhos ao agente.
//
// ⚠️ Este texto vai pra `app_erros_servidor.mensagem`, que o
// `systemIncidentDiagnosis` lê e **manda pro modelo**. Então os testes protegem,
// em ordem de dano:
//   1. PII/segredo não vazar (mensagem do PostgREST embute VALOR:
//      "Key (cpf)=(12345678901) already exists");
//   2. o prefixo `HTTP <status>` continuar existindo (é o fingerprint que agrupa
//      incidente — mudá-lo reabriria todos os incidentes como novos);
//   3. sem motivo, a mensagem ficar IDÊNTICA à de antes (rota que não entrega
//      motivo tem que se comportar exatamente como se comportava).
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mf = require('../../backend/utils/motivoFalha.js');
const { sanitizarMotivo, montarMensagemFalha, motivoDeErroPostgrest, GENERICA } = mf;

describe('motivoFalha · sanitização (o texto vai pra uma IA)', () => {
  it('⚠️ mascara CPF com e sem pontuação', () => {
    expect(sanitizarMotivo('Key (cpf)=(123.456.789-01) already exists')).toContain('[cpf]');
    expect(sanitizarMotivo('duplicate key (cpf)=(12345678901)')).toContain('[cpf]');
    expect(sanitizarMotivo('duplicate key (cpf)=(12345678901)')).not.toContain('12345678901');
  });

  it('⚠️ mascara e-mail', () => {
    const r = sanitizarMotivo('Key (email)=(maria.silva@gmail.com) already exists');
    expect(r).toContain('[email]');
    expect(r).not.toContain('gmail.com');
  });

  it('⚠️ mascara token/segredo longo', () => {
    const r = sanitizarMotivo('JWT expired: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefghij');
    expect(r).toContain('[segredo]');
    expect(r).not.toContain('eyJhbGciOiJIUzI1NiIs');
  });

  it('preserva o que É diagnóstico: nome de coluna, constraint e código', () => {
    const r = sanitizarMotivo('column pat_bens.status does not exist · uniq_mem_membros_cpf_ativo');
    expect(r).toContain('pat_bens.status');
    expect(r).toContain('uniq_mem_membros_cpf_ativo');
  });

  it('⚠️ NÃO come uuid (36 chars com hífen) — é o rastreio do incidente', () => {
    const uuid = '4e4afb18-59d9-4aee-bc34-daff6ac85269';
    expect(sanitizarMotivo(`request ${uuid} falhou`)).toContain(uuid);
  });

  it('colapsa espaço e respeita o teto', () => {
    expect(sanitizarMotivo('  a\n\n   b  ')).toBe('a b');
    // Texto longo REALISTA (com espaços) — string de 5 mil chars sem espaço cai
    // na regra de segredo, que é o comportamento certo pra um blob desses.
    const longo = 'coluna nao existe. '.repeat(400);
    expect(sanitizarMotivo(longo).length).toBe(1200);
    expect(sanitizarMotivo(longo, 50).length).toBe(50);
  });

  it('blob gigante sem espaço é tratado como segredo, não como mensagem', () => {
    expect(sanitizarMotivo('x'.repeat(5000))).toBe('[segredo]');
  });

  it('nulo/undefined não estoura', () => {
    expect(sanitizarMotivo(null)).toBe('');
    expect(sanitizarMotivo(undefined)).toBe('');
  });
});

describe('motivoFalha · a mensagem gravada', () => {
  it('⚠️⚠️ SEM motivo, é byte a byte a frase antiga', () => {
    expect(montarMensagemFalha({ status: 500 })).toBe(`HTTP 500 ${GENERICA}`);
    expect(montarMensagemFalha({ status: 502, motivo: '' })).toBe(`HTTP 502 ${GENERICA}`);
    expect(montarMensagemFalha({ status: 500, motivo: '   ' })).toBe(`HTTP 500 ${GENERICA}`);
  });

  it('com motivo, mantém o prefixo HTTP <status> (fingerprint do incidente)', () => {
    const m = montarMensagemFalha({ status: 500, motivo: 'column x does not exist', codigo: '42703' });
    expect(m.startsWith('HTTP 500')).toBe(true);
    expect(m).toContain('[42703]');
    expect(m).toContain('column x does not exist');
  });

  it('status ausente ou lixo cai em 500, nunca em NaN na tela', () => {
    expect(montarMensagemFalha({ motivo: 'x' }).startsWith('HTTP 500')).toBe(true);
    expect(montarMensagemFalha({ status: 'abc', motivo: 'x' }).startsWith('HTTP 500')).toBe(true);
  });

  it('⚠️ o motivo é sanitizado ANTES de virar mensagem', () => {
    const m = montarMensagemFalha({ status: 500, motivo: 'Key (cpf)=(12345678901) exists' });
    expect(m).not.toContain('12345678901');
  });
});

describe('motivoFalha · erro do PostgREST', () => {
  it('junta message + details + hint (é o hint que costuma nomear a causa)', () => {
    expect(motivoDeErroPostgrest({
      code: '42703', message: 'column "decisoes" does not exist',
      details: null, hint: 'Perhaps you meant "decisoes_kids".',
    })).toBe('column "decisoes" does not exist · Perhaps you meant "decisoes_kids".');
  });

  it('não repete a mesma frase quando details espelha o message', () => {
    expect(motivoDeErroPostgrest({ message: 'igual', details: 'igual' })).toBe('igual');
  });

  it('corpo vazio/inválido devolve string vazia (cai na frase antiga)', () => {
    expect(motivoDeErroPostgrest(null)).toBe('');
    expect(motivoDeErroPostgrest('texto')).toBe('');
    expect(motivoDeErroPostgrest({})).toBe('');
  });
});
