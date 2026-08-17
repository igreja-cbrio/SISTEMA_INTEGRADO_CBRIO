// Contrato de `backend/utils/remetenteEmail`.
//
// Pedido do Matheus (17/08/2026): os disparos chegavam como "Email Automático -
// CBRio" (o display name da caixa noreply@cbrio.org). Só os poucos fluxos que
// passavam `fromName` chegavam como "CBRio" — pelo MESMO endereço, o que fazia a
// igreja aparecer com dois nomes diferentes na caixa das pessoas.
//
// Mutation-testado:
//   · devolver '' quando não vem fromName (voltar ao nome da caixa) → 3 vermelhos
//   · deixar o fromName sobrescrever o ENDEREÇO do Resend            → 2 vermelhos
import { describe, it, expect } from 'vitest';
import {
  REMETENTE_NOME_PADRAO, nomeDeExibicao, remetenteResend,
} from '../../backend/utils/remetenteEmail.js';

describe('nome de exibição', () => {
  it('sem fromName, o nome é nosso — nunca o da caixa', () => {
    // É esta linha que troca "Email Automático - CBRio" por "CBRio" nos
    // disparos que não pedem nome (notificações, aprovações, avisos de módulo).
    expect(nomeDeExibicao(undefined)).toBe('CBRio');
    expect(nomeDeExibicao(null as unknown as string)).toBe('CBRio');
    expect(REMETENTE_NOME_PADRAO).toBe('CBRio');
  });

  it('quem pede nome próprio continua mandando', () => {
    // volEmailSender/volEmails assinam como "Voluntariado CBRio" de propósito.
    expect(nomeDeExibicao('Voluntariado CBRio')).toBe('Voluntariado CBRio');
    expect(nomeDeExibicao('  Equipe Next  ')).toBe('Equipe Next');
  });

  it('string vazia conta como "não pediu"', () => {
    // Nome vazio faria o cliente de e-mail mostrar o endereço cru
    // (noreply@cbrio.org), que é pior que o nome errado.
    expect(nomeDeExibicao('')).toBe('CBRio');
    expect(nomeDeExibicao('   ')).toBe('CBRio');
  });
});

describe('remetente do Resend (fallback)', () => {
  it('carimba o nome mantendo o endereço configurado', () => {
    expect(remetenteResend('CBRio <noreply@cbrio.org>', 'Voluntariado CBRio'))
      .toBe('Voluntariado CBRio <noreply@cbrio.org>');
    expect(remetenteResend('noreply@cbrio.org', undefined))
      .toBe('CBRio <noreply@cbrio.org>');
  });

  it('⚠️ NUNCA troca o endereço', () => {
    // O endereço é o que está verificado no domínio do Resend; trocá-lo derruba
    // o envio inteiro. O nome é a única coisa que este helper mexe.
    const saida = remetenteResend('Email Automático - CBRio <noreply@cbrio.org>', 'CBRio');
    expect(saida).toContain('<noreply@cbrio.org>');
    expect(saida).toBe('CBRio <noreply@cbrio.org>');
    expect(remetenteResend('x <a@b.com>', 'Nome <hacker@mal.com>')).toContain('<a@b.com>');
  });

  it('sem remetente configurado, devolve vazio (o chamador decide)', () => {
    expect(remetenteResend('', 'CBRio')).toBe('');
    expect(remetenteResend(undefined as unknown as string, 'CBRio')).toBe('');
  });
});
