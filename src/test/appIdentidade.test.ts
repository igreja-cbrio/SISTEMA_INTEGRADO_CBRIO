// Guardas do login rápido por CPF do app (services/appIdentidade.js).
//
// O que estes testes protegem: o CPF só IDENTIFICA — a resposta que volta pra
// quem digitou um CPF **não pode entregar dado de terceiro**. Se alguém mudar o
// mascaramento pra "ajudar o usuário a reconhecer o cadastro", vira vazamento:
// com uma lista de CPFs dá pra colher nome completo e telefone de qualquer
// pessoa da igreja.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const svc = require('../../backend/services/appIdentidade.js');

describe('mascararTelefone', () => {
  it('mostra só DDD e os 4 últimos dígitos', () => {
    expect(svc.mascararTelefone('(21) 99512-8249')).toBe('(21) *****-8249');
    expect(svc.mascararTelefone('21984555026')).toBe('(21) *****-5026');
  });

  it('NUNCA devolve o telefone completo (nenhum dígito do meio)', () => {
    const alvos = ['21995128249', '(21) 99512-8249', '5521995128249', '2133334444'];
    for (const t of alvos) {
      const m = svc.mascararTelefone(t) as string;
      const digitos = m.replace(/\D/g, '');
      // No máximo DDD (2) + 4 finais = 6 dígitos visíveis.
      expect(digitos.length).toBeLessThanOrEqual(6);
      expect(m).toContain('*');
      // O miolo do número não pode aparecer.
      expect(m).not.toContain('9512');
    }
  });

  it('devolve null quando não é telefone', () => {
    expect(svc.mascararTelefone('')).toBeNull();
    expect(svc.mascararTelefone('123')).toBeNull();
    expect(svc.mascararTelefone(null)).toBeNull();
  });
});

describe('mascararNome', () => {
  it('mantém só o primeiro nome inteiro', () => {
    expect(svc.mascararNome('Marcos Paulo Domingues de Almeida')).toBe('Marcos P. D. de A.');
    expect(svc.mascararNome('Natasha Litwinczuk')).toBe('Natasha L.');
  });

  it('não vaza sobrenome completo de ninguém', () => {
    const m = svc.mascararNome('Maria Victória Lannes Campos') as string;
    expect(m).not.toContain('Lannes');
    expect(m).not.toContain('Campos');
    expect(m.startsWith('Maria ')).toBe(true);
  });

  it('partículas ficam legíveis (de/da/dos), não viram "d."', () => {
    expect(svc.mascararNome('Ana da Silva dos Santos')).toBe('Ana da S. dos S.');
  });

  it('tolera vazio', () => {
    expect(svc.mascararNome('')).toBeNull();
    expect(svc.mascararNome(null)).toBeNull();
  });
});

describe('mascararEmail', () => {
  it('mostra pontas + domínio, esconde o miolo', () => {
    expect(svc.mascararEmail('marcospaulo.da@gmail.com')).toBe('mar***da@gmail.com');
    expect(svc.mascararEmail('ana@cbrio.org')).toBe('a***@cbrio.org');
  });

  it('nunca devolve o endereço completo', () => {
    const alvos = ['victoria.lannes@gmail.com', 'natasha@cbrio.org', 'jose@hotmail.com'];
    for (const e of alvos) {
      const m = svc.mascararEmail(e) as string;
      expect(m).not.toBe(e);
      expect(m).toContain('***');
      // O local-part inteiro não pode aparecer.
      expect(m).not.toContain(e.split('@')[0]);
    }
  });

  it('tolera lixo', () => {
    expect(svc.mascararEmail('')).toBeNull();
    expect(svc.mascararEmail('sem-arroba')).toBeNull();
    expect(svc.mascararEmail(null)).toBeNull();
  });
});

describe('janela do código', () => {
  it('expira em poucos minutos (código de acesso não é link de 30 dias)', () => {
    expect(svc.CODIGO_TTL_MIN).toBeGreaterThan(0);
    expect(svc.CODIGO_TTL_MIN).toBeLessThanOrEqual(15);
  });
});
