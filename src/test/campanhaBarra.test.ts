// Contrato do que a barra de campanha DIZ além do número.
//
// ⚠️ O que estes testes protegem, em ordem de dano:
//   1. barra em 0% ANTES da janela nunca aparecer sem dizer que não abriu —
//      "R$ 0 de R$ 500 mil" se lê como fracasso quando é campanha que ainda
//      não começou;
//   2. campanha não-ativa dizer que o DÍGITO não está identificando (senão a
//      barra fica zerada pra sempre e ninguém sabe por quê);
//   3. `publica = false` ser DITO (senão alguém apresenta o número achando que
//      a igreja já está vendo);
//   4. data comparada como STRING — em `new Date(iso)` o dia vira o anterior no
//      fuso do Rio, e a barra diria "já começou" na véspera.
import { describe, it, expect } from 'vitest';
import { estadoDaCampanha, avisosDaBarra, seloDoEstado, hojeBrt } from '../lib/campanhaBarra';

// Estado REAL de produção medido em 31/08/2026 (vw_camp_arrecadacao).
const KIDS = {
  nome: 'Reforma do Espaço Kids',
  status: 'ativa',
  publica: false,
  data_lancamento: '2026-09-06',
  data_inicio: '2026-09-01',
  data_fim: '2026-10-31',
  meta_centavos: 50000000,
  total_centavos: 0,
};

const textos = (c: any, hoje: string) => avisosDaBarra(c, hoje).map((a) => a.texto);

describe('campanhaBarra · estado', () => {
  it('⚠️⚠️ o caso REAL de 31/08: ativa, mas a janela abre em 01/09', () => {
    expect(estadoDaCampanha(KIDS, '2026-08-31')).toBe('antes');
    expect(seloDoEstado(KIDS, '2026-08-31')).toBe('Ainda não abriu');
  });

  it('dentro da janela é "arrecadando", nas duas pontas inclusive', () => {
    expect(estadoDaCampanha(KIDS, '2026-09-01')).toBe('arrecadando');
    expect(estadoDaCampanha(KIDS, '2026-10-15')).toBe('arrecadando');
    expect(estadoDaCampanha(KIDS, '2026-10-31')).toBe('arrecadando');
  });

  it('depois do fim é "depois"', () => {
    expect(estadoDaCampanha(KIDS, '2026-11-01')).toBe('depois');
  });

  it('status que não é `ativa` vence a janela', () => {
    // Mesmo com hoje DENTRO da janela: rascunho não arrecada.
    expect(estadoDaCampanha({ ...KIDS, status: 'rascunho' }, '2026-09-15')).toBe('nao_ativa');
    expect(estadoDaCampanha({ ...KIDS, status: 'pausada' }, '2026-09-15')).toBe('nao_ativa');
    expect(seloDoEstado({ ...KIDS, status: 'pausada' }, '2026-09-15')).toBe('Pausada');
    expect(seloDoEstado({ ...KIDS, status: 'rascunho' }, '2026-09-15')).toBe('Não ativada');
  });

  it('campanha sem datas e ativa está arrecadando', () => {
    expect(estadoDaCampanha({ status: 'ativa' }, '2026-08-31')).toBe('arrecadando');
  });

  it('hoje ilegível é `indefinido`, nunca "arrecadando"', () => {
    expect(estadoDaCampanha(KIDS, '')).toBe('indefinido');
    expect(estadoDaCampanha(KIDS, 'ontem')).toBe('indefinido');
  });

  it('⚠️⚠️ a comparação é por STRING: 31/08 NÃO é dentro da janela que abre 01/09', () => {
    // Com `new Date('2026-09-01')` (meia-noite UTC = 31/08 21h no Rio) uma
    // comparação por timestamp local diria que já começou na véspera.
    expect(estadoDaCampanha(KIDS, '2026-08-31')).not.toBe('arrecadando');
    expect(estadoDaCampanha({ ...KIDS, data_inicio: '2026-09-01' }, '2026-08-31')).toBe('antes');
  });
});

describe('campanhaBarra · avisos', () => {
  it('⚠️⚠️ ANTES da janela, o aviso diz que o zero NÃO é resultado', () => {
    const t = textos(KIDS, '2026-08-31');
    expect(t[0]).toContain('01/09/2026');
    expect(t[0]).toContain('não é resultado');
    expect(avisosDaBarra(KIDS, '2026-08-31')[0].tom).toBe('ambar');
  });

  it('⚠️ campanha não ativada avisa que o DÍGITO não identifica', () => {
    const t = textos({ ...KIDS, status: 'rascunho' }, '2026-09-15');
    expect(t.some((x) => x.includes('não está identificando'))).toBe(true);
  });

  it('pausada tem texto próprio', () => {
    const t = textos({ ...KIDS, status: 'pausada' }, '2026-09-15');
    expect(t.some((x) => x.includes('pausada'))).toBe(true);
  });

  it('⚠️ arrecadando e zerado: aqui o zero É resultado, e o texto muda', () => {
    const t = textos({ ...KIDS, total_centavos: 0 }, '2026-09-10');
    expect(t.some((x) => x.includes('nenhuma doação identificada'))).toBe(true);
    expect(t.some((x) => x.includes('não é resultado'))).toBe(false);
  });

  it('arrecadando COM dinheiro não repete aviso de zero', () => {
    const t = textos({ ...KIDS, total_centavos: 1234500 }, '2026-09-10');
    expect(t.some((x) => x.includes('nenhuma doação'))).toBe(false);
  });

  it('⚠️ `publica: false` é sempre DITO', () => {
    expect(textos(KIDS, '2026-09-10').some((x) => x.includes('telas do culto'))).toBe(true);
    expect(textos({ ...KIDS, publica: true, total_centavos: 1 }, '2026-09-10')).toEqual([]);
  });

  it('depois do fim, tom neutro (não é alarme)', () => {
    const a = avisosDaBarra({ ...KIDS, publica: true, data_fim: '2026-10-31' }, '2026-11-05');
    expect(a[0].tom).toBe('neutro');
    expect(a[0].texto).toContain('31/10/2026');
  });

  it('sem data de início, o aviso de "antes" não inventa data', () => {
    const t = textos({ status: 'rascunho', publica: true }, '2026-08-31');
    expect(t.some((x) => x.includes('undefined') || x.includes('null'))).toBe(false);
  });

  it('⚠️ `hoje` ilegível NÃO afirma "nenhuma doação identificada"', () => {
    // Sem saber que dia é hoje, não se sabe se a janela abriu — então o zero
    // não pode ser apresentado como resultado.
    const t = textos({ ...KIDS, publica: true }, 'ontem');
    expect(t.some((x) => x.includes('nenhuma doação identificada'))).toBe(false);
  });
});

describe('campanhaBarra · o "hoje" é BRT', () => {
  it('⚠️⚠️ 31/08 às 21h no Rio (= 01/09 em UTC) ainda é 31/08', () => {
    // 2026-09-01T00:30:00Z = 31/08 21:30 em São Paulo (UTC-3).
    const instante = new Date('2026-09-01T00:30:00Z');
    expect(instante.toISOString().slice(0, 10)).toBe('2026-09-01'); // o que UTC diria
    expect(hojeBrt(instante)).toBe('2026-08-31');                   // o que vale aqui
  });

  it('⚠️⚠️ e por isso a campanha que abre 01/09 NÃO aparece como aberta na véspera', () => {
    const instante = new Date('2026-09-01T00:30:00Z');
    expect(estadoDaCampanha(KIDS, hojeBrt(instante))).toBe('antes');
    // Com o dia em UTC, o mesmo instante diria que já está arrecadando:
    expect(estadoDaCampanha(KIDS, instante.toISOString().slice(0, 10))).toBe('arrecadando');
  });

  it('meio-dia no Rio bate com o dia UTC (o caso comum)', () => {
    const instante = new Date('2026-09-10T15:00:00Z'); // 12:00 BRT
    expect(hojeBrt(instante)).toBe('2026-09-10');
  });

  it('devolve YYYY-MM-DD, o formato que o resto da régua compara', () => {
    expect(hojeBrt(new Date('2026-01-05T15:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
